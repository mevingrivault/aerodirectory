"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNm, formatFlightTime, formatEuros } from "@/lib/utils";
import { Navigation, Plane, Plus, Trash2 } from "lucide-react";
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
  const [departureLat, setDepartureLat] = useState("48.8566");
  const [departureLng, setDepartureLng] = useState("2.3522");
  const [results, setResults] = useState<PlannerResult[]>([]);

  const { data: profilesRes } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => apiClient.get<AircraftProfile[]>("/planner/profiles"),
    enabled: !!user,
  });

  const profiles = profilesRes?.data ?? [];

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

  const handleCalculate = async () => {
    if (!selectedProfileId) return;
    const res = await apiClient.post<PlannerResult[]>("/planner/calculate", {
      profileId: selectedProfileId,
      departureLat: parseFloat(departureLat),
      departureLng: parseFloat(departureLng),
      sortBy: "time",
    });
    setResults(res.data);
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <Navigation className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">Flight Planner</h1>
        <p className="text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to use the flight planner.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
        <Navigation className="h-8 w-8 text-primary" />
        Flight Planner
      </h1>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Profiles & Departure */}
        <div className="space-y-6">
          {/* Aircraft Profiles */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Aircraft Profiles</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
                <Plus className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {showForm && (
                <form onSubmit={handleCreateProfile} className="space-y-3 mb-4 rounded-md border p-3">
                  <Input
                    placeholder="Aircraft name (e.g. C172)"
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
                      placeholder="Fuel (L/h)"
                      value={profileForm.fuelConsumption}
                      onChange={(e) => setProfileForm((f) => ({ ...f, fuelConsumption: e.target.value }))}
                      required
                    />
                    <Input
                      type="number"
                      placeholder="Cost (€/h)"
                      value={profileForm.hourlyCost}
                      onChange={(e) => setProfileForm((f) => ({ ...f, hourlyCost: e.target.value }))}
                      required
                    />
                    <Input
                      type="number"
                      placeholder="Range (NM)"
                      value={profileForm.fuelRange}
                      onChange={(e) => setProfileForm((f) => ({ ...f, fuelRange: e.target.value }))}
                      required
                    />
                    <Input
                      type="number"
                      placeholder="Min RWY (m)"
                      value={profileForm.minRunwayLength}
                      onChange={(e) => setProfileForm((f) => ({ ...f, minRunwayLength: e.target.value }))}
                      required
                    />
                  </div>
                  <Button type="submit" size="sm" className="w-full">
                    Save Profile
                  </Button>
                </form>
              )}

              {profiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Create an aircraft profile to start planning.
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
                          TAS {p.tas}kt · {p.fuelConsumption}L/h · {formatEuros(p.hourlyCost)}/h
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

          {/* Departure point */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Departure Point</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-sm font-medium">Latitude</label>
                <Input
                  type="number"
                  step="0.0001"
                  value={departureLat}
                  onChange={(e) => setDepartureLat(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Longitude</label>
                <Input
                  type="number"
                  step="0.0001"
                  value={departureLng}
                  onChange={(e) => setDepartureLng(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleCalculate}
                disabled={!selectedProfileId}
              >
                <Plane className="mr-2 h-4 w-4" />
                Calculate Routes
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Reachable Aerodromes ({results.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <p className="text-muted-foreground">
                  Select a profile and calculate to see reachable aerodromes.
                </p>
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
                          <span>{formatNm(r.distanceNm)}</span>
                          <span>{formatFlightTime(r.timeHours)}</span>
                          <span>{r.fuelUsedLiters}L</span>
                          <Badge variant="outline">{formatEuros(r.estimatedCost)}</Badge>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
