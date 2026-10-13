PRAGMA foreign_keys = ON;

-- This release is FREE by default. Prices are editable references, not payment mandates.
CREATE TABLE billing_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  mode TEXT NOT NULL DEFAULT 'free' CHECK (mode IN ('free', 'paid')),
  period_days INTEGER NOT NULL DEFAULT 30 CHECK (period_days BETWEEN 1 AND 365),
  default_case_credit_cost INTEGER NOT NULL DEFAULT 5 CHECK (default_case_credit_cost BETWEEN 0 AND 10000),
  rollover_on_renewal INTEGER NOT NULL DEFAULT 1 CHECK (rollover_on_renewal IN (0, 1)),
  rollover_on_change INTEGER NOT NULL DEFAULT 1 CHECK (rollover_on_change IN (0, 1)),
  preserve_reserve_on_cancel INTEGER NOT NULL DEFAULT 1 CHECK (preserve_reserve_on_cancel = 1),
  free_auto_renew INTEGER NOT NULL DEFAULT 1 CHECK (free_auto_renew IN (0, 1)),
  allow_early_renewal INTEGER NOT NULL DEFAULT 1 CHECK (allow_early_renewal IN (0, 1)),
  max_balance INTEGER NOT NULL DEFAULT 1000000 CHECK (max_balance BETWEEN 1 AND 1000000),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO billing_config (id) VALUES (1);

ALTER TABLE subscription_plans ADD COLUMN monthly_price_uf_hundredths INTEGER NOT NULL DEFAULT 0 CHECK (monthly_price_uf_hundredths BETWEEN 0 AND 1000000);
ALTER TABLE subscription_plans ADD COLUMN extra_credit_price_clp INTEGER NOT NULL DEFAULT 0 CHECK (extra_credit_price_clp BETWEEN 0 AND 100000000);
ALTER TABLE subscription_plans ADD COLUMN featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1));
ALTER TABLE subscription_plans ADD COLUMN benefits_json TEXT NOT NULL DEFAULT '[]';
UPDATE subscription_plans SET monthly_credits = 100, monthly_price_clp = 74100, monthly_price_uf_hundredths = 180, extra_credit_price_clp = 1343, sort_order = 1, description = 'Una base para comenzar a conectar con nuevas oportunidades.', benefits_json = '["Acceso al pool y coincidencias por especialidad","Propuestas con aceptación previa del cliente","Avisos internos y soporte por tickets"]' WHERE code = 'premium';
UPDATE subscription_plans SET monthly_credits = 200, monthly_price_clp = 123500, monthly_price_uf_hundredths = 300, extra_credit_price_clp = 1155, featured = 1, sort_order = 2, description = 'Mayor capacidad para desarrollar tu práctica profesional.', benefits_json = '["Acceso al pool y coincidencias por especialidad","Propuestas con aceptación previa del cliente","Avisos internos y soporte por tickets"]' WHERE code = 'silver';
UPDATE subscription_plans SET monthly_credits = 400, monthly_price_clp = 205800, monthly_price_uf_hundredths = 500, extra_credit_price_clp = 924, sort_order = 3, description = 'Capacidad ampliada para profesionales con mayor actividad.', benefits_json = '["Acceso al pool y coincidencias por especialidad","Propuestas con aceptación previa del cliente","Avisos internos y soporte por tickets"]' WHERE code = 'gold';

ALTER TABLE lawyer_profiles ADD COLUMN plan_credit_balance INTEGER NOT NULL DEFAULT 0 CHECK (plan_credit_balance >= 0);
ALTER TABLE lawyer_profiles ADD COLUMN reserve_credit_balance INTEGER NOT NULL DEFAULT 0 CHECK (reserve_credit_balance >= 0);
ALTER TABLE lawyer_profiles ADD COLUMN billing_version INTEGER NOT NULL DEFAULT 1 CHECK (billing_version > 0);
ALTER TABLE lawyer_profiles ADD COLUMN period_mode TEXT NOT NULL DEFAULT 'free' CHECK (period_mode IN ('free', 'paid'));
-- Every inherited credit is moved to reserve, without reinterpreting or deleting it.
UPDATE lawyer_profiles SET reserve_credit_balance = MAX(0, credit_balance);

