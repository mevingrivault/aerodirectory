import { API_BASE } from "@/lib/public-env";

/** Wikimedia Commons photo of an aerodrome, as the API returns it (credit only, no storage keys). */
export interface CommonsPhotoCredit {
  author: string | null;
  license: string;
  updatedAt: string;
}

/**
 * URL of our copy of the photo. The version parameter changes when the
 * import replaces the file, so cached copies are not shown after that.
 */
export function commonsPhotoUrl(aerodromeId: string, photo: CommonsPhotoCredit, size: "file" | "thumb"): string {
  return `${API_BASE}/aerodromes/${aerodromeId}/photos/commons/${size}?v=${encodeURIComponent(photo.updatedAt)}`;
}

/** "Photo : Jean Dupont · CC BY-SA 4.0 · Wikimedia Commons" */
export function commonsPhotoCredit(photo: CommonsPhotoCredit): string {
  return `Photo : ${photo.author ?? "auteur inconnu"} · ${photo.license} · Wikimedia Commons`;
}
