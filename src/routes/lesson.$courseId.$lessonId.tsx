import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Play, Pause, Captions, CheckCircle2, RotateCcw, RotateCw, Maximize } from "lucide-react";
import { Phone } from "@/components/AppShell";
import { getCourse, getLesson, allLessons, VIDEO_URL } from "@/lib/courses";
import { useAuth, useProgress, useSaveProgress } from "@/hooks/useLearning";

export const Route = createFileRoute("/lesson/$courseId/$lessonId")({
  loader: ({ params }) => {
    const c = getCourse(params.courseId); const l = c && getLesson(c, params.lessonId);
    if (!c || !l) throw notFound();
    return { course: c, lesson: l };
  },
  head: ({ loaderData }) => ({ meta: [
    { title: `${loaderData?.lesson.title ?? "Lesson"} — FarmerPlus Learning` },
    { name: "description", content: `Lesson from ${loaderData?.course.title ?? "a FarmerPlus course"}.` },
    { property: "og:title", content: loaderData?.lesson.title ?? "Lesson" },
    { property: "og:description", content: loaderData?.course.title ?? "" },
  ] }),
  notFoundComponent: () => <p className="p-10 text-center">Lesson not found. <Link to="/" className="text-primary">Go home</Link></p>,
  errorComponent: ({ error }) => <p className="p-10 text-center">{(error as Error).message}</p>,
  component: LessonPage,
});

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function LessonPage() {
  const { course, lesson } = Route.useLoaderData();
  const nav = useNavigate();
  const v = useRef<HTMLVideoElement>(null);
  const { user } = useAuth();
  const { data } = useProgress();
  const save = useSaveProgress();
  const row = data?.find((r) => r.course_id === course.id && r.lesson_id === lesson.id);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [cc, setCc] = useState(true);
  const [resumed, setResumed] = useState<number | null>(null);
  const lastSaved = useRef(0);
  const lessons = allLessons(course);
  const idx = lessons.findIndex((l) => l.id === lesson.id);
  const nextL = lessons[idx + 1];

  useEffect(() => { setResumed(null); lastSaved.current = 0; }, [lesson.id]);
  // resume from last saved position
  useEffect(() => {
    const el = v.current;
    if (!el || resumed !== null || !row) return;
    const apply = () => { if (row.position_seconds > 2 && !row.completed) { el.currentTime = row.position_seconds; setResumed(row.position_seconds); } else setResumed(0); };
    if (el.readyState >= 1) apply(); else el.addEventListener("loadedmetadata", apply, { once: true });
  }, [row, resumed]);
  useEffect(() => { if (v.current) v.current.playbackRate = speed; }, [speed]);
  useEffect(() => { const t = v.current?.textTracks[0]; if (t) t.mode = cc ? "showing" : "hidden"; }, [cc]);

  const persist = (completed?: boolean) => {
    if (!user || !v.current) return;
    save.mutate({ course_id: course.id, lesson_id: lesson.id, position_seconds: v.current.currentTime, ...(completed !== undefined ? { completed } : {}) });
  };
  useEffect(() => () => persist(), [lesson.id]); // save on leave
  const onTime = () => {
    const t = v.current!.currentTime; setTime(t);
    if (user && Math.abs(t - lastSaved.current) > 10) { lastSaved.current = t; persist(); }
  };
  const toggle = () => { const el = v.current!; if (el.paused) el.play(); else el.pause(); };
  const skip = (d: number) => { v.current!.currentTime = Math.max(0, Math.min(dur, v.current!.currentTime + d)); };

  return (
    <Phone>
      <div className="mx-auto max-w-5xl md:p-10">
        <div className="flex items-center gap-3 px-5 py-4 md:px-0">
          <Link to="/course/$id" params={{ id: course.id }} aria-label="Back to course" className="grid h-9 w-9 place-items-center rounded-full bg-muted"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{course.title}</p><h1 className="truncate font-semibold">{lesson.title}</h1></div>
        </div>
        <div className="relative bg-foreground md:overflow-hidden md:rounded-3xl">
          <video ref={v} src={VIDEO_URL} poster={course.image} crossOrigin="anonymous" playsInline className="aspect-video w-full" onClick={toggle}
            onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); persist(); }} onTimeUpdate={onTime}
            onLoadedMetadata={(e) => { setDur(e.currentTarget.duration); e.currentTarget.playbackRate = speed; const t = e.currentTarget.textTracks[0]; if (t) t.mode = cc ? "showing" : "hidden"; }}
            onEnded={() => persist(true)}>
            <track kind="captions" src="/captions/en.vtt" srcLang="en" label="English" default />
          </video>
          {resumed !== null && resumed > 0 && <span className="absolute left-3 top-3 rounded-full bg-card/90 px-3 py-1 text-xs">Resumed at {fmt(resumed)}</span>}
        </div>
        <div className="space-y-3 bg-primary px-4 py-3 text-primary-foreground md:rounded-b-3xl">
          <input type="range" aria-label="Seek" min={0} max={dur || 0} step={0.1} value={time} onChange={(e) => { v.current!.currentTime = +e.target.value; }} className="w-full accent-[var(--accent)]" />
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => skip(-10)} aria-label="Back 10 seconds" className="grid h-9 w-9 place-items-center rounded-full hover:bg-primary-foreground/15"><RotateCcw className="h-4 w-4" /></button>
            <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="grid h-10 w-10 place-items-center rounded-full bg-card text-primary">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
            <button onClick={() => skip(10)} aria-label="Forward 10 seconds" className="grid h-9 w-9 place-items-center rounded-full hover:bg-primary-foreground/15"><RotateCw className="h-4 w-4" /></button>
            <span className="text-xs tabular-nums">{fmt(time)} / {fmt(dur)}</span>
            <div className="ml-auto flex items-center gap-2">
              <label className="sr-only" htmlFor="speed">Playback speed</label>
              <select id="speed" value={speed} onChange={(e) => setSpeed(+e.target.value)} className="rounded-full bg-primary-foreground/15 px-2 py-1 text-xs">
                {SPEEDS.map((s) => <option key={s} value={s} className="text-foreground">{s}×</option>)}
              </select>
              <button onClick={() => setCc(!cc)} aria-pressed={cc} aria-label="Captions" className={`grid h-9 w-9 place-items-center rounded-full ${cc ? "bg-accent text-accent-foreground" : "hover:bg-primary-foreground/15"}`}><Captions className="h-4 w-4" /></button>
              <button onClick={() => v.current?.requestFullscreen()} aria-label="Fullscreen" className="grid h-9 w-9 place-items-center rounded-full hover:bg-primary-foreground/15"><Maximize className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 px-5 py-5 md:px-0">
          {user ? (
            <button onClick={() => persist(!row?.completed)} className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold ${row?.completed ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"}`}>
              <CheckCircle2 className="h-4 w-4" />{row?.completed ? "Completed — undo" : "Mark as complete"}
            </button>
          ) : <Link to="/auth" className="rounded-full bg-secondary px-5 py-2.5 text-sm">Sign in to save your progress</Link>}
          {nextL && <button onClick={() => { persist(); nav({ to: "/lesson/$courseId/$lessonId", params: { courseId: course.id, lessonId: nextL.id } }); }} className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground">Next: {nextL.title}</button>}
        </div>
      </div>
    </Phone>
  );
}
