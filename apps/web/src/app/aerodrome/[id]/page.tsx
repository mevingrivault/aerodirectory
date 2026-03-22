"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DISCLAIMER } from "@aerodirectory/shared";
import {
  Plane,
  MapPin,
  Radio,
  Fuel,
  Utensils,
  Wrench,
  Home,
  Bike,
  Bus,
  Moon,
  ExternalLink,
  Star,
  Eye,
  Heart,
  MessageSquare,
  ArrowLeft,
  Navigation,
} from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

interface AerodromeDetail {
  id: string;
  name: string;
  icaoCode: string | null;
  latitude: number;
  longitude: number;
  elevation: number | null;
  city: string | null;
  region: string | null;
  department: string | null;
  countryCode: string;
  aerodromeType: string;
  status: string;
  description: string | null;
  aipLink: string | null;
  vacLink: string | null;
  websiteUrl: string | null;
  hasRestaurant: boolean;
  hasBikes: boolean;
  hasTransport: boolean;
  hasAccommodation: boolean;
  hasMaintenance: boolean;
  hasHangars: boolean;
  nightOperations: boolean;
  source: string | null;
  lastSyncedAt: string | null;
  runways: {
    id: string;
    identifier: string;
    length: number;
    width: number | null;
    surface: string;
    lighting: boolean;
    remarks: string | null;
  }[];
  frequencies: {
    id: string;
    type: string;
    mhz: number;
    callsign: string | null;
    notes: string | null;
  }[];
  fuels: {
    id: string;
    type: string;
    available: boolean;
    selfService: boolean;
    availabilityHours: string | null;
    paymentType: string;
  }[];
  _count: { visits: number; comments: number };
}

interface NearbyAerodrome {
  id: string;
  name: string;
  icaoCode: string | null;
  distanceKm: number;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; displayName: string | null };
}

const TYPE_LABELS: Record<string, string> = {
  SMALL_AIRPORT: "Aérodrome",
  INTERNATIONAL_AIRPORT: "Aéroport International",
  GLIDER_SITE: "Site de Vol à Voile",
  ULTRALIGHT_FIELD: "Terrain ULM",
  HELIPORT: "Héliport",
  MILITARY: "Militaire",
  SEAPLANE_BASE: "Base Hydravion",
  OTHER: "Autre",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "OUVERT",
  CLOSED: "FERMÉ",
};

