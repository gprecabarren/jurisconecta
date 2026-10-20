import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { ScrollReveal } from "../components/scroll-reveal";
import { PublicSiteFrame } from "../components/public-site-frame";
import { homeDescription, siteName, siteUrl } from "../lib/seo";
import { BRAND } from "../../shared/brand";

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
  openGraph: { title: "Encuentra abogados en Chile | JurisConecta", description: homeDescription, url: siteUrl, siteName, locale: "es_CL", type: "website", images: [{ url: `${siteUrl}${BRAND.social.src}`, width: BRAND.social.width, height: BRAND.social.height, alt: "JurisConecta: encuentra apoyo legal en Chile" }] },
  twitter: { card: "summary_large_image", title: "Encuentra abogados en Chile | JurisConecta", description: homeDescription, images: [`${siteUrl}${BRAND.social.src}`] },
  manifest: "/site.webmanifest",
  icons: {
    icon: [{ url: "/favicon.svg?v=20261020", type: "image/svg+xml" }, { url: "/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/favicon-48.png", sizes: "48x48", type: "image/png" }],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = { themeColor: BRAND.colors.background, colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-CL" className={manrope.variable}><body><PublicSiteFrame>{children}</PublicSiteFrame><ScrollReveal /><script src="/navigation.js" defer /></body></html>;
}
