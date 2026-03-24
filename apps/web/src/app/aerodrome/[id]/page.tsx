"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DISCLAIMER, FUEL_LABELS } from "@aerodirectory/shared";
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
  Heart,
  MessageSquare,
  ArrowLeft,
  Navigation,
  FileText,
  TriangleAlert,
  Coffee,
  Beer,
} from "lucide-react";
import { useState, useEffect } from "react";
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
  aerodromeType: string;
  fuels?: { type: string; available: boolean }[];
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; displayName: string | null };
}

interface NearbyRestaurant {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  accessibility: "walkable" | "nearby";
  amenity: string; // "restaurant" | "cafe" | "bar"
  cuisine: string[];
  isOpenNow: boolean | null;
  openingHours: string | null;
  phone: string | null;
  website: string | null;
  address: { street: string | null; postcode: string | null; city: string | null };
  takeaway: boolean | null;
  delivery: boolean | null;
  outdoorSeating: boolean | null;
  osmType: string;
  osmId: number;
}

interface NearbyRestaurantsResult {
  aerodromeId: string;
  radiusMeters: number;
  restaurants: NearbyRestaurant[];
  pilotServices: {
    restaurant: {
      available: boolean;
      source: string;
      walkableThresholdMeters: number;
      matchingPlacesCount: number;
    };
  };
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
        radiusKm: "100",
        limit: "20",
      }),
    enabled: !!ad,
  });

  const noFuel = ad ? ad.fuels.length === 0 || ad.fuels.every((f) => !f.available) : false;

  const fmtDist = (km: number) => `${km.toFixed(0)} km / ${(km * 0.539957).toFixed(0)} NM`;

  // Find nearest aerodrome with fuel when current one has none
  const { data: nearbyFuelRes } = useQuery({
    queryKey: ["nearby-fuel", ad?.latitude, ad?.longitude],
    queryFn: () =>
      apiClient.get<NearbyAerodrome[]>("/aerodromes/nearby", {
        lat: ad!.latitude.toString(),
        lng: ad!.longitude.toString(),
        radiusKm: "200",
        limit: "2",
        hasFuel: "true",
      }),
    enabled: !!ad && noFuel,
  });

  const [restaurantRadius, setRestaurantRadius] = useState(3000);

  // Always fetch at 3 km — pilot services derivation needs the full walkable zone.
  // The radius selector filters the displayed list client-side.
  const { data: restaurantsRes, isLoading: restaurantsLoading, isError: restaurantsError } = useQuery({
    queryKey: ["restaurants", id],
    queryFn: () =>
      apiClient.get<NearbyRestaurantsResult>(`/aerodromes/${id}/restaurants`, {
        radiusMeters: "3000",
      }),
    enabled: !!ad,
    staleTime: 6 * 60 * 60 * 1000,
  });

  const { data: visitsRes, refetch: refetchVisit } = useQuery({
    queryKey: ["visits"],
    queryFn: () => apiClient.get<{ aerodromeId: string; status: string }[]>("/visits"),
    enabled: !!user,
  });

  const currentVisitStatus = visitsRes?.data?.find((v) => v.aerodromeId === id)?.status ?? null;

  // Auto-mark as SEEN on page open (don't downgrade VISITED/FAVORITE)
  useEffect(() => {
    if (user && currentVisitStatus === null) {
      apiClient.put(`/visits/${id}`, { status: "SEEN" }).then(() => refetchVisit());
    }
  }, [user, id, currentVisitStatus]);

  const comments = commentsRes?.data ?? [];
  const allNearby = (nearbyRes?.data ?? []).filter((n) => n.id !== id);
  const nearbyAerodromes = allNearby.filter((n) => n.aerodromeType !== "ULTRALIGHT_FIELD").slice(0, 6);
  const nearbyUlm = allNearby.filter((n) => n.aerodromeType === "ULTRALIGHT_FIELD").slice(0, 6);

  const handleVisit = async (status: string) => {
    let nextStatus = status;
    if (status === "FAVORITE" && currentVisitStatus === "FAVORITE") nextStatus = "VISITED";
    else if (status === "VISITED" && currentVisitStatus === "VISITED") nextStatus = "SEEN";
    await apiClient.put(`/visits/${id}`, { status: nextStatus });
    refetchVisit();
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

  const restaurantFromNearby = restaurantsRes?.data?.pilotServices?.restaurant?.available ?? false;

  const amenities = [
    { icon: Utensils, label: "Restaurant", active: ad.hasRestaurant || restaurantFromNearby },
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

        {/* Action buttons */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {/* VAC link */}
          {ad.icaoCode && (() => {
            const pattern = process.env.NEXT_PUBLIC_VAC_URL_PATTERN;
            if (!pattern) return null;
            const vacUrl = pattern.replace("{OACI-CODE}", ad.icaoCode);
            return (
              <a href={vacUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline">
                  <FileText className="mr-1 h-4 w-4" /> Carte VAC
                </Button>
              </a>
            );
          })()}
        </div>

        {/* Visit buttons (authenticated only) */}
        {user && (
          <div className="flex gap-2 mt-2">
            {(() => {
              const isVisited = currentVisitStatus === "VISITED" || currentVisitStatus === "FAVORITE";
              const isFavorite = currentVisitStatus === "FAVORITE";
              return (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className={isVisited ? "border-green-500 text-green-600 bg-green-50 hover:bg-green-100 hover:text-green-700" : ""}
                    onClick={() => handleVisit("VISITED")}
                  >
                    <Star className="mr-1 h-4 w-4" fill={isVisited ? "currentColor" : "none"} /> Visité
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className={isFavorite ? "border-yellow-500 text-yellow-600 bg-yellow-50 hover:bg-yellow-100 hover:text-yellow-700" : ""}
                    onClick={() => handleVisit("FAVORITE")}
                  >
                    <Heart className="mr-1 h-4 w-4" fill={isFavorite ? "currentColor" : "none"} /> Favori
                  </Button>
                </>
              );
            })()}
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
            {noFuel ? (
              <div className="space-y-3">
                <p className="text-muted-foreground">Aucune donnée carburant disponible.</p>
                {(() => {
                  const nearest = nearbyFuelRes?.data?.find((n) => n.id !== id);
                  if (!nearest) return null;
                  const fuels = nearest.fuels?.filter((f) => f.available).map((f) => FUEL_LABELS[f.type] ?? f.type).join(", ");
                  return (
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                      <p className="font-medium mb-1">Carburant le plus proche :</p>
                      <Link
                        href={`/aerodrome/${nearest.id}`}
                        className="flex items-center justify-between hover:underline"
                      >
                        <span>
                          {nearest.name}
                          {nearest.icaoCode && <span className="ml-1 text-blue-600">({nearest.icaoCode})</span>}
                          {fuels && <span className="ml-2 text-xs text-blue-600">{fuels}</span>}
                        </span>
                        <span className="font-medium shrink-0 ml-2">{fmtDist(nearest.distanceKm)}</span>
                      </Link>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="space-y-2">
                {ad.fuels.map((f) => (
                  <div key={f.id} className="flex items-center justify-between">
                    <span>
                      {FUEL_LABELS[f.type] ?? f.type}
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
                      {fmtDist(n.distanceKm)}
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Nearby ULM */}
        {nearbyUlm.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Navigation className="h-5 w-5" /> Bases ULM à Proximité
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {nearbyUlm.map((n) => (
                  <Link
                    key={n.id}
                    href={`/aerodrome/${n.id}`}
                    className="flex items-center justify-between rounded-md border p-2 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm">{n.name}</span>
                    <span className="text-xs font-medium text-primary">
                      {fmtDist(n.distanceKm)}
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Nearby Restaurants, Cafes & Bars */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Utensils className="h-5 w-5" /> Restaurants & cafés à proximité
              </CardTitle>
              {/* Radius selector */}
              <div className="flex gap-1 text-xs">
                {[1000, 3000, 5000].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRestaurantRadius(r)}
                    className={`rounded px-2 py-1 border transition-colors ${
                      restaurantRadius === r
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {r / 1000} km
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {restaurantsLoading ? (
              <p className="text-muted-foreground text-sm">Chargement...</p>
            ) : restaurantsError ? (
              <p className="text-muted-foreground text-sm">
                Impossible de charger les établissements pour le moment.
              </p>
            ) : !(restaurantsRes?.data?.restaurants ?? []).filter((r) => r.distanceMeters <= restaurantRadius).length ? (
              <p className="text-muted-foreground text-sm">
                Aucun établissement trouvé dans un rayon de {restaurantRadius / 1000} km.
              </p>
            ) : (
              <div className="space-y-2">
                {restaurantsRes!.data.restaurants
                  .filter((r) => r.distanceMeters <= restaurantRadius)
                  .map((r) => {
                  const dist =
                    r.distanceMeters < 1000
                      ? `${r.distanceMeters} m`
                      : `${(r.distanceMeters / 1000).toFixed(1)} km`;
                  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}`;
                  const addr = [r.address.street, r.address.postcode, r.address.city]
                    .filter(Boolean)
                    .join(", ");

                  const AmenityIcon =
                    r.amenity === "cafe" ? Coffee : r.amenity === "bar" ? Beer : Utensils;

                  const amenityLabel =
                    r.amenity === "cafe" ? "Café" : r.amenity === "bar" ? "Bar" : "Restaurant";

                  return (
                    <div
                      key={r.id}
                      className="rounded-md border p-3 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        {/* Name + type icon */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <AmenityIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm">{r.name}</span>
                          {r.cuisine.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {r.cuisine.join(", ")}
                            </span>
                          )}
                        </div>

                        {/* Address */}
                        {addr && (
                          <p className="text-xs text-muted-foreground mt-0.5 ml-5">{addr}</p>
                        )}

                        {/* Opening hours text */}
                        {r.openingHours && (
                          <p className="text-xs text-muted-foreground mt-0.5 ml-5">
                            {r.openingHours}
                          </p>
                        )}

                        {/* Badges */}
                        <div className="flex gap-1.5 mt-1.5 ml-5 flex-wrap">
                          {/* Accessibility badge */}
                          {r.accessibility === "walkable" ? (
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                              À pied
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              Proche
                            </span>
                          )}
                          {/* Open now badge */}
                          {r.isOpenNow === true && (
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                              Ouvert maintenant
                            </span>
                          )}
                          {r.isOpenNow === false && (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600">
                              Fermé
                            </span>
                          )}
                          {/* Amenity type badge (not shown for restaurant since it's obvious) */}
                          {r.amenity !== "restaurant" && (
                            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {amenityLabel}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right column: distance + OSM link */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-xs font-medium text-primary">{dist}</span>
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" /> Google Maps
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

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

        {/* VAC Chart */}
        {ad.icaoCode && (() => {
          const pattern = process.env.NEXT_PUBLIC_VAC_URL_PATTERN;
          if (!pattern) return null;
          const vacUrl = pattern.replace("{OACI-CODE}", ad.icaoCode);
          return (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5" /> Carte VAC — {ad.icaoCode}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Disclaimer */}
                <div className="flex gap-2 rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
                  <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>
                    Cette carte est fournie à titre informatif uniquement et peut ne pas être à jour.{" "}
                    <strong>Consultez toujours la documentation officielle AIP France</strong> publiée
                    par le SIA avant tout vol. Les données présentées ne sauraient engager la
                    responsabilité d'AéroDirectory.
                  </p>
                </div>

                {/* PDF embed */}
                <div className="w-full overflow-hidden rounded-md border bg-muted" style={{ height: "600px" }}>
                  <iframe
                    src={vacUrl}
                    className="h-full w-full"
                    title={`Carte VAC ${ad.icaoCode}`}
                  />
                </div>

                {/* Fallback link */}
                <a
                  href={vacUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" /> Ouvrir la carte VAC sur le site du SIA
                </a>
              </CardContent>
            </Card>
          );
        })()}

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
