import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2, Video, FileText, HelpCircle, Eye } from "lucide-react";
import { Phone, Header, Sheet } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { STUDIO_CATEGORIES, PASS_MARKS, parsePassMark } from "@/lib/studio";
import { toast } from "sonner";
import { buildCourseDraft, type DraftCourse, type SourcePage } from "@/lib/course-factory";
import { extractDocument } from "@/lib/document-extraction";
import { suggestReviewQuestions } from "@/lib/course-quiz-suggestions";

export const Route = createFileRoute("/studio/$id")({
  head: () => ({ meta: [
    { title: "Edit course — Mobile School Studio" },
    { name: "description", content: "Add lessons, videos and quizzes to your course." },
    { property: "og:title", content: "Edit course — Mobile School Studio" },
    { property: "og:description", content: "Build your farming course." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Editor,
});

type Q = { q: string; options: string[]; answer: number };
type LessonRow = { id: string; position: number; kind: string; title: string; video_url: string | null; body: string; quiz: unknown };

function Editor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: course, isLoading } = useQuery({ queryKey: ["studio-course", id], queryFn: async () => (await supabase.from("studio_courses").select("*").eq("id", id).maybeSingle()).data });
  const { data: lessons } = useQuery({ queryKey: ["studio-lessons", id], queryFn: async () => ((await supabase.from("studio_lessons").select("*").eq("course_id", id).order("position")).data ?? []) as LessonRow[] });
  const [sourceText, setSourceText] = useState("");
  const [sourcePages, setSourcePages] = useState<SourcePage[] | null>(null);
  const [sourceName, setSourceName] = useState("Training manual");
  const [draft, setDraft] = useState<DraftCourse | null>(null);
  const [importing, setImporting] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDraft, setAiDraft] = useState<{ lessonTitle: string; lessonSummary: string; questions: { question: string; options: string[]; correctIndex: number; sourceQuote: string }[]; droppedUnsupportedQuestions: number } | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: STUDIO_CATEGORIES[0] ?? "Farm Management", level: "Beginner", cover_url: "" });
  useEffect(() => { if (course) setForm({ title: course.title, description: course.description, category: course.category, level: course.level, cover_url: course.cover_url ?? "" }); }, [course]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["studio-course", id] }); qc.invalidateQueries({ queryKey: ["studio-lessons", id] }); qc.invalidateQueries({ queryKey: ["studio-mine"] }); qc.invalidateQueries({ queryKey: ["studio-published"] }); };

  const readTextFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(pdf|docx|pptx|txt|md)$/i.test(file.name)) {
      toast.error("Choose a PDF, DOCX, PPTX, TXT or MD file.");
      return;
    }
    setReadingFile(true);
    try {
      const pages = await extractDocument(file);
      const text = pages.map((page) => page.text).join("\n\n");
      if (!text.trim()) throw new Error("This file has no readable text.");
      setSourceName(file.name);
      setSourcePages(pages);
      setSourceText(text);
      setDraft(null);
      toast.success("Text loaded. Preview the lessons before importing.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read file.");
    } finally {
      setReadingFile(false);
    }
  };
  const previewSource = () => {
    try {
      const next = buildCourseDraft(form.title || course?.title || "Course", sourcePages ?? [{ sourceId: sourceName.trim() || "Pasted source", page: 1, text: sourceText }]);
      setDraft(next);
      if (!next.lessons.length) toast.error("No readable lessons found.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not parse source."); }
  };
  const importDraft = async () => {
    if (!draft?.lessons.length || importing || course?.published) return;
    if (draft.lessons.some((lesson) => lesson.body.length > 19000)) { toast.error("A lesson exceeds the 20,000-character limit. Split the source into smaller modules."); return; }
    setImporting(true);
    try {
      const start = lessons?.length ?? 0;
      const rows = draft.lessons.map((lesson, index) => ({
        course_id: id, kind: "reading", position: start + index, title: lesson.title,
        body: `${lesson.body}\n\nSource: ${lesson.sourceRefs.map((ref) => `${ref.sourceId}, page ${ref.page}`).join("; ")}\nReview required before publishing.`,
      }));
      const { error } = await supabase.from("studio_lessons").insert(rows);
      if (error) throw error;
      toast.success(`Imported ${rows.length} reading lessons for review.`);
      setDraft(null); setSourceText(""); refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Import failed."); }
    finally { setImporting(false); }
  };

  const generateAiDraft = async () => {
    if (!draft?.lessons.length || aiLoading || course?.published) return;
    const lesson = draft.lessons[0];
    if (!lesson) return;
    setAiLoading(true); setAiDraft(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) throw new Error("Please sign in.");
      const response = await fetch("/api/course-factory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ courseId: id, title: lesson.title, sourceId: lesson.sourceRefs[0]?.sourceId ?? sourceName, sourceText: lesson.body.slice(0, 12000) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "AI generation failed.");
      setAiDraft(payload);
    } catch (error) { toast.error(error instanceof Error ? error.message : "AI generation failed."); }
    finally { setAiLoading(false); }
  };

  const saveAiDraft = async () => {
    if (!aiDraft || course?.published || aiLoading) return;
    if (!aiDraft.questions.length) { toast.error("No source-verified questions to save."); return; }
    setAiLoading(true);
    try {
      const position = lessons?.length ?? 0;
      const { error: readingError } = await supabase.from("studio_lessons").insert({
        course_id: id, kind: "reading", position,
        title: aiDraft.lessonTitle,
        body: `${aiDraft.lessonSummary}\n\nSource: ${draft?.lessons[0]?.sourceRefs.map((ref) => `${ref.sourceId}, page ${ref.page}`).join("; ") ?? sourceName}\nReview required before publishing.`,
      });
      if (readingError) throw readingError;
      const { data: quiz, error: quizError } = await supabase.from("studio_lessons").insert({
        course_id: id, kind: "quiz", position: position + 1,
        title: `Knowledge check: ${aiDraft.lessonTitle}`, body: "pass:80",
        quiz: aiDraft.questions.map((q) => ({ q: q.question, options: q.options })),
      }).select("id").single();
      if (quizError || !quiz) throw quizError ?? new Error("Quiz insert failed.");
      const { error: answerError } = await supabase.from("studio_quiz_answers").upsert({
        lesson_id: quiz.id, course_id: id, answers: aiDraft.questions.map((q) => q.correctIndex),
      });
      if (answerError) throw answerError;
      setAiDraft(null);
      toast.success("AI reading and quiz saved as drafts. Verify all content before publishing.");
      refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save AI draft."); }
    finally { setAiLoading(false); }
  };

  const saveDetails = async () => {
    if (form.cover_url && !/^https:\/\//.test(form.cover_url)) { toast.error("Cover image link must start with https://"); return; }
    const { error } = await supabase.from("studio_courses").update({ ...form, cover_url: form.cover_url || null }).eq("id", id);
    if (error) toast.error("Could not save — check the title is 3–120 letters."); else { toast.success("Saved"); refresh(); }
  };
  const addLesson = async (kind: string) => {
    const { error } = await supabase.from("studio_lessons").insert({ course_id: id, kind, position: lessons?.length ?? 0, title: kind === "quiz" ? "Knowledge check" : kind === "video" ? "New video lesson" : "New reading" });
    if (error) toast.error("Could not add lesson."); else refresh();
  };
  const setPublished = async (published: boolean) => {
    if (published && !reviewConfirmed) { toast.error("Confirm that you have reviewed the course and its quizzes."); return; }
    if (published && !lessons?.length) { toast.error("Add at least one lesson before publishing."); return; }
    if (published && lessons?.some((lesson) => lesson.body.includes("Review required before publishing."))) { toast.error("Imported lessons still need review. Edit each imported lesson and remove the review notice after verifying the content."); return; }
    const { error } = await supabase.from("studio_courses").update({ published }).eq("id", id);
    if (error) { toast.error("Could not change publishing status."); return; }
    setReviewConfirmed(false); refresh();
    toast.success(published ? "Published — it now appears in the catalogue." : "Moved back to draft.");
  };
  const remove = async () => { if (!confirm("Delete this course and all its lessons?")) return; await supabase.from("studio_courses").delete().eq("id", id); refresh(); nav({ to: "/studio" }); };

  if (isLoading) return <Phone><Header title="Loading…" /></Phone>;
  if (!course) return <Phone><Header title="Course not found" /><Sheet><Link to="/studio" className="text-primary">Back to Studio</Link></Sheet></Phone>;
  return (
    <Phone>
      <Header greeting={course.published ? "Published" : "Draft"} title={course.title}>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/studio" className="flex items-center gap-1 rounded-full border border-primary-foreground/50 px-3 py-1 text-xs"><ArrowLeft className="h-3 w-3" />All my courses</Link>
          <Link to="/class/$id" params={{ id }} className="flex items-center gap-1 rounded-full border border-primary-foreground/50 px-3 py-1 text-xs"><Eye className="h-3 w-3" />Preview</Link>
        </div>
      </Header>
      <Sheet>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section className="space-y-3 rounded-2xl border border-border p-4">
            <h2 className="font-semibold">Course details</h2>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Title" maxLength={120} />
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What will farmers learn?" rows={4} maxLength={4000} />
            <div className="grid grid-cols-2 gap-2">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-md border border-input bg-background px-2 py-2 text-sm" aria-label="Category">{STUDIO_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
              <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="rounded-md border border-input bg-background px-2 py-2 text-sm" aria-label="Level">{["Beginner", "Intermediate", "Advanced"].map((c) => <option key={c}>{c}</option>)}</select>
            </div>
            <Input value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} placeholder="Cover image link (https://…)" />
            <Button onClick={saveDetails} className="w-full">Save details</Button>
            <div className="border-t border-border pt-3">
              {!course.published && <label className="mb-3 flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={reviewConfirmed} onChange={(e) => setReviewConfirmed(e.target.checked)} className="mt-0.5" />I have reviewed all lessons, sources and quiz answers for accuracy before publishing.</label>}
              {course.published ? <Button variant="outline" className="w-full" onClick={() => setPublished(false)}>Unpublish</Button>
                : <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setPublished(true)}>Publish to catalogue</Button>}
              <Button variant="ghost" className="mt-2 w-full text-destructive" onClick={remove}><Trash2 className="h-4 w-4" />Delete course</Button>
            </div>
          </section>
          <section className="space-y-3 rounded-2xl border border-border p-4 lg:col-span-2">
            <h2 className="font-semibold">Course Factory — source import</h2>
            <p className="text-xs text-muted-foreground">Paste extracted text from a training manual. Module and chapter headings become draft reading lessons. Upload PDF, Word, PowerPoint or plain text. Scanned PDFs require OCR, which is not yet available. AI media generation is not yet available. Review every lesson before publishing.</p>
            <label className="block text-xs font-medium">Upload a manual (PDF, DOCX, PPTX, TXT or MD)
              <input type="file" accept=".pdf,.docx,.pptx,.txt,.md" disabled={readingFile} onChange={(e) => { void readTextFile(e.target.files?.[0]); e.target.value = ""; }} className="mt-1 block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-primary" />
            </label>
            <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="Source document name" aria-label="Source document name" maxLength={160} />
            <Textarea value={sourceText} onChange={(e) => { setSourceText(e.target.value); setSourcePages(null); setDraft(null); }} placeholder={"Module 1: Introduction\\nYour training content..."} rows={6} maxLength={1000000} aria-label="Extracted manual text" />
            <Button type="button" variant="outline" onClick={previewSource} disabled={!sourceText.trim()}>Preview draft lessons</Button>
            {draft && <div className="space-y-2 rounded-xl bg-muted/40 p-3">
              <p className="text-sm font-medium">{draft.lessons.length} draft reading lessons · Human review required</p>
              {draft.warnings.map((warning, i) => <p key={i} className="text-xs text-destructive">{warning}</p>)}
              <ol className="list-inside list-decimal text-xs text-muted-foreground">{draft.lessons.map((lesson, i) => <li key={i}>{lesson.title} — {lesson.body.length} characters</li>)}</ol>
              <div className="space-y-2 border-t border-border pt-3">
                <Button type="button" variant="outline" disabled={aiLoading || !draft.lessons.length || !!course.published || (draft.lessons[0]?.body.length ?? 0) < 100} onClick={generateAiDraft}>{aiLoading ? "Generating…" : "Generate AI lesson and quiz preview (first lesson)"}</Button>
                {aiDraft && <div className="space-y-2 rounded-lg border border-border p-3 text-xs">
                  <p className="font-semibold">AI draft — verify against your manual before using</p>
                  <p className="font-medium">{aiDraft.lessonTitle}</p>
                  <p className="whitespace-pre-wrap">{aiDraft.lessonSummary}</p>
                  {aiDraft.questions.map((q, i) => <div key={i} className="space-y-1 border-t border-border pt-2">
                    <p className="font-medium">{i + 1}. {q.question}</p>
                    {q.options.map((option, j) => <p key={j}>{j === q.correctIndex ? "✓ " : "○ "}{option}</p>)}
                    <p className="italic text-muted-foreground">Source quote: {q.sourceQuote}</p>
                  </div>)}
                  {!!aiDraft.droppedUnsupportedQuestions && <p>{aiDraft.droppedUnsupportedQuestions} question(s) removed because their source quotes were not found.</p>}
                  <p className="text-muted-foreground">Review all answers and citations. Saving does not publish the course.</p>
                  <Button type="button" size="sm" disabled={aiLoading || !aiDraft.questions.length || !!course.published} onClick={saveAiDraft}>Save AI lesson and quiz as drafts</Button>
                </div>}

                <h3 className="text-sm font-medium">Suggested knowledge checks</h3>
                <p className="text-xs text-muted-foreground">These are source-based question prompts, not AI-generated multiple-choice quizzes. Review the suggested answer and create verified options using the Quiz editor below.</p>
                {suggestReviewQuestions(draft, 8).map((item, i) => <div key={i} className="rounded-lg border border-border p-2 text-xs">
                  <p className="font-medium">{item.question}</p>
                  <p className="mt-1 text-muted-foreground">Source answer: {item.suggestedAnswer}</p>
                  <p className="mt-1 text-muted-foreground">{item.sourceId}, page {item.page}</p>
                </div>)}
              </div>
              <Button type="button" onClick={importDraft} disabled={!draft.lessons.length || importing || !!course.published}>{importing ? "Importing…" : "Add draft lessons to course"}</Button>
              {course.published && <p className="text-xs text-destructive">Unpublish the course before importing draft material.</p>}
            </div>}
          </section>
          <section className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Lessons</h2>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => addLesson("video")}><Video className="h-4 w-4" />Video</Button>
                <Button size="sm" variant="outline" onClick={() => addLesson("reading")}><FileText className="h-4 w-4" />Reading</Button>
                <Button size="sm" variant="outline" onClick={() => addLesson("quiz")}><HelpCircle className="h-4 w-4" />Quiz</Button>
              </div></div>
            {lessons?.map((l, i) => <LessonEditor key={l.id} lesson={l} index={i} onChange={refresh} />)}
            {lessons?.length === 0 && <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Add your first video, reading or quiz.</p>}
          </section>
        </div>
      </Sheet>
    </Phone>
  );
}

