"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Plane, CheckCircle, AlertCircle } from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Lien invalide. Veuillez refaire une demande de réinitialisation.");
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      await apiClient.post("/auth/reset-password", { token, password });
      setSuccess(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Lien invalide ou expiré. Veuillez refaire une demande.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <Plane className="mx-auto h-8 w-8 text-primary mb-2" />
        <CardTitle>Nouveau mot de passe</CardTitle>
        <CardDescription>Choisissez un mot de passe sécurisé pour votre compte.</CardDescription>
      </CardHeader>
      <CardContent>
        {success ? (
          <div className="text-center space-y-4">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <p className="text-sm text-muted-foreground">
              Mot de passe réinitialisé avec succès. Redirection vers la connexion…
            </p>
            <Link href="/login" className="text-primary hover:underline text-sm">
              Se connecter maintenant
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="text-sm font-medium">
                  Nouveau mot de passe
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={!token}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  12 caractères min., majuscule, minuscule, chiffre et caractère spécial.
                </p>
              </div>
              <div>
                <label htmlFor="confirm" className="text-sm font-medium">
                  Confirmer le mot de passe
                </label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  disabled={!token}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !token}>
                {loading ? "Réinitialisation..." : "Enregistrer le nouveau mot de passe"}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              <Link href="/forgot-password" className="text-primary hover:underline">
                Renvoyer un nouveau lien
              </Link>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4">
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
