"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
type Ticket = { id: string; subject: string; category: string; status: string; case_id: string | null; created_at: string; updated_at: string };
type Message = { id: string; ticket_id: string; author: string; body: string; created_at: string };
const statuses: Record<string, string> = { open: "Abierto", waiting_user: "Esperando tu respuesta", resolved: "Resuelto", closed: "Cerrado" };
export function TicketCenter() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  async function load() {
    const response = await fetch("/api/tickets");
    if (response.status === 401) { setSignedIn(false); return; }
    if (!response.ok) throw new Error("No pudimos cargar tus tickets.");
    const data = await response.json() as { tickets: Ticket[]; messages: Message[] };
    setSignedIn(true); setTickets(data.tickets); setMessages(data.messages);
  }
  // Async loading updates state only after the network response resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((error) => setNotice(error instanceof Error ? error.message : "Error de conexión.")); }, []);
  async function send(event: FormEvent<HTMLFormElement>, ticketId?: string) {
    event.preventDefault(); setSending(true); setNotice("");
    const form = new FormData(event.currentTarget);
    const body = ticketId ? { ticketId, message: form.get("message") } : { subject: form.get("subject"), category: form.get("category"), caseId: form.get("caseId"), message: form.get("message") };
    try {
      const response = await fetch("/api/tickets", { method: ticketId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "No pudimos enviar tu mensaje.");
      event.currentTarget.reset(); setNotice(ticketId ? "Respuesta enviada." : "Ticket creado. Puedes seguirlo aquí."); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Error al enviar."); } finally { setSending(false); }
  }
  return <section className="support-ticket-zone" id="mis-tickets"><div className="section-heading"><p className="eyebrow">Soporte personalizado</p><h2>Tickets de ayuda</h2><p>Para problemas de acceso, casos, privacidad o funcionamiento. No compartas contraseñas, documentos de identidad ni datos sensibles en el ticket.</p></div>{notice && <p role="status" className="save-confirmation">{notice}</p>}{signedIn === null ? <p>Cargando soporte...</p> : !signedIn ? <div className="portal-panel account-form"><h3>Inicia sesión para escribirnos</h3><p>Los tickets quedan vinculados a tu cuenta y puedes ver todas las respuestas.</p><Link className="portal-primary-button" href="/ingresar?returnTo=/soporte/">Iniciar sesión</Link></div> : <div className="ticket-layout"><form className="portal-panel account-form" onSubmit={(event) => void send(event)}><h3>Crear ticket</h3><label>Asunto<input name="subject" minLength={8} maxLength={120} required placeholder="Describe el problema en una frase" /></label><label>Categoría<select name="category" required><option value="account">Cuenta y acceso</option><option value="case">Mi caso</option><option value="technical">Problema técnico</option><option value="privacy">Privacidad</option><option value="other">Otro</option></select></label><label>ID de caso (opcional)<input name="caseId" maxLength={80} placeholder="Solo si está relacionado con un caso tuyo" /></label><label>Descripción<textarea name="message" minLength={30} maxLength={4000} rows={5} required placeholder="Cuéntanos qué ocurrió, qué esperabas y cómo reproducirlo" /></label><button className="portal-primary-button" disabled={sending}>{sending ? "Enviando..." : "Enviar ticket"}</button><small>Hasta cinco tickets nuevos por día; puedes responder los existentes.</small></form><div className="ticket-list"><h3>Mis tickets</h3>{tickets.length === 0 && <p>Aún no tienes tickets.</p>}{tickets.map((ticket) => <article className="portal-panel ticket-card" key={ticket.id}><div className="ticket-card-head"><div><small>{ticket.category} · {new Date(ticket.created_at).toLocaleDateString("es-CL")}</small><h4>{ticket.subject}</h4></div><span className="state-chip">{statuses[ticket.status] || ticket.status}</span></div><div className="ticket-thread">{messages.filter((message) => message.ticket_id === ticket.id).map((message) => <div className={message.author === "admin" ? "ticket-message staff" : "ticket-message"} key={message.id}><b>{message.author === "admin" ? "Soporte JurisConecta" : "Tú"}</b><p>{message.body}</p><small>{new Date(message.created_at).toLocaleString("es-CL")}</small></div>)}</div>{ticket.status !== "closed" && <form onSubmit={(event) => void send(event, ticket.id)}><label>Responder<textarea name="message" minLength={10} maxLength={4000} required rows={2} /></label><button className="portal-outline-button" disabled={sending}>Enviar respuesta</button></form>}</article>)}</div></div>}</section>;
}
