/** Shared industry taxonomy for course discovery. Unknown creator categories stay visible under Other. */
export const INDUSTRIES = [
  "Agriculture", "Healthcare", "Business", "Retail", "Manufacturing",
  "Hospitality", "Technology", "Trades", "Education", "Other",
] as const;

const AGRICULTURE_TOPICS = new Set([
  "aquaponics", "water quality", "operations", "market access", "monitoring",
  "crops", "irrigation", "livestock", "soil science", "farming", "agriculture",
  "farm management", "soil health", "crop farming", "poultry", "horticulture",
  "soil management", "irrigation and water management", "pest and disease management",
  "agricultural machinery", "agribusiness and entrepreneurship", "cooperative management",
  "sustainable and climate-smart agriculture", "agricultural technology and innovation",
  "food safety and post-harvest management",
]);

export function courseIndustry(category: string): string {
  const normalized = category.trim().toLowerCase();
  const prefix = normalized.split(" / ")[0];
  const explicit = INDUSTRIES.find((name) => name.toLowerCase() === prefix);
  if (explicit) return explicit;
  if (AGRICULTURE_TOPICS.has(normalized)) return "Agriculture";
  const industry = INDUSTRIES.find((name) => name.toLowerCase() === normalized);
  return industry ?? "Other";
}
