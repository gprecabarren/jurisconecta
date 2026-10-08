import { readSession, type AuthEnv } from "../../_lib/github-auth";
import type { D1Database } from "../../_lib/user-auth";

interface Context { request: Request; env: AuthEnv & { DB?: D1Database }; }
type LawyerProfile = { id: string; fullName: string; email: string; status: string; region: string | null; specialties: string; };

export const onRequestGet = async ({ request, env }: Context) => {
  const session = await readSession(request, env);
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const profiles = await env.DB.prepare("SELECT u.id, u.full_name AS fullName, u.email, u.status, u.region, COALESCE(lp.specialties_json, '[]') AS specialties FROM users u LEFT JOIN lawyer_profiles lp ON lp.user_id = u.id WHERE u.role = 'lawyer' ORDER BY u.created_at DESC").all<LawyerProfile>();
  return Response.json({ profiles: profiles.results });
};
