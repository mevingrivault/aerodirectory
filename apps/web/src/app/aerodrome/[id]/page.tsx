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
  Train,
  Cloud,
  Wind,
  Eye,
  Thermometer,
  Gauge,
  AlertCircle,
  Trash2,
  ImagePlus,
} from "lucide-react";
import { useState, useEffect } from "react";
import { PhotoUpload } from "@/components/ui/photo-upload";
import { Input } from "@/components/ui/input";

interface PhotoEntry {
  id: string;
  storedKey: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  createdAt: string;
  user: { id: string; displayName: string | null };
}

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
  altIdentifier: string | null;
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

interface OsmSource {
  type: string;
  id: number;
}

interface NearbyTransport {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  type: "bus" | "tram" | "train" | "bike" | "other";
  subType: "station" | "stop" | "platform";
  operator: string | null;
  network: string | null;
  ref: string | null;
  wheelchair: boolean | null;
  capacity: number | null;
  shelter: boolean | null;
  bench: boolean | null;
  lit: boolean | null;
  routeRef: string[];
  localRef: string | null;
  osmSources: OsmSource[];
}

interface NearbyTransportResult {
  aerodromeId: string;
  radiusMeters: number;
  transports: NearbyTransport[];
  pilotServices: {
    transport: {
      available: boolean;
      source: string;
      walkableThresholdMeters: number;
      matchingStopsCount: number;
    };
  };
}

interface NearbyAccommodation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  category: "camping" | "hotel" | "chambre_hotes";
  stars: number | null;
  rooms: number | null;
  capacity: number | null;
  phone: string | null;
  website: string | null;
  wheelchair: boolean | null;
  osmType: string;
  osmId: number;
}

interface NearbyAccommodationResult {
  aerodromeId: string;
  radiusMeters: number;
  accommodations: NearbyAccommodation[];
  pilotServices: {
    accommodation: {
      available: boolean;
      source: string;
      walkableThresholdMeters: number;
      matchingPlacesCount: number;
    };
  };
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

interface WeatherWind {
  degrees: number | null;
  speed_kts: number;
  gust_kts: number | null;
  cardinal: string | null;
}

interface WeatherResult {
  icao: string;
  stationName: string | null;
  isNearest: boolean;
  distanceNm?: number;
  bearingDeg?: number;
  metar: {
    raw: string;
    observedAt: string;
    wind: WeatherWind | null;
    visibility_meters: number | null;
    clouds: { code: string; base_ft: number | null; text: string | null }[];
    temperature_c: number | null;
    dewpoint_c: number | null;
    humidity_percent: number | null;
    pressure_hpa: number | null;
    conditions: { code: string; text: string }[];
    flight_category: string | null;
  } | null;
  taf: {
    raw: string;
    issuedAt: string;
    validFrom: string;
    validTo: string;
    forecast: {
      from: string;
      to: string;
      changeIndicator: string | null;
      wind?: WeatherWind;
      visibility_meters?: number | null;
      clouds?: { code: string; base_ft: number | null }[];
      conditions?: { code: string; text: string }[];
    }[];
  } | null;
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
  const [commentActionAlert, setCommentActionAlert] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

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

  const { data: photosRes } = useQuery({
    queryKey: ["photos", id],
    queryFn: () =>
      apiClient.get<PhotoEntry[]>(`/aerodromes/${id}/photos`),
    enabled: !!id,
  });
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);

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
  const [restaurantLimit, setRestaurantLimit] = useState(5);
  const [transportRadius, setTransportRadius] = useState(3000);
  const [transportLimit, setTransportLimit] = useState(5);
  const [bikeLimit, setBikeLimit] = useState(5);
  const [accommodationLimit, setAccommodationLimit] = useState(5);

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

  const { data: transportRes, isLoading: transportLoading, isError: transportError } = useQuery({
    queryKey: ["transport", id],
    queryFn: () =>
      apiClient.get<NearbyTransportResult>(`/aerodromes/${id}/transports`, {
        radiusMeters: "3000",
      }),
    enabled: !!ad,
    staleTime: 6 * 60 * 60 * 1000,
  });

  const { data: accommodationRes, isLoading: accommodationLoading, isError: accommodationError } = useQuery({
    queryKey: ["accommodation", id],
    queryFn: () =>
      apiClient.get<NearbyAccommodationResult>(`/aerodromes/${id}/accommodations`, {
        radiusMeters: "10000",
      }),
    enabled: !!ad,
    staleTime: 6 * 60 * 60 * 1000,
  });

