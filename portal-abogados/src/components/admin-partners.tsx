"use client";

import { Building2, ImagePlus, Pencil, RefreshCw, Scale, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { partnerLimits, type AdminPartner, type PartnerAdminData, type PartnerCategory } from "../../shared/partners";
import styles from "./admin-partners.module.css";

type Editor = { id: string; version: number; name: string; category: PartnerCategory; alt: string; linkUrl: string; sortOrder: number; active: boolean; authorized: boolean; imageData?: string; previewUrl: string; archived: boolean };
const emptyEditor = (): Editor => ({ id: "", version: 0, name: "", category: "company", alt: "", linkUrl: "", sortOrder: 0, active: false, authorized: false, previewUrl: "", archived: false });
function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("No se pudo leer la imagen."));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(blob);
  });
}
async function optimizedLogo(file: File) {
  if (!["image/png", "image/webp", "image/jpeg"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Selecciona PNG, WebP o JPEG de hasta 5 MB. No se aceptan SVG ni imágenes animadas.");
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 16_000_000) throw new Error("La imagen es demasiado grande. Exporta un logo de hasta 16 megapíxeles.");
    for (const maxWidth of [960, 720, 480, 320, 200]) {
      const scale = Math.min(1, maxWidth / bitmap.width, 480 / bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo optimizar la imagen en este navegador.");
      // Clear canvas + PNG/WebP preserve alpha: no opaque background is added.
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const [mime, quality] of [["image/png", 1], ["image/webp", .9], ["image/webp", .75], ["image/webp", .55], ["image/webp", .35]] as const) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
        if (blob && blob.size <= partnerLimits.imageBytes) return { data: await blobDataUrl(blob), bytes: blob.size, width: canvas.width, height: canvas.height };
      }
    }
    throw new Error("No se pudo reducir el logo a 48 KB. Usa una versión más simple o de menor tamaño.");
  } finally { bitmap.close(); }
}
function updatedDate(value: string) {
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });
}
async function fetchPartnerAdmin(signal?: AbortSignal) {
  const response = await fetch("/api/admin/partners", { signal, cache: "no-store" });
  const result = await response.json() as PartnerAdminData & { error?: string };
  if (!response.ok) throw new Error(result.error || "No se pudo cargar la sección de colaboraciones.");
  return result;
}

