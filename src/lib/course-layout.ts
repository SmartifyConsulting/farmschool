export type LayoutSettings = {
  /** Blocks stretch edge to edge across the page, bypassing the usual width cap. */
  fullWidth?: boolean;
  /** Default width of the content inside each block, as a percent (0-100) of the available space. */
  contentWidth?: number;
  align?: "left" | "center" | "right";
  /** Uniform padding (px) around content — a single value applied to every side, not the 4
   * independent top/left/right/bottom values Coursebox offers, to keep this one control. */
  spacing?: number;
};

/** Inline style for the content wrapper: width cap, horizontal alignment and padding. Full width
 * is handled separately (it changes which Sheet variant wraps the page, not this style). */
export function courseLayoutStyle(settings: LayoutSettings | null | undefined): Record<string, string> {
  const width = typeof settings?.contentWidth === "number" ? Math.min(100, Math.max(10, settings.contentWidth)) : 100;
  const align = settings?.align ?? "center";
  const spacing = typeof settings?.spacing === "number" ? Math.min(80, Math.max(0, settings.spacing)) : 0;
  return {
    maxWidth: `${width}%`,
    marginLeft: align === "right" ? "auto" : align === "center" ? "auto" : "0",
    marginRight: align === "left" ? "auto" : align === "center" ? "auto" : "0",
    padding: `${spacing}px`,
  };
}
