"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Plane, Check, X, Mail } from "lucide-react";

const RULES = [
  { label: "12 caracteres minimum", test: (p: string) => p.length >= 12 },
  { label: "Une majuscule", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Une minuscule", test: (p: string) => /[a-z]/.test(p) },
  { label: "Un chiffre", test: (p: string) => /[0-9]/.test(p) },
  { label: "Un caractere special", test: (p: string) => /[^a-zA-Z0-9]/.test(p) },
];

export default function RegisterPage() {
  const { register } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [emailStatus, setEmailStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordChecks = useMemo(
    () => RULES.map((rule) => ({ ...rule, ok: rule.test(password) })),
    [password],
  );
  const allRulesOk = passwordChecks.every((rule) => rule.ok);
  const completedRules = passwordChecks.filter((rule) => rule.ok).length;
  const confirmOk = confirm.length > 0 && password === confirm;
  const displayNameOk = displayName.trim().length >= 2;
  const showPasswordHelp = showRules || passwordTouched || password.length > 0;
  const emailTrimmed = email.trim();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!displayNameOk) {
      setError("Le pseudo est obligatoire.");
      return;
    }

    if (emailStatus === "taken") {
      setError("Cette adresse e-mail est deja utilisee.");
      return;
    }

    if (!allRulesOk) {
      setError("Le mot de passe ne respecte pas les criteres de securite.");
      return;
    }

    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const message = await register(email, password, displayName.trim());
      setSuccess(message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (msg.includes("display name")) {
        setError("Ce pseudo est deja pris.");
      } else if (msg.includes("already") || msg.includes("conflict")) {
        setError("Cette adresse e-mail est deja utilisee.");
      } else {
        setError("Echec de l'inscription. Veuillez reessayer.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailBlur = async () => {
    if (!emailLooksValid) {
      setEmailStatus("idle");
      return;
    }

    setEmailStatus("checking");

    try {
      const response = await apiClient.post<{ available: boolean }>("/auth/check-email", {
        email: emailTrimmed,
      });
      setEmailStatus(response.data.available ? "available" : "taken");
    } catch {
      setEmailStatus("idle");
    }
  };

  return (
    <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Plane className="mx-auto mb-2 h-8 w-8 text-primary" />
          <CardTitle>Creer un compte</CardTitle>
          <CardDescription>
            Bienvenue sur Navventura. Tu es pret a devenir Aeroventurier ?
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4 text-center">
              <Mail className="mx-auto h-12 w-12 text-primary" />
              <p className="text-sm text-foreground">{success}</p>
              <p className="text-sm text-muted-foreground">
                Ouvre l&apos;e-mail recu pour valider ton adresse avant de te connecter.
              </p>
              <Link href="/login" className="text-sm text-primary hover:underline">
                Aller a la connexion
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
                  <label htmlFor="displayName" className="text-sm font-medium">
                    Pseudo
                  </label>
                  <Input
                    id="displayName"
                    type="text"
                    placeholder="Capitaine Ciel"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={50}
                    autoComplete="nickname"
                    required
                    className={
                      displayName.length > 0
                        ? displayNameOk
                          ? "border-green-400 focus-visible:ring-green-400"
                          : "border-destructive focus-visible:ring-destructive"
                        : ""
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ce pseudo est public et doit etre unique.
                  </p>
                </div>

                <div>
                  <label htmlFor="email" className="text-sm font-medium">
                    Adresse e-mail
                  </label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="pilote@navventura.fr"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailStatus("idle");
                    }}
                    onBlur={handleEmailBlur}
                    required
                  />
                  {emailStatus === "checking" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Verification de l&apos;adresse...
                    </p>
                  )}
                  {emailStatus === "available" && (
                    <p className="mt-1 text-xs text-green-600">
                      Cette adresse e-mail est disponible.
                    </p>
                  )}
                  {emailStatus === "taken" && (
                    <p className="mt-1 text-xs text-destructive">
                      Cette adresse e-mail est deja utilisee.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="password" className="text-sm font-medium">
                    Mot de passe
                  </label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => {
                      setShowRules(true);
                      setPasswordTouched(true);
                    }}
                    required
                  />
                  {showPasswordHelp && (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {completedRules}/{RULES.length} criteres de securite valides
                      </p>
                      <ul className="space-y-1">
                        {passwordChecks.map((rule) => (
                          <li
                            key={rule.label}
                            className={`flex items-center gap-1.5 text-xs ${
                              rule.ok ? "text-green-600" : "text-muted-foreground"
                            }`}
                          >
                            {rule.ok ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                            {rule.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
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
                    className={
                      confirm.length > 0
                        ? confirmOk
                          ? "border-green-400 focus-visible:ring-green-400"
                          : "border-destructive focus-visible:ring-destructive"
                        : ""
                    }
                  />
                  {confirm.length > 0 && (
                    <p
                      className={`mt-1 text-xs ${
                        confirmOk ? "text-green-600" : "text-destructive"
                      }`}
                    >
                      {confirmOk
                        ? "Les mots de passe correspondent."
                        : "Les mots de passe ne correspondent pas."}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    loading ||
                    !displayNameOk ||
                    !allRulesOk ||
                    !confirmOk ||
                    emailStatus === "checking" ||
                    emailStatus === "taken"
                  }
                >
                  {loading ? "Creation en cours..." : "Creer mon compte"}
                </Button>
              </form>

              <p className="mt-4 text-center text-sm text-muted-foreground">
                Deja inscrit ?{" "}
                <Link href="/login" className="text-primary hover:underline">
                  Se connecter
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
