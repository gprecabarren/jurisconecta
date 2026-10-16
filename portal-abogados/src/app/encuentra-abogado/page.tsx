import { CaseIntakeWizard } from "../../components/case-intake-wizard";
import { publicMetadata } from "../../lib/seo";

export const metadata = publicMetadata("Comienza tu solicitud legal", "Elige tu tipo de caso, completa sus preguntas y crea tu cuenta al final.", "/encuentra-abogado/", false);
export default function EncuentraAbogadoPage() { return <CaseIntakeWizard />; }
