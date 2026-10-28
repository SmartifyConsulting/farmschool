import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BookOpen, Search, X } from "lucide-react";
import { Phone, Header, Sheet } from "@/components/AppShell";
import { courses } from "@/lib/courses";
import { courseIndustry } from "@/lib/industries";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/search")({
  head: () => pageMeta("Course Catalogue — Mobile School", "Discover courses from creators across industries."),
  component: SearchPage,
});

type Listing = {
  id: string;
  title: string;
  category: string;
  industry: string;
  description: string;
  cover: string | null;
  source: "studio" | "sample";
};

function SearchPage() {
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("All");
  const [category, setCategory] = useState("All");
  const { data: published = [], isLoading, error } = useQuery({
    queryKey: ["catalogue-published"],
    queryFn: async () => {
      const { data, error } = await supabase.from("studio_courses")
        .select("id,title,description,category,cover_url")
        .eq("published", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const listings: Listing[] = useMemo(() => [
    ...published.map((c) => ({
      id: c.id, title: c.title, category: c.category || "General",
      industry: courseIndustry(c.category || ""),
      description: c.description || "", cover: c.cover_url,
      source: "studio" as const,
    })),
    ...courses.map((c) => ({
      id: c.id, title: c.title, category: c.category,
      industry: courseIndustry(c.category),
      description: c.description, cover: c.image,
      source: "sample" as const,
    })),
  ], [published]);

  const industries = useMemo(() => ["All", ...Array.from(new Set(listings.map((c) => c.industry))).sort()], [listings]);
  const categories = useMemo(() => ["All", ...Array.from(new Set(listings.filter((c) => industry === "All" || c.industry === industry).map((c) => c.category))).sort()], [listings, industry]);
  const visible = listings.filter((c) => {
    const matchesIndustry = industry === "All" || c.industry === industry;
    const matchesCategory = category === "All" || c.category === category;
    const matchesSearch = `${c.title} ${c.category} ${c.description}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesIndustry && matchesCategory && matchesSearch;
  });

  return (
    <Phone>
      <Header greeting="Explore learning" title="Course catalogue" />
      <Sheet>
        <div className="space-y-5 pb-10">
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input aria-label="Search courses" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses, topics and skills"
              className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary" />
            {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}
              className="absolute right-3 top-3"><X className="h-4 w-4" /></button>}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Industry</p>
            <div className="flex flex-wrap gap-2" aria-label="Industries">
              {industries.map((name) => <button key={name} type="button" aria-pressed={industry === name}
                onClick={() => { setIndustry(name); setCategory("All"); }}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${industry === name ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}>{name}</button>)}
            </div>
            <p className="text-xs font-semibold text-muted-foreground">Topic</p>
            <div className="flex flex-wrap gap-2" aria-label="Course categories">
            {categories.map((cat) => (
              <button key={cat} type="button" onClick={() => setCategory(cat)}
                aria-pressed={category === cat}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${category === cat ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-muted"}`}>
                {cat}
              </button>
            ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Explore courses</h2>
            <span className="text-xs text-muted-foreground">{visible.length} courses</span>
          </div>
          {isLoading && <p className="text-sm text-muted-foreground">Loading published courses…</p>}
          {error && <p role="alert" className="text-sm text-destructive">Could not load creator courses. Please try again.</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((c) => (
              <Link key={`${c.source}-${c.id}`} to={c.source === "studio" ? "/class/$id" : "/course/$id"} params={{ id: c.id }}
                className="overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/50">
                {c.cover ? <img src={c.cover} alt="" loading="lazy" className="h-36 w-full object-cover" /> :
                  <div className="grid h-36 place-items-center bg-muted"><BookOpen className="h-9 w-9 text-primary" /></div>}
                <div className="space-y-2 p-4">
                  <span className="text-xs text-muted-foreground">{c.industry} · {c.category}</span>
                  <h3 className="line-clamp-2 text-sm font-semibold">{c.title}</h3>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{c.description || "Explore this course on Mobile School."}</p>
                  {c.source === "sample" && <span className="inline-block rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">Sample course · Payments not enabled</span>}
                </div>
              </Link>
            ))}
          </div>
          {!isLoading && visible.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No courses match your search. Try another topic or category.</p>}
          <p className="text-xs text-muted-foreground">Course purchases are not yet enabled. Sample courses are provided for demonstration and are not paid offers.</p>
        </div>
      </Sheet>
    </Phone>
  );
}
