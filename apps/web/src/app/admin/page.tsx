"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Ban, MessageSquare, Shield, Users } from "lucide-react";
import type { AdminDashboardStats } from "@aerodirectory/shared";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [loading, router, user]);

  const { data } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => apiClient.get<AdminDashboardStats>("/admin/stats"),
    enabled: user?.role === "ADMIN",
  });

  if (loading || !user || user.role !== "ADMIN") {
    return null;
  }

  const stats = data?.data;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 flex items-center gap-3">
        <div className="rounded-full bg-primary/10 p-3 text-primary">
          <Shield className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Administration</h1>
          <p className="text-sm text-muted-foreground">
            Moderation et supervision de la plateforme.
          </p>
        </div>
      </div>

      {stats && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <div className="mb-2 text-sm text-muted-foreground">Utilisateurs</div>
              <div className="text-3xl font-bold">{stats.totalUsers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="mb-2 text-sm text-muted-foreground">Utilisateurs bannis</div>
              <div className="text-3xl font-bold text-destructive">{stats.bannedUsers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="mb-2 text-sm text-muted-foreground">Commentaires actifs</div>
              <div className="text-3xl font-bold">{stats.activeComments}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="mb-2 text-sm text-muted-foreground">Commentaires supprimes</div>
              <div className="text-3xl font-bold">{stats.deletedComments}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/admin/users">
          <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Users className="h-5 w-5" />
                Utilisateurs
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Rechercher des membres, consulter leurs informations et gerer les bannissements.
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/comments">
          <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <MessageSquare className="h-5 w-5" />
                Commentaires
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Rechercher, filtrer et moderer les commentaires avec tracabilite.
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card className="mt-8 border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-destructive">
            <Ban className="h-5 w-5" />
            Actions sensibles
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Les bannissements et suppressions de commentaires sont journalises avec l&apos;identite
          de l&apos;administrateur et la date de l&apos;action.
        </CardContent>
      </Card>
    </div>
  );
}
