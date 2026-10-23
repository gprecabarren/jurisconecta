"use client";

import Link from "next/link";
import { ArrowRight, Baby, Banknote, BriefcaseBusiness, Building2, Car, CircleHelp, Dog, FileText, Fingerprint, Gavel, Globe, GraduationCap, HandCoins, HeartHandshake, House, KeyRound, Landmark, Laptop, Leaf, Network, Phone, Plane, Scale, ShieldCheck, ShoppingBag, Stethoscope, Users, UsersRound, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CASE_CATALOG_SUMMARIES, type CaseCatalogSummary } from "../../shared/case-catalog-summary";
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
  const filtered = useMemo(() => {
    const query = search.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return query ? activeTypes.filter((type) => `${type.topic} ${type.category}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(query)) : activeTypes;
  }, [search, activeTypes]);
  const visibleTypes = !expanded && !search ? filtered.slice(0, 18) : filtered;
  return <div className={styles.catalog}>
    {expanded || !compact ? <label className={styles.search}>Buscar un tipo de caso<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Por ejemplo: divorcio, herencia, inversión…" /></label> : null}
    <div className={styles.grid} aria-label="Tipos de casos legales" data-reveal>
      {visibleTypes.map((type) => {
        const content = <><span className={styles.icon}><CaseTypeIcon name={type.icon} /></span><span className={styles.cardText}>{type.topic}</span><ArrowRight size={14} className={styles.arrow} aria-hidden="true" /></>;
        return onChoose ? <button type="button" className={styles.card} key={type.id} disabled={!suppliedTypes} onClick={() => { const fullType = suppliedTypes?.find((item) => item.id === type.id); if (fullType) onChoose(fullType); }}>{content}</button> : <Link className={styles.card} key={type.id} href={`/solicitar/?tipo=${encodeURIComponent(type.id)}`}>{content}</Link>;
      })}
    </div>
    {!visibleTypes.length ? <p className={styles.empty}>No encontramos ese tipo de caso. Prueba con otra palabra.</p> : null}
    {!expanded && activeTypes.length > 18 ? <div className={styles.more}><button type="button" className="secondary-button" onClick={() => setExpanded(true)}>Ver más casos <span>({activeTypes.length - 18})</span><ArrowRight size={17} /></button></div> : null}
    {expanded && compact && !search ? <div className={styles.more}><button type="button" className="text-link" onClick={() => setExpanded(false)}>Mostrar menos</button></div> : null}
    {error ? <p className={styles.warning} role="status">{error}</p> : null}
  </div>;
}
