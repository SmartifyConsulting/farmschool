import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { polishText, TONE_OPTIONS, type PolishTone } from "@/lib/studio-ai.functions";
import { friendlyError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";

/** Rewrites existing text (description, lesson body) in a chosen tone. Usable before a course exists — pass no courseId. */
export function PolishButton({
  courseId,
  title,
  text,
  onText,
}: {
  courseId?: string;
  title: string;
  text: string;
  onText: (t: string) => void;
}) {
  const run = useServerFn(polishText);
  const [tone, setTone] = useState<PolishTone>("professional");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Polish tone"
        value={tone}
        onChange={(e) => setTone(e.target.value as PolishTone)}
        className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
      >
        {TONE_OPTIONS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy || !text.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await run({ data: { courseId, title, text, tone } });
            onText(r.text);
            toast.success("Polished. Review it, then save.");
          } catch (e) {
            toast.error(friendlyError(e, "Could not polish this text."));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {busy ? "Polishing…" : "Polish"}
      </Button>
    </div>
  );
}
