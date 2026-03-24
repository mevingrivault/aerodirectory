"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Fuel, Utensils, Plane, ChevronLeft, ChevronRight, MapPin, Coffee, ExternalLink } from "lucide-react";

interface AerodromeResult {
  id: string;
  name: string;
  icaoCode: string | null;
  city: string | null;
  region: string | null;
  status: string;
  aerodromeType: string;
  hasRestaurant: boolean;
  nightOperations: boolean;
  latitude: number;
  longitude: number;
  elevation: number | null;
  runways: { identifier: string; length: number; surface: string }[];
  fuels: { type: string; available: boolean }[];
  _count: { visits: number; comments: number };
  distanceKm?: number;
}

interface RestaurantResult {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  accessibility: "walkable" | "nearby";
  amenity: string;
  cuisine: string[];
  isOpenNow: boolean | null;
  openingHours: string | null;
  phone: string | null;
  website: string | null;
  address: { street: string | null; postcode: string | null; city: string | null };
}

const TYPE_LABELS: Record<string, string> = {
  SMALL_AIRPORT: "Aérodrome",
  INTERNATIONAL_AIRPORT: "International",
  GLIDER_SITE: "Vol à voile",
  ULTRALIGHT_FIELD: "ULM",
  HELIPORT: "Héliport",
  MILITARY: "Militaire",
  SEAPLANE_BASE: "Hydravion",
  OTHER: "Autre",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "OUVERT",
  CLOSED: "FERMÉ",
};

