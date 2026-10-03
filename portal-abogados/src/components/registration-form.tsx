"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, CircleUserRound, Scale } from "lucide-react";
import { FormEvent, useState } from "react";
import { chileRegions } from "../../shared/chile";

type Role = "person" | "lawyer";

export function RegistrationForm({ preview = false, previewRole, onPreviewContinue }: { preview?: boolean; previewRole?: Role; onPreviewContinue?: (role: Role, issues: string[]) => void }) {
  const searchParams = useSearchParams();
  const initialRole = previewRole || (searchParams.get("tipo") === "abogado" ? "lawyer" : "person");
  const [role, setRole] = useState<Role>(initialRole);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (preview) {
      const fields = Array.from(formElement.elements) as unknown as Array<HTMLInputElement | HTMLSelectElement>;
      const invalid = fields.filter((field) => typeof field.checkValidity === "function" && !field.checkValidity());
      const issues = invalid.map((field) => field.labels?.[0]?.textContent?.trim() || field.name);
      setMessage(invalid.length
        ? `Vista previa: ${issues.join(", ")} ${invalid.length === 1 ? "necesita" : "necesitan"} corrección. Puedes seguir; no se creó ninguna cuenta.`
        : "Vista previa: los campos están correctos. No se creó ninguna cuenta.");
      onPreviewContinue?.(role, issues);
      return;
    }
    setLoading(true);
    setMessage("");
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: form.get("fullName"), email: form.get("email"), password: form.get("password"), phone: form.get("phone"), region: form.get("region"), commune: form.get("commune"), role }) });
      const result = await response.json() as { error?: string; destination?: string };
      if (!response.ok || !result.destination) throw new Error(result.error || "No pudimos crear tu cuenta.");
      window.location.assign(result.destination);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos crear tu cuenta.");
      setLoading(false);
    }
  }

  return <main className={preview ? "auth-page preview-auth-page" : "auth-page"}>
    <Link className="auth-brand" href="/"><span><Scale size={20} /></span>JurisConecta</Link>
    <section className="auth-card">
      <p className="eyebrow">Crear una cuenta</p><h1>Comienza de la forma que te sirva.</h1>
      <p className="auth-intro">Las cuentas profesionales quedan pendientes de revisión antes de recibir oportunidades.</p>
      <div className="role-picker"><button className={role === "person" ? "role-option selected" : "role-option"} onClick={() => setRole("person")} type="button"><CircleUserRound size={22} /><span><strong>Busco un abogado</strong><small>Publicaré y revisaré mis casos</small></span></button><button className={role === "lawyer" ? "role-option selected" : "role-option"} onClick={() => setRole("lawyer")} type="button"><BriefcaseBusiness size={22} /><span><strong>Soy abogado/a</strong><small>Crearé mi perfil profesional</small></span></button></div>
      <form className="auth-form" onSubmit={register} noValidate={preview}>
        <label>Nombre completo<input required name="fullName" autoComplete="name" placeholder="Tu nombre y apellido" /></label>
        <label>Correo electrónico<input required type="email" name="email" autoComplete="email" placeholder="nombre@correo.cl" /></label>
        <label>Teléfono<input name="phone" type="tel" autoComplete="tel" placeholder="+56 9 1234 5678" /></label>
        <div className="form-grid two"><label>Región<select name="region" defaultValue=""><option value="">Selecciona una región</option>{chileRegions.map((region) => <option key={region}>{region}</option>)}</select></label><label>Comuna<input name="commune" placeholder="Tu comuna" /></label></div>
        <label>Contraseña<input required type="password" minLength={8} name="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" /></label>
        <button className="primary-button" disabled={loading}>{loading ? "Creando cuenta..." : preview ? "Continuar en vista previa" : "Crear cuenta"}<ArrowRight size={18} /></button>
      </form>
      {message && <p role="status" className="form-message">{message}</p>}
      {!preview && <p className="auth-switch">¿Ya tienes una cuenta? <Link href="/ingresar">Ingresa aquí</Link></p>}
    </section>
  </main>;
}
