import { isChileRegion, isValidRut } from "./chile";
import type { CaseCatalogSummary } from "./case-catalog-summary";

export const lawyerSteps = ["Verificar correo", "Verificar identidad", "Información profesional", "Plan"] as const;
export const attentionModes = { remote: "Remota, a cualquier parte de Chile", hybrid: "Remota y presencial en las localidades de", in_person: "Presencial en las localidades de" } as const;
export const lawyerGenders = { male: "Masculino", female: "Femenino", other: "Otro", undisclosed: "Prefiero no indicar" } as const;
export const professionalColumns = {
  country: "country", university: "university", graduationDate: "graduation_date", birthDate: "birth_date", gender: "gender", attentionMode: "attention_mode", serviceLocalities: "service_localities", additionalStudies: "additional_studies", workExperience: "work_experience", linkedinUrl: "linkedin_url", twitterUrl: "twitter_url", youtubeUrl: "youtube_url", facebookUrl: "facebook_url", instagramUrl: "instagram_url", websiteUrl: "website_url", address: "address", referralCode: "referral_code",
} as const;
export type ProfessionalField = keyof typeof professionalColumns;
export type LawyerDraft = Record<ProfessionalField, string> & {
  fullName: string; email: string; phone: string; region: string; commune: string; rutNumber: string; rutVerifier: string;
  experienceYears: string; bio: string; specialties: string[]; practiceTopicIds: string[]; avatarDataUrl: string | null; planCode: string; manualVerificationConsent: boolean;
};
export type LawyerProfileData = { full_name: string; email: string; phone: string | null; region: string | null; commune: string | null; avatar_data_url: string | null; specialties_json: string; bio: string | null; application_status: string; application_review_note: string | null; email_verified_at: string | null };
export type LawyerApplicationData = Partial<Record<(typeof professionalColumns)[ProfessionalField] | "rut" | "experience_years" | "practice_topics_json" | "selected_plan_code", string | number | null>>;

function stringArray(json: unknown): string[] {
  if (typeof json !== "string") return [];
  try { const values: unknown = JSON.parse(json); return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : []; } catch { return []; }
}

export function lawyerDraftFromProfile(profile?: Partial<LawyerProfileData>, application: LawyerApplicationData = {}): LawyerDraft {
  const details = Object.fromEntries(Object.entries(professionalColumns).map(([key, col]) => [key, String(application[col] ?? "")])) as Record<ProfessionalField, string>;
  const rut = String(application.rut || "").replace(/[^0-9kK]/g, "").toUpperCase();
  return { ...details, country: details.country || "Chile", attentionMode: details.attentionMode || "remote", fullName: profile?.full_name || "", email: profile?.email || "", phone: profile?.phone || "", region: profile?.region || "", commune: profile?.commune || "", rutNumber: rut.slice(0, -1), rutVerifier: rut.slice(-1), experienceYears: String(application.experience_years ?? 0), bio: profile?.bio || "", specialties: stringArray(profile?.specialties_json), practiceTopicIds: stringArray(application.practice_topics_json), avatarDataUrl: profile?.avatar_data_url || null, planCode: String(application.selected_plan_code || ""), manualVerificationConsent: false };
}

export function lawyerProfessionalPayload(value: LawyerDraft) {
  return { ...Object.fromEntries(Object.keys(professionalColumns).map((key) => [key, value[key as ProfessionalField]])), experienceYears: Number(value.experienceYears), practiceTopicIds: value.practiceTopicIds };
}

export function lawyerApplicationPayload(value: LawyerDraft) {
  return { ...lawyerProfessionalPayload(value), rut: `${value.rutNumber}-${value.rutVerifier}`, fullName: value.fullName, phone: value.phone, region: value.region, commune: value.commune, bio: value.bio, specialties: value.specialties, avatarDataUrl: value.avatarDataUrl, planCode: value.planCode, manualVerificationConsent: value.manualVerificationConsent };
}

export function validLawyerDate(value: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > today) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function lawyerProfessionalIssues(draft: LawyerDraft, today = new Date().toISOString().slice(0, 10)): string[] {
  const issues: string[] = [];
  if (draft.fullName.trim().length < 3) issues.push("Nombre completo");
  if (!/^\d{7,8}$/.test(draft.rutNumber.replace(/\./g, "")) || !/^[0-9kK]$/.test(draft.rutVerifier) || !isValidRut(`${draft.rutNumber}-${draft.rutVerifier}`)) issues.push("RUT y dígito verificador");
  if (!validLawyerPhone(draft.phone)) issues.push("Teléfono con código de país");
  if (!draft.country.trim()) issues.push("País de residencia");
  if (draft.country === "Chile" && (!isChileRegion(draft.region) || !draft.commune.trim())) issues.push("Región y comuna de residencia");
  if (draft.country !== "Chile" && !draft.commune.trim()) issues.push("Ciudad de residencia");
  if (draft.university.trim().length < 3) issues.push("Universidad");
  if (!validLawyerDate(draft.graduationDate, today)) issues.push("Fecha de titulación");
  if (draft.birthDate && (!validLawyerDate(draft.birthDate, today) || draft.birthDate >= draft.graduationDate)) issues.push("Fecha de nacimiento");
  if (!draft.specialties.length) issues.push("Áreas de práctica");
  if (draft.attentionMode !== "remote" && !draft.serviceLocalities.trim()) issues.push("Localidades de atención");
  if (draft.bio.trim().length < 30) issues.push("Presentación (mínimo 30 caracteres)");
  for (const field of lawyerLinkFields) if (draft[field].trim() && !validLawyerLink(draft[field])) issues.push("Enlaces profesionales válidos (HTTPS o HTTP)");
  return [...new Set(issues)];
}

export const lawyerLinkFields = ["linkedinUrl", "twitterUrl", "youtubeUrl", "facebookUrl", "instagramUrl", "websiteUrl"] as const;
export function validLawyerPhone(value: string) { return /^\+?[\d ()-]{7,30}$/.test(value.trim()) && value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 15; }
export function validLawyerLink(value: string) {
  try { const url = new URL(value.trim()); return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && value.length <= 300; } catch { return false; }
}

export function activePracticeSelection(specialties: readonly string[], ids: readonly string[], catalog: readonly CaseCatalogSummary[]) {
  const lookup = new Map(catalog.filter((item) => item.enabled).map((item) => [item.id, item.category]));
  const practiceTopicIds = [...new Set(ids)].filter((id) => lookup.has(id));
  return { practiceTopicIds, specialties: [...new Set([...specialties, ...practiceTopicIds.map((id) => lookup.get(id)!)])] };
}
