"use client";
import { useEffect, useRef, useState } from "react";
import { ArchiveRestore, Bold, Eye, FileText, Heading2, Italic, Link2, List, Mail, Monitor, Pilcrow, Save, Search, ShieldCheck, Smartphone, Undo2, Redo2 } from "lucide-react";
import { EMAIL_SENDER_ADDRESS, EMAIL_TEMPLATE_DEFINITIONS, emailDefinition, emailTemplateLimits, type EmailTemplateContent, type EmailTemplatePreview, type EmailTemplateRecord, type EmailTemplateVersion } from "../../shared/email-templates";
import styles from "./admin-email-templates.module.css";

type ListResponse = { templates: EmailTemplateRecord[]; canPublish: boolean; deliveryEnabled: false; error?: string };
type ChangeResponse = { template: EmailTemplateRecord; warnings: string[]; error?: string };
type PreviewResponse = { preview: EmailTemplatePreview; document: string; error?: string };
const endpoint = "/api/admin/email-templates";
const audiences = { all: "Clientes y abogados", client: "Clientes", lawyer: "Abogados", admin: "Administradores" };
const date = (value: string | null) => value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(`${value.replace(" ", "T")}Z`)) : "Sin cambios guardados";
async function responseJson<T>(response: Response): Promise<T> { const value = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(value.error || "No se pudo completar la solicitud."); return value; }

