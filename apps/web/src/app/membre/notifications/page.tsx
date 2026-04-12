"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, CheckCheck } from "lucide-react";
import type { NotificationItem } from "@aerodirectory/shared";

export default function MemberNotificationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      apiClient.get<NotificationItem[]>("/notifications", {
        page: "1",
        limit: "100",
      }),
    enabled: !!user,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiClient.post("/notifications/read", { all: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
        Connectez-vous pour voir vos notifications.
      </div>
    );
  }

  const notifications = data?.data ?? [];

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">Réponses, modération et suivi</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => markAllReadMutation.mutate()}
          disabled={markAllReadMutation.isPending}
        >
          <CheckCheck className="mr-2 h-4 w-4" />
          Tout marquer lu
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement...</p>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Bell className="mx-auto mb-2 h-8 w-8 opacity-40" />
            Aucune notification.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <Card key={n.id} className={n.readAt ? "opacity-70" : "border-primary/40"}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">{n.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(n.createdAt).toLocaleString("fr-FR")}
                    </p>
                  </div>
                  {n.linkUrl ? (
                    <Link href={n.linkUrl} className="text-xs text-primary hover:underline">
                      Ouvrir
                    </Link>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
