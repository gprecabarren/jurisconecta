import sanitizeHtml from "sanitize-html";

export const newsOrigin = "https://jurisconecta.cl";
export type NewsPost = {
  id: string; slug: string; title: string; excerpt: string; content_html: string;
  cover_url: string; cover_alt: string; status: "draft" | "published" | "archived";
  seo_title: string; meta_description: string; focus_keyword: string; canonical_url: string;
  og_title: string; og_description: string; noindex: number; author: string;
  published_at: string | null; created_at: string; updated_at: string; updated_by: string; version: number;
};

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}
export function slugify(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100).replace(/-+$/g, "");
}
export function isNewsImage(value: string) {
  return value === "/og-jurisconecta.png" || /^\/noticias\/media\/[a-f0-9-]{36}$/.test(value);
}
export function sanitizeNews(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "h2", "h3", "blockquote", "ul", "ol", "li", "hr", "a", "figure", "img", "figcaption"],
    allowedAttributes: { a: ["href", "rel"], img: ["src", "alt", "loading", "decoding"] },
    allowedSchemes: ["https", "mailto", "tel"], allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attrs): sanitizeHtml.Tag => {
        const href = attrs.href || "";
        const safe = /^https:\/\//i.test(href) || /^\/(?!\/)/.test(href) || /^(mailto|tel):/i.test(href);
        return { tagName: "a", attribs: safe ? { href, rel: "noopener noreferrer" } : {} };
      },
      img: (_tag, attrs): sanitizeHtml.Tag => ({ tagName: "img", attribs: isNewsImage(attrs.src || "") ? { src: attrs.src, alt: (attrs.alt || "").slice(0, 200), loading: "lazy", decoding: "async" } : {} }),
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  });
}
export function plainText(html: string) {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
}
export function validateNews(body: Record<string, unknown>) {
  const text = (key: string, max: number) => typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
  const title = text("title", 160), slug = slugify(text("slug", 120) || title);
  const content_html = sanitizeNews(text("content_html", 65_536));
  const excerpt = text("excerpt", 320);
  const status = body.status === "published" ? "published" : body.status === "archived" ? "archived" : "draft";
  const seo_title = text("seo_title", 100) || `${title} | JurisConecta`;
  const meta_description = text("meta_description", 170) || excerpt.slice(0, 160);
  const cover_url = text("cover_url", 200) || "/og-jurisconecta.png";
  const cover_alt = text("cover_alt", 200) || title;
  const canonical_url = text("canonical_url", 250) || `${newsOrigin}/noticias/${slug}/`;
  // Own canonical only; an article cannot silently redirect SEO credit off-site.
  if (canonical_url !== `${newsOrigin}/noticias/${slug}/`) return { error: "La URL canónica debe coincidir con el dominio y slug de esta noticia." };
  if (!slug || title.length < 10 || excerpt.length < 30 || plainText(content_html).length < 100) return { error: "Completa título (10+ caracteres), resumen (30+) y contenido (100+)." };
  if (!isNewsImage(cover_url)) return { error: "Sube la portada desde este editor." };
  if (status === "published" && (meta_description.length < 50 || !cover_alt)) return { error: "Antes de publicar, completa la descripción SEO (50+ caracteres) y el texto alternativo." };
  return { data: { slug, title, excerpt, content_html, cover_url, cover_alt, status, seo_title, meta_description, canonical_url,
    focus_keyword: text("focus_keyword", 100), og_title: text("og_title", 120) || seo_title,
    og_description: text("og_description", 200) || meta_description, noindex: body.noindex === true ? 1 : 0,
    author: text("author", 120) || "Equipo editorial de JurisConecta" } };
}