export function AdminPartners() {
  const [data, setData] = useState<PartnerAdminData | null>(null);
  const [editor, setEditor] = useState<Editor>(emptyEditor);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [message, setMessage] = useState("");
  const [imageMessage, setImageMessage] = useState("");
  const fileOperation = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setData(await fetchPartnerAdmin(signal));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetchPartnerAdmin(controller.signal).then((result) => { if (!controller.signal.aborted) setData(result); }).catch((error) => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "No se pudo cargar la sección."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  function edit(partner: AdminPartner) {
    fileOperation.current += 1; setOptimizing(false); setImageMessage(""); setMessage("");
    setEditor({ ...partner, authorized: false, previewUrl: partner.archived ? "" : partner.imageUrl });
    formRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }
  function reset() { fileOperation.current += 1; setOptimizing(false); setEditor(emptyEditor()); setImageMessage(""); }
  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    const operation = ++fileOperation.current; setOptimizing(true); setImageMessage("");
    try {
      const result = await optimizedLogo(file);
      if (operation === fileOperation.current) {
        setEditor((current) => ({ ...current, imageData: result.data, previewUrl: result.data }));
        setImageMessage(`Logo optimizado: ${(result.bytes / 1024).toFixed(1)} KB · ${result.width} × ${result.height} px. Transparencia conservada cuando existe.`);
      }
    } catch (error) { if (operation === fileOperation.current) setImageMessage(error instanceof Error ? error.message : "No se pudo optimizar la imagen."); }
    finally { if (operation === fileOperation.current) setOptimizing(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor.previewUrl) { setMessage("Selecciona un logo antes de guardar."); return; }
    setSaving(true); setMessage("");
    try {
      const payload = { id: editor.id, version: editor.version, name: editor.name, category: editor.category, alt: editor.alt,
        linkUrl: editor.linkUrl, sortOrder: editor.sortOrder, active: editor.active, authorized: editor.authorized, imageData: editor.imageData };
      const response = await fetch("/api/admin/partners", { method: editor.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo guardar el logo.");
      await refresh(); reset(); setMessage(result.message || "Logo guardado.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar el logo."); }
    finally { setSaving(false); }
  }
  async function archive(partner: AdminPartner) {
    if (!window.confirm(`¿Retirar “${partner.name}” del home? Su imagen se elimina para liberar espacio, pero el historial permanece. Puedes reutilizar este espacio subiendo un nuevo logo.`)) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/partners", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: partner.id, version: partner.version, action: "archive" }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo retirar el logo.");
      await refresh(); if (editor.id === partner.id) reset(); setMessage("Logo retirado. La acción quedó en la bitácora.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo retirar el logo."); }
    finally { setSaving(false); }
  }
  return <section className={`portal-panel ${styles.section}`} id="colaboraciones" aria-labelledby="admin-partners-title">
    <div className="panel-title"><div><p className="eyebrow">Contenido del home</p><h2 id="admin-partners-title">Empresas y estudios jurídicos</h2></div><button type="button" className="portal-outline-button" disabled={loading || saving} onClick={() => { void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "No se pudo actualizar.")); }}><RefreshCw size={16} /> Actualizar</button></div>
    <p>Publica únicamente logos propios o autorizados de colaboraciones reales. No hay ejemplos ficticios: el carrusel se oculta hasta que actives al menos un logo. Puedes tener una fila de empresas y otra de estudios jurídicos.</p>
    <p className={styles.storage}>{data ? `${data.partners.length} / ${partnerLimits.count} espacios · ${(data.storageBytes / 1024).toFixed(0)} / ${partnerLimits.storageBytes / 1024} KB almacenados` : "Cargando logos…"} · Sin activar R2 ni servicios de imágenes.</p>
    <form className={styles.editor} ref={formRef} onSubmit={(event) => { void save(event); }}>
      <h3>{editor.id ? editor.archived ? "Reutilizar espacio retirado" : "Editar colaboración" : "Agregar colaboración"}</h3>
      <fieldset disabled={loading || saving || optimizing}>
        <div className={styles.fields}>
          <label>Nombre<input name="partnerName" required minLength={2} maxLength={100} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="Nombre de la empresa o estudio" /></label>
          <label>Tipo<select value={editor.category} onChange={(event) => setEditor({ ...editor, category: event.target.value as PartnerCategory })}><option value="company">Empresa</option><option value="law_firm">Estudio jurídico</option></select></label>
          <label>Texto alternativo<input required minLength={2} maxLength={200} value={editor.alt} onChange={(event) => setEditor({ ...editor, alt: event.target.value })} placeholder="Logo de Nombre" /></label>
          <label>Enlace HTTPS (opcional)<input type="url" maxLength={500} value={editor.linkUrl} onChange={(event) => setEditor({ ...editor, linkUrl: event.target.value })} placeholder="https://…" /></label>
          <label>Orden en su fila<input type="number" required min={0} max={9999} step={1} value={editor.sortOrder} onChange={(event) => setEditor({ ...editor, sortOrder: Number(event.target.value) })} /></label>
          <label className={styles.checkbox}><input type="checkbox" checked={editor.active} onChange={(event) => setEditor({ ...editor, active: event.target.checked })} /> Mostrar en el home</label>
        </div>
        <div className={styles.imageArea}>
          {editor.previewUrl ? <div className={styles.preview}>
            {/* Preview may be an authenticated first-party endpoint or locally compressed raster data. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={editor.previewUrl} alt={editor.alt || "Vista previa del logo seleccionado"} width={220} height={100} />
          </div> : <div className={styles.placeholder}><ImagePlus size={28} /><span>Selecciona un logo</span></div>}
          <label className={styles.upload}>Logo PNG, WebP o JPEG<input type="file" accept="image/png,image/webp,image/jpeg" onChange={(event) => { void chooseImage(event); }} /><small>Se optimiza en tu navegador a PNG o WebP (máx. 48 KB), sin enviar el original ni agregar fondo.</small></label>
        </div>
        <label className={styles.checkbox}><input type="checkbox" required checked={editor.authorized} onChange={(event) => setEditor({ ...editor, authorized: event.target.checked })} /> Confirmo que esta colaboración es real y tengo autorización para publicar su logo.</label>
      </fieldset>
      {imageMessage || optimizing ? <p role="status">{optimizing ? "Optimizando logo…" : imageMessage}</p> : null}
      <div className={styles.actions}><button type="submit" className="primary-button" disabled={loading || saving || optimizing || (!editor.id && (data?.partners.length || 0) >= partnerLimits.count)}>{saving ? "Guardando…" : editor.id ? "Guardar cambios" : "Guardar logo"}</button>{editor.id ? <button type="button" className="portal-outline-button" disabled={saving} onClick={reset}>Cancelar edición</button> : null}</div>
    </form>
    {message ? <p className="save-confirmation" role="status">{message}</p> : null}
    <div className={styles.list}>
      {data?.partners.length === 0 ? <p className={styles.empty}>Aún no hay logos cargados. Sube los primeros para completar esta sección del home.</p> : null}
      {data?.partners.map((partner) => <article className={styles.item} key={partner.id}>
        {!partner.archived ? <div className={styles.thumbnail}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={partner.imageUrl} alt={partner.alt} width={100} height={54} loading="lazy" decoding="async" />
        </div> : <span className={styles.archivedIcon}>{partner.category === "company" ? <Building2 size={28} /> : <Scale size={28} />}</span>}
        <div className={styles.itemCopy}><h3>{partner.name}</h3><p>{partner.category === "company" ? "Empresa" : "Estudio jurídico"} · {partner.archived ? "Retirado" : partner.active ? "Visible en el home" : "Inactivo"} · Orden {partner.sortOrder}</p><small>{updatedDate(partner.updatedAt)} · @{partner.updatedBy} · Versión {partner.version}</small></div>
        <div className={styles.itemActions}><button type="button" className="portal-outline-button" disabled={saving || loading} onClick={() => edit(partner)}><Pencil size={15} /> {partner.archived ? "Reutilizar" : "Editar"}</button>{!partner.archived ? <button type="button" className="portal-outline-button" disabled={saving || loading} onClick={() => { void archive(partner); }}><Trash2 size={15} /> Retirar</button> : null}</div>
      </article>)}
    </div>
  </section>;
}
