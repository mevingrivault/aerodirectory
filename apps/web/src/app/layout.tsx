import type { Metadata } from "next";
// Self-hosted fonts (OFL): bundled by Next and served from our origin, so
// visitors never contact Google Fonts.
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/inter/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

export const metadata: Metadata = {
  title: "Navventura - Deviens un aéroventurier",
  description:
    "Navventura vous aide à explorer les aérodromes français, préparer vos vols et rejoindre une communauté de pilotes. Deviens un aéroventurier.",
  keywords: ["aérodrome", "France", "aviation", "terrain", "pilote"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className="font-[system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif]"
        suppressHydrationWarning
      >
        <Providers>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
