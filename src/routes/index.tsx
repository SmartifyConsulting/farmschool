import { createFileRoute, Link } from "@tanstack/react-router";
import { Fish, Droplets, Tractor, Store, Gauge, Star, ChevronRight } from "lucide-react";
import { Phone, Header, SearchBox, Sheet } from "@/components/AppShell";
import { categories, courses } from "@/lib/courses";

const icons = { Fish, Droplets, Tractor, Store, Gauge };

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FarmerPlus Learning — Agricultural Courses" },
      { name: "description", content: "Learn aquaponics, water quality, farm operations and market access with FarmerPlus." },
      { property: "og:title", content: "FarmerPlus Learning" },
      { property: "og:description", content: "Practical agricultural courses on your phone." },
    ],
  }),
  component: Index,
});

export function CourseCard({ c }: { c: (typeof courses)[number] }) {
  return (
    <Link to="/course/$id" params={{ id: c.id }} className="w-52 shrink-0 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative h-32"><img src={c.image} alt="" className="h-full w-full object-cover" />
        <span className="absolute left-2 top-2 rounded-full bg-primary/85 px-2 py-0.5 text-[10px] text-primary-foreground">{c.creator}</span></div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug">{c.title}</p>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-muted-foreground"><Star className="h-3 w-3 fill-accent text-accent" />{c.rating} ({c.reviews})</span>
          <span className="font-bold">${c.price}</span>
        </div>
      </div>
    </Link>
  );
}

function Section({ title, list }: { title: string; list: typeof courses }) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{title}</h2>
        <Link to="/search" className="flex items-center text-xs text-muted-foreground">See All <ChevronRight className="h-3 w-3" /></Link></div>
      <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2">{list.map((c) => <CourseCard key={c.id} c={c} />)}</div>
    </section>
  );
}

function Index() {
  return (
    <Phone>
      <Header title="What will you grow today?"><SearchBox /></Header>
      <div className="bg-primary px-5 pb-8 text-primary-foreground">
        <div className="mb-3 flex justify-between"><h2 className="font-semibold">Categories</h2><span className="text-xs opacity-80">See All</span></div>
        <div className="-mx-5 flex gap-4 overflow-x-auto px-5">
          {categories.map((cat, i) => { const I = icons[cat.icon]; return (
            <Link to="/search" key={cat.name} className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center text-[11px]">
              <span className={`grid h-14 w-14 place-items-center rounded-full ${i === 0 ? "bg-card text-primary" : "bg-primary-foreground/15"}`}><I className="h-5 w-5" /></span>{cat.name}
            </Link>); })}
        </div>
      </div>
      <Sheet>
        <Section title="Recommended for you" list={courses} />
        <Section title="Aquaponics & Water" list={courses.filter((c) => ["Aquaponics", "Water Quality", "Monitoring"].includes(c.category))} />
      </Sheet>
    </Phone>
  );
}
