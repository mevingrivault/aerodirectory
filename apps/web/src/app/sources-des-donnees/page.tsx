import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sources des données — Navventura",
  description: "D'où viennent les données affichées sur Navventura, à quel rythme elles sont mises à jour et sous quelle licence.",
};

interface Source {
  name: string;
  url: string;
  what: string;
  refresh: string;
  licence: string;
  licenceUrl?: string;
  credit?: string;
}

const IMPORTED: Source[] = [
  {
    name: "openAIP",
    url: "https://www.openaip.net",
    what: "Aérodromes, pistes, fréquences, carburants disponibles, téléphones, horaires et remarques ; espaces aériens ; obstacles (éoliennes, pylônes, antennes…).",
    refresh: "Aérodromes chaque nuit à 02:00, espaces aériens à 02:30, obstacles chaque lundi.",
    licence: "CC BY-NC 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-nc/4.0/deed.fr",
    credit: "© openAIP",
  },
  {
    name: "OpenStreetMap",
    url: "https://www.openstreetmap.org",
    what: "Restaurants, hébergements, transports et vélos autour des terrains, via l'extrait France de Geofabrik.",
    refresh: "Chaque dimanche.",
    licence: "ODbL 1.0",
    licenceUrl: "https://opendatacommons.org/licenses/odbl/",
    credit: "© les contributeurs d'OpenStreetMap",
  },
  {
    name: "Nominatim (OpenStreetMap)",
    url: "https://nominatim.org",
    what: "Ville, département et région de chaque aérodrome.",
    refresh: "Chaque nuit pour les fiches modifiées par openAIP, et toutes les fiches le 1er du mois.",
    licence: "ODbL 1.0",
    licenceUrl: "https://opendatacommons.org/licenses/odbl/",
    credit: "© les contributeurs d'OpenStreetMap",
  },
  {
    name: "OurAirports",
    url: "https://ourairports.com",
    what: "Site web de l'aérodrome et lien vers son article Wikipédia.",
    refresh: "Chaque dimanche.",
    licence: "Domaine public",
    licenceUrl: "https://ourairports.com/data/",
  },
  {
    name: "Wikidata et Wikimedia Commons",
    url: "https://commons.wikimedia.org",
    what: "Photo principale de l'aérodrome, choisie sur Wikidata. Nous en gardons une copie pour que votre navigateur ne contacte pas Wikimedia.",
    refresh: "Chaque dimanche.",
    licence: "Licence propre à chaque photo (CC0, CC BY, CC BY-SA, domaine public, Licence Ouverte), indiquée sous la photo avec son auteur",
  },
  {
    name: "IGN — BD TOPO®",
    url: "https://geoservices.ign.fr/bdtopo",
    what: "Zones naturelles protégées (parcs, réserves) ; lignes électriques, téléphériques et remontées mécaniques. Via la Géoplateforme.",
    refresh: "Zones protégées le 2 de chaque mois, lignes et câbles le 3.",
    licence: "Licence Ouverte 2.0 (Etalab)",
    licenceUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
    credit: "Source : IGN – BD TOPO®",
  },
  {
    name: "Météo-France",
    url: "https://meteo.data.gouv.fr",
    what: "Rose des vents de la station la plus proche, calculée sur les observations horaires 2020-2024.",
    refresh: "Une fois par an, à la mi-février.",
    licence: "Licence Ouverte 2.0 (Etalab)",
    licenceUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
    credit: "Source : Météo-France",
  },
  {
    name: "Cam-Aéro",
    url: "https://cam-aero.eu",
    what: "Liste des webcams météo installées sur les aérodromes. Nous n'affichons qu'un lien : les images restent sur cam-aero.eu.",
    refresh: "Chaque lundi.",
    licence: "Lien uniquement, aucune image reprise",
  },
];

