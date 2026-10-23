"use client";

import Link from "next/link";
import { ArrowRight, Baby, Banknote, BriefcaseBusiness, Building2, Car, CircleHelp, Dog, FileText, Fingerprint, Gavel, Globe, GraduationCap, HandCoins, HeartHandshake, House, KeyRound, Landmark, Laptop, Leaf, Network, Phone, Plane, Scale, Search, ShieldCheck, ShoppingBag, Stethoscope, Users, UsersRound, Wallet, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CASE_CATALOG_SUMMARIES, type CaseCatalogSummary } from "../../shared/case-catalog-summary";
import { normalizeCaseSearch, searchCaseTypes } from "../../shared/case-search";
import styles from "./case-type-grid.module.css";

const icons = { Scale, Baby, Banknote, BriefcaseBusiness, Building2, Car, CircleHelp, Dog, FileText, Fingerprint, Gavel, Globe, GraduationCap, HandCoins, HeartHandshake, House, KeyRound, Landmark, Laptop, Leaf, Network, Phone, Plane, ShieldCheck, ShoppingBag, Stethoscope, Users, UsersRound, Wallet };

export function CaseTypeIcon({ name, size = 25 }: { name: string; size?: number }) {
  const Icon = icons[name as keyof typeof icons] || Scale;
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />;
}

export function CaseTypeGrid<T extends CaseCatalogSummary = CaseCatalogSummary>({ compact = true, onChoose, types: suppliedTypes }: { compact?: boolean; onChoose?: (type: T) => void; types?: T[] }) {
  const [types, setTypes] = useState<CaseCatalogSummary[]>(suppliedTypes || CASE_CATALOG_SUMMARIES);
  const [expanded, setExpanded] = useState(!compact), [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const searchId = useId(), resultsId = useId(), helpId = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (suppliedTypes) return;
    const controller = new AbortController();
    void fetch("/api/case-types?view=summary", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const result = await response.json() as { types?: CaseCatalogSummary[]; error?: string };
      if (!response.ok || !Array.isArray(result.types)) throw new Error(result.error || "No se pudo actualizar el catálogo.");
      setTypes(result.types);
    }).catch(() => { if (!controller.signal.aborted) setError("Mostramos el catálogo de referencia. La disponibilidad se comprobará al abrir tu solicitud."); });
    return () => controller.abort();
  }, [suppliedTypes]);
  const activeTypes = useMemo(() => (suppliedTypes || types).filter((type) => type.enabled).sort((a, b) => a.sortOrder - b.sortOrder || a.topic.localeCompare(b.topic, "es")), [suppliedTypes, types]);
  const hasSearch = normalizeCaseSearch(search).length > 0;
  const filtered = useMemo(() => searchCaseTypes(activeTypes, search), [search, activeTypes]);
  const visibleTypes = !expanded && !hasSearch ? filtered.slice(0, 18) : filtered;
  function clearSearch() { setSearch(""); searchInput.current?.focus(); }
  return <div className={styles.catalog}>
    <div className={styles.search} role="search" aria-label="Buscar en los tipos de casos">
      <label htmlFor={searchId}>Encuentra tu tipo de caso</label>
      <div className={styles.searchControl}><Search size={18} aria-hidden="true" /><input ref={searchInput} id={searchId} type="search" value={search} maxLength={120} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); if (event.key === "Escape" && search) { event.preventDefault(); clearSearch(); } }} placeholder="Ej.: golpes, arriendo, me despidieron…" aria-describedby={helpId} aria-controls={resultsId} autoComplete="off" spellCheck={false} />{search ? <button type="button" onClick={clearSearch} aria-label="Limpiar búsqueda"><X size={17} aria-hidden="true" /></button> : null}</div>
      <p id={helpId}>Escribe con tus palabras. Las coincidencias son orientativas; elige la que mejor se ajuste.</p>
      <p className={styles.resultCount} role="status" aria-live="polite" aria-atomic="true">{hasSearch ? `${filtered.length} ${filtered.length === 1 ? "tipo de caso encontrado" : "tipos de caso encontrados"}` : `${visibleTypes.length} tipos de caso disponibles${visibleTypes.length < activeTypes.length ? ` de ${activeTypes.length}` : ""}`}</p>
    </div>
    <div className={styles.grid} aria-label="Tipos de casos legales" id={resultsId} data-reveal={hasSearch ? undefined : true}>
      {visibleTypes.map((type) => {
        const content = <><span className={styles.icon}><CaseTypeIcon name={type.icon} /></span><span className={styles.cardText}>{type.topic}</span><ArrowRight size={14} className={styles.arrow} aria-hidden="true" /></>;
        return onChoose ? <button type="button" className={styles.card} key={type.id} disabled={!suppliedTypes} onClick={() => { const fullType = suppliedTypes?.find((item) => item.id === type.id); if (fullType) onChoose(fullType); }}>{content}</button> : <Link className={styles.card} key={type.id} href={`/solicitar/?tipo=${encodeURIComponent(type.id)}`}>{content}</Link>;
      })}
    </div>
    {!visibleTypes.length ? <div className={styles.empty}><p>No encontramos coincidencias. Prueba con otra palabra o revisa el catálogo completo.</p>{hasSearch ? <button type="button" className="secondary-button" onClick={() => { setExpanded(true); clearSearch(); }}>Ver todos los tipos de caso</button> : null}</div> : null}
    {!expanded && !hasSearch && activeTypes.length > 18 ? <div className={styles.more}><button type="button" className="secondary-button" onClick={() => setExpanded(true)}>Ver más casos <span>({activeTypes.length - 18})</span><ArrowRight size={17} /></button></div> : null}
    {expanded && compact && !hasSearch ? <div className={styles.more}><button type="button" className="text-link" onClick={() => setExpanded(false)}>Mostrar menos</button></div> : null}
    {error ? <p className={styles.warning} role="status">{error}</p> : null}
  </div>;
}
