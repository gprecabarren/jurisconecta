"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PortalShell } from "../../components/portal-shell";
import { LawyerOnboarding } from "../../components/lawyer-onboarding";
import type { LawyerBillingResponse } from "../../../shared/billing";
import { CASE_CATALOG_SUMMARIES, type CaseCatalogSummary } from "../../../shared/case-catalog-summary";
import { lawyerApplicationPayload, lawyerDraftFromProfile, type LawyerApplicationData, type LawyerDraft, type LawyerProfileData } from "../../../shared/lawyer-onboarding";

type LoadState = {
  profile: LawyerProfileData;
  application: LawyerApplicationData;
  billing: LawyerBillingResponse;
  catalog: CaseCatalogSummary[];
  googleAvailable: boolean;
  googleError: boolean;
};

export default function LawyerApplicationPage() {
  const [data, setData] = useState<LoadState | null>(null);
  const [error, setError] = useState("");
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal, cache: "no-store" } as const;
    async function load() {
      const [profileResponse, planResponse, catalog, google] = await Promise.all([
        fetch("/api/lawyer/profile", options),
        fetch("/api/lawyer/plans", options),
        fetch("/api/case-types?view=summary", options).then(async (response) => response.ok ? (await response.json() as { types: CaseCatalogSummary[] }).types : CASE_CATALOG_SUMMARIES).catch(() => CASE_CATALOG_SUMMARIES),
        fetch("/api/auth/providers", options).then(async (response) => response.ok && (await response.json() as { google?: boolean }).google === true).catch(() => false),
      ]);
      if (controller.signal.aborted) return;
      if (profileResponse.status === 401) {
        setRequiresLogin(true);
        return;
      }
      if (!profileResponse.ok || !planResponse.ok) throw new Error("No pudimos cargar la postulación o los planes. Recarga e inténtalo nuevamente.");
      const [profile, billing] = await Promise.all([
        profileResponse.json() as Promise<{ profile: LawyerProfileData; application: LawyerApplicationData }>,
        planResponse.json() as Promise<LawyerBillingResponse>,
      ]);
      if (!controller.signal.aborted) setData({ ...profile, billing, catalog, googleAvailable: google, googleError: new URLSearchParams(window.location.search).has("google_error") });
    }
    void load().catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pudimos cargar la postulación."); });
    return () => controller.abort();
  }, []);

  async function submit(draft: LawyerDraft) {
    const response = await fetch("/api/lawyer/application", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lawyerApplicationPayload(draft)),
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(problem.error || "No pudimos enviar la postulación.");
    }
    setJustSubmitted(true);
  }

  if (!data) return <PortalShell><h1>Postulación profesional</h1>{requiresLogin
    ? <p><Link className="portal-primary-button" href="/ingresar/">Iniciar sesión</Link></p>
    : <p className="client-loading" role="status">{error || "Cargando postulación…"}</p>}
  </PortalShell>;

  const { profile, application, billing, catalog, googleAvailable, googleError } = data;
  if (justSubmitted || profile.application_status === "submitted") return <PortalShell>
    <section className="portal-panel review-empty">
      <p className="eyebrow">En revisión</p>
      <h1>Recibimos tu postulación</h1>
      <p>El equipo se comunicará contigo para coordinar la revisión de los documentos originales por videollamada o presencialmente.</p>
      <Link className="portal-primary-button" href="/soporte/">Contactar soporte</Link>
    </section>
  </PortalShell>;
  if (profile.application_status === "approved") return <PortalShell>
    <section className="portal-panel review-empty">
      <h1>Perfil aprobado</h1><p>Ya puedes revisar casos y enviar propuestas.</p>
      <Link className="portal-primary-button" href="/casos/pool/">Ver casos</Link>
    </section>
  </PortalShell>;

  return <PortalShell>
    <div className="portal-page-heading"><div>
      <p className="eyebrow">Activación profesional</p>
      <h1>Postula como abogado/a</h1>
      <p>Completa tu perfil y envíalo al equipo de JurisConecta para su revisión.</p>
    </div></div>
    {profile.application_status === "changes_requested" && <p className="application-note">Se solicitaron cambios. {profile.application_review_note}</p>}
    <LawyerOnboarding initial={lawyerDraftFromProfile(profile, application)} catalog={catalog} plans={billing.plans} mode={billing.config.mode}
      emailVerified={Boolean(profile.email_verified_at)} googleAvailable={googleAvailable} googleError={googleError} onSubmit={submit} />
  </PortalShell>;
}
