import { categoryForTopic, legalAreas } from "./legal-catalog";
import type { CaseType } from "./case-intake";
import { defaultCaseSearchKeywords } from "./case-search-keywords";

export type CaseCatalogSummary = Pick<CaseType, "id" | "category" | "topic" | "icon" | "enabled" | "sortOrder" | "searchKeywords">;
const categoryIcons: Record<string, string> = { "Derecho Civil": "House", "Derecho Familiar": "HeartHandshake", "Derecho Laboral": "BriefcaseBusiness", "Derecho Penal": "ShieldCheck", "Derecho Comercial": "Building2", "Derecho Tributario": "Landmark", "Protección al Consumidor": "ShoppingBag", "Derechos Humanos": "Fingerprint", "Otros Casos": "Scale" };
const topicIcons: Record<string, string> = { "Pensión alimenticia": "HandCoins", "Inmigración en Chile": "Globe", "Divorcio": "HeartHandshake", "Herencias y posesiones efectivas": "KeyRound", "Deudas y embargos": "Banknote", "Accidentes de tránsito": "Car", "Tuición": "Baby", "Negligencia médica": "Stethoscope", "Mascotas": "Dog", "Educación": "GraduationCap", "Delitos informáticos": "Laptop", "Inversión extranjera": "Globe", "Recursos naturales y medioambientales": "Leaf", "Transporte": "Plane", "Telecomunicaciones": "Phone", "Constitución y asesoría de sindicatos": "Network" };
export function caseTypeSlug(topic: string): string { return topic.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
export function iconForCaseType(topic: string, category: string) { return topicIcons[topic] || categoryIcons[category] || "Scale"; }
export function summarizeCaseType(type: CaseCatalogSummary): CaseCatalogSummary {
  return { id: type.id, category: type.category, topic: type.topic, icon: type.icon, enabled: type.enabled, sortOrder: type.sortOrder, searchKeywords: type.searchKeywords === undefined ? defaultCaseSearchKeywords(type.id) : [...type.searchKeywords] };
}
/** The public home must not download every question, example and legal reference. */
export const CASE_CATALOG_SUMMARIES: CaseCatalogSummary[] = [...new Set(legalAreas.flatMap((area) => area.topics))].map((original, sortOrder) => {
  const topic = original === "Automóviles e indumotoras" ? "Automóviles y motocicletas" : original;
  const category = categoryForTopic("Casos más frecuentes", original);
  const id = caseTypeSlug(topic);
  return { id, category, topic, icon: iconForCaseType(topic, category), enabled: true, sortOrder, searchKeywords: defaultCaseSearchKeywords(id) };
});
