import { CaseTypeError, readCaseTypes } from "../_lib/case-types";
import type { UserAuthEnv } from "../_lib/user-auth";
interface Context { request: Request; env: UserAuthEnv }
export const onRequestGet = async ({ env }: Context) => {
  if (!env.DB) return Response.json({ error: "Catálogo temporalmente no disponible." }, { status: 503 });
  try { return Response.json({ types: await readCaseTypes(env.DB) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { if (error instanceof CaseTypeError) return Response.json({ error: error.message }, { status: error.status }); throw error; }
};
