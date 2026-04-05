"use client";

import { useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Plane, CheckCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await apiClient.post("/auth/forgot-password", { email });
      setSubmitted(true);
    } catch {
      // Message générique même en cas d'erreur réseau
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Plane className="mx-auto h-8 w-8 text-primary mb-2" />
          <CardTitle>Mot de passe oublié</CardTitle>
          <CardDescription>
            Saisissez votre adresse e-mail pour recevoir un lien de réinitialisation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="text-center space-y-4">
              <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
              <p className="text-sm text-muted-foreground">
                Si cet e-mail est associé à un compte, un lien de réinitialisation a été envoyé.
                Vérifiez votre boîte de réception (et vos spams).
              </p>
              <Link href="/login" className="text-primary hover:underline text-sm">
                Retour à la connexion
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="text-sm font-medium">
                    Adresse e-mail
                  </label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="pilote@exemple.fr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Envoi en cours..." : "Envoyer le lien"}
                </Button>
              </form>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                <Link href="/login" className="text-primary hover:underline">
                  Retour à la connexion
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
