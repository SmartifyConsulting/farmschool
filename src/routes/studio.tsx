import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, PenSquare } from "lucide-react";
import { Phone, Header, Sheet } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { toast } from "sonner";
import { STUDIO_CATEGORIES } from "@/lib/studio";
import { INDUSTRIES, courseIndustry } from "@/lib/industries";
import { CourseWizard } from "@/components/CourseWizard";
import { CoverImageInput } from "@/components/CoverImageInput";
import { StudioCourseActions } from "@/components/StudioCourseActions";

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

const BLANK_DETAILS = { title: "", description: "", category: STUDIO_CATEGORIES[0] ?? "Farm Management", level: "Beginner", cover_url: "" };

function NewCourseDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (id: string) => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState(BLANK_DETAILS);
  const [newTopic, setNewTopic] = useState("");
  const [creating, setCreating] = useState(false);

  const create = async () => {
    if (!user || creating) return;
    if (form.title.trim().length < 3) { toast.error("Give your course a title of at least 3 letters."); return; }
    setCreating(true);
    const { data: c, error } = await supabase.from("studio_courses").insert({
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      level: form.level,
      cover_url: form.cover_url.trim() || null,
      author_id: user.id,
    }).select("id").single();
    setCreating(false);
    if (error) { toast.error("Could not create the course."); return; }
    setForm(BLANK_DETAILS);
    setNewTopic("");
    onCreated(c.id);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!creating) { onOpenChange(next); if (!next) { setForm(BLANK_DETAILS); setNewTopic(""); } } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Course details</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); create(); }} className="space-y-3">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Course title, e.g. Raising broilers" aria-label="Title" maxLength={120} autoFocus />
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What will learners gain from this course?" rows={3} maxLength={4000} />
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 space-y-2">
              <label className="block text-xs font-medium">Industry</label>
              <select value={courseIndustry(form.category)} onChange={(e) => {
                const selected = e.target.value;
                setForm({ ...form, category: selected === "Agriculture" ? "Farm Management" : selected + " / General" });
                setNewTopic("");
              }} className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm" aria-label="Industry">
                {INDUSTRIES.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <label className="block text-xs font-medium">Topic</label>
              {courseIndustry(form.category) === "Agriculture" ? (
                <select value={STUDIO_CATEGORIES.includes(form.category) ? form.category : ""} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm" aria-label="Topic">
                  {!STUDIO_CATEGORIES.includes(form.category) && <option value="">Select a topic</option>}
                  {STUDIO_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              ) : (
                <Input value={newTopic || form.category.split(" / ").slice(1).join(" / ")}
                  onChange={(e) => { setNewTopic(e.target.value); setForm({ ...form, category: courseIndustry(form.category) + " / " + e.target.value }); }}
                  aria-label="Topic" placeholder="e.g. Patient care, Retail operations" maxLength={100} />
              )}
            </div>
            <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="rounded-md border border-input bg-background px-2 py-2 text-sm" aria-label="Level">{["Beginner", "Intermediate", "Advanced"].map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <CoverImageInput value={form.cover_url} onChange={(url) => setForm({ ...form, cover_url: url })} />
          <DialogFooter>
            <Button type="submit" disabled={creating} className="w-full"><Plus className="h-4 w-4" />{creating ? "Creating…" : "Create course"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Studio() {
  const { user, ready } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["studio-mine", user?.id], enabled: !!user, queryFn: async () => {
    if (!user) return [];
    return (await supabase.from("studio_courses").select("id, title, published, category, version_number, revision_of, studio_lessons(count), studio_modules(count)").eq("author_id", user.id).order("updated_at", { ascending: false })).data ?? [];
  } });
  const handleCreated = (id: string) => {
    setDialogOpen(false);
    qc.invalidateQueries({ queryKey: ["studio-mine"] });
    nav({ to: "/studio/$id", params: { id } });
  };
  return (
    <Phone>
      <Header greeting="For trainers" title="Course Studio" />
      <Sheet wide>
        {ready && !user ? <p className="py-10 text-center text-sm text-muted-foreground"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> to create courses.</p> : (<>
          <p className="mb-4 text-sm text-muted-foreground">Create and edit courses here. To publish a new course, first <Link to="/creator-application" className="font-semibold text-primary">apply for creator approval</Link>.</p>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" />Create</Button>
            {user && <CourseWizard />}
          </div>
          <NewCourseDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={handleCreated} />
          <div className="mt-5 flex flex-wrap gap-3"><Input aria-label="Search your courses" placeholder="Search your courses" value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" /><select aria-label="Course status" value={status} onChange={e => setStatus(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="all">All courses</option><option value="draft">Drafts</option><option value="published">Published</option><option value="revision">Revisions</option></select></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(data ?? []).filter(c => c.title.toLowerCase().includes(search.toLowerCase()) && (status === "all" || status === "published" && c.published || status === "draft" && !c.published || status === "revision" && !!c.revision_of)).map((c) => (
              <article key={c.id} className="min-w-0 rounded-lg border border-border p-5 hover:bg-muted/50">
                <div className="flex items-start justify-between gap-2"><Link to="/studio/$id" params={{ id: c.id }} className="break-words font-semibold hover:text-primary">{c.title}</Link><StudioCourseActions course={c} onChanged={() => qc.invalidateQueries({ queryKey: ["studio-mine"] })} /></div>
                <p className="mt-2 text-xs text-muted-foreground">{c.category} · {(c.studio_modules as unknown as { count: number }[])[0]?.count ?? 0} modules · {(c.studio_lessons as unknown as { count: number }[])[0]?.count ?? 0} lessons</p>
                <div className="mt-2 flex gap-2 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 ${c.published ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"}`}>{c.published ? "Published" : c.revision_of ? "Draft revision" : "Draft"}</span><span className="text-muted-foreground">v1.{c.version_number - 1}</span>
                </div>
              </article>))}
            {data?.length === 0 && <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No courses yet — click Create above to start.</p>}
          </div>
        </>)}
      </Sheet>
    </Phone>
  );
}
