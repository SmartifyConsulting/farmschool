import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Play, ChevronDown, Clock, FileText, Star, PlayCircle, CheckCircle2 } from "lucide-react";
import { Phone, BookmarkButton, ProgressBar } from "@/components/AppShell";
import { getCourse, allLessons } from "@/lib/courses";
import { useAuth, useProgress, useSaveProgress, courseProgress } from "@/hooks/useLearning";

export const Route = createFileRoute("/course/$id")({
  loader: ({ params }) => { const c = getCourse(params.id); if (!c) throw notFound(); return c; },
  head: ({ loaderData }) => ({ meta: [
    { title: `${loaderData?.title ?? "Course"} — FarmerPlus Learning` },
    { name: "description", content: loaderData?.description ?? "" },
    { property: "og:title", content: loaderData?.title ?? "Course" },
    { property: "og:description", content: loaderData?.description ?? "" },
  ] }),
  notFoundComponent: () => <p className="p-10 text-center">Course not found. <Link to="/" className="text-primary">Go home</Link></p>,
  errorComponent: ({ error }) => <p className="p-10 text-center">{error.message}</p>,
  component: CourseDetails,
});

function CourseDetails() {
  const c = Route.useLoaderData();
  const [tab, setTab] = useState("Modules");
  const [open, setOpen] = useState(0);
  const { user } = useAuth();
  const { data } = useProgress();
  const save = useSaveProgress();
  const p = courseProgress(c, data);
  const done = (id: string) => data?.some((r) => r.course_id === c.id && r.lesson_id === id && r.completed);
  const next = allLessons(c).find((l) => !done(l.id)) ?? allLessons(c)[0]!;
  return (
    <Phone>
      <div className="lg:grid lg:grid-cols-[1.2fr_1fr] lg:gap-8 lg:p-10">
        <div className="relative h-80 md:h-[420px] lg:overflow-hidden lg:rounded-3xl">
          <img src={c.image} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/90 via-foreground/20 to-transparent" />
          <Link to="/" aria-label="Back" className="absolute left-4 top-6 grid h-9 w-9 place-items-center rounded-full bg-card/90"><ArrowLeft className="h-4 w-4" /></Link>
          <BookmarkButton courseId={c.id} className="absolute right-4 top-6 h-9 w-9" />
          <Link to="/lesson/$courseId/$lessonId" params={{ courseId: c.id, lessonId: next.id }} aria-label="Play" className="absolute left-1/2 top-1/3 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full bg-card text-primary"><Play className="h-5 w-5" /></Link>
          <div className="absolute bottom-4 left-5 right-5 text-card">
            <p className="text-xs opacity-90">{c.creator}</p>
            <h1 className="text-2xl font-semibold leading-tight md:text-3xl">{c.title}</h1>
            <div className="mt-2 flex flex-wrap gap-3 text-xs"><span className="flex items-center gap-1"><Clock className="h-3 w-3 text-accent" />{c.duration}</span><span className="flex items-center gap-1"><FileText className="h-3 w-3 text-accent" />{p.total} Lessons</span><span className="flex items-center gap-1"><Star className="h-3 w-3 fill-accent text-accent" />{c.rating} ({c.reviews})</span></div>
          </div>
        </div>
        <div className="px-5 pt-4 md:px-10 lg:px-0 lg:pt-0">
          {user && <div className="mb-4"><ProgressBar pct={p.pct} label={`${p.done}/${p.total} lessons complete`} /></div>}
          <div className="flex rounded-full bg-muted p-1 text-sm">
            {["Modules", "Description", "Reviews"].map((t) => <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-full py-1.5 ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t}</button>)}
          </div>
          {tab === "Modules" && <div className="mt-3 divide-y divide-border">{c.modules.map((m, i) => (
            <div key={m.title} className="py-3">
              <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between text-left">
                <div><p className="text-sm font-semibold">{m.title}</p><p className="mt-1 flex gap-3 text-xs text-muted-foreground"><span>{m.duration}</span><span>{m.assignments} Assignments</span></p></div>
                <ChevronDown className={`h-4 w-4 transition ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && <ul className="mt-3 space-y-3">{m.lessons.map((l) => (
                <li key={l.id} className="flex items-center gap-3 text-xs">
                  <button aria-label={done(l.id) ? "Mark not complete" : "Mark complete"} disabled={!user}
                    onClick={() => save.mutate({ course_id: c.id, lesson_id: l.id, completed: !done(l.id) })}>
                    {done(l.id) ? <CheckCircle2 className="h-5 w-5 text-primary" /> : l.type === "video" ? <PlayCircle className="h-5 w-5 text-accent" /> : <FileText className="h-5 w-5 text-accent" />}
                  </button>
                  <Link to="/lesson/$courseId/$lessonId" params={{ courseId: c.id, lessonId: l.id }} className={`flex-1 font-medium hover:text-primary ${done(l.id) ? "text-muted-foreground line-through" : ""}`}>{l.title}</Link>
                  <span className="text-muted-foreground">{l.duration}</span>
                </li>))}</ul>}
            </div>))}</div>}
          {tab === "Description" && <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{c.description}</p>}
          {tab === "Reviews" && <div className="mt-4 space-y-3 text-sm">{["Very practical — I set up my first tank in a week.", "Clear videos and useful worksheets."].map((r) => <p key={r} className="rounded-xl bg-muted p-3">★★★★★ {r}</p>)}</div>}
          <Link to="/lesson/$courseId/$lessonId" params={{ courseId: c.id, lessonId: next.id }} className="mt-6 block w-full rounded-full bg-accent py-3 text-center font-semibold text-accent-foreground">{p.started ? "Continue learning" : "Start course"}</Link>
        </div>
      </div>
    </Phone>
  );
}
