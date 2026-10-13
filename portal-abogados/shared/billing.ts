/** Public billing contract. Monetary amounts are display-only; no payment provider is connected. */
export type BillingMode = "free" | "paid";
export type PlanCode = "premium" | "silver" | "gold";
export type BillingConfig = {
  version: number;
  mode: BillingMode;
  periodDays: number;
  defaultCaseCreditCost: number;
  rolloverOnRenewal: boolean;
  rolloverOnChange: boolean;
  preserveReserveOnCancel: boolean;
  freeAutoRenew: boolean;
  allowEarlyRenewal: boolean;
  maxBalance: number;
  updatedAt: string;
};
export type BillingPlan = {
  code: PlanCode;
  name: string;
  monthly_credits: number;
  monthly_price_clp: number;
  monthly_price_uf: number;
  extra_credit_price_clp: number;
  description: string;
  benefits: string[];
  sort_order: number;
  active: boolean;
  featured: boolean;
};
export type BillingProfile = {
  plan_code: PlanCode;
  credit_balance: number;
  plan_credit_balance: number;
  reserve_credit_balance: number;
  renewal_date: string | null;
  subscription_status: string;
  billing_version: number;
  period_mode: BillingMode;
  application_status: string;
};
export type CreditLedgerEntry = {
  id: string;
  operation: string;
  plan_delta: number;
  reserve_delta: number;
  plan_balance_after: number;
  reserve_balance_after: number;
  related_case_id: string | null;
  note: string | null;
  created_at: string;
};
export type LawyerBillingResponse = {
  config: BillingConfig;
  plans: BillingPlan[];
  profile: BillingProfile;
  ledger: CreditLedgerEntry[];
  paymentsEnabled: false;
};
export type LawyerBillingAction = {
  action: "select_plan" | "renew" | "cancel";
  planCode?: PlanCode;
  expectedVersion: number;
  idempotencyKey: string;
  confirm: true;
};
export type AdminBillingResponse = {
  config: BillingConfig;
  plans: BillingPlan[];
  canManage: boolean;
  paymentsEnabled: false;
  target?: { userId: string; fullName: string; email: string; profile: BillingProfile; ledger: CreditLedgerEntry[] };
};
export type AdminBillingUpdate = {
  expectedVersion: number;
  config: Omit<BillingConfig, "version" | "updatedAt">;
  plans: BillingPlan[];
  confirmModeChange?: boolean;
};
export type AdminCreditAdjustment = {
  action: "adjust_reserve";
  userId: string;
  delta: number;
  note: string;
  expectedVersion: number;
  idempotencyKey: string;
  confirm: true;
};
