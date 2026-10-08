import { isAdmin } from "./admin-auth";
import type { AuthEnv } from "./github-auth";
import { escapeHtml as e, newsOrigin, plainText, type NewsPost } from "./news";
import { socialPlatformLabels, validateSocialLinks, type SocialLink } from "../../shared/social-links";

type Env = AuthEnv & { ASSETS: Fetcher };
const iso = (date: string) => new Date(date.includes("T") ? date : `${date.replace(" ", "T")}Z`).toISOString();
const dateLabel = (date: string) => new Date(iso(date)).toLocaleDateString("es-CL", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Santiago" });
const href = (post: NewsPost) => `/noticias/${post.slug}/`;

function card(post: NewsPost) {
  return `<article class="news-card"><a class="news-card-cover" href="${href(post)}"><img src="${e(post.cover_url)}" alt="${e(post.cover_alt)}" width="1200" height="630" loading="lazy" decoding="async"></a><div><p class="eyebrow">Guía legal · <time datetime="${iso(post.published_at || post.created_at)}">${dateLabel(post.published_at || post.created_at)}</time></p><h2><a href="${href(post)}">${e(post.title)}</a></h2><p>${e(post.excerpt)}</p><a class="news-read" href="${href(post)}">Leer guía <span aria-hidden="true">→</span></a></div></article>`;
}

export async function serveNews(request: Request, env: Env) {
  if (!env.DB) return new Response("Servicio editorial no disponible", { status: 503 });
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  const media = url.pathname.match(/^\/noticias\/media\/([a-f0-9-]{36})$/);
  if (media) {
    const image = await env.DB.prepare("SELECT data_base64, mime_type FROM news_media WHERE id = ?").bind(media[1]).first<{ data_base64: string; mime_type: string }>();
    const publicUse = await env.DB.prepare("SELECT id FROM news_posts WHERE status = 'published' AND (cover_url = ? OR instr(content_html, ?) > 0) LIMIT 1").bind(url.pathname, url.pathname).first<{ id: string }>();
    if (!image || (!publicUse && !await isAdmin(request, env))) return new Response(null, { status: 404 });
    return new Response(request.method === "HEAD" ? null : Uint8Array.from(atob(image.data_base64), (c) => c.charCodeAt(0)), { headers: { "Content-Type": image.mime_type, "Cache-Control": publicUse ? "public, max-age=86400" : "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  const previewId = url.searchParams.get("preview");
  const preview = Boolean(previewId && await isAdmin(request, env));
  const slug = url.pathname.match(/^\/noticias\/([a-z0-9-]+)\/?$/)?.[1];
  const index = url.pathname === "/noticias" || url.pathname === "/noticias/";
  if (!index && !slug) return new Response("Noticia no encontrada.", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  if (!url.pathname.endsWith("/")) { url.pathname += "/"; return Response.redirect(url.toString(), 308); }
  const result = await env.DB.prepare("SELECT * FROM news_posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 200").all<NewsPost>();
  const posts = result.results;
  const post = preview ? await env.DB.prepare("SELECT * FROM news_posts WHERE id = ?").bind(previewId).first<NewsPost>() : slug ? posts.find((item) => item.slug === slug) : null;
  if (!index && !post) return new Response("Noticia no encontrada.", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  const query = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const filtered = query ? posts.filter((p) => `${p.title} ${p.excerpt}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"))) : posts;
  const page = Math.min(Math.max(Number.parseInt(url.searchParams.get("page") || "1") || 1, 1), Math.max(1, Math.ceil(filtered.length / 12)));
  const title = post?.seo_title || "Noticias y guías legales en Chile | JurisConecta";
  const description = post?.meta_description || "Guías para encontrar abogados en Chile, preparar tu consulta y comparar propuestas legales con información clara y práctica.";
  const canonical = post?.canonical_url || `${newsOrigin}/noticias/`;
  const noindex = preview || Boolean(query) || page > 1 || post?.noindex === 1;
  const image = `${newsOrigin}${post?.cover_url || "/og-jurisconecta.png"}`;
  const structured = post ? [{ "@context": "https://schema.org", "@type": "Article", headline: post.title, description, image: [image], datePublished: iso(post.published_at || post.created_at), dateModified: iso(post.updated_at), author: { "@type": "Organization", name: post.author, url: `${newsOrigin}/equipo/` }, publisher: { "@type": "Organization", name: "JurisConecta", url: newsOrigin, logo: { "@type": "ImageObject", url: `${newsOrigin}/icon.svg` } }, mainEntityOfPage: canonical, inLanguage: "es-CL" }, { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Inicio", item: newsOrigin }, { "@type": "ListItem", position: 2, name: "Noticias", item: `${newsOrigin}/noticias/` }, { "@type": "ListItem", position: 3, name: post.title, item: canonical }] }]
    : [{ "@context": "https://schema.org", "@type": "CollectionPage", name: title, description, url: canonical, inLanguage: "es-CL" }];
  const markup = post ? `${preview ? '<p class="news-preview">Vista previa privada — no indexable</p>' : ""}<nav class="news-breadcrumb" aria-label="Ruta de navegación"><a href="/">Inicio</a> / <a href="/noticias/">Noticias</a> / Guía legal</nav><article class="news-article"><header><p class="eyebrow">Guías de JurisConecta</p><h1>${e(post.title)}</h1><p class="news-lead">${e(post.excerpt)}</p><p class="news-byline">${e(post.author)} · <time datetime="${iso(post.published_at || post.created_at)}">${dateLabel(post.published_at || post.created_at)}</time> · ${Math.max(1, Math.ceil(plainText(post.content_html).split(" ").length / 200))} min de lectura</p></header><img class="news-hero-image" src="${e(post.cover_url)}" alt="${e(post.cover_alt)}" width="1200" height="630" fetchpriority="high"><div class="news-prose">${post.content_html}</div><aside class="news-note">Contenido informativo general. No sustituye la evaluación de un abogado ni constituye una recomendación para un caso particular. Las funciones de JurisConecta corresponden al piloto de la plataforma.</aside><div class="news-cta"><h2>Da el primer paso con información clara</h2><p>Prepara tu consulta y revisa el proceso antes de publicar un caso.</p><a class="primary-button" href="/registro/">Crear mi cuenta →</a><a href="/soporte/">Resolver dudas</a></div></article><section class="news-related"><h2>Sigue explorando</h2><div class="news-grid">${posts.filter((p) => p.id !== post.id).slice(0, 3).map(card).join("")}</div></section>`
    : `<header class="news-heading"><p class="eyebrow">Información que conecta</p><h1>Noticias y guías legales en Chile</h1><p class="news-lead">Ideas prácticas para encontrar apoyo legal, preparar tu consulta y decidir con más claridad.</p><a href="/noticias/feed.xml">Suscribirse por RSS</a></header><form class="news-search" action="/noticias/" method="get"><label for="news-search">Buscar una guía</label><div><input id="news-search" name="q" type="search" maxlength="80" value="${e(query)}" placeholder="Por ejemplo: abogado o propuestas"><button class="primary-button">Buscar</button></div></form><div class="news-grid">${filtered.slice((page - 1) * 12, page * 12).map(card).join("") || "<p>No encontramos guías con esa búsqueda.</p>"}</div><nav class="news-pagination" aria-label="Paginación">${page > 1 ? `<a href="?page=${page - 1}&q=${encodeURIComponent(query)}">← Anteriores</a>` : ""}<span>Página ${page} de ${Math.max(1, Math.ceil(filtered.length / 12))}</span>${page * 12 < filtered.length ? `<a href="?page=${page + 1}&q=${encodeURIComponent(query)}">Siguientes →</a>` : ""}</nav>`;
  const shell = await env.ASSETS.fetch(new Request(new URL("/noticias/", request.url)));
  const [socialRows, settings] = await Promise.all([
    env.DB.prepare("SELECT id, platform, url FROM site_social_links ORDER BY sort_order, platform").all<SocialLink>(),
    env.DB.prepare("SELECT contact_email FROM site_settings WHERE id = 1").first<{ contact_email: string }>(),
  ]);
  const social = validateSocialLinks(socialRows.results) ? socialRows.results : [];
  const svg = (paths: string) => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const icons: Record<string, string> = {
    facebook: '<span class="social-letter" aria-hidden="true">f</span>', linkedin: '<span class="social-letter social-letter-in" aria-hidden="true">in</span>', x: '<span class="social-letter" aria-hidden="true">𝕏</span>',
    instagram: svg('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>'),
    whatsapp: svg('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'), youtube: svg('<path d="m9 18 9-6-9-6z"/>'),
    tiktok: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
    telegram: svg('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'),
  };
  const socialItem = (platform: string) => {
    const link = social.find((s) => s.platform === platform), label = socialPlatformLabels[platform as keyof typeof socialPlatformLabels];
    return link ? `<a href="${e(link.url)}" target="_blank" rel="noopener noreferrer" aria-label="JurisConecta en ${e(label)}" title="${e(label)}">${icons[platform]}</a>` : `<span class="social-unconfigured" aria-label="${e(label)} aún no disponible" title="${e(label)}: enlace pendiente">${icons[platform]}</span>`;
  };
  const emailIcon = svg('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>');
  const socialMarkup = ["facebook", "instagram", "linkedin", "whatsapp"].map(socialItem).join("")
    + (settings?.contact_email ? `<a href="mailto:${e(settings.contact_email)}" aria-label="Correo oficial" title="Correo electrónico">${emailIcon}</a>` : `<span class="social-unconfigured" aria-label="Correo electrónico aún no disponible">${emailIcon}</span>`)
    + social.filter((s) => !["facebook", "instagram", "linkedin", "whatsapp"].includes(s.platform)).map((s) => socialItem(s.platform)).join("");
  const meta = `<title>${e(title)}</title><meta name="description" content="${e(description)}"><meta name="robots" content="${noindex ? "noindex,follow" : "index,follow,max-image-preview:large"}"><link rel="canonical" href="${e(canonical)}"><meta property="og:title" content="${e(post?.og_title || title)}"><meta property="og:description" content="${e(post?.og_description || description)}"><meta property="og:type" content="${post ? "article" : "website"}"><meta property="og:url" content="${e(canonical)}"><meta property="og:image" content="${e(image)}"><meta property="og:locale" content="es_CL"><meta property="og:site_name" content="JurisConecta"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(title)}"><meta name="twitter:description" content="${e(description)}"><meta name="twitter:image" content="${e(image)}"><link rel="alternate" type="application/rss+xml" title="Guías JurisConecta" href="/noticias/feed.xml"><script type="application/ld+json">${JSON.stringify(structured).replaceAll("<", "\\u003c")}</script><script src="/measurement.js" defer></script>`;
  const transformed = new HTMLRewriter()
    .on('title, meta[name="description"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"], link[as="script"], script', { element(element) { element.remove(); } })
    .on("head", { element(element) { element.append(meta, { html: true }); } })
    .on(".site-social-links", { element(element) { element.setInnerContent(socialMarkup, { html: true }); } })
    .on("#news-root", { element(element) { element.setInnerContent(markup, { html: true }); } }).transform(shell);
  return new Response(request.method === "HEAD" ? null : transformed.body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": noindex ? "noindex, follow" : "index, follow", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" } });
}

export async function editorialFeed(request: Request, env: Env) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  const rows = await env.DB!.prepare("SELECT * FROM news_posts WHERE status = 'published' AND noindex = 0 ORDER BY published_at DESC LIMIT 200").all<NewsPost>();
  const rss = new URL(request.url).pathname === "/noticias/feed.xml";
  const xml = rss ? `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>JurisConecta: noticias y guías legales</title><link>${newsOrigin}/noticias/</link><description>Información práctica para buscar abogados en Chile.</description><language>es-cl</language>${rows.results.map((post) => `<item><title>${e(post.title)}</title><link>${newsOrigin}${href(post)}</link><guid isPermaLink="true">${newsOrigin}${href(post)}</guid><description>${e(post.excerpt)}</description><pubDate>${new Date(iso(post.published_at || post.created_at)).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`
    : `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/", "/equipo/", "/soporte/", "/noticias/"].map((path) => `<url><loc>${newsOrigin}${path}</loc></url>`).join("")}${rows.results.map((post) => `<url><loc>${newsOrigin}${href(post)}</loc><lastmod>${iso(post.updated_at)}</lastmod></url>`).join("")}</urlset>`;
  return new Response(request.method === "HEAD" ? null : xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } });
}
