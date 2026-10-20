"use client";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import styles from "./support-operations.module.css";

type Ticket = { id: string; subject: string; category: string; status: string; case_id: string | null; created_at: string; updated_at: string; version: number };
type Message = { id: string; ticket_id: string; author: string; body: string; created_at: string };
type CaseOption = { id: string; title: string };
type ListData = { tickets: Ticket[]; nextCursor: string | null; cases: CaseOption[]; nextCasesCursor: string | null };
type ThreadData = { ticket: Ticket; messages: Message[]; nextMessagesCursor: string | null };
const statuses: Record<string, string> = { open: "Abierto", waiting_user: "Esperando tu respuesta", resolved: "Resuelto", closed: "Cerrado" };
const categories: Record<string, string> = { account: "Cuenta y acceso", case: "Mi caso", technical: "Problema técnico", privacy: "Privacidad", other: "Otro" };
function date(value: string) { return new Date(value.includes("T") ? value : `${value}Z`).toLocaleString("es-CL"); }

export function TicketCenter() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [nextCasesCursor, setNextCasesCursor] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const requestSequence = useRef(0), busy = useRef(false);
  const retries = useRef(new Map<string, { signature: string; key: string }>());
  async function load(cursor?: string, casesCursor?: string) {
    const params = new URLSearchParams(); if (cursor) params.set("cursor", cursor); if (casesCursor) params.set("casesCursor", casesCursor);
    const response = await fetch(`/api/tickets?${params}`, { cache: "no-store" });
    if (response.status === 401) { setSignedIn(false); setThread(null); setTickets([]); return; }
    if (!response.ok) throw new Error("No pudimos cargar tus tickets.");
    const data = await response.json() as ListData;
    setSignedIn(true);
    if (!casesCursor) { setTickets((current) => cursor ? [...new Map([...current, ...data.tickets].map((ticket) => [ticket.id, ticket])).values()] : data.tickets); setNextCursor(data.nextCursor); }
    if (!cursor) { setCases((current) => casesCursor ? [...new Map([...current, ...data.cases].map((item) => [item.id, item])).values()] : data.cases); setNextCasesCursor(data.nextCasesCursor); }
  }
  async function openTicket(id: string, before?: string) {
    const sequence = ++requestSequence.current; setLoadingThread(true);
    try {
      const params = new URLSearchParams({ ticketId: id }); if (before) params.set("before", before);
      const response = await fetch(`/api/tickets?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("No pudimos cargar la conversación. Vuelve a iniciar sesión si expiró.");
      const data = await response.json() as ThreadData;
      if (requestSequence.current !== sequence) return;
      setThread((current) => before && current?.ticket.id === id ? { ...data, messages: [...data.messages, ...current.messages] } : data);
    } finally { if (requestSequence.current === sequence) setLoadingThread(false); }
  }
  // Loading state is set only when the asynchronous request resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((error) => setNotice(error instanceof Error ? error.message : "Error de conexión.")); return () => { requestSequence.current += 1; }; }, []);
  async function send(event: FormEvent<HTMLFormElement>, ticket?: Ticket) {
    event.preventDefault(); if (busy.current) return;
    const element = event.currentTarget, form = new FormData(element);
    const body = ticket ? { ticketId: ticket.id, expectedVersion: ticket.version, action: ticket.status === "closed" || ticket.status === "resolved" ? "reopen" : "reply", message: form.get("message") } : { subject: form.get("subject"), category: form.get("category"), caseId: form.get("caseId"), message: form.get("message") };
    const slot = ticket?.id || "create", signature = JSON.stringify(body), previous = retries.current.get(slot);
    const key = previous?.signature === signature ? previous.key : crypto.randomUUID(); retries.current.set(slot, { signature, key });
    busy.current = true; setSending(true); setNotice("");
    try {
      const response = await fetch("/api/tickets", { method: ticket ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, requestId: key }) });
      const result = await response.json() as { error?: string; id?: string };
      if (!response.ok) throw new Error(result.error || "No pudimos enviar tu mensaje.");
      element.reset(); retries.current.delete(slot); setNotice(ticket ? "Respuesta guardada correctamente." : "Ticket creado. Puedes seguirlo aquí.");
      try { await Promise.all([load(), openTicket(ticket?.id || result.id || "")]); }
      catch { setNotice("Tu mensaje quedó guardado. No pudimos actualizar la vista; usa Actualizar para revisarlo sin reenviarlo."); }
    } catch (error) { setNotice(error instanceof Error ? error.message : "No pudimos confirmar el envío. Puedes reintentar sin duplicarlo."); }
    finally { busy.current = false; setSending(false); }
  }
  function handleError(error: unknown) { setNotice(error instanceof Error ? error.message : "Error de conexión."); }
  return <section className={`${styles.publicScope} support-ticket-zone`} id="mis-tickets">
    <div className="section-heading"><p className="eyebrow">Soporte personalizado</p><h2>Tickets de ayuda</h2><p>Consulta problemas de acceso, casos, privacidad o funcionamiento. No compartas contraseñas, documentos de identidad ni datos sensibles. Los avisos y respuestas se revisan aquí: no se envían correos automáticos.</p></div>
    {notice && <p role="status" aria-live="polite" className="save-confirmation">{notice}</p>}
    {signedIn === null ? <p>Cargando soporte…</p> : !signedIn ? <div className="portal-panel account-form"><h3>Inicia sesión para escribirnos</h3><p>Los tickets quedan vinculados a tu cuenta y puedes ver todas las respuestas.</p><Link className="portal-primary-button" href="/ingresar?returnTo=/soporte/">Iniciar sesión</Link></div> : <div className={styles.stack}>
      <details className="portal-panel"><summary>Crear un nuevo ticket</summary><form className={`${styles.editor} account-form`} onSubmit={(event) => void send(event)}><h3>¿En qué podemos ayudarte?</h3><label>Asunto<input name="subject" minLength={8} maxLength={120} required placeholder="Describe el problema en una frase" /></label><label>Categoría<select name="category" required>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Caso relacionado (opcional)<select name="caseId"><option value="">Sin caso relacionado</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>{nextCasesCursor && <button type="button" className="portal-outline-button" onClick={() => void load(undefined, nextCasesCursor).catch(handleError)}>Cargar más casos disponibles</button>}<small>Solo aparecen tus casos como cliente o los que atiendes con una propuesta aceptada como abogado aprobado.</small><label>Descripción<textarea name="message" minLength={30} maxLength={4000} rows={5} required placeholder="Cuéntanos qué ocurrió, qué esperabas y cómo reproducirlo" /></label><button className="portal-primary-button" disabled={sending}>{sending ? "Enviando…" : "Enviar ticket"}</button><small>Máximo cinco tickets nuevos en 24 horas y 30 respuestas por hora.</small></form></details>
      <div className={styles.workspace}><div className={styles.stack}><div className={styles.head}><h3>Mis tickets</h3><button type="button" className="portal-outline-button" disabled={sending} onClick={() => void load().catch(handleError)}>Actualizar</button></div><div className={styles.list}>{tickets.length === 0 && <p className={styles.empty}>Aún no tienes tickets.</p>}{tickets.map((ticket) => <button type="button" className={styles.listButton} key={ticket.id} aria-pressed={thread?.ticket.id === ticket.id} onClick={() => void openTicket(ticket.id).catch(handleError)}><strong>{ticket.subject}</strong><span className={styles.tag}>{statuses[ticket.status]}</span><small>{categories[ticket.category]} · {date(ticket.created_at)}</small></button>)}</div>{nextCursor && <button type="button" className="portal-outline-button" onClick={() => void load(nextCursor).catch(handleError)}>Ver más tickets</button>}</div>
        <div className="portal-panel" aria-busy={loadingThread}>{!thread ? <p className={styles.empty}>Selecciona un ticket para leer su conversación.</p> : <div className={styles.conversation}><div className={styles.head}><h3>{thread.ticket.subject}</h3><span className={styles.tag}>{statuses[thread.ticket.status]}</span></div><small className={styles.muted}>Ticket {thread.ticket.id}{thread.ticket.case_id ? ` · Caso ${thread.ticket.case_id}` : ""}</small><button type="button" className="portal-outline-button" disabled={loadingThread || sending} onClick={() => void openTicket(thread.ticket.id).catch(handleError)}>Actualizar conversación</button>{thread.nextMessagesCursor && <button type="button" className="portal-outline-button" disabled={loadingThread} onClick={() => void openTicket(thread.ticket.id, thread.nextMessagesCursor || undefined).catch(handleError)}>Cargar mensajes anteriores</button>}<div className={styles.history} role="region" aria-label="Historial de tu ticket" tabIndex={0}>{thread.messages.map((message) => <article key={message.id} className={`${styles.message} ${message.author === "admin" ? styles.staff : ""}`}><strong>{message.author === "admin" ? "Soporte JurisConecta" : "Tú"}</strong><p>{message.body}</p><small>{date(message.created_at)}</small></article>)}</div><form className={styles.editor} onSubmit={(event) => void send(event, thread.ticket)}><label>{["closed", "resolved"].includes(thread.ticket.status) ? "¿Necesitas más ayuda? Describe por qué quieres reabrirlo" : "Responder"}<textarea name="message" minLength={10} maxLength={4000} required rows={3} /></label><button className="portal-primary-button" disabled={sending || loadingThread}>{["closed", "resolved"].includes(thread.ticket.status) ? "Reabrir y enviar mensaje" : "Enviar respuesta"}</button></form></div>}</div>
      </div>
    </div>}
  </section>;
}
