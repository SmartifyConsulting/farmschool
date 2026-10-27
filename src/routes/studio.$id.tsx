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
  const [form, setForm] = useState({ title: "", description: "", category: STUDIO_CATEGORIES[0] ?? "Farm Management", level: "Beginner", cover_url: "" });
  useEffect(() => { if (course) setForm({ title: course.title, description: course.description, category: course.category, level: course.level, cover_url: course.cover_url ?? "" }); }, [course]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["studio-course", id] }); qc.invalidateQueries({ queryKey: ["studio-lessons", id] }); qc.invalidateQueries({ queryKey: ["studio-mine"] }); qc.invalidateQueries({ queryKey: ["studio-published"] }); };

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
    if (published && !lessons?.length) { toast.error("Add at least one lesson before publishing."); return; }
    await supabase.from("studio_courses").update({ published }).eq("id", id); refresh();
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
              {course.published ? <Button variant="outline" className="w-full" onClick={() => setPublished(false)}>Unpublish</Button>
                : <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setPublished(true)}>Publish to catalogue</Button>}
              <Button variant="ghost" className="mt-2 w-full text-destructive" onClick={remove}><Trash2 className="h-4 w-4" />Delete course</Button>
            </div>
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
