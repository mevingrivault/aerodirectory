"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Plane } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login, verifyTotp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  const needsEmailVerification = error
    .toLowerCase()
    .includes("vérifier votre adresse e-mail");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResendMessage("");
    setLoading(true);

    try {
      const result = await login(email, password);
      if (result.requireTotp) {
        setNeedsTotp(true);
      } else {
        router.push("/");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Échec de la connexion");
    } finally {
      setLoading(false);
    }
  };

  const handleTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResendMessage("");
    setLoading(true);

    try {
      await verifyTotp(totpCode);
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Code TOTP invalide");
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setError("");
    setResendMessage("");
    setResendLoading(true);

    try {
      const response = await apiClient.post<{ message: string }>(
        "/auth/resend-verification",
        { email },
      );
      setResendMessage(response.data.message);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de renvoyer l'e-mail de vérification",
      );
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Plane className="mx-auto mb-2 h-8 w-8 text-primary" />
          <CardTitle>{needsTotp ? "Authentification à deux facteurs" : "Connexion"}</CardTitle>
          <CardDescription>
            {needsTotp
              ? "Saisissez le code à 6 chiffres de votre application d'authentification"
              : "Connectez-vous à votre compte Navventura"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {resendMessage && (
            <div className="mb-4 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
              {resendMessage}
            </div>
          )}

          {needsTotp ? (
            <form onSubmit={handleTotp} className="space-y-4">
              <div>
                <label htmlFor="totp" className="text-sm font-medium">
                  Code TOTP
                </label>
                <Input
                  id="totp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Vérification..." : "Vérifier"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="text-sm font-medium">
                  E-mail
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="pilote@navventura.fr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium">
                    Mot de passe
                  </label>
                  <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                    Mot de passe oublié ?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Connexion..." : "Se connecter"}
              </Button>
              {needsEmailVerification && email && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleResendVerification}
                  disabled={resendLoading}
                >
                  {resendLoading
                    ? "Envoi..."
                    : "Renvoyer l'e-mail de vérification"}
                </Button>
              )}
            </form>
          )}

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Pas encore de compte ?{" "}
            <Link href="/register" className="text-primary hover:underline">
              S&apos;inscrire
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
