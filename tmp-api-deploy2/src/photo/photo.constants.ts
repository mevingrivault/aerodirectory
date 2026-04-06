export const PHOTO_UPLOAD_FIELD_NAME = "file";

export const PHOTO_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const PHOTO_MAX_WIDTH = 4096;
export const PHOTO_MAX_HEIGHT = 4096;
export const PHOTO_MAX_INPUT_PIXELS = PHOTO_MAX_WIDTH * PHOTO_MAX_HEIGHT;

export const PHOTO_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export const PHOTO_ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
]);

export type AllowedPhotoMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "image/heif";

export type NormalizedPhotoMimeType = "image/jpeg" | "image/webp";
