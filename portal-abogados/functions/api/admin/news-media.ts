import { isAdmin } from "../../_lib/admin-auth";
import { readSession, type AuthEnv } from "../../_lib/github-auth";
import { readJsonBody } from "../../_lib/http";

export async function uploadNewsMedia(request: Request, env: AuthEnv) {
  if (!await isAdmin(request, env)) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const body = await readJsonBody(request, 85_000);
  const data = typeof body?.data === "string" ? body.data : "";
  const alt = typeof body?.alt === "string" ? body.alt.trim().slice(0, 200) : "";
  const match = data.match(/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || !alt) return Response.json({ error: "Selecciona una imagen y escribe su texto alternativo." }, { status: 400 });
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0)); } catch { return Response.json({ error: "Imagen inválida." }, { status: 400 }); }
  const mime = match[1];
  const validMagic = mime === "image/webp" ? new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
    : mime === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  if (!validMagic || bytes.length > 61_440 || bytes.length < 12) return Response.json({ error: "La imagen debe ser JPEG, PNG o WebP y pesar hasta 60 KB después de comprimir." }, { status: 400 });
  const login = (await readSession(request, env))!.login;
  const id = crypto.randomUUID();
  // Hard pilot quota: no unbounded D1 media growth, no new R2 product.
  const [result] = await env.DB.batch([
    env.DB.prepare("INSERT INTO news_media (id, data_base64, mime_type, byte_size, alt, created_by) SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM news_media) < 100 AND (SELECT COALESCE(SUM(byte_size),0) FROM news_media) + ? <= 5242880").bind(id, match[2], mime, bytes.length, alt, login, bytes.length),
    env.DB.prepare("INSERT INTO admin_audit_log (id, github_login, action, target_type, target_id, details_json) SELECT ?, ?, 'news.media.upload', 'news_media', ?, ? WHERE changes() = 1").bind(crypto.randomUUID(), login, id, JSON.stringify({ bytes: bytes.length })),
  ]);
  if (result.meta?.changes !== 1) return Response.json({ error: "Se alcanzó el límite de imágenes del piloto (100 imágenes / 5 MB)." }, { status: 413 });
  return Response.json({ url: `/noticias/media/${id}`, alt }, { headers: { "Cache-Control": "no-store" } });
}
