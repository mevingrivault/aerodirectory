"use client";

import { useState, useRef, useCallback } from "react";
import { apiClient, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ImagePlus, X, Loader2, UploadCloud, CheckCircle, AlertCircle } from "lucide-react";

const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const ACCEPTED_EXT = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];

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
}

type UploadState = "idle" | "uploading" | "success" | "error";

export function PhotoUpload({
  aerodromeId,
  currentUserId,
  existingPhotos = [],
  onUploadSuccess,
  onDeleteSuccess,
}: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_SIZE_BYTES) {
      return `Fichier trop volumineux (max ${MAX_SIZE_MB} Mo).`;
    }
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
    const mimeOk = ACCEPTED.some((m) => file.type === m || file.type === "");
    const extOk = ACCEPTED_EXT.includes(ext);
    if (!mimeOk && !extOk) {
      return "Format non supporté. Formats acceptés : JPEG, PNG, WebP, HEIC (iPhone).";
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
    const url = URL.createObjectURL(file);
    setPreview(url);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
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
    setUploadState("uploading");
    setErrorMsg(null);

    try {
      const res = await apiClient.upload<PhotoEntry>(
        `/aerodromes/${aerodromeId}/photos`,
        selectedFile,
      );
      setUploadState("success");
      setPreview(null);
      setSelectedFile(null);
      if (res.data) onUploadSuccess?.(res.data);
    } catch (err) {
      setUploadState("error");
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Une erreur est survenue lors de l'upload.",
      );
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
      // silent — user sees no change
    }
  };

  return (
    <div className="space-y-4">
      {/* Existing photos grid */}
      {existingPhotos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {existingPhotos.map((p) => (
            <div key={p.id} className="relative group rounded-lg overflow-hidden border bg-muted aspect-video">
              {/* We show the storedKey as a relative path — served via your CDN/proxy */}
              <img
                src={`/api/photos/${p.storedKey}`}
                alt="Photo aérodrome"
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {currentUserId === p.user.id && (
                <button
                  onClick={() => handleDelete(p.id)}
                  className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors"
                  aria-label="Supprimer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload zone */}
      {!preview ? (
        <div
          className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer
            ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"}`}
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
        >
          <UploadCloud className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">
            Glissez une photo ou <span className="text-primary">cliquez pour parcourir</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            JPEG, PNG, WebP, HEIC (iPhone) · Max {MAX_SIZE_MB} Mo
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
          <div className="relative rounded-lg overflow-hidden border aspect-video bg-muted">
            <img
              src={preview}
              alt="Aperçu"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleUpload}
              disabled={uploadState === "uploading"}
              className="flex-1"
            >
              {uploadState === "uploading" ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Traitement en cours…
                </>
              ) : (
                <>
                  <ImagePlus className="h-4 w-4 mr-2" />
                  Envoyer la photo
                </>
              )}
            </Button>
            <Button variant="outline" onClick={handleCancel} disabled={uploadState === "uploading"}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Feedback messages */}
      {errorMsg && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}
      {uploadState === "success" && (
        <div className="flex items-center gap-2 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle className="h-4 w-4 shrink-0" />
          Photo envoyée avec succès !
        </div>
      )}
    </div>
  );
}
