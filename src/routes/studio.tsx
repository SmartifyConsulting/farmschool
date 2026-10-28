import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, PenSquare } from "lucide-react";
import { Phone, Header, Sheet } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { toast } from "sonner";

export const Route = createFileRoute("/studio")({
  head: () => ({ meta: [
    { title: "Course Studio — Mobile School" },
    { name: "description", content: "Create courses with video lessons, readings and quizzes across industries." },
    { property: "og:title", content: "Course Studio — Mobile School" },
    { property: "og:description", content: "Build and publish courses across industries." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: StudioLayout,
});

function StudioLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return path === "/studio" || path === "/studio/" ? <Studio /> : <Outlet />;
}

function Studio() {
  const { user, ready } = useAuth();
  const [title, setTitle] = useState("");
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["studio-mine", user?.id], enabled: !!user, queryFn: async () =>
    (await supabase.from("studio_courses").select("id, title, published, category, studio_lessons(count)").eq("author_id", user!.id).order("updated_at", { ascending: false })).data ?? [] });
  const create = async () => {
    if (title.trim().length < 3) { toast.error("Give your course a title of at least 3 letters."); return; }
    const { data: c, error } = await supabase.from("studio_courses").insert({ title: title.trim(), author_id: user!.id }).select("id").single();
    if (error) { toast.error("Could not create the course."); return; }
    qc.invalidateQueries({ queryKey: ["studio-mine"] });
    nav({ to: "/studio/$id", params: { id: c.id } });
  };
  return (
    <Phone>
      <Header greeting="For trainers" title="Course Studio" />
      <Sheet>
        {ready && !user ? <p className="py-10 text-center text-sm text-muted-foreground"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> to create courses.</p> : (<>
          <p className="mb-4 text-sm text-muted-foreground">Create and edit courses here. To publish a new course, first <Link to="/creator-application" className="font-semibold text-primary">apply for creator approval</Link>.</p>
          <form onSubmit={(e) => { e.preventDefault(); create(); }} className="flex gap-2 md:max-w-xl">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New course title, e.g. Raising broilers" maxLength={120} />
            <Button type="submit"><Plus className="h-4 w-4" />Create</Button>
          </form>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(data ?? []).map((c) => (
              <Link key={c.id} to="/studio/$id" params={{ id: c.id }} className="min-w-0 rounded-2xl border border-border p-4 hover:bg-muted/50">
                <div className="flex items-start justify-between gap-2"><p className="font-semibold">{c.title}</p><PenSquare className="h-4 w-4 shrink-0 text-primary" /></div>
                <p className="mt-1 text-xs text-muted-foreground">{c.category} · {(c.studio_lessons as unknown as { count: number }[])[0]?.count ?? 0} lessons</p>
                <div className="mt-2 flex gap-2 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 ${c.published ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"}`}>{c.published ? "Published" : "Draft"}</span>
                </div>
              </Link>))}
            {data?.length === 0 && <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No courses yet — type a title above to start.</p>}
          </div>
        </>)}
      </Sheet>
    </Phone>
  );
}
