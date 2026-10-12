# Restyle with the TAG look, logo colours, bigger logo, 3x2 recommendations

## What changes

1. **TAG project look (fonts, shapes, shadows), not its colours**
   - Headings use the Sora font with slightly tighter letter spacing; body text uses Manrope, same as TAG.
   - Corners get rounder (TAG's 1rem radius), and cards get TAG's soft card shadow and smoother text rendering.
   - None of TAG's navy, coral or tangerine colours are copied.

2. **Colours taken from the Mobile School logo**
   - Primary = logo teal (the "SCHOOL" letters, about #14A394). It replaces the slate blue in headers, buttons, active tabs and progress.
   - Secondary = logo lime green (the "MOBILE" letters, about #8CCB1E). It is used for secondary chips and highlights, with dark text on top so it stays readable.
   - All other colours stay as they are, including the orange bottom bar and buttons, the backgrounds, the error red and the grey text.

3. **Logo 50% bigger**
   - Side menu: from about 48px to 72px tall on tablets, and from about 112px to 168px on desktop.
   - Sign-in, sign-up and password pages: from 112px to 168px.

4. **"Recommended for you": 3 columns, 2 rows**
   - On tablet and desktop, the section shows exactly 6 course cards in 3 columns and 2 rows. Phones keep 2 columns.
   - The catalogue has only 5 courses today, so I'll add a 6th sample course, **"Soil Health & Composting"**, to fill the grid. It is made-up content like the others, using an existing photo, and you can swap in a real course later.
   - Other home sections ("Continue learning", "Aquaponics & Water") switch to the same 3-column layout so the page lines up.

## Technical details

- `src/styles.css`: add `@import "@fontsource-variable/sora"` and `"@fontsource-variable/manrope"` at the top (install both packages). Add `--font-sans` and `--font-display` in `@theme`, plus `--shadow-card` and `--shadow-elevated`. Set `--radius: 1rem`. Set `h1–h6` to the display font with letter-spacing -0.02em and add font smoothing. Change only `--primary`, `--ring`, `--secondary` and `--secondary-foreground` to oklch versions of the logo teal and lime. Remove the Plus Jakarta Sans link from `__root.tsx`.
- `AppShell.tsx`: change the logo classes from `h-12 lg:h-28` to `h-[72px] lg:h-[168px]`. `auth.tsx` AuthCard: change `h-28` to `h-[168px]`.
- `index.tsx`: the Section grid becomes `grid-cols-2 md:grid-cols-3`, with no xl 4-column step. "Recommended" uses `courses.slice(0, 6)`. Cards get `shadow-[var(--shadow-card)]`.
- `src/lib/courses.ts`: add a 6th course entry with the same shape and lessons, reusing an existing photo pointer.
- Check the home page at 390, 820 and 1280px for a 3x2 grid and no sideways scrolling.
