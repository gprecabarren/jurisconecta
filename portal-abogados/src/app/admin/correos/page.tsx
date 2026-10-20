import type { Metadata } from "next";
import AdminEmailTemplates from "../../../components/admin-email-templates";
import { PortalShell } from "../../../components/portal-shell";
import { privateMetadata } from "../../../lib/seo";

export const metadata: Metadata = {
  ...privateMetadata,
  title: "Correos y plantillas",
  description: "Administración privada de plantillas y borradores de comunicaciones de JurisConecta.",
};

export default function AdminEmailsPage() {
  return <PortalShell admin><div className="portal-page-heading"><div><p className="eyebrow">Comunicaciones</p><h1>Correos y plantillas</h1><p>Prepara mensajes para clientes y abogados, conserva borradores y revisa su diseño antes de publicarlos.</p></div></div><AdminEmailTemplates /></PortalShell>;
}
