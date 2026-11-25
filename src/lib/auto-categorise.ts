import { CATALOGUE_SECTORS } from "./catalogue-sectors";

export type CategoriseItem = {
  id: string;
  title: string;
  description: string;
  folderId: string | null;
  sector: string;
  published?: boolean;
};

const RULES: [string, RegExp][] = [
  [
    "Agriculture",
    /\b(agricultur\w*|farm\w*|beekeep\w*|bees?|honey|apiar\w*|cows?|livestock|crop\w*|irrigation|poultry|soil|dairy)\b/i,
  ],
  [
    "Financial Services",
    /\b(financ\w*|accounting|bookkeeping|investments?|valuation|portfolios?|banking|insurance)\b/i,
  ],
  [
    "Business and Professional Services",
    /\b(business|entrepreneur\w*|project management|customer service|human resources|leadership|marketing)\b/i,
  ],
  [
    "Information Technology",
    /\b(python|programming|algorithms?|data structures|machine learning|neural networks?|digital (skills|literacy)|cyber\w*|software|comput\w*)\b/i,
  ],
  ["Healthcare", /\b(autism|adhd|health\w*|medical|nursing|physiology|anatomy|clinical)\b/i],
  [
    "Education and Training",
    /\b(algebra|mathematics|english|reading|writing|teaching|education|pedagogy)\b/i,
  ],
  ["Construction", /\b(construction|civil engineering|building sites?)\b/i],
  ["Transport and Logistics", /\b(logistics|transport\w*|warehousing|supply chain)\b/i],
  ["Hospitality and Tourism", /\b(hospitality|tourism|hotels?|travel)\b/i],
  ["Food and Beverage", /\b(food safety|catering|cooking|beverage\w*)\b/i],
  ["Legal Services", /\b(legal|law|litigation)\b/i],
  ["Energy and Utilities", /\b(renewable energy|solar power|electricity|utilities)\b/i],
  ["Manufacturing", /\b(manufactur\w*|factory|production line)\b/i],
  ["Retail and Wholesale", /\b(retail|wholesale|merchandising)\b/i],
  ["Real Estate", /\b(real estate|property management)\b/i],
  ["Sports and Recreation", /\b(sports?|fitness|recreation)\b/i],
  ["Media and Creative Industries", /\b(photography|graphic design|journalism|film production)\b/i],
  ["Government and Public Services", /\b(government|public administration|civil service)\b/i],
  [
    "Nonprofit and Community Services",
    /\b(nonprofit|non-profit|humanitarian|community development)\b/i,
  ],
  ["Skilled Trades", /\b(plumbing|carpentry|welding|electrician)\b/i],
  ["Telecommunications", /\b(telecommunications|telecoms?|mobile networks?)\b/i],
];

/** Prefer the title; competing subjects remain for review rather than guessing. */
export function suggestSector(title: string, description = ""): string {
  for (const text of [title, description]) {
    const matches = RULES.filter(([, rule]) => rule.test(text)).map(([sector]) => sector);
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) return "";
  }
  return "";
}

export function validSector(value: string): boolean {
  return CATALOGUE_SECTORS.includes(value) && value !== "Uncategorised";
}
