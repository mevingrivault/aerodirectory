"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Key, Mail, CheckCircle } from "lucide-react";
import type { TotpSetupResponse } from "@aerodirectory/shared";

export default function ProfilePage() {
  const { user } = useAuth();
  const [totpSetup, setTotpSetup] = useState<TotpSetupResponse | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [message, setMessage] = useState("");

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
        Connectez-vous pour accéder à votre profil.
      </div>
    );
  }

  const handleSetupTotp = async () => {
    const res = await apiClient.post<TotpSetupResponse>("/auth/totp/setup");
    setTotpSetup(res.data);
  };

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post("/auth/totp/verify", { code: totpCode });
      setMessage("Authentification à deux facteurs activée avec succès !");
      setTotpSetup(null);
      setTotpCode("");
    } catch {
      setMessage("Code invalide. Veuillez réessayer.");
    }
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Profil</h1>

      {/* Profile info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Informations du Compte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Nom d&apos;affichage</span>
            <span>{user.displayName || "—"}</span>
          </div>
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

      {/* 2FA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" /> Authentification à Deux Facteurs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {message && (
            <div className="mb-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
              {message}
            </div>
          )}

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
              <img
                src={totpSetup.qrCodeUrl}
                alt="QR Code TOTP"
                className="mx-auto w-48 h-48"
              />
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
