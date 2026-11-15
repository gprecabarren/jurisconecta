"use client";

import { Suspense, useEffect, useState } from "react";
import { RegistrationForm } from "./registration-form";
import { PublishCaseFlow } from "./publish-case-flow";
import { LawyerOnboarding } from "./lawyer-onboarding";
import { CASE_CATALOG_SUMMARIES, type CaseCatalogSummary } from "../../shared/case-catalog-summary";
import type { AdminBillingResponse } from "../../shared/billing";
import { lawyerDraftFromProfile, type LawyerDraft } from "../../shared/lawyer-onboarding";

type PreviewTab = "client" | "case" | "lawyer";

export function AdminPreview() {
  const [tab, setTab] = useState<PreviewTab>("client");
  const [notice, setNotice] = useState("");
  const [lawyer, setLawyer] = useState<LawyerDraft | null>(null);
  function resetLawyer() { setLawyer(null); setNotice(""); }
  function select(next: PreviewTab) { setTab(next); resetLawyer(); }
  return <section className="portal-panel admin-preview" id="vista-previa">
    <div className="panel-title"><div><p className="eyebrow">Revisión visual sin datos reales</p><h2>Vista previa del recorrido</h2><p>Usa los mismos formularios que ve el público. Puedes dejar campos vacíos o incorrectos: verás advertencias, pero la demostración no crea cuentas ni publica casos.</p></div></div>
    <div className="admin-preview-tabs" role="tablist" aria-label="Vista previa de registros">
      <button type="button" role="tab" aria-selected={tab === "client"} className={tab === "client" ? "active" : ""} onClick={() => select("client")}>Registro cliente</button>
      <button type="button" role="tab" aria-selected={tab === "case"} className={tab === "case" ? "active" : ""} onClick={() => select("case")}>Pasos del caso</button>
      <button type="button" role="tab" aria-selected={tab === "lawyer"} className={tab === "lawyer" ? "active" : ""} onClick={() => select("lawyer")}>Registro abogado</button>
    </div>
    {notice && <p className="preview-banner" role="status">{notice}</p>}
    <div className="admin-preview-stage" role="tabpanel">
      {tab === "case" ? <PublishCaseFlow key="case" preview /> : tab === "lawyer" && lawyer ? <LawyerPreview initial={lawyer} onReset={resetLawyer} /> : <Suspense fallback={<p>Cargando formulario...</p>}><RegistrationForm key={tab} preview previewRole={tab === "lawyer" ? "lawyer" : "person"} onPreviewContinue={(role, issues, identity) => {
        setNotice(issues.length ? `Campos a corregir en un registro real: ${issues.join(", ")}.` : "Formulario válido en la demostración.");
        if (role === "person") setTab("case");
        else setLawyer({ ...lawyerDraftFromProfile(), ...identity });
      }} /></Suspense>}
    </div>
  </section>;
}

function LawyerPreview({ initial, onReset }: { initial: LawyerDraft; onReset: () => void }) {
  const [data, setData] = useState<{ billing: AdminBillingResponse | null; catalog: CaseCatalogSummary[] } | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal, cache: "no-store" } as const;
    void Promise.all([
      fetch("/api/admin/billing", options).then(async (response) => response.ok ? await response.json() as AdminBillingResponse : null).catch(() => null),
      fetch("/api/case-types?view=summary", options).then(async (response) => response.ok ? (await response.json() as { types: CaseCatalogSummary[] }).types : CASE_CATALOG_SUMMARIES).catch(() => CASE_CATALOG_SUMMARIES),
    ]).then(([billing, catalog]) => {
      if (!controller.signal.aborted) setData({ billing, catalog });
    });
    return () => controller.abort();
  }, []);
  if (!data) return <p role="status">Cargando etapas de postulación…</p>;
  return <>
    <p><label className="settings-toggle"><input type="checkbox" checked={emailVerified} onChange={(event) => setEmailVerified(event.target.checked)} /> Simular correo verificado con Google</label></p>
    {!data.billing && <p className="preview-banner" role="status">Los planes no se pudieron cargar. Puedes seguir probando las etapas.</p>}
    <LawyerOnboarding preview initial={initial} catalog={data.catalog} plans={data.billing?.plans || []} mode={data.billing?.config.mode || "free"} emailVerified={emailVerified} onReset={onReset} />
  </>;
}
