/** Deterministic hue from a string so the same lesson title always gets the same banner colour. */
function hueFromText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash % 360;
}

/** A title banner for a committed lesson's page preview — deterministic per-lesson colour, no image upload required. */
export function HeroBanner({ title }: { title: string }) {
  const hue = hueFromText(title || "Lesson");
  return (
    <div
      className="flex min-h-28 items-center justify-center rounded-md px-6 py-8 text-center"
      style={{ background: `linear-gradient(135deg, hsl(${hue} 55% 28%), hsl(${(hue + 40) % 360} 55% 18%))` }}
    >
      <h3 className="text-xl font-bold text-white sm:text-2xl">{title || "Untitled lesson"}</h3>
    </div>
  );
}