  const { data: weatherRes, isLoading: weatherLoading } = useQuery({
    queryKey: ["weather", id],
    queryFn: () => apiClient.get<WeatherResult | null>(`/aerodromes/${id}/weather`),
    enabled: !!ad && !!user,
    staleTime: 30 * 60 * 1000,
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
      apiClient.put(`/visits/${id}`, { status: "SEEN" }).then(() => refetchVisit()).catch(() => {});
    }
  }, [user, id, currentVisitStatus]);

  useEffect(() => {
    if (photosRes?.data) setPhotos(photosRes.data);
  }, [photosRes]);

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
    setCommentActionAlert(null);
    await apiClient.post(`/aerodromes/${id}/comments`, {
      content: commentText,
    });
    setCommentText("");
    refetchComments();
  };

  const handleReportComment = async (comment: Comment) => {
    const reason = window.prompt("Pourquoi signalez-vous ce commentaire ?");
    if (!reason || !reason.trim()) return;

    try {
      await apiClient.post(`/aerodromes/${id}/reports`, {
        targetType: "comment",
        targetId: comment.id,
        reason: reason.trim(),
      });

      refetchComments();
      setCommentActionAlert({
        type: "success",
        message: "Le commentaire a été signalé et masqué en attendant modération.",
      });
    } catch (error) {
      setCommentActionAlert({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Impossible de signaler ce commentaire.",
      });
    }
  };

  const handleDeleteComment = async (comment: Comment) => {
    if (!window.confirm("Supprimer définitivement votre commentaire ?")) {
      return;
    }

    try {
      await apiClient.delete(`/aerodromes/${id}/comments/${comment.id}`);
      refetchComments();
      setCommentActionAlert({
        type: "success",
        message: "Votre commentaire a été supprimé.",
      });
    } catch (error) {
      setCommentActionAlert({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Impossible de supprimer ce commentaire.",
      });
    }
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
  const transportFromNearby = transportRes?.data?.pilotServices?.transport?.available ?? false;
  const bikeFromNearby = (transportRes?.data?.transports ?? []).some(
    (s) => s.type === "bike" && s.distanceMeters <= 1000,
  );
  const accommodationFromNearby = accommodationRes?.data?.pilotServices?.accommodation?.available ?? false;

  const amenities = [
    { icon: Utensils, label: "Restaurant", active: ad.hasRestaurant || restaurantFromNearby },
    { icon: Bike, label: "Vélos", active: ad.hasBikes || bikeFromNearby },
    { icon: Bus, label: "Transport", active: ad.hasTransport || transportFromNearby },
    { icon: Home, label: "Hébergement", active: ad.hasAccommodation || accommodationFromNearby },
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
        {/* Titre + badges */}
        <div className="flex items-start gap-3 mb-2">
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{ad.name}</h1>
          {ad.icaoCode && (
            <Badge variant="secondary" className="mt-1 shrink-0">
              {ad.icaoCode}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge variant={ad.status === "OPEN" ? "success" : "warning"}>
            {STATUS_LABELS[ad.status] ?? ad.status}
          </Badge>
          <Badge variant="outline">
            {TYPE_LABELS[ad.aerodromeType] || ad.aerodromeType}
          </Badge>
        </div>

        {/* Localisation */}
        <p className="text-muted-foreground flex items-center gap-1 text-sm">
          <MapPin className="h-4 w-4 shrink-0" />
          {[ad.city, ad.department, ad.region].filter(Boolean).join(", ")}
          {ad.elevation != null && ` — ${ad.elevation} ft`}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 ml-5">
          {ad.latitude.toFixed(4)}°N, {ad.longitude.toFixed(4)}°E
        </p>
        {ad.source && (
          <p className="text-xs text-muted-foreground mt-0.5 ml-5">
            Source : {ad.source}
            {ad.lastSyncedAt &&
              ` — Dernière synchro : ${new Date(ad.lastSyncedAt).toLocaleDateString("fr-FR")}`}
          </p>
        )}

        {/* Boutons d'action */}
        <div className="mt-4 flex flex-wrap gap-2">
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

          {/* Fiche basulm (ULM) */}
          {ad.altIdentifier && (
            <a
              href={`https://basulm.ffplum.fr/PDF/${encodeURIComponent(ad.altIdentifier)}.pdf`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="sm" variant="outline">
                <FileText className="mr-1 h-4 w-4" /> Fiche basulm
              </Button>
            </a>
          )}

          {/* Visit buttons (authenticated only) */}
          {user && (() => {
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
      </div>

      {/* Weather */}
      <WeatherCard weather={weatherRes?.data ?? null} loading={weatherLoading} authenticated={!!user} />

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
        <Card>
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
                    onClick={() => { setRestaurantRadius(r); setRestaurantLimit(5); }}
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
            ) : (() => {
              const filteredRestos = (restaurantsRes?.data?.restaurants ?? [])
                .filter((r) => r.distanceMeters <= restaurantRadius);
              const visibleRestos = filteredRestos.slice(0, restaurantLimit);
              return (
              <div className="space-y-2">
                {visibleRestos
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
                {filteredRestos.length > restaurantLimit && (
                  <button
                    onClick={() => setRestaurantLimit((l) => l + 5)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-md py-1.5 transition-colors"
                  >
                    Voir plus ({filteredRestos.length - restaurantLimit} restants)
                  </button>
                )}
              </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Nearby Public Transport */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bus className="h-5 w-5" /> Transports à proximité
              </CardTitle>
              <div className="flex gap-1 text-xs">
                {[1000, 3000, 5000].map((r) => (
                  <button
                    key={r}
                    onClick={() => { setTransportRadius(r); setTransportLimit(5); setBikeLimit(5); }}
                    className={`rounded px-2 py-1 border transition-colors ${
                      transportRadius === r
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
            {transportLoading ? (
              <p className="text-muted-foreground text-sm">Chargement...</p>
            ) : transportError ? (
              <p className="text-muted-foreground text-sm">
                Impossible de charger les transports pour le moment.
              </p>
            ) : (() => {
              const allFiltered = (transportRes?.data?.transports ?? [])
                .filter((s) => s.distanceMeters <= transportRadius && s.type !== "bike");
              const filtered = allFiltered.slice(0, transportLimit);
              if (!filtered.length) {
                return (
                  <p className="text-muted-foreground text-sm">
                    Aucun transport trouvé dans un rayon de {transportRadius / 1000} km.
                  </p>
                );
              }

              const groups: { type: NearbyTransport["type"]; label: string; icon: React.ElementType }[] = [
                { type: "train", label: "Train", icon: Train },
                { type: "tram", label: "Tram", icon: Bus },
                { type: "bus", label: "Bus", icon: Bus },
                { type: "other", label: "Autres", icon: MapPin },
              ];

              return (
                <>
                <div className="space-y-4">
                  {groups.map(({ type, label, icon: Icon }) => {
                    const stops = filtered.filter((s) => s.type === type);
                    if (!stops.length) return null;
                    return (
                      <div key={type}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5" /> {label}
                        </p>
                        <div className="space-y-2">
                          {stops.map((s) => {
                            const dist =
                              s.distanceMeters < 1000
                                ? `${s.distanceMeters} m`
                                : `${(s.distanceMeters / 1000).toFixed(1)} km`;
                            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}`;
                            const primarySource = s.osmSources?.[0];
                            const osmUrl = primarySource
                              ? `https://www.openstreetmap.org/${primarySource.type}/${primarySource.id}`
                              : null;
                            const walkable = s.distanceMeters <= 1000;

                            return (
                              <div
                                key={s.id}
                                className="rounded-md border p-3 flex items-start justify-between gap-3"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="font-medium text-sm">{s.name}</span>
                                    {s.ref && s.ref !== s.name && (
                                      <span className="text-xs text-muted-foreground font-mono">
                                        {s.ref}
                                      </span>
                                    )}
                                  </div>

                                  {(s.network ?? s.operator) && (
                                    <p className="text-xs text-muted-foreground mt-0.5 ml-5">
                                      {[s.network, s.operator].filter(Boolean).join(" · ")}
                                      {s.capacity && ` · ${s.capacity} vélos`}
                                    </p>
                                  )}

                                  {s.routeRef && s.routeRef.length > 0 && (
                                    <p className="text-xs text-muted-foreground mt-0.5 ml-5">
                                      Lignes : {s.routeRef.join(", ")}
                                    </p>
                                  )}

                                  <div className="flex gap-1.5 mt-1.5 ml-5 flex-wrap">
                                    {walkable ? (
                                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                                        À pied
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                        Proche
                                      </span>
                                    )}
                                    {s.subType === "station" && (
                                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                        Gare
                                      </span>
                                    )}
                                    {s.wheelchair === true && (
                                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                        ♿ Accessible
                                      </span>
                                    )}
                                    {s.shelter === true && (
                                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                        🛑 Abri
                                      </span>
                                    )}
                                    {s.lit === true && (
                                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                        💡 Éclairé
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
                                  {osmUrl && (
                                    <a
                                      href={osmUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                    >
                                      <ExternalLink className="h-3 w-3" /> OSM
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {allFiltered.length > transportLimit && (
                  <button
                    onClick={() => setTransportLimit((l) => l + 5)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-md py-1.5 transition-colors mt-2"
                  >
                    Voir plus ({allFiltered.length - transportLimit} restants)
                  </button>
                )}
              </>
              );
            })()}
          </CardContent>
        </Card>

        {/* Nearby Bike Sharing */}
        {(() => {
          const allBikes = (transportRes?.data?.transports ?? [])
            .filter((s) => s.type === "bike" && s.distanceMeters <= transportRadius);
          if (!transportLoading && !transportError && allBikes.length === 0) return null;
          const visibleBikes = allBikes.slice(0, bikeLimit);
          return (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Bike className="h-5 w-5" /> Vélos en libre service
                </CardTitle>
              </CardHeader>
              <CardContent>
                {transportLoading ? (
                  <p className="text-muted-foreground text-sm">Chargement...</p>
                ) : (
                  <div className="space-y-2">
                    {visibleBikes.map((s) => {
                      const dist =
                        s.distanceMeters < 1000
                          ? `${s.distanceMeters} m`
                          : `${(s.distanceMeters / 1000).toFixed(1)} km`;
                      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}`;
                      const walkable = s.distanceMeters <= 1000;
                      return (
                        <div
                          key={s.id}
                          className="rounded-md border p-3 flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Bike className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium text-sm">{s.name}</span>
                            </div>
                            {(s.network ?? s.operator) && (
                              <p className="text-xs text-muted-foreground mt-0.5 ml-5">
                                {[s.network, s.operator].filter(Boolean).join(" · ")}
                                {s.capacity ? ` · ${s.capacity} vélos` : ""}
                              </p>
                            )}
                            <div className="flex gap-1.5 mt-1.5 ml-5 flex-wrap">
                              {walkable ? (
                                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                                  À pied
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  Proche
                                </span>
                              )}
                              {s.wheelchair === true && (
                                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  ♿ Accessible
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
                    {allBikes.length > bikeLimit && (
                      <button
                        onClick={() => setBikeLimit((l) => l + 5)}
                        className="w-full text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-md py-1.5 transition-colors"
                      >
                        Voir plus ({allBikes.length - bikeLimit} restants)
                      </button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* Nearby Accommodation */}
        {(() => {
          const allAccommodations = accommodationRes?.data?.accommodations ?? [];
          if (!accommodationLoading && !accommodationError && allAccommodations.length === 0) return null;

          const groups: { category: NearbyAccommodation["category"]; label: string; icon: string }[] = [
            { category: "camping", label: "Camping", icon: "⛺" },
            { category: "hotel", label: "Hôtels", icon: "🏨" },
            { category: "chambre_hotes", label: "Chambres d'hôtes & Gîtes", icon: "🏡" },
          ];

          return (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Home className="h-5 w-5" /> Hébergements à proximité
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {accommodationLoading && (
                  <p className="text-sm text-muted-foreground">Chargement...</p>
                )}
                {accommodationError && (
                  <p className="text-sm text-muted-foreground">Impossible de charger les hébergements.</p>
                )}
                {!accommodationLoading && !accommodationError && allAccommodations.length === 0 && (
                  <p className="text-sm text-muted-foreground">Aucun hébergement trouvé dans un rayon de 10 km.</p>
                )}
                {groups.map(({ category, label, icon }) => {
                  const items = allAccommodations
                    .filter((a) => a.category === category)
                    .slice(0, accommodationLimit);
                  if (items.length === 0) return null;
                  return (
                    <div key={category}>
                      <p className="text-sm font-semibold text-muted-foreground mb-2">
                        {icon} {label}
                      </p>
                      <div className="space-y-2">
                        {items.map((a) => {
                          const dist =
                            a.distanceMeters < 1000
                              ? `${a.distanceMeters} m`
                              : `${(a.distanceMeters / 1000).toFixed(1)} km`;
                          const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lon}`;
                          return (
                            <div
                              key={a.id}
                              className="rounded-md border p-3 flex items-start justify-between gap-3"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-sm">{a.name}</p>
                                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                                  {a.stars && (
                                    <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-700">
                                      {"★".repeat(a.stars)} {a.stars} étoile{a.stars > 1 ? "s" : ""}
                                    </span>
                                  )}
                                  {a.rooms && (
                                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                      {a.rooms} chambre{a.rooms > 1 ? "s" : ""}
                                    </span>
                                  )}
                                  {a.capacity && !a.rooms && (
                                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                      {a.capacity} places
                                    </span>
                                  )}
                                  {a.wheelchair === true && (
                                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                      ♿ Accessible
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-3 mt-1.5">
                                  {a.phone && (
                                    <a
                                      href={`tel:${a.phone}`}
                                      className="text-xs text-primary hover:underline"
                                    >
                                      {a.phone}
                                    </a>
                                  )}
                                  {a.website && (
                                    <a
                                      href={a.website}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-primary hover:underline flex items-center gap-1"
                                    >
                                      <ExternalLink className="h-3 w-3" /> Site web
                                    </a>
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
                    </div>
                  );
                })}
                {allAccommodations.length > accommodationLimit && (
                  <button
                    onClick={() => setAccommodationLimit((l) => l + 5)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-md py-1.5 transition-colors"
                  >
                    Voir plus ({allAccommodations.length - accommodationLimit} restants)
                  </button>
                )}
              </CardContent>
            </Card>
          );
        })()}

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


        {/* Photos */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ImagePlus className="h-5 w-5" /> Photos ({photos.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PhotoUpload
              aerodromeId={id}
              currentUserId={user?.id}
              existingPhotos={photos}
              onUploadSuccess={(photo) => {
                setPhotos((prev) => [photo, ...prev]);
              }}
              onDeleteSuccess={(photoId) => {
                setPhotos((prev) => prev.filter((p) => p.id !== photoId));
              }}
            />
            {!user && (
              <p className="mt-3 text-sm text-muted-foreground text-center">
                <a href="/login" className="text-primary hover:underline">Connectez-vous</a> pour ajouter des photos.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Comments */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5" /> Commentaires ({ad._count.comments})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {commentActionAlert && (
              <div
                className={`mb-4 rounded-md border p-3 text-sm ${
                  commentActionAlert.type === "success"
                    ? "border-green-300 bg-green-50 text-green-800"
                    : "border-red-300 bg-red-50 text-red-800"
                }`}
              >
                {commentActionAlert.message}
              </div>
            )}
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
                    {user && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {user.id === c.user.id ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteComment(c)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Supprimer
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReportComment(c)}
                          >
                            Signaler
                          </Button>
                        )}
                      </div>
                    )}
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

// ─── WeatherCard ───────────────────────────────────────────────────────────

const CAT_STYLES: Record<string, { bg: string; text: string; title: string }> = {
  VFR:  { bg: "bg-green-500",  text: "text-white", title: "Conditions VFR — Plafond > 3 000 ft et visibilité > 8 km" },
  MVFR: { bg: "bg-blue-500",   text: "text-white", title: "VFR marginales — Plafond 1 000–3 000 ft et/ou visibilité 5–8 km" },
  IFR:  { bg: "bg-red-500",    text: "text-white", title: "Conditions IFR — Plafond 500–1 000 ft et/ou visibilité 1,5–5 km" },
  LIFR: { bg: "bg-purple-600", text: "text-white", title: "IFR basses — Plafond < 500 ft et/ou visibilité < 1,5 km" },
};

function formatVisibility(meters: number | null | undefined): string {
  if (meters == null) return "—";
  if (meters >= 9999) return "> 10 km";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters} m`;
}

function formatUtcTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
  } catch { return "—"; }
}

function formatUtcDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit",
      timeZone: "UTC",
    }) + " UTC";
  } catch { return "—"; }
}

function MetricTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2 min-w-[90px]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-bold text-foreground leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function WeatherCard({ weather, loading, authenticated }: { weather: WeatherResult | null; loading: boolean; authenticated: boolean }) {
  const [showRawMetar, setShowRawMetar] = useState(false);
  const [showRawTaf, setShowRawTaf] = useState(false);

  if (!authenticated) {
    return (
      <Card className="mb-6">
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Cloud className="h-5 w-5" /> Météo</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
              Connectez-vous
            </Link>{" "}
            pour accéder aux données METAR et TAF en temps réel.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="mb-6">
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Cloud className="h-5 w-5" /> Météo</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Chargement...</p></CardContent>
      </Card>
    );
  }

  if (!weather) {
    return (
      <Card className="mb-6">
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Cloud className="h-5 w-5" /> Météo</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4" /> Données météo indisponibles pour cette station.
          </p>
        </CardContent>
      </Card>
    );
  }

  const m = weather.metar;
  const cat = m?.flight_category;
  const catStyle = cat ? (CAT_STYLES[cat] ?? null) : null;

  const windValue = m?.wind
    ? (m.wind.degrees != null ? `${m.wind.degrees}° · ${m.wind.speed_kts} kt` : `VRB · ${m.wind.speed_kts} kt`)
    : "Calme";
  const windSub = m?.wind?.gust_kts != null ? `Rafales ${m.wind.gust_kts} kt` : undefined;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        {/* Ligne titre + badge catégorie + heure */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Cloud className="h-5 w-5" /> Météo
            </CardTitle>
            {catStyle && (
              <span
                className={`text-sm font-bold px-2.5 py-0.5 rounded-full cursor-help ${catStyle.bg} ${catStyle.text}`}
                title={catStyle.title}
              >
                {cat}
              </span>
            )}
          </div>
          {m && (
            <span className="text-xs text-muted-foreground shrink-0">
              Obs. {formatUtcTime(m.observedAt)}
            </span>
          )}
        </div>

        {/* Station la plus proche — compacte */}
        {weather.isNearest && (
          <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1">
            <Navigation className="h-3 w-3 shrink-0 mt-0.5" />
            <span>
              <span className="font-semibold">{weather.icao}</span>
              {weather.stationName && <span> — {weather.stationName}</span>}
              {weather.distanceNm != null && <span className="text-muted-foreground/70"> · {weather.distanceNm.toFixed(0)} NM</span>}
            </span>
          </p>
        )}

        {/* Légende catégories */}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(CAT_STYLES).map(([c, style]) => (
            <span key={c} className="flex items-center gap-1 text-[11px] text-muted-foreground" title={style.title}>
              <span className={`inline-block h-2 w-2 rounded-full ${style.bg}`} />
              {c}
            </span>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── METAR ── */}
        {m && (
          <div>
            {/* Tiles en grille 2 colonnes sur mobile */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MetricTile label="Vent" value={windValue} sub={windSub} />
              <MetricTile label="Visibilité" value={formatVisibility(m.visibility_meters)} />
              <MetricTile
                label="Température"
                value={m.temperature_c != null ? `${m.temperature_c}°C` : "—"}
                sub={m.dewpoint_c != null ? `Rosée ${m.dewpoint_c}°C` : undefined}
              />
              <MetricTile
                label="QNH"
                value={m.pressure_hpa != null ? `${m.pressure_hpa} hPa` : "—"}
              />
            </div>

            {/* Clouds */}
            {m.clouds.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {m.clouds.map((c, i) => (
                  <span key={i} className="rounded-full border bg-sky-50 text-sky-800 px-2.5 py-0.5 text-xs font-mono">
                    {c.code}{c.base_ft != null && ` ${c.base_ft.toLocaleString()} ft`}
                    {c.text && ` · ${c.text}`}
                  </span>
                ))}
              </div>
            )}

            {/* Conditions */}
            {m.conditions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.conditions.map((c, i) => (
                  <span key={i} className="rounded-full border border-blue-200 bg-blue-50 text-blue-800 px-2.5 py-0.5 text-xs font-semibold">
                    {c.text || c.code}
                  </span>
                ))}
              </div>
            )}

            {/* Raw METAR */}
            <div className="mt-3">
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowRawMetar((v) => !v)}
              >
                {showRawMetar ? "▾ Masquer le METAR brut" : "▸ Voir le METAR brut"}
              </button>
              {showRawMetar && (
                <pre className="mt-2 rounded-md bg-muted px-3 py-2 text-xs font-mono whitespace-pre-wrap break-all">
                  {m.raw}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* ── TAF ── */}
        {weather.taf && (
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3 gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">TAF</p>
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                onClick={() => setShowRawTaf((v) => !v)}
              >
                {showRawTaf ? "▾ Masquer le TAF brut" : "▸ Voir le TAF brut"}
              </button>
            </div>

            {showRawTaf && (
              <pre className="mb-3 rounded-md bg-muted px-3 py-2 text-xs font-mono whitespace-pre-wrap break-all">
                {weather.taf.raw}
              </pre>
            )}

            {/* TAF en cards empilées sur mobile, table sur desktop */}
            <div className="sm:hidden space-y-2">
              {weather.taf.forecast.map((f, i) => (
                <div key={i} className={`rounded-md border p-2.5 text-xs ${f.changeIndicator ? "border-orange-200 bg-orange-50/40" : "bg-muted/30"}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    {f.changeIndicator && (
                      <span className="font-bold text-orange-700 uppercase text-[11px]">{f.changeIndicator}</span>
                    )}
                    {(f.from || f.to) && (
                      <span className="text-muted-foreground font-mono text-[11px]">
                        {formatUtcDateTime(f.from)}{f.to ? ` → ${formatUtcDateTime(f.to)}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[12px]">
                    {f.wind && (
                      <span>
                        <span className="text-muted-foreground mr-1">Vent</span>
                        {f.wind.degrees != null ? `${f.wind.degrees}°` : "VRB"} · {f.wind.speed_kts} kt
                        {f.wind.gust_kts != null && <span className="text-orange-600"> G{f.wind.gust_kts}</span>}
                      </span>
                    )}
                    {f.visibility_meters != null && (
                      <span>
                        <span className="text-muted-foreground mr-1">Vis.</span>
                        {formatVisibility(f.visibility_meters)}
                      </span>
                    )}
                    {f.clouds && f.clouds.length > 0 && (
                      <span className="font-mono">
                        {f.clouds.map((c, j) => (
                          <span key={j} className="mr-1">{c.code}{c.base_ft != null && ` ${c.base_ft.toLocaleString()}ft`}</span>
                        ))}
                      </span>
                    )}
                    {f.conditions && f.conditions.length > 0 && (
                      <span className="text-blue-700 font-semibold">
                        {f.conditions.map((c) => c.text || c.code).join(" · ")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground py-1.5 pr-3 whitespace-nowrap">Période</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground py-1.5 pr-3">Vent</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground py-1.5 pr-3">Visibilité</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground py-1.5 pr-3">Nuages</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground py-1.5">Conditions</th>
                  </tr>
                </thead>
                <tbody>
                  {weather.taf.forecast.map((f, i) => (
                    <tr key={i} className={`border-b last:border-0 ${f.changeIndicator ? "bg-orange-50/60" : ""}`}>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {f.changeIndicator && (
                          <span className="inline-block font-bold text-orange-700 text-[11px] uppercase mr-1.5">{f.changeIndicator}</span>
                        )}
                        {(f.from || f.to) ? (
                          <span className="text-muted-foreground font-mono text-[11px]">
                            {formatUtcDateTime(f.from)}{f.to ? ` → ${formatUtcDateTime(f.to)}` : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {f.wind
                          ? <>{f.wind.degrees != null ? `${f.wind.degrees}°` : "VRB"} · {f.wind.speed_kts} kt{f.wind.gust_kts != null && <span className="text-orange-600"> G{f.wind.gust_kts}</span>}</>
                          : <span className="text-muted-foreground">—</span>
                        }
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {f.visibility_meters != null ? formatVisibility(f.visibility_meters) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 pr-3">
                        {f.clouds && f.clouds.length > 0
                          ? f.clouds.map((c, j) => (
                              <span key={j} className="font-mono mr-1.5">{c.code}{c.base_ft != null && ` ${c.base_ft.toLocaleString()}ft`}</span>
                            ))
                          : <span className="text-muted-foreground">—</span>
                        }
                      </td>
                      <td className="py-2">
                        {f.conditions && f.conditions.length > 0
                          ? <span className="text-blue-700 font-semibold">{f.conditions.map((c) => c.text || c.code).join(" · ")}</span>
                          : <span className="text-muted-foreground">—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
