"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { chileRegions } from "../../../../shared/chile";
type Pending = { email: string; fullName: string; role: "person" | "lawyer" };
export default function GoogleRegistrationPage() {
  const [pending, setPending] = useState<Pending | null>(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { void fetch("/api/auth/google/registration").then(async (response) => { const data = await response.json() as Pending & { error?: string }; if (!response.ok) throw new Error(data.error); setPending(data as Pending); }).catch((error) => setMessage(error instanceof Error ? error.message : "No pudimos cargar tu registro.")); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/google/registration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: form.get("fullName"), phone: form.get("phone"), region: form.get("region"), commune: form.get("commune"), acceptTerms: form.get("acceptTerms") === "on" }) });
      const data = await response.json() as { error?: string; destination?: string };
      if (!response.ok || !data.destination) throw new Error(data.error || "No pudimos completar el registro.");
      window.location.assign(data.destination);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error de conexión."); setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">Identidad verificada con Google</p><h1>Completa tu cuenta {pending?.role === "lawyer" ? "profesional" : "de cliente"}.</h1>{pending && <><p>Correo verificado: {pending.email}. {pending.role === "lawyer" && "Tu perfil seguirá pendiente hasta que revisemos tu postulación."}</p><form className="auth-form" onSubmit={submit}><label>Nombre completo<input name="fullName" defaultValue={pending.fullName} required minLength={3} maxLength={120} autoComplete="name" /></label><label>Teléfono (opcional)<input name="phone" type="tel" maxLength={30} autoComplete="tel" /></label><div className="form-grid two"><label>Región<select name="region" defaultValue=""><option value="">Selecciona una región</option>{chileRegions.map((r) => <option key={r}>{r}</option>)}</select></label><label>Comuna<input name="commune" maxLength={80} /></label></div><label className="terms-checkbox"><input name="acceptTerms" type="checkbox" required /><span>He leído y acepto los <Link href="/terminos/" target="_blank">términos</Link> y la <Link href="/privacidad/" target="_blank">política de privacidad</Link>. Entiendo que el sitio está en fase piloto.</span></label><button className="primary-button" disabled={busy}>{busy ? "Creando..." : "Completar registro"}</button></form></>}{message && <p role="alert" className="form-message">{message}</p>}<p className="auth-switch"><Link href="/registro/">Volver a elegir tipo de cuenta</Link></p></section></main>;
}
