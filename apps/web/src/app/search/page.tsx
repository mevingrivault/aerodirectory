"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Fuel, Utensils, ChevronLeft, ChevronRight, MapPin, Home, Bike, Bus } from "lucide-react";
import { AerodromeTypeIcon } from "@/components/ui/aerodrome-type-icon";

interface AerodromeResult {
  id: string;
  name: string;
  icaoCode: string | null;
  city: string | null;
  region: string | null;
  status: string;
  aerodromeType: string;
  hasRestaurant: boolean;
  hasTransport: boolean;
  hasBikes: boolean;
  hasAccommodation: boolean;
  nightOperations: boolean;
  latitude: number;
  longitude: number;
  elevation: number | null;
  runways: { identifier: string; length: number; surface: string }[];
  fuels: { type: string; available: boolean }[];
  _count: { visits: number; comments: number };
  distanceKm?: number;
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

const FUEL_LABELS: Record<string, string> = {
  AVGAS_100LL: "100LL",
  SP98: "SP98",
  MOGAS: "Mogas",
  JET_A1: "Jet A-1",
};

const SURFACE_LABELS: Record<string, string> = {
  ASPHALT: "Asphalte",
  CONCRETE: "Béton",
  GRASS: "Herbe",
  GRAVEL: "Gravier",
  DIRT: "Terre",
  WATER: "Eau",
  OTHER: "Autre",
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [useLocation, setUseLocation] = useState(false);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);

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
      if (next[key] === value) delete next[key];
      else next[key] = value;
      return next;
    });
    setPage(1);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Recherche</h1>

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
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4">
        {(
          [
            { key: "location",        label: "À proximité",   icon: MapPin,    active: useLocation,                     onClick: handleNearby },
            { key: "hasRestaurant",   label: "Restaurant",    icon: Utensils,  active: !!filters["hasRestaurant"],      onClick: () => toggleFilter("hasRestaurant", "true") },
            { key: "hasAccommodation",label: "Hébergement",   icon: Home,      active: !!filters["hasAccommodation"],   onClick: () => toggleFilter("hasAccommodation", "true") },
            { key: "fuel100LL",       label: "100LL",         icon: Fuel,      active: filters["fuel"] === "AVGAS_100LL", onClick: () => toggleFilter("fuel", "AVGAS_100LL") },
            { key: "fuelSP98",        label: "SP98",          icon: Fuel,      active: filters["fuel"] === "SP98",      onClick: () => toggleFilter("fuel", "SP98") },
            { key: "hasBikes",        label: "Vélo",          icon: Bike,      active: !!filters["hasBikes"],           onClick: () => toggleFilter("hasBikes", "true") },
            { key: "hasTransport",    label: "Transport",     icon: Bus,       active: !!filters["hasTransport"],       onClick: () => toggleFilter("hasTransport", "true") },
          ] as const
        ).map(({ key, label, icon: Icon, active, onClick }) => (
          <button
            key={key}
            onClick={onClick}
            className={`shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
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
                    <AerodromeTypeIcon type={ad.aerodromeType} className="h-6 w-6 text-primary" />
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
                    {/* Caractéristiques — visibles sur mobile, masquées sur sm+ (affichées à droite) */}
                    {(ad.hasRestaurant || ad.hasAccommodation || ad.hasTransport || ad.hasBikes || (ad.fuels?.some((f) => f.available))) && (
                      <div className="mt-1.5 flex sm:hidden flex-wrap gap-1">
                        {ad.hasRestaurant && (
                          <Badge variant="outline" className="text-xs"><Utensils className="mr-1 h-3 w-3" />Restaurant</Badge>
                        )}
                        {ad.hasAccommodation && (
                          <Badge variant="outline" className="text-xs"><Home className="mr-1 h-3 w-3" />Hébergement</Badge>
                        )}
                        {ad.hasTransport && (
                          <Badge variant="outline" className="text-xs"><Bus className="mr-1 h-3 w-3" />Transport</Badge>
                        )}
                        {ad.hasBikes && (
                          <Badge variant="outline" className="text-xs"><Bike className="mr-1 h-3 w-3" />Vélos</Badge>
                        )}
                        {ad.fuels?.filter((f) => f.available).map((f) => (
                          <Badge key={f.type} variant="outline" className="text-xs">
                            <Fuel className="mr-1 h-3 w-3" />{FUEL_LABELS[f.type] ?? f.type}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="mt-1 hidden sm:flex flex-wrap gap-1.5">
                      {ad.runways.map((r, i) => (
                        <span key={`${r.identifier}-${i}`} className="text-xs text-muted-foreground">
                          {r.identifier} ({r.length}m, {SURFACE_LABELS[r.surface] ?? r.surface})
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* Caractéristiques — masquées sur mobile, visibles sur sm+ */}
                  <div className="hidden sm:flex flex-col items-end gap-1.5">
                    {ad.hasRestaurant && (
                      <Badge variant="outline" className="text-xs">
                        <Utensils className="mr-1 h-3 w-3" /> Restaurant
                      </Badge>
                    )}
                    {ad.hasAccommodation && (
                      <Badge variant="outline" className="text-xs">
                        <Home className="mr-1 h-3 w-3" /> Hébergement
                      </Badge>
                    )}
                    {ad.hasTransport && (
                      <Badge variant="outline" className="text-xs">
                        <Bus className="mr-1 h-3 w-3" /> Transport
                      </Badge>
                    )}
                    {ad.hasBikes && (
                      <Badge variant="outline" className="text-xs">
                        <Bike className="mr-1 h-3 w-3" /> Vélos
                      </Badge>
                    )}
                    {ad.fuels?.filter((f) => f.available).map((f) => (
                      <Badge key={f.type} variant="outline" className="text-xs">
                        <Fuel className="mr-1 h-3 w-3" />
                        {FUEL_LABELS[f.type] ?? f.type}
                      </Badge>
                    ))}
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
    </div>
  );
}
