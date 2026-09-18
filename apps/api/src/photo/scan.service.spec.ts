import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { createServer, type Server, type Socket } from "net";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { ScanService } from "./scan.service";
import { parseClamdReply, scanFileWithClamd } from "./clamd.client";

/**
 * Antivirus scanning through clamd.
 *
 * A fake clamd speaks just enough INSTREAM to check that the file bytes are
 * streamed correctly, that FOUND/OK/ERROR map to the right HTTP errors, that
 * a hung daemon hits the timeout, and that concurrency is bounded.
 */

interface FakeClamd {
  server: Server;
  port: number;
  received: Buffer[];
  behaviour: "ok" | "found" | "error" | "hang" | "close";
  delayMs: number;
  inFlight: number;
  maxInFlight: number;
}

function startFakeClamd(): Promise<FakeClamd> {
  const state: FakeClamd = {
    server: createServer(),
    port: 0,
    received: [],
    behaviour: "ok",
    delayMs: 0,
    inFlight: 0,
    maxInFlight: 0,
  };

  state.server.on("connection", (socket: Socket) => {
    state.inFlight += 1;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    let buffer = Buffer.alloc(0);
    let command = "";
    const chunks: Buffer[] = [];

    // A scan is "in flight" until clamd answers: the client cannot release
    // its slot before that, so this is what the concurrency limit bounds.
    const respond = (text: string) => {
      setTimeout(() => {
        state.inFlight -= 1;
        if (state.behaviour === "hang") return;
        if (state.behaviour === "close") {
          socket.destroy();
          return;
        }
        socket.end(`${text}\0`);
      }, state.delayMs);
    };

    socket.on("data", (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);

      if (!command) {
        const nul = buffer.indexOf(0);
        if (nul === -1) return;
        command = buffer.subarray(0, nul).toString();
        buffer = buffer.subarray(nul + 1);
        if (command === "zPING") {
          socket.end("PONG\0");
          return;
        }
      }

      while (buffer.length >= 4) {
        const length = buffer.readUInt32BE(0);
        if (length === 0) {
          const content = Buffer.concat(chunks);
          state.received.push(content);
          if (state.behaviour === "error") {
            respond("stream: INSTREAM size limit exceeded. ERROR");
          } else if (state.behaviour === "found") {
            respond("stream: Eicar-Test-Signature FOUND");
          } else {
            respond("stream: OK");
          }
          return;
        }
        if (buffer.length < 4 + length) return;
        chunks.push(Buffer.from(buffer.subarray(4, 4 + length)));
        buffer = buffer.subarray(4 + length);
      }
    });
  });

  return new Promise((resolve) => {
    state.server.listen(0, "127.0.0.1", () => {
      const address = state.server.address();
      state.port = typeof address === "object" && address ? address.port : 0;
      resolve(state);
    });
  });
}

function buildService(port: number, extra: Record<string, string> = {}) {
  const values: Record<string, string> = {
    CLAMAV_ENABLED: "true",
    CLAMAV_MODE: "clamd",
    CLAMD_HOST: "127.0.0.1",
    CLAMD_PORT: String(port),
    CLAMAV_TIMEOUT_MS: "500",
    CLAMAV_MAX_CONCURRENT: "2",
    CLAMAV_MAX_QUEUE: "2",
    ...extra,
  };
  const config = {
    get: vi.fn((key: string, fallback?: string) => values[key] ?? fallback),
  };
  return new ScanService(config as never);
}

