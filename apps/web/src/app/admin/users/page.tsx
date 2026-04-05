"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ban, ShieldCheck, UserSearch } from "lucide-react";
import type { AdminUserDetail, AdminUserListItem } from "@aerodirectory/shared";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  MODERATOR: "Moderateur",
  MEMBER: "Membre",
  VISITOR: "Visiteur",
};

export default function AdminUsersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "ACTIVE" | "BANNED">("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!loading && user?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [loading, router, user]);

  const usersQuery = useQuery({
    queryKey: ["admin-users", search, status],
    queryFn: () =>
      apiClient.get<AdminUserListItem[]>("/admin/users", {
        page: "1",
        limit: "25",
        ...(search ? { search } : {}),
        ...(status !== "all" ? { status } : {}),
      }),
    enabled: user?.role === "ADMIN",
  });

  const selectedUserQuery = useQuery({
    queryKey: ["admin-user-detail", selectedUserId],
    queryFn: () => apiClient.get<AdminUserDetail>(`/admin/users/${selectedUserId}`),
    enabled: user?.role === "ADMIN" && !!selectedUserId,
  });

  if (loading || !user || user.role !== "ADMIN") {
    return null;
  }

  const users = usersQuery.data?.data ?? [];
  const selectedUser = selectedUserQuery.data?.data ?? null;

  const refreshAll = async () => {
    await usersQuery.refetch();
    if (selectedUserId) {
      await selectedUserQuery.refetch();
    }
  };

  const handleBan = async (target: AdminUserListItem | AdminUserDetail) => {
    if (!window.confirm(`Bannir ${target.displayName || target.email} ?`)) {
      return;
    }

    const reason = window.prompt("Raison du bannissement (optionnel) :") ?? "";

    try {
      await apiClient.post(`/admin/users/${target.id}/ban`, {
        reason: reason.trim() || undefined,
      });
      setFeedback({ type: "success", message: "Utilisateur banni avec succes." });
      await refreshAll();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Impossible de bannir cet utilisateur.",
      });
    }
  };

  const handleUnban = async (target: AdminUserListItem | AdminUserDetail) => {
    if (!window.confirm(`Debannir ${target.displayName || target.email} ?`)) {
      return;
    }

    try {
      await apiClient.post(`/admin/users/${target.id}/unban`);
      setFeedback({ type: "success", message: "Utilisateur debanni avec succes." });
      await refreshAll();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Impossible de debannir cet utilisateur.",
      });
    }
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Link
            href="/admin"
            className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour a l&apos;administration
          </Link>
          <h1 className="text-3xl font-bold">Utilisateurs</h1>
          <p className="text-sm text-muted-foreground">
            Recherche, consultation et gestion des bannissements.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`mb-4 rounded-md border p-3 text-sm ${
            feedback.type === "success"
              ? "border-green-300 bg-green-50 text-green-800"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="mb-6 grid gap-3 md:grid-cols-[1fr_220px]">
        <Input
          placeholder="Rechercher par e-mail ou pseudo"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as "all" | "ACTIVE" | "BANNED")
          }
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">Tous les statuts</option>
          <option value="ACTIVE">Actifs</option>
          <option value="BANNED">Bannis</option>
        </select>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserSearch className="h-5 w-5" />
              Membres
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {users.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => setSelectedUserId(member.id)}
                className={`w-full rounded-lg border p-4 text-left transition-colors ${
                  selectedUserId === member.id
                    ? "border-primary bg-primary/5"
                    : "hover:bg-accent/20"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{member.displayName || "Sans pseudo"}</div>
                    <div className="text-sm text-muted-foreground">{member.email}</div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={member.status === "BANNED" ? "destructive" : "success"}>
                      {member.status === "BANNED" ? "Banni" : "Actif"}
                    </Badge>
                    <Badge variant={member.role === "ADMIN" ? "destructive" : "secondary"}>
                      {ROLE_LABELS[member.role] ?? member.role}
                    </Badge>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {member._count.comments} commentaires · {member._count.visits} visites
                </div>
              </button>
            ))}

            {users.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun utilisateur trouve.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedUser && (
              <p className="text-sm text-muted-foreground">
                Selectionnez un utilisateur pour consulter ses informations.
              </p>
            )}

            {selectedUser && (
              <>
                <div>
                  <div className="text-lg font-semibold">
                    {selectedUser.displayName || "Sans pseudo"}
                  </div>
                  <div className="text-sm text-muted-foreground">{selectedUser.email}</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant={selectedUser.status === "BANNED" ? "destructive" : "success"}>
                    {selectedUser.status === "BANNED" ? "Banni" : "Actif"}
                  </Badge>
                  <Badge variant={selectedUser.role === "ADMIN" ? "destructive" : "secondary"}>
                    {ROLE_LABELS[selectedUser.role] ?? selectedUser.role}
                  </Badge>
                  <Badge variant={selectedUser.totpEnabled ? "success" : "outline"}>
                    {selectedUser.totpEnabled ? "2FA active" : "2FA inactive"}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm">
                  <div>Email verifie : {selectedUser.emailVerified ? "oui" : "non"}</div>
                  <div>
                    Membre depuis :{" "}
                    {new Date(selectedUser.createdAt).toLocaleString("fr-FR")}
                  </div>
                  <div>Commentaires : {selectedUser._count.comments}</div>
                  <div>Visites : {selectedUser._count.visits}</div>
                  <div>
                    Aerodrome de rattachement :{" "}
                    {selectedUser.homeAerodrome
                      ? `${selectedUser.homeAerodrome.name}${
                          selectedUser.homeAerodrome.icaoCode
                            ? ` (${selectedUser.homeAerodrome.icaoCode})`
                            : ""
                        }`
                      : "aucun"}
                  </div>
                  {selectedUser.bannedAt && (
                    <div>
                      Banni le : {new Date(selectedUser.bannedAt).toLocaleString("fr-FR")}
                    </div>
                  )}
                  {selectedUser.bannedBy && (
                    <div>
                      Banni par :{" "}
                      {selectedUser.bannedBy.displayName || selectedUser.bannedBy.email}
                    </div>
                  )}
                  {selectedUser.bannedReason && <div>Raison : {selectedUser.bannedReason}</div>}
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {selectedUser.status === "BANNED" ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleUnban(selectedUser)}
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Debannir
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => handleBan(selectedUser)}
                    >
                      <Ban className="mr-2 h-4 w-4" />
                      Bannir
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
