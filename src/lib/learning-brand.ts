import { z } from "zod";
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const learningBrandSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  logo: z.string().nullable(),
});
export type LearningBrand = z.infer<typeof learningBrandSchema>;
export function brandContext(path: string): { course: string | null; organization: string | null } {
  const workspace = path.match(new RegExp(`^/organizations/(${uuid})(?:/|$)`, "i"));
  if (workspace) return { course: null, organization: workspace[1]! };
  const course = path.match(new RegExp(`^/(?:class|studio|gradebook)/(${uuid})/?$`, "i"));
  return { course: course?.[1] ?? null, organization: null };
}
export function safeBrandLogo(value: string | null) {
  if (!value || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
const linear = (value: number) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const luminance = (rgb: number[]) =>
  0.2126 * linear(rgb[0]!) + 0.7152 * linear(rgb[1]!) + 0.0722 * linear(rgb[2]!);
export function accessibleBrandColor(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error("Invalid workspace color");
  let rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  while (1.05 / (luminance(rgb) + 0.05) < 7) rgb = rgb.map((channel) => channel * 0.95);
  const [r, g, b] = rgb.map(linear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const labB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.hypot(a, labB),
    hue = ((Math.atan2(labB, a) * 180) / Math.PI + 360) % 360;
  return {
    css: `oklch(${lightness.toFixed(6)} ${chroma.toFixed(6)} ${hue.toFixed(3)})`,
    contrast: 1.05 / (luminance(rgb) + 0.05),
  };
}
