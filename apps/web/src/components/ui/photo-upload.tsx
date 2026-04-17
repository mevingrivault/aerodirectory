"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { apiClient, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  ShieldAlert,
  UploadCloud,
  X,
} from "lucide-react";
import { AltchaWidget, type AltchaHandle } from "@/components/ui/altcha-widget";

const MAX_SIZE_MB = 5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const ACCEPTED_EXT = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];
const INITIAL_VISIBLE_PHOTOS = 6;

interface PhotoEntry {
  id: string;
  storedKey: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  createdAt: string;
  user: { id: string; displayName: string | null };
}

interface Props {
  aerodromeId: string;
  currentUserId?: string;
  existingPhotos?: PhotoEntry[];
  onUploadSuccess?: (photo: PhotoEntry) => void;
  onDeleteSuccess?: (photoId: string) => void;
  canUpload?: boolean;
}

type UploadState = "idle" | "uploading" | "success" | "error";

export function PhotoUpload({
  aerodromeId,
  currentUserId,
  existingPhotos = [],
  onUploadSuccess,
  onDeleteSuccess,
  canUpload = false,
}: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const altchaRef = useRef<AltchaHandle>(null);
  const [altchaPayload, setAltchaPayload] = useState<string | null>(null);

  const visiblePhotos = showAllPhotos
    ? existingPhotos
    : existingPhotos.slice(0, INITIAL_VISIBLE_PHOTOS);
  const hiddenPhotosCount = Math.max(existingPhotos.length - INITIAL_VISIBLE_PHOTOS, 0);
  const currentLightboxPhoto =
    lightboxIndex != null ? existingPhotos[lightboxIndex] ?? null : null;

  const getPhotoUrl = useCallback(
    (photoId: string) =>
      `${process.env["NEXT_PUBLIC_API_URL"] || "/api/v1"}/aerodromes/${aerodromeId}/photos/${photoId}/file`,
    [aerodromeId],
  );

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_SIZE_BYTES) {
      return `Fichier trop volumineux (max ${MAX_SIZE_MB} Mo).`;
    }

    const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
    const mimeOk = ACCEPTED.some((mime) => file.type === mime || file.type === "");
    const extOk = ACCEPTED_EXT.includes(ext);

    if (!mimeOk && !extOk) {
      return "Format non supporté. Formats acceptés : JPEG, PNG, WebP, HEIC.";
    }

    return null;
  };

  const handleFile = useCallback((file: File) => {
    setErrorMsg(null);
    setUploadState("idle");

    const err = validateFile(file);
    if (err) {
      setErrorMsg(err);
      return;
    }

    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
  }, []);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  const showPreviousPhoto = useCallback(() => {
    setLightboxIndex((current) => {
      if (current == null || existingPhotos.length === 0) return current;
      return current === 0 ? existingPhotos.length - 1 : current - 1;
    });
  }, [existingPhotos.length]);

  const showNextPhoto = useCallback(() => {
    setLightboxIndex((current) => {
      if (current == null || existingPhotos.length === 0) return current;
      return current === existingPhotos.length - 1 ? 0 : current + 1;
    });
  }, [existingPhotos.length]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    if (lightboxIndex == null) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowLeft") showPreviousPhoto();
      if (event.key === "ArrowRight") showNextPhoto();
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeLightbox, lightboxIndex, showNextPhoto, showPreviousPhoto]);

  useEffect(() => {
    if (lightboxIndex == null) return;
    if (existingPhotos.length === 0) {
      setLightboxIndex(null);
      return;
    }
    if (lightboxIndex >= existingPhotos.length) {
      setLightboxIndex(existingPhotos.length - 1);
    }
  }, [existingPhotos, lightboxIndex]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    const altcha = altchaRef.current?.getPayload() ?? altchaPayload ?? undefined;
    if (!altcha) {
      setErrorMsg("Veuillez compléter la vérification anti-robot.");
      return;
    }

    setUploadState("uploading");
    setErrorMsg(null);

    try {
      const res = await apiClient.upload<PhotoEntry>(
        `/aerodromes/${aerodromeId}/photos`,
        selectedFile,
        { "x-altcha": altcha },
      );

      if (preview) URL.revokeObjectURL(preview);

      setUploadState("success");
      setPreview(null);
      setSelectedFile(null);
      altchaRef.current?.reset();
      setAltchaPayload(null);

      if (res.data) onUploadSuccess?.(res.data);
    } catch (err) {
      setUploadState("error");
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Une erreur est survenue lors de l'upload.",
      );
      altchaRef.current?.reset();
      setAltchaPayload(null);
    }
  };

  const handleCancel = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setSelectedFile(null);
    setUploadState("idle");
    setErrorMsg(null);
  };

  const handleDelete = async (photoId: string) => {
    try {
      await apiClient.delete(`/aerodromes/${aerodromeId}/photos/${photoId}`);
      onDeleteSuccess?.(photoId);
    } catch {
      // Silent: the gallery simply stays unchanged.
    }
  };

  const handleReport = async (photoId: string) => {
    const reason = window.prompt("Pourquoi signalez-vous cette photo ?");
    if (!reason || !reason.trim()) return;

    try {
      await apiClient.post(`/aerodromes/${aerodromeId}/reports`, {
        targetType: "photo",
        targetId: photoId,
        reason: reason.trim(),
      });
      setActionMsg({
        type: "success",
        message: "Merci, votre signalement a bien été transmis à la modération.",
      });
    } catch (error) {
      setActionMsg({
        type: "error",
        message:
          error instanceof ApiError
            ? error.message
            : "Impossible de signaler cette photo pour le moment.",
      });
    }
  };

  return (
    <div className="space-y-4">
      {existingPhotos.length > 0 && (
        <div className="space-y-3">
          {actionMsg && (
            <div
              className={`rounded-md border p-3 text-sm ${
                actionMsg.type === "success"
                  ? "border-green-300 bg-green-50 text-green-700"
                  : "border-destructive/50 bg-destructive/10 text-destructive"
              }`}
            >
              {actionMsg.message}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visiblePhotos.map((photo) => {
              const absoluteIndex = existingPhotos.findIndex((item) => item.id === photo.id);

              return (
                <div
                  key={photo.id}
                  className="relative group overflow-hidden rounded-lg border bg-muted text-left aspect-video"
                  role="button"
                  tabIndex={0}
                  onClick={() => setLightboxIndex(absoluteIndex)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setLightboxIndex(absoluteIndex);
                    }
                  }}
                  aria-label="Afficher la photo en grand"
                >
                  <img
                    src={getPhotoUrl(photo.id)}
                    alt={`Photo de ${photo.user.displayName || "membre"}`}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-white">
                    <p className="truncate text-xs font-medium">
                      {photo.user.displayName || "Membre Navventura"}
                    </p>
                  </div>
                  {currentUserId === photo.user.id && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(photo.id);
                      }}
                      className="absolute right-2 top-2 z-10 hidden h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-red-600 group-hover:flex"
                      aria-label="Supprimer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  {currentUserId && currentUserId !== photo.user.id && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleReport(photo.id);
                      }}
                      className="absolute left-2 top-2 z-10 hidden h-8 items-center justify-center gap-1 rounded-full bg-black/60 px-3 text-xs text-white transition-colors hover:bg-amber-600 group-hover:flex"
                      aria-label="Signaler"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Signaler
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {hiddenPhotosCount > 0 && !showAllPhotos && (
            <div className="flex justify-center">
              <Button type="button" variant="outline" onClick={() => setShowAllPhotos(true)}>
                Voir plus ({hiddenPhotosCount})
              </Button>
            </div>
          )}

          {existingPhotos.length > INITIAL_VISIBLE_PHOTOS && showAllPhotos && (
            <div className="flex justify-center">
              <Button type="button" variant="ghost" onClick={() => setShowAllPhotos(false)}>
                Voir moins
              </Button>
            </div>
          )}
        </div>
      )}

      {canUpload &&
        (!preview ? (
          <div
            className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
          >
            <UploadCloud className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">
              Glissez une photo ou <span className="text-primary">cliquez pour parcourir</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              JPEG, PNG, WebP, HEIC · Max {MAX_SIZE_MB} Mo
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXT.join(",")}
              className="hidden"
              onChange={handleInputChange}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted">
              <img src={preview} alt="Aperçu" className="h-full w-full object-contain" />
            </div>
            <AltchaWidget
              ref={altchaRef}
              onStateChange={(state, payload) => {
                setAltchaPayload(state === "verified" ? (payload ?? null) : null);
              }}
            />
            <div className="flex gap-2">
              <Button
                onClick={handleUpload}
                disabled={uploadState === "uploading"}
                className="flex-1"
              >
                {uploadState === "uploading" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Traitement en cours...
                  </>
                ) : (
                  <>
                    <ImagePlus className="mr-2 h-4 w-4" />
                    Envoyer la photo
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={uploadState === "uploading"}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {uploadState === "success" && (
        <div className="flex items-center gap-2 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle className="h-4 w-4 shrink-0" />
          Photo envoyée avec succès. Elle sera visible après validation par un admin.
        </div>
      )}

      {currentLightboxPhoto && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4"
          onClick={closeLightbox}
        >
          <div
            className="relative flex w-full max-w-6xl items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            {existingPhotos.length > 1 && (
              <button
                type="button"
                onClick={showPreviousPhoto}
                className="absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                aria-label="Photo précédente"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            <div className="w-full overflow-hidden rounded-xl bg-black shadow-2xl">
              <img
                src={getPhotoUrl(currentLightboxPhoto.id)}
                alt={`Photo de ${currentLightboxPhoto.user.displayName || "membre"}`}
                className="max-h-[82vh] w-full object-contain"
              />
              <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-black/70 px-4 py-3 text-white">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {currentLightboxPhoto.user.displayName || "Membre Navventura"}
                  </p>
                  <p className="text-xs text-white/70">
                    {new Date(currentLightboxPhoto.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {currentUserId && currentUserId !== currentLightboxPhoto.user.id && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-white hover:bg-white/10 hover:text-white"
                      onClick={() => handleReport(currentLightboxPhoto.id)}
                    >
                      <ShieldAlert className="mr-2 h-4 w-4" />
                      Signaler
                    </Button>
                  )}
                  <span className="text-xs text-white/70">
                    {(lightboxIndex ?? 0) + 1} / {existingPhotos.length}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/10 hover:text-white"
                    onClick={closeLightbox}
                    aria-label="Fermer la galerie"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>

            {existingPhotos.length > 1 && (
              <button
                type="button"
                onClick={showNextPhoto}
                className="absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                aria-label="Photo suivante"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
