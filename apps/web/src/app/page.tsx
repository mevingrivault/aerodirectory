import Link from "next/link";
import { Search, Map, BookOpen, Navigation, Plane, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const features = [
  {
    icon: Search,
    title: "Search Aerodromes",
    description: "Browse all French aerodromes with advanced filters — runway length, fuel, restaurants, and more.",
    href: "/search",
  },
  {
    icon: Map,
    title: "Interactive Map",
    description: "Explore airfields on a full-screen map with OpenStreetMap tiles and real-time filtering.",
    href: "/map",
  },
  {
    icon: BookOpen,
    title: "Pilot Logbook",
    description: "Track visited airfields in Pokédex mode, earn badges, and see your aviation stats.",
    href: "/pokedex",
  },
  {
    icon: Navigation,
    title: "Flight Planner",
    description: "Define your aircraft profile and find reachable aerodromes with cost and time estimates.",
    href: "/planner",
  },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-20 md:py-32">
        <div className="container mx-auto px-4 text-center">
          <div className="mx-auto flex items-center justify-center gap-2 mb-6">
            <Plane className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
            Discover French Aerodromes
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground mb-8">
            The collaborative directory for pilots. Browse airfields, discover services,
            share experiences, and plan your next flight.
          </p>
          <div className="flex justify-center gap-4">
            <Button size="lg" asChild>
              <Link href="/search">
                <Search className="mr-2 h-5 w-5" />
                Explore Aerodromes
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/map">
                <Map className="mr-2 h-5 w-5" />
                Open Map
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <Link key={f.href} href={f.href}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader>
                    <f.icon className="h-8 w-8 text-primary mb-2" />
                    <CardTitle className="text-lg">{f.title}</CardTitle>
                    <CardDescription>{f.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Security notice */}
      <section className="border-t bg-muted/30 py-12">
        <div className="container mx-auto px-4 text-center">
          <Shield className="mx-auto h-8 w-8 text-primary mb-3" />
          <h2 className="text-xl font-semibold mb-2">Secure & GDPR Compliant</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Argon2id password hashing, TOTP two-factor authentication, encrypted connections,
            strict CSP, and full audit logging. Your data is protected.
          </p>
        </div>
      </section>
    </div>
  );
}
