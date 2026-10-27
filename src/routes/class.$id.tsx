import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, Video, FileText, HelpCircle, Award } from "lucide-react";
import { Phone, Header, Sheet, ProgressBar } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProgress, useSaveProgress } from "@/hooks/useLearning";
import { submitQuiz, claimCertificate } from "@/lib/learning.functions";
import { youtubeEmbed } from "@/lib/studio";
import { toast } from "sonner";

export const Route = createFileRoute("/class/$id")({
  head: () => ({ meta: [
    { title: "Course — Mobile School" },
    { name: "description", content: "A trainer-made farming course on Mobile School with video lessons and quizzes." },
    { property: "og:title", content: "Course — Mobile School" },
    { property: "og:description", content: "Learn with Mobile School trainers." },
    { property: "og:type", content: "article" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ClassPage,
});

type L = { id: string; kind: string; title: string; video_url: string | null; body: string; quiz: { q: string; options: string[] }[] };

function ClassPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { data: course, isLoading } = useQuery({ queryKey: ["class", id], queryFn: async () => (await supabase.from("studio_courses").select("id, title, description, category, level, cover_url").eq("id", id).maybeSingle()).data });
  const { data: lessons } = useQuery({ queryKey: ["class-lessons", id], queryFn: async () => ((await supabase.from("studio_lessons").select("id, kind, title, video_url, body, quiz").eq("course_id", id).order("position")).data ?? []) as unknown as L[] });
  const { data: progress } = useProgress();
  const save = useSaveProgress();
  const claim = useServerFn(claimCertificate);
  const qc = useQueryClient();
  const [idx, setIdx] = useState(0);
  const done = new Set((progress ?? []).filter((p) => p.course_id === id && p.completed).map((p) => p.lesson_id));
  const total = lessons?.length ?? 0;
  const count = (lessons ?? []).filter((l) => done.has(l.id)).length;
  const pct = total ? Math.round((count / total) * 100) : 0;
  const lesson = lessons?.[idx];

  if (isLoading) return <Phone><Header title="Loading…" /></Phone>;
  if (!course) return <Phone><Header title="Course not found" /><Sheet><Link to="/search" className="text-primary">Browse the catalogue</Link></Sheet></Phone>;
  const markDone = () => { if (!user) { toast.error("Sign in to track progress."); return; } save.mutate({ course_id: id, lesson_id: lesson!.id, completed: true }); if (idx < total - 1) setIdx(idx + 1); };

  return (
    <Phone>
      <Header greeting={`${course.category} · ${course.level}`} title={course.title} />
      <Sheet>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-4">
            {lesson ? (<>
              {lesson.kind === "video" && lesson.video_url && (youtubeEmbed(lesson.video_url)
                ? <iframe src={youtubeEmbed(lesson.video_url)!} title={lesson.title} className="aspect-video w-full rounded-2xl" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen />
                : <video src={lesson.video_url} controls playsInline className="aspect-video w-full rounded-2xl bg-foreground" onEnded={markDone} />)}
              <h2 className="text-lg font-semibold">{lesson.title}</h2>
              {lesson.body && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{lesson.body}</p>}
              {lesson.kind === "quiz" ? <Quiz key={lesson.id} lesson={lesson} courseId={id} passed={done.has(lesson.id)} />
                : <Button onClick={markDone} disabled={done.has(lesson.id)}>{done.has(lesson.id) ? "Completed" : "Mark as complete"}</Button>}
            </>) : <p className="text-sm text-muted-foreground">This course has no lessons yet.</p>}
            {course.description && <div className="rounded-2xl bg-muted/50 p-4 text-sm"><h3 className="mb-1 font-semibold">About this course</h3><p className="whitespace-pre-wrap text-muted-foreground">{course.description}</p></div>}
          </div>
          <aside className="space-y-3">
            {user && <ProgressBar pct={pct} label={`${count}/${total} lessons`} />}
            <ol className="space-y-1.5">
              {(lessons ?? []).map((l, i) => { const Icon = l.kind === "video" ? Video : l.kind === "quiz" ? HelpCircle : FileText; return (
                <li key={l.id}><button onClick={() => setIdx(i)} className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left text-sm ${i === idx ? "border-primary bg-primary/5" : "border-border"}`}>
                  <Icon className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate">{l.title}</span>
                  {done.has(l.id) ? <CheckCircle2 className="h-4 w-4 text-secondary-foreground" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                </button></li>); })}
            </ol>
            {user && pct === 100 && <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" onClick={async () => {
              try { await claim({ data: { source: "studio", courseRef: id } }); toast.success("Certificate added to your profile!"); qc.invalidateQueries({ queryKey: ["certificates"] }); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Could not issue certificate."); }
            }}><Award className="h-4 w-4" />Get my certificate</Button>}
          </aside>
        </div>
      </Sheet>
    </Phone>
  );
}

function Quiz({ lesson, courseId, passed }: { lesson: L; courseId: string; passed: boolean }) {
  const [answers, setAnswers] = useState<number[]>(() => lesson.quiz.map(() => -1));
  const [result, setResult] = useState<{ score: number; passed: boolean; correct: boolean[] } | null>(null);
  const submit = useServerFn(submitQuiz);
  const qc = useQueryClient();
  const { user } = useAuth();
  if (!lesson.quiz.length) return <p className="text-sm text-muted-foreground">No questions yet.</p>;
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      if (!user) { toast.error("Sign in to take the quiz."); return; }
      if (answers.includes(-1)) { toast.error("Answer every question first."); return; }
      try { const r = await submit({ data: { lessonId: lesson.id, answers } }); setResult(r); qc.invalidateQueries({ queryKey: ["progress"] }); }
      catch (err) { toast.error(err instanceof Error ? err.message : "Could not grade quiz."); }
    }}>
      {passed && !result && <p className="rounded-xl bg-secondary/30 px-3 py-2 text-sm">You already passed this quiz. You can try again.</p>}
      {lesson.quiz.map((q, qi) => (
        <fieldset key={qi} className="rounded-2xl border border-border p-3">
          <legend className="px-1 text-sm font-semibold">{qi + 1}. {q.q}</legend>
          {q.options.filter((o) => o.trim()).map((o, oi) => (
            <label key={oi} className="mt-1.5 flex items-center gap-2 text-sm">
              <input type="radio" name={`q${qi}`} checked={answers[qi] === oi} onChange={() => setAnswers(answers.map((a, i) => i === qi ? oi : a))} />{o}
            </label>))}
          {result && <p className={`mt-2 text-xs font-semibold ${result.correct[qi] ? "text-primary" : "text-destructive"}`}>{result.correct[qi] ? "Correct" : "Not quite"}</p>}
        </fieldset>))}
      {result && <p role="status" className="text-sm font-semibold">{result.passed ? `Passed with ${result.score}% 🎉` : `${result.score}% — you need 70% to pass. Try again.`}</p>}
      <Button type="submit">Submit answers</Button>
      <input type="hidden" value={courseId} readOnly />
    </form>
  );
}
