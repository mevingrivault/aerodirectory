import Link from "next/link";
import { Search, Map, BookOpen, Navigation, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const features = [
  {
    icon: Search,
    title: "Rechercher des aérodromes",
    description:
      "Parcourez les aérodromes français avec des filtres avancés : longueur de piste, carburant, restauration et bien plus.",
    href: "/search",
  },
  {
    icon: Map,
    title: "Carte interactive",
    description:
      "Explorez les terrains sur une carte plein écran avec OpenStreetMap et un filtrage en temps réel.",
    href: "/map",
  },
  {
    icon: BookOpen,
    title: "Carnet de vol",
    description:
      "Suivez les terrains visités avec l'Aérodex, obtenez des badges et consultez vos statistiques de vol.",
    href: "/aerodex",
  },
  {
    icon: Navigation,
    title: "Planificateur de vol",
    description:
      "Définissez votre profil avion et trouvez les aérodromes accessibles avec des estimations de coût et de temps.",
    href: "/planner",
  },
];

export default function HomePage() {
  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-16 md:py-32">
        <div className="container mx-auto px-4 text-center">
          <div className="mx-auto mb-6 flex max-w-2xl flex-col gap-3 text-left sm:text-center">
            <div className="rounded-full border border-primary/20 bg-background/80 px-4 py-2 text-sm font-medium text-primary shadow-sm">
              Bienvenue sur Navventura
            </div>
            <div className="rounded-3xl border border-border/60 bg-background/80 px-5 py-4 text-base text-foreground shadow-sm">
              Tu es prêt à devenir Aéroventurier ?
            </div>
          </div>
          <div className="mx-auto mb-6 flex items-center justify-center gap-2">
            <Plane className="h-10 w-10 text-primary" />
          </div>
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-6xl">
            Deviens un aéroventurier
          </h1>
          <p className="mx-auto mb-8 max-w-2xl px-2 text-base text-muted-foreground sm:text-lg">
            Navventura est le compagnon des pilotes pour explorer les aérodromes français,
            découvrir les services utiles, partager leurs retours terrain et préparer leur
            prochaine aventure.
          </p>
          <div className="flex flex-col justify-center gap-3 px-4 sm:flex-row sm:px-0">
            <Button size="lg" asChild className="w-full sm:w-auto">
              <Link href="/search">
                <Search className="mr-2 h-5 w-5" />
                Explorer les aérodromes
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
              <Link href="/map">
                <Map className="mr-2 h-5 w-5" />
                Ouvrir la carte
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <Link key={f.href} href={f.href}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader>
                    <f.icon className="mb-2 h-8 w-8 text-primary" />
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
