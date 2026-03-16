"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
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

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; displayName: string | null };
}

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
  const comments = commentsRes?.data ?? [];

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
        Loading aerodrome details...
      </div>
    );
  }

  if (!ad) {
    return (
      <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
        Aerodrome not found.
      </div>
    );
  }

  const amenities = [
    { icon: Utensils, label: "Restaurant", active: ad.hasRestaurant },
    { icon: Bike, label: "Bikes", active: ad.hasBikes },
    { icon: Bus, label: "Transport", active: ad.hasTransport },
    { icon: Home, label: "Accommodation", active: ad.hasAccommodation },
    { icon: Wrench, label: "Maintenance", active: ad.hasMaintenance },
    { icon: Plane, label: "Hangars", active: ad.hasHangars },
    { icon: Moon, label: "Night Ops", active: ad.nightOperations },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold">{ad.name}</h1>
          {ad.icaoCode && (
            <Badge variant="secondary" className="text-lg">
              {ad.icaoCode}
            </Badge>
          )}
          <Badge variant={ad.status === "OPEN" ? "success" : "warning"}>
            {ad.status}
          </Badge>
        </div>
        <p className="text-muted-foreground flex items-center gap-1">
          <MapPin className="h-4 w-4" />
          {[ad.city, ad.department, ad.region].filter(Boolean).join(", ")}
          {ad.elevation && ` — ${ad.elevation} ft`}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {ad.latitude.toFixed(4)}°N, {ad.longitude.toFixed(4)}°E
        </p>

        {/* Visit buttons (authenticated only) */}
        {user && (
          <div className="flex gap-2 mt-4">
            <Button size="sm" variant="outline" onClick={() => handleVisit("SEEN")}>
              <Eye className="mr-1 h-4 w-4" /> Seen
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleVisit("VISITED")}>
              <Star className="mr-1 h-4 w-4" /> Visited
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleVisit("FAVORITE")}>
              <Heart className="mr-1 h-4 w-4" /> Favorite
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
              <Plane className="h-5 w-5" /> Runways
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ad.runways.length === 0 ? (
              <p className="text-muted-foreground">No runway data available.</p>
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
                      {r.lighting && <Badge variant="secondary">Lit</Badge>}
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
              <Radio className="h-5 w-5" /> Frequencies
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ad.frequencies.length === 0 ? (
              <p className="text-muted-foreground">No frequency data available.</p>
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
              <Fuel className="h-5 w-5" /> Fuel
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ad.fuels.length === 0 ? (
              <p className="text-muted-foreground">No fuel data available.</p>
            ) : (
              <div className="space-y-2">
                {ad.fuels.map((f) => (
                  <div key={f.id} className="flex items-center justify-between">
                    <span>
                      {f.type.replace("_", " ")}
                      {f.selfService && " (Self-service)"}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant={f.available ? "success" : "destructive"}>
                        {f.available ? "Available" : "Unavailable"}
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
            <CardTitle className="text-lg">Pilot Amenities</CardTitle>
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

        {/* Links */}
        {(ad.aipLink || ad.vacLink || ad.websiteUrl) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Official Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ad.aipLink && (
                <a
                  href={ad.aipLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" /> AIP Page
                </a>
              )}
              {ad.vacLink && (
                <a
                  href={ad.vacLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" /> VAC Chart
                </a>
              )}
              {ad.websiteUrl && (
                <a
                  href={ad.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" /> Website
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {/* Comments */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5" /> Comments ({ad._count.comments})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user && (
              <form onSubmit={handleComment} className="flex gap-2 mb-4">
                <Input
                  placeholder="Share your experience..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  maxLength={2000}
                />
                <Button type="submit" disabled={!commentText.trim()}>
                  Post
                </Button>
              </form>
            )}
            {comments.length === 0 ? (
              <p className="text-muted-foreground">No comments yet. Be the first to share!</p>
            ) : (
              <div className="space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">
                        {c.user.displayName || "Anonymous"}
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
              User contributions licensed under CC BY-SA 4.0.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
