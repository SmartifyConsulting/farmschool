import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, LoaderCircle, Save, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { courseWizardInput, readWizardEvents, wizardDefaults, type CourseWizardDraft, type CourseWizardInput } from "@/lib/course-wizard";
import { saveWizardDraft } from "@/lib/course-wizard.functions";
import { PASS_MARKS } from "@/lib/studio";
import { friendlyError } from "@/lib/friendly-error";
import { useConfirm } from "@/components/ConfirmDialog";

export function CourseWizard() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState<CourseWizardInput>(wizardDefaults);
  const [draft, setDraft] = useState<CourseWizardDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const courseId = useRef<string | null>(null);
  const save = useServerFn(saveWizardDraft);
  const nav = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  useEffect(() => () => controller.current?.abort(), []);

  const close = async () => {
    if (saving) return;
    if ((busy || draft) && !await confirm({ title: "Leave this course draft?", description: "This draft has not been saved. Leaving will discard it and stop any generation in progress.", confirmLabel: "Discard draft", cancelLabel: "Keep working" })) return;
    controller.current?.abort();
    setOpen(false); setDraft(null); setReviewed(false); setError("");
  };
  const generate = async () => {
    const parsed = courseWizardInput.safeParse(input);
    if (!parsed.success) { setError("Enter a topic of at least 10 characters and complete the course settings."); return; }
    setBusy(true); setError(""); setDraft(null); setReviewed(false);
    setProgress("Connecting to OpenAI…");
    const abort = new AbortController(); controller.current = abort;
    let received = false;
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Please sign in again to create a course.");
      const response = await fetch("/api/course-wizard", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session.access_token}` },
        body: JSON.stringify(parsed.data), signal: abort.signal,
      });
      if (!response.ok) { const failure = await response.json().catch(() => null); throw new Error(failure?.message ?? "The course could not be generated. Please try again later."); }
      await readWizardEvents(response, event => {
        if (event.type === "progress") setProgress(event.message);
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "draft") { received = true; courseId.current = crypto.randomUUID(); setDraft(event.draft); }
      });
      if (!received && !abort.signal.aborted) throw new Error("The draft was interrupted. Nothing has been saved.");
    } catch (err) {
      if (!abort.signal.aborted) setError(friendlyError(err, "The draft could not be generated. Nothing has been saved."));
      else setProgress("Generation stopped. Nothing has been saved.");
      if (!abort.signal.aborted) setProgress("");
    } finally { if (controller.current === abort) { setBusy(false); controller.current = null; } }
  };
  const saveDraft = async () => {
    if (!draft || !courseId.current || !reviewed || saving) return;
    setSaving(true); setError("");
    try {
      const result = await save({ data: { courseId: courseId.current, input, draft } });
      await qc.invalidateQueries({ queryKey: ["studio-mine"] });
      toast.success("Your course draft is saved. It is not published.");
      setOpen(false); setDraft(null);
      await nav({ to: "/studio/$id", params: { id: result.id } });
    } catch (err) { setError(friendlyError(err, "Your draft could not be saved. Please try again.")); }
    finally { setSaving(false); }
  };
  return <>
    <Button variant="secondary" onClick={() => setOpen(true)}><Sparkles className="h-4 w-4" />Generate with AI</Button>
    <Dialog open={open} onOpenChange={value => { if (!value) void close(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-lg p-5 sm:p-7" onInteractOutside={event => { if (busy || saving) event.preventDefault(); }}>
        <DialogHeader className="pr-7 text-left">
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />{draft ? "Review your course draft" : "Create a course with AI"}</DialogTitle>
          <DialogDescription>{draft ? "Unpublished · trainer review required" : "Your OpenAI account · draft course"}</DialogDescription>
        </DialogHeader>
        {!draft && <form onSubmit={event => { event.preventDefault(); void generate(); }} className="space-y-5">
          <div className="space-y-2"><Label htmlFor="wizard-topic">What should the course teach?</Label><Textarea id="wizard-topic" value={input.topic} onChange={e => setInput({ ...input, topic: e.target.value })} placeholder="Composting for smallholder farmers: building a pile, maintaining it, and using finished compost safely" maxLength={1000} rows={4} disabled={busy} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="wizard-audience">Learners</Label><Input id="wizard-audience" value={input.audience} onChange={e => setInput({ ...input, audience: e.target.value })} maxLength={200} disabled={busy} /></div>
            <div className="space-y-2"><Label htmlFor="wizard-language">Language</Label><Input id="wizard-language" value={input.language} onChange={e => setInput({ ...input, language: e.target.value })} maxLength={60} disabled={busy} /></div>
            <div className="space-y-2"><Label htmlFor="wizard-level">Level</Label><Select value={input.level} onValueChange={level => setInput({ ...input, level: level as CourseWizardInput["level"] })} disabled={busy}><SelectTrigger id="wizard-level"><SelectValue /></SelectTrigger><SelectContent>{["Beginner", "Intermediate", "Advanced"].map(level => <SelectItem key={level} value={level}>{level}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="wizard-count">Reading lessons</Label><Input id="wizard-count" type="number" min={2} max={8} value={input.lessonCount} onChange={e => setInput({ ...input, lessonCount: Number(e.target.value) })} disabled={busy} /></div>
            <div className="space-y-2"><Label htmlFor="wizard-pass">Final quiz pass mark</Label><Select value={String(input.passMark)} onValueChange={n => setInput({ ...input, passMark: Number(n) })} disabled={busy}><SelectTrigger id="wizard-pass"><SelectValue /></SelectTrigger><SelectContent>{PASS_MARKS.map(mark => <SelectItem key={mark} value={String(mark)}>{mark}%</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="flex flex-wrap items-center gap-3">{busy ? <Button type="button" variant="outline" onClick={() => controller.current?.abort()}><Square className="h-4 w-4" />Stop</Button> : <Button type="submit"><Sparkles className="h-4 w-4" />Generate course draft</Button>}<span role="status" className="flex items-center gap-2 text-sm text-muted-foreground">{busy && <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />}{progress}</span></div>
        </form>}
        {draft && <div className="space-y-5">
          <div className="space-y-2"><Label htmlFor="wizard-title">Course title</Label><Input id="wizard-title" value={draft.title} maxLength={120} disabled={saving} onChange={e => setDraft({ ...draft, title: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="wizard-description">Description</Label><Textarea id="wizard-description" value={draft.description} maxLength={4000} disabled={saving} onChange={e => setDraft({ ...draft, description: e.target.value })} /></div>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground"><span>{draft.category}</span><span>{input.level}</span><span>{draft.lessons.length} readings + final quiz</span><span>{input.passMark}% pass mark</span></div>
          <div className="divide-y divide-border border-y border-border">{draft.lessons.map((lesson, index) => <details key={index} className="py-3"><summary className="cursor-pointer font-medium"><BookOpen className="mr-2 inline h-4 w-4 text-primary" />{index + 1}. {lesson.title}</summary><div className="mt-3 space-y-2"><Input aria-label={`Lesson ${index + 1} title`} maxLength={120} value={lesson.title} disabled={saving} onChange={e => setDraft({ ...draft, lessons: draft.lessons.map((l, i) => i === index ? { ...l, title: e.target.value } : l) })} /><Textarea aria-label={`Lesson ${index + 1} content`} rows={12} maxLength={20000} value={lesson.body} disabled={saving} onChange={e => setDraft({ ...draft, lessons: draft.lessons.map((l, i) => i === index ? { ...l, body: e.target.value } : l) })} /></div></details>)}
          <details className="py-3"><summary className="cursor-pointer font-medium">{draft.quiz.title} · {draft.quiz.questions.length} questions</summary><ol className="mt-3 space-y-4">{draft.quiz.questions.map((q, i) => <li key={i}><p className="font-medium">{i + 1}. {q.question}</p><ul className="mt-2 space-y-1 text-sm">{q.options.map((option, j) => <li key={j} className={`flex items-center gap-2 ${j === q.correctIndex ? "text-primary" : "text-muted-foreground"}`}>{j === q.correctIndex ? <Check className="h-4 w-4 shrink-0" /> : <span className="w-4 shrink-0" />}{option}</li>)}</ul></li>)}</ol></details></div>
          <Label className="flex items-start gap-3 text-sm leading-relaxed"><input type="checkbox" checked={reviewed} disabled={saving} onChange={e => setReviewed(e.target.checked)} className="mt-1 shrink-0 accent-primary" />I have reviewed the draft. I will check the facts and quiz answers before publishing.</Label>
          <div className="flex flex-wrap gap-3"><Button disabled={!reviewed || saving} onClick={() => void saveDraft()}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Save className="h-4 w-4" />}{saving ? "Saving…" : "Save draft & open editor"}</Button><Button variant="outline" disabled={saving} onClick={() => void close()}>Discard draft</Button></div>
        </div>}
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  </>;
}