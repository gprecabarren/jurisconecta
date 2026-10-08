"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Copy, RefreshCw, ShieldCheck } from "lucide-react";

type Administrator = { github_id: number; github_login: string; email: string | null; role: "owner" | "admin"; status: string; created_at: string; accepted_at: string | null };
type Invitation = { id: string; github_login: string; email: string; status: string; expires_at: number; invited_by: string };
type Data = { administrators: Administrator[]; invitations: Invitation[]; canManage: boolean; now: number };
const date = (value: number | string) => new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(typeof value === "number" ? value : `${value}Z`));

export function AdminAdministrators() {
  const [data, setData] = useState<Data | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [error, setError] = useState("");
  const [login, setLogin] = useState(""), [email, setEmail] = useState(""), [confirm, setConfirm] = useState(false), [link, setLink] = useState("");
  async function load() {
    const response = await fetch("/api/admin/administrators");
    if (!response.ok) throw new Error("No pudimos cargar los administradores. Revisa tu sesión.");
    setData(await response.json() as Data);
  }
  // Async response only, with errors surfaced and an explicit retry control.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : "Error de conexión.")); }, []);
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); setLink("");
    try {
      const response = await fetch("/api/admin/administrators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ githubLogin: login, email, confirmAccess: confirm }) });
      const result = await response.json() as { error?: string; invitationUrl: string };
      if (!response.ok) throw new Error(result.error || "No pudimos crear la invitación.");
      setLink(result.invitationUrl); setLogin(""); setEmail(""); setConfirm(false);
      setNotice("Invitación creada. Copia y comparte el enlace por un canal privado; no se envió un correo automático. Caduca en 72 horas."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Error de conexión."); } finally { setBusy(false); }
  }
  async function revoke(body: object, label: string) {
    if (!window.confirm(`¿Revocar ${label}? Se bloqueará su acceso inmediatamente. Podrás crear una nueva invitación después.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/administrators", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "No pudimos revocar el acceso.");
      setLink(""); setNotice("Acceso revocado y registrado en la bitácora."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Error de conexión."); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setNotice("Enlace copiado. Compártelo solo con la persona invitada."); }
    catch { setNotice("Selecciona y copia el enlace del campo de abajo."); }
  }
  return <section className="portal-panel admin-panel admin-access-panel" id="administradores">
    <div className="panel-title"><div><p className="eyebrow">Acceso y permisos</p><h2><ShieldCheck size={23} aria-hidden="true" /> Administradores GitHub</h2></div><button className="portal-outline-button" disabled={busy} onClick={() => { setError(""); void load().catch((err) => setError(err instanceof Error ? err.message : "Error de conexión.")); }}><RefreshCw size={16} /> Actualizar</button></div>
    <p>El acceso administrativo permite revisar cuentas y casos, responder tickets y editar el sitio. Solo el propietario puede invitar o revocar administradores. Fechas en hora de Chile.</p>
    {error && <p className="form-message" role="alert">{error}</p>}{notice && <p className="form-message" role="status">{notice}</p>}
    {!data && !error && <p role="status">Cargando administradores…</p>}
    <div className="admin-access-list">{data?.administrators.map((item) => <article key={item.github_id} className="admin-access-row"><div><h3>@{item.github_login}</h3><p>{item.email || "Correo no requerido para el propietario existente"}</p><small>{item.role === "owner" ? "Propietario protegido" : "Administrador"} · {item.status === "active" ? "Activo" : "Revocado"} · Desde {date(item.created_at)}</small></div>{data.canManage && item.role !== "owner" && item.status === "active" && <button className="portal-outline-button" disabled={busy} onClick={() => void revoke({ action: "revoke_admin", githubId: item.github_id }, `el acceso de @${item.github_login}`)}>Revocar acceso</button>}</article>)}</div>
    {data?.canManage && <form className="manager-form admin-invite-form" onSubmit={create}><h3>Invitar un administrador</h3><p>Ambos datos son obligatorios: comprobamos el ID permanente de GitHub y que el correo esté verificado en esa misma cuenta. El invitado debe autorizar la lectura del correo y aceptar el acceso.</p><div className="form-grid two"><label className="field">Usuario de GitHub<input required maxLength={39} value={login} onChange={(event) => setLogin(event.target.value)} placeholder="usuario-github" autoCapitalize="none" autoCorrect="off" disabled={busy} /></label><label className="field">Correo verificado en GitHub<input required type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="administrador@correo.cl" autoCapitalize="none" disabled={busy} /></label></div><label className="terms-checkbox"><input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} required disabled={busy} />Confirmo que esta persona debe acceder a los datos y funciones administrativas de JurisConecta.</label><button className="portal-primary-button" disabled={busy || !confirm}>{busy ? "Procesando…" : "Crear invitación segura"}</button></form>}
    {link && <div className="admin-invite-result"><label className="field">Enlace privado (se muestra una sola vez)<input value={link} readOnly onFocus={(event) => event.target.select()} /></label><button className="portal-outline-button" onClick={() => void copy()}><Copy size={16} /> Copiar enlace</button><p>No compartas este enlace públicamente. Si lo pierdes, revoca la invitación y crea otra.</p></div>}
    {!!data?.invitations.length && <div className="admin-invitation-list"><h3>Invitaciones recientes</h3>{data.invitations.map((item) => { const pending = item.status === "pending" && item.expires_at > data.now; return <article className="admin-access-row" key={item.id}><div><h4>@{item.github_login}</h4><p>{item.email}</p><small>{pending ? "Pendiente de aceptación" : item.status === "accepted" ? "Aceptada" : item.status === "revoked" ? "Revocada" : "Vencida"} · Vence {date(item.expires_at)} · Invitó @{item.invited_by}</small></div>{data.canManage && pending && <button className="portal-outline-button" disabled={busy} onClick={() => void revoke({ action: "revoke_invitation", id: item.id }, `la invitación de @${item.github_login}`)}>Revocar invitación</button>}</article>; })}</div>}
  </section>;
}
