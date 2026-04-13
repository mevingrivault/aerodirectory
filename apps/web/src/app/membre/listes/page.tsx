"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, ListPlus, Trash2 } from "lucide-react";
import type { AerodromeListSummary } from "@aerodirectory/shared";

export default function MemberListsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["member-lists"],
    queryFn: () => apiClient.get<AerodromeListSummary[]>("/lists"),
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiClient.post("/lists", { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["member-lists"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/lists/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["member-lists"] }),
  });

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
        Connectez-vous pour gérer vos listes.
      </div>
    );
  }

  const lists = data?.data ?? [];

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mes listes d&apos;aérodromes</h1>
          <p className="text-sm text-muted-foreground">Favoris et sélections personnalisées</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const name = window.prompt("Nom de la nouvelle liste");
            if (!name || !name.trim()) return;
            createMutation.mutate(name.trim());
          }}
        >
          <ListPlus className="mr-2 h-4 w-4" />
          Nouvelle liste
        </Button>
      </div>

      <div className="grid gap-4">
        {lists.map((list) => (
          <Card key={list.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-primary" />
                  {list.name}
                  {list.isDefault && <Badge variant="secondary">Par défaut</Badge>}
                </span>
                {!list.isDefault && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(list.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {list.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun aérodrome dans cette liste.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {list.items.map((item) => (
                    <Link key={item.id} href={`/aerodrome/${item.aerodrome.id}`}>
                      <Badge variant="outline" className="cursor-pointer hover:bg-accent/50">
                        {item.aerodrome.name}
                        {item.aerodrome.icaoCode ? ` (${item.aerodrome.icaoCode})` : ""}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
