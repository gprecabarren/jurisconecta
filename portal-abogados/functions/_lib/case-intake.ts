import { cookie, cookieValue, clearCookie } from './github-auth';
import { readJsonBody, noStore } from './http';
import { readUserSession, type UserAuthEnv, type UserSession } from './user-auth';
import { googleAvailable, type GoogleEnv } from './google-auth';
import { readCaseType } from './case-types';
import { validateIntakeAnswers, type CaseType } from '../../shared/case-intake';
import { isChileRegion } from '../../shared/chile';
import { readBillingConfig } from './billing';

type Contact = { fullName: string; phone: string; region: string; commune: string; attentionMode: string };
type Payload = { schema: CaseType; answers: Record<string,string>; contact: Contact; step: number };
type Draft = { id: string; token_hash: string; owner_user_id: string | null; payload_cipher: string | null; version: number; submitted_case_id: string | null; expires_at: number };
const lifetime = 48 * 60 * 60 * 1000;
const encoder = new TextEncoder();
const json = (body: object, status = 200) => noStore(Response.json(body, { status }));
const failure = (error: string, status: number) => json({ error }, status);
function encode(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function decode(text: string) { return Uint8Array.from(atob(text), c => c.charCodeAt(0)); }
async function hash(value: string) { return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
async function cipherKey(env: UserAuthEnv) {
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', encoder.encode(`juris:intake:v1:${env.USER_AUTH_SECRET}`)), 'AES-GCM', false, ['encrypt','decrypt']);
}
async function seal(payload: Payload, tokenHash: string, env: UserAuthEnv) {
  const bytes = encoder.encode(JSON.stringify(payload));
  if (bytes.length > 32000) throw new Error('intake_too_large');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name:'AES-GCM', iv, additionalData:encoder.encode(tokenHash) }, await cipherKey(env), bytes);
  return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}
