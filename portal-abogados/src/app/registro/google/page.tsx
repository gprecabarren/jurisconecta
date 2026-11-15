"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { chileRegions } from "../../../../shared/chile";
import { validLawyerPhone } from "../../../../shared/lawyer-onboarding";

type Pending = { email: string; fullName: string; role: "person" | "lawyer" };

export default function GoogleRegistrationPage() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lawyer = pending?.role === "lawyer";

  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/auth/google/registration", { signal: abort.signal }).then(async (response) => {
      const data = await response.json() as Pending & { error?: string };
      if (!response.ok) throw new Error(data.error || "No pudimos cargar tu registro.");
      setPending(data);
    }).catch((error) => {
      if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : "No pudimos cargar tu registro.");
    });
    return () => abort.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const phone = String(form.get("phone") || "");
    if (lawyer && !validLawyerPhone(phone)) {
      setMessage("Revisa el teléfono e incluye su código de país, por ejemplo +56.");
      (event.currentTarget.elements.namedItem("phone") as HTMLInputElement | null)?.focus();
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/google/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: form.get("fullName"), phone, region: form.get("region"), commune: form.get("commune"), acceptTerms: form.get("acceptTerms") === "on" }),
      });
      const data = await response.json() as { error?: string; destination?: string };
      if (!response.ok || !data.destination) throw new Error(data.error || "No pudimos completar el registro.");
      window.location.assign(data.destination);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error de conexión.");
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <section className="auth-card">
      <p className="eyebrow">Correo verificado con Google</p>
      <h1>Completa tu cuenta {lawyer ? "profesional" : "de cliente"}.</h1>
      {pending && <>
        <p>Correo verificado: {pending.email}. {lawyer && "Tu perfil seguirá pendiente hasta que revisemos tu postulación."}</p>
        <form className="auth-form" onSubmit={submit}>
          <label>Nombre completo<input name="fullName" defaultValue={pending.fullName} required minLength={3} maxLength={120} autoComplete="name" /></label>
          <label>{lawyer ? "Teléfono con código de país" : "Teléfono (opcional)"}<input name="phone" type="tel" maxLength={30} autoComplete="tel" required={lawyer} placeholder={lawyer ? "+56 9 1234 5678" : undefined} /></label>
          {!lawyer && <div className="form-grid two">
            <label>Región<select name="region" defaultValue=""><option value="">Selecciona una región</option>{chileRegions.map((region) => <option key={region}>{region}</option>)}</select></label>
            <label>Comuna<input name="commune" maxLength={80} /></label>
          </div>}
          <label className="terms-checkbox"><input name="acceptTerms" type="checkbox" required /><span>He leído y acepto los <Link href="/terminos/" target="_blank">términos</Link> y la <Link href="/privacidad/" target="_blank">política de privacidad</Link>. Entiendo que el sitio está en fase piloto.</span></label>
          <button className="primary-button" disabled={busy}>{busy ? "Creando..." : "Completar registro"}</button>
        </form>
      </>}
      {message && <p role="alert" className="form-message">{message}</p>}
      <p className="auth-switch"><Link href="/registro/">Volver a elegir tipo de cuenta</Link></p>
    </section>
  </main>;
}
