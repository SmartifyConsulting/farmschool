import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateCourseDescription } from "@/lib/studio-ai.functions";
import { friendlyError } from "@/lib/friendly-error";

/** "Write with AI" for the course description; uses the uploaded manual as reference when there is one. */
export function DescriptionAssistant({ courseId, title, sourceText, onText }: { courseId: string; title: string; sourceText: string; onText: (t: string) => void }) {
  const run = useServerFn(generateCourseDescription);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={async () => {
        setBusy(true);
        try { const r = await run({ data: { courseId, title, sourceText: sourceText || undefined } }); onText(r.text); toast.success(r.usedManual ? "Description drafted from your manual. Review it, then save." : "Description drafted from your lessons. Review it, then save."); }
        catch (e) { toast.error(friendlyError(e, "Could not write a description.")); }
        finally { setBusy(false); }
      }}><Sparkles className="h-3.5 w-3.5" />{busy ? "Writing…" : "Write description with AI"}</Button>
      <span className="text-xs text-muted-foreground">{sourceText ? "Uses your uploaded manual as reference." : "Upload a manual under “Manual & learning design” for a richer draft."}</span>
    </div>
  );
}
