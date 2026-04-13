"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api-client";
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
} from "lucide-react";

const navLinks = (isAuthenticated: boolean) => [
  { href: "/search", icon: Search, label: "Recherche" },
  { href: "/map", icon: Map, label: "Carte" },
  ...(isAuthenticated
    ? [
        { href: "/aerodex", icon: BookOpen, label: "Carnet" },
        { href: "/planner", icon: Navigation, label: "Planificateur" },
        { href: "/membre/notifications", icon: Bell, label: "Notifications" },
      ]
    : []),
];

export function Header() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: notificationsRes } = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      apiClient.get<{ id: string; readAt: string | null }[]>("/notifications", {
        page: "1",
        limit: "20",
      }),
    enabled: !!user,
    staleTime: 60_000,
  });

  const unreadCount = (notificationsRes?.data ?? []).filter((item) => !item.readAt).length;

  const links = [
    ...navLinks(!!user),
    ...(user?.role === "ADMIN"
      ? [{ href: "/admin", icon: User, label: "Admin" }]
      : []),
  ];

  return (
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
              {href === "/membre/notifications" && unreadCount > 0 && (
                <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
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
                {href === "/membre/notifications" && unreadCount > 0 && (
                  <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
            ))}

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
  );
}
