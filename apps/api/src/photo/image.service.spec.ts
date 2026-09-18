import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import { ImageService } from "./image.service";
import { PHOTO_HEIC_MESSAGE } from "./photo.constants";

/**
 * Image validation.
 *
 * The type is decided from the bytes, not the name. HEIC/HEIF files are
 * recognised but refused with an explicit message, because the prebuilt
 * sharp binaries cannot decode HEVC and used to fail later with a generic
 * "image corrompue".
 */

// Minimal HEIF container header: ftyp box with the "heic" brand.
const HEIC_HEADER = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from("ftypheic", "ascii"),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from("mif1heic", "ascii"),
  Buffer.alloc(64, 0),
]);

function buildService() {
  const config = { get: vi.fn(() => undefined) };
  return new ImageService(config as never);
}

describe("ImageService.validateSource", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "navventura-image-"));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("accepts a real PNG whatever the declared type", async () => {
    const file = join(dir, "photo.png");
    await writeFile(file, await sharp({ create: { width: 8, height: 8, channels: 3, background: "#123456" } }).png().toBuffer());

    const source = await buildService().validateSource(file, "photo.png", "application/octet-stream");

    expect(source.sourceMimeType).toBe("image/png");
    expect(source.outputMimeType).toBe("image/webp");
    expect(source.width).toBe(8);
  });

  it("re-encodes an opaque JPEG as JPEG", async () => {
    const file = join(dir, "photo.jpg");
    await writeFile(file, await sharp({ create: { width: 8, height: 8, channels: 3, background: "#654321" } }).jpeg().toBuffer());

    const service = buildService();
    const source = await service.validateSource(file, "photo.jpg", "image/jpeg");
    const processed = await service.reencode(source);

    expect(source.outputMimeType).toBe("image/jpeg");
    expect(processed.mimeType).toBe("image/jpeg");
    expect(processed.width).toBe(8);
  });

  it("refuses a HEIC file by its bytes with an actionable message", async () => {
    const file = join(dir, "iphone.jpg"); // renamed on purpose
    await writeFile(file, HEIC_HEADER);

    await expect(buildService().validateSource(file, "iphone.jpg", "image/jpeg")).rejects.toThrow(
      PHOTO_HEIC_MESSAGE,
    );
  });

  it("refuses a HEIC file by its extension before reading it", async () => {
    const file = join(dir, "iphone.heic");
    await writeFile(file, Buffer.from("whatever"));

    await expect(buildService().validateSource(file, "IMG_0001.HEIC")).rejects.toThrow(PHOTO_HEIC_MESSAGE);
  });

  it("refuses a file that is not an image, whatever its name says", async () => {
    const file = join(dir, "script.png");
    await writeFile(file, Buffer.from("<script>alert(1)</script>"));

    await expect(buildService().validateSource(file, "script.png", "image/png")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("refuses an empty file", async () => {
    const file = join(dir, "empty.jpg");
    await writeFile(file, Buffer.alloc(0));

    await expect(buildService().validateSource(file, "empty.jpg")).rejects.toThrow(/vide/);
  });
});