export default function AerodromeDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const [commentText, setCommentText] = useState("");

  const { data: aerodromeRes, isLoading } = useQuery({
    queryKey: ["aerodrome", id],
    queryFn: () => apiClient.get<AerodromeDetail>(`/aerodromes/${id}`),
  });

  const { data: commentsRes, refetch: refetchComments } = useQuery({
    queryKey: ["comments", id],
    queryFn: () =>
      apiClient.get<Comment[]>(`/aerodromes/${id}/comments`, {
        page: "1",
        limit: "50",
      }),
  });

  const ad = aerodromeRes?.data;

  // Fetch nearby aerodromes once we have coordinates
  const { data: nearbyRes } = useQuery({
    queryKey: ["nearby", ad?.latitude, ad?.longitude],
    queryFn: () =>
      apiClient.get<NearbyAerodrome[]>("/aerodromes/nearby", {
        lat: ad!.latitude.toString(),
        lng: ad!.longitude.toString(),
        radiusKm: "50",
        limit: "6",
      }),
    enabled: !!ad,
  });

  const comments = commentsRes?.data ?? [];
  const nearbyAerodromes = (nearbyRes?.data ?? []).filter((n) => n.id !== id);

  const handleVisit = async (status: string) => {
    await apiClient.put(`/visits/${id}`, { status });
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    await apiClient.post(`/aerodromes/${id}/comments`, {
      content: commentText,
    });
    setCommentText("");
    refetchComments();
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
        Chargement des données...
      </div>
    );
  }

  if (!ad) {
    return (
      <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
        Aérodrome introuvable.
      </div>
    );
  }

  const amenities = [
    { icon: Utensils, label: "Restaurant", active: ad.hasRestaurant },
    { icon: Bike, label: "Vélos", active: ad.hasBikes },
    { icon: Bus, label: "Transport", active: ad.hasTransport },
    { icon: Home, label: "Hébergement", active: ad.hasAccommodation },
    { icon: Wrench, label: "Maintenance", active: ad.hasMaintenance },
    { icon: Plane, label: "Hangars", active: ad.hasHangars },
    { icon: Moon, label: "Vols de nuit", active: ad.nightOperations },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back link */}
      <Link
        href="/search"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Retour à la recherche
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h1 className="text-3xl font-bold">{ad.name}</h1>
          {ad.icaoCode && (
            <Badge variant="secondary" className="text-lg">
              {ad.icaoCode}
            </Badge>
          )}
          <Badge variant={ad.status === "OPEN" ? "success" : "warning"}>
            {STATUS_LABELS[ad.status] ?? ad.status}
          </Badge>
          <Badge variant="outline">
            {TYPE_LABELS[ad.aerodromeType] || ad.aerodromeType}
          </Badge>
        </div>
        <p className="text-muted-foreground flex items-center gap-1">
          <MapPin className="h-4 w-4" />
          {[ad.city, ad.department, ad.region].filter(Boolean).join(", ")}
          {ad.elevation != null && ` — ${ad.elevation} ft`}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {ad.latitude.toFixed(4)}°N, {ad.longitude.toFixed(4)}°E
        </p>

        {/* Source info */}
        {ad.source && (
          <p className="text-xs text-muted-foreground mt-1">
            Source : {ad.source}
            {ad.lastSyncedAt &&
              ` — Dernière synchro : ${new Date(ad.lastSyncedAt).toLocaleDateString("fr-FR")}`}
          </p>
        )}

        {/* Visit buttons (authenticated only) */}
        {user && (
          <div className="flex gap-2 mt-4">
            <Button size="sm" variant="outline" onClick={() => handleVisit("SEEN")}>
              <Eye className="mr-1 h-4 w-4" /> Vu
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleVisit("VISITED")}>
              <Star className="mr-1 h-4 w-4" /> Visité
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleVisit("FAVORITE")}>
              <Heart className="mr-1 h-4 w-4" /> Favori
            </Button>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="mb-6 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
        {DISCLAIMER}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Runways */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plane className="h-5 w-5" /> Pistes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ad.runways.length === 0 ? (
              <p className="text-muted-foreground">Aucune donnée de piste disponible.</p>
            ) : (
              <div className="space-y-3">
                {ad.runways.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <span className="font-mono font-bold">{r.identifier}</span>
                      <span className="ml-2 text-muted-foreground">
                        {r.length}m × {r.width ?? "?"}m
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline">{r.surface}</Badge>
                      {r.lighting && <Badge variant="secondary">Balisée</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Frequencies */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Radio className="h-5 w-5" /> Fréquences
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ad.frequencies.length === 0 ? (
              <p className="text-muted-foreground">Aucune fréquence disponible.</p>
            ) : (
              <div className="space-y-2">
                {ad.frequencies.map((f) => (
                  <div key={f.id} className="flex items-center justify-between">
                    <span>
                      <Badge variant="outline" className="mr-2">{f.type}</Badge>
                      {f.callsign}
                    </span>
                    <span className="font-mono">{f.mhz.toFixed(3)} MHz</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fuel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Fuel className="h-5 w-5" /> Carburant
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ad.fuels.length === 0 ? (
              <p className="text-muted-foreground">Aucune donnée carburant disponible.</p>
            ) : (
              <div className="space-y-2">
                {ad.fuels.map((f) => (
                  <div key={f.id} className="flex items-center justify-between">
                    <span>
                      {f.type.replace("_", " ")}
                      {f.selfService && " (Libre-service)"}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant={f.available ? "success" : "destructive"}>
                        {f.available ? "Disponible" : "Indisponible"}
                      </Badge>
                      {f.availabilityHours && (
                        <span className="text-sm text-muted-foreground">
                          {f.availabilityHours}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Amenities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Services aux Pilotes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {amenities.map((a) => (
                <div
                  key={a.label}
                  className={`flex items-center gap-2 rounded-md border p-2 ${
                    a.active ? "bg-green-50 border-green-200" : "opacity-40"
                  }`}
                >
                  <a.icon className="h-4 w-4" />
                  <span className="text-sm">{a.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Nearby Aerodromes */}
        {nearbyAerodromes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Navigation className="h-5 w-5" /> Aérodromes à Proximité
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {nearbyAerodromes.map((n) => (
                  <Link
                    key={n.id}
                    href={`/aerodrome/${n.id}`}
                    className="flex items-center justify-between rounded-md border p-2 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm">
                      {n.name}
                      {n.icaoCode && (
                        <span className="ml-1 text-muted-foreground">({n.icaoCode})</span>
                      )}
                    </span>
                    <span className="text-xs font-medium text-primary">
                      {n.distanceKm.toFixed(0)} km
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Links */}
        {(ad.aipLink || ad.vacLink || ad.websiteUrl) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Liens Officiels</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ad.aipLink && (
                <a
                  href={ad.aipLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" /> Page AIP
                </a>
              )}
              {ad.vacLink && (
                <a
                  href={ad.vacLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" /> Carte VAC
                </a>
              )}
              {ad.websiteUrl && (
                <a
                  href={ad.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" /> Site Web
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {/* Comments */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5" /> Commentaires ({ad._count.comments})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user && (
              <form onSubmit={handleComment} className="flex gap-2 mb-4">
                <Input
                  placeholder="Partagez votre expérience..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  maxLength={2000}
                />
                <Button type="submit" disabled={!commentText.trim()}>
                  Publier
                </Button>
              </form>
            )}
            {comments.length === 0 ? (
              <p className="text-muted-foreground">Aucun commentaire. Soyez le premier à partager !</p>
            ) : (
              <div className="space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">
                        {c.user.displayName || "Anonyme"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                    <p className="text-sm">{c.content}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Contributions sous licence CC BY-SA 4.0.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
