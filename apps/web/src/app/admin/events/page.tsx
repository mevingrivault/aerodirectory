"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Check, X } from "lucide-react";
import type { AdminEventListItem } from "@aerodirectory/shared";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type EventState = "pending" | "approved" | "rejected" | "all";

const TYPE_LABELS: Record<AdminEventListItem["type"], string> = {
  CAFE_CROISSANT: "Café-croissant",
  OPEN_DAY: "Portes ouvertes",
  AIRSHOW: "Meeting aérien",
  OTHER: "Autre",
};

const STATUS_LABELS: Record<AdminEventListItem["contentStatus"], string> = {
  PENDING: "En attente",
  APPROVED: "Publié",
  FLAGGED: "Signalé",
  REJECTED: "Rejeté",
};

const STATUS_VARIANTS: Record<AdminEventListItem["contentStatus"], "warning" | "success" | "outline" | "destructive"> = {
  PENDING: "outline",
  APPROVED: "success",
  FLAGGED: "warning",
  REJECTED: "destructive",
};

export default function AdminEventsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [state, setState] = useState<EventState>("pending");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!loading && user?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [loading, router, user]);

  const eventsQuery = useQuery({
    queryKey: ["admin-events", search, state],
    queryFn: () =>
      apiClient.get<AdminEventListItem[]>("/admin/events", {
        page: "1",
        limit: "30",
        ...(search ? { search } : {}),
        state,
      }),
    enabled: user?.role === "ADMIN",
  });

  if (loading || !user || user.role !== "ADMIN") {
    return null;
  }

  const events = eventsQuery.data?.data ?? [];

  const review = async (event: AdminEventListItem, decision: "approve" | "reject") => {
    const question =
      decision === "approve" ? "Publier cet événement ?" : "Rejeter cet événement ?";
    if (!window.confirm(question)) {
      return;
    }

    const note = window.prompt("Note interne (optionnel) :") ?? "";

    try {
      await apiClient.post(`/admin/events/${event.id}/${decision}`, {
        note: note.trim() || undefined,
      });
      setFeedback({
        type: "success",
        message: decision === "approve" ? "Événement publié." : "Événement rejeté.",
      });
      await eventsQuery.refetch();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Action impossible.",
      });
    }
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/admin"
          className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour a l&apos;administration
        </Link>
        <h1 className="text-3xl font-bold">Événements</h1>
        <p className="text-sm text-muted-foreground">
          Les événements proposés par les comptes récents attendent une validation avant publication.
        </p>
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
          placeholder="Rechercher par titre, auteur, e-mail ou aerodrome"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          value={state}
          onChange={(event) => setState(event.target.value as EventState)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="pending">En attente de publication</option>
          <option value="approved">Publiés</option>
          <option value="rejected">Rejetés</option>
          <option value="all">Tous</option>
        </select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5" />
            Liste des événements
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {events.map((event) => (
            <div key={event.id} className="rounded-lg border p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">{event.user.displayName || "Sans pseudo"}</span>
                  <span className="text-muted-foreground"> · {event.user.email}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={STATUS_VARIANTS[event.contentStatus]}>
                    {STATUS_LABELS[event.contentStatus]}
                  </Badge>
                  <Badge variant="outline">{TYPE_LABELS[event.type]}</Badge>
                  <Badge variant="outline">
                    {event.aerodrome.icaoCode
                      ? `${event.aerodrome.name} (${event.aerodrome.icaoCode})`
                      : event.aerodrome.name}
                  </Badge>
                </div>
              </div>

              <p className="mb-1 text-sm font-medium">{event.title}</p>
              {event.description && (
                <p className="mb-3 whitespace-pre-wrap text-sm">{event.description}</p>
              )}

              <div className="space-y-1 text-xs text-muted-foreground">
                <div>
                  Du {new Date(event.startDate).toLocaleString("fr-FR")}
                  {event.endDate ? ` au ${new Date(event.endDate).toLocaleString("fr-FR")}` : ""}
                </div>
                <div>Proposé le {new Date(event.createdAt).toLocaleString("fr-FR")}</div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {event.contentStatus !== "APPROVED" && (
                  <Button type="button" variant="outline" onClick={() => review(event, "approve")}>
                    <Check className="mr-2 h-4 w-4" />
                    Publier
                  </Button>
                )}
                {event.contentStatus !== "REJECTED" && (
                  <Button type="button" variant="outline" onClick={() => review(event, "reject")}>
                    <X className="mr-2 h-4 w-4" />
                    Rejeter
                  </Button>
                )}
              </div>
            </div>
          ))}

          {events.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun événement trouvé.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
