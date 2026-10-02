"use client";
import { useEffect, useState } from "react";
type Session = { id: string; device: string; location: string; ip_hint: string | null; created_at: string; last_seen_at: string };
export function SessionManager({ admin = false }: { admin?: boolean }) {
  const endpoint = admin ? "/api/admin/sessions" : "/api/auth/sessions";
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentId, setCurrentId] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error("No pudimos cargar las sesiones.");
    const data = await response.json() as { sessions: Session[]; currentSessionId: string };
    setSessions(data.sessions); setCurrentId(data.currentSessionId);
  }
  // Async loading updates state only after the network response resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load().catch((error) => setNotice(error instanceof Error ? error.message : "Error de conexión.")); }, [endpoint]);
  async function revoke(id: string) {
    if (id === currentId && !window.confirm("Cerrar esta sesión te enviará a la página de inicio. ¿Continuar?")) return;
    setBusy(true); setNotice("");
    try { const response = await fetch(endpoint, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || "No pudimos cerrar esa sesión."); if (id === currentId) { window.location.assign(admin ? "/" : "/ingresar"); return; } setNotice("Sesión cerrada. Ese dispositivo deberá iniciar sesión nuevamente."); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Error al cerrar la sesión."); } finally { setBusy(false); }
  }
  return <section className="portal-panel account-form" id="sesiones"><p className="eyebrow">Seguridad</p><h2>Dispositivos con sesión iniciada</h2><p>Ubicación aproximada y navegador indicados por la conexión; puede ser imprecisa si usas VPN. Puedes cerrar cada sesión por separado.</p>{notice && <p role="status" className="save-confirmation">{notice}</p>}{sessions.length === 0 && <p>No hay sesiones activas o aún se están cargando.</p>}<div className="session-grid">{sessions.map((session) => <article className="session-card" key={session.id}><span className="session-icon" aria-hidden>▣</span><div><h3>{session.device} {session.id === currentId && <span className="state-chip active">Este dispositivo</span>}</h3><p>{session.location}{session.ip_hint ? ` · IP ${session.ip_hint}` : ""}</p><small>Inicio: {new Date(session.created_at + "Z").toLocaleString("es-CL")} · Última actividad: {new Date(session.last_seen_at + "Z").toLocaleString("es-CL")}</small></div><button className="portal-outline-button" disabled={busy} onClick={() => void revoke(session.id)}>Cerrar sesión</button></article>)}</div></section>;
}
