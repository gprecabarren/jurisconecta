"use client";

import { RefreshCw, Settings2, ShieldCheck, WalletCards } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AdminBillingResponse, AdminBillingUpdate, AdminCreditAdjustment, BillingConfig, BillingPlan } from "../../shared/billing";
import { BillingLedger, billingDate } from "./billing-ledger";
import styles from "./billing.module.css";

type Target = NonNullable<AdminBillingResponse["target"]>;
type ConfigDraft = Omit<BillingConfig, "version" | "updatedAt" | "periodDays" | "defaultCaseCreditCost" | "maxBalance"> & { periodDays: string; defaultCaseCreditCost: string; maxBalance: string };
type PlanDraft = Omit<BillingPlan, "monthly_credits" | "monthly_price_clp" | "monthly_price_uf" | "extra_credit_price_clp" | "sort_order" | "benefits"> & { monthly_credits: string; monthly_price_clp: string; monthly_price_uf: string; extra_credit_price_clp: string; sort_order: string; benefitsText: string };
type Draft = { config: ConfigDraft; plans: PlanDraft[] };

function createDraft(data: AdminBillingResponse): Draft {
  const { version: _version, updatedAt: _updatedAt, ...config } = data.config;
  void _version; void _updatedAt;
  return {
    config: { ...config, periodDays: String(config.periodDays), defaultCaseCreditCost: String(config.defaultCaseCreditCost), maxBalance: String(config.maxBalance) },
    plans: data.plans.map(({ benefits, ...plan }) => ({ ...plan, monthly_credits: String(plan.monthly_credits), monthly_price_clp: String(plan.monthly_price_clp), monthly_price_uf: String(plan.monthly_price_uf), extra_credit_price_clp: String(plan.extra_credit_price_clp), sort_order: String(plan.sort_order), benefitsText: benefits.join("\n") })),
  };
}

function toUpdate(draft: Draft, version: number, confirmModeChange: boolean): AdminBillingUpdate {
  return {
    expectedVersion: version,
    confirmModeChange,
    config: { ...draft.config, periodDays: Number(draft.config.periodDays), defaultCaseCreditCost: Number(draft.config.defaultCaseCreditCost), maxBalance: Number(draft.config.maxBalance), preserveReserveOnCancel: true },
    plans: draft.plans.map(({ benefitsText, ...plan }) => ({ ...plan, monthly_credits: Number(plan.monthly_credits), monthly_price_clp: Number(plan.monthly_price_clp), monthly_price_uf: Number(plan.monthly_price_uf), extra_credit_price_clp: Number(plan.extra_credit_price_clp), sort_order: Number(plan.sort_order), benefits: benefitsText.split("\n").map((line) => line.trim()).filter(Boolean) })),
  };
}