function LessonEditor({ lesson, index, onChange }: { lesson: LessonRow; index: number; onChange: () => void }) {
  const [title, setTitle] = useState(lesson.title);
  const [video, setVideo] = useState(lesson.video_url ?? "");
  const [body, setBody] = useState(lesson.body);
  const [qs, setQs] = useState<Q[]>(() => ((lesson.quiz as { q: string; options: string[] }[]) ?? []).map((x) => ({ ...x, answer: 0 })));
  const [passMark, setPassMark] = useState(() => parsePassMark(lesson.body));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || lesson.kind !== "quiz") return;
    supabase.from("studio_quiz_answers").select("answers").eq("lesson_id", lesson.id).maybeSingle().then(({ data }) => {
      if (data) setQs((cur) => cur.map((q, i) => ({ ...q, answer: data.answers[i] ?? 0 })));
    });
  }, [open, lesson.id, lesson.kind]);
  const Icon = lesson.kind === "video" ? Video : lesson.kind === "quiz" ? HelpCircle : FileText;
  const save = async () => {
    if (video && !/^https:\/\//.test(video)) { toast.error("Video link must start with https://"); return; }
    const clean = qs.filter((q) => q.q.trim() && q.options.filter((o) => o.trim()).length >= 2);
    const { error } = await supabase.from("studio_lessons").update({ title, video_url: video || null, body: lesson.kind === "quiz" ? `pass:${passMark}` : body, quiz: clean.map(({ q, options }) => ({ q, options })) }).eq("id", lesson.id);
    if (error) { toast.error("Could not save lesson."); return; }
    if (lesson.kind === "quiz") {
      const { error: e2 } = await supabase.from("studio_quiz_answers").upsert({ lesson_id: lesson.id, course_id: (await supabase.from("studio_lessons").select("course_id").eq("id", lesson.id).single()).data!.course_id, answers: clean.map((q) => q.answer) });
      if (e2) { toast.error("Could not save answers."); return; }
    }
    toast.success("Lesson saved"); onChange();
  };
  const del = async () => { await supabase.from("studio_lessons").delete().eq("id", lesson.id); onChange(); };
  return (
    <div className="rounded-2xl border border-border">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 p-3 text-left">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{index + 1}. {lesson.title}</span>
        <span className="text-xs text-muted-foreground">{open ? "Close" : "Edit"}</span>
      </button>
      {open && <div className="space-y-2 border-t border-border p-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Lesson title" maxLength={120} />
        {lesson.kind === "video" && <Input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="Video link (https://… .mp4 or YouTube)" />}
        {lesson.kind !== "quiz" && <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Lesson notes, steps or checklist" maxLength={20000} />}
        {lesson.kind === "quiz" && <div className="space-y-3">
          {qs.map((q, qi) => (
            <div key={qi} className="space-y-1.5 rounded-xl bg-muted/50 p-2">
              <div className="flex gap-2"><Input value={q.q} placeholder={`Question ${qi + 1}`} onChange={(e) => setQs(qs.map((x, i) => i === qi ? { ...x, q: e.target.value } : x))} />
                <Button size="icon" variant="ghost" aria-label="Remove question" onClick={() => setQs(qs.filter((_, i) => i !== qi))}><Trash2 className="h-4 w-4" /></Button></div>
              {q.options.map((o, oi) => (
                <label key={oi} className="flex items-center gap-2 text-sm">
                  <input type="radio" name={`a-${lesson.id}-${qi}`} checked={q.answer === oi} onChange={() => setQs(qs.map((x, i) => i === qi ? { ...x, answer: oi } : x))} aria-label="Correct answer" />
                  <Input value={o} placeholder={`Option ${oi + 1}`} onChange={(e) => setQs(qs.map((x, i) => i === qi ? { ...x, options: x.options.map((y, j) => j === oi ? e.target.value : y) } : x))} />
                </label>))}
            </div>))}
          <Button size="sm" variant="outline" onClick={() => setQs([...qs, { q: "", options: ["", "", "", ""], answer: 0 }])}><Plus className="h-4 w-4" />Add question</Button>
          <label className="flex items-center gap-2 text-sm">Pass mark<select value={passMark} onChange={(e) => setPassMark(Number(e.target.value))} className="rounded-md border border-input bg-background px-2 py-1 text-sm" aria-label="Pass mark">{PASS_MARKS.map((m) => <option key={m} value={m}>{m}%</option>)}</select></label>
          <p className="text-xs text-muted-foreground">Tick the correct option. Learners need {passMark}% to pass.</p>
        </div>}
        <div className="flex gap-2"><Button size="sm" onClick={save}>Save lesson</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={del}>Delete</Button></div>
      </div>}
    </div>
  );
}