export default function SearchPage() {
  const [tab, setTab] = useState<"aerodromes" | "restaurants">("aerodromes");

  // ─── Aerodrome search state ─────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [useLocation, setUseLocation] = useState(false);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);

  // ─── Restaurant search state ────────────────────────────────────────────
  const [restQuery, setRestQuery] = useState("");
  const [restRadius, setRestRadius] = useState(5000);
  const [restLat, setRestLat] = useState<number | null>(null);
  const [restLon, setRestLon] = useState<number | null>(null);
  const [restLocating, setRestLocating] = useState(false);

  const searchParams: Record<string, string> = {
    page: page.toString(),
    limit: "20",
    ...filters,
  };
  if (query) searchParams["q"] = query;
  if (useLocation && userLat !== null && userLng !== null) {
    searchParams["lat"] = userLat.toString();
    searchParams["lng"] = userLng.toString();
    searchParams["radiusKm"] = "200";
    searchParams["sortBy"] = "distance";
  }

  const { data, isLoading } = useQuery({
    queryKey: ["search", query, page, filters, useLocation, userLat, userLng],
    queryFn: () =>
      apiClient.get<AerodromeResult[]>("/search", searchParams),
  });

  const results = data?.data ?? [];
  const meta = data?.meta;

  const restSearchParams: Record<string, string> = {
    lat: restLat?.toString() ?? "",
    lon: restLon?.toString() ?? "",
    radiusMeters: restRadius.toString(),
  };
  if (restQuery) restSearchParams["q"] = restQuery;

  const { data: restData, isLoading: restLoading } = useQuery({
    queryKey: ["restaurants-search", restLat, restLon, restRadius, restQuery],
    queryFn: () => apiClient.get<RestaurantResult[]>("/restaurants/search", restSearchParams),
    enabled: restLat !== null && restLon !== null,
  });

  const restResults = restData?.data ?? [];

  const handleRestLocate = () => {
    setRestLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRestLat(pos.coords.latitude);
        setRestLon(pos.coords.longitude);
        setRestLocating(false);
      },
      () => {
        alert("Impossible d'obtenir votre position. Activez la géolocalisation.");
        setRestLocating(false);
      },
    );
  };

  const handleNearby = () => {
    if (useLocation) {
      setUseLocation(false);
      return;
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
          setUseLocation(true);
          setPage(1);
        },
        () => {
          alert("Impossible d'obtenir votre position. Activez la géolocalisation.");
        },
      );
    }
  };

  const toggleFilter = (key: string, value: string) => {
    setFilters((f) => {
      const next = { ...f };
      if (next[key]) delete next[key];
      else next[key] = value;
      return next;
    });
    setPage(1);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Recherche</h1>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b mb-6">
        <button
          onClick={() => setTab("aerodromes")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "aerodromes"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Plane className="h-4 w-4" /> Aérodromes
        </button>
        <button
          onClick={() => setTab("restaurants")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "restaurants"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Utensils className="h-4 w-4" /> Restaurants & cafés
        </button>
      </div>

      {/* ── Aerodromes tab ─────────────────────────────────────────────────── */}
      {tab === "aerodromes" && (
        <>
          {/* Search bar */}
          <div className="flex gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Rechercher par nom, code OACI ou ville..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-6">
            <Button
              variant={useLocation ? "default" : "outline"}
              size="sm"
              onClick={handleNearby}
            >
              <MapPin className="mr-1 h-3 w-3" /> À proximité
            </Button>
            <Button
              variant={filters["hasRestaurant"] ? "default" : "outline"}
              size="sm"
              onClick={() => toggleFilter("hasRestaurant", "true")}
            >
              <Utensils className="mr-1 h-3 w-3" /> Restaurant
            </Button>
            <Button
              variant={filters["fuel"] ? "default" : "outline"}
              size="sm"
              onClick={() => toggleFilter("fuel", "AVGAS_100LL")}
            >
              <Fuel className="mr-1 h-3 w-3" /> Carburant 100LL
            </Button>
            <Button
              variant={filters["nightOperations"] ? "default" : "outline"}
              size="sm"
              onClick={() => toggleFilter("nightOperations", "true")}
            >
              Vols de nuit
            </Button>
            <Button
              variant={filters["aerodromeType"] ? "default" : "outline"}
              size="sm"
              onClick={() => toggleFilter("aerodromeType", "SMALL_AIRPORT")}
            >
              <Plane className="mr-1 h-3 w-3" /> Petits Aérodromes
            </Button>
            {filters["minRunwayLength"] ? (
              <Button
                variant="default"
                size="sm"
                onClick={() => toggleFilter("minRunwayLength", "800")}
              >
                Piste min. {filters["minRunwayLength"]}m
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilters((f) => ({ ...f, minRunwayLength: "800" }));
                  setPage(1);
                }}
              >
                Piste min. 800m
              </Button>
            )}
          </div>

          {/* Results count */}
          {meta && (
            <p className="text-sm text-muted-foreground mb-4">
              {meta.total} aérodrome{meta.total !== 1 ? "s" : ""} trouvé{meta.total !== 1 ? "s" : ""}
            </p>
          )}

          {/* Results list */}
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Recherche en cours...</div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              Aucun aérodrome trouvé. Modifiez vos critères de recherche.
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((ad) => (
                <Link key={ad.id} href={`/aerodrome/${ad.id}`}>
                  <Card className="transition-shadow hover:shadow-md">
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                        <Plane className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold truncate">{ad.name}</span>
                          {ad.icaoCode && (
                            <Badge variant="secondary">{ad.icaoCode}</Badge>
                          )}
                          <Badge variant={ad.status === "OPEN" ? "success" : "warning"}>
                            {STATUS_LABELS[ad.status] ?? ad.status}
                          </Badge>
                          {ad.aerodromeType && ad.aerodromeType !== "SMALL_AIRPORT" && (
                            <Badge variant="outline">
                              {TYPE_LABELS[ad.aerodromeType] || ad.aerodromeType}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {[ad.city, ad.region].filter(Boolean).join(", ")}
                          {ad.elevation ? ` — ${ad.elevation} ft` : ""}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {ad.runways.map((r, i) => (
                            <span key={`${r.identifier}-${i}`} className="text-xs text-muted-foreground">
                              {r.identifier} ({r.length}m, {r.surface})
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="hidden sm:flex flex-col items-end gap-1">
                        {ad.hasRestaurant && (
                          <Badge variant="outline">
                            <Utensils className="mr-1 h-3 w-3" /> Restaurant
                          </Badge>
                        )}
                        {ad.fuels?.some((f) => f.available) && (
                          <Badge variant="outline">
                            <Fuel className="mr-1 h-3 w-3" /> Carburant
                          </Badge>
                        )}
                        {ad.distanceKm !== undefined && (
                          <span className="text-xs font-medium text-primary">
                            {ad.distanceKm.toFixed(0)} km
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} sur {meta.totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Restaurants tab ────────────────────────────────────────────────── */}
      {tab === "restaurants" && (
        <>
          {/* Location + search bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Button
              variant={restLat !== null ? "default" : "outline"}
              size="sm"
              onClick={handleRestLocate}
              disabled={restLocating}
            >
              <MapPin className="mr-1 h-3 w-3" />
              {restLocating ? "Localisation..." : restLat !== null ? "Position activée" : "Utiliser ma position"}
            </Button>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Nom, cuisine, ville..."
                value={restQuery}
                onChange={(e) => setRestQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Radius selector */}
          <div className="flex items-center gap-2 mb-6">
            <span className="text-sm text-muted-foreground">Rayon :</span>
            {[2000, 5000, 10000].map((r) => (
              <button
                key={r}
                onClick={() => setRestRadius(r)}
                className={`rounded px-2 py-1 text-xs border transition-colors ${
                  restRadius === r
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {r / 1000} km
              </button>
            ))}
          </div>

          {/* Results */}
          {restLat === null ? (
            <div className="py-12 text-center text-muted-foreground">
              Activez votre position pour rechercher des restaurants à proximité.
            </div>
          ) : restLoading ? (
            <div className="py-12 text-center text-muted-foreground">Recherche en cours...</div>
          ) : restResults.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              Aucun établissement trouvé dans un rayon de {restRadius / 1000} km.
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                {restResults.length} établissement{restResults.length !== 1 ? "s" : ""} trouvé{restResults.length !== 1 ? "s" : ""}
              </p>
              <div className="space-y-2">
                {restResults.map((r) => {
                  const dist = r.distanceMeters < 1000
                    ? `${r.distanceMeters} m`
                    : `${(r.distanceMeters / 1000).toFixed(1)} km`;
                  const addr = [r.address.street, r.address.postcode, r.address.city]
                    .filter(Boolean)
                    .join(", ");
                  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}`;
                  const AmenityIcon = r.amenity === "cafe" ? Coffee : Utensils;
                  const amenityLabel = r.amenity === "cafe" ? "Café" : "Restaurant";

                  return (
                    <div key={r.id} className="rounded-md border p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <AmenityIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm">{r.name}</span>
                          {r.cuisine.length > 0 && (
                            <span className="text-xs text-muted-foreground">{r.cuisine.join(", ")}</span>
                          )}
                        </div>
                        {addr && (
                          <p className="text-xs text-muted-foreground mt-0.5 ml-5">{addr}</p>
                        )}
                        {r.openingHours && (
                          <p className="text-xs text-muted-foreground mt-0.5 ml-5">{r.openingHours}</p>
                        )}
                        <div className="flex gap-1.5 mt-1.5 ml-5 flex-wrap">
                          {r.accessibility === "walkable" ? (
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                              À pied
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              Proche
                            </span>
                          )}
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
                          {r.amenity !== "restaurant" && (
                            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {amenityLabel}
                            </span>
                          )}
                        </div>
                      </div>
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
            </>
          )}
        </>
      )}
    </div>
  );
}

