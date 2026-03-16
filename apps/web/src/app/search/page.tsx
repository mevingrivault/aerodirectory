"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Fuel, Utensils, Plane, ChevronLeft, ChevronRight } from "lucide-react";

interface AerodromeResult {
  id: string;
  name: string;
  icaoCode: string | null;
  city: string | null;
  region: string | null;
  status: string;
  hasRestaurant: boolean;
  nightOperations: boolean;
  latitude: number;
  longitude: number;
  runways: { identifier: string; length: number; surface: string }[];
  fuels: { type: string; available: boolean }[];
  _count: { visits: number; comments: number };
  distanceKm?: number;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const searchParams: Record<string, string> = {
    page: page.toString(),
    limit: "20",
    ...filters,
  };
  if (query) searchParams["q"] = query;

  const { data, isLoading } = useQuery({
    queryKey: ["search", query, page, filters],
    queryFn: () =>
      apiClient.get<AerodromeResult[]>("/search", searchParams),
  });

  const results = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Search Aerodromes</h1>

      {/* Search bar */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search by name, ICAO code, or city..."
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
          variant={filters["hasRestaurant"] ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setFilters((f) => {
              const next = { ...f };
              if (next["hasRestaurant"]) delete next["hasRestaurant"];
              else next["hasRestaurant"] = "true";
              return next;
            });
            setPage(1);
          }}
        >
          <Utensils className="mr-1 h-3 w-3" /> Restaurant
        </Button>
        <Button
          variant={filters["fuel"] ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setFilters((f) => {
              const next = { ...f };
              if (next["fuel"]) delete next["fuel"];
              else next["fuel"] = "AVGAS_100LL";
              return next;
            });
            setPage(1);
          }}
        >
          <Fuel className="mr-1 h-3 w-3" /> 100LL Fuel
        </Button>
        <Button
          variant={filters["nightOperations"] ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setFilters((f) => {
              const next = { ...f };
              if (next["nightOperations"]) delete next["nightOperations"];
              else next["nightOperations"] = "true";
              return next;
            });
            setPage(1);
          }}
        >
          Night Ops
        </Button>
        {filters["minRunwayLength"] ? (
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              setFilters((f) => {
                const next = { ...f };
                delete next["minRunwayLength"];
                return next;
              });
              setPage(1);
            }}
          >
            Min {filters["minRunwayLength"]}m runway
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
            Min 800m Runway
          </Button>
        )}
      </div>

      {/* Results count */}
      {meta && (
        <p className="text-sm text-muted-foreground mb-4">
          {meta.total} aerodrome{meta.total !== 1 ? "s" : ""} found
        </p>
      )}

      {/* Results list */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Searching...</div>
      ) : results.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No aerodromes found. Try adjusting your search.
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
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{ad.name}</span>
                      {ad.icaoCode && (
                        <Badge variant="secondary">{ad.icaoCode}</Badge>
                      )}
                      <Badge
                        variant={ad.status === "OPEN" ? "success" : "warning"}
                      >
                        {ad.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {[ad.city, ad.region].filter(Boolean).join(", ")}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {ad.runways.map((r) => (
                        <span
                          key={r.identifier}
                          className="text-xs text-muted-foreground"
                        >
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
                    {ad.fuels.some((f) => f.available) && (
                      <Badge variant="outline">
                        <Fuel className="mr-1 h-3 w-3" /> Fuel
                      </Badge>
                    )}
                    {ad.distanceKm !== undefined && (
                      <span className="text-xs text-muted-foreground">
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
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
