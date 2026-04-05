"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Plane, CheckCircle, AlertCircle } from "lucide-react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Validation de votre adresse e-mail…");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Lien de vérification invalide.");
      return;
    }

    const verify = async () => {
      try {
        await apiClient.get("/auth/verify-email", { token });
        setStatus("success");
        setMessage("Votre adresse e-mail a bien été vérifiée. Vous pouvez maintenant vous connecter.");
      } catch (err: unknown) {
        setStatus("error");
        setMessage(
          err instanceof Error
            ? err.message
            : "Le lien de vérification est invalide ou expiré.",
        );
      }
    };

    void verify();
  }, [token]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <Plane className="mx-auto mb-2 h-8 w-8 text-primary" />
        <CardTitle>Vérification de l&apos;adresse e-mail</CardTitle>
        <CardDescription>Activation de votre compte Navventura</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        {status === "loading" && <p className="text-sm text-muted-foreground">{message}</p>}
        {status === "success" && (
          <>
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <p className="text-sm text-foreground">{message}</p>
            <Button asChild className="w-full">
              <Link href="/login">Se connecter</Link>
            </Button>
          </>
        )}
        {status === "error" && (
          <>
            <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
            <p className="text-sm text-destructive">{message}</p>
            <Link href="/login" className="text-sm text-primary hover:underline">
              Retour à la connexion
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4">
      <Suspense fallback={null}>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
