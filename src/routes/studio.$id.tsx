import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2, Video, FileText, HelpCircle, Eye } from "lucide-react";
import { Phone, Header, Sheet } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { STUDIO_CATEGORIES, PASS_MARKS, parsePassMark } from "@/lib/studio";
import { INDUSTRIES, courseIndustry } from "@/lib/industries";
import { toast } from "sonner";
import { buildCourseDraft, type DraftCourse, type SourcePage } from "@/lib/course-factory";
import { extractDocument } from "@/lib/document-extraction";
import { suggestReviewQuestions } from "@/lib/course-quiz-suggestions";

function groupDraftLessons(lessons: DraftCourse["lessons"]) {
  const groups: { title: string; items: { lesson: DraftCourse["lessons"][number]; index: number }[] }[] = [];
  let active: (typeof groups)[number] | undefined;
  for (const [index, lesson] of lessons.entries()) {
    const match = lesson.title.match(/^MODULE\s+(\d+)\b(?:\s*[-–:]\s*(.*))?/i);
    if (match) {
      const number = match[1];
      const label = match[2]?.trim();
      active = groups.find(group => group.title.startsWith(`Module ${number} ·`));
      if (!active) {
        active = { title: `Module ${number} · ${label || "Topic to review"}`, items: [] };
        groups.push(active);
      }
    }
    if (!active) {
      active = { title: "Introduction · Review source grouping", items: [] };
      groups.push(active);
    }
    active.items.push({ lesson, index });
  }
  return groups;
}

const activityLabels: Record<string, { title: string; description: string }> = {
  illustrated: { title: "Illustrated explanation", description: "Trainer selects or verifies diagrams and captions before publishing." },
  video: { title: "Video demonstration", description: "Attach a relevant, verified video; no video is generated automatically." },
  steps: { title: "Step-by-step practice", description: "Turn source-supported procedures into a guided activity." },
  scenario: { title: "Applied scenario", description: "Create a source-grounded situation and ask learners to decide what to do." },
  quiz: { title: "Knowledge check", description: "Generate and verify questions, answers and supporting source references." },
  visual: { title: "Visual summary", description: "Review an infographic or labelled visual derived from the source." },
};

function SourceActivity({ method, lesson, courseId, published }: { method: string; lesson: DraftCourse["lessons"][number]; courseId: string; published: boolean }) {
  const evidence = lesson.body.split(/(?<=[.!?])\s+|\n+/).map(value => value.trim())
    .find(value => value.length >= 65 && value.length <= 450 && /[.!?]$/.test(value));
  const suggested = method === "steps"
    ? "Practical exercise: Using the evidence below, outline the steps you would follow and explain how you would check each step. Do not add procedures the source does not describe."
    : "Applied scenario: Apply the principle described below in a real farming situation. Explain what information you would check and what decision you would make, using the supplied evidence.";
  const key = `farmschool:activity:${courseId}:${lesson.sourceRefs[0]?.sourceId ?? "source"}:${lesson.title}:${method}`;
  const [activity, setActivity] = useState(suggested);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [approved, setApproved] = useState(false);
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored) as { prompt?: string };
        if (typeof parsed.prompt === "string") { setActivity(parsed.prompt); setSaved(true); }
      }
    } catch { /* Storage may be disabled; editing remains available. */ }
  }, [key]);
  useEffect(() => {
    let active = true;
    void supabase.from("studio_learning_activities").select("prompt,approved").eq("course_id", courseId).eq("activity_key", key).maybeSingle().then(({ data, error }) => {
      if (active && !error && data && typeof data.prompt === "string") { setActivity(data.prompt); setSaved(true); setApproved(!!data.approved); }
    });
    return () => { active = false; };
  }, [courseId, key]);
  if (method !== "steps" && method !== "scenario") return null;
  if (!evidence) return <p className="mt-2 text-xs text-amber-700">Insufficient explanatory source text to draft this activity. Trainer must supply verified content.</p>;
  return <div className="mt-3 space-y-2 rounded-md border border-border bg-background p-3">
    <p className="text-xs font-semibold">Editable activity draft · trainer review required</p>
    <Textarea aria-label="Activity instructions" value={activity} onChange={event => { setActivity(event.target.value); setSaved(false); setApproved(false); setVerified(false); }} rows={4} />
    <blockquote className="border-l-2 border-primary pl-3 text-xs text-muted-foreground">{evidence}</blockquote>
    <p className="text-xs text-muted-foreground">Evidence: {lesson.sourceRefs.map(ref => `${ref.sourceId}, p.${ref.page}`).join("; ")}. No model answer is asserted without trainer verification.</p>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={!activity.trim() || syncing || published} onClick={async () => {
        setSyncing(true);
        try {
          const { error } = await supabase.from("studio_learning_activities").upsert({
            course_id: courseId, activity_key: key, lesson_title: lesson.title,
            kind: method, prompt: activity, evidence, source_refs: lesson.sourceRefs,
            approved: false, updated_at: new Date().toISOString(),
          }, { onConflict: "course_id,activity_key" });
          if (error) throw error;
          window.localStorage.setItem(key, JSON.stringify({ kind: method, prompt: activity, evidence, sourceRefs: lesson.sourceRefs, reviewRequired: true }));
          setSaved(true);
          setApproved(false);
          setVerified(false);
          toast.success("Activity saved to Supabase.");
        } catch {
          toast.error("Cloud save failed. Run migration 0009 in Supabase SQL Editor, then retry.");
        } finally { setSyncing(false); }
      }}>Save draft</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(`${activity}\\n\\nSource evidence: ${evidence}\\nSource pages: ${lesson.sourceRefs.map(ref => `${ref.sourceId} p.${ref.page}`).join("; ")}`).then(() => toast.success("Activity copied."), () => toast.error("Could not copy activity."))}>Copy</Button>
      {saved && <span className="text-xs text-muted-foreground">{approved ? "Trainer approved · not published" : "Saved to cloud · pending approval"}</span>}
      {saved && !approved && <label className="flex w-full items-center gap-2 text-xs"><input type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)} disabled={published || syncing} />I have verified this activity against its source and approved its wording.</label>}
      {saved && <Button type="button" size="sm" variant="outline" disabled={syncing || published || (!approved && !verified)} onClick={async () => {
        setSyncing(true);
        const { data, error } = await supabase.from("studio_learning_activities").update({ approved: !approved }).eq("course_id", courseId).eq("activity_key", key).select("approved").single();
        setSyncing(false);
        if (error || !data) { toast.error("Could not update activity approval."); return; }
        setApproved(data.approved);
        setVerified(false);
        toast.success(data.approved ? "Activity approved for future publication." : "Activity returned to review.");
      }}>{approved ? "Reopen review" : "Approve activity"}</Button>}
    </div>
  </div>;
}

