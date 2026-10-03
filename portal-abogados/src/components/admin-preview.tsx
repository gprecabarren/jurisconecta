"use client";

import { Suspense, useState } from "react";
import { RegistrationForm } from "./registration-form";
import { PublishCaseFlow } from "./publish-case-flow";

type PreviewTab = "client" | "case" | "lawyer";

export function AdminPreview() {
  const [tab, setTab] = useState<PreviewTab>("client");
  const [notice, setNotice] = useState("");
  function select(next: PreviewTab) { setTab(next); setNotice(""); }
  return <section className="portal-panel admin-preview" id="vista-previa">
    <div className="panel-title"><div><p className="eyebrow">Revisión visual sin datos reales</p><h2>Vista previa del recorrido</h2><p>Usa los mismos formularios que ve el público. Puedes dejar campos vacíos o incorrectos: verás advertencias, pero la demostración no crea cuentas ni publica casos.</p></div></div>
    <div className="admin-preview-tabs" role="tablist" aria-label="Vista previa de registros">
      <button type="button" role="tab" aria-selected={tab === "client"} className={tab === "client" ? "active" : ""} onClick={() => select("client")}>Registro cliente</button>
      <button type="button" role="tab" aria-selected={tab === "case"} className={tab === "case" ? "active" : ""} onClick={() => select("case")}>Pasos del caso</button>
      <button type="button" role="tab" aria-selected={tab === "lawyer"} className={tab === "lawyer" ? "active" : ""} onClick={() => select("lawyer")}>Registro abogado</button>
    </div>
    {notice && <p className="preview-banner" role="status">{notice}</p>}
    <div className="admin-preview-stage" role="tabpanel">
      {tab === "case" ? <PublishCaseFlow key="case" preview /> : <Suspense fallback={<p>Cargando formulario...</p>}><RegistrationForm key={tab} preview previewRole={tab === "lawyer" ? "lawyer" : "person"} onPreviewContinue={(role, issues) => {
        setNotice(issues.length ? `Campos a corregir en un registro real: ${issues.join(", ")}. No se guardó nada.` : "Formulario válido en la demostración. No se guardó nada.");
        if (role === "person") setTab("case");
      }} /></Suspense>}
    </div>
  </section>;
}
