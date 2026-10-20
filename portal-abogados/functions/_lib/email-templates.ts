import sanitizeHtml from "sanitize-html";
import { EMAIL_SITE_ORIGIN, EMAIL_SENDER_ADDRESS, EMAIL_TEMPLATE_DEFINITIONS, EMAIL_LOGO_URL, EMAIL_LOGO_ATTRIBUTES, emailBrandMasthead, emailDefinition, emailTemplateLimits, emptyEmailTemplate, type EmailTemplateContent, type EmailTemplateDefinition, type EmailTemplatePreview, type EmailTemplateRecord, type EmailTemplateVersion } from "../../shared/email-templates";
import type { D1Database } from "./user-auth";

export class EmailTemplateError extends Error { constructor(message: string, public status = 400) { super(message); } }
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
const color = /^(#[\da-f]{3,8}|[a-z]{3,20}|rgba?\([\d.,% ]+\))$/i;
const size = /^(0|auto|[\d.]{1,5}(px|em|rem|%))$/;
const spacing = /^(0|[\d.]{1,5}(px|em|rem|%))( (0|[\d.]{1,5}(px|em|rem|%))){0,3}$/;
const margin = /^(0|auto|[\d.]{1,5}(px|em|rem|%))( (0|auto|[\d.]{1,5}(px|em|rem|%))){0,3}$/;
const allowedStyles = { "*": {
  color: [color], "background-color": [color], width: [size], "max-width": [size], "min-width": [size], height: [size],
  padding: [spacing], margin: [margin], "border-radius": [spacing], "border-color": [color], "border-width": [size], "border-style": [/^(solid|none|dashed|dotted)$/],
  "font-family": [/^[a-z ,'-]{1,100}$/i], "font-size": [/^[\d.]{1,4}(px|em|rem|%)$/], "font-weight": [/^(normal|bold|[1-9]00)$/],
  "text-align": [/^(left|right|center|justify)$/], "vertical-align": [/^(top|middle|bottom)$/], "text-decoration": [/^(none|underline)$/],
  "line-height": [/^[\d.]{1,5}(px|em|rem|%)?$/], display: [/^(block|inline|inline-block|table|table-cell)$/], "border-collapse": [/^(collapse|separate)$/],
} };
/** No active content or arbitrary resources. The sole image is fixed, first-party brand artwork. */
export function sanitizeEmailHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: ["div", "span", "p", "br", "strong", "b", "em", "i", "u", "h1", "h2", "h3", "h4", "blockquote", "ul", "ol", "li", "hr", "a", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "img"],
    allowedAttributes: { "*": ["style"], table: ["role", "cellpadding", "cellspacing"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan", "scope"], a: ["href", "rel"], img: ["src", "alt", "width", "height", "border"] },
    allowedStyles, allowedSchemes: ["https"], allowProtocolRelative: false,
    nonTextTags: ["script", "style", "textarea", "option", "svg", "math"],
    exclusiveFilter: (frame) => frame.tag === "img" && frame.attribs.src !== EMAIL_LOGO_URL,
    transformTags: { a: (_tag, attrs): sanitizeHtml.Tag => {
      const href = attrs.href || "", safe = href === "{{action_url}}" || safeActionUrl(href);
      return { tagName: "a", attribs: { ...(safe ? { href, rel: "noopener noreferrer" } : {}), ...(attrs.style ? { style: attrs.style } : {}) } };
    }, img: (_tag, attrs): sanitizeHtml.Tag => ({ tagName: "img", attribs: attrs.src === EMAIL_LOGO_URL ? { ...EMAIL_LOGO_ATTRIBUTES } : {} }) },
  });
}
/** Rendering-only fallback keeps legacy drafts/published records intact and avoids duplicate mastheads. */
function withEmailBrand(html: string): string {
  const safeHtml = sanitizeEmailHtml(html);
  return safeHtml.includes(`src="${EMAIL_LOGO_URL}"`) ? safeHtml : `${sanitizeEmailHtml(emailBrandMasthead())}${safeHtml}`;
}
export function safeActionUrl(value: string) {
  try { const url = new URL(value); return url.origin === EMAIL_SITE_ORIGIN && !url.username && !url.password && !/[\r\n\x00-\x1f]/.test(value) && !url.pathname.startsWith("//"); } catch { return false; }
}
export function parseEmailContent(value: unknown, definition: EmailTemplateDefinition, publishing = false): { content: EmailTemplateContent; warnings: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EmailTemplateError("La plantilla no tiene un formato válido.");
  const row = value as Record<string, unknown>, content = {} as EmailTemplateContent;
  for (const key of ["senderName", "replyTo", "subject", "html", "text"] as const) {
    if (typeof row[key] !== "string" || row[key].length > emailTemplateLimits[key]) throw new EmailTemplateError(`Revisa el campo ${key} y su límite de caracteres.`);
    content[key] = row[key].trim();
  }
  if (/[\r\n\x00-\x1f\x7f]/.test(content.subject + content.senderName + content.replyTo)) throw new EmailTemplateError("El asunto y los datos de cabecera no admiten saltos de línea ni controles.");
  if (content.replyTo && !(content.replyTo === EMAIL_SENDER_ADDRESS || /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@jurisconecta\.cl$/i.test(content.replyTo))) throw new EmailTemplateError("La dirección de respuesta debe ser el Gmail de JurisConecta o una dirección @jurisconecta.cl. Su recepción deberá configurarse antes de enviar.");
  const raw = `${content.subject}\n${content.html}\n${content.text}`;
  const allowed = new Set(definition.variables);
  const rest = raw.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_whole, variable: string) => { if (!allowed.has(variable)) throw new EmailTemplateError(`Variable no permitida: ${variable}. Usa las variables indicadas para este evento.`); return ""; });
  if (rest.includes("{{") || rest.includes("}}")) throw new EmailTemplateError("Hay una variable incompleta. Usa el formato {{recipient_name}}.");
  const sanitized = sanitizeEmailHtml(content.html), warnings: string[] = [];
  if (sanitized !== content.html) warnings.push("El HTML se normalizó y se eliminaron, si estaban presentes, etiquetas, estilos o enlaces no permitidos. Revisa la vista previa.");
  content.html = sanitized;
  if (publishing && (content.subject.length < 3 || content.senderName.length < 2 || !content.replyTo || sanitizeHtml(content.html, { allowedTags: [], allowedAttributes: {} }).trim().length < 20 || content.text.length < 20)) throw new EmailTemplateError("Antes de publicar, completa remitente, respuesta, asunto y contenido HTML y texto (20 caracteres como mínimo).");
  return { content, warnings };
}
const sampleData: Record<string, string> = { recipient_name: "Camila Ejemplo", site_name: "JurisConecta", support_email: EMAIL_SENDER_ADDRESS, current_year: "2026", case_reference: "CASO-DEMO-001", ticket_reference: "TICKET-DEMO-001" };
export function renderEmailContent(id: string, raw: unknown, variables: Record<string, string>): Omit<EmailTemplatePreview, "usesExampleData"> {
  const definition = emailDefinition(id);
  if (!definition) throw new EmailTemplateError("Ese evento de correo no está disponible.", 404);
  const { content, warnings } = parseEmailContent(raw, definition);
  for (const key of Object.keys(variables)) if (!definition.variables.includes(key)) throw new EmailTemplateError(`Variable no permitida: ${key}.`);
  const substitute = (source: string, html: boolean) => source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_whole, key: string) => {
    const value = variables[key];
    if (typeof value !== "string" || value.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new EmailTemplateError(`Falta un valor válido para ${key}.`);
    if (key === "action_url" && !safeActionUrl(value)) throw new EmailTemplateError("El enlace de acción debe pertenecer a https://jurisconecta.cl.");
    return html ? escapeHtml(value) : value;
  });
  const subject = substitute(content.subject, false);
  if (/[\r\n\x00-\x1f\x7f]/.test(subject) || subject.length > 300) throw new EmailTemplateError("El asunto renderizado contiene datos inválidos.");
  return { subject, html: withEmailBrand(substitute(content.html, true)), text: substitute(content.text, false), senderName: content.senderName, replyTo: content.replyTo, warnings, deliveryEnabled: false };
}
export function previewEmailContent(id: string, raw: unknown): EmailTemplatePreview {
  const definition = emailDefinition(id);
  if (!definition) throw new EmailTemplateError("Ese evento de correo no está disponible.", 404);
  const variables = Object.fromEntries(definition.variables.map((key) => [key, key === "action_url" ? `${EMAIL_SITE_ORIGIN}${definition.audience === "admin" ? "/admin/#tickets" : definition.audience === "lawyer" ? "/dashboard/" : "/cliente/"}` : sampleData[key]]));
  return { ...renderEmailContent(id, raw, variables), usesExampleData: true };
}
/** Sandboxed iframe permits only the fixed first-party logo; no JS, fonts, forms or other network loads. */
export function emailPreviewDocument(html: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${EMAIL_LOGO_URL}; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'"><title>Vista previa ficticia de correo</title><style>body{margin:0;background-color:#111617;font-family:Arial,sans-serif;overflow-wrap:anywhere}table{max-width:100%}a{pointer-events:none}</style></head><body>${withEmailBrand(html)}</body></html>`;
}
type Row = { id: string; revision: number; draft_json: string; published_json: string | null; published_revision: number | null; updated_at: string; updated_by: string; published_at: string | null; published_by: string | null };
function fromRow(row: Row): EmailTemplateRecord {
  const definition = emailDefinition(row.id);
  if (!definition) throw new EmailTemplateError("Evento guardado desconocido.", 503);
  try { return { id: row.id, revision: row.revision, draft: parseEmailContent(JSON.parse(row.draft_json), definition).content, published: row.published_json ? parseEmailContent(JSON.parse(row.published_json), definition, true).content : null, publishedRevision: row.published_revision, updatedAt: row.updated_at, updatedBy: row.updated_by, publishedAt: row.published_at, publishedBy: row.published_by }; }
  catch { throw new EmailTemplateError("La plantilla guardada requiere revisión antes de usarla.", 503); }
}
export async function readEmailTemplates(db: D1Database): Promise<EmailTemplateRecord[]> {
  const rows = await db.prepare("SELECT * FROM email_templates ORDER BY id LIMIT 50").all<Row>();
  const merged = new Map(EMAIL_TEMPLATE_DEFINITIONS.map((definition) => [definition.id, emptyEmailTemplate(definition)]));
  for (const row of rows.results) if (merged.has(row.id)) merged.set(row.id, fromRow(row));
  return [...merged.values()];
}
export async function readEmailTemplate(db: D1Database, id: string): Promise<EmailTemplateRecord> {
  const definition = emailDefinition(id);
  if (!definition) throw new EmailTemplateError("Ese evento no está disponible.", 404);
  const row = await db.prepare("SELECT * FROM email_templates WHERE id = ?").bind(id).first<Row>();
  return row ? fromRow(row) : emptyEmailTemplate(definition);
}
export async function readEmailTemplateVersions(db: D1Database, id: string): Promise<EmailTemplateVersion[]> {
  const definition = emailDefinition(id);
  if (!definition) throw new EmailTemplateError("Ese evento no está disponible.", 404);
  const rows = await db.prepare("SELECT revision, action, content_json, created_at, created_by FROM email_template_versions WHERE template_id = ? ORDER BY revision DESC LIMIT 20").bind(id).all<{ revision: number; action: EmailTemplateVersion["action"]; content_json: string; created_at: string; created_by: string }>();
  return rows.results.map((row) => ({ revision: row.revision, action: row.action, content: parseEmailContent(JSON.parse(row.content_json), definition).content, createdAt: row.created_at, createdBy: row.created_by }));
}
/** Future callers may render only a published version, but no delivery provider is configured here. */
export async function preparePublishedEmail(db: D1Database, id: string, variables: Record<string, string>) {
  const template = await readEmailTemplate(db, id);
  if (!template.published) throw new EmailTemplateError("El evento aún no tiene una plantilla publicada.", 409);
  return { status: "delivery_disabled" as const, templateId: id, revision: template.publishedRevision, rendered: renderEmailContent(id, template.published, variables) };
}