function FormattedLesson({ content }: { content: string }) {
  return <div className="space-y-3 text-sm leading-relaxed">{content.split(/\n\s*\n/).filter(Boolean).map((block, index) => {
    const line = block.trim();
    if (/^###\s+/.test(line)) return <h4 key={index} className="pt-2 text-base font-semibold">{line.replace(/^###\s+/, "")}</h4>;
    if (/^##\s+/.test(line)) return <h3 key={index} className="pt-3 text-lg font-semibold">{line.replace(/^##\s+/, "")}</h3>;
    if (/^#\s+/.test(line)) return <h2 key={index} className="pt-3 text-xl font-bold">{line.replace(/^#\s+/, "")}</h2>;
    const lines = line.split("\n");
    if (lines.every(item => /^[-*]\s+/.test(item))) return <ul key={index} className="list-disc space-y-1 pl-5">{lines.map((item, i) => <li key={i}>{item.replace(/^[-*]\s+/, "")}</li>)}</ul>;
    if (lines.every(item => /^\d+[.)]\s+/.test(item))) return <ol key={index} className="list-decimal space-y-1 pl-5">{lines.map((item, i) => <li key={i}>{item.replace(/^\d+[.)]\s+/, "")}</li>)}</ol>;
    return <p key={index} className="whitespace-pre-line">{line}</p>;
  })}</div>;
}

export const Route = createFileRoute("/studio/$id")({
  head: () => ({ meta: [
    { title: "Edit course — Mobile School Studio" },
    { name: "description", content: "Add lessons, videos and quizzes to your course." },
    { property: "og:title", content: "Edit course — Mobile School Studio" },
    { property: "og:description", content: "Build your farming course." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Editor,
});

type Q = { q: string; options: string[]; answer: number };
type LessonRow = { id: string; position: number; kind: string; title: string; video_url: string | null; body: string; quiz: unknown };

function Editor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: course, isLoading } = useQuery({ queryKey: ["studio-course", id], queryFn: async () => (await supabase.from("studio_courses").select("*").eq("id", id).maybeSingle()).data });
  const { data: lessons } = useQuery({ queryKey: ["studio-lessons", id], queryFn: async () => ((await supabase.from("studio_lessons").select("*").eq("course_id", id).order("position")).data ?? []) as LessonRow[] });
  const [sourceText, setSourceText] = useState("");
  const [sourcePages, setSourcePages] = useState<SourcePage[] | null>(null);
  const [sourceName, setSourceName] = useState("Training manual");
  const [draft, setDraft] = useState<DraftCourse | null>(null);
  const [importing, setImporting] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDraft, setAiDraft] = useState<{ lessonTitle: string; lessonSummary: string; questions: { question: string; options: string[]; correctIndex: number; sourceQuote: string }[]; droppedUnsupportedQuestions: number } | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");
  const [batchDrafts, setBatchDrafts] = useState<{ sourceTitle: string; sourceRefs: string; lessonTitle: string; lessonSummary: string; questions: { question: string; options: string[]; correctIndex: number; sourceQuote: string }[] }[]>([]);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [designChoices, setDesignChoices] = useState<Record<number, string[]>>({});
  const [designApproved, setDesignApproved] = useState<Record<number, boolean>>({});
  const [designRationale, setDesignRationale] = useState<Record<number, string>>({});
  const [designLoading, setDesignLoading] = useState<number | null>(null);
  const [restoredDesign, setRestoredDesign] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("farmschool:learning-design:" + id);
      if (saved) {
        const state = JSON.parse(saved) as { draft?: DraftCourse; sourceText?: string; sourceName?: string; sourcePages?: SourcePage[]; choices?: Record<number, string[]>; approved?: Record<number, boolean>; rationale?: Record<number, string> };
        if (state.draft?.lessons && Array.isArray(state.draft.lessons)) setDraft(state.draft);
        if (typeof state.sourceText === "string") setSourceText(state.sourceText);
        if (typeof state.sourceName === "string") setSourceName(state.sourceName);
        if (Array.isArray(state.sourcePages)) setSourcePages(state.sourcePages);
        if (state.choices) setDesignChoices(state.choices);
        if (state.approved) setDesignApproved(state.approved);
        if (state.rationale) setDesignRationale(state.rationale);
      }
    } catch { toast.error("Saved learning design could not be restored."); }
    finally { setRestoredDesign(true); }
  }, [id]);
  useEffect(() => {
    if (!restoredDesign) return;
    try {
      window.localStorage.setItem("farmschool:learning-design:" + id, JSON.stringify({
        draft, sourceText, sourceName, sourcePages, choices: designChoices, approved: designApproved, rationale: designRationale,
      }));
    } catch { toast.error("Learning design could not be saved in this browser."); }
  }, [id, restoredDesign, draft, sourceText, sourceName, sourcePages, designChoices, designApproved, designRationale]);

  const proposeDesign = async (index: number, lesson: { title: string; body: string; sourceRefs: { sourceId: string }[] }) => {
    if (designLoading !== null || lesson.body.length < 100) return;
    setDesignLoading(index);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) throw new Error("Please sign in.");
      const response = await fetch("/api/course-factory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.session.access_token },
        body: JSON.stringify({ courseId: id, title: lesson.title, sourceId: lesson.sourceRefs[0]?.sourceId ?? sourceName, sourceText: lesson.body.slice(0, 12000), mode: "design" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Could not propose learning methods.");
      await persistDesign(index, payload.methods, false, payload.rationale);
      setDesignChoices(p => ({ ...p, [index]: payload.methods }));
      setDesignApproved(p => ({ ...p, [index]: false }));
      setDesignRationale(p => ({ ...p, [index]: payload.rationale }));
      toast.success("AI proposal ready for review.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "AI proposal failed."); }
    finally { setDesignLoading(null); }
  };

  const designTable = () => supabase.from("studio_learning_designs" as never);
  const sourceDraftTable = () => supabase.from("studio_course_source_drafts" as never);
  const [cloudDraftReady, setCloudDraftReady] = useState(false);
  const [cloudDraftEnabled, setCloudDraftEnabled] = useState(false);
  const [cloudSaveStatus, setCloudSaveStatus] = useState<"loading" | "unavailable" | "pending" | "saving" | "saved" | "error">("loading");
  useEffect(() => {
    let cancelled = false;
    const loadCloudDraft = async () => {
      const { data, error } = await sourceDraftTable().select("*").eq("course_id", id).maybeSingle();
      if (cancelled) return;
      if (error) {
        if (!["PGRST205", "42P01"].includes(error.code ?? "")) toast.error("Cloud draft could not be loaded: " + error.message);
        setCloudSaveStatus("unavailable");
        setCloudDraftReady(true);
        return;
      }
      const row = data as unknown as { source_name: string; source_text: string; source_pages: SourcePage[] | null; draft: DraftCourse | null } | null;
      if (row) {
        setSourceName(row.source_name);
        setSourceText(row.source_text);
        setSourcePages(Array.isArray(row.source_pages) ? row.source_pages : null);
        if (row.draft?.lessons && Array.isArray(row.draft.lessons)) setDraft(row.draft);
      }
      setCloudDraftEnabled(true);
      setCloudSaveStatus("saved");
      setCloudDraftReady(true);
    };
    void loadCloudDraft();
    return () => { cancelled = true; };
  }, [id]);
  useEffect(() => {
    if (!cloudDraftReady || !cloudDraftEnabled || !restoredDesign || course?.published) return;
    setCloudSaveStatus("pending");
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      setCloudSaveStatus("saving");
      const { error } = await sourceDraftTable().upsert({
        course_id: id, source_name: sourceName, source_text: sourceText, source_pages: sourcePages, draft,
      } as never, { onConflict: "course_id" });
      if (cancelled) return;
      if (error) { setCloudSaveStatus("error"); toast.error("Cloud draft autosave failed: " + error.message); }
      else setCloudSaveStatus("saved");
    }, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id, cloudDraftReady, cloudDraftEnabled, restoredDesign, sourceName, sourceText, sourcePages, draft, course?.published]);

  const lessonKey = (index: number, lesson: { title: string; sourceRefs: { sourceId: string; page: number }[] }) =>
    JSON.stringify([index, lesson.title, lesson.sourceRefs]);
  const [designSyncing, setDesignSyncing] = useState(false);
  const { data: savedDesigns, refetch: refetchSavedDesigns } = useQuery({
    queryKey: ["studio-learning-designs", id],
    queryFn: async () => {
      const { data, error } = await designTable().select("*").eq("course_id", id);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ lesson_key: string; lesson_title: string; proposed_methods: string[]; review_status: string; ai_rationale: string | null }>;
    },
  });

  useEffect(() => {
    if (!draft?.lessons.length) return;
    let cancelled = false;
    const restore = async () => {
      const { data, error } = await designTable().select("*").eq("course_id", id);
      if (cancelled) return;
      if (error) { toast.error("Could not load saved learning designs: " + error.message); return; }
      const rows = (data ?? []) as unknown as Array<{ lesson_key: string; proposed_methods: string[]; review_status: string; ai_rationale: string | null }>;
      const choices: Record<number, string[]> = {};
      const approved: Record<number, boolean> = {};
      const rationale: Record<number, string> = {};
      draft.lessons.forEach((lesson, index) => {
        const row = rows.find(item => item.lesson_key === lessonKey(index, lesson));
        if (!row) return;
        choices[index] = row.proposed_methods;
        approved[index] = row.review_status === "approved";
        if (row.ai_rationale) rationale[index] = row.ai_rationale;
      });
      setDesignChoices(choices); setDesignApproved(approved); setDesignRationale(rationale);
    };
    void restore();
    return () => { cancelled = true; };
  }, [id, draft]);
  const persistDesign = async (index: number, methods: string[], approved: boolean, rationale?: string) => {
    const lesson = draft?.lessons[index];
    if (!lesson) throw new Error("Analyse a manual before saving a learning design.");
    const row = {
      course_id: id, lesson_key: lessonKey(index, lesson), lesson_title: lesson.title,
      source_references: lesson.sourceRefs, proposed_methods: methods,
      ai_rationale: rationale ?? designRationale[index] ?? null,
      review_status: approved ? "approved" : "proposed",
    };
    const { error } = await designTable().upsert(row as never, { onConflict: "course_id,lesson_key" });
    if (error) throw error;
    await refetchSavedDesigns();
  };
  const updateSavedMethods = async (lessonKeyValue: string, methods: string[]) => {
    if (designSyncing || course?.published) return;
    setDesignSyncing(true);
    try {
      const { error } = await designTable().update({
        proposed_methods: methods, review_status: "proposed",
      } as never).eq("course_id", id).eq("lesson_key", lessonKeyValue);
      if (error) throw error;
      setDesignApproved(previous => {
        const next = { ...previous };
        draft?.lessons.forEach((lesson, index) => {
          if (lessonKey(index, lesson) === lessonKeyValue) next[index] = false;
        });
        return next;
      });
      setDesignChoices(previous => {
        const next = { ...previous };
        draft?.lessons.forEach((lesson, index) => {
          if (lessonKey(index, lesson) === lessonKeyValue) next[index] = methods;
        });
        return next;
      });
      await refetchSavedDesigns();
      toast.success("Teaching methods saved; approval reset for review.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update teaching methods."); }
    finally { setDesignSyncing(false); }
  };
  const updateSavedApproval = async (lessonKeyValue: string, approved: boolean) => {
    if (designSyncing || course?.published) return;
    setDesignSyncing(true);
    try {
      const { error } = await designTable().update({
        review_status: approved ? "approved" : "proposed",
      } as never).eq("course_id", id).eq("lesson_key", lessonKeyValue);
      if (error) throw error;
      await refetchSavedDesigns();
      toast.success(approved ? "Saved design approved." : "Saved design reopened for review.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update saved design."); }
    finally { setDesignSyncing(false); }
  };
  const saveDesignSelection = async (index: number, methods: string[]) => {
    if (designSyncing) return;
    setDesignSyncing(true);
    try {
      await persistDesign(index, methods, false);
      setDesignChoices(p => ({ ...p, [index]: methods }));
      setDesignApproved(p => ({ ...p, [index]: false }));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save design."); }
    finally { setDesignSyncing(false); }
  };
  const toggleDesignApproval = async (index: number, lesson: { title: string; body: string }) => {
    if (designSyncing) return;
    const next = !designApproved[index];
    const methods = choicesFor(index, lesson.title, lesson.body);
    if (next && !methods.length) return;
    setDesignSyncing(true);
    try {
      await persistDesign(index, methods, next);
      setDesignApproved(p => ({ ...p, [index]: next }));
      toast.success(next ? "Learning design approved and saved." : "Learning design reopened.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update approval."); }
    finally { setDesignSyncing(false); }
  };

  const learningMethods = [
    { id: "illustrated", label: "Illustrated explanation", detail: "Explain key ideas with diagrams and examples" },
    { id: "video", label: "Video demonstration", detail: "Suggest a demonstration; trainer supplies or verifies the video" },
    { id: "steps", label: "Step-by-step practice", detail: "Turn a procedure into an actionable checklist" },
    { id: "scenario", label: "Scenario exercise", detail: "Apply knowledge to a realistic farming decision" },
    { id: "quiz", label: "Knowledge check", detail: "Assess comprehension with source-grounded questions" },
    { id: "visual", label: "Visual identification", detail: "Identify equipment, crops, symptoms or animals" },
  ];
  const recommendMethods = (title: string, body: string) => {
    const content = (title + " " + body).toLowerCase();
    const picks = ["illustrated", "quiz"];
    if (/inspect|procedure|step|install|apply|prepare|harvest|plant|handle|maintain|operate/.test(content)) picks.push("steps", "video");
    if (/identify|recognise|recognize|symptom|diagram|part|species|disease|pest/.test(content)) picks.push("visual");
    if (/risk|decision|problem|safety|manage|respond|prevent/.test(content)) picks.push("scenario");
    if (picks.length < 4) picks.push("scenario");
    return [...new Set(picks)];
  };
  const choicesFor = (index: number, title: string, body: string) => designChoices[index] ?? recommendMethods(title, body);
  const changeDesign = (index: number, choices: string[]) => { setDesignChoices(p => ({ ...p, [index]: choices })); setDesignApproved(p => ({ ...p, [index]: false })); };

  const [showSourceEditor, setShowSourceEditor] = useState(false);
  const [showCourseSettings, setShowCourseSettings] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [form, setForm] = useState({ title: "", description: "", category: STUDIO_CATEGORIES[0] ?? "Farm Management", level: "Beginner", cover_url: "" });
  useEffect(() => { if (course) setForm({ title: course.title, description: course.description, category: course.category, level: course.level, cover_url: course.cover_url ?? "" }); }, [course]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["studio-course", id] }); qc.invalidateQueries({ queryKey: ["studio-lessons", id] }); qc.invalidateQueries({ queryKey: ["studio-mine"] }); qc.invalidateQueries({ queryKey: ["studio-published"] }); };

  const readTextFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(pdf|docx|pptx|txt|md)$/i.test(file.name)) {
      toast.error("Choose a PDF, DOCX, PPTX, TXT or MD file.");
      return;
    }
    setReadingFile(true);
    try {
      const pages = await extractDocument(file);
      const text = pages.map((page) => page.text).join("\n\n");
      if (!text.trim()) throw new Error("This file has no readable text.");
      setSourceName(file.name);
      setSourcePages(pages);
      setSourceText(text);
      setDraft(null);
      toast.success("Manual extracted. Analyse its structure to preview the course outline.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read file.");
    } finally {
      setReadingFile(false);
    }
  };
  const previewSource = () => {
    try {
      const next = buildCourseDraft(form.title || course?.title || "Course", sourcePages ?? [{ sourceId: sourceName.trim() || "Pasted source", page: 1, text: sourceText }]);
      setDraft(next); setDesignChoices({}); setDesignApproved({}); setDesignRationale({});
      if (!next.lessons.length) toast.error("No readable lessons found.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not parse source."); }
  };
  const importDraft = async () => {
    if (!draft?.lessons.length || importing || course?.published) return;
    if (draft.lessons.some((lesson) => lesson.body.length > 19000)) { toast.error("A lesson exceeds the 20,000-character limit. Split the source into smaller modules."); return; }
    setImporting(true);
    try {
      const start = lessons?.length ?? 0;
      const rows = draft.lessons.map((lesson, index) => ({
        course_id: id, kind: "reading", position: start + index, title: lesson.title,
        body: `${lesson.body}\n\nSource: ${lesson.sourceRefs.map((ref) => `${ref.sourceId}, page ${ref.page}`).join("; ")}\nReview required before publishing.`,
      }));
      const { error } = await supabase.from("studio_lessons").insert(rows);
      if (error) throw error;
      toast.success(`Imported ${rows.length} reading lessons for review.`);
      setDraft(null); setSourceText(""); refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Import failed."); }
    finally { setImporting(false); }
  };

  const generateAiDraft = async () => {
    if (!draft?.lessons.length || aiLoading || course?.published) return;
    const lesson = draft.lessons[0];
    if (!lesson) return;
    if (!designApproved[0]) { toast.error("Approve the first lesson learning design before generating."); return; }
    setAiLoading(true); setAiDraft(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) throw new Error("Please sign in.");
      const response = await fetch("/api/course-factory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ courseId: id, title: lesson.title, sourceId: lesson.sourceRefs[0]?.sourceId ?? sourceName, sourceText: lesson.body.slice(0, 12000), approvedMethods: choicesFor(0, lesson.title, lesson.body) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "AI generation failed.");
      setAiDraft(payload);
    } catch (error) { toast.error(error instanceof Error ? error.message : "AI generation failed."); }
    finally { setAiLoading(false); }
  };

  const generateBatch = async () => {
    if (!draft?.lessons.length || batchRunning || aiLoading || course?.published) return;
    const candidates = draft.lessons.map((lesson, index) => ({ lesson, index })).filter(({ lesson }) => lesson.body.length >= 100).slice(0, 5);
    if (!candidates.length) { toast.error("No lessons with enough source text (100 characters)."); return; }
    if (candidates.some(({ index }) => !designApproved[index])) { toast.error("Approve the learning design for each selected lesson before batch generation."); return; }
    if (!confirm(`Generate AI drafts for ${candidates.length} lessons? Each request uses your daily AI allowance and may incur provider charges.`)) return;
    setBatchRunning(true); setBatchDrafts([]);
    const results: { sourceTitle: string; sourceRefs: string; lessonTitle: string; lessonSummary: string; questions: { question: string; options: string[]; correctIndex: number; sourceQuote: string }[] }[] = [];
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) throw new Error("Please sign in.");
      for (const [index, candidate] of candidates.entries()) {
        const { lesson } = candidate;
        setBatchProgress(`Generating ${index + 1} of ${candidates.length}: ${lesson.title}`);
        const response = await fetch("/api/course-factory", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session.access_token}` },
          body: JSON.stringify({ courseId: id, title: lesson.title, sourceId: lesson.sourceRefs[0]?.sourceId ?? sourceName, sourceText: lesson.body.slice(0, 12000), approvedMethods: choicesFor(candidate.index, lesson.title, lesson.body) }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message ?? "AI generation stopped.");
        results.push({ sourceTitle: lesson.title, sourceRefs: lesson.sourceRefs.map((ref) => `${ref.sourceId}, page ${ref.page}`).join("; "), lessonTitle: payload.lessonTitle, lessonSummary: payload.lessonSummary, questions: payload.questions });
        setBatchDrafts([...results]);
      }
      toast.success(`Generated ${results.length} draft lessons. Review before saving.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Batch generation stopped."); }
    finally { setBatchProgress(""); setBatchRunning(false); }
  };

  const saveBatchDrafts = async () => {
    if (!batchDrafts.length || batchRunning || aiLoading || course?.published) return;
    setBatchRunning(true);
    let saved = 0;
    try {
      for (const item of batchDrafts) {
        const position = (lessons?.length ?? 0) + saved * 2;
        const { error: readingError } = await supabase.from("studio_lessons").insert({
          course_id: id, kind: "reading", position, title: item.lessonTitle,
          body: `${item.lessonSummary}\n\nSource: ${item.sourceRefs}\nReview required before publishing.`,
        });
        if (readingError) throw readingError;
        saved++;
        if (item.questions.length) {
          const { data: quiz, error: quizError } = await supabase.from("studio_lessons").insert({
            course_id: id, kind: "quiz", position: position + 1, title: `Knowledge check: ${item.lessonTitle}`,
            body: "pass:80", quiz: item.questions.map((q) => ({ q: q.question, options: q.options })),
          }).select("id").single();
          if (quizError || !quiz) throw quizError ?? new Error("Quiz insert failed.");
          const { error: answerError } = await supabase.from("studio_quiz_answers").upsert({
            lesson_id: quiz.id, course_id: id, answers: item.questions.map((q) => q.correctIndex),
          });
          if (answerError) throw answerError;
        }
      }
      setBatchDrafts([]);
      toast.success(`Saved ${saved} AI lesson drafts. Review each lesson and quiz before publishing.`);
    } catch (error) {
      setBatchDrafts((current) => current.slice(saved));
      toast.error(error instanceof Error ? error.message : "Batch save interrupted. Review saved lessons.");
    } finally { setBatchRunning(false); refresh(); }
  };

  const saveAiDraft = async () => {
    if (!aiDraft || course?.published || aiLoading) return;
    if (!aiDraft.questions.length) { toast.error("No source-verified questions to save."); return; }
    setAiLoading(true);
    try {
      const position = lessons?.length ?? 0;
      const { error: readingError } = await supabase.from("studio_lessons").insert({
        course_id: id, kind: "reading", position,
        title: aiDraft.lessonTitle,
        body: `${aiDraft.lessonSummary}\n\nSource: ${draft?.lessons[0]?.sourceRefs.map((ref) => `${ref.sourceId}, page ${ref.page}`).join("; ") ?? sourceName}\nReview required before publishing.`,
      });
      if (readingError) throw readingError;
      const { data: quiz, error: quizError } = await supabase.from("studio_lessons").insert({
        course_id: id, kind: "quiz", position: position + 1,
        title: `Knowledge check: ${aiDraft.lessonTitle}`, body: "pass:80",
        quiz: aiDraft.questions.map((q) => ({ q: q.question, options: q.options })),
      }).select("id").single();
      if (quizError || !quiz) throw quizError ?? new Error("Quiz insert failed.");
      const { error: answerError } = await supabase.from("studio_quiz_answers").upsert({
        lesson_id: quiz.id, course_id: id, answers: aiDraft.questions.map((q) => q.correctIndex),
      });
      if (answerError) throw answerError;
      setAiDraft(null);
      toast.success("AI reading and quiz saved as drafts. Verify all content before publishing.");
      refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save AI draft."); }
    finally { setAiLoading(false); }
  };

  const saveDetails = async () => {
    if (form.cover_url && !/^https:\/\//.test(form.cover_url)) { toast.error("Cover image link must start with https://"); return; }
    const { error } = await supabase.from("studio_courses").update({ ...form, cover_url: form.cover_url || null }).eq("id", id);
    if (error) toast.error("Could not save — check the title is 3–120 letters."); else { toast.success("Saved"); refresh(); }
  };
  const addLesson = async (kind: string) => {
    const { error } = await supabase.from("studio_lessons").insert({ course_id: id, kind, position: lessons?.length ?? 0, title: kind === "quiz" ? "Knowledge check" : kind === "video" ? "New video lesson" : "New reading" });
    if (error) toast.error("Could not add lesson."); else refresh();
  };
  const readiness = [
    { label: "Course title and description", ready: form.title.trim().length >= 3 && form.description.trim().length >= 30 },
    { label: "Industry and topic selected", ready: !!form.category.trim() && !form.category.endsWith(" / General") && !form.category.endsWith(" / ") },
    { label: "At least one lesson", ready: (lessons?.length ?? 0) > 0 },
    { label: "Imported lessons reviewed", ready: !(lessons ?? []).some((lesson) => lesson.body.includes("Review required before publishing.")) },
  ];
  const readyToPublish = readiness.every((item) => item.ready);

  const setPublished = async (published: boolean) => {
    if (published && !readyToPublish) { toast.error("Complete the publishing checklist and save your course details first."); return; }
    if (published && !reviewConfirmed) { toast.error("Confirm that you have reviewed the course and its quizzes."); return; }
    if (published && !lessons?.length) { toast.error("Add at least one lesson before publishing."); return; }
    if (published && lessons?.some((lesson) => lesson.body.includes("Review required before publishing."))) { toast.error("Imported lessons still need review. Edit each imported lesson and remove the review notice after verifying the content."); return; }
    if (published) {
      const { error: approvalError } = await supabase.rpc("studio_approve_review" as never, { _course_id: id } as never);
      if (approvalError) { toast.error(approvalError.message || "Could not record trainer approval."); return; }
    }
    const { error } = await supabase.from("studio_courses").update({ published }).eq("id", id);
    if (error) { toast.error("Could not change publishing status."); return; }
    setReviewConfirmed(false); refresh();
    toast.success(published ? "Published — it now appears in the catalogue." : "Moved back to draft.");
  };
  const remove = async () => { if (!confirm("Delete this course and all its lessons?")) return; await supabase.from("studio_courses").delete().eq("id", id); refresh(); nav({ to: "/studio" }); };

  if (isLoading) return <Phone><Header title="Loading…" /></Phone>;
  if (!course) return <Phone><Header title="Course not found" /><Sheet><Link to="/studio" className="text-primary">Back to Studio</Link></Sheet></Phone>;
  return (
    <Phone>
      <Header wide greeting={course.published ? "Published" : "Draft"} title={course.title}>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/studio" className="flex items-center gap-1 rounded-full border border-primary-foreground/50 px-3 py-1 text-xs"><ArrowLeft className="h-3 w-3" />All my courses</Link>
          <Link to="/class/$id" params={{ id }} className="flex items-center gap-1 rounded-full border border-primary-foreground/50 px-3 py-1 text-xs"><Eye className="h-3 w-3" />Preview</Link>
          {course.published && <Link to="/learning-activities/$courseId" params={{ courseId: id }} className="flex items-center gap-1 rounded-full border border-primary-foreground/50 px-3 py-1 text-xs">Learner activities</Link>}
        </div>
      </Header>
      <Sheet wide>
        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_260px]">
          <div className="min-w-0 space-y-6 lg:row-span-2 xl:row-span-1">
          <section className="space-y-3 rounded-2xl border border-border p-4">
            <h2 className="font-semibold">Course details</h2>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Title" maxLength={120} />
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What will learners gain from this course?" rows={4} maxLength={4000} />
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
            <Input value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} placeholder="Cover image link (https://…)" />
            <Button onClick={saveDetails} className="w-full">Save details</Button>
            <div className="border-t border-border pt-3 space-y-2">
              <h3 className="text-sm font-semibold">Publishing checklist</h3>
              <p className="text-xs text-muted-foreground">Finish these steps before making your course visible to learners. This is a trainer self-review, not marketplace verification.</p>
              <ul className="space-y-1.5">
                {readiness.map((item) => <li key={item.label} className="flex items-start gap-2 text-xs">
                  <span aria-hidden="true" className={item.ready ? "text-primary" : "text-muted-foreground"}>{item.ready ? "✓" : "○"}</span>
                  <span>{item.label}</span>
                </li>)}
              </ul>
              {!course.published && <label className="mb-3 flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={reviewConfirmed} onChange={(e) => setReviewConfirmed(e.target.checked)} className="mt-0.5" />I have reviewed all lessons, sources and quiz answers for accuracy before publishing.</label>}
              {course.published ? <Button variant="outline" className="w-full" onClick={() => setPublished(false)}>Unpublish</Button>
                : <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={!readyToPublish} onClick={() => setPublished(true)}>Publish to catalogue</Button>}
              <Button variant="ghost" className="mt-2 w-full text-destructive" onClick={remove}><Trash2 className="h-4 w-4" />Delete course</Button>
            </div>
          </section>
          </div>
          <div className="min-w-0 space-y-6">
          <section className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Course outline</h2><p className="text-xs text-muted-foreground">Expand a lesson to review or edit. Use Preview above to see the learner experience.</p></div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => addLesson("video")}><Video className="h-4 w-4" />Video</Button>
                <Button size="sm" variant="outline" onClick={() => addLesson("reading")}><FileText className="h-4 w-4" />Reading</Button>
                <Button size="sm" variant="outline" onClick={() => addLesson("quiz")}><HelpCircle className="h-4 w-4" />Quiz</Button>
              </div></div>
            {lessons?.map((l, i) => <LessonEditor key={l.id} lesson={l} index={i} onChange={refresh} />)}
            {lessons?.length === 0 && <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Add your first video, reading or quiz.</p>}
          </section>
          <section className="space-y-3 rounded-2xl border border-border p-4">
            <h2 className="font-semibold">Course Factory — source import</h2>
            <p className="text-xs text-muted-foreground">Paste extracted text from a training manual. Module and chapter headings become draft reading lessons. Upload PDF, Word, PowerPoint or plain text. Scanned PDFs require OCR, which is not yet available. AI media generation is not yet available. Review every lesson before publishing.</p>
            <label className="block text-xs font-medium">Upload a manual (PDF, DOCX, PPTX, TXT or MD)
              <input type="file" accept=".pdf,.docx,.pptx,.txt,.md" disabled={readingFile} onChange={(e) => { void readTextFile(e.target.files?.[0]); e.target.value = ""; }} className="mt-1 block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-primary" />
            </label>
            <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="Source document name" aria-label="Source document name" maxLength={160} />
            <Textarea value={sourceText} onChange={(e) => { setSourceText(e.target.value); setSourcePages(null); setDraft(null); }} placeholder={"Module 1: Introduction\\nYour training content..."} rows={6} maxLength={1000000} aria-label="Extracted manual text" />
            <Button type="button" variant="outline" onClick={previewSource} disabled={!sourceText.trim()}>Analyse manual & build course outline</Button>
              <p role="status" aria-live="polite" className="text-xs text-muted-foreground">Cloud source draft: {cloudSaveStatus === "saved" ? "Saved to Supabase" : cloudSaveStatus === "saving" ? "Saving…" : cloudSaveStatus === "pending" ? "Unsaved changes — saving shortly" : cloudSaveStatus === "loading" ? "Loading…" : cloudSaveStatus === "error" ? "Save failed — check connection" : "Cloud storage unavailable"}</p>
              {!!savedDesigns?.length && <div className="space-y-2 rounded-xl border border-border p-4">
                <h3 className="font-semibold">Saved learning designs in Supabase</h3>
                <p className="text-xs text-muted-foreground">These records are available across devices. To edit or generate their lesson content, upload the source manual on this device.</p>
                <p className="text-xs font-medium">{savedDesigns.filter(item => item.review_status === "approved").length} of {savedDesigns.length} designs approved</p>
                {savedDesigns.map((item, index) => <details key={item.lesson_key} className="rounded-lg border border-border bg-background p-3 text-xs">
                  <summary className="cursor-pointer font-medium">{index + 1}. {item.lesson_title} · {item.review_status === "approved" ? "✓ Approved" : "Needs review"}</summary>
                  <div className="mt-2 space-y-2">
                    <p className="font-medium">Teaching and assessment methods</p>
                    {learningMethods.map(method => <label key={method.id} className="flex cursor-pointer items-start gap-2">
                      <input type="checkbox" className="mt-0.5" disabled={designSyncing || course?.published}
                        checked={item.proposed_methods.includes(method.id)}
                        onChange={event => void updateSavedMethods(item.lesson_key, event.target.checked
                          ? [...item.proposed_methods, method.id]
                          : item.proposed_methods.filter(value => value !== method.id))} />
                      <span>{method.label}</span>
                    </label>)}
                  </div>
                  {item.ai_rationale && <p className="mt-2 whitespace-pre-wrap text-muted-foreground"><strong>AI explanation:</strong> {item.ai_rationale}</p>}
                  <p className="mt-2 text-muted-foreground">Teaching methods can be changed here. To generate lesson content, analyse the original source manual on this device.</p>
                  {!course?.published && <Button size="sm" variant="outline" disabled={designSyncing || (item.review_status !== "approved" && !item.proposed_methods.length)} onClick={() => void updateSavedApproval(item.lesson_key, item.review_status !== "approved")}>{item.review_status === "approved" ? "Reopen approval" : "Approve saved design"}</Button>}
                </details>)}
              </div>}
            {draft && <div className="space-y-2 rounded-xl bg-muted/40 p-3">
              <p className="text-sm font-semibold">Proposed course outline · {draft.lessons.length} topics</p><p className="text-xs text-muted-foreground">Review the topics before generating detailed AI lessons. Source references remain attached.</p>
              {draft.warnings.map((warning, i) => <p key={i} className="text-xs text-destructive">{warning}</p>)}
              <div className="space-y-3 rounded-xl border border-border bg-background p-4">
                <h3 className="font-semibold">AI learning design review</h3>
                <p className="text-xs text-muted-foreground">Suggested teaching and assessment methods are based on topic keywords. These are preliminary recommendations, not AI-generated media or saved course objects. Approve or adjust each lesson before content generation.</p>
                {draft.lessons.map((lesson, i) => <details key={i} className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-sm font-medium">{i + 1}. {lesson.title} {designApproved[i] ? "✓ Approved" : "· Needs review"}</summary>
                  <div className="mt-3 space-y-2">
                    <Button type="button" size="sm" variant="outline" disabled={designLoading !== null || lesson.body.length < 100 || !!course.published} onClick={() => void proposeDesign(i, lesson)}>{designLoading === i ? "Designing…" : "Ask AI to propose methods"}</Button>
                    {designRationale[i] && <p className="rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground"><strong>AI rationale:</strong> {designRationale[i]}</p>}
                    {learningMethods.map(method => <label key={method.id} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1" checked={choicesFor(i, lesson.title, lesson.body).includes(method.id)} disabled={designSyncing} onChange={e => void saveDesignSelection(i, e.target.checked ? [...choicesFor(i, lesson.title, lesson.body), method.id] : choicesFor(i, lesson.title, lesson.body).filter(x => x !== method.id))} />
                      <span><span className="font-medium">{method.label}</span><span className="block text-xs text-muted-foreground">{method.detail}</span></span>
                    </label>)}
                    <Button type="button" size="sm" variant={designApproved[i] ? "secondary" : "outline"} disabled={designSyncing || !choicesFor(i, lesson.title, lesson.body).length} onClick={() => void toggleDesignApproval(i, lesson)}>{designApproved[i] ? "Reopen review" : "Approve lesson design"}</Button>
                  </div>
                </details>)}
                <p className="text-xs text-muted-foreground">{draft.lessons.filter((_, i) => designApproved[i]).length} of {draft.lessons.length} designs approved. Design approvals and selected methods are saved to Supabase for cross-device access. The imported manual text and draft outline remain cached in this browser. Approved methods are passed to the generation API. AI proposals use your daily AI allowance.</p>
              </div>
              <div className="space-y-3 rounded-xl border border-border bg-background p-4">
                <h3 className="font-semibold">Course structure · modules and lessons</h3>
                <p className="text-xs text-muted-foreground">Provisional grouping based on detected module headings. Check every lesson against its source pages; activities and assessments are generated only after trainer approval.</p>
                {groupDraftLessons(draft.lessons).map((group, groupIndex) => <details key={groupIndex} open={groupIndex === 0} className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer font-medium">{group.title} <span className="text-xs font-normal text-muted-foreground">· {group.items.length} source sections</span></summary>
                  <ol className="mt-3 space-y-2 pl-5 text-sm list-decimal">
                    {group.items.map(({ lesson, index }) => <li key={index}>
                      <span className="font-medium">{lesson.title}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{designApproved[index] ? "Design approved" : "Needs trainer review"}</span>
                      <p className="text-xs text-muted-foreground">{lesson.sourceRefs.map(ref => `p.${ref.page}`).join(", ")}</p>
                    </li>)}
                  </ol>
                </details>)}
              </div>
              <div className="space-y-3 rounded-xl border border-border bg-background p-4">
                <h3 className="font-semibold">Learning activity storyboard</h3>
                <p className="text-xs text-muted-foreground">Preview the mix of presentation and assessment methods. These are activity plans, not generated videos, images or quizzes.</p>
                {draft.lessons.map((lesson, index) => <details key={index} className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-sm font-medium">{index + 1}. {lesson.title} · {designApproved[index] ? "Approved design" : "Pending design approval"}</summary>
                  <div className="mt-3 space-y-2">
                    <div className="rounded-lg bg-muted/40 p-3 text-sm"><strong>1. Lesson introduction</strong><p className="text-xs text-muted-foreground">Introduce the learning objective and connect it to the original manual.</p></div>
                    {choicesFor(index, lesson.title, lesson.body).map((method, methodIndex) => <div key={method} className="rounded-lg bg-muted/40 p-3 text-sm">
                      <strong>{methodIndex + 2}. {activityLabels[method]?.title ?? method}</strong>
                      <p className="text-xs text-muted-foreground">{activityLabels[method]?.description ?? "Trainer review required."}</p>
                      <SourceActivity method={method} lesson={lesson} courseId={id} published={!!course.published} />
                    </div>)}
                    <p className="text-xs text-muted-foreground">Source: {lesson.sourceRefs.map(ref => `${ref.sourceId} p.${ref.page}`).join(", ")}</p>
                  </div>
                </details>)}
              </div>
              <div className="space-y-2">{draft.lessons.map((lesson, i) => <details key={i} className="rounded-lg border border-border bg-background p-3"><summary className="cursor-pointer text-sm font-medium">{i + 1}. {lesson.title} <span className="text-xs font-normal text-muted-foreground">· {lesson.sourceRefs.length} source pages</span></summary><p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{lesson.body.slice(0, 2500)}{lesson.body.length > 2500 ? "…" : ""}</p><p className="mt-2 text-xs text-muted-foreground">Source: {lesson.sourceRefs.map(ref => `${ref.sourceId} p.${ref.page}`).join(", ")}</p></details>)}</div>
              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" disabled={batchRunning || aiLoading || !!course.published} onClick={generateBatch}>{batchRunning ? "Working…" : "Generate batch (up to 5 lessons)"}</Button>
                  {batchProgress && <p className="text-xs text-muted-foreground">{batchProgress}</p>}
                  {batchDrafts.length > 0 && <Button type="button" size="sm" disabled={batchRunning || aiLoading} onClick={saveBatchDrafts}>Save {batchDrafts.length} batch drafts</Button>}
                </div>
                {batchDrafts.map((item, i) => <div key={i} className="rounded-lg border border-border p-2 text-xs"><p className="font-medium">{item.lessonTitle} — {item.questions.length} quiz questions</p><p className="text-muted-foreground">{item.sourceRefs}</p><p className="mt-1 whitespace-pre-wrap">{item.lessonSummary}</p>{item.questions.map((q, j) => <p key={j} className="mt-1">Q: {q.question} — source: {q.sourceQuote}</p>)}</div>)}
                <Button type="button" variant="outline" disabled={aiLoading || !draft.lessons.length || !!course.published || (draft.lessons[0]?.body.length ?? 0) < 100} onClick={generateAiDraft}>{aiLoading ? "Generating…" : "Generate AI lesson and quiz preview (first lesson)"}</Button>
                {aiDraft && <div className="space-y-2 rounded-lg border border-border p-3 text-xs">
                  <p className="font-semibold">AI draft — verify against your manual before using</p>
                  <p className="font-medium">{aiDraft.lessonTitle}</p>
                  <FormattedLesson content={aiDraft.lessonSummary} />
                  {aiDraft.questions.map((q, i) => <div key={i} className="space-y-1 border-t border-border pt-2">
                    <p className="font-medium">{i + 1}. {q.question}</p>
                    {q.options.map((option, j) => <p key={j}>{j === q.correctIndex ? "✓ " : "○ "}{option}</p>)}
                    <p className="italic text-muted-foreground">Source quote: {q.sourceQuote}</p>
                  </div>)}
                  {!!aiDraft.droppedUnsupportedQuestions && <p>{aiDraft.droppedUnsupportedQuestions} question(s) removed because their source quotes were not found.</p>}
                  <p className="text-muted-foreground">Review all answers and citations. Saving does not publish the course.</p>
                  <Button type="button" size="sm" disabled={aiLoading || !aiDraft.questions.length || !!course.published} onClick={saveAiDraft}>Save AI lesson and quiz as drafts</Button>
                </div>}

                <h3 className="text-sm font-medium">Suggested knowledge checks</h3>
                <p className="text-xs text-muted-foreground">These are source-based question prompts, not AI-generated multiple-choice quizzes. Review the suggested answer and create verified options using the Quiz editor below.</p>
                {suggestReviewQuestions(draft, 8).map((item, i) => <div key={i} className="rounded-lg border border-border p-2 text-xs">
                  <p className="font-medium">{item.question}</p>
                  <p className="mt-1 text-muted-foreground">Source answer: {item.suggestedAnswer}</p>
                  <p className="mt-1 text-muted-foreground">{item.sourceId}, page {item.page}</p>
                </div>)}
              </div>
              <Button type="button" onClick={importDraft} disabled={!draft.lessons.length || importing || !!course.published}>{importing ? "Importing…" : "Add draft lessons to course"}</Button>
              {course.published && <p className="text-xs text-destructive">Unpublish the course before importing draft material.</p>}
            </div>}
          </section>
          </div>
          <div className="min-w-0 space-y-6 lg:col-start-2 xl:col-start-3 xl:sticky xl:top-6">
          <aside className="hidden space-y-3 lg:block rounded-2xl border border-border p-4"><h2 className="font-semibold">Course navigation</h2><p className="text-xs text-muted-foreground">{lessons?.length ?? 0} learning objects</p><nav aria-label="Course lessons" className="space-y-2">{lessons?.map((lesson, index) => <a key={lesson.id} href={`#lesson-${lesson.id}`} className="block rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted"><span className="font-semibold">{index + 1}. {lesson.title}</span><span className="mt-1 block capitalize text-muted-foreground">{lesson.kind}</span></a>)}</nav></aside>
          <aside className="space-y-3 rounded-2xl border border-border p-4"><h2 className="font-semibold">Trainer review</h2><p className="text-sm text-muted-foreground">Check the source evidence, lesson content and assessments before publishing.</p><div className="rounded-lg bg-muted/40 p-3 text-xs"><p className="font-medium">AI learning design</p><p className="mt-1 text-muted-foreground">Proposed teaching and assessment methods with trainer approval are planned, not yet active.</p></div><Link to="/class/$id" params={{ id }} className="inline-flex items-center gap-2 text-sm font-medium text-primary"><Eye className="h-4 w-4" />Preview as learner</Link></aside>
          </div>
        </div>
      </Sheet>
    </Phone>
  );
}

