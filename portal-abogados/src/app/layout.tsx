import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { ScrollReveal } from "../components/scroll-reveal";
import { PublicSiteFrame } from "../components/public-site-frame";
import { homeDescription, siteName, siteUrl } from "../lib/seo";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Encuentra abogados en Chile | JurisConecta", template: `%s | ${siteName}` },
  description: homeDescription,
  applicationName: siteName,
  alternates: { canonical: siteUrl },
  openGraph: { title: "Encuentra abogados en Chile | JurisConecta", description: homeDescription, url: siteUrl, siteName, locale: "es_CL", type: "website", images: [{ url: `${siteUrl}/og-jurisconecta.png`, width: 1200, height: 630, alt: "JurisConecta: encuentra apoyo legal en Chile" }] },
  twitter: { card: "summary_large_image", title: "Encuentra abogados en Chile | JurisConecta", description: homeDescription, images: [`${siteUrl}/og-jurisconecta.png`] },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-CL" className={manrope.variable}><body><PublicSiteFrame>{children}</PublicSiteFrame><ScrollReveal /></body></html>;
}
