/** A small, curated set of Google Fonts — safe to load on demand, no arbitrary free-text font
 * names (which would mean loading arbitrary external stylesheets). */
export const COURSE_FONTS = {
  system: { label: "Default", family: "", googleFont: null },
  inter: { label: "Inter", family: "'Inter', sans-serif", googleFont: "Inter:wght@400;600;700" },
  biorhyme: { label: "BioRhyme", family: "'BioRhyme', serif", googleFont: "BioRhyme:wght@400;700" },
  jakarta: { label: "Plus Jakarta Sans", family: "'Plus Jakarta Sans', sans-serif", googleFont: "Plus+Jakarta+Sans:wght@400;600;700" },
  merriweather: { label: "Merriweather", family: "'Merriweather', serif", googleFont: "Merriweather:wght@400;700" },
  poppins: { label: "Poppins", family: "'Poppins', sans-serif", googleFont: "Poppins:wght@400;600;700" },
  lora: { label: "Lora", family: "'Lora', serif", googleFont: "Lora:wght@400;600" },
} as const;

export type CourseFontName = keyof typeof COURSE_FONTS;
export const COURSE_FONT_NAMES = Object.keys(COURSE_FONTS) as CourseFontName[];
export function isCourseFont(value: string | null | undefined): value is CourseFontName {
  return !!value && value in COURSE_FONTS;
}

export const DENSITY_SCALE = {
  compact: { label: "Compact", bodySize: "14px", lineHeight: "1.5" },
  standard: { label: "Standard", bodySize: "16px", lineHeight: "1.7" },
  large: { label: "Large", bodySize: "18px", lineHeight: "1.8" },
} as const;
export type DensityName = keyof typeof DENSITY_SCALE;
export function isDensity(value: string | null | undefined): value is DensityName {
  return !!value && value in DENSITY_SCALE;
}

export type FontSettings = {
  headingFont?: string;
  bodyFont?: string;
  density?: string;
};

/** Google Fonts stylesheet URLs to load for the course's chosen fonts, deduplicated — empty if both are the system default. */
export function googleFontHrefs(settings: FontSettings | null | undefined): string[] {
  const names = [settings?.headingFont, settings?.bodyFont].filter(isCourseFont);
  const specs = [...new Set(names.map((n) => COURSE_FONTS[n].googleFont as string | null).filter((g): g is string => !!g))];
  return specs.map((spec) => `https://fonts.googleapis.com/css2?family=${spec}&display=swap`);
}

/** CSS custom-property overrides for a course's typography — font families and base text size/line-height. */
export function courseFontStyle(settings: FontSettings | null | undefined): Record<string, string> {
  const vars: Record<string, string> = {};
  const heading = isCourseFont(settings?.headingFont) ? COURSE_FONTS[settings.headingFont].family : "";
  const body = isCourseFont(settings?.bodyFont) ? COURSE_FONTS[settings.bodyFont].family : "";
  if (heading) vars["--course-heading-font"] = heading;
  if (body) vars["--course-body-font"] = body;
  const density = DENSITY_SCALE[isDensity(settings?.density) ? settings.density : "standard"];
  vars["--course-body-size"] = density.bodySize;
  vars["--course-line-height"] = density.lineHeight;
  return vars;
}
