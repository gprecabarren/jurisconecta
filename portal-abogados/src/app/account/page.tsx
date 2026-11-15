"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { PortalShell } from "../../components/portal-shell";
import { CASE_CATALOG_SUMMARIES, type CaseCatalogSummary } from "../../../shared/case-catalog-summary";
import { lawyerDraftFromProfile, lawyerProfessionalPayload, type LawyerApplicationData, type LawyerDraft, type LawyerProfileData } from "../../../shared/lawyer-onboarding";
import { LawyerProfessionalFields } from "../../components/lawyer-professional-fields";
import { SessionManager } from "../../components/session-manager";
import { AccountDangerZone } from "../../components/account-danger-zone";
import styles from "./page.module.css";

type Preferences = { case_updates: number; support_updates: number; account_updates: number };
const headers = { "Content-Type": "application/json" };
const applicationStatusLabels: Record<string, string> = {
  draft: "Empieza tu postulación",
  submitted: "Tu postulación está en revisión",
  changes_requested: "Tu postulación requiere cambios",
  rejected: "Revisa el estado de tu postulación",
};
async function api(path: string, method: string, body: object) {
  const response = await fetch(path, { method, headers, body: JSON.stringify(body) });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "No pudimos guardar los cambios.");
}
export default function AccountPage() {
  const [profile, setProfile] = useState<LawyerProfileData | null>(null);
  const [savedDraft, setSavedDraft] = useState<LawyerDraft | null>(null);
  const [draft, setDraft] = useState<LawyerDraft | null>(null);
  const [caseCatalog, setCaseCatalog] = useState(CASE_CATALOG_SUMMARIES);
  const [profileNotice, setProfileNotice] = useState<{ text: string; isError?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Preferences>({ case_updates: 1, support_updates: 1, account_updates: 1 });
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [passwordAccount, setPasswordAccount] = useState(false);
  useEffect(() => { void fetch("/api/auth/google/account").then((response) => response.ok ? response.json() as Promise<{ passwordAccount: boolean }> : null).then((result) => setPasswordAccount(result?.passwordAccount === true)).catch(() => undefined); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal, cache: "no-store" } as const;
    void Promise.all([fetch("/api/lawyer/profile", options), fetch("/api/notifications/preferences", options)]).then(async ([profileResponse, preferencesResponse]) => {
      if (!profileResponse.ok || !preferencesResponse.ok) throw new Error();
      const account = await profileResponse.json() as { profile: LawyerProfileData; application: LawyerApplicationData };
      const settings = await preferencesResponse.json() as { preferences: Preferences };
      if (controller.signal.aborted) return;
      const initialDraft = lawyerDraftFromProfile(account.profile, account.application);
      setProfile(account.profile);
      setDraft(initialDraft);
      setSavedDraft(initialDraft);
      setPrefs(settings.preferences);
    }).catch(() => {
      if (!controller.signal.aborted) setNotice("No pudimos cargar tu cuenta. Recarga la página para volver a intentarlo.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    void fetch("/api/case-types?view=summary", options).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { types?: CaseCatalogSummary[] };
      if (!controller.signal.aborted && Array.isArray(result.types)) setCaseCatalog(result.types);
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !savedDraft || saving) return;
    const original = lawyerProfessionalPayload(savedDraft);
    const professionalDetails = Object.fromEntries(Object.entries(lawyerProfessionalPayload(draft)).filter(([field, value]) => (
      JSON.stringify(value) !== JSON.stringify(original[field as keyof typeof original])
    )));
    setSaving(true);
    setProfileNotice(null);
    try {
      await api("/api/lawyer/profile", "PATCH", {
        ...(draft.fullName !== savedDraft.fullName ? { fullName: draft.fullName } : {}),
        ...(draft.phone !== savedDraft.phone ? { phone: draft.phone } : {}),
        ...(draft.region !== savedDraft.region ? { region: draft.region } : {}),
        ...(draft.commune !== savedDraft.commune ? { commune: draft.commune } : {}),
        ...(draft.bio !== savedDraft.bio ? { bio: draft.bio } : {}),
        ...(JSON.stringify(draft.specialties) !== JSON.stringify(savedDraft.specialties) ? { specialties: draft.specialties } : {}),
        ...(draft.avatarDataUrl !== savedDraft.avatarDataUrl ? { avatarDataUrl: draft.avatarDataUrl } : {}),
        ...(Object.keys(professionalDetails).length > 0 ? { professionalDetails } : {}),
      });
      setSavedDraft(draft);
      setProfileNotice({ text: "Perfil guardado en JurisConecta." });
      window.dispatchEvent(new Event("juris:billing-updated"));
    } catch (error) {
      setProfileNotice({ text: error instanceof Error ? error.message : "Error al guardar el perfil.", isError: true });
    } finally {
      setSaving(false);
    }
  }
  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (form.get("newPassword") !== form.get("confirm")) { setNotice("Las contraseñas no coinciden."); return; }
    setSaving(true); setNotice("");
    const formElement = event.currentTarget;
    try { await api("/api/auth/password", "PATCH", { currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") }); formElement.reset(); setNotice("Contraseña actualizada; las otras sesiones se cerraron."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Error al cambiar la contraseña."); } finally { setSaving(false); }
  }
  async function savePrefs() {
    setSaving(true); setNotice("");
    try { await api("/api/notifications/preferences", "PATCH", { caseUpdates: Boolean(prefs.case_updates), supportUpdates: Boolean(prefs.support_updates), accountUpdates: Boolean(prefs.account_updates) }); setNotice("Preferencias guardadas. Los avisos son solo dentro del sitio."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Error al guardar."); } finally { setSaving(false); }
  }
  return <PortalShell>
    <div className="portal-page-heading"><div><p className="eyebrow">Configuración profesional</p><h1>Mi cuenta</h1><p>Administra tu perfil, tu seguridad y los avisos que recibes.</p></div></div>
    {notice && <p className="save-confirmation" role="status">{notice}</p>}
    {loading && <p role="status">Cargando cuenta…</p>}
    {profile && draft && <>
      {profile.application_status === "approved" ? <form className={`portal-panel ${styles.professional}`} onSubmit={saveProfile} onInvalidCapture={(event) => {
        const group = event.target instanceof HTMLElement ? event.target.closest("details") : null;
        if (group) group.open = true;
      }} aria-busy={saving}>
        <h2>Perfil profesional</h2>
        <LawyerProfessionalFields value={draft} onChange={(patch) => setDraft((current) => current ? { ...current, ...patch } : current)} catalog={caseCatalog} identityEditable={false} />
        <button className="portal-primary-button" disabled={saving}>{saving ? "Guardando perfil…" : "Guardar perfil"}</button>
        {profileNotice && <p className={profileNotice.isError ? styles.error : "save-confirmation"} role={profileNotice.isError ? "alert" : "status"}>{profileNotice.text}</p>}
      </form> : <section className={`portal-panel ${styles.professional}`}>
        <h2>{applicationStatusLabels[profile.application_status] || "Estado de tu postulación"}</h2>
        <Link className="portal-primary-button" href="/postulacion-abogado">Ir a mi postulación</Link>
      </section>}
      <div className="settings-stack">
        {passwordAccount && <form className="portal-panel account-form" onSubmit={savePassword}>
          <h2>Contraseña</h2>
          <div className="form-grid three">
            <label>Actual<input name="currentPassword" type="password" required autoComplete="current-password" /></label>
            <label>Nueva<input name="newPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
            <label>Repetir nueva<input name="confirm" type="password" required minLength={8} autoComplete="new-password" /></label>
          </div>
          <button className="portal-primary-button" disabled={saving}>Cambiar contraseña</button>
        </form>}
        <section className="portal-panel account-form">
          <h2>Avisos internos</h2>
          <p>No enviamos correos ni WhatsApp automáticamente.</p>
          {([["case_updates", "Casos y propuestas"], ["support_updates", "Tickets de soporte"], ["account_updates", "Cuenta y seguridad"]] as const).map(([key, label]) => <label className="settings-toggle" key={key}>
            <input type="checkbox" checked={Boolean(prefs[key])} onChange={(event) => setPrefs({ ...prefs, [key]: event.target.checked ? 1 : 0 })} />{label}
          </label>)}
          <button className="portal-primary-button" disabled={saving} onClick={savePrefs}>Guardar preferencias</button>
        </section>
        <SessionManager />
        <AccountDangerZone />
      </div>
    </>}
  </PortalShell>;
}