async function open(row: Draft, env: UserAuthEnv): Promise<Payload | null> {
  if (!row.payload_cipher) return null;
  try {
    const [iv, encrypted] = row.payload_cipher.split('.');
    const bytes = await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:encoder.encode(row.token_hash)}, await cipherKey(env), decode(encrypted));
    return JSON.parse(new TextDecoder().decode(bytes)) as Payload;
  } catch { return null; }
}
function contactData(value: unknown, complete = false): Contact | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string,unknown>;
  const max: Record<keyof Contact,number> = {fullName:120,phone:30,region:80,commune:80,attentionMode:20};
  if (Object.keys(input).some(key => !(key in max))) return null;
  const output: Contact = {fullName:'',phone:'',region:'',commune:'',attentionMode:'remote'};
  for (const key of Object.keys(max) as (keyof Contact)[]) {
    if (input[key] !== undefined && typeof input[key] !== 'string') return null;
    const text = typeof input[key] === 'string' ? input[key].trim() : output[key];
    if (text.length > max[key] || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return null;
    output[key] = text;
  }
  if (output.region && !isChileRegion(output.region)) return null;
  if (!['remote','presencial','cualquiera'].includes(output.attentionMode)) return null;
  if (output.phone && (!/^[+\d\s()-]+$/.test(output.phone) || output.phone.replace(/\D/g,'').length < 8)) return null;
  if (complete && (output.fullName.length < 3 || !output.region || output.commune.length < 2)) return null;
  return output;
}
async function ownDraft(request: Request, env: UserAuthEnv, user: UserSession | null) {
  if (user && user.role !== 'person') return null;
  const token = cookieValue(request,'juris_intake');
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = await hash(token);
  if (user?.role === 'person') await env.DB!.prepare('UPDATE case_intake_drafts SET owner_user_id = ? WHERE token_hash = ? AND owner_user_id IS NULL AND expires_at > ?').bind(user.id,tokenHash,Date.now()).run();
  const row = await env.DB!.prepare('SELECT * FROM case_intake_drafts WHERE token_hash = ? AND expires_at > ? LIMIT 1').bind(tokenHash,Date.now()).first<Draft>();
  if (!row || (row.owner_user_id && row.owner_user_id !== user?.id)) return null;
  return row;
}
function present(row: Draft, payload: Payload) {
  return {id:row.id,typeId:payload.schema.id,typeVersion:payload.schema.version,schema:payload.schema,answers:payload.answers,contact:payload.contact,step:payload.step,version:row.version,expiresAt:row.expires_at};
}
export async function hasVerifiedEmail(env: UserAuthEnv, id: string) {
  const row = await env.DB!.prepare('SELECT email_verified_at, EXISTS(SELECT 1 FROM google_identities g WHERE g.user_id = users.id) AS google_verified FROM users WHERE id = ?').bind(id).first<{email_verified_at:string|null;google_verified:number}>();
  return Boolean(row?.email_verified_at || row?.google_verified);
}
async function rateLimit(request: Request, env: UserAuthEnv, create: boolean) {
  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const key = `intake:${create ? 'create' : 'save'}:${await hash(`${env.USER_AUTH_SECRET}:${ip}`)}`;
  const row = await env.DB!.prepare('INSERT INTO auth_rate_limits (key,window_start,count) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_start < ? THEN 1 ELSE count+1 END, window_start = CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END RETURNING count').bind(key,now,now-3600000,now-3600000).first<{count:number}>();
  return (row?.count || 0) <= (create ? 5 : 60);
}
export async function handleIntakeDraft(request: Request, env: GoogleEnv) {
  if (!env.DB || !env.USER_AUTH_SECRET) return failure('El guardado temporal no está disponible.',503);
  const user = await readUserSession(request,env);
  const row = await ownDraft(request,env,user);
  if (request.method === 'GET') {
    const payload = row && !row.submitted_case_id ? await open(row,env) : null;
    return json({draft:row && payload ? present(row,payload) : null,user:user ? {id:user.id,role:user.role,email:user.email,emailVerified:await hasVerifiedEmail(env,user.id)} : null,verification:{method:'google',emailCodeAvailable:false,available:googleAvailable(env)}});
  }
  if (request.method === 'DELETE') {
    if (row && !row.submitted_case_id) await env.DB.prepare('DELETE FROM case_intake_drafts WHERE id = ? AND token_hash = ? AND submitted_case_id IS NULL').bind(row.id,row.token_hash).run();
    const response = json({deleted:true}); response.headers.append('Set-Cookie',clearCookie('juris_intake')); return response;
  }
  if (user && user.role !== 'person') return failure('Tu cuenta es de abogado. No puedes crear solicitudes de cliente con este rol.',403);
  const body = await readJsonBody(request,36000);
  if (!body || typeof body.typeId !== 'string' || !Number.isInteger(body.step) || Number(body.step) < 0 || Number(body.step) > 10) return failure('Revisa el tipo de caso y el paso del formulario.',400);
  if (row?.submitted_case_id) return failure('Este borrador ya fue enviado. Inicia otra solicitud.',409);
  if (row && body.expectedVersion !== row.version) return failure('El borrador cambió en otra pestaña. Recarga antes de guardar.',409);
  const currentType = await readCaseType(env.DB,body.typeId);
  if (!currentType?.enabled) return failure('Este tipo de caso no está disponible.',400);
  const previous = row ? await open(row,env) : null;
  const schema = previous?.schema.id === currentType.id ? previous.schema : currentType;
  const validated = validateIntakeAnswers(schema,body.answers,true);
  const contact = contactData(body.contact);
  if (!validated.ok || !contact) return json({error:'Revisa las respuestas y los datos de contacto.',issues:validated.ok ? [] : validated.issues},400);
  if (JSON.stringify(validated.answers).length > 14000) return failure('Resume las respuestas: el conjunto supera el máximo permitido.',400);
  if (!await rateLimit(request,env,!row)) return failure('Has guardado muchas veces. Espera antes de volver a intentarlo.',429);
  const payload: Payload = {schema,answers:validated.answers,contact,step:Number(body.step)};
  try {
    if (row) {
      const encrypted = await seal(payload,row.token_hash,env);
      const updated = await env.DB.prepare('UPDATE case_intake_drafts SET payload_cipher = ?, version = version+1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND token_hash = ? AND version = ? AND submitted_case_id IS NULL AND expires_at > ? AND (owner_user_id IS NULL OR owner_user_id = ?)').bind(encrypted,row.id,row.token_hash,row.version,Date.now(),user?.id || null).run();
      if (!updated.meta?.changes) return failure('El borrador cambió o venció. Recarga antes de continuar.',409);
      return json({draft:present({...row,version:row.version+1},payload)});
    }
    const token = encode(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
    const tokenHash = await hash(token), id = crypto.randomUUID(), expiresAt = Date.now()+lifetime;
    await env.DB.prepare('DELETE FROM case_intake_drafts WHERE expires_at < ?').bind(Date.now()).run();
    await env.DB.prepare('DELETE FROM auth_rate_limits WHERE window_start < ?').bind(Date.now()-86400000).run();
    const encrypted = await seal(payload,tokenHash,env);
    await env.DB.prepare('INSERT INTO case_intake_drafts (id,token_hash,owner_user_id,payload_cipher,expires_at) VALUES (?,?,?,?,?)').bind(id,tokenHash,user?.id || null,encrypted,expiresAt).run();
    const response = json({draft:present({id,token_hash:tokenHash,owner_user_id:user?.id || null,payload_cipher:encrypted,version:1,submitted_case_id:null,expires_at:expiresAt},payload)},201);
    response.headers.append('Set-Cookie',cookie('juris_intake',token,lifetime/1000)); return response;
  } catch (error) {
    if (error instanceof Error && error.message.includes('intake_too_large')) return failure('El borrador supera el tamaño máximo. Resume las respuestas.',400);
    return failure('No pudimos guardar el borrador. Inténtalo más tarde sin cerrar esta página.',503);
  }
}
export async function handleIntakeSubmit(request: Request, env: UserAuthEnv) {
  if (!env.DB || !env.USER_AUTH_SECRET) return failure('Servicio no disponible.',503);
  const user = await readUserSession(request,env);
  if (!user) return failure('Regístrate o inicia sesión al finalizar para enviar tu solicitud.',401);
  if (user.role !== 'person') return failure('Solo una cuenta de cliente puede enviar solicitudes.',403);
  if (!await hasVerifiedEmail(env,user.id)) return failure('Verifica tu correo con Google antes de enviar. No se ha publicado tu caso.',403);
  const body = await readJsonBody(request,2000);
  if (body?.confirm !== true || !Number.isInteger(body.expectedVersion)) return failure('Confirma la solicitud antes de enviarla.',400);
  const row = await ownDraft(request,env,user);
  if (!row) return failure('Tu borrador venció o no pertenece a esta cuenta.',404);
  if (row.submitted_case_id) return json({id:row.submitted_case_id,redirect:`/cliente/caso?id=${row.submitted_case_id}`});
  if (body.expectedVersion !== row.version) return failure('Hay una versión más reciente del borrador. Recarga para revisarla.',409);
  const payload = await open(row,env);
  if (!payload) return failure('No pudimos recuperar el borrador. Vuelve a comenzar.',409);
  const currentType = await readCaseType(env.DB,payload.schema.id);
  if (!currentType?.enabled) return failure('Este tipo de caso fue retirado. Selecciona otro tipo antes de enviar.',409);
  const validated = validateIntakeAnswers(payload.schema,payload.answers);
  const contact = contactData(payload.contact,true);
  if (!validated.ok || !contact) return json({error:'Completa las respuestas obligatorias, tu nombre, región y comuna.',issues:validated.ok ? [] : validated.issues},400);
  const description = payload.schema.steps.flatMap(step => step.questions.filter(q => validated.answers[q.id]).map(q => `${q.label}\n${validated.answers[q.id]}`)).join('\n\n');
  const id = crypto.randomUUID(), billing = await readBillingConfig(env.DB);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO intake_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM users WHERE id = ? AND role = 'person' AND status = 'active' AND session_version = ?) THEN 1 ELSE 0 END").bind(user.id,user.sessionVersion ?? 0),
      env.DB.prepare("INSERT INTO legal_cases(id,person_id,category,title,description,region,status,credit_cost) VALUES (?,?,?,?,?,?,'open',?)").bind(id,user.id,payload.schema.category,payload.schema.topic,description,contact.region,billing.defaultCaseCreditCost),
      env.DB.prepare('INSERT INTO case_details(case_id,topic,situation,desired_outcome,attention_mode,commune) VALUES (?,?,?,?,?,?)').bind(id,payload.schema.topic,description,'Evaluar alternativas y recibir propuestas sobre la solicitud descrita.',contact.attentionMode,contact.commune),
      env.DB.prepare('INSERT INTO case_intake_responses(case_id,type_id,type_version,schema_json,answers_json) VALUES (?,?,?,?,?)').bind(id,payload.schema.id,payload.schema.version,JSON.stringify(payload.schema),JSON.stringify(validated.answers)),
      env.DB.prepare('UPDATE case_intake_drafts SET submitted_case_id = ?, payload_cipher = NULL, version = version+1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ? AND submitted_case_id IS NULL AND owner_user_id = ? AND expires_at > ?').bind(id,row.id,row.version,user.id,Date.now()),
      env.DB.prepare('INSERT INTO intake_assertions(ok) SELECT CASE WHEN changes() = 1 THEN 1 ELSE 0 END'),
      env.DB.prepare('UPDATE users SET full_name = ?, phone = ?, region = ?, commune = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(contact.fullName,contact.phone || null,contact.region,contact.commune,user.id),
      env.DB.prepare('DELETE FROM intake_assertions'),
    ]);
  } catch {
    const completed = await env.DB.prepare('SELECT submitted_case_id FROM case_intake_drafts WHERE id = ? AND owner_user_id = ?').bind(row.id,user.id).first<{submitted_case_id:string|null}>();
    if (completed?.submitted_case_id) return json({id:completed.submitted_case_id,redirect:`/cliente/caso?id=${completed.submitted_case_id}`});
    return failure('La solicitud cambió mientras se enviaba. Recarga y revisa antes de intentar de nuevo.',409);
  }
  return json({id,redirect:`/cliente/caso?id=${id}`},201);
}
