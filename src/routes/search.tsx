import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Folder, Search, X } from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { courses } from "@/lib/courses";
import { catalogueSector, sectorInitial } from "@/lib/catalogue-sectors";
import { pageMeta } from "@/lib/page-meta";
import { CoursePrice } from "@/components/CoursePrice";
import { CourseViewToggle, useCourseView } from "@/components/CourseViewToggle";
import { Button } from "@/components/ui/button";
import { readAllPages } from "@/lib/database-pages";

export const Route = createFileRoute("/search")({
  head: () =>
    pageMeta("Course Catalogue — Plusticity", "Discover courses from creators across industries."),
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
  priceCents: number;
  currency: string;
};

function SearchPage() {
  const [view, setView] = useCourseView("catalogue", "cards");
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState<string | null>(null);
  const [letter, setLetter] = useState("All");
  const {
    data: published = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["catalogue-published"],
    queryFn: async () => {
      const { data } = await readAllPages(
        supabase
          .from("studio_courses")
          .select("id,title,description,category,cover_url,price_cents,currency", {
            count: "exact",
          })
          .eq("published", true)
          .order("updated_at", { ascending: false })
          .order("id"),
      );
      return data ?? [];
    },
  });

  const listings: Listing[] = useMemo(
    () => [
      ...published.map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category || "General",
        industry: catalogueSector(c.category || ""),
        description: c.description || "",
        cover: c.cover_url,
        source: "studio" as const,
        priceCents: c.price_cents,
        currency: c.currency,
      })),
      ...courses.map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category,
        industry: catalogueSector(c.category),
        description: c.description,
        cover: c.image,
        source: "sample" as const,
        priceCents: 0,
        currency: "usd",
      })),
    ],
    [published],
  );

  const matching = listings.filter((course) =>
    (course.title + " " + course.category + " " + course.industry + " " + course.description)
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const allFolders = Array.from(new Set(matching.map((course) => course.industry)))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, count: matching.filter((course) => course.industry === name).length }));
  const folders = allFolders.filter(
    (folder) => letter === "All" || sectorInitial(folder.name) === letter,
  );
  const visible = matching.filter((course) =>
    industry
      ? course.industry === industry
      : letter === "All" || sectorInitial(course.industry) === letter,
  );

  return (
    <Phone>
      <Header />
      <Sheet>
        <div className="space-y-5 pb-10">
          <CanvasHeading eyebrow="Explore learning" title="Course catalogue" />
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
            />
            <input
              aria-label="Search courses"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses, topics and skills"
              className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute right-3 top-3"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div
            role="group"
            aria-label="Filter industry folders alphabetically"
            className="flex flex-wrap gap-1.5"
          >
            {["All", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((initial) => (
              <Button
                key={initial}
                type="button"
                size="sm"
                variant={letter === initial ? "default" : "outline"}
                className="min-w-8 px-2 text-[13px]"
                aria-pressed={letter === initial}
                aria-label={
                  initial === "All"
                    ? "All industry folders"
                    : `Industries beginning with ${initial}`
                }
                disabled={
                  initial !== "All" &&
                  !allFolders.some((folder) => sectorInitial(folder.name) === initial)
                }
                onClick={() => {
                  setLetter(initial);
                  setIndustry(null);
                }}
              >
                {initial}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {industry ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIndustry(null);
                  setLetter("All");
                }}
              >
                <ArrowLeft className="size-4" />
                All industries
              </Button>
            ) : (
              <h2 className="font-semibold">Browse by industry</h2>
            )}
            <span className="text-xs text-muted-foreground">
              {visible.length} {visible.length === 1 ? "course" : "courses"}
            </span>
            {industry && <CourseViewToggle view={view} onChange={setView} />}
          </div>
          {industry && <h2 className="text-lg font-semibold">{industry}</h2>}
          {isLoading && <p className="text-sm text-muted-foreground">Loading published courses…</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              Could not load creator courses. Please try again.
            </p>
          )}
          {!industry ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Industry folders">
              {folders.map((folder) => (
                <button
                  key={folder.name}
                  type="button"
                  onClick={() => setIndustry(folder.name)}
                  className="flex min-h-32 items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5 text-left transition hover:border-amber-400 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring dark:border-amber-800 dark:bg-amber-950/20"
                >
                  <Folder
                    aria-hidden="true"
                    className="size-14 shrink-0 fill-amber-300 text-amber-500"
                  />
                  <span className="min-w-0">
                    <span className="block break-words font-semibold">{folder.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {folder.count} {folder.count === 1 ? "course" : "courses"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div
              className={
                view === "cards" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "grid gap-3"
              }
            >
              {visible.map((c) => (
                <Link
                  key={`${c.source}-${c.id}`}
                  to={c.source === "studio" ? "/class/$id" : "/course/$id"}
                  params={{ id: c.id }}
                  className={`overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/50 ${view === "list" ? "flex items-center" : ""}`}
                >
                  {c.cover ? (
                    <img
                      src={c.cover}
                      alt=""
                      loading="lazy"
                      className={
                        view === "cards"
                          ? "aspect-video w-full object-cover"
                          : "aspect-video w-36 shrink-0 object-cover sm:w-48"
                      }
                    />
                  ) : (
                    <div
                      className={`grid aspect-video place-items-center bg-muted ${view === "cards" ? "w-full" : "w-36 shrink-0 sm:w-48"}`}
                    >
                      <BookOpen className="h-9 w-9 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {c.industry} · {c.category}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-primary">
                        <CoursePrice amount={c.priceCents} currency={c.currency} />
                      </span>
                    </div>
                    <h3 className="line-clamp-2 text-sm font-semibold">{c.title}</h3>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {c.description || "Explore this course on Plusticity."}
                    </p>
                    {c.source === "sample" && (
                      <span className="inline-block rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                        Sample course · Not a real offer
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
          {!isLoading && !error && visible.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No courses match your search. Try another search or browse all industries.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Paid courses are bought once via Stripe Checkout. Sample courses are provided for
            demonstration and are not paid offers.
          </p>
        </div>
      </Sheet>
    </Phone>
  );
}
