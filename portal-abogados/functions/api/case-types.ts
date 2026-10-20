import { CaseTypeError, readCaseTypes } from "../_lib/case-types";
import type { UserAuthEnv } from "../_lib/user-auth";
import { summarizeCaseType } from "../../shared/case-catalog-summary";
interface Context { request: Request; env: UserAuthEnv }
export const onRequestGet = async ({ env, request }: Context) => {
  if (!env.DB) return Response.json({ error: "Catálogo temporalmente no disponible." }, { status: 503 });
  try { const types = await readCaseTypes(env.DB); return Response.json({ types: new URL(request.url).searchParams.get("view") === "summary" ? types.map(summarizeCaseType) : types }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { if (error instanceof CaseTypeError) return Response.json({ error: error.message }, { status: error.status }); throw error; }
};