export default function AdminEmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplateRecord[]>([]), [selected, setSelected] = useState<string>(EMAIL_TEMPLATE_DEFINITIONS[0].id);
  const [draft, setDraft] = useState<EmailTemplateContent | null>(null), [canPublish, setCanPublish] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""), [error, setError] = useState(""), [query, setQuery] = useState(""), [audience, setAudience] = useState("all-types");
  const [preview, setPreview] = useState<PreviewResponse | null>(null), [previewStale, setPreviewStale] = useState(false), [mobile, setMobile] = useState(false), [tab, setTab] = useState<"visual" | "html" | "text">("html");
  const visualRef = useRef<HTMLDivElement>(null), safeVisualHtml = useRef("");
  const [visualSeed, setVisualSeed] = useState("");
  const [versions, setVersions] = useState<EmailTemplateVersion[]>([]), [historyError, setHistoryError] = useState("");
  const record = templates.find((item) => item.id === selected), definition = emailDefinition(selected)!;
  const dirty = Boolean(record && draft && JSON.stringify(record.draft) !== JSON.stringify(draft));
  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(responseJson<ListResponse>).then((value) => { setTemplates(value.templates); setCanPublish(value.canPublish); setDraft(structuredClone(value.templates[0].draft)); }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "No se pudieron cargar las plantillas."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${endpoint}?id=${encodeURIComponent(selected)}`, { cache: "no-store", signal: controller.signal }).then(responseJson<{ versions: EmailTemplateVersion[] }>).then((value) => { setVersions(value.versions); setHistoryError(""); }).catch(() => { if (!controller.signal.aborted) setHistoryError("No se pudo cargar el historial. Las plantillas no se modificaron."); });
    return () => controller.abort();
  }, [selected, record?.revision]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (tab === "visual" && visualRef.current) {
      // Only the server-sanitized response is allowed into this live document.
      // Do not sync on each keystroke: that would reset the user's caret/selection.
      visualRef.current.innerHTML = visualSeed;
      safeVisualHtml.current = visualSeed;
    }
  }, [tab, visualSeed]);
  function choose(item: EmailTemplateRecord) {
    if (dirty && !window.confirm("Tienes cambios locales sin guardar. ¿Descartarlos y cambiar de plantilla?")) return;
    setSelected(item.id); setDraft(structuredClone(item.draft)); setTab("html"); setPreview(null); setVersions([]); setMessage(""); setError("");
  }
  function patch(change: Partial<EmailTemplateContent>) { setDraft((current) => current ? { ...current, ...change } : null); setPreviewStale(true); }
  async function enterVisual() {
    if (!draft || tab === "visual") return;
    setBusy(true); setError("");
    try {
      const value = await responseJson<{ content: EmailTemplateContent; warnings: string[] }>(await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sanitize", id: selected, content: draft }) }));
      setDraft(value.content); setVisualSeed(value.content.html); setTab("visual");
      setMessage(value.warnings.length ? value.warnings.join(" ") : "Editor visual listo. Puedes escribir y dar formato directamente en la plantilla; guarda el borrador para conservar los cambios.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo abrir el editor seguro."); }
    finally { setBusy(false); }
  }
  function syncVisual() {
    const editor = visualRef.current;
    if (!editor) return;
    if (editor.innerHTML.length > emailTemplateLimits.html) { editor.innerHTML = safeVisualHtml.current; setError("Alcanzaste el límite de contenido HTML. El último cambio no se aplicó."); return; }
    safeVisualHtml.current = editor.innerHTML;
    patch({ html: editor.innerHTML });
  }
  function visualCommand(command: string, value?: string) {
    const editor = visualRef.current;
    if (!editor || busy) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection?.anchorNode || !editor.contains(selection.anchorNode)) {
      const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false); selection?.removeAllRanges(); selection?.addRange(range);
    }
    // Browser editing is contained in sanitized markup; clipboard/drop HTML are blocked below.
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, value);
    syncVisual();
  }
  function insertVariable(variable: string) { if (tab === "visual") visualCommand("insertText", `{{${variable}}}`); else if (draft) patch({ [tab]: `${draft[tab]}{{${variable}}}` }); }
  function insertLink() {
    const value = window.prompt("Enlace seguro: usa {{action_url}} o una URL https://jurisconecta.cl/", "{{action_url}}");
    if (!value) return;
    let valid = value === "{{action_url}}";
    try { const url = new URL(value); valid ||= url.origin === "https://jurisconecta.cl" && !url.username && !url.password && !url.pathname.startsWith("//") && !/[\r\n\x00-\x1f]/.test(value); } catch { /* A template variable is not a complete URL. */ }
    if (!valid) { setError("El enlace debe ser {{action_url}} o pertenecer a https://jurisconecta.cl."); return; }
    visualCommand("createLink", value);
  }
  async function showPreview(content = draft) {
    if (!content) return;
    setBusy(true); setError(""); setMessage("");
    try { const value = await responseJson<PreviewResponse>(await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", id: selected, content }) })); setPreview(value); setPreviewStale(false); setMessage("Prueba visual con datos ficticios. No se envió ningún correo ni se generó ningún enlace de recuperación."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo generar la vista previa."); }
    finally { setBusy(false); }
  }
  async function save(action: "save_draft" | "publish" | "reset_draft") {
    if (!record || !draft) return;
    if (action === "publish" && !window.confirm("¿Publicar la versión guardada de esta plantilla? Se conservará el historial. Esto NO activa envíos ni conecta todavía el evento con el correo.")) return;
    if (action === "reset_draft" && !window.confirm("¿Restaurar el borrador desde la versión publicada o desde el ejemplo inicial? Se conservarán las versiones anteriores.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const value = await responseJson<ChangeResponse>(await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: selected, expectedRevision: record.revision, content: draft, confirmPublish: action === "publish" }) }));
      setTemplates((current) => current.map((item) => item.id === selected ? value.template : item)); setDraft(structuredClone(value.template.draft));
      if (tab === "visual") setVisualSeed(value.template.draft.html);
      setPreview(null);
      setMessage(`${action === "publish" ? "Plantilla publicada" : action === "reset_draft" ? "Borrador restaurado" : "Borrador guardado"}. Revisión ${value.template.revision}. Los envíos permanecen desactivados.${value.warnings.length ? ` ${value.warnings.join(" ")}` : ""}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la plantilla."); }
    finally { setBusy(false); }
  }
  const filtered = EMAIL_TEMPLATE_DEFINITIONS.filter((item) => (audience === "all-types" || item.audience === audience) && `${item.title} ${item.description} ${item.id}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es")));
  return <section id="comunicaciones" className={`portal-card ${styles.section}`} aria-labelledby="email-templates-title">
    <div className={styles.heading}><div><p className="eyebrow">Comunicaciones</p><h2 id="email-templates-title">Correos y plantillas</h2></div><span className={styles.badge}><ShieldCheck size={16} /> Solo pruebas, sin envío</span></div>
    <p className={styles.description}>Edita asuntos, diseño HTML, texto alternativo y datos de respuesta. Cada evento tiene un borrador independiente de su versión publicada y un historial privado. Publicar una plantilla no activa su automatización: todavía no hay proveedor de envío ni recuperación por correo conectados.</p>
    <div className={styles.notice}><Mail size={19} /><div>Se incluyen 12 ejemplos para clientes, abogados, soporte y seguridad. Todas las pruebas usan datos ficticios. No se han enviado correos y no se ha contratado ningún servicio. Las notificaciones internas del sitio siguen siendo independientes.</div></div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}{message ? <p className={styles.message} role="status">{message}</p> : null}
    {loading ? <p aria-live="polite">Cargando plantillas privadas…</p> : <div className={styles.layout}>
      <aside className={styles.listPanel}><label className={styles.label}><span><Search size={14} /> Buscar plantilla</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ticket, contraseña, bienvenida…" /></label><label className={styles.label}>Destinatarios<select value={audience} onChange={(event) => setAudience(event.target.value)}><option value="all-types">Todos los tipos</option>{Object.entries(audiences).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
        <nav className={styles.list} aria-label="Plantillas de correo">{filtered.map((item) => { const stored = templates.find((template) => template.id === item.id); return <button key={item.id} type="button" className={item.id === selected ? styles.selected : ""} disabled={busy || !stored} onClick={() => { if (stored) choose(stored); }} aria-current={item.id === selected ? "true" : undefined}><Mail size={17} /><span>{item.title}<small>{audiences[item.audience]} · {stored?.published ? `Publicada r${stored.publishedRevision}` : "Ejemplo sin publicar"}</small></span></button>; })}</nav>
        {!filtered.length ? <p className={styles.small}>No hay plantillas con esos filtros.</p> : null}
      </aside>
      <div className={styles.editor}>{record && draft ? <>
        <div className={styles.heading}><div><h3>{definition.title}</h3><p className={styles.small}>{definition.description}</p></div><span className={styles.small}>Borrador r{record.revision} · {record.published ? `Publicada r${record.publishedRevision}` : "No publicada"}</span></div>
        <p className={styles.small}>Último cambio: {date(record.updatedAt)}{record.updatedBy ? ` · @${record.updatedBy}` : ""}{record.publishedAt ? ` · Publicación: ${date(record.publishedAt)} por @${record.publishedBy}` : ""}</p>
        <fieldset disabled={busy} className={styles.fields}>
          <label className={styles.label}>Nombre del remitente<input value={draft.senderName} maxLength={emailTemplateLimits.senderName} onChange={(event) => patch({ senderName: event.target.value })} /></label>
          <label className={styles.label}>Dirección remitente (pendiente de proveedor)<input value={EMAIL_SENDER_ADDRESS} readOnly /><small>No se puede suplantar otra cuenta. El dominio empresarial requiere configuración y verificación antes de enviar.</small></label>
          <label className={styles.label}>Responder a<input type="email" value={draft.replyTo} maxLength={emailTemplateLimits.replyTo} onChange={(event) => patch({ replyTo: event.target.value })} /><small>Solo Gmail de JurisConecta o direcciones @jurisconecta.cl; el buzón debe configurarse antes del uso real.</small></label>
          <label className={`${styles.label} ${styles.full}`}>Asunto<input value={draft.subject} maxLength={emailTemplateLimits.subject} onChange={(event) => patch({ subject: event.target.value })} /></label>
          <div className={styles.full}><p className={styles.small}>Variables permitidas. Pulsa una para insertarla en la selección del editor visual o al final del código/texto:</p><div className={styles.variables}>{definition.variables.map((variable) => <button type="button" key={variable} onMouseDown={(event) => { if (tab === "visual") event.preventDefault(); }} onClick={() => insertVariable(variable)}>{`{{${variable}}}`}</button>)}</div><p className={styles.small}>Los valores se escapan automáticamente. Los enlaces solo pueden apuntar a https://jurisconecta.cl. No incluyas documentos, credenciales ni detalles sensibles de casos.</p></div>
          <div className={`${styles.tabs} ${styles.full}`} role="group" aria-label="Contenido a editar"><button type="button" aria-pressed={tab === "visual"} onClick={() => void enterVisual()}><Eye size={15} /> Editor visual</button><button type="button" aria-pressed={tab === "html"} onClick={() => setTab("html")}>HTML avanzado</button><button type="button" aria-pressed={tab === "text"} onClick={() => setTab("text")}><FileText size={15} /> Texto alternativo</button></div>
          {tab === "visual" ? <div className={styles.full}><div className={styles.toolbar} role="toolbar" aria-label="Formato del correo" onMouseDown={(event) => event.preventDefault()}><button type="button" title="Negrita" aria-label="Negrita" onClick={() => visualCommand("bold")}><Bold size={17} /></button><button type="button" title="Cursiva" aria-label="Cursiva" onClick={() => visualCommand("italic")}><Italic size={17} /></button><button type="button" title="Título" aria-label="Título" onClick={() => visualCommand("formatBlock", "h2")}><Heading2 size={17} /></button><button type="button" title="Párrafo" aria-label="Párrafo" onClick={() => visualCommand("formatBlock", "p")}><Pilcrow size={17} /></button><button type="button" title="Lista" aria-label="Lista" onClick={() => visualCommand("insertUnorderedList")}><List size={17} /></button><button type="button" title="Insertar enlace seguro" aria-label="Insertar enlace seguro" onClick={insertLink}><Link2 size={17} /></button><button type="button" title="Deshacer" aria-label="Deshacer" onClick={() => visualCommand("undo")}><Undo2 size={17} /></button><button type="button" title="Rehacer" aria-label="Rehacer" onClick={() => visualCommand("redo")}><Redo2 size={17} /></button></div><div ref={visualRef} contentEditable={!busy} suppressContentEditableWarning role="textbox" aria-label="Cuerpo del correo, editor visual" aria-multiline="true" className={styles.visualEditor} onInput={syncVisual} onPaste={(event) => { event.preventDefault(); visualCommand("insertText", event.clipboardData.getData("text/plain").slice(0, emailTemplateLimits.html)); }} onDrop={(event) => event.preventDefault()} /><p className={styles.small}>Escribe y cambia el formato directamente. Al pegar se conserva solo texto plano. Para editar colores, bordes o estructura completa usa HTML avanzado. La vista previa final se prueba aparte y el texto alternativo se edita por separado.</p></div> : tab === "html" ? <label className={`${styles.label} ${styles.full}`}>Contenido HTML editable<textarea className={styles.code} rows={18} spellCheck={false} value={draft.html} maxLength={emailTemplateLimits.html} onChange={(event) => patch({ html: event.target.value })} /><small>Admite tablas, bloques, títulos, colores, tipografías y estilos inline seguros. Por seguridad no admite scripts, formularios, imágenes externas/píxeles ni CSS que cargue recursos.</small></label> : <label className={`${styles.label} ${styles.full}`}>Versión de texto sin formato<textarea rows={15} value={draft.text} maxLength={emailTemplateLimits.text} onChange={(event) => patch({ text: event.target.value })} /><small>Incluye la misma información útil para lectores de pantalla y clientes de correo sin HTML.</small></label>}
        </fieldset>
        <div className={styles.actions}><button type="button" className="secondary-button" disabled={busy} onClick={() => void showPreview()}><Eye size={16} /> Probar sin enviar</button><button type="button" className="portal-primary-button" disabled={busy || !dirty} onClick={() => void save("save_draft")}><Save size={16} /> Guardar borrador</button><button type="button" className="secondary-button" disabled={busy || dirty || !canPublish || record.revision === 0 || record.publishedRevision === record.revision} onClick={() => void save("publish")}>Publicar plantilla guardada</button><button type="button" className="text-link" disabled={busy} onClick={() => void save("reset_draft")}><ArchiveRestore size={15} /> Restaurar borrador</button></div>
        <p className={styles.small}>{dirty ? "Hay cambios locales sin guardar. Guarda el borrador antes de publicar." : "El borrador guardado no reemplaza una versión publicada hasta confirmarlo."} {!canPublish ? "Solo el propietario puede publicar; los administradores pueden editar borradores." : "Solo el propietario publica; cada cambio queda auditado."}</p>
        {record.published ? <button type="button" className="text-link" disabled={busy} onClick={() => void showPreview(record.published!)}>Ver la versión publicada, sin enviar</button> : null}
        {preview ? <section className={styles.preview} aria-labelledby="email-preview-title"><div className={styles.heading}><h4 id="email-preview-title">Prueba con datos ficticios</h4><div className={styles.tabs} role="group" aria-label="Tamaño de vista previa"><button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}><Monitor size={16} /> Escritorio</button><button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}><Smartphone size={16} /> Móvil</button></div></div>{previewStale ? <p className={styles.notice}>La vista previa es anterior a tus últimos cambios. Pulsa «Probar sin enviar» para actualizarla.</p> : null}<p className={styles.small}>De: {preview.preview.senderName} &lt;{EMAIL_SENDER_ADDRESS}&gt; · Responder a: {preview.preview.replyTo}</p><p><strong>Asunto:</strong> {preview.preview.subject || "(vacío)"}</p>{preview.preview.warnings.map((warning) => <p className={styles.small} key={warning}>{warning}</p>)}<div className={styles.frameWrap}><iframe className={mobile ? styles.mobileFrame : styles.desktopFrame} title="Vista previa aislada del correo, sin envío" sandbox="" referrerPolicy="no-referrer" srcDoc={preview.document} /></div><details className={styles.textPreview}><summary>Ver texto alternativo</summary><pre>{preview.preview.text}</pre></details></section> : null}
        <details className={styles.history}><summary>Historial privado · últimas 20 revisiones</summary>{historyError ? <p className={styles.small}>{historyError}</p> : null}{versions.length ? <ol>{versions.map((version) => <li key={version.revision}><span>r{version.revision} · {version.action === "publish" ? "Publicación" : version.action === "reset_draft" ? "Restauración de borrador" : "Borrador"}<small>{date(version.createdAt)} · @{version.createdBy}</small></span><button type="button" className="text-link" disabled={busy} onClick={() => { if (!dirty || window.confirm("¿Reemplazar tus cambios locales por esta versión histórica? Aún deberás guardar el borrador.")) { setDraft(structuredClone(version.content)); setTab("html"); setPreview(null); setMessage("Versión histórica cargada localmente. Guarda el borrador si quieres conservarla."); } }}>Cargar como borrador local</button></li>)}</ol> : <p className={styles.small}>Todavía no hay revisiones guardadas para este evento.</p>}</details>
      </> : <p className={styles.small}>No se cargaron las plantillas. Actualiza la página para volver a intentar.</p>}</div>
    </div>}
  </section>;
}
