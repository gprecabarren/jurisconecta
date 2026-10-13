"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PortalShell } from "../../components/portal-shell";
import { professionalLegalAreas } from "../../../shared/legal-catalog";
import { isValidRut, formatRut } from "../../../shared/chile";
import type { BillingPlan, LawyerBillingResponse } from "../../../shared/billing";

type Profile = { full_name: string; email: string; phone: string | null; specialties_json: string; bio: string | null; application_status: string; application_review_note: string | null };
type Application = { rut?: string | null; graduation_date?: string | null; university?: string | null; attention_mode?: string | null; service_localities?: string | null; experience_years?: number | null; additional_studies?: string | null; work_experience?: string | null; linkedin_url?: string | null; website_url?: string | null; selected_plan_code?: string | null };
export default function LawyerApplicationPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [application, setApplication] = useState<Application>({});
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [billingMode, setBillingMode] = useState<"free" | "paid">("free");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all([fetch("/api/lawyer/profile"), fetch("/api/lawyer/plans")]).then(async ([profileResponse, planResponse]) => {
      if (!profileResponse.ok || !planResponse.ok) throw new Error();
      const [data, billing] = await Promise.all([profileResponse.json() as Promise<{ profile: Profile; application: Application }>, planResponse.json() as Promise<LawyerBillingResponse>]);
      if (active) { setProfile(data.profile); setApplication(data.application || {}); setPlans(billing.plans); setBillingMode(billing.config.mode); }
    }).catch(() => { if (active) setNotice("No pudimos cargar la postulación o los planes. Recarga e intenta nuevamente."); });
    return () => { active = false; };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const rut = String(form.get("rut") || "");
    if (!isValidRut(rut)) { setNotice("Ingresa un RUT chileno válido."); return; }
    const payload = Object.fromEntries(form.entries()) as Record<string, FormDataEntryValue | boolean | string[]>;
    payload.rut = formatRut(rut);
    payload.specialties = form.getAll("specialty").map(String);
    payload.manualVerificationConsent = form.get("manualVerificationConsent") === "on";
    setSaving(true); setNotice("");
    try { const response = await fetch("/api/lawyer/application", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || "No pudimos enviar la postulación."); setProfile((current) => current ? { ...current, application_status: "submitted" } : null); setNotice("Postulación enviada. Soporte coordinará la verificación de originales por videollamada o presencialmente."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "No pudimos enviarla."); } finally { setSaving(false); }
  }
  if (!profile) return <PortalShell><h1>Postulación profesional</h1><p className="client-loading">{notice || "Cargando postulación..."}</p></PortalShell>;
  if (profile.application_status === "submitted") return <PortalShell><section className="portal-panel review-empty"><p className="eyebrow">En revisión</p><h1>Recibimos tu postulación</h1><p>No envíes imágenes de tu cédula ni título por el sitio. El equipo coordinará una revisión de los documentos originales por videollamada o presencialmente.</p><Link className="portal-primary-button" href="/soporte">Contactar soporte</Link></section></PortalShell>;
  if (profile.application_status === "approved") return <PortalShell><section className="portal-panel review-empty"><h1>Perfil aprobado</h1><p>Ya puedes revisar casos y enviar propuestas.</p><Link className="portal-primary-button" href="/casos/pool">Ver casos</Link></section></PortalShell>;
  let selected: string[] = []; try { selected = JSON.parse(profile.specialties_json) as string[]; } catch { /* Empty selection. */ }
  return <PortalShell><div className="portal-page-heading"><div><p className="eyebrow">Activación profesional</p><h1>Postula como abogado/a</h1><p>Esta etapa guarda datos profesionales, no documentos. La verificación de originales se coordina fuera del sitio sin habilitar R2.</p></div></div>{profile.application_status === "changes_requested" && <p className="application-note">Se solicitaron cambios: {profile.application_review_note}</p>}{notice && <p role="status" className="save-confirmation">{notice}</p>}<form className="settings-stack" onSubmit={submit}>
    <section className="portal-panel account-form"><h2>Identidad y formación</h2><p>{profile.full_name} · {profile.email}</p><div className="form-grid three"><label>RUT<input name="rut" defaultValue={application.rut || ""} required placeholder="12.345.678-5" /></label><label>Universidad<input name="university" defaultValue={application.university || ""} required minLength={3} /></label><label>Fecha de titulación<input name="graduationDate" type="date" defaultValue={application.graduation_date || ""} required /></label><label>Años de experiencia<input name="experienceYears" type="number" min="0" max="70" defaultValue={application.experience_years ?? 0} /></label></div></section>
    <section className="portal-panel account-form"><h2>Práctica profesional</h2><p>Selecciona las materias que trabajas.</p><div className="practice-grid">{professionalLegalAreas.map((area) => <label key={area} className="check-card"><input type="checkbox" name="specialty" value={area} defaultChecked={selected.includes(area)} />{area}</label>)}</div><div className="form-grid two"><label>Modalidad<select name="attentionMode" defaultValue={application.attention_mode || "remote"}><option value="remote">Remota</option><option value="hybrid">Remota y presencial</option><option value="in_person">Presencial</option></select></label><label>Localidades de atención<input name="serviceLocalities" defaultValue={application.service_localities || ""} maxLength={600} /></label></div><label className="field">Presentación<textarea name="bio" defaultValue={profile.bio || ""} required minLength={30} maxLength={3000} rows={4} /></label><div className="form-grid two"><label>Estudios adicionales<textarea name="additionalStudies" defaultValue={application.additional_studies || ""} maxLength={3000} /></label><label>Experiencia laboral<textarea name="workExperience" defaultValue={application.work_experience || ""} maxLength={3000} /></label></div></section>
    <section className="portal-panel account-form"><h2>Enlaces y plan profesional</h2><div className="form-grid two"><label>LinkedIn<input name="linkedinUrl" type="url" defaultValue={application.linkedin_url || ""} /></label><label>Sitio web<input name="websiteUrl" type="url" defaultValue={application.website_url || ""} /></label><label>Plan<select name="planCode" required defaultValue={plans.some((plan) => plan.code === application.selected_plan_code) ? application.selected_plan_code || "" : plans.some((plan) => plan.code === "silver") ? "silver" : plans[0]?.code || ""}>{plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name} · {plan.monthly_credits} créditos{billingMode === "free" ? " de prueba" : " por período"}</option>)}</select></label></div><p>{billingMode === "free" ? "Modo gratuito: no hay cargos. Los créditos de prueba se habilitan tras la aprobación profesional y las renovaciones siguen la configuración del sitio." : "Modo de pago preparado, sin pasarela conectada. Elegir un plan no contrata una suscripción ni genera cobros."} <Link href="/planes">Revisar planes y reglas de créditos</Link></p>{!plans.length && <p role="alert">No hay planes habilitados; consulta a soporte antes de enviar tu postulación.</p>}<label className="settings-toggle"><input type="checkbox" name="manualVerificationConsent" required />Acepto coordinar la verificación de documentos originales por videollamada o presencialmente, sin cargarlos al sitio.</label><button className="portal-primary-button" disabled={saving || !plans.length}>{saving ? "Enviando..." : "Enviar postulación"}</button></section>
  </form></PortalShell>;
}
