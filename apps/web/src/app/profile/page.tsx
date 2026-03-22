"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Key, Mail, CheckCircle, Pencil, Lock, MapPin, Search, X } from "lucide-react";
import type { TotpSetupResponse } from "@aerodirectory/shared";

interface AerodromeOption {
  id: string;
  name: string;
  icaoCode: string | null;
  city: string | null;
}

type AlertType = "success" | "error";

function Alert({ type, msg }: { type: AlertType; msg: string }) {
  return (
    <div
      className={`mb-4 rounded-md border p-3 text-sm ${
        type === "success"
          ? "border-green-300 bg-green-50 text-green-800"
          : "border-red-300 bg-red-50 text-red-800"
      }`}
    >
      {msg}
    </div>
  );
}

export default function ProfilePage() {
  const { user, refreshProfile } = useAuth();

  // TOTP state
  const [totpSetup, setTotpSetup] = useState<TotpSetupResponse | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpAlert, setTotpAlert] = useState<{ type: AlertType; msg: string } | null>(null);

  // Edit display name state
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameAlert, setNameAlert] = useState<{ type: AlertType; msg: string } | null>(null);

  // Change password state
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwAlert, setPwAlert] = useState<{ type: AlertType; msg: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  // Home aerodrome state
  const [homeSearch, setHomeSearch] = useState("");
  const [showHomeSuggestions, setShowHomeSuggestions] = useState(false);
  const [homeAlert, setHomeAlert] = useState<{ type: AlertType; msg: string } | null>(null);
  const homeSearchRef = useRef<HTMLDivElement>(null);

  const { data: homeSuggestionsRes } = useQuery({
    queryKey: ["aerodrome-search-home", homeSearch],
    queryFn: () => apiClient.get<AerodromeOption[]>("/aerodromes/map", { q: homeSearch }),
    enabled: homeSearch.length >= 2,
  });
  const homeSuggestions = (homeSuggestionsRes?.data ?? []).slice(0, 6);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (homeSearchRef.current && !homeSearchRef.current.contains(e.target as Node)) {
        setShowHomeSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
        Connectez-vous pour accéder à votre profil.
      </div>
    );
  }

  // ─── Display name ───────────────────────────────────────

  const handleStartEditName = () => {
    setNewName(user.displayName || "");
    setNameAlert(null);
    setEditingName(true);
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.put("/auth/profile", {
        displayName: newName.trim() || undefined,
      });
      await refreshProfile();
      setEditingName(false);
      setNameAlert({ type: "success", msg: "Nom d'affichage mis à jour." });
    } catch {
      setNameAlert({ type: "error", msg: "Impossible de mettre à jour le profil." });
    }
  };

  // ─── Change password ────────────────────────────────────

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) {
      setPwAlert({ type: "error", msg: "Les mots de passe ne correspondent pas." });
      return;
    }
    setPwLoading(true);
    setPwAlert(null);
    try {
      await apiClient.post("/auth/change-password", {
        currentPassword: pwForm.current,
        newPassword: pwForm.next,
      });
      setPwAlert({ type: "success", msg: "Mot de passe changé avec succès." });
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.message.includes("actuel")
          ? "Mot de passe actuel incorrect."
          : "Impossible de changer le mot de passe.";
      setPwAlert({ type: "error", msg });
    } finally {
      setPwLoading(false);
    }
  };

  // ─── Home aerodrome ─────────────────────────────────────

  const handleSelectHomeAerodrome = async (ad: AerodromeOption) => {
    setShowHomeSuggestions(false);
    setHomeSearch("");
    setHomeAlert(null);
    try {
      await apiClient.put("/auth/profile", { homeAerodromeId: ad.id });
      await refreshProfile();
      setHomeAlert({ type: "success", msg: `Aérodrome de rattachement défini : ${ad.name}.` });
    } catch {
      setHomeAlert({ type: "error", msg: "Impossible de mettre à jour l'aérodrome de rattachement." });
    }
  };

  const handleClearHomeAerodrome = async () => {
    setHomeAlert(null);
    try {
      await apiClient.put("/auth/profile", { homeAerodromeId: null });
      await refreshProfile();
      setHomeAlert({ type: "success", msg: "Aérodrome de rattachement retiré." });
    } catch {
      setHomeAlert({ type: "error", msg: "Impossible de mettre à jour l'aérodrome de rattachement." });
    }
  };

  // ─── TOTP ───────────────────────────────────────────────

  const handleSetupTotp = async () => {
    const res = await apiClient.post<TotpSetupResponse>("/auth/totp/setup");
    setTotpSetup(res.data);
    setTotpAlert(null);
  };

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post("/auth/totp/verify", { code: totpCode });
      setTotpAlert({ type: "success", msg: "Authentification à deux facteurs activée avec succès !" });
      setTotpSetup(null);
      setTotpCode("");
      await refreshProfile();
    } catch {
      setTotpAlert({ type: "error", msg: "Code invalide. Veuillez réessayer." });
    }
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Profil</h1>

      {/* Account info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Informations du Compte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {nameAlert && <Alert type={nameAlert.type} msg={nameAlert.msg} />}

          {/* Email */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{user.email}</span>
            </div>
            {user.emailVerified ? (
              <Badge variant="success">
                <CheckCircle className="mr-1 h-3 w-3" /> Vérifié
              </Badge>
            ) : (
              <Badge variant="warning">Non vérifié</Badge>
            )}
          </div>

          {/* Display name */}
          <div>
            {editingName ? (
              <form onSubmit={handleSaveName} className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="Nom d'affichage"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={50}
                />
                <Button type="submit" size="sm">Sauvegarder</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditingName(false)}>
                  Annuler
                </Button>
              </form>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-muted-foreground">Nom d&apos;affichage — </span>
                  <span className="font-medium">{user.displayName || "—"}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={handleStartEditName}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Role / since */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Rôle</span>
            <Badge variant="secondary">{user.role}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Membre depuis</span>
            <span>{new Date(user.createdAt).toLocaleDateString("fr-FR")}</span>
          </div>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="h-5 w-5" /> Changer le Mot de Passe
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pwAlert && <Alert type={pwAlert.type} msg={pwAlert.msg} />}
          <form onSubmit={handleChangePassword} className="space-y-3">
            <Input
              type="password"
              placeholder="Mot de passe actuel"
              value={pwForm.current}
              onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))}
              required
            />
            <Input
              type="password"
              placeholder="Nouveau mot de passe (12 car. min.)"
              value={pwForm.next}
              onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))}
              required
            />
            <Input
              type="password"
              placeholder="Confirmer le nouveau mot de passe"
              value={pwForm.confirm}
              onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
              required
            />
            <Button type="submit" variant="outline" disabled={pwLoading}>
              {pwLoading ? "Modification..." : "Changer le mot de passe"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Home aerodrome */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin className="h-5 w-5" /> Aérodrome de Rattachement
          </CardTitle>
        </CardHeader>
        <CardContent>
          {homeAlert && <Alert type={homeAlert.type} msg={homeAlert.msg} />}

          {user.homeAerodrome ? (
            <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="font-medium">{user.homeAerodrome.name}</span>
                {user.homeAerodrome.icaoCode && (
                  <Badge variant="secondary">{user.homeAerodrome.icaoCode}</Badge>
                )}
              </div>
              <button
                onClick={handleClearHomeAerodrome}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Retirer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-3">
              Aucun aérodrome de rattachement défini.
            </p>
          )}

          <div ref={homeSearchRef} className="relative mt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Rechercher un aérodrome par nom ou ICAO..."
                value={homeSearch}
                onChange={(e) => {
                  setHomeSearch(e.target.value);
                  setShowHomeSuggestions(true);
                }}
                onFocus={() => homeSearch.length >= 2 && setShowHomeSuggestions(true)}
              />
            </div>
            {showHomeSuggestions && homeSuggestions.length > 0 && (
              <div className="absolute z-20 w-full mt-1 rounded-md border bg-background shadow-lg">
                {homeSuggestions.map((ad) => (
                  <button
                    key={ad.id}
                    className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors"
                    onMouseDown={() => handleSelectHomeAerodrome(ad)}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">{ad.name}</span>
                      {ad.icaoCode && (
                        <Badge variant="secondary" className="text-xs">{ad.icaoCode}</Badge>
                      )}
                    </div>
                    {ad.city && (
                      <div className="text-xs text-muted-foreground ml-5">{ad.city}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2FA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" /> Authentification à Deux Facteurs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totpAlert && <Alert type={totpAlert.type} msg={totpAlert.msg} />}

          {user.totpEnabled ? (
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-green-600" />
              <span className="text-green-700 font-medium">
                L&apos;authentification TOTP est activée sur votre compte
              </span>
            </div>
          ) : totpSetup ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Scannez ce QR code avec votre application d&apos;authentification :
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={totpSetup.qrCodeUrl} alt="QR Code TOTP" className="mx-auto w-48 h-48" />
              <p className="text-xs text-muted-foreground text-center break-all">
                Clé manuelle : {totpSetup.secret}
              </p>
              <form onSubmit={handleVerifyTotp} className="flex gap-2">
                <Input
                  placeholder="Saisissez le code à 6 chiffres"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  maxLength={6}
                />
                <Button type="submit">Vérifier</Button>
              </form>
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Ajoutez une couche de sécurité supplémentaire avec l&apos;authentification à deux facteurs TOTP.
              </p>
              <Button variant="outline" onClick={handleSetupTotp}>
                <Key className="mr-2 h-4 w-4" /> Activer la 2FA
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
