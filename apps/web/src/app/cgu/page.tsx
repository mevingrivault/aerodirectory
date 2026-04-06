import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation — Navventura",
  description: "Conditions générales d'utilisation de la plateforme Navventura.",
};

export default function CguPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Conditions générales d'utilisation</h1>
      <p className="text-sm text-muted-foreground mb-8">Dernière mise à jour : 6 avril 2025</p>

      <section className="prose prose-sm max-w-none space-y-8 text-foreground">

        <div>
          <h2 className="text-xl font-semibold mb-3">1. Objet</h2>
          <p>
            Les présentes conditions générales d'utilisation (CGU) régissent l'accès et l'utilisation
            de la plateforme Navventura, accessible à l'adresse <strong>navventura.fr</strong>.
            En créant un compte ou en utilisant les services, vous acceptez ces CGU dans leur intégralité.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">2. Avertissement de sécurité aéronautique</h2>
          <div className="rounded-md border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800">
            <strong>IMPORTANT :</strong> Les informations diffusées sur Navventura (aérodromes, fréquences,
            pistes, météo) sont issues de sources tierces et peuvent être incomplètes, inexactes ou
            périmées. Elles ne constituent en aucun cas une documentation aéronautique officielle et
            ne sauraient remplacer les publications officielles (AIP France, NOTAM, SIA).
            <strong> Ne prenez jamais de décision de vol sur la seule foi de ces informations.</strong>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">3. Accès au service</h2>
          <p>
            L'accès à certaines fonctionnalités (commentaires, photos, visites) nécessite la création
            d'un compte. Vous devez fournir des informations exactes lors de l'inscription et maintenir
            la confidentialité de vos identifiants. Vous êtes responsable de toute activité effectuée
            depuis votre compte.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">4. Contenu utilisateur</h2>
          <p className="mb-2">
            En publiant du contenu (commentaires, photos, corrections), vous déclarez :
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>en être l'auteur ou disposer des droits nécessaires ;</li>
            <li>ne pas porter atteinte aux droits de tiers (droit à l'image, droit d'auteur, vie privée) ;</li>
            <li>ne pas publier de contenu illicite, diffamatoire, haineux ou trompeur.</li>
          </ul>
          <p className="mt-2">
            Les contributions textuelles sont publiées sous licence{" "}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              CC BY-SA 4.0
            </a>.
            Les photos restent la propriété de leur auteur ; en les téléversant, vous accordez à Navventura
            une licence d'affichage non exclusive et gratuite.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">5. Modération</h2>
          <p>
            Navventura se réserve le droit de supprimer tout contenu contraire aux présentes CGU
            et de suspendre ou supprimer tout compte en cas d'abus, sans préavis ni indemnité.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">6. Disponibilité du service</h2>
          <p>
            Navventura est un service fourni sans garantie de disponibilité permanente. Nous nous
            réservons le droit d'interrompre ou de modifier le service à tout moment.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">7. Responsabilité</h2>
          <p>
            Navventura ne pourra être tenu responsable de tout dommage direct ou indirect résultant
            de l'utilisation des informations publiées sur la plateforme, notamment dans le cadre
            de la préparation ou de l'exécution d'un vol.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">8. Données personnelles</h2>
          <p>
            Le traitement de vos données personnelles est décrit dans notre{" "}
            <Link href="/politique-de-confidentialite" className="text-primary underline">
              Politique de confidentialité
            </Link>.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">9. Droit applicable</h2>
          <p>
            Les présentes CGU sont soumises au droit français. Tout litige sera porté devant les
            juridictions compétentes du ressort du siège de Navventura.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">10. Contact</h2>
          <p>
            Pour toute question :{" "}
            <a href="mailto:contact@navventura.fr" className="text-primary underline">
              contact@navventura.fr
            </a>
          </p>
        </div>

      </section>
    </div>
  );
}
