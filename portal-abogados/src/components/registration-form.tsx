"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, CircleUserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { chileRegions } from "../../shared/chile";
import { validLawyerPhone } from "../../shared/lawyer-onboarding";
import { GoogleAccess } from "./google-access";
import { BrandLogo } from "./brand-logo";

type Role = "person" | "lawyer";
export type RegistrationIdentity = { fullName: string; email: string; phone: string; region: string; commune: string };

export function RegistrationForm({ preview = false, previewRole, onPreviewContinue }: { preview?: boolean; previewRole?: Role; onPreviewContinue?: (role: Role, issues: string[], identity?: RegistrationIdentity) => void }) {
  const searchParams = useSearchParams();
  const initialRole = previewRole || (searchParams.get("tipo") === "abogado" ? "lawyer" : "person");
  const [role, setRole] = useState<Role>(initialRole);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const lawyer = role === "lawyer";
  const Wrapper = preview ? "div" : "main";

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const identity: RegistrationIdentity = {
      fullName: String(form.get("fullName") || "").trim(),
      email: String(form.get("email") || "").trim(),
      phone: String(form.get("phone") || "").trim(),
      region: String(form.get("region") || ""),
      commune: String(form.get("commune") || "").trim(),
    };
    const password = String(form.get("password") || "");
    const passwordConfirmation = String(form.get("passwordConfirmation") || "");
    const acceptTerms = form.get("acceptTerms") === "on";
    const mismatch = lawyer && password !== passwordConfirmation;
    const invalidPhone = lawyer && !validLawyerPhone(identity.phone);
    if (preview) {
      const fields = Array.from<unknown>(formElement.elements).filter((field) => field instanceof HTMLInputElement || field instanceof HTMLSelectElement);
      const issues = new Set(fields.filter((field) => !field.validity.valid).map((field) => field.labels?.[0]?.textContent?.trim() || field.name));
      if (mismatch) issues.add("Las contraseñas deben coincidir");
      if (identity.phone && invalidPhone) issues.add("Teléfono con código de país");
      setMessage(issues.size
        ? `Puedes seguir en la vista previa. Revisa estos campos: ${[...issues].join(", ")}.`
        : "Los campos están correctos. Puedes seguir con la demostración.");
      onPreviewContinue?.(role, [...issues], identity);
      return;
    }
    if (loading) return;
    if (mismatch || invalidPhone) {
      setMessage(mismatch ? "Las contraseñas deben coincidir." : "Revisa el teléfono e incluye su código de país, por ejemplo +56.");
      (formElement.elements.namedItem(mismatch ? "passwordConfirmation" : "phone") as HTMLInputElement | null)?.focus();
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...identity, password, role, ...(lawyer ? { passwordConfirmation, acceptTerms } : {}) }),
      });
      const result = await response.json() as { error?: string; destination?: string };
      if (!response.ok || !result.destination) throw new Error(result.error || "No pudimos crear tu cuenta.");
      window.location.assign(role === "person" && searchParams.get("next") === "/solicitar/" ? "/solicitar/" : result.destination);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos crear tu cuenta.");
      setLoading(false);
    }
  }

  return <Wrapper className={preview ? "auth-page preview-auth-page" : "auth-page"}>
    {preview ? <div className="auth-brand"><BrandLogo decorative /></div> : <Link className="auth-brand" href="/" aria-label="JurisConecta inicio"><BrandLogo decorative /></Link>}
    <section className="auth-card">
      <p className="eyebrow">Crear una cuenta</p>
      <h1>{lawyer ? "Regístrate como abogado/a" : "Comienza de la forma que te sirva."}</h1>
      <p className="auth-intro">{lawyer ? "Crea tu acceso para completar el perfil profesional y enviarlo a revisión." : "Cada correo tiene un solo tipo de cuenta: cliente o abogado. Solo administración puede cambiarlo. Las cuentas profesionales quedan pendientes de revisión antes de recibir oportunidades."}</p>
      {(!preview || !previewRole) && <div className="role-picker">
        <button className={!lawyer ? "role-option selected" : "role-option"} onClick={() => { setRole("person"); setMessage(""); }} disabled={loading} type="button" aria-pressed={!lawyer}><CircleUserRound size={22} /><span><strong>Busco un abogado</strong><small>Publicaré y revisaré mis casos</small></span></button>
        <button className={lawyer ? "role-option selected" : "role-option"} onClick={() => { setRole("lawyer"); setMessage(""); }} disabled={loading} type="button" aria-pressed={lawyer}><BriefcaseBusiness size={22} /><span><strong>Soy abogado/a</strong><small>Crearé mi perfil profesional</small></span></button>
      </div>}
      {lawyer && <button className="google-button" type="button" disabled>Continuar con LinkedIn (próximamente)</button>}
      <GoogleAccess intent="register" role={role} preview={preview} />
      <form className="auth-form" onSubmit={register} noValidate={preview}>
        <label>Nombre completo<input required minLength={lawyer ? 3 : undefined} maxLength={lawyer ? 120 : undefined} name="fullName" autoComplete="name" placeholder="Tu nombre y apellido" /></label>
        <label>Correo electrónico<input required type="email" maxLength={lawyer ? 180 : undefined} name="email" autoComplete="email" placeholder="nombre@correo.cl" /></label>
        <label>{lawyer ? "Teléfono con código de país" : "Teléfono"}<input name="phone" type="tel" required={lawyer} maxLength={lawyer ? 30 : undefined} autoComplete="tel" placeholder="+56 9 1234 5678" /></label>
        {!lawyer && <div className="form-grid two"><label>Región<select name="region" defaultValue=""><option value="">Selecciona una región</option>{chileRegions.map((region) => <option key={region}>{region}</option>)}</select></label><label>Comuna<input name="commune" placeholder="Tu comuna" /></label></div>}
        <label>Contraseña<input required type="password" minLength={8} maxLength={lawyer ? 128 : undefined} name="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" /></label>
        {lawyer && <>
          <label>Repite la contraseña<input required type="password" minLength={8} maxLength={128} name="passwordConfirmation" autoComplete="new-password" /></label>
          <label className="terms-checkbox"><input name="acceptTerms" type="checkbox" required /><span>
            {preview ? "He leído y acepto los términos de uso y la política de privacidad." : <>He leído y acepto los <Link href="/terminos/" target="_blank">términos de uso</Link> y la <Link href="/privacidad/" target="_blank">política de privacidad</Link>.</>}
          </span></label>
        </>}
        <button className="primary-button" disabled={loading}>{loading ? "Creando cuenta..." : preview ? "Continuar en vista previa" : lawyer ? "Crear cuenta profesional" : "Crear cuenta"}<ArrowRight size={18} /></button>
      </form>
      {message && <p role="status" className="form-message">{message}</p>}
      {!preview && <p className="auth-switch">¿Ya tienes una cuenta? <Link href="/ingresar">Ingresa aquí</Link></p>}
    </section>
  </Wrapper>;
}
