"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import styles from "./support-operations.module.css";

type Ticket = { id: string; full_name: string; email: string; role: string; subject: string; category: string; status: string; priority: string; assigned_github_id: number | null; assigned_login: string | null; created_at: string; updated_at: string; version: number; needs_reply: number; pending_since: string | null; first_response_at: string | null; resolved_at: string | null; case_id: string | null; case_title: string | null };
type Message = { id: string; author: string; body: string; created_at: string; visibility: "public" | "internal"; admin_login: string | null };
type Administrator = { github_id: number; github_login: string };
type Alert = { id: number; ticket_id: string; kind: string; created_at: string };
type Summary = { total: number; open: number; waiting_user: number; unanswered: number; unassigned: number; average_first_response_seconds: number | null; average_resolution_seconds: number | null };
type ListData = { tickets: Ticket[]; nextCursor: string | null; administrators: Administrator[]; summary: Summary; alerts: Alert[]; unreadAlerts: number };
type ThreadData = { ticket: Ticket; messages: Message[]; nextMessagesCursor: string | null };
type Recovery = { id: string; full_name: string; email: string; role: string; status: string; created_at: string; expires_at: string | null };
const statuses: Record<string, string> = { open: "Abierto", waiting_user: "Esperando usuario", resolved: "Resuelto", closed: "Cerrado" };
const priorities: Record<string, string> = { low: "Baja", normal: "Normal", high: "Alta", urgent: "Urgente" };
const categories: Record<string, string> = { account: "Cuenta y acceso", case: "Caso", technical: "Técnico", privacy: "Privacidad", other: "Otro" };
const alertKinds: Record<string, string> = { ticket_created: "Nuevo ticket", user_replied: "Respuesta de usuario", user_reopened: "Ticket reabierto por usuario" };
function timestamp(value: string) { return new Date(value.includes("T") ? value : `${value}Z`).getTime(); }
function date(value: string) { return new Date(timestamp(value)).toLocaleString("es-CL"); }
function duration(seconds: number | null) { if (seconds === null || !Number.isFinite(seconds)) return "Sin datos"; const minutes = Math.max(0, Math.floor(seconds / 60)); return minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${Math.floor(minutes / 1440)} días ${Math.floor((minutes % 1440) / 60)} h`; }

function AdminTicketDesk() {
  const [data, setData] = useState<ListData | null>(null), [thread, setThread] = useState<ThreadData | null>(null);
  const [filters, setFilters] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [loadingThread, setLoadingThread] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const lock = useRef(false), requestSequence = useRef(0), listSequence = useRef(0), retries = useRef(new Map<string, { signature: string; key: string }>());
  const load = useCallback(async (query: string, cursor?: string) => {
    const sequence = ++listSequence.current, params = new URLSearchParams(query); if (cursor) params.set("cursor", cursor);
    const response = await fetch(`/api/admin/tickets?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error("No pudimos cargar los tickets. Revisa tu sesión administrativa.");
    const result = await response.json() as ListData;
    if (listSequence.current !== sequence) return;
    setData((current) => cursor && current ? { ...result, tickets: [...new Map([...current.tickets, ...result.tickets].map((ticket) => [ticket.id, ticket])).values()] } : result);
    setLoadedAt(Date.now());
    window.dispatchEvent(new Event("juris:support-alerts-updated"));
  }, []);
  async function openTicket(id: string, before?: string) {
    const sequence = ++requestSequence.current; setLoadingThread(true);
    try {
      const params = new URLSearchParams({ ticketId: id }); if (before) params.set("before", before);
      const response = await fetch(`/api/admin/tickets?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("No pudimos cargar la conversación.");
      const result = await response.json() as ThreadData;
      if (requestSequence.current !== sequence) return;
      setThread((current) => before && current?.ticket.id === id ? { ...result, messages: [...result.messages, ...current.messages] } : result);
    } finally { if (requestSequence.current === sequence) setLoadingThread(false); }
  }
  useEffect(() => { void load("").catch((error) => setNotice(error instanceof Error ? error.message : "Error al cargar.")); return () => { requestSequence.current += 1; listSequence.current += 1; }; }, [load]);
  function handleError(error: unknown) { setNotice(error instanceof Error ? error.message : "Error de conexión."); }
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget), params = new URLSearchParams();
    for (const [key, value] of form) if (typeof value === "string" && value) params.set(key, value);
    const query = params.toString(); setFilters(query); void load(query).catch(handleError);
  }
  async function updateTicket(event: FormEvent<HTMLFormElement>, ticket: Ticket) {
    event.preventDefault(); if (lock.current) return;
    const element = event.currentTarget, form = new FormData(element);
    const body = { ticketId: ticket.id, expectedVersion: ticket.version, status: form.get("status"), priority: form.get("priority"), assignedGithubId: form.get("assignedGithubId") ? Number(form.get("assignedGithubId")) : null, visibility: form.get("visibility"), message: form.get("message") };
    const signature = JSON.stringify(body), prior = retries.current.get(ticket.id), key = prior?.signature === signature ? prior.key : crypto.randomUUID(); retries.current.set(ticket.id, { signature, key });
    lock.current = true; setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/admin/tickets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, requestId: key }) });
      const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || "No pudimos guardar.");
      element.reset(); retries.current.delete(ticket.id); setNotice("Cambios guardados. Las notas internas solo las ve el equipo; los avisos de usuario quedan dentro del sitio.");
      try { await Promise.all([load(filters), openTicket(ticket.id)]); }
      catch { setNotice("Los cambios quedaron guardados. La vista no pudo actualizarse; actualízala antes de volver a editar."); }
    } catch (error) { handleError(error); } finally { lock.current = false; setBusy(false); }
  }
  async function acknowledge() {
    if (!data?.alerts.length || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const response = await fetch("/api/admin/tickets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "acknowledge_alerts", throughId: data.alerts[0].id }) });
      if (!response.ok) throw new Error("No pudimos marcar los avisos.");
      window.dispatchEvent(new Event("juris:support-alerts-updated")); await load(filters);
    } catch (error) { handleError(error); } finally { lock.current = false; setBusy(false); }
  }
  return <section className="portal-panel admin-panel" id="tickets"><div className="panel-title"><div><p className="eyebrow">Operación y seguimiento</p><h2>Tickets de usuarios</h2></div><button type="button" className="portal-outline-button" disabled={busy} onClick={() => void load(filters).catch(handleError)}>Actualizar bandeja</button></div><p className={styles.muted}>Bandeja privada. Las alertas son internas y persistentes; no se envían correos. Los indicadores describen tiempos corridos, no un plazo de atención garantizado.</p>{notice && <p role="status" aria-live="polite" className="save-confirmation">{notice}</p>}
    {data && <><div className={styles.metrics}><div className={styles.metric}>Sin responder<strong>{data.summary.unanswered}</strong></div><div className={styles.metric}>Esperando usuario<strong>{data.summary.waiting_user}</strong></div><div className={styles.metric}>Sin responsable<strong>{data.summary.unassigned}</strong></div><div className={styles.metric}>Promedio primera respuesta<strong>{duration(data.summary.average_first_response_seconds)}</strong></div><div className={styles.metric}>Promedio resolución<strong>{duration(data.summary.average_resolution_seconds)}</strong></div></div>{data.unreadAlerts > 0 && <aside className={styles.alerts} aria-label="Avisos internos de soporte"><div className={styles.head}><strong>{data.unreadAlerts} avisos sin leer para tu cuenta</strong><button type="button" className="portal-outline-button" disabled={busy} onClick={() => void acknowledge()}>Marcar todos los avisos hasta ahora como leídos</button></div><ul>{data.alerts.map((alert) => <li key={alert.id}><button type="button" className="portal-text-button" onClick={() => void openTicket(alert.ticket_id).catch(handleError)}>{alertKinds[alert.kind]}</button> · {date(alert.created_at)} · {alert.ticket_id.slice(0, 8)}</li>)}</ul><small>Se muestran los 20 avisos más recientes. Marcarlos no responde ni cierra tickets, y no afecta a otros administradores.</small></aside>}</>}
    <form className={styles.controls} onSubmit={applyFilters}><label>Buscar<input name="q" type="search" maxLength={120} placeholder="Asunto, nombre, correo o ID" /></label><label>Estado<select name="status"><option value="">Todos</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Atención<select name="unanswered"><option value="">Todos</option><option value="1">Sin responder</option></select></label><label>Categoría<select name="category"><option value="">Todas</option>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Tipo de cuenta<select name="role"><option value="">Clientes y abogados</option><option value="person">Cliente</option><option value="lawyer">Abogado</option></select></label><label>Prioridad<select name="priority"><option value="">Todas</option>{Object.entries(priorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Responsable<select name="assignment"><option value="">Todos</option><option value="mine">Asignados a mí</option><option value="unassigned">Sin asignar</option>{data?.administrators.map((admin) => <option key={admin.github_id} value={admin.github_id}>@{admin.github_login}</option>)}</select></label><button className="portal-primary-button">Aplicar filtros</button></form>
    <div className={styles.workspace}><div className={styles.stack}><div className={styles.list}>{!data ? <p>Cargando tickets…</p> : data.tickets.length === 0 ? <p className={styles.empty}>No hay tickets con estos filtros.</p> : data.tickets.map((ticket) => <button type="button" key={ticket.id} className={styles.listButton} aria-pressed={thread?.ticket.id === ticket.id} onClick={() => void openTicket(ticket.id).catch(handleError)}><strong>{ticket.subject}</strong><span className={styles.head}><span className={styles.tag}>{statuses[ticket.status]}</span><span className={`${styles.tag} ${["high", "urgent"].includes(ticket.priority) ? styles.urgent : ""}`}>{priorities[ticket.priority]}</span></span><small>{ticket.full_name} · {ticket.role === "lawyer" ? "Abogado" : "Cliente"}</small><small>{ticket.assigned_login ? `@${ticket.assigned_login}` : "Sin responsable"} · {categories[ticket.category]}</small>{Boolean(ticket.needs_reply) && <small>Sin respuesta hace {duration(((loadedAt ?? timestamp(ticket.created_at)) - timestamp(ticket.pending_since || ticket.created_at)) / 1000)}</small>}</button>)}</div>{data?.nextCursor && <button type="button" className="portal-outline-button" onClick={() => void load(filters, data.nextCursor || undefined).catch(handleError)}>Ver más tickets</button>}</div>
      <div className={styles.conversation} aria-busy={loadingThread}>{!thread ? <p className={styles.empty}>Selecciona un ticket para consultar el historial, responder o añadir una nota interna.</p> : <><div><h3>{thread.ticket.subject}</h3><p>{thread.ticket.full_name} · {thread.ticket.email}</p><small className={styles.muted}>{thread.ticket.id} · Creado {date(thread.ticket.created_at)}</small>{thread.ticket.case_id && <p className={styles.muted}>Caso: {thread.ticket.case_title || thread.ticket.case_id}</p>}<div className={styles.metrics}><div className={styles.metric}>Primera respuesta<strong>{thread.ticket.first_response_at ? duration((timestamp(thread.ticket.first_response_at) - timestamp(thread.ticket.created_at)) / 1000) : "Pendiente"}</strong></div><div className={styles.metric}>Resolución<strong>{thread.ticket.resolved_at ? duration((timestamp(thread.ticket.resolved_at) - timestamp(thread.ticket.created_at)) / 1000) : "Pendiente"}</strong></div></div></div><button type="button" className="portal-outline-button" disabled={loadingThread || busy} onClick={() => void openTicket(thread.ticket.id).catch(handleError)}>Actualizar conversación</button>{thread.nextMessagesCursor && <button type="button" className="portal-outline-button" disabled={loadingThread} onClick={() => void openTicket(thread.ticket.id, thread.nextMessagesCursor || undefined).catch(handleError)}>Cargar mensajes anteriores</button>}<div className={styles.history} role="region" aria-label="Historial del ticket" tabIndex={0}>{thread.messages.map((message) => <article className={`${styles.message} ${message.visibility === "internal" ? styles.internal : message.author === "admin" ? styles.staff : ""}`} key={message.id}><strong>{message.author === "admin" ? message.admin_login ? `@${message.admin_login}` : "Soporte (registro anterior)" : thread.ticket.full_name}{message.visibility === "internal" ? " · Nota interna, oculta al usuario" : ""}</strong><p>{message.body}</p><small>{date(message.created_at)}</small></article>)}</div><form key={`${thread.ticket.id}:${thread.ticket.version}`} className={styles.editor} onSubmit={(event) => void updateTicket(event, thread.ticket)}><div className={styles.controls}><label>Estado<select name="status" defaultValue={thread.ticket.status}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Prioridad<select name="priority" defaultValue={thread.ticket.priority}>{Object.entries(priorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Responsable<select name="assignedGithubId" defaultValue={thread.ticket.assigned_github_id ?? ""}><option value="">Sin asignar</option>{data?.administrators.map((admin) => <option key={admin.github_id} value={admin.github_id}>@{admin.github_login}</option>)}{thread.ticket.assigned_github_id && !data?.administrators.some((admin) => admin.github_id === thread.ticket.assigned_github_id) && <option value={thread.ticket.assigned_github_id} disabled>Administrador revocado: reasignar</option>}</select></label></div><label>Visibilidad del mensaje<select name="visibility" defaultValue="public"><option value="public">Respuesta visible para el usuario</option><option value="internal">Nota interna: solo administradores</option></select></label><label>Mensaje (opcional si solo cambias la gestión)<textarea name="message" minLength={10} maxLength={4000} rows={4} placeholder="No incluyas contraseñas ni documentos de identidad" /></label><small>Las notas internas no generan aviso al usuario ni cuentan como primera respuesta. Cambiar el estado sí puede generar un aviso interno visible para él.</small><button className="portal-primary-button" disabled={busy || loadingThread}>{busy ? "Guardando…" : "Guardar ticket"}</button></form></>}</div>
    </div>
  </section>;
}

export function AdminSupport() {
  const [recoveries, setRecoveries] = useState<Recovery[]>([]);
  const [notice, setNotice] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch("/api/admin/recovery");
    if (!response.ok) throw new Error("No pudimos cargar las solicitudes de recuperación.");
    const data = await response.json() as { requests: Recovery[] }; setRecoveries(data.requests);
  }
  // Existing recovery controls are kept separate from ticket operations.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((error) => setNotice(error instanceof Error ? error.message : "Error al cargar.")); }, []);
  async function processRecovery(event: FormEvent<HTMLFormElement> | null, id: string, action: "issue" | "cancel") {
    event?.preventDefault(); const form = event ? new FormData(event.currentTarget) : null; setBusy(true); setNotice(""); setCode("");
    try { const response = await fetch("/api/admin/recovery", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, verificationNote: form?.get("verificationNote"), verifiedIdentity: form?.get("verifiedIdentity") === "on" }) }); const data = await response.json() as { error?: string; oneTimeCode?: string }; if (!response.ok) throw new Error(data.error || "Error al procesar."); if (data.oneTimeCode) setCode(data.oneTimeCode); setNotice(action === "issue" ? "Código emitido; compártelo por un canal previamente verificado, nunca dentro de un ticket." : "Solicitud cancelada."); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Error al procesar."); } finally { setBusy(false); }
  }
  return <div className={`${styles.adminScope} settings-stack`}><AdminTicketDesk /><section className="portal-panel admin-panel" id="recuperacion"><div className="panel-title"><div><p className="eyebrow">Acceso seguro</p><h2>Recuperación de contraseña</h2></div></div>{notice && <p role="status" className="save-confirmation">{notice}</p>}<p>Solo emite un código tras verificar identidad por un canal independiente. No incluyas documentos, contraseñas ni datos sensibles en la nota. El código dura 30 minutos.</p>{code && <p className="recovery-code">Código de un solo uso: <code>{code}</code><br />Cópialo ahora; no se mostrará de nuevo.</p>}{recoveries.filter((item) => item.status === "pending").map((item) => <form className="ticket-card" key={item.id} onSubmit={(event) => void processRecovery(event, item.id, "issue")}><h3>{item.full_name} · {item.email}</h3><p>{item.role} · Solicitado {item.created_at}</p><label>Cómo verificaste la identidad<input name="verificationNote" minLength={20} maxLength={500} required placeholder="Ej.: videollamada al contacto conocido y cotejo verbal" /></label><label className="settings-toggle"><input type="checkbox" name="verifiedIdentity" required />Verifiqué la identidad fuera del sitio</label><button className="portal-primary-button" disabled={busy}>Emitir código</button><button type="button" className="portal-outline-button" disabled={busy} onClick={() => void processRecovery(null, item.id, "cancel")}>Cancelar solicitud</button></form>)}{!recoveries.some((item) => item.status === "pending") && <p>Sin solicitudes pendientes.</p>}</section></div>;
}
