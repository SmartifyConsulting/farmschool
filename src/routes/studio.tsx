import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, PenSquare } from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { toast } from "sonner";
import { STUDIO_CATEGORIES } from "@/lib/studio";
import { INDUSTRIES, INDUSTRY_TOPICS, courseIndustry } from "@/lib/industries";
import { CourseWizard } from "@/components/CourseWizard";
import { PolishButton } from "@/components/PolishButton";
import { CoverImageInput } from "@/components/CoverImageInput";
import { StudioCourseActions } from "@/components/StudioCourseActions";
import { CourseViewToggle, useCourseView } from "@/components/CourseViewToggle";
import { QuestionBank } from "@/components/QuestionBank";
import { CourseArchiveRestore } from "@/components/CourseArchiveTools";
import { extractDocument } from "@/lib/document-extraction";
import { buildCourseDraft, type DraftCourse, type SourcePage } from "@/lib/course-factory";
import { generateCourseDetails } from "@/lib/studio-ai.functions";

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "Course Studio — Plusticity" },
      {
        name: "description",
        content: "Create courses with video lessons, readings and quizzes across industries.",
      },
      { property: "og:title", content: "Course Studio — Plusticity" },
      { property: "og:description", content: "Build and publish courses across industries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudioLayout,
});

function StudioLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return path === "/studio" || path === "/studio/" ? <Studio /> : <Outlet />;
}

const BLANK_DETAILS = {
  title: "",
  description: "",
  category: STUDIO_CATEGORIES[0] ?? "Farm Management",
  level: "Beginner",
  cover_url: "",
  prerequisite_course_id: "",
  target_audience: "",
  value_proposition: "",
  outcomes_timeline: "",
};

/** Published courses by any creator, for the Prerequisites dropdown. */
function usePrerequisiteOptions(excludeId?: string) {
  return useQuery({
    queryKey: ["prerequisite-options", excludeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("studio_courses")
        .select("id, title")
        .eq("published", true)
        .order("title")
        .limit(200);
      return (data ?? []).filter((c) => c.id !== excludeId);
    },
  });
}

function NewCourseDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState(BLANK_DETAILS);
  const [newTopic, setNewTopic] = useState("");
  const [otherTopic, setOtherTopic] = useState(false);
  const [creating, setCreating] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [manualFileName, setManualFileName] = useState("");
  const [extractedPages, setExtractedPages] = useState<SourcePage[] | null>(null);
  const [extractedDraft, setExtractedDraft] = useState<DraftCourse | null>(null);
  const { data: prereqOptions = [] } = usePrerequisiteOptions();
  const runGenerateCourseDetails = useServerFn(generateCourseDetails);

  const resetManual = () => {
    setManualFileName("");
    setExtractedPages(null);
    setExtractedDraft(null);
  };

  const guessCategory = (text: string): string | null => {
    const lower = text.toLowerCase();
    let best: { category: string; score: number } | null = null;
    for (const category of STUDIO_CATEGORIES) {
      const words = category.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
      if (!words.length) continue;
      const score = words.reduce(
        (sum, word) => sum + (lower.match(new RegExp(`\\b${word}`, "g"))?.length ?? 0),
        0,
      );
      if (score > 0 && (!best || score > best.score)) best = { category, score };
    }
    return best?.category ?? null;
  };

  const analyzeManual = async (file: File | undefined) => {
    if (!file || extracting) return;
    setExtracting(true);
    try {
      const pages = await extractDocument(file);
      const fallbackTitle = file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const draft = buildCourseDraft(fallbackTitle || "Untitled course", pages);
      const firstBody = draft.lessons[0]?.body ?? "";
      const description = firstBody.replace(/\s+/g, " ").trim().slice(0, 280);
      const combinedText = pages.map((p) => p.text).join("\n");
      const guessedCategory = guessCategory(combinedText);
      setForm((prev) => ({
        ...prev,
        title: prev.title.trim() ? prev.title : fallbackTitle.slice(0, 120),
        description: prev.description.trim() ? prev.description : description,
        category: guessedCategory ?? prev.category,
      }));
      setExtractedPages(pages);
      setExtractedDraft(draft);
      setManualFileName(file.name);
      toast.success("Manual analyzed — review the auto-filled details below before creating.");
      try {
        const details = await runGenerateCourseDetails({
          data: { title: fallbackTitle || "Untitled course", sourceText: combinedText },
        });
        setForm((prev) => ({
          ...prev,
          target_audience: prev.target_audience.trim() ? prev.target_audience : details.targetAudience,
          value_proposition: prev.value_proposition.trim() ? prev.value_proposition : details.valueProposition,
          outcomes_timeline: prev.outcomes_timeline.trim() ? prev.outcomes_timeline : details.outcomesTimeline,
        }));
      } catch {
        // AI quota/key issues are non-fatal here: the manual is already analyzed and
        // these fields are optional, so the user can just fill them in manually.
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read this document.");
    } finally {
      setExtracting(false);
    }
  };

  const create = async () => {
    if (!user || creating) return;
    if (form.title.trim().length < 3) {
      toast.error("Give your course a title of at least 3 letters.");
      return;
    }
    setCreating(true);
    const { data: c, error } = await supabase
      .from("studio_courses")
      .insert({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        level: form.level,
        cover_url: form.cover_url.trim() || null,
        prerequisite_course_id: form.prerequisite_course_id || null,
        target_audience: form.target_audience.trim(),
        value_proposition: form.value_proposition.trim(),
        outcomes_timeline: form.outcomes_timeline.trim(),
        author_id: user.id,
      })
      .select("id")
      .single();
    if (error) {
      setCreating(false);
      toast.error("Could not create the course.");
      return;
    }
    if (extractedPages && extractedDraft) {
      const { error: draftError } = await supabase.from("studio_course_source_drafts" as never).upsert({
        course_id: c.id,
        source_name: manualFileName,
        source_text: extractedPages.map((p) => p.text).join("\n\n"),
        source_pages: extractedPages,
        draft: extractedDraft,
      } as never);
      if (draftError) {
        toast.error(
          "Course created, but the analyzed manual could not be carried over — upload it again in Studio.",
        );
      }
    }
    setCreating(false);
    setForm(BLANK_DETAILS);
    setNewTopic("");
    setOtherTopic(false);
    resetManual();
    onCreated(c.id);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!creating) {
          onOpenChange(next);
          if (!next) {
            setForm(BLANK_DETAILS);
            setNewTopic("");
            setOtherTopic(false);
            resetManual();
          }
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Course details</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
          className="space-y-3"
        >
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Course title, e.g. Raising broilers"
            aria-label="Title"
            maxLength={120}
            autoFocus
          />
          <div className="space-y-1.5 rounded-lg border border-dashed border-border p-3">
            <label className="block text-xs font-medium">
              Start from a training manual (optional)
              <input
                type="file"
                accept=".pdf,.docx,.pptx,.txt,.md"
                disabled={extracting}
                onChange={(e) => {
                  void analyzeManual(e.target.files?.[0]);
                  e.target.value = "";
                }}
                className="mt-1 block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-primary"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              {extracting
                ? "Analyzing manual…"
                : manualFileName
                  ? `Analyzed "${manualFileName}" — description and topic below are auto-filled; review before creating.`
                  : "Upload a manual and the description and topic below will be pre-filled from it."}
            </p>
          </div>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What will learners gain from this course?"
            rows={3}
            maxLength={4000}
          />
          <PolishButton
            title={form.title}
            text={form.description}
            onText={(t) => setForm({ ...form, description: t })}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 space-y-2">
              <label className="block text-xs font-medium">Industry</label>
              <select
                value={courseIndustry(form.category)}
                onChange={(e) => {
                  const selected = e.target.value;
                  setForm({
                    ...form,
                    category:
                      selected === "Agriculture" ? "Farm Management" : selected + " / General",
                  });
                  setNewTopic("");
                }}
                className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                aria-label="Industry"
              >
                {INDUSTRIES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <label className="block text-xs font-medium">Topic</label>
              {(() => {
                const industry = courseIndustry(form.category);
                const curated = industry === "Agriculture" ? STUDIO_CATEGORIES : (INDUSTRY_TOPICS[industry] ?? []);
                const bareTopic =
                  industry === "Agriculture" ? form.category : form.category.split(" / ").slice(1).join(" / ");
                const showOther = otherTopic || (!!bareTopic && !curated.includes(bareTopic));
                if (!curated.length) {
                  return (
                    <Input
                      value={newTopic || bareTopic}
                      onChange={(e) => {
                        setNewTopic(e.target.value);
                        setForm({ ...form, category: industry + " / " + e.target.value });
                      }}
                      aria-label="Topic"
                      placeholder="e.g. Patient care, Retail operations"
                      maxLength={100}
                    />
                  );
                }
                return (
                  <>
                    <select
                      value={showOther ? "__other__" : curated.includes(bareTopic) ? bareTopic : ""}
                      onChange={(e) => {
                        if (e.target.value === "__other__") {
                          setOtherTopic(true);
                          setNewTopic("");
                          return;
                        }
                        setOtherTopic(false);
                        setNewTopic("");
                        setForm({
                          ...form,
                          category: industry === "Agriculture" ? e.target.value : industry + " / " + e.target.value,
                        });
                      }}
                      className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                      aria-label="Topic"
                    >
                      {!showOther && !curated.includes(bareTopic) && <option value="">Select a topic</option>}
                      {curated.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                      <option value="__other__">Other</option>
                    </select>
                    {showOther && (
                      <Input
                        value={newTopic}
                        onChange={(e) => {
                          setNewTopic(e.target.value);
                          setForm({
                            ...form,
                            category:
                              industry === "Agriculture" ? e.target.value : industry + " / " + e.target.value,
                          });
                        }}
                        aria-label="Custom topic"
                        placeholder="Describe the topic"
                        maxLength={100}
                        autoFocus
                      />
                    )}
                  </>
                );
              })()}
            </div>
            <select
              value={form.level}
              onChange={(e) => setForm({ ...form, level: e.target.value })}
              className="rounded-md border border-input bg-background px-2 py-2 text-sm"
              aria-label="Level"
            >
              {["Beginner", "Intermediate", "Advanced"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <CoverImageInput
            value={form.cover_url}
            onChange={(url) => setForm({ ...form, cover_url: url })}
          />
          <div className="space-y-3 border-t border-border pt-3">
            <div>
              <label className="block text-xs font-medium">Prerequisites</label>
              <p className="text-xs text-muted-foreground">
                Require a learner to finish another published course first.
              </p>
              <select
                value={form.prerequisite_course_id}
                onChange={(e) => setForm({ ...form, prerequisite_course_id: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                aria-label="Prerequisite course"
              >
                <option value="">None</option>
                {prereqOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <label className="block space-y-1 text-xs font-medium">
              Target Audience
              <Textarea
                value={form.target_audience}
                onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
                placeholder="Ideal audience & market profile"
                rows={2}
                maxLength={2000}
              />
            </label>
            <label className="block space-y-1 text-xs font-medium">
              Value Proposition
              <Textarea
                value={form.value_proposition}
                onChange={(e) => setForm({ ...form, value_proposition: e.target.value })}
                placeholder="Value of certification / qualification"
                rows={2}
                maxLength={2000}
              />
            </label>
            <label className="block space-y-1 text-xs font-medium">
              Outcomes & Timeline
              <Textarea
                value={form.outcomes_timeline}
                onChange={(e) => setForm({ ...form, outcomes_timeline: e.target.value })}
                placeholder="Key learning outcomes & program duration"
                rows={2}
                maxLength={2000}
              />
            </label>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={creating || extracting} className="w-full">
              <Plus className="h-4 w-4" />
              {creating ? "Creating…" : "Create course"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Studio() {
  const [view, setView] = useCourseView("studio", "cards");
  const { user, ready } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["studio-mine", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      return (
        (
          await supabase
            .from("studio_courses")
            .select(
              "id, title, published, category, cover_url, version_number, revision_of, studio_lessons(count), studio_modules(count)",
            )
            .eq("author_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(200)
        ).data ?? []
      );
    },
  });
  const handleCreated = (id: string) => {
    setDialogOpen(false);
    qc.invalidateQueries({ queryKey: ["studio-mine"] });
    nav({ to: "/studio/$id", params: { id } });
  };
  return (
    <Phone>
      <Header />
      <Sheet wide>
        <div className="mb-4">
          <CanvasHeading eyebrow="For trainers" title="Course Studio" />
        </div>
        {ready && !user ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            <Link to="/auth" className="font-semibold text-primary">
              Sign in
            </Link>{" "}
            to create courses.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Create and edit courses here. To publish a new course, first{" "}
              <Link to="/creator-application" className="font-semibold text-primary">
                apply for creator approval
              </Link>
              . Have a SCORM package?{" "}
              <Link to="/scorm" className="font-semibold text-primary">
                Upload SCORM courses
              </Link>
              .
            </p>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Create
              </Button>
              {user && <CourseWizard />}
            </div>
            <NewCourseDialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              onCreated={handleCreated}
            />
            <details className="mt-4 rounded-xl border border-border/60 bg-muted/30 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-muted-foreground">
                Advanced tools (question bank, restore from archive)
              </summary>
              <div className="mt-3 space-y-3">
                <QuestionBank />
                {user && <CourseArchiveRestore />}
              </div>
            </details>
            <div className="mt-5 flex flex-wrap gap-3">
              <Input
                aria-label="Search your courses"
                placeholder="Search your courses"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-md"
              />
              <select
                aria-label="Course status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All courses</option>
                <option value="draft">Drafts</option>
                <option value="published">Published</option>
                <option value="revision">Revisions</option>
              </select>
              <CourseViewToggle view={view} onChange={setView} />
            </div>
            <div className={view === "cards" ? "mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "mt-5 grid gap-3"}>
              {(data ?? [])
                .filter(
                  (c) =>
                    c.title.toLowerCase().includes(search.toLowerCase()) &&
                    (status === "all" ||
                      (status === "published" && c.published) ||
                      (status === "draft" && !c.published) ||
                      (status === "revision" && !!c.revision_of)),
                )
                .map((c) => (
                  <article
                    key={c.id}
                    className={`min-w-0 overflow-hidden rounded-lg border border-border hover:bg-muted/50 ${view === "list" ? "flex items-center" : ""}`}
                  >
                    {c.cover_url ? (
                      <img
                        src={c.cover_url}
                        alt=""
                        className={view === "cards" ? "h-32 w-full object-cover" : "h-24 w-24 shrink-0 object-cover sm:w-36"}
                      />
                    ) : (
                      <div className={`grid place-items-center bg-muted text-xs text-muted-foreground ${view === "cards" ? "h-32 w-full" : "h-24 w-24 shrink-0 sm:w-36"}`}>
                        No cover image
                      </div>
                    )}
                    <div className="min-w-0 flex-1 p-5">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to="/studio/$id"
                          params={{ id: c.id }}
                          className="break-words font-semibold hover:text-primary"
                        >
                          {c.title}
                        </Link>
                        <StudioCourseActions
                          course={c}
                          onChanged={() => qc.invalidateQueries({ queryKey: ["studio-mine"] })}
                        />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {c.category} ·{" "}
                        {(c.studio_modules as unknown as { count: number }[])[0]?.count ?? 0} modules
                        · {(c.studio_lessons as unknown as { count: number }[])[0]?.count ?? 0}{" "}
                        lessons
                      </p>
                      <Link to="/competencies/$courseId" params={{ courseId: c.revision_of ?? c.id }} className="mt-3 inline-block text-xs font-semibold text-primary">Competencies & assessment</Link>
                      <Link to="/gradebook/$courseId" params={{ courseId: c.revision_of ?? c.id }} className="ml-4 mt-3 inline-block text-xs font-semibold text-primary">Gradebook</Link>
                      <div className="mt-2 flex gap-2 text-[11px]">
                        <span
                          className={`rounded-full px-2 py-0.5 ${c.published ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"}`}
                        >
                          {c.published ? "Published" : c.revision_of ? "Draft revision" : "Draft"}
                        </span>
                        <span className="text-muted-foreground">v1.{c.version_number - 1}</span>
                      </div>
                    </div>
                  </article>
                ))}
              {data?.length === 0 && (
                <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                  No courses yet — click Create above to start.
                </p>
              )}
            </div>
          </>
        )}
      </Sheet>
    </Phone>
  );
}
