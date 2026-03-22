"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNm, formatFlightTime, formatEuros } from "@/lib/utils";
import { Navigation, Plane, Plus, Trash2, Search, MapPin } from "lucide-react";
import Link from "next/link";
import type { PlannerResult } from "@aerodirectory/shared";

interface AircraftProfile {
  id: string;
  name: string;
  tas: number;
  fuelConsumption: number;
  hourlyCost: number;
  fuelRange: number;
  minRunwayLength: number;
  allowedSurfaces: string[];
}

interface AerodromeOption {
  id: string;
  name: string;
  icaoCode: string | null;
  latitude: number;
  longitude: number;
  city: string | null;
}

const SORT_OPTIONS = [
  { value: "time", label: "Temps de vol" },
  { value: "distance", label: "Distance" },
  { value: "cost", label: "Coût estimé" },
];

export default function PlannerPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Profile form state
  const [showForm, setShowForm] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    tas: "",
    fuelConsumption: "",
    hourlyCost: "",
    fuelRange: "",
    minRunwayLength: "",
  });

  // Planning state
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("time");
  const [results, setResults] = useState<PlannerResult[] | null>(null);
  const [calcError, setCalcError] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);

  // Departure aerodrome search
  const [departureSearch, setDepartureSearch] = useState("");
  const [departureAerodrome, setDepartureAerodrome] = useState<AerodromeOption | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const { data: profilesRes } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => apiClient.get<AircraftProfile[]>("/planner/profiles"),
    enabled: !!user,
  });

  const { data: suggestionsRes } = useQuery({
    queryKey: ["aerodrome-search", departureSearch],
    queryFn: () =>
      apiClient.get<AerodromeOption[]>("/aerodromes/map", { q: departureSearch }),
    enabled: departureSearch.length >= 2 && !departureAerodrome,
  });

  const profiles = profilesRes?.data ?? [];
  const suggestions = (suggestionsRes?.data ?? []).slice(0, 8);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const createProfileMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post("/planner/profiles", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      setShowForm(false);
      setProfileForm({
        name: "",
        tas: "",
        fuelConsumption: "",
        hourlyCost: "",
        fuelRange: "",
        minRunwayLength: "",
      });
    },
  });

  const deleteProfileMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/planner/profiles/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["profiles"] }),
  });

  const handleCreateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    createProfileMutation.mutate({
      name: profileForm.name,
      tas: parseFloat(profileForm.tas),
      fuelConsumption: parseFloat(profileForm.fuelConsumption),
      hourlyCost: parseFloat(profileForm.hourlyCost),
      fuelRange: parseFloat(profileForm.fuelRange),
      minRunwayLength: parseInt(profileForm.minRunwayLength),
      allowedSurfaces: ["ASPHALT", "CONCRETE", "GRASS"],
    });
  };

  const handleSelectDeparture = (ad: AerodromeOption) => {
    setDepartureAerodrome(ad);
    setDepartureSearch(ad.icaoCode ? `${ad.icaoCode} — ${ad.name}` : ad.name);
    setShowSuggestions(false);
  };

  const handleClearDeparture = () => {
    setDepartureAerodrome(null);
    setDepartureSearch("");
  };

  const handleCalculate = async () => {
    if (!selectedProfileId || !departureAerodrome) return;
    setIsCalculating(true);
    setCalcError("");
    try {
      const res = await apiClient.post<PlannerResult[]>("/planner/calculate", {
        profileId: selectedProfileId,
        departureLat: departureAerodrome.latitude,
        departureLng: departureAerodrome.longitude,
        sortBy,
      });
      setResults(res.data);
    } catch (err: unknown) {
      setCalcError(err instanceof Error ? err.message : "Erreur lors du calcul des routes.");
      setResults(null);
    } finally {
      setIsCalculating(false);
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <Navigation className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">Planificateur de Vol</h1>
        <p className="text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">
            Connectez-vous
          </Link>{" "}
          pour utiliser le planificateur de vol.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
        <Navigation className="h-8 w-8 text-primary" />
        Planificateur de Vol
      </h1>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Profiles & Departure */}
        <div className="space-y-6">
          {/* Aircraft Profiles */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Profils Aéronef</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
                <Plus className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {showForm && (
                <form onSubmit={handleCreateProfile} className="space-y-3 mb-4 rounded-md border p-3">
                  <Input
                    placeholder="Nom de l'aéronef (ex. C172)"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      placeholder="TAS (kts)"
                      value={profileForm.tas}
                      onChange={(e) => setProfileForm((f) => ({ ...f, tas: e.target.value }))}
                      required
                    />
                    <Input
                      type="number"
                      placeholder="Conso (L/h)"
                      value={profileForm.fuelConsumption}
                      onChange={(e) => setProfileForm((f) => ({ ...f, fuelConsumption: e.target.value }))}
                      required
                    />
                    <Input
                      type="number"
                      placeholder="Coût (€/h)"
                      value={profileForm.hourlyCost}
                      onChange={(e) => setProfileForm((f) => ({ ...f, hourlyCost: e.target.value }))}
                      required
                    />
                    <Input
                      type="number"
                      placeholder="Autonomie (NM)"
                      value={profileForm.fuelRange}
                      onChange={(e) => setProfileForm((f) => ({ ...f, fuelRange: e.target.value }))}
                      required
                    />
                    <Input
                      type="number"
                      placeholder="Piste min. (m)"
                      value={profileForm.minRunwayLength}
                      onChange={(e) => setProfileForm((f) => ({ ...f, minRunwayLength: e.target.value }))}
                      required
                    />
                  </div>
                  <Button type="submit" size="sm" className="w-full">
                    Enregistrer
                  </Button>
                </form>
              )}

              {profiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Créez un profil aéronef pour commencer à planifier.
                </p>
              ) : (
                <div className="space-y-2">
                  {profiles.map((p) => (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between rounded-md border p-3 cursor-pointer transition-colors ${
                        selectedProfileId === p.id ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                      }`}
                      onClick={() => setSelectedProfileId(p.id)}
                    >
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          TAS {p.tas}kt · {p.fuelConsumption}L/h · {formatEuros(p.hourlyCost)}/h · {p.fuelRange}NM
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteProfileMutation.mutate(p.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Departure & options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Point de Départ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Aerodrome search */}
              <div ref={searchRef} className="relative">
                <label className="text-sm font-medium mb-1 block">Aérodrome de départ</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Rechercher par nom ou ICAO..."
                    value={departureSearch}
                    onChange={(e) => {
                      setDepartureSearch(e.target.value);
                      setDepartureAerodrome(null);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => departureSearch.length >= 2 && setShowSuggestions(true)}
                  />
                  {departureAerodrome && (
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                      onClick={handleClearDeparture}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {showSuggestions && suggestions.length > 0 && !departureAerodrome && (
                  <div className="absolute z-20 w-full mt-1 rounded-md border bg-background shadow-lg">
                    {suggestions.map((ad) => (
                      <button
                        key={ad.id}
                        className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors"
                        onMouseDown={() => handleSelectDeparture(ad)}
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium">{ad.name}</span>
                          {ad.icaoCode && (
                            <Badge variant="secondary" className="text-xs">{ad.icaoCode}</Badge>
                          )}
                        </div>
                        {ad.city && (
                          <div className="text-xs text-muted-foreground ml-5">{ad.city}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {departureAerodrome && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs text-primary">
                  <MapPin className="inline h-3 w-3 mr-1" />
                  {departureAerodrome.latitude.toFixed(4)}°N, {departureAerodrome.longitude.toFixed(4)}°E
                </div>
              )}

              {/* Sort */}
              <div>
                <label className="text-sm font-medium mb-1 block">Trier par</label>
                <div className="flex gap-1">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setSortBy(opt.value)}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                        sortBy === opt.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-accent/50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleCalculate}
                disabled={!selectedProfileId || !departureAerodrome || isCalculating}
              >
                <Plane className="mr-2 h-4 w-4" />
                {isCalculating ? "Calcul en cours..." : "Calculer les Routes"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Aérodromes Accessibles
                {results !== null && results.length > 0 && (
                  <span className="ml-2 text-base font-normal text-muted-foreground">
                    ({results.length})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {calcError && (
                <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  {calcError}
                </div>
              )}
              {results === null ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Navigation className="mx-auto h-10 w-10 mb-3 opacity-30" />
                  <p>Sélectionnez un profil, un aérodrome de départ et calculez pour voir les destinations accessibles.</p>
                </div>
              ) : results.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Plane className="mx-auto h-10 w-10 mb-3 opacity-30" />
                  <p>Aucun aérodrome accessible avec ce profil depuis ce point de départ.</p>
                  <p className="text-xs mt-1">Vérifiez l&apos;autonomie et les exigences de piste du profil.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {results.slice(0, 50).map((r) => (
                    <Link
                      key={r.aerodrome.id}
                      href={`/aerodrome/${r.aerodrome.id}`}
                    >
                      <div className="flex items-center justify-between rounded-md border p-3 hover:bg-accent/50 transition-colors">
                        <div>
                          <span className="font-medium">{r.aerodrome.name}</span>
                          {r.aerodrome.icaoCode && (
                            <Badge variant="secondary" className="ml-2">
                              {r.aerodrome.icaoCode}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-muted-foreground">{formatNm(r.distanceNm)}</span>
                          <span className="text-muted-foreground">{formatFlightTime(r.timeHours)}</span>
                          <span className="text-muted-foreground">{r.fuelUsedLiters}L</span>
                          <Badge variant="outline">{formatEuros(r.estimatedCost)}</Badge>
                        </div>
                      </div>
                    </Link>
                  ))}
                  {results.length > 50 && (
                    <p className="text-center text-sm text-muted-foreground pt-2">
                      + {results.length - 50} autres aérodromes
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