CREATE TABLE credit_movements (
  id TEXT PRIMARY KEY,
  lawyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_key TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('legacy_import', 'activation', 'select_plan', 'renew', 'auto_renew', 'cancel', 'case_access', 'manual_adjustment', 'paid_expiry', 'period_expiry')),
  plan_delta INTEGER NOT NULL,
  reserve_delta INTEGER NOT NULL,
  plan_balance_after INTEGER NOT NULL CHECK (plan_balance_after >= 0),
  reserve_balance_after INTEGER NOT NULL CHECK (reserve_balance_after >= 0),
  related_case_id TEXT REFERENCES legal_cases(id) ON DELETE SET NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (lawyer_id, operation_key)
);
INSERT INTO credit_movements (id, lawyer_id, operation_key, operation, plan_delta, reserve_delta, plan_balance_after, reserve_balance_after, note)
SELECT lower(hex(randomblob(16))), user_id, 'migration:0014', 'legacy_import', 0, reserve_credit_balance, 0, reserve_credit_balance, 'Saldo anterior conservado íntegramente en reserva.' FROM lawyer_profiles;
CREATE INDEX idx_credit_movements_lawyer_created ON credit_movements(lawyer_id, created_at DESC);

CREATE TABLE billing_operations (
  lawyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (lawyer_id, idempotency_key)
);
-- Short-lived transaction assertions are inserted and removed in the SAME D1 batch.
-- CHECK failure rolls back the entire operation (including audit/idempotency records).
CREATE TABLE billing_transaction_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK (valid = 1));

CREATE TRIGGER billing_sync_total AFTER UPDATE OF plan_credit_balance, reserve_credit_balance ON lawyer_profiles
WHEN NEW.credit_balance <> NEW.plan_credit_balance + NEW.reserve_credit_balance
BEGIN
  UPDATE lawyer_profiles SET credit_balance = NEW.plan_credit_balance + NEW.reserve_credit_balance WHERE user_id = NEW.user_id;
END;
-- Compatibility for older operator scripts: total balance writes are reconciled,
-- preserving plan credits first. New APIs never write total balances directly.
CREATE TRIGGER billing_sync_legacy_total AFTER UPDATE OF credit_balance ON lawyer_profiles
WHEN NEW.credit_balance <> NEW.plan_credit_balance + NEW.reserve_credit_balance
BEGIN
  SELECT CASE WHEN NEW.credit_balance < 0 THEN RAISE(ABORT, 'negative_credit_balance') END;
  UPDATE lawyer_profiles SET plan_credit_balance = MIN(NEW.plan_credit_balance, NEW.credit_balance), reserve_credit_balance = MAX(0, NEW.credit_balance - NEW.plan_credit_balance) WHERE user_id = NEW.user_id;
END;

-- Replace only the old debit trigger. The acceptance trigger from 0007 remains.
-- The previous ledger rejected delta=0, breaking legitimate zero-cost accesses.
DROP TRIGGER case_access_debits_credits;
CREATE TRIGGER billing_case_access_validity BEFORE INSERT ON case_accesses
WHEN NOT EXISTS (
  SELECT 1 FROM legal_cases c JOIN lawyer_profiles lp ON lp.user_id = NEW.lawyer_id JOIN users u ON u.id = lp.user_id
  WHERE c.id = NEW.case_id AND c.status = 'matched' AND c.credit_cost = NEW.credits_spent AND lp.application_status = 'approved' AND u.status = 'active'
    AND EXISTS (SELECT 1 FROM billing_config WHERE id = 1 AND mode = 'free')
)
BEGIN SELECT RAISE(ABORT, 'invalid_case_access'); END;
CREATE TRIGGER case_access_debits_credits AFTER INSERT ON case_accesses
BEGIN
  INSERT INTO credit_movements (id, lawyer_id, operation_key, operation, plan_delta, reserve_delta, plan_balance_after, reserve_balance_after, related_case_id)
  SELECT lower(hex(randomblob(16))), NEW.lawyer_id, 'case:' || NEW.case_id, 'case_access',
    -MIN(plan_credit_balance, NEW.credits_spent), -MAX(0, NEW.credits_spent - plan_credit_balance),
    MAX(0, plan_credit_balance - NEW.credits_spent), reserve_credit_balance - MAX(0, NEW.credits_spent - plan_credit_balance), NEW.case_id
  FROM lawyer_profiles WHERE user_id = NEW.lawyer_id;
  UPDATE lawyer_profiles SET
    reserve_credit_balance = reserve_credit_balance - MAX(0, NEW.credits_spent - plan_credit_balance),
    plan_credit_balance = MAX(0, plan_credit_balance - NEW.credits_spent),
    billing_version = billing_version + 1
  WHERE user_id = NEW.lawyer_id;
  INSERT INTO lawyer_credit_ledger (id, lawyer_id, delta, balance_after, reason, related_case_id)
  SELECT lower(hex(randomblob(16))), NEW.lawyer_id, -NEW.credits_spent, credit_balance, 'case_access', NEW.case_id
  FROM lawyer_profiles WHERE user_id = NEW.lawyer_id AND NEW.credits_spent > 0;
END;
