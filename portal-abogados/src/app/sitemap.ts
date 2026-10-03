import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/seo";
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/equipo/", "/soporte/"].map((path) => ({ url: new URL(path, siteUrl).toString(), changeFrequency: path === "/" ? "weekly" : "monthly", priority: path === "/" ? 1 : 0.5 }));
}
