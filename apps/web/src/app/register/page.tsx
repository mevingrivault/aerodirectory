"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Plane, Check, X } from "lucide-react";

const RULES = [
  { label: "12 caractères minimum", test: (p: string) => p.length >= 12 },
  { label: "Une majuscule", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Une minuscule", test: (p: string) => /[a-z]/.test(p) },
  { label: "Un chiffre", test: (p: string) => /[0-9]/.test(p) },
  { label: "Un caractère spécial", test: (p: string) => /[^a-zA-Z0-9]/.test(p) },
];

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const allRulesOk = RULES.every((r) => r.test(password));
  const confirmOk = confirm.length > 0 && password === confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRulesOk) {
      setError("Le mot de passe ne respecte pas les critères de sécurité.");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await register(email, password, displayName.trim() || undefined);
      router.push("/membre");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("conflict")) {
        setError("Cette adresse e-mail est déjà utilisée.");
      } else {
        setError("Échec de l'inscription. Veuillez réessayer.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Plane className="mx-auto mb-2 h-8 w-8 text-primary" />
          <CardTitle>Créer un compte</CardTitle>
          <CardDescription>
            Bienvenue sur Navventura. Tu es prêt à devenir Aéroventurier ?
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="displayName" className="text-sm font-medium">
                Nom d&apos;affichage <span className="text-muted-foreground">(optionnel)</span>
              </label>
              <Input
                id="displayName"
                type="text"
                placeholder="Capitaine Ciel"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
              />
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
                onChange={(e) => setEmail(e.target.value)}
                required
              />
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
                onFocus={() => setShowRules(true)}
                required
              />
              {showRules && (
                <ul className="mt-2 space-y-1">
                  {RULES.map((r) => {
                    const ok = r.test(password);
                    return (
                      <li
                        key={r.label}
                        className={`flex items-center gap-1.5 text-xs ${
                          ok ? "text-green-600" : "text-muted-foreground"
                        }`}
                      >
                        {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        {r.label}
                      </li>
                    );
                  })}
                </ul>
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
              {confirm.length > 0 && !confirmOk && (
                <p className="mt-1 text-xs text-destructive">
                  Les mots de passe ne correspondent pas.
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading || !allRulesOk || !confirmOk}>
              {loading ? "Création en cours..." : "Créer mon compte"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Déjà inscrit ?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Se connecter
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
