import { isAdmin } from "../../_lib/admin-auth";
import { readSession, type AuthEnv } from "../../_lib/github-auth";
import { noStore, readJsonBody } from "../../_lib/http";
import { validateNews, type NewsPost } from "../../_lib/news";
type Context = { request: Request; env: AuthEnv };

export async function handleAdminNews({ request, env }: Context) {
  if (!await isAdmin(request, env)) return noStore(Response.json({ error: "No autorizado." }, { status: 401 }));
  const db = env.DB;
  if (!db) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  if (request.method === "GET") {
    const rows = await db.prepare("SELECT * FROM news_posts ORDER BY updated_at DESC LIMIT 200").all<NewsPost>();
    return noStore(Response.json({ posts: rows.results }));
  }
  const body = await readJsonBody(request, 90_000);
  if (!body) return Response.json({ error: "Formulario inválido o demasiado grande." }, { status: 400 });
  const validation = validateNews(body);
  if (!validation.data) return Response.json({ error: validation.error }, { status: 400 });
  const post = validation.data;
  const id = request.method === "PUT" && typeof body.id === "string" ? body.id : crypto.randomUUID();
  const existing = await db.prepare("SELECT * FROM news_posts WHERE id = ?").bind(id).first<NewsPost>();
  if (request.method === "PUT" && !existing) return Response.json({ error: "Noticia no encontrada." }, { status: 404 });
  if (existing && body.version !== existing.version) return Response.json({ error: "Otra sesión modificó esta noticia. Vuelve a cargarla antes de guardar." }, { status: 409 });
  if (existing && existing.slug !== post.slug) return Response.json({ error: "El slug publicado es permanente para conservar sus enlaces. Crea otra noticia para cambiarlo." }, { status: 400 });
  const duplicate = await db.prepare("SELECT id FROM news_posts WHERE slug = ? AND id != ?").bind(post.slug, id).first<{ id: string }>();
  if (duplicate) return Response.json({ error: "Ese slug ya existe. Elige otro." }, { status: 409 });
  const login = (await readSession(request, env))!.login;
  const keys = Object.keys(post);
  const values = Object.values(post);
  const published = existing?.published_at || (post.status === "published" ? new Date().toISOString() : null);
  const statement = existing
    ? db.prepare(`UPDATE news_posts SET ${keys.map((key) => `${key} = ?`).join(", ")}, published_at = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = ? AND version = ?`).bind(...values, published, login, id, existing.version)
    : db.prepare(`INSERT INTO news_posts (id, ${keys.join(", ")}, published_at, updated_by) SELECT ${Array(keys.length + 3).fill("?").join(", ")} WHERE (SELECT COUNT(*) FROM news_posts) < 200`).bind(id, ...values, published, login);
  // Optimistic version constraint also covers simultaneous saves after the preflight check.
  const audit = db.prepare("INSERT INTO admin_audit_log (id, github_login, action, target_type, target_id, details_json) SELECT ?, ?, ?, 'news_post', ?, ? WHERE changes() = 1").bind(crypto.randomUUID(), login, existing ? "news.update" : "news.create", id, JSON.stringify({ slug: post.slug, status: post.status }));
  const [result] = await db.batch([statement, audit]);
  if (existing && result.meta?.changes !== 1) return Response.json({ error: "Conflicto de edición. Recarga la noticia." }, { status: 409 });
  if (!existing && result.meta?.changes !== 1) return Response.json({ error: "Se alcanzó el límite editorial del piloto (200 noticias)." }, { status: 413 });
  return noStore(Response.json({ saved: true, id, version: (existing?.version || 0) + 1 }));
}
