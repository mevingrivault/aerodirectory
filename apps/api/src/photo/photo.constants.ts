export const PHOTO_UPLOAD_FIELD_NAME = "file";

export const PHOTO_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const PHOTO_MAX_WIDTH = 4096;
export const PHOTO_MAX_HEIGHT = 4096;
export const PHOTO_MAX_INPUT_PIXELS = PHOTO_MAX_WIDTH * PHOTO_MAX_HEIGHT;

/**
 * Formats we can actually decode. HEIC/HEIF (iPhone default) is not in the
 * list: the prebuilt sharp/libvips binaries ship libheif without the HEVC
 * codec, so those files fail at decode time. They are recognised on purpose
 * so the user gets an explicit message instead of "image corrompue".
 */
export const PHOTO_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const PHOTO_ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

export const PHOTO_HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);
export const PHOTO_HEIC_EXTENSIONS = new Set(["heic", "heif"]);

export const PHOTO_HEIC_MESSAGE =
  "Les photos HEIC/HEIF ne sont pas prises en charge. Exportez-la en JPEG (iPhone : Réglages › Appareil photo › Formats › Le plus compatible).";

export type AllowedPhotoMimeType = "image/jpeg" | "image/png" | "image/webp";

export type NormalizedPhotoMimeType = "image/jpeg" | "image/webp";
