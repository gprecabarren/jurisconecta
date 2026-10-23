export type SearchableCaseType = { topic: string; category: string; searchKeywords?: readonly string[] };
const commonWords = new Set(["a", "al", "con", "de", "del", "el", "en", "la", "las", "lo", "los", "me", "mi", "mis", "para", "por", "que", "se", "un", "una", "y"]);

/** Local discovery only: never send the visitor's words in a URL, log or API request. */
export function normalizeCaseSearch(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/** The caller controls visibility/permissions; this helper only ranks the supplied catalog. */
export function searchCaseTypes<T extends SearchableCaseType>(types: readonly T[], rawQuery: string): T[] {
  const query = normalizeCaseSearch(rawQuery.slice(0, 120));
  if (!query) return [...types];
  const words = query.split(" ");
  const meaningfulWords = words.filter((word) => !commonWords.has(word));
  const tokens = [...new Set(meaningfulWords.length ? meaningfulWords : words)].slice(0, 8);
  const matches = (field: string, token: string) => field.split(" ").some((word) => word.startsWith(token));
  return types.map((type, index) => {
    const topic = normalizeCaseSearch(type.topic), category = normalizeCaseSearch(type.category);
    const keywords = (type.searchKeywords || []).map(normalizeCaseSearch);
    if (!tokens.every((token) => matches(topic, token) || matches(category, token) || keywords.some((keyword) => matches(keyword, token)))) return { type, index, score: 0 };
    const phraseScore = topic === query ? 500 : topic.startsWith(query) ? 400 : topic.includes(query) ? 350 : keywords.includes(query) ? 300 : keywords.some((keyword) => keyword.startsWith(query)) ? 250 : category === query ? 100 : 50;
    const wordScore = tokens.reduce((score, token) => score + (matches(topic, token) ? 30 : keywords.some((keyword) => matches(keyword, token)) ? 10 : 3), 0);
    return { type, index, score: phraseScore + wordScore };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).map((item) => item.type);
}
