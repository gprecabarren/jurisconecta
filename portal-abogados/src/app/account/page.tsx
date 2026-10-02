"use client";
/* eslint-disable @next/next/no-img-element -- Images are small validated data URLs; no image CDN is used. */
import { FormEvent, useEffect, useState } from "react";
import { PortalShell } from "../../components/portal-shell";
import { professionalLegalAreas } from "../../../shared/legal-catalog";
import { chileRegions } from "../../../shared/chile";
import { SessionManager } from "../../components/session-manager";
import { AccountDangerZone } from "../../components/account-danger-zone";

type Profile = { full_name: string; email: string; phone: string | null; region: string | null; commune: string | null; avatar_data_url: string | null; specialties_json: string; bio: string | null; application_status: string };
type Preferences = { case_updates: number; support_updates: number; account_updates: number };
const headers = { "Content-Type": "application/json" };
async function api(path: string, method: string, body: object) {
  const response = await fetch(path, { method, headers, body: JSON.stringify(body) });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "No pudimos guardar los cambios.");
}
async function avatarData(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5_000_000) throw new Error("Selecciona una imagen JPG, PNG o WebP de hasta 5 MB.");
  const image = await createImageBitmap(file);
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 192;
  const context = canvas.getContext("2d"); if (!context) throw new Error("No pudimos procesar la foto.");
  const side = Math.min(image.width, image.height);
  context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 192, 192);
  image.close();
  for (const quality of [0.7, 0.5, 0.3, 0.15]) { const value = canvas.toDataURL("image/webp", quality); if (value.length < 32_000) return value; }
  throw new Error("La foto no pudo comprimirse. Prueba con otra.");
}
export default function AccountPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>({ case_updates: 1, support_updates: 1, account_updates: 1 });
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { void Promise.all([fetch("/api/lawyer/profile"), fetch("/api/notifications/preferences")]).then(async ([a, b]) => {
    if (!a.ok || !b.ok) throw new Error();
    const account = await a.json() as { profile: Profile };
    const settings = await b.json() as { preferences: Preferences };
    setProfile(account.profile); setAvatar(account.profile.avatar_data_url); setPrefs(settings.preferences);
  }).catch(() => setNotice("No pudimos cargar tu cuenta.")); }, []);
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/lawyer/profile", "PATCH", { fullName: form.get("fullName"), phone: form.get("phone"), region: form.get("region"), commune: form.get("commune"), bio: form.get("bio"), specialties: form.getAll("specialty"), ...(avatarChanged ? { avatarDataUrl: avatar } : {}) });
      setAvatarChanged(false); setNotice("Perfil guardado en JurisConecta.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Error al guardar."); } finally { setSaving(false); }
  }
  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (form.get("newPassword") !== form.get("confirm")) { setNotice("Las contraseñas no coinciden."); return; }
    setSaving(true); setNotice("");
    try { await api("/api/auth/password", "PATCH", { currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") }); event.currentTarget.reset(); setNotice("Contraseña actualizada; las otras sesiones se cerraron."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Error al cambiar la contraseña."); } finally { setSaving(false); }
  }
  async function savePrefs() {
    setSaving(true); setNotice("");
    try { await api("/api/notifications/preferences", "PATCH", { caseUpdates: Boolean(prefs.case_updates), supportUpdates: Boolean(prefs.support_updates), accountUpdates: Boolean(prefs.account_updates) }); setNotice("Preferencias guardadas. Los avisos son solo dentro del sitio."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Error al guardar."); } finally { setSaving(false); }
  }
  let selected: string[] = [];
  try { selected = JSON.parse(profile?.specialties_json || "[]") as string[]; } catch { /* Profile can be repaired by selecting specialties. */ }
  return <PortalShell><div className="portal-page-heading"><div><p className="eyebrow">Configuración profesional</p><h1>Mi cuenta</h1><p>Perfil, foto, seguridad y avisos guardados en el servidor.</p></div></div>{notice && <p className="save-confirmation" role="status">{notice}</p>}{!profile ? <p>Cargando cuenta...</p> : <div className="settings-stack">
    <form className="portal-panel account-form" onSubmit={saveProfile}><h2>Perfil profesional</h2><p>Estado: {profile.application_status}. La foto se comprime en tu navegador; no se carga a R2.</p><div className="avatar-editor">{avatar ? <img className="profile-avatar-image" src={avatar} alt="Tu foto de perfil" /> : <span className="profile-avatar">{profile.full_name.slice(0, 2).toUpperCase()}</span>}<div><label className="file-button">Elegir foto<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { setAvatar(await avatarData(file)); setAvatarChanged(true); setNotice(""); } catch (error) { setNotice(error instanceof Error ? error.message : "Foto inválida."); } }} /></label><button type="button" className="portal-outline-button" onClick={() => { setAvatar(null); setAvatarChanged(true); }}>Quitar foto</button></div></div><div className="form-grid two"><label>Nombre completo<input name="fullName" defaultValue={profile.full_name} required minLength={3} /></label><label>Correo<input value={profile.email} disabled /></label><label>Teléfono<input name="phone" defaultValue={profile.phone || ""} type="tel" /></label><label>Región<select name="region" defaultValue={profile.region || ""}><option value="">Selecciona región</option>{chileRegions.map((region) => <option key={region}>{region}</option>)}</select></label><label>Comuna<input name="commune" defaultValue={profile.commune || ""} /></label></div><h3>Especialidades</h3><div className="practice-grid">{professionalLegalAreas.map((area) => <label key={area} className="check-card"><input type="checkbox" name="specialty" value={area} defaultChecked={selected.includes(area)} />{area}</label>)}</div><label className="field">Presentación<textarea name="bio" defaultValue={profile.bio || ""} rows={4} maxLength={3000} /></label><button className="portal-primary-button" disabled={saving}>Guardar perfil</button></form>
    <form className="portal-panel account-form" onSubmit={savePassword}><h2>Contraseña</h2><div className="form-grid three"><label>Actual<input name="currentPassword" type="password" required autoComplete="current-password" /></label><label>Nueva<input name="newPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label><label>Repetir nueva<input name="confirm" type="password" required minLength={8} autoComplete="new-password" /></label></div><button className="portal-primary-button" disabled={saving}>Cambiar contraseña</button></form>
    <section className="portal-panel account-form"><h2>Avisos internos</h2><p>No enviamos correos ni WhatsApp automáticamente.</p>{([["case_updates", "Casos y propuestas"], ["support_updates", "Tickets de soporte"], ["account_updates", "Cuenta y seguridad"]] as const).map(([key, label]) => <label className="settings-toggle" key={key}><input type="checkbox" checked={Boolean(prefs[key])} onChange={(event) => setPrefs({ ...prefs, [key]: event.target.checked ? 1 : 0 })} />{label}</label>)}<button className="portal-primary-button" disabled={saving} onClick={savePrefs}>Guardar preferencias</button></section>
    <SessionManager />
    <AccountDangerZone />
  </div>}</PortalShell>;
}
