import { DISCLAIMER } from "@aerodirectory/shared";

export function Footer() {
  return (
    <footer className="border-t bg-muted/50 py-8">
      <div className="container mx-auto px-4">
        <div className="mb-4 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
          {DISCLAIMER}
        </div>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>AeroDirectory &mdash; Annuaire Collaboratif des Aérodromes Français</p>
          <p>
            Contributions sous licence{" "}
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              CC BY-SA 4.0
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
