"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
export default function RecoveryPage() {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(event: FormEvent<HTMLFormElement>, method: "POST" | "PATCH") {
    event.preventDefault(); setBusy(true); setNotice(""); const form = new FormData(event.currentTarget);
    try { const response = await fetch("/api/auth/recovery", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) }); const result = await response.json() as { error?: string; message?: string }; if (!response.ok) throw new Error(result.error || "No pudimos completar la solicitud."); setNotice(method === "POST" ? result.message || "Solicitud recibida." : "Contraseña actualizada. Puedes iniciar sesión."); event.currentTarget.reset(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Error de conexión."); } finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">Seguridad de cuenta</p><h1>Recuperar contraseña</h1><p>Por seguridad, el equipo verificará tu identidad fuera del sitio antes de entregarte un código de un solo uso. No envíes tu cédula ni tu contraseña por correo o ticket.</p>{notice && <p role="status" className="form-message">{notice}</p>}<form className="auth-form" onSubmit={(event) => void send(event, "POST")}><h2>1. Solicita ayuda</h2><label>Correo de tu cuenta<input name="email" type="email" required /></label><button className="primary-button" disabled={busy}>Solicitar recuperación</button></form><form className="auth-form" onSubmit={(event) => void send(event, "PATCH")}><h2>2. Usa el código recibido</h2><label>Correo<input name="email" type="email" required /></label><label>Código de un solo uso<input name="token" required pattern="[A-Za-z0-9_-]{32}" /></label><label>Nueva contraseña<input name="newPassword" type="password" minLength={8} maxLength={128} required /></label><button className="primary-button" disabled={busy}>Cambiar contraseña</button></form><p><Link href="/ingresar">Volver a iniciar sesión</Link></p></section></main>;
}
