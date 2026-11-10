import { createFileRoute, Link } from "@tanstack/react-router";
import { Star, ChevronRight, Check, X, BarChart3 } from "lucide-react";
import { useState } from "react";
import {
  Phone,
  Header,
  SearchBox,
  Sheet,
  BookmarkButton,
  ProgressBar,
  CanvasHeading,
} from "@/components/AppShell";
import { categories, courses, type Course } from "@/lib/courses";
import { useAuth, useProgress, courseProgress } from "@/hooks/useLearning";
import { ChallengeFinder } from "@/components/ChallengeFinder";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Plusticity — Flex Your Brain" },
      {
        name: "description",
        content:
          "Plusticity is the app that flexes your brain. Bite-sized courses, quizzes and real skills you can build anywhere, on any device.",
      },
      { property: "og:title", content: "Plusticity" },
      { property: "og:description", content: "The app that flexes your brain, on any device." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const LEVELS = ["Beginner", "Intermediate", "Beginner", "Advanced", "Intermediate", "Beginner"];

export function CourseCard({ c, i = 0 }: { c: Course; i?: number }) {
  const { data } = useProgress();
  const p = courseProgress(c, data);
  const badge =
    c.rating >= 4.8
      ? { t: "Popular", cls: "bg-gold text-accent-foreground" }
      : i % 3 === 0
        ? { t: "New", cls: "bg-highlight text-highlight-foreground" }
        : null;
  return (
    <Link
      to="/course/$id"
      params={{ id: c.id }}
      className="group flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]"
    >
      <div className="relative h-28 sm:h-32 md:h-36">
        <img src={c.image} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-navy/25" />
        {badge && (
          <span
            className={`absolute left-2 top-2 rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badge.cls}`}
          >
            {badge.t}
          </span>
        )}
        <BookmarkButton courseId={c.id} className="absolute right-2 top-2" />
      </div>
      <div className="flex flex-1 flex-col p-3 md:p-4">
        <p className="line-clamp-2 text-sm font-bold leading-snug text-foreground group-hover:text-primary">
          {c.title}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-gold text-gold" />
            <b className="text-foreground">{c.rating}</b> ({c.reviews})
          </span>
          <span className="flex items-center gap-1">
            <BarChart3 className="h-3 w-3 text-primary" />
            {LEVELS[i % LEVELS.length]}
          </span>
        </div>
        <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Estimated time
        </p>
        <p className="text-xs text-foreground">
          {c.duration} · {c.lessons} lessons
        </p>
        {p.started && (
          <div className="mt-3">
            <ProgressBar pct={p.pct} label={`${p.done}/${p.total} lessons`} />
          </div>
        )}
      </div>
    </Link>
  );
}

function Section({ title, list }: { title: string; list: Course[] }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-lg font-bold tracking-tight md:text-2xl">{title}</h2>
        <Link
          to="/search"
          className="flex items-center text-xs font-bold uppercase tracking-wider text-primary"
        >
          See all <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 pb-2 md:grid-cols-3 md:gap-5">
        {list.map((c, i) => (
          <CourseCard key={c.id} c={c} i={i} />
        ))}
      </div>
    </section>
  );
}

const COMPARE = [
  "Learn by doing, not just reading",
  "Practical, real-world skills",
  "Short video & reading lessons",
  "AI learning assistant on hand",
  "Graded quizzes",
  "Recognised certificates",
];

function Hero() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="relative overflow-hidden rounded-md bg-navy text-navy-foreground">
        <img
          src={courses[0]?.image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div className="relative p-6 md:p-10">
          <h2 className="max-w-lg text-2xl font-extrabold tracking-tight md:text-4xl">
            The app that flexes your brain, on any phone
          </h2>
          <p className="mt-3 max-w-md text-sm opacity-85">
            Practical courses built with expert trainers, covering real skills across every topic.
            Learn at your own pace, pass the quiz and earn a Plusticity certificate.
          </p>
          <Link
            to="/search"
            className="mt-6 inline-flex rounded-md bg-primary px-6 py-3 text-xs font-bold uppercase tracking-[0.15em] text-primary-foreground shadow-lg hover:opacity-90"
          >
            Explore courses
          </Link>
          <p className="mt-8 text-[11px] font-bold uppercase tracking-[0.15em] opacity-70">
            Content from trusted partners
          </p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm font-bold opacity-90">
            <span>Access Agriculture</span>
            <span>Course Studio trainers</span>
            <span>FarmerPlus</span>
          </div>
        </div>
      </div>
      <div className="rounded-md border border-border bg-card p-4 md:p-6">
        <p className="text-center text-base md:text-lg">
          Only at Plusticity: <b>Brain-Flexing Skills</b>
        </p>
        <table className="mt-4 w-full text-xs">
          <thead>
            <tr>
              <th />
              <th className="w-20 bg-primary py-2 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                Plusticity
              </th>
              <th className="w-20 bg-muted-foreground/40 py-2 text-[10px] font-bold uppercase tracking-wider text-navy-foreground">
                Others
              </th>
            </tr>
          </thead>
          <tbody>
            {COMPARE.map((r) => (
              <tr key={r} className="border-b border-border">
                <td className="py-2.5 pr-2 text-muted-foreground">{r}</td>
                <td className="bg-primary/90 text-center text-primary-foreground">
                  <Check className="mx-auto h-3.5 w-3.5" />
                </td>
                <td className="bg-muted-foreground/30 text-center text-navy-foreground">
                  <X className="mx-auto h-3.5 w-3.5" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Schools() {
  const [active, setActive] = useState<string>(categories[0]?.name ?? "");
  const cat = categories.find((c) => c.name === active);
  const list = courses.filter(
    (c) => c.category === active || (cat && c.category.includes(active.split(" ")[0] ?? active)),
  );
  return (
    <section className="mt-12">
      <h2 className="text-center text-xl font-bold tracking-tight md:text-3xl">
        Explore our schools to find your perfect course
      </h2>
      <div className="mt-6 flex gap-6 overflow-x-auto border-b border-border md:justify-center">
        {categories.map((c) => (
          <button
            key={c.name}
            type="button"
            onClick={() => setActive(c.name)}
            aria-pressed={active === c.name}
            className={`shrink-0 border-b-2 pb-2 text-xs font-semibold uppercase tracking-[0.12em] ${active === c.name ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
        {(list.length ? list : courses.slice(0, 3)).map((c, i) => (
          <CourseCard key={c.id} c={c} i={i} />
        ))}
      </div>
    </section>
  );
}

function Index() {
  const { user } = useAuth();
  const { data } = useProgress();
  const inProgress = courses.filter((c) => {
    const p = courseProgress(c, data);
    return p.started && p.pct < 100;
  });
  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading
          eyebrow={user ? `Hi, ${user.email?.split("@")[0]}` : "Welcome"}
          title="How will you flex your brain today?"
        />
        <div className="mt-4">
          <SearchBox />
        </div>
        <Hero />
        <div className="my-8">
          <Link to="/studio" className="block rounded-md border border-border p-5">
            <p className="font-semibold">Course Studio</p>
            <p className="text-xs text-muted-foreground">
              Trainers: build lessons, videos and quizzes.
            </p>
          </Link>
        </div>
        <ChallengeFinder />
        <Schools />
        {inProgress.length > 0 && <Section title="Continue learning" list={inProgress} />}
        <Section title="Recommended for you" list={courses.slice(0, 6)} />
        <Section
          title="Aquaponics & Water"
          list={courses.filter((c) =>
            ["Aquaponics", "Water Quality", "Monitoring"].includes(c.category),
          )}
        />
      </Sheet>
    </Phone>
  );
}
