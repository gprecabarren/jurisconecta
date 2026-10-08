"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
type Identity = { login: string; email: string; invitedBy: string };
export default function InvitationPage() {
  const [token, setToken] = useState(""), [identity, setIdentity] = useState<Identity | null>(null), [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState(""), [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setToken(window.location.hash.slice(1));
      // Remove the private fragment from browser history once loaded in memory.
      window.history.replaceState(null, "", window.location.pathname);
    });
    void fetch("/api/invitaciones-admin").then(async (response) => { if (response.ok) { const value = await response.json() as Identity; if (active) setIdentity(value); } }).catch(() => { if (active) setError("No pudimos conectar. Recarga e intenta nuevamente."); }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  async function submit(action: "start" | "accept") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/invitaciones-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "start" ? { action, token } : { action, confirmAccess: confirmed }) });
      const result = await response.json() as { error?: string; authorizationUrl?: string; redirect?: string };
      if (!response.ok) throw new Error(result.error || "No pudimos validar la invitación.");
      if (action === "start" && result.authorizationUrl?.startsWith("https://github.com/login/oauth/authorize?")) window.location.assign(result.authorizationUrl);
      else if (action === "accept" && result.redirect === "/admin/") window.location.assign("/admin/");
    } catch (err) { setError(err instanceof Error ? err.message : "Error de conexión."); setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card admin-invitation-page"><ShieldCheck size={36} aria-hidden="true" /><p className="eyebrow">Acceso privado</p><h1>Invitación de administrador</h1>{!ready ? <p role="status">Comprobando invitación…</p> : identity ? <><p>GitHub verificó <b>@{identity.login}</b> y <b>{identity.email}</b>. Te invitó @{identity.invitedBy}.</p><p>Al aceptar podrás administrar cuentas, consultar casos y editar el contenido de JurisConecta. No se otorgan permisos en GitHub ni acceso a Cloudflare.</p><label className="terms-checkbox"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} />Acepto el acceso administrativo y me comprometo a resguardar los datos de la plataforma.</label><button className="primary-button" disabled={busy || !confirmed} onClick={() => void submit("accept")}>{busy ? "Validando…" : "Aceptar invitación"}</button></> : token ? <><p>Para continuar, inicia sesión con la cuenta de GitHub invitada. Se comprobarán su ID y el correo verificado; todavía no tendrás acceso al panel.</p><button className="primary-button" disabled={busy} onClick={() => void submit("start")}>{busy ? "Conectando…" : "Verificar mi cuenta con GitHub"}</button></> : <p>Abre el enlace privado que te compartió el propietario. Las invitaciones caducan en 72 horas y la verificación en 10 minutos.</p>}{error && <p className="form-message" role="alert">{error}</p>}<p><Link href="/">Volver a JurisConecta</Link></p></section></main>;
}
