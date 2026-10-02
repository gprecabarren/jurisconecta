"use client";
import { FormEvent, useEffect, useState } from "react";
type Ticket = { id: string; full_name: string; email: string; role: string; subject: string; category: string; status: string; created_at: string };
type Message = { id: string; ticket_id: string; author: string; body: string; created_at: string };
type Recovery = { id: string; full_name: string; email: string; role: string; status: string; created_at: string; expires_at: string | null };
export function AdminSupport() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [recoveries, setRecoveries] = useState<Recovery[]>([]);
  const [notice, setNotice] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const [a, b] = await Promise.all([fetch("/api/admin/tickets"), fetch("/api/admin/recovery")]);
    if (!a.ok || !b.ok) throw new Error("No pudimos cargar los tickets o solicitudes.");
    const ticketData = await a.json() as { tickets: Ticket[]; messages: Message[] };
    const recoveryData = await b.json() as { requests: Recovery[] };
    setTickets(ticketData.tickets); setMessages(ticketData.messages); setRecoveries(recoveryData.requests);
  }
  // Async loading updates state only after the network response resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((error) => setNotice(error instanceof Error ? error.message : "Error al cargar.")); }, []);
  async function updateTicket(event: FormEvent<HTMLFormElement>, ticketId: string) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setNotice("");
    try { const response = await fetch("/api/admin/tickets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketId, status: form.get("status"), message: form.get("message") }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || "Error al guardar."); event.currentTarget.reset(); setNotice("Ticket actualizado y aviso interno creado."); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Error al guardar."); } finally { setBusy(false); }
  }
  async function processRecovery(event: FormEvent<HTMLFormElement> | null, id: string, action: "issue" | "cancel") {
    event?.preventDefault(); const form = event ? new FormData(event.currentTarget) : null; setBusy(true); setNotice(""); setCode("");
    try { const response = await fetch("/api/admin/recovery", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, verificationNote: form?.get("verificationNote"), verifiedIdentity: form?.get("verifiedIdentity") === "on" }) }); const data = await response.json() as { error?: string; oneTimeCode?: string }; if (!response.ok) throw new Error(data.error || "Error al procesar."); if (data.oneTimeCode) setCode(data.oneTimeCode); setNotice(action === "issue" ? "Código emitido; compártelo por un canal previamente verificado, nunca dentro de un ticket." : "Solicitud cancelada."); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Error al procesar."); } finally { setBusy(false); }
  }
  return <div className="settings-stack"><section className="portal-panel admin-panel" id="tickets"><div className="panel-title"><div><p className="eyebrow">Soporte</p><h2>Tickets de usuarios</h2></div><span className="content-count">{tickets.filter((ticket) => ticket.status === "open").length} abiertos</span></div>{notice && <p role="status" className="save-confirmation">{notice}</p>}{tickets.length === 0 && <p>Sin tickets.</p>}{tickets.map((ticket) => <article className="ticket-card" key={ticket.id}><div className="ticket-card-head"><div><p className="eyebrow">{ticket.category} · {ticket.role}</p><h3>{ticket.subject}</h3><small>{ticket.full_name} · {ticket.email} · {ticket.status}</small></div></div><div className="ticket-thread">{messages.filter((message) => message.ticket_id === ticket.id).map((message) => <div className="ticket-message" key={message.id}><b>{message.author === "admin" ? "Soporte" : "Usuario"}</b><p>{message.body}</p><small>{message.created_at}</small></div>)}</div><form className="form-grid two" onSubmit={(event) => void updateTicket(event, ticket.id)}><label>Estado<select name="status" defaultValue={ticket.status}><option value="open">Abierto</option><option value="waiting_user">Esperando usuario</option><option value="resolved">Resuelto</option><option value="closed">Cerrado</option></select></label><label>Respuesta<textarea name="message" minLength={10} maxLength={4000} rows={3} placeholder="Respuesta opcional si solo cambia el estado" /></label><button className="portal-primary-button" disabled={busy}>Guardar ticket</button></form></article>)}</section>
    <section className="portal-panel admin-panel" id="recuperacion"><div className="panel-title"><div><p className="eyebrow">Acceso seguro</p><h2>Recuperación de contraseña</h2></div></div><p>Solo emite un código tras verificar identidad por un canal independiente. No incluyas documentos, contraseñas ni datos sensibles en la nota. El código dura 30 minutos.</p>{code && <p className="recovery-code">Código de un solo uso: <code>{code}</code><br />Cópialo ahora; no se mostrará de nuevo.</p>}{recoveries.filter((item) => item.status === "pending").map((item) => <form className="ticket-card" key={item.id} onSubmit={(event) => void processRecovery(event, item.id, "issue")}><h3>{item.full_name} · {item.email}</h3><p>{item.role} · Solicitado {item.created_at}</p><label>Cómo verificaste la identidad<input name="verificationNote" minLength={20} maxLength={500} required placeholder="Ej.: videollamada al contacto conocido y cotejo verbal" /></label><label className="settings-toggle"><input type="checkbox" name="verifiedIdentity" required />Verifiqué la identidad fuera del sitio</label><button className="portal-primary-button" disabled={busy}>Emitir código</button><button type="button" className="portal-outline-button" disabled={busy} onClick={() => void processRecovery(null, item.id, "cancel")}>Cancelar solicitud</button></form>)}{!recoveries.some((item) => item.status === "pending") && <p>Sin solicitudes pendientes.</p>}</section></div>;
}
