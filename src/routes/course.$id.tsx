import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Play, Pause, ChevronDown, Clock, FileText, Star, PlayCircle } from "lucide-react";
import { Phone } from "@/components/AppShell";
import { getCourse } from "@/lib/courses";

export const Route = createFileRoute("/course/$id")({
  loader: ({ params }) => { const c = getCourse(params.id); if (!c) throw notFound(); return c; },
  head: ({ loaderData }) => ({ meta: [
    { title: `${loaderData?.title ?? "Course"} — FarmerPlus Learning` },
    { name: "description", content: loaderData?.description ?? "" },
    { property: "og:title", content: loaderData?.title ?? "Course" },
    { property: "og:description", content: loaderData?.description ?? "" },
  ] }),
  component: CourseDetails,
});

function CourseDetails() {
  const c = Route.useLoaderData();
  const [tab, setTab] = useState("Modules");
  const [open, setOpen] = useState(0);
  const [playing, setPlaying] = useState(false);
  return (
    <Phone>
      <div className="relative h-80">
        <img src={c.image} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/90 via-foreground/20 to-transparent" />
        <Link to="/" aria-label="Back" className="absolute left-4 top-6 grid h-9 w-9 place-items-center rounded-full bg-card/90"><ArrowLeft className="h-4 w-4" /></Link>
        <button onClick={() => setPlaying(!playing)} aria-label="Play" className="absolute left-1/2 top-1/3 grid h-12 w-12 -translate-x-1/2 place-items-center rounded-full bg-card text-primary">{playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</button>
        <div className="absolute bottom-4 left-5 right-5 text-card">
          <p className="text-xs opacity-90">{c.creator}</p>
          <h1 className="text-2xl font-semibold leading-tight">{c.title}</h1>
          <div className="mt-2 flex gap-3 text-xs"><span className="flex items-center gap-1"><Clock className="h-3 w-3 text-accent" />{c.duration}</span><span className="flex items-center gap-1"><FileText className="h-3 w-3 text-accent" />{c.lessons} Lessons</span><span className="flex items-center gap-1"><Star className="h-3 w-3 fill-accent text-accent" />{c.rating} ({c.reviews})</span></div>
        </div>
      </div>
      <div className="px-5 pt-4">
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
              <li key={l.title} className="flex items-center gap-3 text-xs">
                {l.type === "video" ? <PlayCircle className="h-5 w-5 shrink-0 text-accent" /> : <FileText className="h-5 w-5 shrink-0 text-accent" />}
                <span className="flex-1 font-medium">{l.title}</span><span className="text-muted-foreground">{l.duration}</span>
              </li>))}</ul>}
          </div>))}</div>}
        {tab === "Description" && <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{c.description}</p>}
        {tab === "Reviews" && <div className="mt-4 space-y-3 text-sm">{["Very practical — I set up my first tank in a week.", "Clear videos and useful worksheets."].map((r) => <p key={r} className="rounded-xl bg-muted p-3">★★★★★ {r}</p>)}</div>}
        <button className="mt-6 w-full rounded-full bg-accent py-3 font-semibold text-accent-foreground">{c.progress !== undefined ? "Continue learning" : `Enrol for $${c.price}`}</button>
      </div>
    </Phone>
  );
}
