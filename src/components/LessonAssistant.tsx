import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { assistLesson } from "@/lib/studio-ai.functions";
import { friendlyError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Q = { q: string; options: string[]; answer: number };
type Props = { courseId: string; title: string; kind: string; text: string; onText: (t: string) => void; onQuestions: (q: Q[]) => void };

/** Trainer-only AI suggestions; nothing applies until the trainer accepts, and nothing saves until "Save lesson". */
export function LessonAssistant({ courseId, title, kind, text, onText, onQuestions }: Props) {
  const run = useServerFn(assistLesson);
  const [busy, setBusy] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [preview, setPreview] = useState<{ text?: string; questions?: Q[] } | null>(null);
  const go = async (action: "simplify" | "expand" | "format" | "custom" | "quiz") => {
    setBusy(action); setPreview(null);
    try {
      const r = await run({ data: { courseId, action, title, text, instruction: action === "custom" ? custom : undefined } });
      setPreview(r.kind === "quiz" ? { questions: r.questions } : { text: r.text });
    } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(null); }
  };
  const isQuiz = kind === "quiz";
  return (
    <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-primary"><Sparkles className="h-3.5 w-3.5" />AI assistant</p>
      {isQuiz ? <>
        <p className="text-xs text-muted-foreground">Writes 3–5 questions from the lesson just before this quiz. Check each answer before saving.</p>
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => go("quiz")}>{busy ? "Writing questions…" : "Generate questions"}</Button>
      </> : <>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => go("simplify")}>{busy === "simplify" ? "Working…" : "Simplify for beginners"}</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => go("expand")}>{busy === "expand" ? "Working…" : "Add practical steps"}</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => go("format")}>{busy === "format" ? "Working…" : "Tidy headings & checklist"}</Button>
        </div>
        <div className="flex gap-1.5"><Input value={custom} onChange={e => setCustom(e.target.value)} maxLength={500} placeholder="Or ask: e.g. add a section on rainy-season care" aria-label="Custom request" />
          <Button size="sm" disabled={!!busy || !custom.trim()} onClick={() => go("custom")}>{busy === "custom" ? "…" : "Ask"}</Button></div>
      </>}
      {preview && <div className="space-y-2 rounded-lg border border-border bg-card p-2">
        <p className="text-xs font-medium">Suggestion — review before using</p>
        {preview.text && <p className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{preview.text}</p>}
        {preview.questions?.map((q, i) => <div key={i} className="text-xs"><p className="font-medium">{i + 1}. {q.q}</p>{q.options.map((o, j) => <p key={j} className={j === q.answer ? "text-primary" : "text-muted-foreground"}>{j === q.answer ? "✓ " : "• "}{o}</p>)}</div>)}
        <div className="flex gap-2">
          <Button size="sm" onClick={() => { if (preview.text) onText(preview.text); if (preview.questions) onQuestions(preview.questions); setPreview(null); toast.success("Applied. Press Save lesson to keep it."); }}>{preview.questions ? "Add questions" : "Use this text"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Discard</Button>
        </div>
      </div>}
    </div>
  );
}
