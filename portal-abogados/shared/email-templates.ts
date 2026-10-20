/** Transactional email definitions. This catalog does not activate any outbound delivery. */
export type EmailAudience = "client" | "lawyer" | "all" | "admin";
export type EmailTemplateContent = { senderName: string; replyTo: string; subject: string; html: string; text: string };
export type EmailTemplateDefinition = { id: string; title: string; description: string; audience: EmailAudience; variables: string[]; example: EmailTemplateContent };
export type EmailTemplateRecord = { id: string; revision: number; draft: EmailTemplateContent; published: EmailTemplateContent | null; publishedRevision: number | null; updatedAt: string | null; updatedBy: string | null; publishedAt: string | null; publishedBy: string | null };
export type EmailTemplateVersion = { revision: number; action: "save_draft" | "publish" | "reset_draft"; content: EmailTemplateContent; createdAt: string; createdBy: string };
export type EmailTemplatePreview = { subject: string; html: string; text: string; senderName: string; replyTo: string; warnings: string[]; deliveryEnabled: false; usesExampleData: true };
export const emailTemplateLimits = { html: 40_000, text: 16_000, subject: 180, senderName: 80, replyTo: 254 };
export const EMAIL_SENDER_ADDRESS = "jurisconecta.site@gmail.com";
export const EMAIL_SITE_ORIGIN = "https://jurisconecta.cl";
/** Fixed first-party artwork: no per-recipient URL, query string or tracking identifier. */
export const EMAIL_LOGO_URL = `${EMAIL_SITE_ORIGIN}/brand/logo-email.png`;
export const EMAIL_LOGO_ATTRIBUTES = {
  src: EMAIL_LOGO_URL,
  alt: "JurisConecta",
  width: "335",
  height: "100",
  border: "0",
  style: "display:block;width:100%;max-width:335px;height:auto;margin:0 auto;border-width:0;border-style:none",
} as const;
export function emailBrandMasthead(): string {
  const attributes = Object.entries(EMAIL_LOGO_ATTRIBUTES).map(([key, value]) => `${key}="${value}"`).join(" ");
  return `<div style="background-color:#111617;padding:24px 32px">` + `<img ${attributes}>` + `</div>`;
}
const commonVariables = ["recipient_name", "site_name", "action_url", "support_email", "current_year"];
function definition(id: string, title: string, description: string, audience: EmailAudience, subject: string, message: string, button: string, variables: string[] = []): EmailTemplateDefinition {
  const html = `<div style="background-color:#111617;padding:24px"><table role="presentation" style="width:100%;max-width:620px;margin:0 auto;background-color:#111617;border-radius:20px"><tbody><tr><td>${emailBrandMasthead()}</td></tr><tr><td style="padding:32px;font-family:Arial,sans-serif;color:#e4ded0"><h1 style="font-size:26px;line-height:1.3;color:#d8bd83">${title}</h1><p>Hola {{recipient_name}},</p><p style="font-size:16px;line-height:1.7">${message}</p><p style="margin:28px 0"><a href="{{action_url}}" style="background-color:#d8bd83;color:#111617;padding:14px 22px;border-radius:28px;text-decoration:none;display:inline-block">${button}</a></p><p style="font-size:13px;line-height:1.6;color:#e4ded0">Por seguridad, revisa los detalles dentro de tu cuenta. No respondas con documentos ni información sensible de tu caso.</p><hr><p style="font-size:12px;color:#e4ded0">¿Necesitas ayuda? {{support_email}} · © {{current_year}} {{site_name}}</p></td></tr></tbody></table></div>`;
  return { id, title, description, audience, variables: [...commonVariables, ...variables], example: { senderName: "JurisConecta", replyTo: EMAIL_SENDER_ADDRESS, subject, html, text: `Hola {{recipient_name}},\n\n${message}\n\n${button}: {{action_url}}\n\nPor seguridad, revisa los detalles dentro de tu cuenta. No respondas con documentos ni información sensible.\nAyuda: {{support_email}}\n© {{current_year}} {{site_name}}` } };
}
export const EMAIL_TEMPLATE_DEFINITIONS: EmailTemplateDefinition[] = [
  definition("welcome-client", "Bienvenido a JurisConecta", "Bienvenida tras completar el registro de cliente.", "client", "Tu cuenta de cliente en {{site_name}}", "Tu cuenta de cliente está lista. Desde tu panel podrás revisar tus solicitudes, comparar propuestas y consultar sus avances.", "Ir a mi panel"),
  definition("welcome-lawyer", "Recibimos tu registro profesional", "Bienvenida del abogado, sin afirmar aprobación documental.", "lawyer", "Recibimos tu registro en {{site_name}}", "Recibimos tu registro como profesional. Completa tu perfil y revisa el estado de verificación desde tu panel; este mensaje no acredita aprobación.", "Completar perfil"),
  definition("verify-email", "Verifica tu correo", "Ejemplo para el futuro flujo de verificación, aún no conectado.", "all", "Verifica tu correo de {{site_name}}", "Confirma que esta dirección te pertenece usando el enlace seguro. Si no solicitaste una cuenta, ignora este mensaje.", "Verificar correo"),
  definition("password-reset", "Recupera el acceso a tu cuenta", "Ejemplo para recuperación segura; no genera tokens ni cambia contraseñas.", "all", "Solicitud de recuperación de {{site_name}}", "Recibimos una solicitud para recuperar el acceso. Usa el enlace seguro solo si tú la solicitaste. Si no fuiste tú, no necesitas hacer nada.", "Recuperar acceso"),
  definition("case-received", "Recibimos tu solicitud", "Acuse de recibo de un caso publicado por un cliente.", "client", "Solicitud {{case_reference}} recibida en {{site_name}}", "Registramos tu solicitud {{case_reference}}. Puedes revisar su estado desde tu panel. La recepción no garantiza representación legal ni un resultado.", "Revisar solicitud", ["case_reference"]),
  definition("proposal-received", "Tienes una nueva propuesta", "Aviso al cliente sin exponer los detalles jurídicos por correo.", "client", "Nueva propuesta para {{case_reference}}", "Recibiste una propuesta para tu solicitud {{case_reference}}. Revisa su alcance y condiciones dentro de la plataforma antes de decidir.", "Comparar propuestas", ["case_reference"]),
  definition("proposal-accepted", "Tu propuesta fue aceptada", "Aviso al abogado cuando el cliente acepta una propuesta.", "lawyer", "Propuesta aceptada: {{case_reference}}", "El cliente aceptó tu propuesta para la solicitud {{case_reference}}. Revisa los siguientes pasos y los permisos de contacto desde tu panel.", "Revisar caso", ["case_reference"]),
  definition("lawyer-verification", "Hay novedades en tu verificación", "Estado de revisión profesional; consultar decisión real en el panel.", "lawyer", "Actualización de tu verificación en {{site_name}}", "Hay una actualización en la revisión de tu perfil profesional. Consulta el resultado y cualquier antecedente pendiente dentro de tu cuenta.", "Ver resultado"),
  definition("ticket-created", "Recibimos tu ticket de soporte", "Acuse al usuario cuando crea una solicitud de soporte.", "all", "Ticket {{ticket_reference}} recibido", "Tu ticket {{ticket_reference}} fue registrado. Nuestro equipo lo revisará y podrás seguir la conversación desde Soporte. No se ha establecido un plazo garantizado de respuesta.", "Ver mi ticket", ["ticket_reference"]),
  definition("ticket-reply", "Soporte respondió tu ticket", "Respuesta visible del equipo, sin incluir notas internas.", "all", "Nueva respuesta en {{ticket_reference}}", "El equipo de soporte agregó una respuesta a tu ticket {{ticket_reference}}. Ingresa a tu cuenta para leerla y responder de forma segura.", "Leer respuesta", ["ticket_reference"]),
  definition("ticket-team-alert", "Ticket pendiente de atención", "Aviso interno al equipo ante un ticket nuevo o respuesta del usuario.", "admin", "Atención requerida: {{ticket_reference}}", "El ticket {{ticket_reference}} tiene actividad del usuario pendiente de revisión. Consulta la bandeja administrativa para revisar los antecedentes y asignar un responsable.", "Abrir bandeja de soporte", ["ticket_reference"]),
  definition("account-security", "Cambio de seguridad en tu cuenta", "Aviso de seguridad sin datos del dispositivo ni credenciales.", "all", "Revisa la seguridad de tu cuenta de {{site_name}}", "Se registró un cambio de seguridad en tu cuenta. Si no lo reconoces, revisa tus sesiones y contacta al soporte desde el sitio oficial.", "Revisar mi cuenta"),
];
export function emailDefinition(id: string) { return EMAIL_TEMPLATE_DEFINITIONS.find((definition) => definition.id === id); }
export function emptyEmailTemplate(definition: EmailTemplateDefinition): EmailTemplateRecord { return { id: definition.id, revision: 0, draft: structuredClone(definition.example), published: null, publishedRevision: null, updatedAt: null, updatedBy: null, publishedAt: null, publishedBy: null }; }