function LessonEditor({ lesson, index, onChange }: { lesson: LessonRow; index: number; onChange: () => void }) {
  const [title, setTitle] = useState(lesson.title);
  const [video, setVideo] = useState(lesson.video_url ?? "");
  const [body, setBody] = useState(lesson.body);
  const [qs, setQs] = useState<Q[]>(() => ((lesson.quiz as { q: string; options: string[] }[]) ?? []).map((x) => ({ ...x, answer: 0 })));
  const [passMark, setPassMark] = useState(() => parsePassMark(lesson.body));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || lesson.kind !== "quiz") return;
    supabase.from("studio_quiz_answers").select("answers").eq("lesson_id", lesson.id).maybeSingle().then(({ data }) => {
      if (data) setQs((cur) => cur.map((q, i) => ({ ...q, answer: data.answers[i] ?? 0 })));
    });
  }, [open, lesson.id, lesson.kind]);
  const Icon = lesson.kind === "video" ? Video : lesson.kind === "quiz" ? HelpCircle : FileText;
  const save = async () => {
    if (video && !/^https:\/\//.test(video)) { toast.error("Video link must start with https://"); return; }
    const clean = qs.filter((q) => q.q.trim() && q.options.filter((o) => o.trim()).length >= 2);
    const { error } = await supabase.from("studio_lessons").update({ title, video_url: video || null, body: lesson.kind === "quiz" ? `pass:${passMark}` : body, quiz: clean.map(({ q, options }) => ({ q, options })) }).eq("id", lesson.id);
    if (error) { toast.error("Could not save lesson."); return; }
    if (lesson.kind === "quiz") {
      const { error: e2 } = await supabase.from("studio_quiz_answers").upsert({ lesson_id: lesson.id, course_id: (await supabase.from("studio_lessons").select("course_id").eq("id", lesson.id).single()).data!.course_id, answers: clean.map((q) => q.answer) });
      if (e2) { toast.error("Could not save answers."); return; }
    }
    toast.success("Lesson saved"); onChange();
  };
  const del = async () => { await supabase.from("studio_lessons").delete().eq("id", lesson.id); onChange(); };
  return (
    <div className="rounded-2xl border border-border">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 p-3 text-left">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{index + 1}. {lesson.title}</span>
        <span className="text-xs text-muted-foreground">{open ? "Close" : "Edit"}</span>
      </button>
      {open && <div className="space-y-2 border-t border-border p-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Lesson title" maxLength={120} />
        {lesson.kind === "video" && <Input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="Video link (https://… .mp4 or YouTube)" />}
        {lesson.kind !== "quiz" && <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Lesson notes, steps or checklist" maxLength={20000} />}
        {lesson.kind === "quiz" && <div className="space-y-3">
          {qs.map((q, qi) => (
            <div key={qi} className="space-y-1.5 rounded-xl bg-muted/50 p-2">
              <div className="flex gap-2"><Input value={q.q} placeholder={`Question ${qi + 1}`} onChange={(e) => setQs(qs.map((x, i) => i === qi ? { ...x, q: e.target.value } : x))} />
                <Button size="icon" variant="ghost" aria-label="Remove question" onClick={() => setQs(qs.filter((_, i) => i !== qi))}><Trash2 className="h-4 w-4" /></Button></div>
              {q.options.map((o, oi) => (
                <label key={oi} className="flex items-center gap-2 text-sm">
                  <input type="radio" name={`a-${lesson.id}-${qi}`} checked={q.answer === oi} onChange={() => setQs(qs.map((x, i) => i === qi ? { ...x, answer: oi } : x))} aria-label="Correct answer" />
                  <Input value={o} placeholder={`Option ${oi + 1}`} onChange={(e) => setQs(qs.map((x, i) => i === qi ? { ...x, options: x.options.map((y, j) => j === oi ? e.target.value : y) } : x))} />
                </label>))}
            </div>))}
          <Button size="sm" variant="outline" onClick={() => setQs([...qs, { q: "", options: ["", "", "", ""], answer: 0 }])}><Plus className="h-4 w-4" />Add question</Button>
          <label className="flex items-center gap-2 text-sm">Pass mark<select value={passMark} onChange={(e) => setPassMark(Number(e.target.value))} className="rounded-md border border-input bg-background px-2 py-1 text-sm" aria-label="Pass mark">{PASS_MARKS.map((m) => <option key={m} value={m}>{m}%</option>)}</select></label>
          <p className="text-xs text-muted-foreground">Tick the correct option. Learners need {passMark}% to pass.</p>
        </div>}
        <div className="flex gap-2"><Button size="sm" onClick={save}>Save lesson</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={del}>Delete</Button></div>
      </div>}
    </div>
  );
}
