import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { ScrollReveal } from "../components/scroll-reveal";
import { PublicSiteFrame } from "../components/public-site-frame";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "JurisConecta | Encuentra orientación legal",
  description: "Conecta personas con profesionales del derecho en Chile.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" className={manrope.variable}><body><PublicSiteFrame>{children}</PublicSiteFrame><ScrollReveal /></body></html>;
}
