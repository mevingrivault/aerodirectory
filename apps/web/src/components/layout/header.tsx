"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api-client";
import type { NotificationItem } from "@aerodirectory/shared";
import {
  Plane,
  Search,
  Map,
  BookOpen,
  LogIn,
  LogOut,
  User,
  Navigation,
  Menu,
  X,
  Bell,
  CheckCheck,
} from "lucide-react";

const navLinks = (isAuthenticated: boolean) => [
  { href: "/search", icon: Search, label: "Recherche" },
  { href: "/map", icon: Map, label: "Carte" },
  ...(isAuthenticated
    ? [
        { href: "/aerodex", icon: BookOpen, label: "Carnet" },
        { href: "/planner", icon: Navigation, label: "Planificateur" },
      ]
    : []),
];

export function Header() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [communityConsentLoading, setCommunityConsentLoading] = useState(false);
  const [communityConsentError, setCommunityConsentError] = useState("");
  const [communityVisibility, setCommunityVisibility] = useState({
    showCommunityProfile: false,
    showCommunityContributions: true,
    showCommunityPhotos: true,
  });

  const queryClient = useQueryClient();

  const { data: notificationsRes } = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      apiClient.get<NotificationItem[]>("/notifications", {
        page: "1",
        limit: "20",
      }),
    enabled: !!user,
    staleTime: 60_000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiClient.post("/notifications/read", { all: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const notifications = notificationsRes?.data ?? [];
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const shouldPromptCommunityConsent = !!user && !user.communityConsentAt;

  useEffect(() => {
    if (!user) {
      return;
    }

    setCommunityVisibility({
      showCommunityProfile: user.showCommunityProfile,
      showCommunityContributions: user.showCommunityContributions,
      showCommunityPhotos: user.showCommunityPhotos,
    });
  }, [
    user,
    user?.showCommunityContributions,
    user?.showCommunityPhotos,
    user?.showCommunityProfile,
  ]);

  const links = [
    ...navLinks(!!user),
    ...(user?.role === "ADMIN"
      ? [{ href: "/admin", icon: User, label: "Admin" }]
      : []),
  ];

  const handleConfirmCommunityConsent = async () => {
    setCommunityConsentLoading(true);
    setCommunityConsentError("");

    try {
      await apiClient.put("/auth/profile", {
        ...communityVisibility,
        communityProfileConsentAcknowledged: true,
      });
      window.location.reload();
    } catch (error) {
      setCommunityConsentError(
        error instanceof Error
          ? error.message
          : "Impossible d'enregistrer vos preferences communautaires.",
      );
    } finally {
      setCommunityConsentLoading(false);
    }
  };

  return (
    <>
      {shouldPromptCommunityConsent && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-xl border bg-background p-6 shadow-xl">
            <h2 className="text-xl font-semibold">Confidentialite communautaire</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Comme l&apos;app evolue, on vous demande de confirmer vos reglages communautaires.
              Votre profil public reste masque par defaut. Vos commentaires et vos photos
              validees restent publics par defaut tant que vous ne changez pas ces options.
            </p>

            <div className="mt-4 space-y-3">
              <label className="flex items-start justify-between gap-4 rounded-md border p-3 text-sm">
                <span>
                  <span className="font-medium">Afficher mon profil communautaire</span>
                  <span className="mt-1 block text-muted-foreground">
                    Rend votre pseudo, votre bio et votre terrain de rattachement visibles sur une page publique.
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={communityVisibility.showCommunityProfile}
                  onChange={(event) =>
                    setCommunityVisibility((current) => ({
                      ...current,
                      showCommunityProfile: event.target.checked,
                    }))
                  }
                />
              </label>

              <label className="flex items-start justify-between gap-4 rounded-md border p-3 text-sm">
                <span>
                  <span className="font-medium">Rendre mes contributions publiques</span>
                  <span className="mt-1 block text-muted-foreground">
                    Controle la visibilite publique de vos commentaires et enrichissements communautaires.
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={communityVisibility.showCommunityContributions}
                  onChange={(event) =>
                    setCommunityVisibility((current) => ({
                      ...current,
                      showCommunityContributions: event.target.checked,
                    }))
                  }
                />
              </label>

              <label className="flex items-start justify-between gap-4 rounded-md border p-3 text-sm">
                <span>
                  <span className="font-medium">Rendre mes photos publiques</span>
                  <span className="mt-1 block text-muted-foreground">
                    Controle la visibilite publique de vos photos validees sur les fiches terrain.
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={communityVisibility.showCommunityPhotos}
                  onChange={(event) =>
                    setCommunityVisibility((current) => ({
                      ...current,
                      showCommunityPhotos: event.target.checked,
                    }))
                  }
                />
              </label>
            </div>

            {communityConsentError && (
              <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {communityConsentError}
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                disabled={communityConsentLoading}
                onClick={handleConfirmCommunityConsent}
              >
                {communityConsentLoading ? "Enregistrement..." : "Confirmer mes reglages"}
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-[100] isolate border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-xl shrink-0"
          onClick={() => setMenuOpen(false)}
        >
          <Plane className="h-6 w-6 text-primary" />
          <span>Navventura</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          {links.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 text-sm transition-colors ${
                pathname === href
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {/* Notifications bell */}
          {user && (
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className="relative flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-accent"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border bg-background shadow-lg z-[110]">
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <span className="font-semibold text-sm">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllReadMutation.mutate()}
                        disabled={markAllReadMutation.isPending}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Tout lire
                      </button>
                    )}
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        <Bell className="mx-auto mb-2 h-6 w-6 opacity-30" />
                        Aucune notification
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`border-b last:border-0 px-4 py-3 ${!n.readAt ? "bg-primary/5" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className={`text-sm ${!n.readAt ? "font-medium" : ""}`}>{n.title}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground/70">
                                {new Date(n.createdAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                            {n.linkUrl && (
                              <Link
                                href={n.linkUrl}
                                onClick={() => setNotifOpen(false)}
                                className="shrink-0 text-xs text-primary hover:underline"
                              >
                                Ouvrir
                              </Link>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="border-t px-4 py-2 text-center">
                    <Link
                      href="/membre/notifications"
                      onClick={() => setNotifOpen(false)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Voir toutes les notifications
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
          {loading ? (
            <div className="h-9 w-40 rounded-md bg-muted/40" aria-hidden="true" />
          ) : user ? (
            <>
              <Link
                href="/membre"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground truncate max-w-[160px]"
              >
                <User className="h-4 w-4 shrink-0" />
                <span className="truncate">{user.displayName || user.email}</span>
              </Link>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                aria-label="Déconnexion"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <LogIn className="h-4 w-4" />
              Connexion
            </Link>
          )}
        </div>

        <button
          className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t bg-background">
          <nav className="container mx-auto px-4 py-3 flex flex-col gap-1">
            {links.map(({ href, icon: Icon, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                  pathname === href
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            ))}
            {user && (
              <Link
                href="/membre/notifications"
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                  pathname === "/membre/notifications"
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Bell className="h-4 w-4 shrink-0" />
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
            )}

            <div className="mt-2 pt-2 border-t">
              {loading ? null : user ? (
                <>
                  <Link
                    href="/membre"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <User className="h-4 w-4 shrink-0" />
                    <span className="truncate">{user.displayName || user.email}</span>
                  </Link>
                  <button
                    onClick={() => {
                      void logout().then(() => setMenuOpen(false));
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <LogOut className="h-4 w-4 shrink-0" />
                    Déconnexion
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-primary hover:bg-accent"
                >
                  <LogIn className="h-4 w-4 shrink-0" />
                  Connexion
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
      </header>
    </>
  );
}
