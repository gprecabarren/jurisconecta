import { readSession, type AuthEnv } from "./github-auth";

export async function isAdmin(request: Request, env: AuthEnv) {
  const session = await readSession(request, env);
  return Boolean(session);
}
