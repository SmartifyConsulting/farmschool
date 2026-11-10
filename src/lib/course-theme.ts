/** Per-course accent colour, chosen from a small fixed palette so contrast stays safe. No AI avatars, no free-form hex. */
export const COURSE_THEMES = {
  default: {
    label: "Default",
    primary: "oklch(0.68 0.15 222)",
    primaryForeground: "oklch(0.98 0 0)",
  },
  forest: {
    label: "Forest",
    primary: "oklch(0.58 0.14 150)",
    primaryForeground: "oklch(0.98 0 0)",
  },
  clay: { label: "Clay", primary: "oklch(0.62 0.17 45)", primaryForeground: "oklch(0.98 0 0)" },
  sun: { label: "Sun", primary: "oklch(0.78 0.16 90)", primaryForeground: "oklch(0.2 0 0)" },
  berry: { label: "Berry", primary: "oklch(0.55 0.19 350)", primaryForeground: "oklch(0.98 0 0)" },
} as const;

export type CourseThemeName = keyof typeof COURSE_THEMES;
export const COURSE_THEME_NAMES = Object.keys(COURSE_THEMES) as CourseThemeName[];

export function isCourseTheme(value: string | null | undefined): value is CourseThemeName {
  return !!value && value in COURSE_THEMES;
}

/** CSS custom-property overrides to scope the theme to one course's pages. */
export function courseThemeStyle(theme: string | null | undefined): Record<string, string> {
  const resolved = COURSE_THEMES[isCourseTheme(theme) ? theme : "default"];
  return { "--primary": resolved.primary, "--primary-foreground": resolved.primaryForeground };
}
