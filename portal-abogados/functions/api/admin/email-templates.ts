import { adminAuditStatement } from "../../_lib/admin-audit";
import { EmailTemplateError, emailPreviewDocument, parseEmailContent, previewEmailContent, readEmailTemplate, readEmailTemplates, readEmailTemplateVersions } from "../../_lib/email-templates";
import { readSession, type AuthEnv } from "../../_lib/github-auth";
import { readJsonBody } from "../../_lib/http";
import { emailDefinition } from "../../../shared/email-templates";
interface Context { request: Request; env: AuthEnv }
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };
function failed(error: unknown): Response { if (error instanceof EmailTemplateError) return Response.json({ error: error.message }, { status: error.status, headers }); throw error; }
function blockedOrigin(request: Request) { const origin = request.headers.get("Origin"); return origin !== new URL(request.url).origin || request.headers.get("Sec-Fetch-Site") === "cross-site"; }
export const onRequestGet = async ({ request, env }: Context) => {
  const admin = await readSession(request, env);
  if (!admin) return Response.json({ error: "No autorizado." }, { status: 401, headers });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503, headers });
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (id) return Response.json({ template: await readEmailTemplate(env.DB, id), versions: await readEmailTemplateVersions(env.DB, id), canPublish: admin.role === "owner", deliveryEnabled: false }, { headers });
    return Response.json({ templates: await readEmailTemplates(env.DB), canPublish: admin.role === "owner", deliveryEnabled: false }, { headers });
  } catch (error) { return failed(error); }
};
export const onRequestPost = async ({ request, env }: Context) => {
  const admin = await readSession(request, env);
  if (!admin) return Response.json({ error: "No autorizado." }, { status: 401, headers });
  if (blockedOrigin(request)) return Response.json({ error: "Origen no permitido." }, { status: 403, headers });
  const body = await readJsonBody(request, 64_000);
  if (!body || !["preview", "sanitize"].includes(String(body.action)) || typeof body.id !== "string") return Response.json({ error: "Indica la plantilla y la acción de vista previa o edición segura." }, { status: 400, headers });
  try {
    if (body.action === "sanitize") {
      const definition = emailDefinition(body.id);
      if (!definition) throw new EmailTemplateError("Ese evento no está disponible.", 404);
      return Response.json({ ...parseEmailContent(body.content, definition), deliveryEnabled: false }, { headers });
    }
    const preview = previewEmailContent(body.id, body.content); return Response.json({ preview, document: emailPreviewDocument(preview.html), message: "Vista previa con datos ficticios; no se envió ningún correo." }, { headers });
  } catch (error) { return failed(error); }
};
export function handleAdminEmailTemplates(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method === "GET") return onRequestGet({ request, env });
  if (request.method === "POST") return onRequestPost({ request, env });
  if (request.method === "PATCH") return onRequestPatch({ request, env });
  return Promise.resolve(new Response(null, { status: 405, headers: { ...headers, Allow: "GET, POST, PATCH" } }));
}
export const onRequestPatch = async ({ request, env }: Context) => {
  const admin = await readSession(request, env);
  if (!admin) return Response.json({ error: "No autorizado." }, { status: 401, headers });
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503, headers });
  if (blockedOrigin(request)) return Response.json({ error: "Origen no permitido." }, { status: 403, headers });
  const body = await readJsonBody(request, 64_000), action = body?.action;
  if (!body || typeof body.id !== "string" || !["save_draft", "publish", "reset_draft"].includes(String(action)) || typeof body.expectedRevision !== "number" || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) return Response.json({ error: "Datos inválidos: recarga la versión actual de la plantilla." }, { status: 400, headers });
  if (action === "publish" && (admin.role !== "owner" || body.confirmPublish !== true)) return Response.json({ error: "Solo el propietario puede publicar, con confirmación explícita. Publicar no activa envíos." }, { status: 403, headers });
  try {
    const definition = emailDefinition(body.id);
    if (!definition) throw new EmailTemplateError("Ese evento no está disponible.", 404);
    const before = await readEmailTemplate(env.DB, body.id);
    if (before.revision !== body.expectedRevision) throw new EmailTemplateError("Otra persona modificó esta plantilla. Recarga antes de guardar.", 409);
    const { content, warnings } = parseEmailContent(action === "reset_draft" ? before.published ?? definition.example : action === "publish" ? before.draft : body.content, definition, action === "publish");
    const revision = before.revision + 1, guard = crypto.randomUUID(), serialized = JSON.stringify(content);
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO email_template_transaction_guards (id, valid) SELECT ?, CASE WHEN COALESCE((SELECT revision FROM email_templates WHERE id = ?), 0) = ? THEN 1 ELSE 0 END").bind(guard, body.id, before.revision),
        env.DB.prepare("INSERT INTO email_templates (id, revision, draft_json, published_json, published_revision, updated_by, published_at, published_by) VALUES (?, ?, ?, ?, ?, ?, CASE WHEN ? = 'publish' THEN CURRENT_TIMESTAMP ELSE ? END, ?) ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, draft_json = excluded.draft_json, published_json = excluded.published_json, published_revision = excluded.published_revision, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by, published_at = excluded.published_at, published_by = excluded.published_by").bind(body.id, revision, serialized, action === "publish" ? serialized : before.published ? JSON.stringify(before.published) : null, action === "publish" ? revision : before.publishedRevision, admin.login, action, before.publishedAt, action === "publish" ? admin.login : before.publishedBy),
        env.DB.prepare("INSERT INTO email_template_versions (template_id, revision, action, content_json, created_by) VALUES (?, ?, ?, ?, ?)").bind(body.id, revision, action, serialized, admin.login),
        await adminAuditStatement(request, env, env.DB, `email_template.${action}`, "email_template", body.id, { previousRevision: before.revision, revision, deliveryEnabled: false }),
        env.DB.prepare("DELETE FROM email_template_transaction_guards WHERE id = ?").bind(guard),
      ]);
    } catch { throw new EmailTemplateError("No se guardó: la plantilla cambió durante la edición o la base de datos no aceptó la operación. Recarga y vuelve a intentar.", 409); }
    return Response.json({ template: await readEmailTemplate(env.DB, body.id), warnings, deliveryEnabled: false }, { headers });
  } catch (error) { return failed(error); }
};