describe("clamd INSTREAM client", () => {
  let clamd: FakeClamd;
  let dir: string;
  let cleanFile: string;
  let bigFile: string;

  beforeAll(async () => {
    clamd = await startFakeClamd();
    dir = await mkdtemp(join(tmpdir(), "navventura-scan-"));
    cleanFile = join(dir, "clean.jpg");
    bigFile = join(dir, "big.bin");
    await writeFile(cleanFile, Buffer.from("not really a jpeg"));
    await writeFile(bigFile, Buffer.alloc(200 * 1024, 7));
  });

  afterAll(async () => {
    clamd.server.close();
    await rm(dir, { recursive: true, force: true });
  });

  afterEach(() => {
    clamd.behaviour = "ok";
    clamd.delayMs = 0;
    clamd.received = [];
    clamd.maxInFlight = 0;
  });

  it("parses clamd replies", () => {
    expect(parseClamdReply("stream: OK\0")).toEqual({ clean: true });
    expect(parseClamdReply("stream: Eicar-Test-Signature FOUND")).toEqual({
      clean: false,
      threat: "Eicar-Test-Signature",
    });
    expect(() => parseClamdReply("stream: INSTREAM size limit exceeded. ERROR")).toThrow(/inattendue/);
  });

  it("streams the whole file in framed chunks", async () => {
    const result = await scanFileWithClamd(
      { host: "127.0.0.1", port: clamd.port, timeoutMs: 1000, chunkSize: 16 * 1024 },
      bigFile,
    );

    expect(result).toEqual({ clean: true });
    expect(clamd.received[0]?.length).toBe(200 * 1024);
    expect(clamd.received[0]?.every((byte) => byte === 7)).toBe(true);
  });

  it("passes a clean file", async () => {
    const service = buildService(clamd.port);

    await expect(service.scan(cleanFile)).resolves.toBeUndefined();
  });

  it("rejects an infected file with the threat name", async () => {
    // The daemon's verdict is simulated: writing a real EICAR file would be
    // quarantined by the host antivirus on developer machines.
    clamd.behaviour = "found";
    const service = buildService(clamd.port);

    await expect(service.scan(cleanFile)).rejects.toThrow(BadRequestException);
    await expect(service.scan(cleanFile)).rejects.toThrow(/Eicar-Test-Signature/);
  });

  it("turns a clamd error into a 503", async () => {
    clamd.behaviour = "error";
    const service = buildService(clamd.port);

    await expect(service.scan(cleanFile)).rejects.toThrow(ServiceUnavailableException);
  });

  it("times out on a hung daemon instead of waiting forever", async () => {
    clamd.behaviour = "hang";
    const service = buildService(clamd.port);

    await expect(service.scan(cleanFile)).rejects.toThrow(/expiré/);
  });

  it("returns 503 when clamd is unreachable", async () => {
    const service = buildService(1); // nothing listens on port 1

    await expect(service.scan(cleanFile)).rejects.toThrow(/indisponible/);
  });

  it("never runs more scans than the configured concurrency", async () => {
    clamd.delayMs = 120;
    const service = buildService(clamd.port, { CLAMAV_MAX_CONCURRENT: "2", CLAMAV_MAX_QUEUE: "10" });

    await Promise.all(Array.from({ length: 5 }, () => service.scan(cleanFile)));

    expect(clamd.maxInFlight).toBeLessThanOrEqual(2);
    expect(service.load).toEqual({ running: 0, pending: 0 });
  });

  it("sheds load beyond the queue limit instead of piling up", async () => {
    clamd.delayMs = 150;
    const service = buildService(clamd.port, { CLAMAV_MAX_CONCURRENT: "1", CLAMAV_MAX_QUEUE: "1" });

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => service.scan(cleanFile)),
    );

    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected.length).toBeGreaterThanOrEqual(2);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ServiceUnavailableException);
    }
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
  });

  it("skips scanning entirely when disabled", async () => {
    const service = buildService(1, { CLAMAV_ENABLED: "false" });

    await expect(service.scan(cleanFile)).resolves.toBeUndefined();
    expect(service.mode).toBe("disabled");
  });

  it("still honours the legacy CLAMSCAN_ENABLED switch", () => {
    const config = { get: vi.fn((key: string, fallback?: string) => (key === "CLAMSCAN_ENABLED" ? "false" : fallback)) };
    const service = new ScanService(config as never);

    expect(service.mode).toBe("disabled");
  });
});
