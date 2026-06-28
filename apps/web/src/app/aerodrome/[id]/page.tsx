"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FUEL_LABELS } from "@aerodirectory/shared";
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
  Reply,
  PencilLine,
  CalendarDays,
  ChevronRight,
  CheckCircle2,
  Share2,
  Printer,
  Flag,
  Info,
  Send,
  Download,
  Check,
} from "lucide-react";
import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { PhotoUpload } from "@/components/ui/photo-upload";
import { AerodromeLocationMap } from "@/components/ui/aerodrome-location-map";
import { Input } from "@/components/ui/input";
import { useAltchaAuto } from "@/lib/use-altcha-auto";
import type { CorrectionItem, EventItem } from "@aerodirectory/shared";
import { EVENT_TYPES } from "@aerodirectory/shared";

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
  iataCode: string | null;
  latitude: number;
  longitude: number;
  elevation: number | null;
  magneticDeclination: number | null;
  city: string | null;
  region: string | null;
  department: string | null;
  countryCode: string;
  aerodromeType: string;
  status: string;
  ppr: boolean;
  privateUse: boolean;
  skydiveActivity: boolean;
  winchOnly: boolean;
  description: string | null;
  altIdentifier: string | null;
  aipLink: string | null;
  vacLink: string | null;
  websiteUrl: string | null;
  handlingFacilities: number[];
  passengerFacilities: number[];
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
    trueHeading: number | null;
    mainRunway: boolean;
    operations: number | null;
    surface: string;
    surfaceComposition: number[];
    lighting: boolean;
    remarks: string | null;
  }[];
  frequencies: {
    id: string;
    type: string;
    mhz: number;
    isPrimary: boolean;
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
  corrections: {
    id: string;
    field: string;
    currentValue: string | null;
    proposedValue: string;
    reason: string | null;
    createdAt: string;
    reviewedAt: string | null;
    user: { id: string; displayName: string | null };
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
  parentId?: string | null;
  user: { id: string; displayName: string | null };
  replies?: Comment[];
}

interface UserAerodromeList {
  id: string;
  name: string;
  isDefault: boolean;
  items: { id: string; aerodromeId: string }[];
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

const EVENT_TYPE_LABELS: Record<string, string> = {
  CAFE_CROISSANT: "Café croissant",
  OPEN_DAY: "Journée portes ouvertes",
  AIRSHOW: "Meeting aérien",
  OTHER: "Autre événement",
};

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

const SURFACE_LABELS: Record<number, string> = {
  0: "Asphalte",
  1: "Béton",
  2: "Herbe",
  3: "Terre",
  4: "Gravier",
  5: "Eau",
};

const SURFACE_NAME_LABELS: Record<string, string> = {
  GRASS: "Herbe",
  ASPHALT: "Asphalte",
  CONCRETE: "Béton",
  DIRT: "Terre",
  GRAVEL: "Gravier",
  WATER: "Eau",
  SAND: "Sable",
  SNOW: "Neige",
  ICE: "Glace",
  UNPAVED: "Non revêtu",
  PAVED: "Revêtu",
};

// openAIP runway operations codes
const RUNWAY_OPERATIONS_LABELS: Record<number, string> = {
  0: "VFR de jour",
  1: "VFR de nuit",
  2: "IFR",
  3: "VFR & IFR",
};

// openAIP handling facilities codes
const HANDLING_LABELS: Record<number, string> = {
  0: "Avitaillement",
  1: "Hangarage",
  2: "Dégivrage",
  3: "Remorquage",
  4: "Assistance technique",
  5: "Service météo",
};

// openAIP passenger facilities codes
const PASSENGER_LABELS: Record<number, string> = {
  0: "Terminal passagers",
  1: "Hôtel",
  2: "Transport",
  3: "Taxi",
  4: "Location voiture",
  5: "Banque / Distributeur",
  6: "Douanes",
  7: "Santé",
};

const COMMUNITY_FIELD_OPTIONS = [
  { value: "name", label: "Nom" },
  { value: "city", label: "Ville" },
  { value: "region", label: "Région" },
  { value: "description", label: "Description" },
  { value: "website", label: "Site web" },
  { value: "aip", label: "Lien AIP" },
  { value: "vac", label: "Lien VAC" },
  { value: "restaurant", label: "Restauration" },
  { value: "transport", label: "Transport" },
  { value: "hébergement", label: "Hébergement" },
  { value: "maintenance", label: "Maintenance" },
  { value: "hangars", label: "Hangars" },
  { value: "runways", label: "Pistes" },
  { value: "frequencies", label: "Fréquences" },
  { value: "fuels", label: "Carburants" },
  { value: "local", label: "Info locale / conseil pilote" },
  { value: "other", label: "Autre" },
] as const;

function formatDeclination(value: number | null) {
  if (value == null) return null;
  if (value === 0) return "0°";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}°`;
}

function formatOpenAipCode(code: number) {
  return `Code ${code}`;
}

function formatCommunityFieldLabel(field: string) {
  return COMMUNITY_FIELD_OPTIONS.find((option) => option.value === field)?.label ?? field;
}

export default function AerodromeDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const solveAltcha = useAltchaAuto();
  const [commentText, setCommentText] = useState("");
  const [correctionField, setCorrectionField] = useState<(typeof COMMUNITY_FIELD_OPTIONS)[number]["value"]>("description");
  const [customCorrectionField, setCustomCorrectionField] = useState("");
  const [correctionValue, setCorrectionValue] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [commentActionAlert, setCommentActionAlert] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [correctionActionAlert, setCorrectionActionAlert] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [newListDialogOpen, setNewListDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState("");

  const [eventForm, setEventForm] = useState<{
    type: EventItem["type"];
    title: string;
    description: string;
    startDate: string;
    endDate: string;
  } | null>(null);
  const [eventAlert, setEventAlert] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<"infos" | "pistes" | "services" | "commodites" | "meteo" | "avis" | "photos">("infos");
  const [activeAmenTab, setActiveAmenTab] = useState<"all" | "resto" | "hotel" | "transport" | "bike">("all");

  const { data: aerodromeRes, isLoading } = useQuery({
    queryKey: ["aerodrome", id],
    queryFn: () => apiClient.get<AerodromeDetail>(`/aerodromes/${id}`),
  });

  const { data: eventsRes, refetch: refetchEvents } = useQuery({
    queryKey: ["events", id],
    queryFn: () => apiClient.get<EventItem[]>(`/aerodromes/${id}/events`),
    enabled: !!id,
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

  const { data: listsRes } = useQuery({
    queryKey: ["user-lists"],
    queryFn: () => apiClient.get<UserAerodromeList[]>("/lists"),
    enabled: !!user,
  });

  const [optimisticVisitStatus, setOptimisticVisitStatus] = useState<string | null>(null);
  const [visitActionStarted, setVisitActionStarted] = useState(false);
  const [isVisitUpdating, setIsVisitUpdating] = useState(false);

  const addToListMutation = useMutation({
    mutationFn: (listId: string) =>
      apiClient.post(`/lists/${listId}/items`, { aerodromeId: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-lists"] });
    },
  });

  const removeFromListMutation = useMutation({
    mutationFn: (listId: string) =>
      apiClient.delete(`/lists/${listId}/items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-lists"] });
    },
  });

  const createListMutation = useMutation({
    mutationFn: (name: string) =>
      apiClient.post("/lists", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-lists"] });
    },
  });

  const serverVisitStatus = visitsRes?.data?.find((v) => v.aerodromeId === id)?.status ?? null;
  const currentVisitStatus = optimisticVisitStatus ?? serverVisitStatus;
  const userLists = listsRes?.data ?? [];

  useEffect(() => {
    setOptimisticVisitStatus(null);
  }, [serverVisitStatus, id]);

  // Auto-mark as SEEN on page open (don't downgrade VISITED/FAVORITE)
  useEffect(() => {
    if (user && !visitActionStarted && serverVisitStatus === null) {
      apiClient
        .put(`/visits/${id}`, { status: "SEEN" })
        .then(async () => {
          await Promise.all([
            refetchVisit(),
            queryClient.invalidateQueries({ queryKey: ["visits"] }),
            queryClient.invalidateQueries({ queryKey: ["aerodex-stats"] }),
          ]);
        })
        .catch(() => {});
    }
  }, [user, id, serverVisitStatus, visitActionStarted, refetchVisit, queryClient]);

  useEffect(() => {
    if (photosRes?.data) setPhotos(photosRes.data);
  }, [photosRes]);

  const events = eventsRes?.data ?? [];
  const comments = commentsRes?.data ?? [];
  const communityCorrections = ad?.corrections ?? [];
  const allNearby = (nearbyRes?.data ?? []).filter((n) => n.id !== id);
  const nearbyAerodromes = allNearby.filter((n) => n.aerodromeType !== "ULTRALIGHT_FIELD").slice(0, 6);
  const nearbyUlm = allNearby.filter((n) => n.aerodromeType === "ULTRALIGHT_FIELD").slice(0, 6);

  const handleVisit = async (status: string) => {
    setVisitActionStarted(true);
    setIsVisitUpdating(true);
    let nextStatus = status;
    if (status === "FAVORITE" && currentVisitStatus === "FAVORITE") nextStatus = "VISITED";
    else if (status === "VISITED" && currentVisitStatus === "VISITED") nextStatus = "SEEN";
    setOptimisticVisitStatus(nextStatus);

    try {
      await apiClient.put(`/visits/${id}`, { status: nextStatus });
      await Promise.all([
        refetchVisit(),
        queryClient.invalidateQueries({ queryKey: ["visits"] }),
        queryClient.invalidateQueries({ queryKey: ["aerodex-stats"] }),
      ]);
    } catch (error) {
      setOptimisticVisitStatus(serverVisitStatus);
      throw error;
    } finally {
      setIsVisitUpdating(false);
    }
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    const field = correctionField === "other" ? customCorrectionField.trim() : correctionField;
    if (!field || !correctionValue.trim()) return;

    setCorrectionActionAlert(null);

    try {
      await apiClient.post(`/aerodromes/${id}/corrections`, {
        field,
        proposedValue: correctionValue.trim(),
        reason: correctionReason.trim() || undefined,
      });

      setCorrectionValue("");
      setCorrectionReason("");
      setCustomCorrectionField("");
      setCorrectionField("description");
      setCorrectionActionAlert({
        type: "success",
        message:
          "Votre contribution a bien été enregistrée. Elle sera visible publiquement après validation par un admin.",
      });
      await queryClient.invalidateQueries({ queryKey: ["aerodrome", id] });
    } catch (error) {
      setCorrectionActionAlert({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Impossible d'envoyer cette contribution pour le moment.",
      });
    }
  };

  const isInList = (list: UserAerodromeList) =>
    list.items.some((item) => item.aerodromeId === id);

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setCommentActionAlert(null);
    const altcha = await solveAltcha();
    await apiClient.post(
      `/aerodromes/${id}/comments`,
      { content: commentText },
      altcha ? { "x-altcha": altcha } : undefined,
    );
    setCommentText("");
    refetchComments();
  };

  const handleReply = async (e: React.FormEvent, parentCommentId: string) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    setCommentActionAlert(null);
    const altcha = await solveAltcha();
    await apiClient.post(
      `/aerodromes/${id}/comments`,
      { content: replyText, parentId: parentCommentId },
      altcha ? { "x-altcha": altcha } : undefined,
    );
    setReplyText("");
    setReplyTargetId(null);
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

  const handleSubmitEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm || !eventForm.title.trim() || !eventForm.startDate) return;
    setEventAlert(null);
    try {
      const altcha = await solveAltcha();
      await apiClient.post(
        `/aerodromes/${id}/events`,
        {
          type: eventForm.type,
          title: eventForm.title.trim(),
          description: eventForm.description.trim() || undefined,
          startDate: new Date(eventForm.startDate).toISOString(),
          endDate: eventForm.endDate ? new Date(eventForm.endDate).toISOString() : undefined,
        },
        altcha ? { "x-altcha": altcha } : undefined,
      );
      setEventForm(null);
      setEventAlert({ type: "success", message: "Merci ! Votre événement sera examiné avant publication." });
      await refetchEvents();
    } catch (error) {
      setEventAlert({
        type: "error",
        message: error instanceof Error ? error.message : "Impossible de soumettre l'événement.",
      });
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!window.confirm("Supprimer cet événement ?")) return;
    try {
      await apiClient.delete(`/aerodromes/${id}/events/${eventId}`);
      await refetchEvents();
    } catch {
      // ignore
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

  const handleReportCorrection = async (correctionId: string) => {
    const reason = window.prompt("Pourquoi signalez-vous cette contribution ?");
    if (!reason || !reason.trim()) return;

    try {
      await apiClient.post(`/aerodromes/${id}/reports`, {
        targetType: "correction",
        targetId: correctionId,
        reason: reason.trim(),
      });

      await queryClient.invalidateQueries({ queryKey: ["aerodrome", id] });
      setCorrectionActionAlert({
        type: "success",
        message: "La contribution a été signalée et masquée en attendant modération.",
      });
    } catch (error) {
      setCorrectionActionAlert({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Impossible de signaler cette contribution.",
      });
    }
  };

  const renderCommentCard = (comment: Comment, nested = false) => (
    <div
      key={comment.id}
      className={`rounded-md border p-3 ${nested ? "bg-muted/30 ml-4 mt-3" : ""}`}
    >
        <div className="mb-1 flex items-center justify-between">
          <span className="font-medium text-sm">
            {comment.user.displayName ? (
              <Link
                href={`/community/${comment.user.id}`}
                className="hover:text-primary hover:underline"
              >
                {comment.user.displayName}
              </Link>
            ) : (
              "Membre"
            )}
          </span>
        <span className="text-xs text-muted-foreground">
          {new Date(comment.createdAt).toLocaleDateString("fr-FR")}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
      {user && (
        <div className="mt-2 flex flex-wrap gap-2">
          {user.id !== comment.user.id && !nested && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setReplyTargetId((current) => (current === comment.id ? null : comment.id))
              }
            >
              <Reply className="mr-1 h-3.5 w-3.5" />
              Répondre
            </Button>
          )}
          {user.id === comment.user.id ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteComment(comment)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Supprimer
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleReportComment(comment)}
            >
              Signaler
            </Button>
          )}
        </div>
      )}

      {user && replyTargetId === comment.id && !nested && (
        <form onSubmit={(e) => handleReply(e, comment.id)} className="mt-3 space-y-2">
          <Input
            placeholder="Répondez à ce commentaire..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            maxLength={2000}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={!replyText.trim()}>
              Répondre
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setReplyTargetId(null);
                setReplyText("");
              }}
            >
              Annuler
            </Button>
          </div>
        </form>
      )}

      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-3 space-y-2 border-l pl-3">
          {comment.replies.map((reply) => renderCommentCard(reply, true))}
        </div>
      )}
    </div>
  );

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

  const visitedCount = ad._count?.visits ?? 0;
  const isVisited = currentVisitStatus === "VISITED" || currentVisitStatus === "FAVORITE";
  const isFavorite = currentVisitStatus === "FAVORITE";

  // ── Style constants (reused across JSX) ────────────────────────────────────
  const dtS: CSSProperties = { fontSize: 13, color: "var(--ink-700)", padding: "10px 0", borderBottom: "1px dashed var(--ink-200)" };
  const ddS: CSSProperties = { fontSize: 13, color: "var(--ink-950)", margin: 0, padding: "10px 0", borderBottom: "1px dashed var(--ink-200)", textAlign: "right", fontWeight: 500 };
  const sectionMark: CSSProperties = { width: 28, height: 28, borderRadius: 6, background: "var(--horizon-100)", color: "var(--horizon-700)", display: "grid", placeItems: "center" };
  const sectionH2: CSSProperties = { fontFamily: "var(--f-serif)", fontWeight: 500, fontSize: 22, letterSpacing: "-0.01em", margin: 0, flex: 1 };
  const sectionAction: CSSProperties = { fontSize: 12, color: "var(--ink-700)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 };
  const asideH: CSSProperties = { fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-500)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 };
  const particWarn: CSSProperties = { display: "grid", gridTemplateColumns: "24px 1fr", gap: 12, padding: 12, background: "oklch(0.97 0.04 75)", border: "1px solid oklch(0.88 0.06 75)", borderRadius: 6 };
  const particInfo: CSSProperties = { display: "grid", gridTemplateColumns: "24px 1fr", gap: 12, padding: 12, background: "var(--horizon-50)", border: "1px solid oklch(0.88 0.04 250)", borderRadius: 6 };
  const particNeutral: CSSProperties = { display: "grid", gridTemplateColumns: "24px 1fr", gap: 12, padding: 12, background: "var(--paper-100)", border: "1px solid var(--ink-200)", borderRadius: 6 };
  const particP: CSSProperties = { margin: 0, fontSize: 13, color: "var(--ink-800)", lineHeight: 1.5 };
  const rwyTag: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, height: 22, padding: "0 8px", fontSize: 11, fontWeight: 500, background: "white", border: "1px solid var(--ink-200)", borderRadius: 4, color: "var(--ink-700)" };
  const rwyTagOk: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, height: 22, padding: "0 8px", fontSize: 11, fontWeight: 500, background: "oklch(0.96 0.04 130)", border: "1px solid oklch(0.86 0.06 130)", borderRadius: 4, color: "var(--terrain-800)" };
  const rwyStatL: CSSProperties = { fontSize: 10, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 };
  const labelS: CSSProperties = { fontSize: 12, color: "var(--ink-700)", display: "block", marginBottom: 4 };
  const inputS: CSSProperties = { width: "100%", borderRadius: 6, border: "1px solid var(--ink-200)", padding: "8px 12px", fontSize: 14, fontFamily: "inherit", background: "var(--paper-50)", color: "var(--ink-950)", boxSizing: "border-box", outline: "none" };
  const selectS: CSSProperties = { width: "100%", borderRadius: 6, border: "1px solid var(--ink-200)", padding: "8px 12px", fontSize: 14, fontFamily: "inherit", background: "var(--paper-50)", color: "var(--ink-950)" };
  const contactLabel: CSSProperties = { fontSize: 11, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--f-mono)", fontWeight: 600 };
  const contactValue: CSSProperties = { fontSize: 13, color: "var(--ink-950)", marginTop: 2 };

  return (
    <div className="min-h-[70vh] bg-[var(--paper-50)] text-[var(--ink-950)]">

      {/* BREADCRUMB */}
      <nav style={{ maxWidth: 1400, margin: "0 auto", padding: "14px 32px 0", fontSize: 13, color: "var(--ink-500)", display: "flex", alignItems: "center", gap: 8 }}>
        <Link href="/search" style={{ color: "var(--ink-700)" }}>Recherche</Link>
        <ChevronRight className="h-3 w-3 opacity-50" strokeWidth={2} />
        <span>{ad.name}{ad.icaoCode ? ` (${ad.icaoCode})` : ""}</span>
      </nav>

      {/* HERO — carte aéronautique CSS */}
      <section style={{ maxWidth: 1400, margin: "12px auto 0", padding: "0 32px" }}>
        <div style={{ position: "relative", overflow: "hidden", borderRadius: 20, border: "1px solid var(--ink-200)", background: "var(--horizon-50)", aspectRatio: "16/7", minHeight: 360 }}>
          {/* Gradient map */}
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 38% 30% at 46% 52%, oklch(0.86 0.045 128) 0%, oklch(0.83 0.05 128) 52%, transparent 74%), radial-gradient(ellipse 50% 40% at 46% 52%, oklch(0.90 0.035 210) 0%, oklch(0.90 0.035 210) 56%, transparent 78%), linear-gradient(170deg, oklch(0.93 0.03 215) 0%, oklch(0.88 0.045 220) 45%, oklch(0.83 0.06 225) 100%)" }} />
          {/* Runway overlay */}
          <div style={{ position: "absolute", left: "38%", top: "56%", width: 220, height: 14, background: "var(--ink-950)", transform: "rotate(-65deg)", boxShadow: "0 0 0 2px white, 0 6px 24px rgba(0,0,0,.25)", borderRadius: 2 }} />
          {/* Compass rose */}
          <div style={{ position: "absolute", bottom: 16, right: 16, width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,.92)", border: "1px solid var(--ink-200)", display: "grid", placeItems: "center", fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 700, color: "var(--ink-950)" }}>N</div>
          {/* Overlay */}
          <div style={{ position: "absolute", inset: "auto 0 0 0", padding: "28px 28px 24px", background: "linear-gradient(180deg, transparent 0%, rgba(255,255,255,.96) 70%)", display: "grid", gridTemplateColumns: "1fr auto", gap: 20, alignItems: "end" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                {ad.icaoCode && <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px", fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 600, background: "var(--paper-100)", color: "var(--ink-950)", border: "1px solid var(--ink-300)", borderRadius: 4, letterSpacing: "0.08em" }}>{ad.icaoCode}</span>}
                <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px", fontFamily: "var(--f-mono)", fontSize: 10, fontWeight: 600, borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.08em", background: "var(--horizon-100)", color: "var(--horizon-900)" }}>{TYPE_LABELS[ad.aerodromeType] || ad.aerodromeType}</span>
                <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px", fontFamily: "var(--f-mono)", fontSize: 10, fontWeight: 600, borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.08em", background: ad.status === "OPEN" ? "oklch(0.94 0.05 130)" : "oklch(0.94 0.05 25)", color: ad.status === "OPEN" ? "var(--terrain-800)" : "oklch(0.40 0.15 25)" }}>{STATUS_LABELS[ad.status] ?? ad.status}</span>
                {isVisited && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 24, padding: "0 10px", background: "var(--brass-100)", color: "var(--brass-700)", border: "1px solid oklch(0.85 0.06 75)", borderRadius: 999, fontSize: 12, fontWeight: 600 }}><CheckCircle2 className="h-3 w-3" /> {isFavorite ? "Favori" : "Visité"}</span>}
              </div>
              <h1 style={{ fontFamily: "var(--f-serif)", fontWeight: 500, fontSize: "clamp(28px,4vw,44px)", lineHeight: 1.05, letterSpacing: "-0.02em", margin: 0 }}>{ad.name}</h1>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 10, fontSize: 13, color: "var(--ink-700)" }}>
                {[ad.city, ad.department, ad.region].filter(Boolean).length > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><MapPin className="h-3.5 w-3.5" style={{ color: "var(--ink-500)" }} />{[ad.city, ad.department, ad.region].filter(Boolean).join(" · ")}</span>}
                {ad.elevation != null && <span>Élévation <strong style={{ color: "var(--ink-950)", fontWeight: 600 }}>{ad.elevation} ft</strong></span>}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><strong style={{ color: "var(--ink-950)", fontWeight: 600 }}>{visitedCount}</strong> visites · <strong style={{ color: "var(--ink-950)", fontWeight: 600 }}>{ad._count.comments ?? 0}</strong> avis</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <Link href={`/planner?to=${ad.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px", borderRadius: 8, background: "var(--ink-950)", color: "white", fontSize: 13, fontWeight: 500, textDecoration: "none" }}><Send className="h-4 w-4" /> Planifier</Link>
              {user && <button type="button" onClick={() => handleVisit("VISITED")} disabled={isVisitUpdating} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px", border: "1px solid var(--ink-300)", borderRadius: 8, background: "white", color: "var(--ink-950)", fontFamily: "inherit", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: isVisitUpdating ? 0.6 : 1 }}><CheckCircle2 className="h-4 w-4" /> {isVisited ? "Aérodex ✓" : "Aérodex"}</button>}
            </div>
          </div>
        </div>
      </section>

      {/* PAGE */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 32px 64px" }}>

        {/* TABS */}
        <div role="tablist" style={{ position: "sticky", top: 64, zIndex: 20, background: "var(--paper-50)", borderBottom: "1px solid var(--ink-200)", margin: "0 -32px 24px", padding: "0 32px", display: "flex", gap: 4, overflowX: "auto", scrollbarWidth: "none" }}>
          {([
            { key: "infos",      label: "Infos" },
            { key: "pistes",     label: "Pistes & Frq",    count: ad.runways.length + ad.frequencies.length },
            { key: "services",   label: "Services & Carbu" },
            { key: "commodites", label: "Commodités" },
            { key: "meteo",      label: "Météo" },
            { key: "avis",       label: "Avis",            count: ad._count.comments },
            { key: "photos",     label: "Photos",          count: photos.length || undefined },
          ] as { key: typeof activeTab; label: string; count?: number }[]).map(({ key, label, count }) => (
            <button key={key} role="tab" aria-selected={activeTab === key} onClick={() => setActiveTab(key)} style={{ padding: "14px 14px 12px", background: "transparent", border: 0, borderBottom: activeTab === key ? "2px solid var(--horizon-700)" : "2px solid transparent", fontFamily: "inherit", fontSize: 14, fontWeight: 500, color: activeTab === key ? "var(--ink-950)" : "var(--ink-700)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
              {label}{count != null && count > 0 && <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, background: "var(--ink-100)", color: "var(--ink-700)", padding: "2px 6px", borderRadius: 3 }}>{count}</span>}
            </button>
          ))}
        </div>

        {/* STATUS BANNER */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: ad.status === "OPEN" ? "oklch(0.96 0.05 130)" : "oklch(0.96 0.05 25)", border: `1px solid ${ad.status === "OPEN" ? "oklch(0.85 0.07 130)" : "oklch(0.85 0.07 25)"}`, borderRadius: 8, color: ad.status === "OPEN" ? "var(--terrain-800)" : "oklch(0.40 0.15 25)", fontSize: 13, marginBottom: 20 }}>
          {ad.status === "OPEN" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <TriangleAlert className="h-4 w-4 shrink-0" />}
          <span><strong>Aérodrome {ad.status === "OPEN" ? "ouvert" : "fermé"}</strong>{ad.lastSyncedAt && ` · MAJ ${new Date(ad.lastSyncedAt).toLocaleDateString("fr-FR")}`}</span>
        </div>

        {/* LAYOUT */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 32, alignItems: "start" }}>

          {/* ── MAIN ── */}
          <main>

            {/* TAB: INFOS */}
            {activeTab === "infos" && (
              <div>
                <section style={{ marginBottom: 20 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                    {/* Identité */}
                    <div style={{ background: "white", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 22 }}>
                      <div style={asideH}><Info className="h-3 w-3" /> Identité</div>
                      <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", columnGap: 16 }}>
                        {ad.icaoCode && <><dt style={dtS}>Code OACI</dt><dd style={{ ...ddS, fontFamily: "var(--f-mono)" }}>{ad.icaoCode}</dd></>}
                        {ad.iataCode && <><dt style={dtS}>Code IATA</dt><dd style={{ ...ddS, fontFamily: "var(--f-mono)" }}>{ad.iataCode}</dd></>}
                        {ad.altIdentifier && <><dt style={dtS}>Identifiant alt.</dt><dd style={ddS}>{ad.altIdentifier}</dd></>}
                        <dt style={dtS}>Type</dt><dd style={ddS}>{TYPE_LABELS[ad.aerodromeType] || ad.aerodromeType}</dd>
                        <dt style={dtS}>Statut</dt><dd style={ddS}>{STATUS_LABELS[ad.status] ?? ad.status}</dd>
                        <dt style={{ ...dtS, borderBottom: 0 }}>Visites</dt><dd style={{ ...ddS, borderBottom: 0 }}>{visitedCount}</dd>
                      </dl>
                    </div>
                    {/* Position */}
                    <div style={{ background: "white", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 22 }}>
                      <div style={asideH}><MapPin className="h-3 w-3" /> Position</div>
                      <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", columnGap: 16 }}>
                        <dt style={dtS}>Latitude</dt><dd style={{ ...ddS, fontFamily: "var(--f-mono)" }}>{ad.latitude.toFixed(6)}°</dd>
                        <dt style={dtS}>Longitude</dt><dd style={{ ...ddS, fontFamily: "var(--f-mono)" }}>{ad.longitude.toFixed(6)}°</dd>
                        {ad.elevation != null && <><dt style={dtS}>Altitude</dt><dd style={{ ...ddS, fontFamily: "var(--f-mono)" }}>{ad.elevation} ft</dd></>}
                        {[ad.city, ad.department, ad.region].filter(Boolean).length > 0 && <><dt style={dtS}>Localisation</dt><dd style={ddS}>{[ad.city, ad.department, ad.region].filter(Boolean).join(", ")}</dd></>}
                        <dt style={{ ...dtS, borderBottom: 0 }}>Déclinaison mag.</dt><dd style={{ ...ddS, borderBottom: 0, fontFamily: "var(--f-mono)" }}>{formatDeclination(ad.magneticDeclination) ?? "—"}</dd>
                      </dl>
                    </div>
                  </div>
                </section>

                {ad.description && (
                  <section style={{ marginBottom: 20 }}>
                    <div style={{ background: "white", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 22 }}>
                      <div style={asideH}>Description</div>
                      <p style={{ fontSize: 13, color: "var(--ink-800)", lineHeight: 1.6, margin: 0 }}>{ad.description}</p>
                    </div>
                  </section>
                )}

                {(ad.ppr || ad.privateUse || ad.skydiveActivity || ad.winchOnly) && (
                  <section style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                      <div style={sectionMark}><TriangleAlert className="h-3.5 w-3.5" /></div>
                      <h2 style={sectionH2}>Particularités</h2>
                    </div>
                    <div style={{ background: "white", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 22 }}>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                        {ad.ppr && <li style={particWarn}><TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--brass-700)" }} /><p style={particP}><strong>PPR requis</strong> — Permission préalable requise avant d&apos;atterrir.</p></li>}
                        {ad.privateUse && <li style={particInfo}><Info className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--horizon-700)" }} /><p style={particP}><strong>Usage privé</strong> — Accès restreint, réservé aux membres ou propriétaires.</p></li>}
                        {ad.skydiveActivity && <li style={particWarn}><TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--brass-700)" }} /><p style={particP}><strong>Activité parachutage</strong> — Zone de saut active, vigilance accrue requise.</p></li>}
                        {ad.winchOnly && <li style={particNeutral}><Info className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--ink-700)" }} /><p style={particP}><strong>Treuil uniquement</strong> — Pas de remorquage motorisé disponible.</p></li>}
                      </ul>
                    </div>
                  </section>
                )}

                <section style={{ marginBottom: 20 }}>
                  <AerodromeLocationMap aerodromeId={ad.id} name={ad.name} icaoCode={ad.icaoCode} latitude={ad.latitude} longitude={ad.longitude} elevation={ad.elevation} />
                </section>
              </div>
            )}

            {/* TAB: PISTES & FRÉQUENCES */}
            {activeTab === "pistes" && (
              <div>
                {ad.runways.length > 0 && (
                  <section style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                      <div style={sectionMark}><Plane className="h-3.5 w-3.5" /></div>
                      <h2 style={sectionH2}>Pistes</h2>
                      {ad.vacLink && <a href={ad.vacLink} target="_blank" rel="noopener noreferrer" style={sectionAction}>Voir VAC <ExternalLink className="h-3 w-3" /></a>}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                      {ad.runways.map((r) => (
                        <article key={r.id} style={{ border: "1px solid var(--ink-200)", borderRadius: 8, padding: 16, background: "var(--paper-100)" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                            <span style={{ fontFamily: "var(--f-mono)", fontSize: 18, fontWeight: 700, letterSpacing: "0.05em" }}>{r.identifier}</span>
                            {r.trueHeading != null && <span style={{ fontSize: 11, color: "var(--ink-700)", background: "white", padding: "2px 8px", borderRadius: 4, fontFamily: "var(--f-mono)", fontWeight: 600 }}>QFU {r.trueHeading}°</span>}
                          </div>
                          <div style={{ position: "relative", height: 64, background: "var(--paper-50)", border: "1px solid var(--ink-200)", borderRadius: 6, margin: "14px 0 16px", display: "grid", placeItems: "center" }}>
                            <div style={{ position: "relative", width: "80%", height: 14, background: "var(--ink-950)", borderRadius: 1 }}>
                              <span style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: 8, fontFamily: "var(--f-mono)", fontSize: 9, fontWeight: 700, color: "white" }}>{r.identifier.split("/")[0]?.trim() ?? ""}</span>
                              <span style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", right: 8, fontFamily: "var(--f-mono)", fontSize: 9, fontWeight: 700, color: "white" }}>{r.identifier.split("/")[1]?.trim() ?? ""}</span>
                            </div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                            <div style={{ textAlign: "center" }}><div style={{ fontFamily: "var(--f-mono)", fontSize: 15, fontWeight: 600, color: "var(--ink-950)" }}>{r.length} m</div><div style={rwyStatL}>Longueur</div></div>
                            <div style={{ textAlign: "center" }}><div style={{ fontFamily: "var(--f-mono)", fontSize: 15, fontWeight: 600, color: "var(--ink-950)" }}>{r.width != null ? `${r.width} m` : "—"}</div><div style={rwyStatL}>Largeur</div></div>
                            <div style={{ textAlign: "center" }}><div style={{ fontFamily: "var(--f-mono)", fontSize: 13, fontWeight: 600, color: "var(--ink-950)" }}>{SURFACE_NAME_LABELS[r.surface] ?? r.surface}</div><div style={rwyStatL}>Surface</div></div>
                          </div>
                          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {r.mainRunway && <span style={rwyTag}>Principale</span>}
                            {r.lighting && <span style={rwyTagOk}><Check className="h-2.5 w-2.5" /> Balisée</span>}
                            {r.operations != null && <span style={rwyTag}>{RUNWAY_OPERATIONS_LABELS[r.operations] ?? `Code ${r.operations}`}</span>}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                {ad.frequencies.length > 0 && (
                  <section style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                      <div style={sectionMark}><Radio className="h-3.5 w-3.5" /></div>
                      <h2 style={sectionH2}>Fréquences</h2>
                    </div>
                    <div style={{ background: "white", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 22 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {ad.frequencies.map((f) => (
                          <div key={f.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center", padding: "10px 12px", background: "var(--paper-100)", border: "1px solid var(--ink-200)", borderRadius: 6 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--horizon-100)", color: "var(--horizon-700)", display: "grid", placeItems: "center" }}><Radio className="h-3.5 w-3.5" /></div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-950)" }}>{f.type}{f.callsign ? ` · ${f.callsign}` : ""}{f.isPrimary ? " ★" : ""}</div>
                              {f.notes && <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 1 }}>{f.notes}</div>}
                            </div>
                            <div style={{ fontFamily: "var(--f-mono)", fontSize: 14, fontWeight: 600, color: "var(--ink-950)" }}>{f.mhz.toFixed(3)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                )}

                {ad.runways.length === 0 && ad.frequencies.length === 0 && <p style={{ fontSize: 13, color: "var(--ink-500)", textAlign: "center", padding: "48px 0" }}>Aucune donnée disponible.</p>}
              </div>
            )}

            {/* TAB: SERVICES & CARBU */}
            {activeTab === "services" && (
              <div>
                {(ad.handlingFacilities.length > 0 || ad.passengerFacilities.length > 0) && (
                  <section style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                      <div style={sectionMark}><Wrench className="h-3.5 w-3.5" /></div>
                      <h2 style={sectionH2}>Services au sol</h2>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                      {ad.handlingFacilities.length > 0 && (
                        <div style={{ background: "white", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 22 }}>
                          <div style={asideH}>Handling</div>
                          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                            {ad.handlingFacilities.map((code) => (
                              <li key={code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px dashed var(--ink-200)", fontSize: 13, color: "var(--ink-800)" }}>
                                <Check className="h-4 w-4 shrink-0" style={{ color: "var(--terrain-700)" }} />{HANDLING_LABELS[code] ?? `Service code ${code}`}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {ad.passengerFacilities.length > 0 && (
                        <div style={{ background: "white", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 22 }}>
                          <div style={asideH}>Services passagers</div>
                          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                            {ad.passengerFacilities.map((code) => (
                              <li key={code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px dashed var(--ink-200)", fontSize: 13, color: "var(--ink-800)" }}>
                                <Check className="h-4 w-4 shrink-0" style={{ color: "var(--terrain-700)" }} />{PASSENGER_LABELS[code] ?? `Service code ${code}`}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                <section style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <div style={{ ...sectionMark, background: "var(--brass-100)", color: "var(--brass-700)" }}><Fuel className="h-3.5 w-3.5" /></div>
                    <h2 style={sectionH2}>Carburants</h2>
                  </div>
                  <div style={{ background: "white", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 22 }}>
                    {ad.fuels.length === 0 ? (
                      <>
                        <p style={{ fontSize: 13, color: "var(--ink-500)", margin: "0 0 12px" }}>Aucune information carburant disponible.</p>
                        {(nearbyFuelRes?.data ?? []).length > 0 && (
                          <div>
                            <p style={{ fontSize: 12, color: "var(--ink-700)", margin: "0 0 8px" }}>Aérodromes avec carburant à proximité :</p>
                            {(nearbyFuelRes?.data ?? []).map((n) => (
                              <Link key={n.id} href={`/aerodrome/${n.id}`} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px dashed var(--ink-200)", fontSize: 13, color: "var(--ink-800)", textDecoration: "none" }}>
                                <span>{n.icaoCode ? `${n.icaoCode} — ` : ""}{n.name}</span>
                                <span style={{ color: "var(--ink-500)", fontFamily: "var(--f-mono)", fontSize: 12 }}>{fmtDist(n.distanceKm)}</span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
                        {ad.fuels.map((f) => (
                          <div key={f.id} style={{ padding: 12, background: f.available ? "var(--brass-100)" : "var(--paper-100)", border: `1px solid ${f.available ? "oklch(0.85 0.06 75)" : "var(--ink-200)"}`, borderRadius: 6, display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 32, height: 32, background: "white", borderRadius: 6, display: "grid", placeItems: "center", color: f.available ? "var(--brass-700)" : "var(--ink-400)" }}><Fuel className="h-4 w-4" /></div>
                            <div>
                              <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 700, color: f.available ? "var(--brass-700)" : "var(--ink-700)", letterSpacing: "0.04em" }}>{FUEL_LABELS[f.type as keyof typeof FUEL_LABELS] ?? f.type}</div>
                              <div style={{ fontSize: 11, color: "var(--ink-700)", marginTop: 1 }}>{!f.available ? "Non disponible" : f.selfService ? "Self-service" : "Sur demande"}{f.availabilityHours ? ` · ${f.availabilityHours}` : ""}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}

            {/* TAB: COMMODITÉS */}
            {activeTab === "commodites" && (
              <div>
                <section style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <div style={sectionMark}><Home className="h-3.5 w-3.5" /></div>
                    <h2 style={sectionH2}>Commodités à proximité</h2>
                  </div>

                  {/* Sub-tabs */}
                  <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "var(--paper-100)", border: "1px solid var(--ink-200)", borderRadius: 8, padding: 4, width: "fit-content", flexWrap: "wrap" }}>
                    {([
                      { key: "all",       label: "Tous"         },
                      { key: "resto",     label: "Restaurants"  },
                      { key: "hotel",     label: "Hébergement"  },
                      { key: "transport", label: "Transport"    },
                      { key: "bike",      label: "Vélos"        },
                    ] as { key: typeof activeAmenTab; label: string }[]).map(({ key, label }) => (
                      <button key={key} type="button" onClick={() => setActiveAmenTab(key)} style={{ height: 30, padding: "0 12px", background: activeAmenTab === key ? "white" : "transparent", border: 0, borderRadius: 6, fontFamily: "inherit", fontSize: 12, fontWeight: 500, color: activeAmenTab === key ? "var(--ink-950)" : "var(--ink-700)", cursor: "pointer", boxShadow: activeAmenTab === key ? "0 1px 2px rgba(20,30,50,.06)" : "none" }}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Restaurants */}
                  {(activeAmenTab === "all" || activeAmenTab === "resto") && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                      {restaurantsLoading && <p style={{ fontSize: 13, color: "var(--ink-500)" }}>Chargement…</p>}
                      {(restaurantsRes?.data?.restaurants ?? []).filter((r) => r.distanceMeters <= restaurantRadius).slice(0, restaurantLimit).map((r) => (
                        <article key={r.id} style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", gap: 14, alignItems: "center", padding: "12px 14px", border: "1px solid var(--ink-200)", borderRadius: 8, background: "white" }}>
                          <div style={{ width: 36, height: 36, borderRadius: 6, background: "oklch(0.96 0.04 25)", color: "oklch(0.50 0.15 25)", display: "grid", placeItems: "center" }}>
                            {r.amenity === "cafe" ? <Coffee className="h-4 w-4" /> : r.amenity === "bar" ? <Beer className="h-4 w-4" /> : <Utensils className="h-4 w-4" />}
                          </div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-950)" }}>{r.name}</div>
                            {r.cuisine.length > 0 && <div style={{ fontSize: 12, color: "var(--ink-700)", marginTop: 2 }}>{r.cuisine.join(", ")}</div>}
                            <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                              <span>{r.distanceMeters < 1000 ? `${r.distanceMeters} m` : `${(r.distanceMeters / 1000).toFixed(1)} km`} · {r.accessibility === "walkable" ? "à pied" : "à proximité"}</span>
                              {r.isOpenNow !== null && <span style={{ color: r.isOpenNow ? "var(--terrain-700)" : "oklch(0.55 0.15 25)" }}>{r.isOpenNow ? "Ouvert" : "Fermé"}</span>}
                            </div>
                          </div>
                          {r.website && <a href={r.website} target="_blank" rel="noopener noreferrer" style={{ width: 32, height: 32, border: "1px solid var(--ink-300)", borderRadius: 6, display: "grid", placeItems: "center", color: "var(--ink-950)", textDecoration: "none" }}><ExternalLink className="h-3.5 w-3.5" /></a>}
                        </article>
                      ))}
                      {!restaurantsLoading && !restaurantsError && (restaurantsRes?.data?.restaurants ?? []).length === 0 && activeAmenTab === "resto" && <p style={{ fontSize: 13, color: "var(--ink-500)" }}>Aucun restaurant trouvé à proximité.</p>}
                    </div>
                  )}

                  {/* Hébergement */}
                  {(activeAmenTab === "all" || activeAmenTab === "hotel") && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                      {(accommodationRes?.data?.accommodations ?? []).slice(0, accommodationLimit).map((a) => (
                        <article key={a.id} style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", gap: 14, alignItems: "center", padding: "12px 14px", border: "1px solid var(--ink-200)", borderRadius: 8, background: "white" }}>
                          <div style={{ width: 36, height: 36, borderRadius: 6, background: "oklch(0.96 0.04 290)", color: "oklch(0.50 0.15 290)", display: "grid", placeItems: "center" }}><Home className="h-4 w-4" /></div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-950)" }}>{a.name}</div>
                            <div style={{ fontSize: 12, color: "var(--ink-700)", marginTop: 2 }}>{a.category === "camping" ? "Camping" : a.category === "hotel" ? "Hôtel" : "Chambre d'hôtes"}{a.stars ? ` · ${"★".repeat(a.stars)}` : ""}{a.rooms ? ` · ${a.rooms} ch.` : ""}</div>
                            <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>{a.distanceMeters < 1000 ? `${a.distanceMeters} m` : `${(a.distanceMeters / 1000).toFixed(1)} km`}</div>
                          </div>
                          {a.website && <a href={a.website} target="_blank" rel="noopener noreferrer" style={{ width: 32, height: 32, border: "1px solid var(--ink-300)", borderRadius: 6, display: "grid", placeItems: "center", color: "var(--ink-950)", textDecoration: "none" }}><ExternalLink className="h-3.5 w-3.5" /></a>}
                        </article>
                      ))}
                      {!accommodationLoading && !accommodationError && (accommodationRes?.data?.accommodations ?? []).length === 0 && activeAmenTab === "hotel" && <p style={{ fontSize: 13, color: "var(--ink-500)" }}>Aucun hébergement trouvé à proximité.</p>}
                    </div>
                  )}

                  {/* Transport */}
                  {(activeAmenTab === "all" || activeAmenTab === "transport") && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                      {(transportRes?.data?.transports ?? []).filter((t) => t.type !== "bike").slice(0, transportLimit).map((t) => (
                        <article key={t.id} style={{ display: "grid", gridTemplateColumns: "40px 1fr", gap: 14, alignItems: "center", padding: "12px 14px", border: "1px solid var(--ink-200)", borderRadius: 8, background: "white" }}>
                          <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--horizon-100)", color: "var(--horizon-700)", display: "grid", placeItems: "center" }}>{t.type === "train" ? <Train className="h-4 w-4" /> : <Bus className="h-4 w-4" />}</div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-950)" }}>{t.name}</div>
                            {t.operator && <div style={{ fontSize: 12, color: "var(--ink-700)", marginTop: 2 }}>{t.operator}{t.network ? ` · ${t.network}` : ""}</div>}
                            <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>{t.distanceMeters < 1000 ? `${t.distanceMeters} m` : `${(t.distanceMeters / 1000).toFixed(1)} km`}</div>
                          </div>
                        </article>
                      ))}
                      {!transportLoading && !transportError && (transportRes?.data?.transports ?? []).filter((t) => t.type !== "bike").length === 0 && activeAmenTab === "transport" && <p style={{ fontSize: 13, color: "var(--ink-500)" }}>Aucun transport trouvé à proximité.</p>}
                    </div>
                  )}

                  {/* Vélos */}
                  {(activeAmenTab === "all" || activeAmenTab === "bike") && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                      {(transportRes?.data?.transports ?? []).filter((t) => t.type === "bike").slice(0, bikeLimit).map((t) => (
                        <article key={t.id} style={{ display: "grid", gridTemplateColumns: "40px 1fr", gap: 14, alignItems: "center", padding: "12px 14px", border: "1px solid var(--ink-200)", borderRadius: 8, background: "white" }}>
                          <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--terrain-100)", color: "var(--terrain-700)", display: "grid", placeItems: "center" }}><Bike className="h-4 w-4" /></div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-950)" }}>{t.name}</div>
                            {t.operator && <div style={{ fontSize: 12, color: "var(--ink-700)", marginTop: 2 }}>{t.operator}</div>}
                            <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>{t.distanceMeters < 1000 ? `${t.distanceMeters} m` : `${(t.distanceMeters / 1000).toFixed(1)} km`}</div>
                          </div>
                        </article>
                      ))}
                      {!transportLoading && (transportRes?.data?.transports ?? []).filter((t) => t.type === "bike").length === 0 && activeAmenTab === "bike" && <p style={{ fontSize: 13, color: "var(--ink-500)" }}>Aucune station vélo trouvée à proximité.</p>}
                    </div>
                  )}

                  {/* Aérodromes voisins */}
                  {activeAmenTab === "all" && nearbyAerodromes.length > 0 && (
                    <div style={{ marginTop: 24 }}>
                      <div style={asideH}>Aérodromes voisins</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {nearbyAerodromes.map((n) => (
                          <Link key={n.id} href={`/aerodrome/${n.id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", border: "1px solid var(--ink-200)", borderRadius: 8, background: "white", textDecoration: "none", color: "inherit" }}>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{n.icaoCode ? `${n.icaoCode} — ` : ""}{n.name}{(n.fuels ?? []).some((f) => f.available) ? " ⛽" : ""}</span>
                            <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--ink-500)" }}>{fmtDist(n.distanceKm)}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* TAB: MÉTÉO */}
            {activeTab === "meteo" && (
              <div>
                <section style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <div style={sectionMark}><Cloud className="h-3.5 w-3.5" /></div>
                    <h2 style={sectionH2}>Météo aéronautique</h2>
                  </div>
                  <WeatherCard weather={weatherRes?.data ?? null} loading={weatherLoading} authenticated={!!user} />
                </section>
              </div>
            )}

            {/* TAB: AVIS */}
            {activeTab === "avis" && (
              <div>
                {events.length > 0 && (
                  <section style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                      <div style={sectionMark}><CalendarDays className="h-3.5 w-3.5" /></div>
                      <h2 style={sectionH2}>Événements</h2>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {events.map((ev) => (
                        <div key={ev.id} style={{ background: "white", border: "1px solid var(--ink-200)", borderRadius: 8, padding: 16 }}>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-950)", marginBottom: 4 }}>{ev.title}</div>
                              <div style={{ fontSize: 12, color: "var(--ink-500)" }}>{EVENT_TYPE_LABELS[ev.type] ?? ev.type} · {new Date(ev.startDate).toLocaleDateString("fr-FR")}{ev.endDate ? ` → ${new Date(ev.endDate).toLocaleDateString("fr-FR")}` : ""}</div>
                              {ev.description && <p style={{ fontSize: 13, color: "var(--ink-700)", margin: "8px 0 0", lineHeight: 1.5 }}>{ev.description}</p>}
                            </div>
                            {user?.id === ev.user?.id && <button type="button" onClick={() => handleDeleteEvent(ev.id)} style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--ink-500)", padding: 4 }}><Trash2 className="h-4 w-4" /></button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <div style={sectionMark}><MessageSquare className="h-3.5 w-3.5" /></div>
                    <h2 style={sectionH2}>Avis & retours pilotes</h2>
                  </div>
                  <div style={{ background: "white", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 22 }}>
                    {commentActionAlert && <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 6, background: commentActionAlert.type === "success" ? "oklch(0.96 0.05 130)" : "oklch(0.96 0.05 25)", border: `1px solid ${commentActionAlert.type === "success" ? "oklch(0.85 0.07 130)" : "oklch(0.85 0.07 25)"}`, color: commentActionAlert.type === "success" ? "var(--terrain-800)" : "oklch(0.40 0.15 25)", fontSize: 13 }}>{commentActionAlert.message}</div>}
                    {comments.length === 0 ? (
                      <p style={{ fontSize: 13, color: "var(--ink-500)", textAlign: "center", padding: "24px 0" }}>Aucun commentaire. Soyez le premier à partager votre expérience !</p>
                    ) : (
                      <div style={{ marginBottom: 24 }}>{comments.map((comment) => renderCommentCard(comment))}</div>
                    )}
                    {user ? (
                      <form onSubmit={handleComment} style={{ borderTop: "1px solid var(--ink-200)", paddingTop: 16 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Laisser un avis</p>
                        <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Partagez votre expérience..." maxLength={2000} rows={3} style={{ width: "100%", borderRadius: 6, border: "1px solid var(--ink-200)", background: "var(--paper-50)", padding: "10px 12px", fontSize: 14, color: "var(--ink-950)", resize: "vertical", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                          <button type="submit" disabled={!commentText.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px", background: "var(--ink-950)", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: !commentText.trim() ? 0.5 : 1 }}><Send className="h-4 w-4" /> Publier</button>
                        </div>
                      </form>
                    ) : (
                      <div style={{ borderTop: "1px solid var(--ink-200)", paddingTop: 16, textAlign: "center" }}>
                        <p style={{ fontSize: 13, color: "var(--ink-700)" }}><Link href="/login" style={{ color: "var(--horizon-700)", fontWeight: 600 }}>Connectez-vous</Link> pour laisser un avis.</p>
                      </div>
                    )}
                  </div>
                </section>

                {user && (
                  <section style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                      <div style={sectionMark}><CalendarDays className="h-3.5 w-3.5" /></div>
                      <h2 style={sectionH2}>Proposer un événement</h2>
                    </div>
                    <div style={{ background: "white", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 22 }}>
                      {eventAlert && <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 6, background: eventAlert.type === "success" ? "oklch(0.96 0.05 130)" : "oklch(0.96 0.05 25)", border: `1px solid ${eventAlert.type === "success" ? "oklch(0.85 0.07 130)" : "oklch(0.85 0.07 25)"}`, color: eventAlert.type === "success" ? "var(--terrain-800)" : "oklch(0.40 0.15 25)", fontSize: 13 }}>{eventAlert.message}</div>}
                      {eventForm === null ? (
                        <button type="button" onClick={() => setEventForm({ type: "OTHER", title: "", description: "", startDate: "", endDate: "" })} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px", border: "1px solid var(--ink-300)", borderRadius: 8, background: "white", color: "var(--ink-950)", fontFamily: "inherit", fontSize: 13, fontWeight: 500, cursor: "pointer" }}><CalendarDays className="h-4 w-4" /> Signaler un événement</button>
                      ) : (
                        <form onSubmit={handleSubmitEvent} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <div><label style={labelS}>Type d&apos;événement</label><select value={eventForm.type} onChange={(e) => setEventForm({ ...eventForm, type: e.target.value as EventItem["type"] })} style={selectS}>{EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_TYPE_LABELS[t] ?? t}</option>)}</select></div>
                          <div><label style={labelS}>Titre *</label><input type="text" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} required maxLength={200} style={inputS} /></div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div><label style={labelS}>Date début *</label><input type="date" value={eventForm.startDate} onChange={(e) => setEventForm({ ...eventForm, startDate: e.target.value })} required style={inputS} /></div>
                            <div><label style={labelS}>Date fin</label><input type="date" value={eventForm.endDate} onChange={(e) => setEventForm({ ...eventForm, endDate: e.target.value })} style={inputS} /></div>
                          </div>
                          <div><label style={labelS}>Description</label><textarea value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} rows={3} maxLength={1000} style={{ ...inputS, resize: "vertical" }} /></div>
                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button type="button" onClick={() => setEventForm(null)} style={{ display: "inline-flex", alignItems: "center", height: 40, padding: "0 16px", border: "1px solid var(--ink-300)", borderRadius: 8, background: "white", color: "var(--ink-950)", fontFamily: "inherit", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Annuler</button>
                            <button type="submit" disabled={!eventForm.title.trim() || !eventForm.startDate} style={{ display: "inline-flex", alignItems: "center", height: 40, padding: "0 16px", background: "var(--ink-950)", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: (!eventForm.title.trim() || !eventForm.startDate) ? 0.5 : 1 }}>Soumettre</button>
                          </div>
                        </form>
                      )}
                    </div>
                  </section>
                )}

                <section style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <div style={sectionMark}><PencilLine className="h-3.5 w-3.5" /></div>
                    <h2 style={sectionH2}>Contributions communautaires</h2>
                  </div>
                  <div style={{ background: "white", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 22 }}>
                    {correctionActionAlert && <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 6, background: correctionActionAlert.type === "success" ? "oklch(0.96 0.05 130)" : "oklch(0.96 0.05 25)", border: `1px solid ${correctionActionAlert.type === "success" ? "oklch(0.85 0.07 130)" : "oklch(0.85 0.07 25)"}`, color: correctionActionAlert.type === "success" ? "var(--terrain-800)" : "oklch(0.40 0.15 25)", fontSize: 13 }}>{correctionActionAlert.message}</div>}
                    {communityCorrections.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        {communityCorrections.map((c) => (
                          <div key={c.id} style={{ borderBottom: "1px solid var(--ink-200)", padding: "12px 0" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-700)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--f-mono)" }}>{formatCommunityFieldLabel(c.field)}</span>
                              <span style={{ fontSize: 11, color: "var(--ink-500)" }}>{new Date(c.createdAt).toLocaleDateString("fr-FR")}</span>
                            </div>
                            <p style={{ fontSize: 13, color: "var(--ink-800)", margin: "4px 0" }}>{c.proposedValue}</p>
                            {c.reason && <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "4px 0 0" }}>Motif : {c.reason}</p>}
                            {user && user.id !== c.user.id && <button type="button" onClick={() => handleReportCorrection(c.id)} style={{ marginTop: 8, background: "transparent", border: 0, cursor: "pointer", fontSize: 12, color: "var(--ink-500)", padding: 0 }}>Signaler</button>}
                          </div>
                        ))}
                      </div>
                    )}
                    <form onSubmit={handleSubmitCorrection} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Proposer une correction</p>
                      <div><label style={labelS}>Champ à corriger</label><select value={correctionField} onChange={(e) => setCorrectionField(e.target.value as typeof correctionField)} style={selectS}>{COMMUNITY_FIELD_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
                      {correctionField === "other" && <div><label style={labelS}>Précisez le champ</label><Input value={customCorrectionField} onChange={(e) => setCustomCorrectionField(e.target.value)} maxLength={100} /></div>}
                      <div><label style={labelS}>Valeur proposée</label><textarea value={correctionValue} onChange={(e) => setCorrectionValue(e.target.value)} rows={3} maxLength={2000} style={{ ...inputS, resize: "vertical" }} /></div>
                      <div><label style={labelS}>Motif (optionnel)</label><Input value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} maxLength={500} /></div>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}><button type="submit" disabled={!correctionValue.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px", background: "var(--ink-950)", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: !correctionValue.trim() ? 0.5 : 1 }}><Send className="h-4 w-4" /> Envoyer</button></div>
                    </form>
                  </div>
                </section>
              </div>
            )}

            {/* TAB: PHOTOS */}
            {activeTab === "photos" && (
              <div>
                <section style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <div style={sectionMark}><ImagePlus className="h-3.5 w-3.5" /></div>
                    <h2 style={sectionH2}>Photos</h2>
                  </div>
                  <PhotoUpload aerodromeId={ad.id} existingPhotos={photos} currentUserId={user?.id} canUpload={!!user} onUploadSuccess={(photo) => setPhotos((prev) => [photo, ...prev])} onDeleteSuccess={(photoId) => setPhotos((prev) => prev.filter((p) => p.id !== photoId))} />
                </section>
              </div>
            )}

          </main>

          {/* ── ASIDE ── */}
          <aside style={{ position: "sticky", top: 116, display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Actions */}
            <div style={{ background: "white", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 18 }}>
              <div style={asideH}><CheckCircle2 className="h-3 w-3" /> Mes actions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Link href={`/planner?to=${ad.id}`} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 40, padding: "0 16px", background: "var(--ink-950)", color: "white", borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: "none" }}><Send className="h-4 w-4" /> Planifier un vol</Link>
                {user && <button type="button" onClick={() => handleVisit("VISITED")} disabled={isVisitUpdating} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 40, padding: "0 16px", border: "1px solid var(--ink-300)", borderRadius: 8, background: "white", color: "var(--ink-950)", fontFamily: "inherit", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: isVisitUpdating ? 0.6 : 1 }}><CheckCircle2 className="h-4 w-4" /> {isVisited ? "Aérodex ✓" : "Ajouter à l'Aérodex"}</button>}
                {user && <button type="button" onClick={() => handleVisit("FAVORITE")} disabled={isVisitUpdating} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 40, padding: "0 16px", border: "1px solid var(--ink-300)", borderRadius: 8, background: "white", color: "var(--ink-950)", fontFamily: "inherit", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: isVisitUpdating ? 0.6 : 1 }}><Star className="h-4 w-4" style={{ fill: isFavorite ? "var(--brass-500)" : "none", color: isFavorite ? "var(--brass-500)" : "var(--ink-950)" }} /> {isFavorite ? "Favori ✓" : "Ajouter aux favoris"}</button>}
                {ad.vacLink && <a href={ad.vacLink} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 40, padding: "0 16px", border: "1px solid var(--ink-300)", borderRadius: 8, background: "white", color: "var(--ink-950)", fontSize: 13, fontWeight: 500, textDecoration: "none" }}><FileText className="h-4 w-4" /> Voir la VAC officielle</a>}

                {user && userLists.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Mes listes</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {userLists.map((list) => {
                        const active = isInList(list);
                        return (
                          <button key={list.id} type="button" onClick={() => { if (active) removeFromListMutation.mutate(list.id); else addToListMutation.mutate(list.id); }} disabled={addToListMutation.isPending || removeFromListMutation.isPending} style={{ height: 28, padding: "0 12px", borderRadius: 999, border: active ? "none" : "1px solid var(--ink-300)", background: active ? "var(--ink-950)" : "white", color: active ? "white" : "var(--ink-700)", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, opacity: (addToListMutation.isPending || removeFromListMutation.isPending) ? 0.6 : 1 }}>
                            {active && <Check className="h-3 w-3" />}{list.name}
                          </button>
                        );
                      })}
                      <button type="button" onClick={() => { setNewListName(""); setNewListDialogOpen(true); }} style={{ height: 28, padding: "0 12px", borderRadius: 999, border: "1px solid var(--ink-200)", background: "transparent", color: "var(--ink-500)", fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>+ Nouvelle liste</button>
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 4 }}>
                  <button type="button" onClick={() => { if (navigator.share) navigator.share({ title: ad.name, url: window.location.href }).catch(() => {}); else navigator.clipboard.writeText(window.location.href).catch(() => {}); }} style={{ height: 36, background: "white", border: "1px solid var(--ink-300)", borderRadius: 8, cursor: "pointer", color: "var(--ink-950)", display: "inline-flex", alignItems: "center", justifyContent: "center" }} aria-label="Partager"><Share2 className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => window.print()} style={{ height: 36, background: "white", border: "1px solid var(--ink-300)", borderRadius: 8, cursor: "pointer", color: "var(--ink-950)", display: "inline-flex", alignItems: "center", justifyContent: "center" }} aria-label="Imprimer"><Printer className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={async () => { const r = window.prompt("Pourquoi signalez-vous cette fiche ?"); if (!r?.trim()) return; try { await apiClient.post(`/aerodromes/${id}/reports`, { targetType: "aerodrome", targetId: id, reason: r.trim() }); } catch { /* ignore */ } }} style={{ height: 36, background: "white", border: "1px solid var(--ink-300)", borderRadius: 8, cursor: "pointer", color: "var(--ink-950)", display: "inline-flex", alignItems: "center", justifyContent: "center" }} aria-label="Signaler"><Flag className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>

            {/* Weather mini */}
            {user && (
              <div style={{ background: "white", border: "1px solid var(--ink-200)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "18px 18px 0", fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-500)", display: "flex", alignItems: "center", gap: 6 }}><Cloud className="h-3 w-3" /> Météo</div>
                {weatherLoading ? (
                  <div style={{ padding: 18 }}><p style={{ fontSize: 12, color: "var(--ink-500)", margin: 0 }}>Chargement…</p></div>
                ) : weatherRes?.data?.metar ? (
                  <>
                    <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "auto 1fr", gap: 14, alignItems: "center", padding: "16px 18px", background: "linear-gradient(180deg, var(--horizon-100) 0%, var(--horizon-50) 100%)" }}>
                      <div style={{ width: 48, height: 48, background: "white", borderRadius: 8, display: "grid", placeItems: "center", color: "var(--horizon-700)" }}><Cloud className="h-6 w-6" /></div>
                      <div>
                        <div style={{ fontFamily: "var(--f-serif)", fontWeight: 500, fontSize: 28, lineHeight: 1, color: "var(--ink-950)", letterSpacing: "-0.02em" }}>{weatherRes.data.metar.temperature_c != null ? `${weatherRes.data.metar.temperature_c}°` : "—"}</div>
                        <div style={{ fontSize: 12, color: "var(--ink-700)", marginTop: 2 }}>{weatherRes.data.metar.flight_category ?? ""}{weatherRes.data.metar.conditions.length > 0 ? ` · ${weatherRes.data.metar.conditions.map((c) => c.text || c.code).join(", ")}` : ""}</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid var(--ink-200)" }}>
                      {weatherRes.data.metar.wind && <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--ink-700)", display: "flex", alignItems: "center", gap: 6 }}><Wind className="h-3 w-3" style={{ color: "var(--ink-500)" }} /><strong style={{ color: "var(--ink-950)", fontWeight: 600 }}>{weatherRes.data.metar.wind.degrees != null ? `${weatherRes.data.metar.wind.degrees}°` : "VRB"}/{weatherRes.data.metar.wind.speed_kts}kt</strong></div>}
                      {weatherRes.data.metar.pressure_hpa && <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--ink-700)", display: "flex", alignItems: "center", gap: 6, borderLeft: "1px solid var(--ink-200)" }}><Gauge className="h-3 w-3" style={{ color: "var(--ink-500)" }} />QNH <strong style={{ color: "var(--ink-950)", fontWeight: 600 }}>{weatherRes.data.metar.pressure_hpa}</strong></div>}
                    </div>
                    {weatherRes.data.metar.raw && <div style={{ padding: "12px 18px", background: "var(--ink-950)", color: "oklch(0.85 0.05 130)", fontFamily: "var(--f-mono)", fontSize: 11, lineHeight: 1.6, borderTop: "1px solid var(--ink-200)" }}><span style={{ color: "var(--ink-500)", marginRight: 6 }}>METAR</span>{weatherRes.data.metar.raw.split(" ").slice(2).join(" ")}</div>}
                    <div style={{ padding: "10px 18px", borderTop: "1px solid var(--ink-200)" }}><button type="button" onClick={() => setActiveTab("meteo")} style={{ fontSize: 12, color: "var(--horizon-700)", background: "transparent", border: 0, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>Voir la météo complète →</button></div>
                  </>
                ) : (
                  <div style={{ padding: 18 }}><button type="button" onClick={() => setActiveTab("meteo")} style={{ fontSize: 12, color: "var(--horizon-700)", background: "transparent", border: 0, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>Voir la météo →</button></div>
                )}
              </div>
            )}

            {/* Liens officiels */}
            {(ad.websiteUrl || ad.aipLink || ad.vacLink) && (
              <div style={{ background: "white", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 18 }}>
                <div style={asideH}><ExternalLink className="h-3 w-3" /> Liens officiels</div>
                <div>
                  {ad.websiteUrl && (
                    <a href={ad.websiteUrl} target="_blank" rel="noopener noreferrer" style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: (ad.aipLink || ad.vacLink) ? "1px dashed var(--ink-200)" : "none", textDecoration: "none" }}>
                      <ExternalLink className="h-3.5 w-3.5" style={{ color: "var(--ink-500)" }} />
                      <div><div style={contactLabel}>Site officiel</div><div style={contactValue}>{(() => { try { return new URL(ad.websiteUrl).hostname; } catch { return ad.websiteUrl; } })()}</div></div>
                      <ExternalLink className="h-3 w-3" style={{ color: "var(--ink-400)" }} />
                    </a>
                  )}
                  {ad.aipLink && (
                    <a href={ad.aipLink} target="_blank" rel="noopener noreferrer" style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: ad.vacLink ? "1px dashed var(--ink-200)" : "none", textDecoration: "none" }}>
                      <FileText className="h-3.5 w-3.5" style={{ color: "var(--ink-500)" }} />
                      <div><div style={contactLabel}>AIP</div><div style={contactValue}>Documentation officielle SIA</div></div>
                      <ExternalLink className="h-3 w-3" style={{ color: "var(--ink-400)" }} />
                    </a>
                  )}
                  {ad.vacLink && (
                    <a href={ad.vacLink} target="_blank" rel="noopener noreferrer" style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 12, alignItems: "center", padding: "10px 0", textDecoration: "none" }}>
                      <Download className="h-3.5 w-3.5" style={{ color: "var(--ink-500)" }} />
                      <div><div style={contactLabel}>VAC</div><div style={contactValue}>Vue en approche et circuits</div></div>
                      <ExternalLink className="h-3 w-3" style={{ color: "var(--ink-400)" }} />
                    </a>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>

        {/* FOOTER NOTICE */}
        <div style={{ marginTop: 28, padding: "12px 18px", background: "oklch(0.97 0.04 85)", border: "1px solid oklch(0.90 0.05 85)", borderRadius: 8, fontSize: 12, color: "var(--ink-700)", display: "flex", alignItems: "center", gap: 10 }}>
          <Info className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--ink-500)" }} />
          <span>Les informations affichées sont indicatives et ne sauraient se substituer à la VAC en vigueur. Consultez les NOTAMs avant chaque vol.{ad.source && ` · Source : ${ad.source}`}</span>
        </div>
      </div>

      {/* MOBILE BOTTOM BAR */}
      <div className="fixed bottom-0 left-0 right-0 flex gap-2 border-t border-[var(--ink-200)] bg-[rgba(253,252,249,.96)] p-2.5 backdrop-blur-md sm:hidden" style={{ zIndex: 30 }}>
        <Link href={`/planner?to=${ad.id}`} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--ink-950)] px-4 py-2.5 text-[13px] font-medium text-white"><Send className="h-4 w-4" /> Planifier</Link>
        {user && <button type="button" onClick={() => handleVisit("VISITED")} disabled={isVisitUpdating} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--ink-300)] bg-white px-4 py-2.5 text-[13px] font-medium text-[var(--ink-950)] disabled:opacity-60"><CheckCircle2 className="h-4 w-4" /> Aérodex</button>}
        <button type="button" onClick={() => { if (navigator.share) navigator.share({ title: ad.name, url: window.location.href }).catch(() => {}); else navigator.clipboard.writeText(window.location.href).catch(() => {}); }} className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--ink-300)] bg-white text-[var(--ink-950)]"><Share2 className="h-4 w-4" /></button>
      </div>

      {/* NEW LIST DIALOG */}
      {newListDialogOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)" }} onClick={() => setNewListDialogOpen(false)}>
          <div style={{ background: "white", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 24, width: 400, maxWidth: "calc(100vw - 32px)", boxShadow: "0 14px 36px -12px rgba(20,30,50,.18)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "var(--f-serif)", fontWeight: 500, fontSize: 20, margin: "0 0 16px" }}>Créer une nouvelle liste</h3>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-700)", display: "block", marginBottom: 6 }}>Nom de la liste</label>
            <input type="text" value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="Ex. Escales Bretagne..." maxLength={100} autoFocus style={{ width: "100%", borderRadius: 6, border: "1px solid var(--ink-200)", padding: "10px 12px", fontSize: 14, fontFamily: "inherit", background: "var(--paper-50)", color: "var(--ink-950)", outline: "none", boxSizing: "border-box" }} />
            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setNewListDialogOpen(false)} style={{ display: "inline-flex", alignItems: "center", height: 40, padding: "0 16px", border: "1px solid var(--ink-300)", borderRadius: 8, background: "white", color: "var(--ink-950)", fontFamily: "inherit", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Annuler</button>
              <button type="button" onClick={() => { const n = newListName.trim(); if (!n) return; createListMutation.mutate(n); setNewListDialogOpen(false); }} disabled={!newListName.trim() || createListMutation.isPending} style={{ display: "inline-flex", alignItems: "center", height: 40, padding: "0 16px", background: "var(--ink-950)", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: (!newListName.trim() || createListMutation.isPending) ? 0.6 : 1 }}>Créer</button>
            </div>
          </div>
        </div>
      )}
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
