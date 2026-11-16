import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { polishText, TONE_OPTIONS, type PolishTone } from "@/lib/studio-ai.functions";
import { friendlyError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";

/** Rewrites existing text (description, lesson body) in a chosen tone. Usable before a course exists — pass no courseId.
 * Pass `tone` to use a shared, externally-chosen tone and show only the regenerate icon (no per-field dropdown). */
export function PolishButton({
  courseId,
  title,
  text,
  onText,
  tone: toneProp,
}: {
  courseId?: string;
  title: string;
  text: string;
  onText: (t: string) => void;
  tone?: PolishTone;
}) {
  const run = useServerFn(polishText);
  const [toneState, setToneState] = useState<PolishTone>("professional");
  const tone = toneProp ?? toneState;
  const [busy, setBusy] = useState(false);
  const regenerate = async () => {
    setBusy(true);
    try {
      const r = await run({ data: { courseId, title, text, tone } });
      onText(r.text);
      toast.success("Regenerated. Review it, then save.");
    } catch (e) {
      toast.error(friendlyError(e, "Could not regenerate this text."));
    } finally {
      setBusy(false);
    }
  };
  if (toneProp !== undefined) {
    return (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        title="Regenerate with AI"
        aria-label="Regenerate with AI"
        disabled={busy || !text.trim()}
        onClick={regenerate}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <select
        aria-label="Regenerate tone"
        value={tone}
        onChange={(e) => setToneState(e.target.value as PolishTone)}
        className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
      >
        {TONE_OPTIONS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <Button type="button" size="sm" variant="ghost" disabled={busy || !text.trim()} onClick={regenerate}>
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Regenerating…" : "Regenerate"}
      </Button>
    </div>
  );
}
