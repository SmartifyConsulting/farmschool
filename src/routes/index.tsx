import { createFileRoute, Link } from "@tanstack/react-router";
import { Fish, Droplets, Tractor, Store, Gauge, Star, ChevronRight } from "lucide-react";
import { Phone, Header, SearchBox, Sheet, BookmarkButton, ProgressBar } from "@/components/AppShell";
import { categories, courses, type Course } from "@/lib/courses";
import { useAuth, useProgress, courseProgress } from "@/hooks/useLearning";

const icons = { Fish, Droplets, Tractor, Store, Gauge };

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FarmerPlus Learning — Agricultural Courses" },
      { name: "description", content: "Learn aquaponics, water quality, farm operations and market access with FarmerPlus." },
      { property: "og:title", content: "FarmerPlus Learning" },
      { property: "og:description", content: "Practical agricultural courses on any device." },
    ],
  }),
  component: Index,
});

export function CourseCard({ c }: { c: Course }) {
  const { data } = useProgress();
  const p = courseProgress(c, data);
  return (
    <Link to="/course/$id" params={{ id: c.id }} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative h-28 sm:h-32 md:h-40"><img src={c.image} alt="" className="h-full w-full object-cover" />
        <span className="absolute left-2 top-2 rounded-full bg-primary/85 px-2 py-0.5 text-[10px] text-primary-foreground">{c.creator}</span>
        <BookmarkButton courseId={c.id} className="absolute right-2 top-2" /></div>
      <div className="p-3">
        <p className="line-clamp-2 text-xs sm:text-sm font-semibold leading-snug">{c.title}</p>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-muted-foreground"><Star className="h-3 w-3 fill-accent text-accent" />{c.rating} ({c.reviews})</span>
          <span className="font-bold">${c.price}</span>
        </div>
        {p.started && <div className="mt-2"><ProgressBar pct={p.pct} label={`${p.done}/${p.total} lessons`} /></div>}
      </div>
    </Link>
  );
}

function Section({ title, list }: { title: string; list: Course[] }) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold md:text-lg">{title}</h2>
        <Link to="/search" className="flex items-center text-xs text-muted-foreground">See All <ChevronRight className="h-3 w-3" /></Link></div>
      <div className="grid grid-cols-2 gap-3 pb-2 md:gap-5 lg:grid-cols-3 xl:grid-cols-4">{list.map((c) => <CourseCard key={c.id} c={c} />)}</div>
    </section>
  );
}

function Index() {
  const { user } = useAuth();
  const { data } = useProgress();
  const inProgress = courses.filter((c) => { const p = courseProgress(c, data); return p.started && p.pct < 100; });
  return (
    <Phone>
      <Header greeting={user ? `Hi, ${user.email?.split("@")[0]}` : "Welcome"} title="What will you grow today?"><SearchBox /></Header>
      <div className="bg-primary px-5 pb-8 text-primary-foreground md:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-3 flex justify-between"><h2 className="font-semibold">Categories</h2><Link to="/search" className="text-xs opacity-80">See All</Link></div>
          <div className="grid grid-cols-5 gap-1 md:flex md:gap-8">
            {categories.map((cat, i) => { const I = icons[cat.icon]; return (
              <Link to="/search" key={cat.name} className="flex min-w-0 flex-col items-center gap-1.5 text-center text-[10px] leading-tight sm:text-[11px] md:w-20 md:text-xs">
                <span className={`grid h-12 w-12 place-items-center rounded-full sm:h-14 sm:w-14 ${i === 0 ? "bg-card text-primary" : "bg-primary-foreground/15"}`}><I className="h-5 w-5" /></span>{cat.name}
              </Link>); })}
          </div>
        </div>
      </div>
      <Sheet>
        {inProgress.length > 0 && <Section title="Continue learning" list={inProgress} />}
        <Section title="Recommended for you" list={courses} />
        <Section title="Aquaponics & Water" list={courses.filter((c) => ["Aquaponics", "Water Quality", "Monitoring"].includes(c.category))} />
      </Sheet>
    </Phone>
  );
}
