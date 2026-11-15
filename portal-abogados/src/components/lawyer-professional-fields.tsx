"use client";

/* eslint-disable @next/next/no-img-element -- Local compressed data URL, no external image service. */
import { Camera, ImagePlus, MapPin, Trash2 } from "lucide-react";
import { useId, useState, type ChangeEvent } from "react";
import { chileRegions } from "../../shared/chile";
import { professionalLegalAreas } from "../../shared/legal-catalog";
import { attentionModes, lawyerGenders, type LawyerDraft } from "../../shared/lawyer-onboarding";
import type { CaseCatalogSummary } from "../../shared/case-catalog-summary";
import styles from "./lawyer-onboarding.module.css";

const socialFields = [["linkedinUrl", "LinkedIn"], ["twitterUrl", "X / Twitter"], ["youtubeUrl", "YouTube"], ["facebookUrl", "Facebook"], ["instagramUrl", "Instagram"], ["websiteUrl", "Sitio web profesional"]] as const;
const countries = ["Chile", "Argentina", "Bolivia", "Brasil", "Colombia", "Ecuador", "España", "Estados Unidos", "México", "Paraguay", "Perú", "Uruguay", "Venezuela"];

async function compressPortrait(file: File) {
  if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type) || file.size > 5_000_000) throw new Error("Elige una imagen JPG, PNG o WebP de hasta 5 MB.");
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 192;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No pudimos procesar la foto.");
    const side = Math.min(image.width, image.height);
    ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 192, 192);
    for (const quality of [0.75, 0.55, 0.35, 0.15]) {
      const result = canvas.toDataURL("image/webp", quality);
      if (result.length <= 32_000) return result;
    }
    throw new Error("La foto no pudo comprimirse. Prueba con otra imagen.");
  } finally { image.close(); }
}

