/** Official JurisConecta identity. SVG artwork is supplied by the brand owner. */
export const BRAND = {
  name: "JurisConecta",
  colors: { background: "#111617", gold: "#D8BD83", text: "#E4DED0" },
  social: { src: "/og-jurisconecta.png?v=20261020", width: 1200, height: 630 },
  publisherLogo: { src: "/brand/logo-email.png", width: 670, height: 200 },
  logos: {
    signature: { src: "/brand/logo-principal-firma.svg", width: 443, height: 220 },
    horizontal: { src: "/brand/logo-principal-horizontal.svg", width: 670, height: 200 },
    vertical: { src: "/brand/logo-principal-vertical.svg", width: 573, height: 930 },
  },
} as const;

export type BrandLogoVariant = keyof typeof BRAND.logos;

/** Fixed public routes, also usable by maintenance-mode asset exemptions. */
export const officialAssetRoutes: readonly string[] = [
  ...Object.values(BRAND.logos).map((logo) => logo.src), BRAND.publisherLogo.src,
  "/icon.svg", "/favicon.svg", "/favicon.ico", "/favicon-32.png", "/favicon-48.png",
  "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png", "/site.webmanifest", "/og-jurisconecta.png",
];
