import { describe, it, expect, vi } from "vitest";
import { NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { Readable } from "stream";
import { PhotoController } from "./photo.controller";

/**
 * The Commons photo is served from our own storage, so visitors never load
 * anything from Wikimedia (no IP sent there, no CSP opening).
 */

function build(photo: { storedKey: string; mimeType: string } | null) {
  const photos = { findCommonsPhoto: vi.fn().mockResolvedValue(photo) };
  const storage = {
    getObject: vi.fn().mockResolvedValue({ stream: Readable.from(["jpg"]), contentType: "image/jpeg", contentLength: 3 }),
  };
  const controller = new PhotoController(photos as never, storage as never, {} as never);
  const res = { header: vi.fn(), send: vi.fn() };
  return { controller, photos, storage, res };
}

describe("PhotoController.serveCommons", () => {
  it("is exposed as GET commons/file", () => {
    const fn = PhotoController.prototype.serveCommons as unknown as object;
    expect(Reflect.getMetadata(PATH_METADATA, fn)).toBe("commons/file");
    expect(Reflect.getMetadata(METHOD_METADATA, fn)).toBe(RequestMethod.GET);
  });

  it("streams the stored copy of the aerodrome's photo", async () => {
    const { controller, storage, res } = build({ storedKey: "commons/abc.jpg", mimeType: "image/jpeg" });

    await controller.serveCommons("a1", res as never);

    expect(storage.getObject).toHaveBeenCalledWith("commons/abc.jpg");
    expect(res.header).toHaveBeenCalledWith("Content-Type", "image/jpeg");
    expect(res.header).toHaveBeenCalledWith("Cache-Control", "public, max-age=86400");
    expect(res.send).toHaveBeenCalled();
  });

  it("answers 404 when the aerodrome has no Commons photo", async () => {
    const { controller, storage, res } = build(null);

    await expect(controller.serveCommons("a1", res as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.getObject).not.toHaveBeenCalled();
  });
});
