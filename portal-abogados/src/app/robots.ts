import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/seo";
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin/", "/account/", "/cliente/", "/dashboard/", "/casos/", "/evaluaciones/", "/planes/", "/postulacion-abogado/", "/publicar-caso/", "/api/", "/mantenimiento/"] }, sitemap: `${siteUrl}/sitemap.xml`, host: siteUrl };
}
