PRAGMA foreign_keys = ON;

-- Do not merge, rename or delete inherited accounts. Reject new normalized-email
-- collisions at the database boundary, including concurrent password/Google signups.
CREATE INDEX idx_users_email_normalized ON users(lower(trim(email)));
CREATE TRIGGER users_email_exclusive_insert BEFORE INSERT ON users
WHEN EXISTS (SELECT 1 FROM users WHERE lower(trim(email)) = lower(trim(NEW.email)))
BEGIN SELECT RAISE(ABORT, 'email_already_registered'); END;
CREATE TRIGGER users_email_exclusive_update BEFORE UPDATE OF email ON users
WHEN EXISTS (SELECT 1 FROM users WHERE id <> OLD.id AND lower(trim(email)) = lower(trim(NEW.email)))
BEGIN SELECT RAISE(ABORT, 'email_already_registered'); END;

-- Guards live only inside an atomic D1 batch. A stale account snapshot raises a
-- CHECK error, rolling back role, sessions, profile creation AND audit together.
CREATE TABLE account_transaction_guards (
  id TEXT PRIMARY KEY,
  valid INTEGER NOT NULL CHECK (valid = 1)
);
