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
