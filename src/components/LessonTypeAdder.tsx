import { useState } from "react";
import { FileText, LayoutGrid, Video, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SlideSubKind = "reading" | "video" | "scorm";

const SUB_KINDS: { kind: SlideSubKind; label: string; icon: typeof FileText }[] = [
  { kind: "reading", label: "Reading", icon: FileText },
  { kind: "video", label: "Video", icon: Video },
  { kind: "scorm", label: "SCORM", icon: Package },
];

/**
 * How a lesson is delivered: Reading, Video or SCORM directly, or as a sequence of Slides —
 * where Slides itself is just a container choosing how many slides and each slide's own
 * Reading/Video/SCORM type. Knowledge-testing (quiz, scenarios, etc.) is a separate concern,
 * selected per-lesson elsewhere — it never appears in this row.
 */
export function LessonTypeAdder({
  disabled,
  onAdd,
  onAddSlides,
}: {
  disabled?: boolean;
  onAdd: (kind: "reading" | "video" | "scorm") => void;
  onAddSlides: (subKinds: SlideSubKind[]) => void;
}) {
  const [slideMode, setSlideMode] = useState(false);
  const [count, setCount] = useState(3);
  const [subKinds, setSubKinds] = useState<SlideSubKind[]>(["reading", "reading", "reading"]);

  const setCountClamped = (n: number) => {
    const next = Math.max(1, Math.min(20, n));
    setCount(next);
    setSubKinds((prev) => {
      const copy = prev.slice(0, next);
      while (copy.length < next) copy.push("reading");
      return copy;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant={slideMode ? "secondary" : "outline"}
          disabled={disabled}
          onClick={() => setSlideMode((v) => !v)}
        >
          <LayoutGrid className="h-3 w-3" />
          Slides
        </Button>
        {SUB_KINDS.map(({ kind, label, icon: Icon }) => (
          <Button
            key={kind}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || slideMode}
            onClick={() => onAdd(kind)}
          >
            <Icon className="h-3 w-3" />
            {label}
          </Button>
        ))}
      </div>
      {slideMode && (
        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2">
          <label className="flex items-center gap-2 text-xs font-medium">
            Number of slides
            <Input
              type="number"
              min={1}
              max={20}
              value={count}
              disabled={disabled}
              onChange={(e) => setCountClamped(Number(e.target.value) || 1)}
              className="h-7 w-16 text-xs"
            />
          </label>
          <div className="space-y-1.5">
            {subKinds.map((sub, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-14 shrink-0 text-muted-foreground">Slide {i + 1}</span>
                <select
                  value={sub}
                  disabled={disabled}
                  onChange={(e) =>
                    setSubKinds((prev) =>
                      prev.map((s, si) => (si === i ? (e.target.value as SlideSubKind) : s)),
                    )
                  }
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                >
                  {SUB_KINDS.map(({ kind, label }) => (
                    <option key={kind} value={kind}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <Button type="button" size="sm" disabled={disabled} onClick={() => onAddSlides(subKinds)}>
            Add {count} slide{count === 1 ? "" : "s"}
          </Button>
        </div>
      )}
    </div>
  );
}