export function LawyerProfessionalFields({ value, onChange, catalog, identityEditable = true, preview = false }: { value: LawyerDraft; onChange: (patch: Partial<LawyerDraft>) => void; catalog: readonly CaseCatalogSummary[]; identityEditable?: boolean; preview?: boolean }) {
  const [imageNotice, setImageNotice] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const countryList = useId();
  const today = new Date().toISOString().slice(0, 10);
  const active = catalog.filter((type) => type.enabled);
  const areas = [...new Set([...professionalLegalAreas, ...active.map((type) => type.category), ...value.specialties])];
  const serviceRegions = value.serviceLocalities.split(/;\s*/).map((entry) => entry.trim());
  const hasArea = (area: string) => value.specialties.includes(area);
  const setText = (key: keyof LawyerDraft) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange({ [key]: event.target.value });
  function toggleArea(area: string) {
    const ids = new Set(active.filter((type) => type.category === area).map((type) => type.id));
    onChange(hasArea(area) ? { specialties: value.specialties.filter((item) => item !== area), practiceTopicIds: value.practiceTopicIds.filter((id) => !ids.has(id)) } : { specialties: [...value.specialties, area], practiceTopicIds: [...new Set([...value.practiceTopicIds, ...ids])] });
  }
  function toggleTopic(type: CaseCatalogSummary) {
    const selected = value.practiceTopicIds.includes(type.id);
    const ids = selected ? value.practiceTopicIds.filter((id) => id !== type.id) : [...value.practiceTopicIds, type.id];
    const remaining = active.some((item) => item.category === type.category && ids.includes(item.id));
    onChange({ practiceTopicIds: ids, specialties: remaining ? [...new Set([...value.specialties, type.category])] : value.specialties.filter((area) => area !== type.category) });
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || preview || imageBusy) return;
    setImageBusy(true); setImageNotice("Preparando foto…");
    try { onChange({ avatarDataUrl: await compressPortrait(file) }); setImageNotice("Foto lista para guardar."); }
    catch (error) { setImageNotice(error instanceof Error ? error.message : "No pudimos leer la foto."); }
    finally { setImageBusy(false); }
  }
  return <div className={styles.fieldsStack}>
    <fieldset className={styles.group}><legend>Información personal</legend>
      <div className={styles.fields}>
        <label>Nombre completo<input name="fullName" value={value.fullName} onChange={setText("fullName")} required minLength={3} maxLength={120} autoComplete="name" /></label>
        <label>Correo electrónico<input name="email" value={value.email} readOnly type="email" autoComplete="email" /></label>
        <div className={styles.rutFields}><label>RUT<input name="rutNumber" value={value.rutNumber} onChange={setText("rutNumber")} readOnly={!identityEditable} required={identityEditable} inputMode="numeric" maxLength={10} placeholder="Sin dígito verificador" /></label><label>Dígito verificador<input name="rutVerifier" value={value.rutVerifier} onChange={setText("rutVerifier")} readOnly={!identityEditable} required={identityEditable} maxLength={1} placeholder="0–9 o K" /></label></div>
        <label>Teléfono con código de país<input name="phone" value={value.phone} onChange={setText("phone")} required={identityEditable} type="tel" autoComplete="tel" maxLength={30} placeholder="+56 9 …" /></label>
      </div>
      <div className={styles.portrait}>
        {value.avatarDataUrl ? <img src={value.avatarDataUrl} alt="Tu foto de perfil" width={72} height={72} /> : <span aria-hidden="true">{value.fullName.trim().split(/\s+/).slice(0, 2).map((name) => name[0]?.toUpperCase()).join("") || "JC"}</span>}
        <div><strong>Foto de perfil (opcional)</strong><p>Únicamente para tu perfil profesional. No se usa para reconocimiento facial.</p>
          <div className={styles.actions}>
            <label className={styles.fileAction}><ImagePlus size={17} aria-hidden="true" /> Subir foto<input type="file" accept="image/jpeg,image/png,image/webp" disabled={preview || imageBusy} onChange={upload} /></label>
            <label className={styles.fileAction}><Camera size={17} aria-hidden="true" /> Tomar foto<input type="file" accept="image/*" capture="user" disabled={preview || imageBusy} onChange={upload} /></label>
            {value.avatarDataUrl && <button type="button" className="back-button" onClick={() => { onChange({ avatarDataUrl: null }); setImageNotice(""); }}><Trash2 size={16} /> Quitar foto</button>}
          </div>
          {imageNotice && <p role="status">{imageNotice}</p>}
        </div>
      </div>
    </fieldset>
    <fieldset className={styles.group}><legend>Áreas de práctica</legend><p>Selecciona las áreas y los tipos de caso que quieres recibir como preferentes.</p>
      <div className={styles.actions}><button type="button" className="portal-outline-button" onClick={() => onChange({ specialties: areas, practiceTopicIds: active.map((type) => type.id) })}>Seleccionar todos</button><button type="button" className="back-button" onClick={() => onChange({ specialties: [], practiceTopicIds: [] })}>Limpiar selección</button></div>
      <ul className={styles.choices}>{areas.map((area) => {
        const types = active.filter((type) => type.category === area);
        const count = types.filter((type) => value.practiceTopicIds.includes(type.id)).length;
        return <li key={area}><label className={styles.check}><input type="checkbox" checked={hasArea(area)} onChange={() => toggleArea(area)} />{area}</label>{types.length > 0 && <details><summary>Ver tipos de caso ({count}/{types.length})</summary><div className={styles.choiceItems}>{types.map((type) => <label className={styles.check} key={type.id}><input type="checkbox" checked={value.practiceTopicIds.includes(type.id)} onChange={() => toggleTopic(type)} />{type.topic}</label>)}</div></details>}</li>;
      })}</ul>
    </fieldset>
    <fieldset className={styles.group}><legend>Tipo de atención</legend>
      <div className={styles.choiceItems}>{Object.entries(attentionModes).map(([mode, label]) => <label key={mode} className={styles.check}><input type="radio" name={`attentionMode-${countryList}`} value={mode} checked={value.attentionMode === mode} onChange={setText("attentionMode")} />{label}</label>)}</div>
      {value.attentionMode !== "remote" && <div className={styles.coverage}><details><summary><MapPin size={16} aria-hidden="true" /> Seleccionar regiones de atención</summary><div className={styles.choiceItems}>{chileRegions.map((region) => <label className={styles.check} key={region}><input type="checkbox" checked={serviceRegions.includes(region)} onChange={(event) => onChange({ serviceLocalities: (event.target.checked ? [...serviceRegions.filter(Boolean), region] : serviceRegions.filter((item) => item !== region)).join("; ") })} />{region}</label>)}</div></details><label>Localidades de atención<input name="serviceLocalities" value={value.serviceLocalities} onChange={setText("serviceLocalities")} required={identityEditable} maxLength={600} placeholder="Regiones o comunas separadas por punto y coma" /></label></div>}
    </fieldset>
    <fieldset className={styles.group}><legend>Información básica</legend><div className={styles.fields}>
      <label>Universidad<input name="university" required={identityEditable} minLength={3} maxLength={160} value={value.university} onChange={setText("university")} autoComplete="organization" /></label>
      <label>País de residencia<input name="country" list={countryList} required={identityEditable} maxLength={80} value={value.country} onChange={(event) => onChange({ country: event.target.value, ...(event.target.value !== "Chile" ? { region: "" } : {}) })} autoComplete="country-name" /><datalist id={countryList}>{countries.map((country) => <option key={country} value={country} />)}</datalist></label>
      {value.country === "Chile" && <label>Región de residencia<select name="region" value={value.region} onChange={(event) => onChange({ region: event.target.value, commune: "" })} required={identityEditable} autoComplete="address-level1"><option value="">Selecciona una región</option>{chileRegions.map((region) => <option key={region}>{region}</option>)}</select></label>}
      <label>{value.country === "Chile" ? "Comuna" : "Ciudad"} de residencia<input name="commune" value={value.commune} onChange={setText("commune")} required={identityEditable} maxLength={80} autoComplete="address-level2" /></label>
      <label>Fecha de nacimiento (opcional)<input name="birthDate" type="date" value={value.birthDate} onChange={setText("birthDate")} min="1900-01-01" max={today} autoComplete="bday" /></label>
      <label>Fecha de titulación<input name="graduationDate" type="date" value={value.graduationDate} onChange={setText("graduationDate")} min="1900-01-01" max={today} required={identityEditable} /></label>
      <label>Años de experiencia: {value.experienceYears}<input name="experienceYears" type="range" min={0} max={70} value={value.experienceYears} onChange={setText("experienceYears")} /></label>
      <label>Género (opcional)<select name="gender" value={value.gender} onChange={setText("gender")}><option value="">Selecciona una opción</option>{Object.entries(lawyerGenders).map(([key, label]) => <option key={key} value={key}>{label}</option>)}{value.gender && !Object.hasOwn(lawyerGenders, value.gender) && <option value={value.gender}>{value.gender}</option>}</select></label>
      <label className={styles.full}>Presentación<textarea name="bio" value={value.bio} onChange={setText("bio")} rows={5} maxLength={3000} minLength={identityEditable ? 30 : undefined} required={identityEditable} /><small>Cuenta tu experiencia, especialidades, formación y forma de trabajar. No incluyas datos de clientes.</small></label>
    </div></fieldset>
    <details className={styles.optional}><summary>Información complementaria <small>Opcional</small></summary><div className={styles.fields}><label>Estudios adicionales<textarea name="additionalStudies" value={value.additionalStudies} onChange={setText("additionalStudies")} maxLength={3000} rows={3} /></label><label>Experiencia laboral<textarea name="workExperience" value={value.workExperience} onChange={setText("workExperience")} maxLength={3000} rows={3} /></label></div></details>
    <details className={styles.optional}><summary>Redes sociales <small>Opcional</small></summary><div className={styles.fields}>{socialFields.map(([key, label]) => <label key={key}>{label}<input name={key} value={value[key]} onChange={setText(key)} type="url" maxLength={300} placeholder="https://…" /></label>)}</div></details>
    <details className={styles.optional}><summary>Oficina principal <small>Opcional</small></summary><label>Dirección de oficina<input name="address" value={value.address} onChange={setText("address")} maxLength={500} autoComplete="street-address" /><small>Usa una dirección profesional, no la de tu domicilio particular.</small></label></details>
    <details className={styles.optional}><summary>Código de referido <small>Opcional</small></summary><label>Código de referido<input name="referralCode" value={value.referralCode} onChange={setText("referralCode")} maxLength={32} autoComplete="off" /><small>Solo registra la referencia. No aplica descuentos ni entrega créditos.</small></label></details>
  </div>;
}
