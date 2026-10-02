"use client";

import { CheckCircle2, Save, UserRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { ClientShell } from "../../../components/client-shell";
import { chileRegions } from "../../../../shared/chile";
import { SessionManager } from "../../../components/session-manager";
import { AccountDangerZone } from "../../../components/account-danger-zone";

type Profile = { full_name: string; email: string; phone: string | null; region: string | null; commune: string | null; };

export default function ClientAccountPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { void fetch("/api/auth/me").then(async (response) => { if (!response.ok) throw new Error(); return await response.json() as { user: Profile }; }).then((result) => setProfile(result.user)).catch(() => setNotice("No pudimos cargar tus datos.")); }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: form.get("fullName"), phone: form.get("phone"), region: form.get("region"), commune: form.get("commune") }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "No pudimos guardar los cambios.");
      setNotice("Tus datos fueron actualizados.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No pudimos guardar los cambios."); } finally { setSaving(false); }
  }
  return <ClientShell><div className="portal-page-heading"><div><p className="eyebrow">Mi cuenta</p><h1>Datos de contacto</h1><p>Esta información se usa para acompañarte en tus solicitudes.</p></div></div><section className="portal-panel client-account-panel">{profile ? <form className="account-form client-account-form" onSubmit={save}><div className="avatar-editor"><span className="profile-avatar"><UserRound size={28} /></span><div><h2>{profile.full_name}</h2><p>{profile.email}</p></div></div><div className="form-grid two"><label>Nombre completo<input required name="fullName" defaultValue={profile.full_name} /></label><label>Correo electrónico<input disabled value={profile.email} /></label><label>Teléfono<input name="phone" type="tel" defaultValue={profile.phone || ""} placeholder="+56 9 1234 5678" /></label><label>Región<select name="region" defaultValue={profile.region || ""}><option value="">Selecciona una región</option>{chileRegions.map((region) => <option key={region}>{region}</option>)}</select></label><label>Comuna<input name="commune" defaultValue={profile.commune || ""} placeholder="Tu comuna" /></label></div>{notice && <p className="save-confirmation"><CheckCircle2 size={17} /> {notice}</p>}<button className="portal-primary-button" disabled={saving}><Save size={17} /> {saving ? "Guardando..." : "Guardar cambios"}</button></form> : <p className="client-loading">Cargando tus datos...</p>}</section><div className="settings-stack"><SessionManager /><AccountDangerZone /></div></ClientShell>;
}
