import type { CreditLedgerEntry } from "../../shared/billing";
import styles from "./billing.module.css";

export const billingMoney = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);

export function billingDate(value: string | null, time = true): string {
  if (!value) return "—";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00-03:00` : /Z$|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", ...(time ? { timeStyle: "short" as const } : {}), timeZone: "America/Santiago" }).format(parsed);
}

const operations: Record<string, string> = {
  legacy_import: "Saldo anterior preservado", case_access: "Acceso a un caso", period_expiry: "Período vencido sin asignación",
  select_plan: "Selección o cambio de plan", plan_selected: "Selección de plan", plan_change: "Cambio de plan", renew: "Renovación", plan_renewal: "Renovación", cancel: "Cancelación", plan_canceled: "Cancelación", unlock_case: "Acceso a un caso", case_unlock: "Acceso a un caso", adjust_reserve: "Ajuste de reserva", admin_adjustment: "Ajuste administrativo", manual_adjustment: "Ajuste administrativo", legacy_balance: "Saldo anterior preservado", migration: "Saldo anterior preservado", auto_renew: "Renovación gratuita automática", activation: "Activación gratuita de plan", paid_expiry: "Vencimiento sin renovación",
};

function delta(value: number): string { return value > 0 ? `+${value}` : String(value); }

export function BillingLedger({ entries }: { entries: CreditLedgerEntry[] }) {
  if (!entries.length) return <p className={styles.empty}>Todavía no hay movimientos registrados. Las próximas operaciones de créditos aparecerán aquí.</p>;
  return <div className={styles.tableWrap}><table className={styles.table}><caption className="sr-only">Últimos movimientos de créditos con fecha, variación y saldo resultante</caption><thead><tr><th scope="col">Fecha y operación</th><th scope="col">Plan</th><th scope="col">Reserva</th><th scope="col">Saldo después</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td>{billingDate(entry.created_at)}<small>{operations[entry.operation] || entry.operation}{entry.note ? ` · ${entry.note}` : ""}</small>{entry.related_case_id ? <small>Caso {entry.related_case_id}</small> : null}</td><td><span className={entry.plan_delta < 0 ? styles.negative : styles.positive}>{delta(entry.plan_delta)}</span></td><td><span className={entry.reserve_delta < 0 ? styles.negative : styles.positive}>{delta(entry.reserve_delta)}</span></td><td>{entry.plan_balance_after + entry.reserve_balance_after}<small>{entry.plan_balance_after} del plan · {entry.reserve_balance_after} de reserva</small></td></tr>)}</tbody></table></div>;
}
