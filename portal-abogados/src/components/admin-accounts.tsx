"use client";
import { useEffect, useState } from "react";
import { SessionManager } from "./session-manager";
type User = { id: string; full_name: string; email: string; role: string; status: string; phone: string | null; region: string | null; commune: string | null; created_at: string; case_count: number; proposal_count: number; application_status?: string };
type Detail = User & { auth_provider: string; updated_at: string; specialties_json: string | null; bio: string | null; plan_code: string | null; credit_balance: number | null; rut: string | null; university: string | null; graduation_date: string | null };
type Case = { id: string; title: string; category: string; status: string; created_at: string; description: string };
type Audit = { id: string; github_login: string; action: string; target_type: string; target_id: string | null; details_json: string; created_at: string };
export function AdminAccounts() {
  const [users, setUsers] = useState<User[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [auditOffset, setAuditOffset] = useState<number | null>(0);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function loadUsers(offset = 0) {
    const response = await fetch(`/api/admin/users?offset=${offset}`);
    if (!response.ok) throw new Error("No pudimos cargar las cuentas.");
    const data = await response.json() as { users: User[]; nextOffset: number | null };
    setUsers((current) => offset ? [...current, ...data.users] : data.users); setNextOffset(data.nextOffset);
  }
  async function loadAudit(offset = 0) {
    const response = await fetch(`/api/admin/audit?offset=${offset}`);
    if (!response.ok) throw new Error("No pudimos cargar la bitácora.");
    const data = await response.json() as { entries: Audit[]; nextOffset: number | null };
    setAudit((current) => offset ? [...current, ...data.entries] : data.entries); setAuditOffset(data.nextOffset);
  }
  async function detail(id: string) {
    const response = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error("No pudimos cargar la cuenta.");
    const data = await response.json() as { user: Detail; cases: Case[] };
    setSelected(data.user); setCases(data.cases);
  }
  // Async loading updates state only after the network response resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void Promise.all([loadUsers(), loadAudit()]).catch((error) => setNotice(error instanceof Error ? error.message : "Error de conexión.")); }, []);
  async function status(user: Detail) {
    const next = user.status === "suspended" ? "active" : "suspended";
    if (!window.confirm(`${next === "suspended" ? "Deshabilitar" : "Habilitar"} la cuenta de ${user.email}?`)) return;
    setBusy(true); setNotice("");
    try { const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: user.id, status: next }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || "No pudimos actualizar."); await Promise.all([loadUsers(), loadAudit(), detail(user.id)]); setNotice("Estado actualizado; sesiones previas cerradas."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Error al actualizar."); } finally { setBusy(false); }
  }
  async function remove(user: Detail) {
    const confirmEmail = window.prompt(`Eliminará permanentemente la cuenta, casos y datos asociados. Para confirmar escribe el correo exacto: ${user.email}`);
    if (confirmEmail !== user.email) { setNotice("El correo no coincide; no se eliminó nada."); return; }
    if (!window.confirm("Última confirmación: ¿eliminar permanentemente esta cuenta?")) return;
    setBusy(true); setNotice("");
    try { const response = await fetch("/api/admin/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: user.id, confirmEmail }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || "No pudimos eliminar."); setSelected(null); setCases([]); await Promise.all([loadUsers(), loadAudit()]); setNotice("Cuenta y datos asociados eliminados; quedó constancia sin datos personales en la bitácora."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Error al eliminar."); } finally { setBusy(false); }
  }
  const visible = users.filter((user) => `${user.full_name} ${user.email} ${user.role} ${user.status}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="settings-stack"><section className="portal-panel admin-panel" id="usuarios"><div className="panel-title"><div><p className="eyebrow">Personas y profesionales</p><h2>Directorio de cuentas</h2></div><span className="content-count">{users.length} cargadas</span></div><p>Solo se muestran datos necesarios para administrar la plataforma; las contraseñas y secretos nunca se pueden ver.</p>{notice && <p role="status" className="save-confirmation">{notice}</p>}<label className="admin-search">Buscar en cuentas cargadas<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, correo o rol" /></label><div className="user-directory">{visible.map((user) => <button className="user-directory-row" key={user.id} onClick={() => void detail(user.id).catch((error) => setNotice(error instanceof Error ? error.message : "Error al abrir."))}><span><b>{user.full_name}</b><small>{user.email}</small></span><span>{user.role === "lawyer" ? "Abogado/a" : user.role === "person" ? "Cliente" : "Administrador"}</span><span className="state-chip">{user.status}</span><small>{user.case_count} casos · {user.proposal_count} propuestas</small></button>)}</div>{nextOffset !== null && <button className="portal-outline-button" onClick={() => void loadUsers(nextOffset)}>Cargar más cuentas</button>}{selected && <article className="ticket-card user-detail"><div className="ticket-card-head"><h3>{selected.full_name}</h3><button className="portal-outline-button" onClick={() => setSelected(null)}>Cerrar detalle</button></div><div className="user-facts"><p><b>Correo:</b> {selected.email}</p><p><b>Teléfono:</b> {selected.phone || "No informado"}</p><p><b>Región/comuna:</b> {[selected.region, selected.commune].filter(Boolean).join(", ") || "No informado"}</p><p><b>Rol/estado:</b> {selected.role} / {selected.status}</p><p><b>Registro:</b> {selected.created_at}</p><p><b>Proveedor:</b> {selected.auth_provider}</p>{selected.role === "lawyer" && <><p><b>Postulación:</b> {selected.application_status}</p><p><b>RUT:</b> {selected.rut || "No informado"}</p><p><b>Universidad:</b> {selected.university || "No informada"}</p><p><b>Plan/créditos de prueba:</b> {selected.plan_code} / {selected.credit_balance}</p><p><b>Presentación:</b> {selected.bio || "Sin presentación"}</p></>}</div><h4>Casos relacionados</h4>{cases.length === 0 && <p>Sin casos relacionados.</p>}{cases.map((item) => <details className="user-case-detail" key={item.id}><summary>{item.title} · {item.status} · {item.created_at}</summary><p>{item.category}</p><p>{item.description}</p><small>ID: {item.id}</small></details>)}<div className="proposal-actions"><button className="portal-outline-button" disabled={busy} onClick={() => void status(selected)}>{selected.status === "suspended" ? "Habilitar cuenta" : "Deshabilitar cuenta"}</button><button className="portal-danger-button" disabled={busy} onClick={() => void remove(selected)}>Eliminar cuenta</button></div></article>}</section>
    <section className="portal-panel admin-panel" id="bitacora"><p className="eyebrow">Trazabilidad</p><h2>Bitácora administrativa</h2><p>Acciones registradas con usuario de GitHub y hora UTC. Los cambios anteriores a esta función no pueden reconstruirse.</p><div className="audit-list">{audit.map((entry) => <article key={entry.id}><b>{entry.action}</b><span>{entry.github_login} · {new Date(entry.created_at + "Z").toLocaleString("es-CL")}</span><small>{entry.target_type}{entry.target_id ? ` · ${entry.target_id}` : ""} · {entry.details_json}</small></article>)}</div>{auditOffset !== null && <button className="portal-outline-button" onClick={() => void loadAudit(auditOffset)}>Cargar más movimientos</button>}</section>
    <SessionManager admin />
  </div>;
}
