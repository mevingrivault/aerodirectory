"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  Plane,
  Search,
  Map,
  BookOpen,
  LogIn,
  LogOut,
  User,
  Navigation,
} from "lucide-react";

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
          <Plane className="h-6 w-6 text-primary" />
          <span>AeroDirectory</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="/search"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Search className="h-4 w-4" />
            Recherche
          </Link>
          <Link
            href="/map"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Map className="h-4 w-4" />
            Carte
          </Link>
          {user && (
            <>
              <Link
                href="/aerodex"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <BookOpen className="h-4 w-4" />
                Carnet
              </Link>
              <Link
                href="/planner"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Navigation className="h-4 w-4" />
                Planificateur
              </Link>
            </>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              <Link
                href="/membre"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <User className="h-4 w-4" />
                {user.displayName || user.email}
              </Link>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
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
      </div>
    </header>
  );
}
