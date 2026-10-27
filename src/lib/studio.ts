export const STUDIO_CATEGORIES = [
  "Crop Farming", "Livestock", "Poultry", "Horticulture", "Soil Management", "Irrigation and Water Management",
  "Pest and Disease Management", "Agricultural Machinery", "Farm Management", "Agribusiness and Entrepreneurship",
  "Cooperative Management", "Sustainable and Climate-Smart Agriculture", "Agricultural Technology and Innovation",
  "Food Safety and Post-Harvest Management",
];

/** Turns a YouTube link into an embeddable URL; returns null for direct video files. */
export function youtubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}

export const PASS_MARKS = [50, 60, 70, 75, 80, 90, 100] as const;
export const DEFAULT_PASS_MARK = 70;
/** Quiz lessons keep their pass mark in the lesson body as "pass:NN" (learner-visible, not secret). */
export function parsePassMark(body: string | null | undefined): number {
  const m = body?.match(/^pass:(\d{1,3})$/);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 100 ? n : DEFAULT_PASS_MARK;
}
/** Short public credential code printed on a certificate. */
export function credentialCode(certId: string): string {
  return `MS-${certId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}
