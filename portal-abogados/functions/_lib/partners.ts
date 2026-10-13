import { readSession, type AuthEnv } from "./github-auth";
import { readJsonBody } from "./http";
import { partnerLimits, type AdminPartner, type PartnerCategory, type PublicPartner } from "../../shared/partners";

type PartnerRow = {
  id: string; name: string; category: PartnerCategory; alt: string; link_url: string; sort_order: number;
  active: number; archived: number; version: number; byte_size: number; updated_at: string; updated_by: string;
};
type ImageData = { base64: string; mime: "image/png" | "image/webp"; bytes: number };
const metadataColumns = "id, name, category, alt, link_url, sort_order, active, archived, version, byte_size, updated_at, updated_by";
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const encoder = new TextDecoder();
function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
function publicPartner(row: PartnerRow): PublicPartner {
  return { id: row.id, name: row.name, category: row.category, alt: row.alt, linkUrl: row.link_url,
    sortOrder: row.sort_order, version: row.version, imageUrl: `/aliados/media/${row.id}?v=${row.version}` };
}
function adminPartner(row: PartnerRow): AdminPartner {
  return { ...publicPartner(row), active: row.active === 1, archived: row.archived === 1,
    imageUrl: `/api/admin/partners?media=1&id=${row.id}&v=${row.version}`,
    byteSize: row.byte_size, updatedAt: row.updated_at, updatedBy: row.updated_by };
}
function safeText(value: unknown, min: number, max: number) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= min && text.length <= max && !/[\u0000-\u001f\u007f]/.test(text) ? text : null;
}
export function validatePartnerMetadata(body: Record<string, unknown>) {
  const name = safeText(body.name, 2, 100), alt = safeText(body.alt, 2, 200);
  if (!name || !alt) return { error: "Escribe un nombre (2–100 caracteres) y texto alternativo (2–200)." };
  if (body.category !== "company" && body.category !== "law_firm") return { error: "Selecciona empresa o estudio jurídico." };
  if (typeof body.active !== "boolean" || !Number.isInteger(body.sortOrder) || Number(body.sortOrder) < 0 || Number(body.sortOrder) > 9999) return { error: "Revisa el estado y el orden (0–9999)." };
  if (typeof body.linkUrl !== "string" || body.linkUrl.length > 500) return { error: "El enlace debe ser HTTPS o quedar vacío." };
  const link = body.linkUrl.trim();
  if (link) {
    try {
      const url = new URL(link);
      if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") || /[\u0000-\u0020\u007f]/.test(link)) throw new Error("invalid");
    } catch { return { error: "El enlace debe ser una dirección HTTPS completa y sin credenciales." }; }
  }
  return { data: { name, alt, category: body.category as PartnerCategory, linkUrl: link, sortOrder: Number(body.sortOrder), active: body.active } };
}
function u32(bytes: Uint8Array, offset: number, little = false) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, little);
}
function validPng(bytes: Uint8Array) {
  if (bytes.length < 45 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) return false;
  let offset = 8, hasData = false, first = true;
  while (offset + 12 <= bytes.length) {
    const length = u32(bytes, offset), tag = encoder.decode(bytes.subarray(offset + 4, offset + 8));
    if (offset + length + 12 > bytes.length || !["IHDR", "PLTE", "tRNS", "IDAT", "IEND", "sRGB", "gAMA", "cHRM", "pHYs"].includes(tag)) return false;
    if (first) {
      if (tag !== "IHDR" || length !== 13) return false;
      const width = u32(bytes, offset + 8), height = u32(bytes, offset + 12);
      if (!width || !height || width > 1600 || height > 1200) return false;
      first = false;
    } else if (tag === "IHDR") return false;
    if (tag === "IDAT") hasData = true;
    offset += length + 12;
    if (tag === "IEND") return length === 0 && offset === bytes.length && hasData;
  }
  return false;
}
function validWebp(bytes: Uint8Array) {
  if (bytes.length < 26 || encoder.decode(bytes.subarray(0, 4)) !== "RIFF" || encoder.decode(bytes.subarray(8, 12)) !== "WEBP" || u32(bytes, 4, true) !== bytes.length - 8) return false;
  let offset = 12, image = false;
  while (offset + 8 <= bytes.length) {
    const tag = encoder.decode(bytes.subarray(offset, offset + 4)), length = u32(bytes, offset + 4, true), start = offset + 8;
    if (start + length > bytes.length || !["VP8 ", "VP8L", "VP8X", "ALPH", "ICCP"].includes(tag)) return false;
    let width = 0, height = 0;
    if (tag === "VP8X") {
      if (length !== 10 || (bytes[start] & 2) !== 0) return false; // Animated logos are not accepted.
      width = 1 + bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16);
      height = 1 + bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16);
    } else if (tag === "VP8L") {
      if (length < 5 || bytes[start] !== 47) return false;
      const packed = u32(bytes, start + 1, true);
      width = (packed & 0x3fff) + 1; height = ((packed >>> 14) & 0x3fff) + 1; image = true;
    } else if (tag === "VP8 ") {
      if (length < 10 || bytes[start + 3] !== 157 || bytes[start + 4] !== 1 || bytes[start + 5] !== 42) return false;
      width = (bytes[start + 6] | (bytes[start + 7] << 8)) & 0x3fff;
      height = (bytes[start + 8] | (bytes[start + 9] << 8)) & 0x3fff; image = true;
    }
    if ((width || height) && (!width || !height || width > 1600 || height > 1200)) return false;
    offset = start + length + (length % 2);
  }
  return offset === bytes.length && image;
}
export function validatePartnerImage(value: unknown): ImageData | null {
  if (typeof value !== "string" || value.length > 65_560) return null;
  const match = /^data:(image\/(?:png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return null;
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0)); } catch { return null; }
  if (bytes.length > partnerLimits.imageBytes || bytes.length < 26 || btoa(String.fromCharCode(...bytes)) !== match[2]) return null;
  if (match[1] === "image/png" ? !validPng(bytes) : !validWebp(bytes)) return null;
  return { base64: match[2], mime: match[1] as ImageData["mime"], bytes: bytes.length };
}
export async function handlePublicPartners(request: Request, env: AuthEnv) {
  if (request.method !== "GET") return json({ error: "Método no permitido." }, 405);
  if (!env.DB) return json({ partners: [] }, 503);
  const { results } = await env.DB.prepare(`SELECT ${metadataColumns} FROM home_partners WHERE active = 1 AND archived = 0 ORDER BY category, sort_order, name, id LIMIT 40`).all<PartnerRow>();
  return json({ partners: results.map(publicPartner) });
}
export async function handlePartnerMedia(request: Request, env: AuthEnv, id: string) {
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Método no permitido." }, 405);
  const version = new URL(request.url).searchParams.get("v");
  if (!env.DB || !uuidPattern.test(id) || !version || !/^[1-9]\d{0,8}$/.test(version)) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const row = await env.DB.prepare("SELECT data_base64, mime_type, byte_size, version FROM home_partners WHERE id = ? AND version = ? AND active = 1 AND archived = 0").bind(id, Number(version)).first<{ data_base64: string; mime_type: string; byte_size: number; version: number }>();
  if (!row) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const headers = { "Content-Type": row.mime_type, "Content-Length": String(row.byte_size), "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "public, max-age=86400, immutable", ETag: `"partner-${id}-${row.version}"` };
  if (request.headers.get("If-None-Match")?.split(",").map((tag) => tag.trim()).includes(headers.ETag)) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : Uint8Array.from(atob(row.data_base64), (char) => char.charCodeAt(0)), { headers });
}
export async function handleAdminPartners(request: Request, env: AuthEnv) {
  const session = await readSession(request, env);
  if (!session) return json({ error: "No autorizado." }, 401);
  if (!env.DB) return json({ error: "Base de datos no disponible." }, 503);
  const db = env.DB;
  if (request.method === "GET") {
    const url = new URL(request.url);
    if (url.searchParams.get("media") === "1") {
      const id = url.searchParams.get("id") || "", version = url.searchParams.get("v") || "";
      if (!uuidPattern.test(id) || !/^[1-9]\d{0,8}$/.test(version)) return json({ error: "Logo no encontrado." }, 404);
      const media = await db.prepare("SELECT data_base64, mime_type, byte_size FROM home_partners WHERE id = ? AND version = ? AND archived = 0").bind(id, Number(version)).first<{ data_base64: string; mime_type: string; byte_size: number }>();
      if (!media) return json({ error: "Logo no encontrado." }, 404);
      return new Response(Uint8Array.from(atob(media.data_base64), (char) => char.charCodeAt(0)), { headers: { "Content-Type": media.mime_type, "Content-Length": String(media.byte_size), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
    }
    const [rows, storage] = await Promise.all([
      db.prepare(`SELECT ${metadataColumns} FROM home_partners ORDER BY archived, category, sort_order, name, id LIMIT 40`).all<PartnerRow>(),
      db.prepare("SELECT COALESCE(SUM(storage_size), 0) AS total FROM home_partners").first<{ total: number }>(),
    ]);
    return json({ partners: rows.results.map(adminPartner), storageBytes: storage?.total || 0, limits: partnerLimits });
  }
  if (request.method !== "POST" && request.method !== "PATCH") return json({ error: "Método no permitido." }, 405);
  const body = await readJsonBody(request, 70_000);
  if (!body) return json({ error: "Solicitud inválida o demasiado grande." }, 400);
  let current: PartnerRow | null = null;
  const id = request.method === "POST" ? crypto.randomUUID() : typeof body.id === "string" ? body.id : "";
  if (!uuidPattern.test(id)) return json({ error: "Identificador inválido." }, 400);
  if (request.method === "PATCH") {
    if (!Number.isSafeInteger(body.version) || Number(body.version) < 1) return json({ error: "Falta la versión del logo. Actualiza el listado." }, 400);
    current = await db.prepare(`SELECT ${metadataColumns} FROM home_partners WHERE id = ?`).bind(id).first<PartnerRow>();
    if (!current) return json({ error: "Logo no encontrado." }, 404);
    if (current.version !== body.version) return json({ error: "Otro administrador cambió este logo. Actualiza antes de editar." }, 409);
  }
  const archive = request.method === "PATCH" && body.action === "archive";
  if (!archive && body.action !== undefined && body.action !== "update") return json({ error: "Acción inválida." }, 400);
  if (!archive && body.authorized !== true) return json({ error: "Confirma que puedes publicar el logo y la colaboración indicada." }, 400);
  const validated = archive ? null : validatePartnerMetadata(body);
  if (validated?.error) return json({ error: validated.error }, 400);
  const data = validated?.data;
  const image = body.imageData === undefined ? null : validatePartnerImage(body.imageData);
  if ((!archive && body.imageData !== undefined && !image) || (!archive && (!current || current.archived === 1) && !image)) return json({ error: "Sube un logo PNG o WebP válido, de hasta 48 KB y 1600 × 1200 px después de optimizar." }, 400);
  const auditDetails = JSON.stringify(archive ? { name: current!.name, releasedBytes: current!.byte_size }
    : { name: data!.name, category: data!.category, active: data!.active, sortOrder: data!.sortOrder, imageReplaced: Boolean(image), bytes: image?.bytes ?? current?.byte_size ?? 0 });
  const action = archive ? "partners.archive" : current ? current.archived ? "partners.restore" : "partners.update" : "partners.create";
  let mutation;
  if (archive) {
    mutation = db.prepare("UPDATE home_partners SET active = 0, archived = 1, data_base64 = NULL, mime_type = NULL, byte_size = 0, storage_size = 0, version = version + 1, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ? AND version = ?")
      .bind(session.login, id, current!.version);
  } else if (current) {
    mutation = db.prepare("UPDATE home_partners SET name = ?, category = ?, alt = ?, link_url = ?, sort_order = ?, active = ?, archived = 0, data_base64 = COALESCE(?, data_base64), mime_type = COALESCE(?, mime_type), byte_size = COALESCE(?, byte_size), storage_size = COALESCE(?, storage_size), version = version + 1, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ? AND version = ?")
      .bind(data!.name, data!.category, data!.alt, data!.linkUrl, data!.sortOrder, data!.active ? 1 : 0, image?.base64 ?? null, image?.mime ?? null, image?.bytes ?? null, image?.base64.length ?? null, session.login, id, current.version);
  } else {
    mutation = db.prepare("INSERT INTO home_partners (id, name, category, alt, link_url, sort_order, active, data_base64, mime_type, byte_size, storage_size, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, data!.name, data!.category, data!.alt, data!.linkUrl, data!.sortOrder, data!.active ? 1 : 0, image!.base64, image!.mime, image!.bytes, image!.base64.length, session.login);
  }
  try {
    const [result] = await db.batch([mutation,
      db.prepare("INSERT INTO admin_audit_log (id, github_login, action, target_type, target_id, details_json) SELECT ?, ?, ?, 'home_partner', ?, ? WHERE changes() = 1")
        .bind(crypto.randomUUID(), session.login, action, id, auditDetails),
    ]);
    if (result.meta?.changes !== 1) return json({ error: "Otro administrador cambió este logo. Actualiza antes de editar." }, 409);
  } catch (error) {
    if (error instanceof Error && error.message.includes("home_partners_quota")) return json({ error: "Límite del piloto: 40 espacios y 2 MB de almacenamiento. Retira imágenes o reutiliza un espacio retirado." }, 413);
    throw error;
  }
  return json({ id, version: (current?.version || 0) + 1, message: archive ? "Logo retirado del home." : "Logo guardado." });
}
