import { courseIndustry, INDUSTRY_TOPICS } from "./industries";

const SECTOR_LABELS: Record<string, string> = {
  Agriculture: "Agriculture",
  Healthcare: "Healthcare",
  Business: "Business and Professional Services",
  Retail: "Retail and Wholesale",
  Manufacturing: "Manufacturing",
  Hospitality: "Hospitality and Tourism",
  Technology: "Information Technology",
  Trades: "Skilled Trades",
  Education: "Education and Training",
  Finance: "Financial Services",
  Construction: "Construction",
  "Transportation & Logistics": "Transport and Logistics",
  "Energy & Utilities": "Energy and Utilities",
  "Government & Public Sector": "Government and Public Services",
  "Nonprofit & Community Services": "Nonprofit and Community Services",
  "Media & Creative Arts": "Media and Creative Industries",
  Legal: "Legal Services",
  "Real Estate": "Real Estate",
  "Sports & Recreation": "Sports and Recreation",
  Telecommunications: "Telecommunications",
  "Food & Beverage": "Food and Beverage",
};

const TOPIC_ALIASES: Record<string, string> = {
  "customer service": "Business",
  "digital literacy": "Technology",
  "financial literacy": "Finance",
  "personal finance": "Finance",
};

export const CATALOGUE_SECTORS = [
  ...Object.values(SECTOR_LABELS),
  "General and Cross-industry",
  "Uncategorised",
].sort((a, b) => a.localeCompare(b));

/** Discovery labels only: never changes stored categories or portal access rules. */
export function catalogueSector(category: string): string {
  const normalized = category.trim().toLowerCase();
  const prefix = normalized.split(" / ")[0];
  const label = Object.values(SECTOR_LABELS).find((name) => name.toLowerCase() === prefix);
  if (label) return label;
  const industry = courseIndustry(category);
  if (SECTOR_LABELS[industry]) return SECTOR_LABELS[industry];
  if (TOPIC_ALIASES[normalized]) return SECTOR_LABELS[TOPIC_ALIASES[normalized]]!;
  const matches = Object.entries(INDUSTRY_TOPICS).filter(([, topics]) =>
    topics.some((topic) => topic.toLowerCase() === normalized),
  );
  if (matches.length > 1) return "General and Cross-industry";
  if (matches.length === 1) return SECTOR_LABELS[matches[0]![0]]!;
  return "Uncategorised";
}

export function sectorInitial(name: string): string {
  return name.normalize("NFD").replace(/\p{M}/gu, "").trim().charAt(0).toUpperCase();
}
