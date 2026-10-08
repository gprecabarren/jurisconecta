"use client";
/* eslint-disable @next/next/no-img-element -- Small first-party editorial images; no paid image service. */
import { FormEvent, useEffect, useRef, useState } from "react";
import { PortalShell } from "../../../components/portal-shell";

type Post = { id?: string; version?: number; title: string; slug: string; excerpt: string; content_html: string; cover_url: string; cover_alt: string; status: "draft" | "published" | "archived"; seo_title: string; meta_description: string; focus_keyword: string; canonical_url: string; og_title: string; og_description: string; noindex: boolean; author: string; updated_at?: string };
const empty = (): Post => ({ title: "", slug: "", excerpt: "", content_html: "<p>Escribe aquí tu guía.</p>", cover_url: "/og-jurisconecta.png", cover_alt: "", status: "draft", seo_title: "", meta_description: "", focus_keyword: "", canonical_url: "", og_title: "", og_description: "", noindex: false, author: "Equipo editorial de JurisConecta" });
const slugify = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export default function AdminNewsPage() {
  const [posts, setPosts] = useState<Post[]>([]), [post, setPost] = useState<Post>(empty), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [search, setSearch] = useState("");
  const editor = useRef<HTMLDivElement>(null), imageInput = useRef<HTMLInputElement>(null), coverInput = useRef<HTMLInputElement>(null), selection = useRef<Range | null>(null);
  async function load() { const response = await fetch("/api/admin/news"); const data = await response.json() as { posts?: Array<Omit<Post, "noindex"> & { noindex: number }>; error?: string }; if (!response.ok) throw new Error(data.error); setPosts((data.posts || []).map((p) => ({ ...p, noindex: p.noindex === 1 }))); }
  useEffect(() => { void Promise.resolve().then(load).catch((error) => setNotice(error instanceof Error ? error.message : "No pudimos cargar.")); }, []);
  function choose(value: Post) { setPost(value); setNotice(""); if (editor.current) editor.current.innerHTML = value.content_html; }
  function update<K extends keyof Post>(key: K, value: Post[K]) { setPost((previous) => ({ ...previous, [key]: value })); }
  function remember() { const current = window.getSelection(); if (current?.rangeCount && editor.current?.contains(current.anchorNode)) selection.current = current.getRangeAt(0).cloneRange(); }
  function command(name: string, value?: string) {
    editor.current?.focus();
    if (selection.current && editor.current?.contains(selection.current.commonAncestorContainer)) { const current = window.getSelection(); current?.removeAllRanges(); current?.addRange(selection.current); }
    document.execCommand(name, false, value); remember();
  }
  function link() { const url = window.prompt("URL del enlace (https://… o /ruta/)"); if (!url) return; if (!/^https:\/\//i.test(url) && !/^\/(?!\/)/.test(url)) { setNotice("Usa una URL HTTPS o una ruta de JurisConecta."); return; } command("createLink", url); }
  async function upload(file: File | undefined, cover: boolean) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setNotice("Selecciona JPEG, PNG o WebP de hasta 5 MB."); return; }
    const alt = window.prompt("Texto alternativo: describe lo que muestra la imagen", post.title) || "";
    if (!alt.trim()) { setNotice("La imagen necesita texto alternativo."); return; }
    setBusy(true); setNotice("");
    try {
      const bitmap = await createImageBitmap(file);
      let data = "";
      try {
        for (const width of [1200, 900, 640]) {
          const canvas = document.createElement("canvas"), ratio = Math.min(1, width / bitmap.width);
          canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
          const context = canvas.getContext("2d"); if (!context) throw new Error("No pudimos comprimir la imagen."); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          for (const quality of [0.8, 0.6, 0.4]) { data = canvas.toDataURL("image/webp", quality); if (data.length < 81_000) break; }
          if (data.length < 81_000) break;
        }
      } finally { bitmap.close(); }
      if (data.length >= 81_000) throw new Error("La imagen sigue siendo muy grande. Prueba con una más simple.");
      const response = await fetch("/api/admin/news/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, alt }) });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error);
      if (cover) setPost((p) => ({ ...p, cover_url: result.url!, cover_alt: alt }));
      else { const caption = window.prompt("Pie de foto (opcional)") || ""; command("insertHTML", `<figure><img src="${escape(result.url)}" alt="${escape(alt)}" />${caption ? `<figcaption>${escape(caption)}</figcaption>` : ""}</figure><p><br></p>`); }
      setNotice("Imagen comprimida y guardada. Guarda la noticia para publicarla.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Error al subir imagen."); }
    finally { setBusy(false); if (imageInput.current) imageInput.current.value = ""; if (coverInput.current) coverInput.current.value = ""; }
  }
  function proposeSeo() {
    const slug = post.slug || slugify(post.title), title = `${post.title} | JurisConecta`, description = post.excerpt.slice(0, 160);
    setPost((p) => ({ ...p, slug, seo_title: p.seo_title || title, meta_description: p.meta_description || description, focus_keyword: p.focus_keyword || p.title.toLowerCase(), canonical_url: `https://jurisconecta.cl/noticias/${slug}/`, og_title: p.og_title || title, og_description: p.og_description || description, cover_alt: p.cover_alt || p.title }));
    setNotice("Propuesta generada. Revisa la claridad de los textos antes de publicar.");
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const payload = { ...post, slug: post.slug || slugify(post.title), content_html: editor.current?.innerHTML || "" };
      const response = await fetch("/api/admin/news", { method: post.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string; id?: string; version?: number };
      if (!response.ok) throw new Error(data.error || "No pudimos guardar.");
      await load(); setPost((p) => ({ ...p, ...payload, id: data.id, version: data.version }));
      setNotice(post.status === "published" ? "Noticia publicada. La página y el sitemap ya están actualizados." : "Noticia guardada. Los borradores y archivados no se muestran al público.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Error de conexión."); } finally { setBusy(false); }
  }
  return <PortalShell admin><div className="portal-page-heading"><div><p className="eyebrow">Editor editorial</p><h1>Noticias y guías legales</h1><p>Edita contenido, imágenes y SEO. Publicación inmediata con bitácora y control de versiones.</p></div><a className="portal-outline-button" href="/noticias/" target="_blank">Ver noticias públicas</a></div><div className="news-admin-layout"><aside className="portal-panel news-post-list"><button className="portal-primary-button" type="button" onClick={() => choose(empty())}>Nueva noticia</button><label>Buscar noticia<input value={search} onChange={(e) => setSearch(e.target.value)} /></label>{posts.filter((p) => p.title.toLowerCase().includes(search.toLowerCase())).map((p) => <button className={post.id === p.id ? "news-list-item selected" : "news-list-item"} key={p.id} onClick={() => choose(p)}><span>{p.title}</span><small>{p.status === "published" ? "Publicada" : p.status === "archived" ? "Archivada" : "Borrador"}</small></button>)}</aside><form className="news-editor-form" onSubmit={save}><section className="portal-panel account-form"><label>Título<input value={post.title} onChange={(e) => update("title", e.target.value)} required minLength={10} maxLength={160} /></label><label>Slug (se conserva al guardar)<input value={post.slug} onChange={(e) => update("slug", slugify(e.target.value))} readOnly={Boolean(post.id)} placeholder="Se genera desde el título" maxLength={100} /></label><label>Resumen<textarea value={post.excerpt} onChange={(e) => update("excerpt", e.target.value)} required minLength={30} maxLength={320} rows={3} /></label><div className="news-toolbar" role="toolbar" aria-label="Formato del contenido">{[["Párrafo", "formatBlock", "p"], ["Negrita", "bold", ""], ["Cursiva", "italic", ""], ["Subrayado", "underline", ""], ["H2", "formatBlock", "h2"], ["H3", "formatBlock", "h3"], ["Cita", "formatBlock", "blockquote"], ["Lista", "insertUnorderedList", ""], ["Numerada", "insertOrderedList", ""]].map(([label, cmd, value]) => <button key={label} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => command(cmd, value)}>{label}</button>)}<button type="button" onMouseDown={(e) => e.preventDefault()} onClick={link}>Enlace</button><button type="button" onClick={() => imageInput.current?.click()} disabled={busy}>Imagen</button><button type="button" onClick={() => command("undo")}>Deshacer</button></div><div ref={editor} className="news-rich-editor" role="textbox" aria-label="Contenido de la noticia" aria-multiline="true" contentEditable suppressContentEditableWarning onKeyUp={remember} onMouseUp={remember} onPaste={(event) => { event.preventDefault(); document.execCommand("insertText", false, event.clipboardData.getData("text/plain")); }}><p>Escribe aquí tu guía.</p></div><input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void upload(e.target.files?.[0], false)} /></section><section className="portal-panel account-form"><h2>Publicación</h2><div className="form-grid two"><label>Estado<select value={post.status} onChange={(e) => update("status", e.target.value as Post["status"])}><option value="draft">Borrador</option><option value="published">Publicada</option><option value="archived">Archivada (retirar del público)</option></select></label><label>Autor<input value={post.author} onChange={(e) => update("author", e.target.value)} maxLength={120} required /></label></div><img className="news-editor-cover" src={post.cover_url} alt={post.cover_alt || "Vista previa de portada"} /><label>Texto alternativo de portada<input value={post.cover_alt} onChange={(e) => update("cover_alt", e.target.value)} maxLength={200} /></label><button type="button" className="portal-outline-button" disabled={busy} onClick={() => coverInput.current?.click()}>Subir portada (se comprime a 60 KB)</button><input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void upload(e.target.files?.[0], true)} /></section><section className="portal-panel account-form"><h2>SEO y redes sociales</h2><button type="button" className="portal-outline-button" onClick={proposeSeo}>Generar propuesta SEO</button><label>Título SEO <small>{post.seo_title.length}/100</small><input value={post.seo_title} onChange={(e) => update("seo_title", e.target.value)} maxLength={100} /></label><label>Metadescripción <small>{post.meta_description.length}/170</small><textarea value={post.meta_description} onChange={(e) => update("meta_description", e.target.value)} maxLength={170} /></label><label>Palabra clave objetivo<input value={post.focus_keyword} onChange={(e) => update("focus_keyword", e.target.value)} maxLength={100} /></label><label>URL canónica<input value={post.canonical_url} onChange={(e) => update("canonical_url", e.target.value)} placeholder={`https://jurisconecta.cl/noticias/${post.slug || "slug"}/`} maxLength={250} /></label><label>Título para compartir<input value={post.og_title} onChange={(e) => update("og_title", e.target.value)} maxLength={120} /></label><label>Descripción para compartir<textarea value={post.og_description} onChange={(e) => update("og_description", e.target.value)} maxLength={200} /></label><label className="terms-checkbox"><input type="checkbox" checked={post.noindex} onChange={(e) => update("noindex", e.target.checked)} /><span>No indexar esta noticia en buscadores</span></label><p>La vista pública incluye Article, ruta de navegación, fechas reales y enlaces relacionados. El posicionamiento depende también de la calidad, revisión editorial y competencia.</p></section><div className="news-editor-actions"><button className="portal-primary-button" disabled={busy}>{busy ? "Guardando..." : "Guardar noticia"}</button>{post.id && <a className="portal-outline-button" href={`/noticias/?preview=${post.id}`} target="_blank">Ver última versión guardada</a>}</div><p role="status" className="save-confirmation">{notice}</p></form></div></PortalShell>;
}
