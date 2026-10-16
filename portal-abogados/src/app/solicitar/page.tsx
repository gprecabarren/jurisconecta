import type { Metadata } from "next";
import { CaseIntakeWizard } from "../../components/case-intake-wizard";

export const metadata: Metadata = { title: "Cuéntanos tu caso", description: "Completa tu solicitud legal y crea tu cuenta al final para publicarla de forma segura.", robots: { index: false, follow: false, nocache: true } };

export default function SolicitarPage() { return <CaseIntakeWizard />; }
