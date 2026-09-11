import type { Metadata } from "next";
import { Climate_Crisis, Bungee, Bricolage_Grotesque, Courier_Prime, Archivo_Narrow } from "next/font/google";
import "./globals.css";
import { CursorGlow } from "@/app/components/cursor-glow";
import { CursorSpotlight } from "@/app/components/cursor-spotlight";

const climateCrisis = Climate_Crisis({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: "400",
});

const bricolageTagline = Bricolage_Grotesque({
  variable: "--font-tagline",
  subsets: ["latin"],
  weight: ["300", "800"],
});

const bungee = Bungee({
  variable: "--font-subtext",
  subsets: ["latin"],
  weight: "400",
});

const bricolageGrotesque = Bricolage_Grotesque({
  variable: "--font-hero-subtext",
  subsets: ["latin"],
  weight: "400",
});

const courierPrime = Courier_Prime({
  variable: "--font-ticket",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const archivoNarrow = Archivo_Narrow({
  variable: "--font-tv-wordmark",
  subsets: ["latin"],
  weight: "700",
});

export const metadata: Metadata = {
  title: "Cineclub — Decide movie night together",
  description: "Create a club, nominate movies, vote together, and reveal the winners.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${climateCrisis.variable} ${bricolageTagline.variable} ${bungee.variable} ${bricolageGrotesque.variable} ${courierPrime.variable} ${archivoNarrow.variable} h-full antialiased`}
    >
      <body>
        <CursorGlow />
        <CursorSpotlight />
        {children}
      </body>
    </html>
  );
}
