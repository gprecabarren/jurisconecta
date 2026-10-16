"use client";

import { useEffect, useState } from "react";
import type { CaseType } from "../../shared/case-intake";
import { CASE_TYPE_SEED } from "../../shared/case-intake-seed";
import { CaseIntakeWizard } from "./case-intake-wizard";
import { IntakePreview } from "./case-intake-form";
import styles from "./case-intake-form.module.css";

/** Both the public route and the administrator use the same question renderer. */
export function PublishCaseFlow({ preview = false }: { preview?: boolean }) {
  return preview ? <CatalogPreview /> : <CaseIntakeWizard />;
}

function CatalogPreview() {
  const [types, setTypes] = useState<CaseType[]>(CASE_TYPE_SEED), [selectedId, setSelectedId] = useState(CASE_TYPE_SEED[0].id);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/case-types", { signal: controller.signal, cache: "no-store" }).then(async (response) => response.ok ? await response.json() as { types: CaseType[] } : null).then((result) => { if (result?.types.length) setTypes(result.types); }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  const selected = types.find((type) => type.id === selectedId) || types[0];
  return <div><label className={styles.field}>Tipo de caso a demostrar<select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>{types.map((type) => <option key={type.id} value={type.id}>{type.topic}{!type.enabled ? " (oculto)" : ""}</option>)}</select></label><p className={styles.description}>Esta demostración no crea cuentas ni casos. Para cambiar preguntas y verlas en vivo, abre “Tipos de casos y formularios”.</p><IntakePreview type={selected} /></div>;
}