export function AdminBilling() {
  const [data, setData] = useState<AdminBillingResponse | null>(null), [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [modeConfirmed, setModeConfirmed] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [userId, setUserId] = useState(""), [target, setTarget] = useState<Target | null>(null), [targetLoading, setTargetLoading] = useState(false);
  const [delta, setDelta] = useState(""), [note, setNote] = useState(""), [adjustConfirmed, setAdjustConfirmed] = useState(false);
  const operationBusy = useRef(false), requestKeys = useRef(new Map<string, { key: string; version: number }>());

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/billing", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const result = await response.json() as AdminBillingResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || "No pudimos cargar la configuración de planes.");
      setData(result); setDraft(createDraft(result));
    }).catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Error de conexión."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function reload() {
    if (operationBusy.current) return;
    if (data && draft && JSON.stringify(draft) !== JSON.stringify(createDraft(data)) && !window.confirm("Hay cambios sin guardar en el catálogo. ¿Descartarlos y cargar la configuración del servidor?")) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/billing", { cache: "no-store" });
      const result = await response.json() as AdminBillingResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || "No pudimos actualizar la configuración.");
      setData(result); setDraft(createDraft(result)); setModeConfirmed(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Error de conexión."); }
    finally { setLoading(false); }
  }

  function changeConfig<K extends keyof ConfigDraft>(key: K, value: ConfigDraft[K]) {
    setDraft((previous) => previous ? { ...previous, config: { ...previous.config, [key]: value } } : previous);
    if (key === "mode") setModeConfirmed(false);
  }
  function changePlan<K extends keyof PlanDraft>(index: number, key: K, value: PlanDraft[K]) {
    setDraft((previous) => previous ? { ...previous, plans: previous.plans.map((plan, position) => position === index ? { ...plan, [key]: value } : plan) } : previous);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!data?.canManage || !draft || operationBusy.current) return;
    setError(""); setNotice("");
    const body = toUpdate(draft, data.config.version, modeConfirmed);
    if (body.plans.some((plan) => plan.benefits.length > 8 || plan.benefits.some((benefit) => benefit.length > 180))) { setError("Cada plan admite hasta 8 beneficios de máximo 180 caracteres. Escribe un beneficio por línea."); return; }
    if (body.plans.some((plan) => plan.monthly_credits > body.config.maxBalance)) { setError("Los créditos de un plan no pueden superar el saldo máximo configurado."); return; }
    if (new Set(body.plans.map((plan) => plan.name.trim().toLocaleLowerCase("es-CL"))).size !== body.plans.length) { setError("Cada plan debe tener un nombre distinto."); return; }
    if (!body.plans.some((plan) => plan.active)) { setError("Debe mantenerse al menos un plan activo."); return; }
    if (body.plans.filter((plan) => plan.featured).length > 1 || body.plans.some((plan) => plan.featured && !plan.active)) { setError("Solo un plan activo puede marcarse como destacado."); return; }
    if (draft.config.mode !== data.config.mode && !modeConfirmed) { setError("Confirma expresamente el cambio entre modo gratis y modo de pago preparado."); return; }
    operationBusy.current = true; setBusy(true);
    try {
      const response = await fetch("/api/admin/billing", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as AdminBillingResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || "No pudimos guardar los parámetros. Actualiza si otro administrador los cambió.");
      setData(result); setDraft(createDraft(result)); setModeConfirmed(false);
      setNotice("Parámetros guardados y cambio registrado en la bitácora. No se conectó una pasarela ni se generaron cobros.");
      window.dispatchEvent(new Event("juris:billing-updated"));
    } catch (err) { setError(err instanceof Error ? err.message : "Error de conexión. Revisa la configuración del servidor antes de reintentar."); }
    finally { operationBusy.current = false; setBusy(false); }
  }

  async function findTarget(event: FormEvent) {
    event.preventDefault();
    if (!userId.trim() || operationBusy.current || targetLoading) return;
    setTargetLoading(true); setError(""); setNotice(""); setTarget(null); setAdjustConfirmed(false);
    try {
      const response = await fetch(`/api/admin/billing?userId=${encodeURIComponent(userId.trim())}`, { cache: "no-store" });
      const result = await response.json() as AdminBillingResponse & { error?: string };
      if (!response.ok || !result.target) throw new Error(result.error || "No encontramos una cuenta profesional con ese ID.");
      setTarget(result.target);
    } catch (err) { setError(err instanceof Error ? err.message : "No pudimos buscar la cuenta."); }
    finally { setTargetLoading(false); }
  }

  async function adjust(event: FormEvent) {
    event.preventDefault();
    if (!data?.canManage || !target || !adjustConfirmed || operationBusy.current) return;
    const amount = Number(delta);
    if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 10000) { setError("El ajuste debe ser un entero entre -10.000 y 10.000, distinto de cero."); return; }
    const reason = note.trim();
    if (reason.length < 10 || reason.length > 300) { setError("Escribe un motivo de entre 10 y 300 caracteres para la bitácora."); return; }
    const payload = { userId: target.userId, delta: amount, note: reason };
    const signature = JSON.stringify(payload);
    let attempt = requestKeys.current.get(signature);
    // An unresolved attempt may already have changed the balance. Let the server
    // replay it before validating a hypothetical second adjustment against it.
    if (!attempt && target.profile.reserve_credit_balance + amount < 0) { setError("El ajuste no puede dejar la reserva en negativo."); return; }
    if (!attempt && target.profile.credit_balance + amount > data.config.maxBalance) { setError("El ajuste supera el límite de saldo configurado."); return; }
    operationBusy.current = true; setBusy(true); setError(""); setNotice("");
    if (!attempt) { attempt = { key: crypto.randomUUID(), version: target.profile.billing_version }; requestKeys.current.set(signature, attempt); }
    try {
      const body: AdminCreditAdjustment = { ...payload, expectedVersion: attempt.version, action: "adjust_reserve", idempotencyKey: attempt.key, confirm: true };
      const response = await fetch("/api/admin/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as AdminBillingResponse & { error?: string; replayed?: boolean };
      if (!response.ok) {
        if (response.status < 500) requestKeys.current.delete(signature);
        throw new Error(result.error || "No pudimos ajustar la reserva. Actualiza la cuenta si su saldo cambió.");
      }
      requestKeys.current.delete(signature);
      if (result.target) setTarget(result.target);
      setDelta(""); setNote(""); setAdjustConfirmed(false);
      setNotice(result.replayed ? "El ajuste ya estaba registrado. No se duplicó." : "Reserva ajustada. El movimiento y el administrador responsable quedaron registrados.");
      window.dispatchEvent(new Event("juris:billing-updated"));
    } catch (err) { setError(err instanceof Error ? err.message : "Error de conexión. Reintenta el mismo ajuste; no se duplicará."); }
    finally { operationBusy.current = false; setBusy(false); }
  }

  const readOnly = !data?.canManage || busy || loading;
  const modeChanged = !!data && !!draft && draft.config.mode !== data.config.mode;

  return <section className={`portal-panel admin-panel ${styles.section}`} id="planes-creditos">
    <div className={styles.heading}><div><p className="eyebrow">Catálogo y saldos</p><h2><WalletCards size={23} aria-hidden="true" /> Planes y créditos</h2></div><button type="button" className={styles.secondary} disabled={busy || loading} onClick={() => void reload()}><RefreshCw size={16} aria-hidden="true" /> Actualizar</button></div>
    <p className={styles.intro}>Configura los tres planes y las reglas de créditos. Solo el propietario puede guardar parámetros o ajustar reservas. Cada movimiento queda trazado; los precios no conectan ni activan cobros.</p>
    {loading ? <p className={styles.loading} role="status">Cargando configuración…</p> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}{notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    {data && draft ? <>
      <div className={`${styles.mode}${data.config.mode === "paid" ? ` ${styles.paid}` : ""}`}><ShieldCheck size={22} aria-hidden="true" /><p><strong>{data.config.mode === "free" ? "Modo gratis activo" : "Modo de pago preparado activo · Sin pasarela"}</strong>El modo de pago solo prepara el catálogo: bloquea las compras, las renovaciones y los nuevos desbloqueos de contacto hasta integrar una pasarela. Conserva los saldos anteriores y los contactos ya accedidos. No solicita tarjetas ni genera cobros.</p></div>
      {!data.canManage ? <p className={styles.helper}>Tienes acceso de lectura. El propietario es quien puede modificar estos parámetros.</p> : null}
      <p className={styles.helper}>Configuración v{data.config.version} · Última actualización: {billingDate(data.config.updatedAt)}. Los cambios de créditos y duración se aplican en las próximas operaciones; no son una recarga retroactiva de cuentas.</p>
      <form onSubmit={save}>
        <fieldset disabled={readOnly} className={styles.panel}><legend><Settings2 size={16} aria-hidden="true" /> Reglas generales</legend>
          <div className={styles.formGrid}>
            <label className={styles.field}>Modo del sitio<select value={draft.config.mode} onChange={(event) => changeConfig("mode", event.target.value === "paid" ? "paid" : "free")}><option value="free">Gratis — pruebas sin cobros</option><option value="paid">Pago preparado — pasarela no conectada</option></select></label>
            <label className={styles.field}>Duración de cada período (días)<input required type="number" min={1} max={365} step={1} value={draft.config.periodDays} onChange={(event) => changeConfig("periodDays", event.target.value)} /></label>
            <label className={styles.field}>Costo predeterminado por caso (créditos)<input required type="number" min={0} max={10000} step={1} value={draft.config.defaultCaseCreditCost} onChange={(event) => changeConfig("defaultCaseCreditCost", event.target.value)} /><small>Valor inicial para casos nuevos. El precio específico se revisa antes de acceder.</small></label>
            <label className={styles.field}>Saldo máximo total por cuenta<input required type="number" min={1} max={1000000} step={1} value={draft.config.maxBalance} onChange={(event) => changeConfig("maxBalance", event.target.value)} /></label>
          </div>
          <label className={styles.checkbox}><input type="checkbox" checked={draft.config.rolloverOnChange} onChange={(event) => changeConfig("rolloverOnChange", event.target.checked)} />Al cambiar de plan, pasar los créditos restantes a la reserva.</label>
          <label className={styles.checkbox}><input type="checkbox" checked={draft.config.rolloverOnRenewal} onChange={(event) => changeConfig("rolloverOnRenewal", event.target.checked)} />Al renovar, pasar los créditos restantes del período anterior a la reserva.</label>
          <label className={styles.checkbox}><input type="checkbox" checked={draft.config.freeAutoRenew} onChange={(event) => changeConfig("freeAutoRenew", event.target.checked)} />Renovación gratuita automática cuando corresponda (nunca genera cargos).</label>
          <label className={styles.checkbox}><input type="checkbox" checked={draft.config.allowEarlyRenewal} onChange={(event) => changeConfig("allowEarlyRenewal", event.target.checked)} />Permitir que un abogado adelante su renovación gratuita.</label>
          <p className={styles.helper}>La reserva siempre se conserva al cancelar. Esta protección no puede desactivarse; la cancelación retira únicamente los créditos restantes del plan.</p>
        </fieldset>
        {draft.plans.map((plan, index) => <fieldset className={styles.adminPlan} key={plan.code} disabled={readOnly}><legend>Plan {plan.code}</legend><div className={styles.formGrid}>
          <label className={styles.field}>Nombre visible<input required minLength={2} maxLength={60} value={plan.name} onChange={(event) => changePlan(index, "name", event.target.value)} /></label>
          <label className={styles.field}>Créditos por período<input required type="number" min={1} max={10000} step={1} value={plan.monthly_credits} onChange={(event) => changePlan(index, "monthly_credits", event.target.value)} /></label>
          <label className={styles.field}>Precio de referencia en UF<input required type="number" min={0} max={10000} step="0.01" value={plan.monthly_price_uf} onChange={(event) => changePlan(index, "monthly_price_uf", event.target.value)} /><small>Máximo dos decimales. No calcula el valor diario de la UF.</small></label>
          <label className={styles.field}>Precio de referencia en CLP<input required type="number" min={0} max={100000000} step={1} value={plan.monthly_price_clp} onChange={(event) => changePlan(index, "monthly_price_clp", event.target.value)} /></label>
          <label className={styles.field}>Precio futuro por crédito adicional (CLP)<input required type="number" min={0} max={100000000} step={1} value={plan.extra_credit_price_clp} onChange={(event) => changePlan(index, "extra_credit_price_clp", event.target.value)} /></label>
          <label className={styles.field}>Orden del catálogo<input required type="number" min={0} max={100} step={1} value={plan.sort_order} onChange={(event) => changePlan(index, "sort_order", event.target.value)} /></label>
          <label className={`${styles.field} ${styles.full}`}>Descripción<input required minLength={10} maxLength={500} value={plan.description} onChange={(event) => changePlan(index, "description", event.target.value)} /></label>
          <label className={`${styles.field} ${styles.full}`}>Beneficios<textarea value={plan.benefitsText} maxLength={1500} onChange={(event) => changePlan(index, "benefitsText", event.target.value)} /><small>Un beneficio por línea: hasta 8, máximo 180 caracteres cada uno. Describe solo funciones que realmente ofrece JurisConecta.</small></label>
        </div><label className={styles.checkbox}><input type="checkbox" checked={plan.active} onChange={(event) => changePlan(index, "active", event.target.checked)} />Plan activo y visible en el catálogo.</label><label className={styles.checkbox}><input type="checkbox" checked={plan.featured} onChange={(event) => changePlan(index, "featured", event.target.checked)} />Mostrar como plan destacado.</label></fieldset>)}
        {modeChanged ? <div className={styles.confirmation}><h3>Confirmar cambio de modo</h3><p>{draft.config.mode === "paid" ? "Pasar a modo de pago preparado impedirá seleccionar o renovar planes y desbloquear nuevos contactos porque todavía no existe una pasarela. No cobrará ni convertirá los créditos gratuitos en créditos pagados." : "Pasar a modo gratis permitirá nuevamente las operaciones gratuitas y el uso de los saldos existentes."}</p><label className={styles.checkbox}><input type="checkbox" checked={modeConfirmed} onChange={(event) => setModeConfirmed(event.target.checked)} disabled={readOnly} required />Entiendo este efecto y confirmo el cambio de modo.</label></div> : null}
        {data.canManage ? <div className={styles.actions}><button type="submit" className={styles.action} disabled={busy || loading || modeChanged && !modeConfirmed}>{busy ? "Guardando…" : "Guardar reglas y catálogo"}</button></div> : null}
      </form>
      <section className={styles.panel}><h3>Revisar una cuenta profesional</h3><p>Busca por el ID de usuario que aparece en “Todas las cuentas”. Verás el saldo y los movimientos antes de realizar un ajuste.</p><form onSubmit={findTarget}><label className={styles.field}>ID de la cuenta de abogado<input required maxLength={80} autoCapitalize="none" autoCorrect="off" value={userId} disabled={busy || targetLoading} onChange={(event) => { setUserId(event.target.value); setTarget(null); setAdjustConfirmed(false); }} placeholder="ID de usuario" /></label><div className={styles.actions}><button type="submit" className={styles.secondary} disabled={busy || targetLoading || !userId.trim()}>{targetLoading ? "Buscando…" : "Consultar cuenta y créditos"}</button></div></form>
        {target ? <><h4>{target.fullName}</h4><p>{target.email} · <span className={styles.pill}>Versión de saldo {target.profile.billing_version}</span></p><dl className={styles.details}><div><dt>Saldo del plan</dt><dd>{target.profile.plan_credit_balance}</dd></div><div><dt>Reserva</dt><dd>{target.profile.reserve_credit_balance}</dd></div><div><dt>Total disponible</dt><dd>{target.profile.credit_balance}</dd></div></dl>
          {data.canManage ? <form onSubmit={adjust} className={styles.confirmation}><h4>Ajuste administrativo de reserva</h4><p>No modifica los créditos del plan ni registra pagos. Úsalo para pruebas o correcciones documentadas. Solo actúa sobre esta cuenta: {target.fullName}.</p><div className={styles.formGrid}><label className={styles.field}>Créditos a agregar o retirar<input required type="number" step={1} min={-10000} max={10000} value={delta} disabled={busy} onChange={(event) => { setDelta(event.target.value); setAdjustConfirmed(false); }} placeholder="Por ejemplo: 10 o -10" /></label><label className={styles.field}>Motivo del ajuste<textarea required minLength={10} maxLength={300} value={note} disabled={busy} onChange={(event) => { setNote(event.target.value); setAdjustConfirmed(false); }} placeholder="Explica el motivo para la bitácora" /></label></div><label className={styles.checkbox}><input type="checkbox" checked={adjustConfirmed} required disabled={busy} onChange={(event) => setAdjustConfirmed(event.target.checked)} />Confirmo el ajuste para esta cuenta y su registro en la bitácora{delta && Number.isSafeInteger(Number(delta)) ? `: la reserva quedaría en ${target.profile.reserve_credit_balance + Number(delta)} créditos.` : "."}</label><div className={styles.actions}><button type="submit" className={styles.action} disabled={busy || !adjustConfirmed}>{busy ? "Procesando…" : "Aplicar ajuste de reserva"}</button></div></form> : null}
          <h4>Últimos movimientos de esta cuenta</h4><BillingLedger entries={target.ledger} />
        </> : null}
      </section>
    </> : null}
  </section>;
}
