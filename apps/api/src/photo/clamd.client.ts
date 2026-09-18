import { createReadStream } from "fs";
import { Socket } from "net";

/**
 * Minimal clamd client speaking the INSTREAM protocol over TCP.
 *
 * The file is streamed to a long-running clamd daemon (signatures already in
 * memory) instead of spawning a `clamscan` process that reloads the whole
 * signature database for every upload.
 */

export interface ClamdOptions {
  host: string;
  port: number;
  timeoutMs: number;
  /** Chunk size sent to clamd; must stay below its StreamMaxLength. */
  chunkSize?: number;
}

export type ClamdScanResult =
  | { clean: true }
  | { clean: false; threat: string };

export class ClamdError extends Error {
  constructor(
    message: string,
    public readonly kind: "unavailable" | "timeout" | "protocol",
  ) {
    super(message);
    this.name = "ClamdError";
  }
}

const DEFAULT_CHUNK_SIZE = 64 * 1024;

function encodeChunk(chunk: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(chunk.length, 0);
  return Buffer.concat([header, chunk]);
}

/** Parse a clamd INSTREAM reply such as `stream: OK` or `stream: Eicar-Test-Signature FOUND`. */
export function parseClamdReply(reply: string): ClamdScanResult {
  const text = reply.replace(/\0/g, "").trim();

  if (/\bOK$/.test(text)) {
    return { clean: true };
  }

  const found = text.match(/^(?:stream|.*?):\s*(.+?)\s+FOUND$/);
  if (found?.[1]) {
    return { clean: false, threat: found[1] };
  }

  throw new ClamdError(`Réponse clamd inattendue: "${text}"`, "protocol");
}

export function scanFileWithClamd(options: ClamdOptions, filePath: string): Promise<ClamdScanResult> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;

  return new Promise<ClamdScanResult>((resolve, reject) => {
    const socket = new Socket();
    let reply = "";
    let settled = false;
    let fileStream: ReturnType<typeof createReadStream> | null = null;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fileStream?.destroy();
      socket.destroy();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new ClamdError(`clamd n'a pas répondu en ${options.timeoutMs} ms`, "timeout")));
    }, options.timeoutMs);

    socket.on("error", (error) => {
      finish(() => reject(new ClamdError(`clamd injoignable (${options.host}:${options.port}): ${error.message}`, "unavailable")));
    });

    socket.on("data", (data: Buffer) => {
      reply += data.toString("utf8");
      if (reply.includes("\0")) {
        finish(() => {
          try {
            resolve(parseClamdReply(reply));
          } catch (error) {
            reject(error);
          }
        });
      }
    });

    socket.on("close", () => {
      finish(() => {
        if (!reply) {
          reject(new ClamdError("clamd a fermé la connexion sans répondre", "protocol"));
          return;
        }
        try {
          resolve(parseClamdReply(reply));
        } catch (error) {
          reject(error);
        }
      });
    });

    socket.connect(options.port, options.host, () => {
      socket.write("zINSTREAM\0");

      fileStream = createReadStream(filePath, { highWaterMark: chunkSize });
      fileStream.on("error", (error) => {
        finish(() => reject(new ClamdError(`Lecture du fichier impossible: ${error.message}`, "protocol")));
      });
      fileStream.on("data", (chunk) => {
        const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        if (!socket.write(encodeChunk(buffer))) {
          fileStream?.pause();
          socket.once("drain", () => fileStream?.resume());
        }
      });
      fileStream.on("end", () => {
        socket.write(Buffer.alloc(4, 0));
      });
    });
  });
}

/** `zPING` round-trip, used for startup diagnostics. */
export function pingClamd(options: Pick<ClamdOptions, "host" | "port" | "timeoutMs">): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = new Socket();
    let reply = "";
    const done = (value: boolean) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => done(false), options.timeoutMs);

    socket.on("error", () => done(false));
    socket.on("data", (data: Buffer) => {
      reply += data.toString("utf8");
      if (reply.includes("\0")) {
        done(reply.replace(/\0/g, "").trim() === "PONG");
      }
    });
    socket.on("close", () => done(reply.replace(/\0/g, "").trim() === "PONG"));
    socket.connect(options.port, options.host, () => {
      socket.write("zPING\0");
    });
  });
}
