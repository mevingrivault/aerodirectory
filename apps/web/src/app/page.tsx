import Link from "next/link";
import { Search, Map, BookOpen, Navigation, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const features = [
  {
    icon: Search,
    title: "Rechercher des Aérodromes",
    description: "Parcourez tous les aérodromes français avec des filtres avancés — longueur de piste, carburant, restaurant, et plus encore.",
    href: "/search",
  },
  {
    icon: Map,
    title: "Carte Interactive",
    description: "Explorez les terrains sur une carte plein écran avec les tuiles OpenStreetMap et un filtrage en temps réel.",
    href: "/map",
  },
  {
    icon: BookOpen,
    title: "Carnet de Vol",
    description: "Suivez les terrains visités avec l'Aérodex, obtenez des badges et consultez vos statistiques de vol.",
    href: "/aerodex",
  },
  {
    icon: Navigation,
    title: "Planificateur de Vol",
    description: "Définissez votre profil avion et trouvez les aérodromes accessibles avec des estimations de coût et de temps.",
    href: "/planner",
  },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-16 md:py-32">
        <div className="container mx-auto px-4 text-center">
          <div className="mx-auto flex items-center justify-center gap-2 mb-6">
            <Plane className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight mb-4">
            Découvrez les Aérodromes Français
          </h1>
          <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground mb-8 px-2">
            L&apos;annuaire collaboratif pour les pilotes. Parcourez les terrains, découvrez les services,
            partagez vos expériences et planifiez votre prochain vol.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 px-4 sm:px-0">
            <Button size="lg" asChild className="w-full sm:w-auto">
              <Link href="/search">
                <Search className="mr-2 h-5 w-5" />
                Explorer les Aérodromes
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
              <Link href="/map">
                <Map className="mr-2 h-5 w-5" />
                Ouvrir la Carte
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

    </div>
  );
}
