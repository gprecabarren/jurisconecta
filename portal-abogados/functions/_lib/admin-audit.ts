import { readSession, type AuthEnv } from "./github-auth";
import type { D1Database, D1Statement } from "./user-auth";
export async function adminAuditStatement(request: Request, env: AuthEnv, db: D1Database, action: string, targetType: string, targetId: string | null, details: Record<string, unknown> = {}): Promise<D1Statement> {
  const session = await readSession(request, env);
  if (!session) throw new Error("Sesión administrativa vencida.");
  return db.prepare("INSERT INTO admin_audit_log (id, github_login, action, target_type, target_id, details_json) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), session.login, action, targetType, targetId, JSON.stringify(details));
}
export async function recordAdminAction(request: Request, env: AuthEnv, db: D1Database, action: string, targetType: string, targetId: string | null, details: Record<string, unknown> = {}) {
  await (await adminAuditStatement(request, env, db, action, targetType, targetId, details)).run();
}