const LIVE: Source[] = [
  {
    name: "CheckWX",
    url: "https://www.checkwxapi.com",
    what: "METAR et TAF de la station la plus proche.",
    refresh: "À la demande, gardés en cache jusqu'au prochain METAR attendu (une heure au plus).",
    licence: "Conditions d'utilisation de CheckWX",
    licenceUrl: "https://www.checkwxapi.com",
  },
  {
    name: "SIA — eAIP France",
    url: "https://www.sia.aviation-civile.gouv.fr",
    what: "Liens vers la carte VAC et la page AD 2 du cycle AIRAC en vigueur. Les documents restent sur le site du SIA.",
    refresh: "Vérifiés à la demande, une fois par cycle AIRAC (28 jours).",
    licence: "Publications officielles du SIA, consultées sur son site",
  },
  {
    name: "Fonds de carte OpenStreetMap",
    url: "https://www.openstreetmap.org/copyright",
    what: "Carte affichée sur les fiches, la carte et le planificateur. Les tuiles sont chargées par votre navigateur depuis les serveurs d'OpenStreetMap.",
    refresh: "En direct.",
    licence: "ODbL 1.0 (données), CC BY-SA 2.0 (rendu)",
    licenceUrl: "https://www.openstreetmap.org/copyright",
    credit: "© les contributeurs d'OpenStreetMap",
  },
  {
    name: "Esri World Imagery",
    url: "https://www.esri.com",
    what: "Vue satellite. Les tuiles sont chargées par votre navigateur depuis les serveurs d'Esri.",
    refresh: "En direct.",
    licence: "Conditions d'utilisation d'Esri",
    credit: "Esri, Maxar, Earthstar Geographics",
  },
];

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <div className="space-y-3">
      {sources.map((s) => (
        <div key={s.name} className="rounded-lg border p-4">
          <h3 className="font-semibold">
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
              {s.name}
            </a>
          </h3>
          <p className="mt-1 text-sm">{s.what}</p>
          <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[140px_1fr]">
            <dt className="text-muted-foreground">Mise à jour</dt>
            <dd>{s.refresh}</dd>
            <dt className="text-muted-foreground">Licence</dt>
            <dd>
              {s.licenceUrl ? (
                <a href={s.licenceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                  {s.licence}
                </a>
              ) : (
                s.licence
              )}
            </dd>
            {s.credit && (
              <>
                <dt className="text-muted-foreground">Attribution</dt>
                <dd>{s.credit}</dd>
              </>
            )}
          </dl>
        </div>
      ))}
    </div>
  );
}

export default function SourcesPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Sources des données</h1>
      <p className="text-sm text-muted-foreground mb-8">Dernière mise à jour : 3 novembre 2026</p>

      <div className="space-y-10 text-foreground">
        <div className="rounded-md border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800">
          Ces données sont indicatives et peuvent être incomplètes ou périmées. Elles ne remplacent ni la VAC,
          ni la carte OACI, ni les NOTAM et SUP AIP en vigueur.
        </div>

        <section>
          <h2 className="text-xl font-semibold mb-2">Données importées</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Copiées dans notre base à intervalles réguliers. Si une source ne répond pas ou renvoie une liste
            anormalement courte, les données précédentes sont conservées.
          </p>
          <SourceList sources={IMPORTED} />
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Services consultés en direct</h2>
          <SourceList sources={LIVE} />
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Contributions des membres</h2>
          <div className="space-y-3 text-sm">
            <p>
              Les commentaires, photos, corrections, événements et infos pratiques (prix carburant, taxes
              d&apos;atterrissage et de parking, hangar de passage, liens de webcam) sont proposés par les membres
              et publiés après validation par un administrateur.
            </p>
            <p>
              Aucune source ouverte ne publie les prix carburant ou les taxes des aérodromes français : ces
              informations viennent uniquement des pilotes qui y sont passés. Chacune porte la date à laquelle elle
              a été constatée. La plus récente remplace la précédente, et un prix de plus de six mois ou une taxe
              de plus d&apos;un an est signalé « À vérifier ». Un membre qui constate la même chose peut la marquer
              « Toujours valable » : l&apos;information est redatée sans être modifiée, donc sans nouvelle validation.
              Confirmez toujours auprès du terrain.
            </p>
            <p>
              Les conditions de publication sont décrites dans les <Link href="/cgu" className="underline underline-offset-4">CGU</Link>.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Polices de caractères</h2>
          <p className="text-sm">
            Fraunces, Inter et JetBrains Mono, sous{" "}
            <a href="https://openfontlicense.org" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              SIL Open Font License
            </a>
            , hébergées par Navventura : votre navigateur ne contacte aucun service de polices.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Droits de Navventura</h2>
          <p className="text-sm">
            En dehors des données tierces ci-dessus, qui restent sous leur licence, le site et sa base de données
            sont protégés et toute reproduction ou extraction sans autorisation est interdite. Voir la section{" "}
            <Link href="/cgu#propriete-intellectuelle" className="underline underline-offset-4">Propriété intellectuelle</Link>{" "}
            des CGU.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Calculs</h2>
          <p className="text-sm">
            Les heures de lever et de coucher du soleil, le début et la fin de la nuit aéronautique et les dates
            des cycles AIRAC sont calculés par Navventura, sans service extérieur.
          </p>
        </section>
      </div>
    </div>
  );
}
