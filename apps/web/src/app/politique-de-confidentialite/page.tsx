import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politique de confidentialité — Navventura",
  description: "Comment Navventura collecte, utilise et protège vos données personnelles.",
};

export default function PolitiqueConfidentialitePage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Politique de confidentialité</h1>
      <p className="text-sm text-muted-foreground mb-8">Dernière mise à jour : 6 avril 2025</p>

      <section className="prose prose-sm max-w-none space-y-8 text-foreground">

        <div>
          <h2 className="text-xl font-semibold mb-3">1. Responsable du traitement</h2>
          <p>
            Navventura (ci-après « nous ») est responsable du traitement de vos données personnelles.
            Pour toute question relative à la protection de vos données, vous pouvez nous contacter à :{" "}
            <a href="mailto:contact@navventura.fr" className="text-primary underline">
              contact@navventura.fr
            </a>
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">2. Données collectées</h2>
          <p className="mb-2">Nous collectons les données suivantes lorsque vous utilisez Navventura :</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Compte</strong> : adresse e-mail, nom d'affichage, mot de passe (haché avec Argon2id), date de création du compte.</li>
            <li><strong>Authentification à deux facteurs</strong> : secret TOTP chiffré (optionnel).</li>
            <li><strong>Contenu utilisateur</strong> : commentaires, visites d'aérodromes, profils d'avion, corrections proposées.</li>
            <li><strong>Photos</strong> : images téléversées, dimensions, type MIME. Les métadonnées EXIF sont supprimées lors du traitement.</li>
            <li><strong>Journaux d'activité</strong> : actions effectuées (connexion, publication de commentaire, etc.), adresse IP anonymisée, user-agent du navigateur.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">3. Finalités et bases légales</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4">Finalité</th>
                <th className="text-left py-2">Base légale (RGPD)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr><td className="py-2 pr-4">Gestion de votre compte</td><td className="py-2">Exécution du contrat (Art. 6.1.b)</td></tr>
              <tr><td className="py-2 pr-4">Envoi d'e-mails transactionnels (vérification, réinitialisation)</td><td className="py-2">Exécution du contrat (Art. 6.1.b)</td></tr>
              <tr><td className="py-2 pr-4">Journalisation à des fins de sécurité et de lutte contre la fraude</td><td className="py-2">Intérêt légitime (Art. 6.1.f)</td></tr>
              <tr><td className="py-2 pr-4">Modération du contenu communautaire</td><td className="py-2">Intérêt légitime (Art. 6.1.f)</td></tr>
              <tr><td className="py-2 pr-4">Respect des obligations légales</td><td className="py-2">Obligation légale (Art. 6.1.c)</td></tr>
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">4. Durée de conservation</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Données de compte</strong> : conservées jusqu'à la suppression du compte.</li>
            <li><strong>Journaux d'activité</strong> : conservés 3 ans, puis supprimés automatiquement.</li>
            <li><strong>Tokens e-mail</strong> (vérification, réinitialisation) : expiration automatique (24 h / 1 h), nettoyage périodique.</li>
            <li><strong>Photos</strong> : supprimées lors de la suppression du compte ou à votre demande.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">5. Destinataires des données</h2>
          <p className="mb-2">Vos données peuvent être transmises aux sous-traitants suivants, dans le strict cadre des finalités décrites :</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Brevo (Sendinblue)</strong> — envoi d'e-mails transactionnels (France/UE).</li>
            <li><strong>OpenAIP</strong> — import de données aéronautiques publiques (aucune donnée utilisateur transmise).</li>
            <li><strong>CheckWX</strong> — données météo METAR/TAF (aucune donnée utilisateur transmise).</li>
            <li><strong>Hébergeur / stockage objet S3-compatible</strong> — hébergement de l'application et des photos.</li>
          </ul>
          <p className="mt-2">Aucune donnée n'est vendue ou cédée à des tiers à des fins commerciales.</p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">6. Vos droits</h2>
          <p className="mb-2">Conformément au RGPD (Articles 15 à 22), vous disposez des droits suivants :</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Accès</strong> : obtenir une copie de vos données (via <Link href="/profile" className="text-primary underline">votre profil</Link> ou par e-mail).</li>
            <li><strong>Portabilité</strong> : exporter vos données dans un format structuré depuis votre profil (<em>« Exporter mes données »</em>).</li>
            <li><strong>Rectification</strong> : modifier votre nom d'affichage et votre e-mail depuis votre profil.</li>
            <li><strong>Effacement</strong> : supprimer votre compte depuis <Link href="/profile" className="text-primary underline">votre profil</Link> (suppression définitive).</li>
            <li><strong>Opposition et limitation</strong> : nous contacter à <a href="mailto:contact@navventura.fr" className="text-primary underline">contact@navventura.fr</a>.</li>
          </ul>
          <p className="mt-2">
            Vous pouvez également introduire une réclamation auprès de la{" "}
            <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              CNIL
            </a>.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">7. Sécurité</h2>
          <p>
            Nous mettons en œuvre des mesures techniques et organisationnelles adaptées pour protéger vos données :
            hachage des mots de passe (Argon2id), chiffrement des secrets TOTP, analyse antivirus des fichiers uploadés,
            journalisation des accès, restrictions d'accès par rôle, HTTPS obligatoire.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">8. Cookies</h2>
          <p>
            Navventura n'utilise pas de cookies de traçage ou publicitaires. Les cookies techniques
            nécessaires à l'authentification sécurisée sont strictement fonctionnels (session, protection CSRF).
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">9. Modifications</h2>
          <p>
            Cette politique peut être mise à jour. En cas de modification substantielle, nous vous en informerons
            par e-mail ou via une notification sur le site.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">10. Contact</h2>
          <p>
            Pour exercer vos droits ou pour toute question :{" "}
            <a href="mailto:contact@navventura.fr" className="text-primary underline">
              contact@navventura.fr
            </a>
          </p>
        </div>

      </section>
    </div>
  );
}
