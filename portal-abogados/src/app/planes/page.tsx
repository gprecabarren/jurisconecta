"use client";

import { Check, CheckCircle2, Clock3, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { BillingPlan, LawyerBillingAction, LawyerBillingResponse, PlanCode } from "../../../shared/billing";
import { PortalShell } from "../../components/portal-shell";
import { BillingLedger, billingDate, billingMoney } from "../../components/billing-ledger";
import styles from "../../components/billing.module.css";

const tabs = ["Planes", "Suscripción actual", "Movimientos"] as const;
type Intent = Pick<LawyerBillingAction, "action" | "planCode">;
const statusNames: Record<string, string> = { active: "Activa", trial: "Prueba activa", canceled: "Cancelada", cancelled: "Cancelada", inactive: "Sin suscripción", none: "Sin suscripción", expired: "Vencida", past_due: "Renovación pendiente" };

function PlanCard({ plan, current, free, days, busy, select }: { plan: BillingPlan; current: boolean; free: boolean; days: number; busy: boolean; select: (code: PlanCode) => void }) {
  return <article className={`${styles.card}${plan.featured ? ` ${styles.featured}` : ""}`}>
    <span className={`${styles.badge}${current ? ` ${styles.currentBadge}` : ""}`}>{current ? "Tu plan actual" : plan.featured ? "Plan destacado" : "Plan profesional"}</span>
    <h2>{plan.name}</h2>
    <div className={styles.credits}><strong>{plan.monthly_credits}</strong><span>créditos cada {days} días</span></div>
    <p className={styles.price}>{free ? "Gratis durante las pruebas" : `${new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(plan.monthly_price_uf)} UF`}</p>
    <p className={styles.priceNote}>{free ? `Precio futuro de referencia: ${billingMoney(plan.monthly_price_clp)} / período` : `${billingMoney(plan.monthly_price_clp)} CLP de referencia / período`}</p>
    <p className={styles.description}>{plan.description}</p>
    <ul className={styles.features}>{plan.benefits.map((benefit, index) => <li key={`${plan.code}-${index}`}><Check size={17} aria-hidden="true" /><span>{benefit}</span></li>)}</ul>
    <div className={styles.cardFooter}>
      <button className={styles.action} type="button" disabled={busy || current || !free} onClick={() => select(plan.code)}>{current ? "Plan seleccionado" : free ? "Elegir este plan gratis" : "Pagos no conectados"}</button>
      <small>{billingMoney(plan.extra_credit_price_clp)} de referencia por crédito adicional. La compra de créditos extra todavía no está habilitada.</small>
    </div>
  </article>;
}

export default function PlansPage() {
  const [data, setData] = useState<LawyerBillingResponse | null>(null);
  const [tab, setTab] = useState(0), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null), [confirmed, setConfirmed] = useState(false);
  const requestKeys = useRef(new Map<string, { key: string; version: number }>());
  const operationBusy = useRef(false);
  const confirmationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/lawyer/plans", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const result = await response.json() as LawyerBillingResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || "No pudimos cargar tus planes. Revisa tu sesión.");
      setData(result);
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "No pudimos conectar con el servidor.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function reload() {
    if (operationBusy.current) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/lawyer/plans", { cache: "no-store" });
      const result = await response.json() as LawyerBillingResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || "No pudimos actualizar los planes.");
      setData(result);
    } catch (err) { setError(err instanceof Error ? err.message : "Error de conexión. Puedes reintentar."); }
    finally { setLoading(false); }
  }

  function choose(next: Intent) {
    setIntent(next); setConfirmed(false); setError(""); setNotice("");
    requestAnimationFrame(() => confirmationRef.current?.focus());
  }

  async function apply() {
    if (!data || !intent || !confirmed || operationBusy.current) return;
    operationBusy.current = true; setBusy(true); setError(""); setNotice("");
    // Keep the original version as well as the key when the response is lost.
    // Reloading the balance must not turn a retry into a second renewal.
    const signature = JSON.stringify(intent);
    let attempt = requestKeys.current.get(signature);
    if (!attempt) { attempt = { key: crypto.randomUUID(), version: data.profile.billing_version }; requestKeys.current.set(signature, attempt); }
    try {
      const body: LawyerBillingAction = { ...intent, expectedVersion: attempt.version, idempotencyKey: attempt.key, confirm: true };
      const response = await fetch("/api/lawyer/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as LawyerBillingResponse & { error?: string; replayed?: boolean };
      if (!response.ok) {
        if (response.status < 500) requestKeys.current.delete(signature);
        throw new Error(result.error || "No pudimos completar el cambio. Puedes reintentar sin duplicarlo.");
      }
      requestKeys.current.delete(signature); setData(result); setIntent(null); setConfirmed(false);
      setNotice(result.replayed ? "La operación ya estaba registrada. Tu saldo se actualizó sin repetir el movimiento." : intent.action === "cancel" ? "Suscripción cancelada. Puedes revisar el saldo y el movimiento registrado." : "Plan actualizado sin cobros. El movimiento quedó registrado en tu cuenta.");
      window.dispatchEvent(new Event("juris:billing-updated"));
    } catch (err) { setError(err instanceof Error ? err.message : "No pudimos conectar. Reintenta la misma operación; no se duplicará."); }
    finally { operationBusy.current = false; setBusy(false); }
  }

  function keyboardTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault(); setTab(next); document.getElementById(`billing-tab-${next}`)?.focus();
  }

  const currentPlan = data?.plans.find((plan) => plan.code === data.profile.plan_code);
  const selectedPlan = intent?.planCode ? data?.plans.find((plan) => plan.code === intent.planCode) : currentPlan;
  const subscribed = data ? ["active", "trial"].includes(data.profile.subscription_status) : false;
  const overdue = data ? ["past_due", "expired"].includes(data.profile.subscription_status) : false;
  const approved = data?.profile.application_status === "approved";
  const free = data?.config.mode === "free";
  const actionTitle = intent?.action === "cancel" ? "Cancelar la suscripción" : intent?.action === "renew" ? overdue ? "Renovar el plan" : "Adelantar la renovación" : `Elegir ${selectedPlan?.name || "un plan"}`;

  return <PortalShell><div className={styles.section}>
    <div className="portal-page-heading"><div><p className="eyebrow">Tu plan profesional</p><h1>Más claridad sobre tus créditos.</h1><p className={styles.intro}>Elige un plan, revisa tus saldos y sigue cada movimiento. Tener créditos no reemplaza la aprobación de tu perfil ni la aceptación del cliente para acceder a su contacto.</p></div></div>
    {loading ? <p className={styles.loading} role="status">Cargando planes y créditos…</p> : null}
    {error ? <div className={styles.error} role="alert"><p>{error}</p><button type="button" className={styles.secondary} disabled={busy || loading} onClick={() => void reload()}><RefreshCw size={16} aria-hidden="true" /> Actualizar información</button></div> : null}
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    {data ? <>
      <div className={`${styles.mode}${free ? "" : ` ${styles.paid}`}`}><ShieldCheck size={22} aria-hidden="true" /><p><strong>{free ? "Modo gratis · No se generan cobros" : "Modo de pago preparado · Pagos no conectados"}</strong>{free ? "Los planes se pueden probar sin tarjeta. Los precios del catálogo son referenciales para una futura etapa de pago." : "Puedes consultar el catálogo y cancelar una suscripción existente. No hay una pasarela: las compras, renovaciones y nuevos desbloqueos de contacto están bloqueados. Tus saldos y los contactos ya accedidos se conservan."}</p></div>
      {!approved ? <p className={styles.notice}>Puedes revisar el catálogo. Para seleccionar o administrar un plan, primero debe aprobarse tu perfil profesional.</p> : null}
      <section className={styles.overview} aria-label="Resumen de créditos">
        <article className={styles.metric}><WalletCards size={22} aria-hidden="true" /><p>Créditos del plan</p><strong>{data.profile.plan_credit_balance}<span> / {subscribed ? currentPlan?.monthly_credits ?? "—" : 0}</span></strong><small>Disponibles / asignación por período</small></article>
        <article className={styles.metric}><CheckCircle2 size={22} aria-hidden="true" /><p>Créditos de reserva</p><strong>{data.profile.reserve_credit_balance}</strong><small>Se usan cuando se acaba el saldo del plan</small></article>
        <article className={styles.metric}><WalletCards size={22} aria-hidden="true" /><p>Saldo total</p><strong>{data.profile.credit_balance}</strong><small>Créditos del plan + reserva</small></article>
        <article className={styles.metric}><Clock3 size={22} aria-hidden="true" /><p>Próxima renovación</p><strong style={{ fontSize: "1.15rem", letterSpacing: "-.02em" }}>{billingDate(data.profile.renewal_date, false)}</strong><small>{subscribed ? `Períodos de ${data.config.periodDays} días` : "Sin renovación activa"}</small></article>
      </section>
      <div className={styles.tabs} role="tablist" aria-label="Planes y suscripción">{tabs.map((label, index) => <button type="button" key={label} id={`billing-tab-${index}`} role="tab" aria-selected={tab === index} aria-controls={`billing-panel-${index}`} tabIndex={tab === index ? 0 : -1} onKeyDown={(event) => keyboardTabs(event, index)} onClick={() => setTab(index)}>{label}</button>)}</div>
      {tabs.map((label, index) => <section role="tabpanel" key={label} hidden={tab !== index} id={`billing-panel-${index}`} aria-labelledby={`billing-tab-${index}`} tabIndex={0}>
        {tab !== index ? null : tab === 0 ? <><div className={styles.cards}>{data.plans.filter((plan) => plan.active).map((plan) => <PlanCard key={plan.code} plan={plan} current={subscribed && data.profile.plan_code === plan.code} free={free} days={data.config.periodDays} busy={busy || loading || !approved} select={(planCode) => choose({ action: "select_plan", planCode })} />)}</div>{!data.plans.some((plan) => plan.active) ? <p className={styles.empty}>No hay planes activos en este momento. Puedes consultar tus movimientos y contactar a soporte.</p> : null}<p className={styles.footnote}>Los precios en UF y pesos son parámetros de catálogo, no una conversión diaria de UF ni una oferta de cobro. No se solicitan datos de tarjeta. Las funciones disponibles se indican en cada plan.</p></> : tab === 1 ? <div className={styles.detailGrid}>
          <section className={styles.panel}><h2>Tu suscripción</h2><dl className={styles.details}><div><dt>Plan</dt><dd>{currentPlan?.name || data.profile.plan_code}</dd></div><div><dt>Estado</dt><dd>{statusNames[data.profile.subscription_status] || data.profile.subscription_status}</dd></div><div><dt>Duración del período</dt><dd>{data.config.periodDays} días</dd></div><div><dt>Renovación</dt><dd>{billingDate(data.profile.renewal_date, false)}</dd></div><div><dt>Modo del período actual</dt><dd>{data.profile.period_mode === "free" ? "Gratis" : "Pago"}</dd></div></dl><div className={styles.actions}><button type="button" className={styles.action} disabled={busy || !approved || !(subscribed || overdue) || !currentPlan || !free || !data.config.allowEarlyRenewal && !overdue} onClick={() => choose({ action: "renew" })}>{overdue ? "Renovar plan" : "Adelantar renovación"}</button><button type="button" className={styles.secondary} disabled={busy || !approved || !(subscribed || overdue)} onClick={() => choose({ action: "cancel" })}>Cancelar suscripción</button></div><p className={styles.helper}>{free ? data.config.freeAutoRenew ? "La renovación gratuita automática está habilitada: se aplica al volver a usar la plataforma después del vencimiento. No genera cargos ni acumula períodos no utilizados." : "La renovación automática gratuita está desactivada. Puedes renovar manualmente cuando corresponda." : "Las renovaciones de pago están bloqueadas hasta conectar una pasarela."}</p></section>
          <section className={styles.panel}><h2>Cómo se usan tus créditos</h2><p>Se descuentan primero del plan y luego de la reserva. El valor de cada caso se muestra antes de desbloquearlo; no se vuelve a descontar por un caso ya accedido.</p><p>{data.config.rolloverOnChange ? "Al cambiar de plan, el saldo restante del plan pasa a la reserva." : "Al cambiar de plan, el saldo restante del plan no se acumula en la reserva."}</p><p>{data.config.rolloverOnRenewal ? "Al renovar, el saldo restante del período anterior pasa a la reserva." : "Al renovar, los créditos del período anterior se reemplazan por la nueva asignación."}</p><p>Al cancelar se retiran los créditos disponibles del plan y se conserva la reserva. Los casos a los que ya accediste no vuelven a cobrar créditos.</p></section>
        </div> : <section className={styles.panel}><h2>Movimientos de créditos</h2><p>Consulta las últimas operaciones de tu cuenta. Las horas se muestran en la zona horaria de Chile.</p><BillingLedger entries={data.ledger} /></section>}
      </section>)}
      {intent ? <div ref={confirmationRef} tabIndex={-1} className={styles.confirmation} aria-labelledby="billing-confirm-title"><h3 id="billing-confirm-title">{actionTitle}</h3><p>{intent.action === "cancel" ? `Se retirarán los ${data.profile.plan_credit_balance} créditos que quedan en el plan. Mantendrás tus ${data.profile.reserve_credit_balance} créditos de reserva y tus accesos anteriores.` : intent.action === "renew" ? `Recibirás la asignación de ${selectedPlan?.monthly_credits ?? 0} créditos del plan y comenzará un nuevo período de ${data.config.periodDays} días desde ahora. ${data.config.rolloverOnRenewal ? "El saldo restante actual pasará a la reserva." : "El saldo restante actual del plan se reemplazará, sin acumularse."}` : `El cambio se aplicará inmediatamente y comenzará un período de ${data.config.periodDays} días con ${selectedPlan?.monthly_credits ?? 0} créditos. ${data.config.rolloverOnChange ? "El saldo restante actual del plan pasará a la reserva." : "El saldo restante actual del plan se reemplazará, sin acumularse."}`}</p><p>{free ? "Esta operación es gratuita. No se cobrará ni se pedirá una tarjeta." : "Cancelar no inicia ni ejecuta ningún pago."}</p><label className={styles.checkbox}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} />Entiendo el efecto sobre mis créditos y confirmo esta operación.</label><div className={styles.actions}><button type="button" className={styles.action} disabled={busy || !confirmed || loading} onClick={() => void apply()}>{busy ? "Procesando…" : "Confirmar operación"}</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => { setIntent(null); setConfirmed(false); }}>Volver sin cambios</button></div></div> : null}
    </> : null}
  </div></PortalShell>;
}
