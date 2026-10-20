import type { Metadata } from "next";
import { BRAND } from "../../shared/brand";

export const siteUrl = "https://jurisconecta.cl";
export const siteName = "JurisConecta";
export const homeDescription = "Encuentra abogados en Chile para asuntos de familia, trabajo, civil y penal. Publica tu caso gratis, compara propuestas y sigue su avance desde tu cuenta.";

export function publicMetadata(title: string, description: string, path: string, index = true): Metadata {
  const url = new URL(path, siteUrl).toString();
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: index ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { title: `${title} | ${siteName}`, description, url, siteName, locale: "es_CL", type: "website", images: [{ url: `${siteUrl}${BRAND.social.src}`, width: BRAND.social.width, height: BRAND.social.height, alt: "JurisConecta: encuentra apoyo legal en Chile" }] },
    twitter: { card: "summary_large_image", title: `${title} | ${siteName}`, description, images: [`${siteUrl}${BRAND.social.src}`] },
  };
}

export const privateMetadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};
