import { useConfirm } from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/friendly-error";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Video,
  FileText,
  HelpCircle,
  Eye,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Check,
  ArrowUp,
  ArrowDown,
  Package,
} from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { STUDIO_CATEGORIES, PASS_MARKS, parsePassMark } from "@/lib/studio";
import { INDUSTRIES, courseIndustry } from "@/lib/industries";
import { toast } from "sonner";
import {
  buildCourseDraft,
  splitDraftLessonAt,
  mergeDraftLessons,
  type DraftCourse,
  type SourcePage,
} from "@/lib/course-factory";
import { extractDocument } from "@/lib/document-extraction";
import { suggestReviewQuestions } from "@/lib/course-quiz-suggestions";
import { CourseAnalytics } from "@/components/CourseAnalytics";
import { LessonAssistant } from "@/components/LessonAssistant";
import { PolishButton } from "@/components/PolishButton";
import { VideoLibraryPicker } from "@/components/VideoLibraryPicker";
import { CoverImageInput } from "@/components/CoverImageInput";
import { StudioContentLibrary } from "@/components/StudioContentLibrary";
import {
  COURSE_THEMES,
  COURSE_THEME_NAMES,
  isCourseTheme,
  type CourseThemeName,
} from "@/lib/course-theme";
import { FormattedLesson } from "@/components/FormattedLesson";
import { SlideEditor } from "@/components/SlideEditor";
import { QuizQuestionEditor } from "@/components/QuizQuestionEditor";
import { QuestionBank } from "@/components/QuestionBank";
import { appendBankQuestion } from "@/lib/question-bank";
import { quizSampleSize, privateQuizBankId } from "@/lib/quiz-pools";
import {
  buildQuiz,
  loadQuizDraft,
  newQuizQuestion,
  parseQuizQuestions,
  type QuizDraftQuestion,
} from "@/lib/studio-quiz";
import { formatManualAsSlides, parseLessonSlides, splitLessonSource } from "@/lib/lesson-slides";
import { ManualLessonReview } from "@/components/ManualLessonReview";
import { StudioVersions } from "@/components/StudioVersions";
import { StudioCourseActions } from "@/components/StudioCourseActions";
import { useAuth } from "@/hooks/useLearning";
import { ScormPicker } from "@/components/ScormPicker";
import { scormLessonRef } from "@/lib/scorm";
import { DescriptionAssistant } from "@/components/DescriptionAssistant";

type VideoLink = {
  id: string;
  lesson_id: string;
  item_id: string;
  objectives: string;
  item: { title: string; provider: { name: string } | null } | null;
};

function groupDraftLessons(lessons: DraftCourse["lessons"]) {
  const groups: {
    title: string;
    items: { lesson: DraftCourse["lessons"][number]; index: number }[];
  }[] = [];
  let active: (typeof groups)[number] | undefined;
  for (const [index, lesson] of lessons.entries()) {
    const match = lesson.title.match(/^MODULE\s+(\d+)\b(?:\s*[-–:]\s*(.*))?/i);
    if (match) {
      const number = match[1];
      const label = match[2]?.trim();
      active = groups.find((group) => group.title.startsWith(`Module ${number} ·`));
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
  illustrated: {
    title: "Illustrated explanation",
    description: "Trainer selects or verifies diagrams and captions before publishing.",
  },
  video: {
    title: "Video demonstration",
    description: "Attach a relevant, verified video; no video is generated automatically.",
  },
  steps: {
    title: "Step-by-step practice",
    description: "Turn source-supported procedures into a guided activity.",
  },
  scenario: {
    title: "Applied scenario",
    description: "Create a source-grounded situation and ask learners to decide what to do.",
  },
  quiz: {
    title: "Knowledge check",
    description: "Generate and verify questions, answers and supporting source references.",
  },
  visual: {
    title: "Visual summary",
    description: "Review an infographic or labelled visual derived from the source.",
  },
};

function SourceActivity({
  method,
  lesson,
  courseId,
  published,
}: {
  method: string;
  lesson: DraftCourse["lessons"][number];
  courseId: string;
  published: boolean;
}) {
  const evidence = lesson.body
    .split(/(?<=[.!?])\s+|\n+/)
    .map((value) => value.trim())
    .find((value) => value.length >= 65 && value.length <= 450 && /[.!?]$/.test(value));
  const suggested =
    method === "steps"
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
        if (typeof parsed.prompt === "string") {
          setActivity(parsed.prompt);
          setSaved(true);
        }
      }
    } catch {
      /* Storage may be disabled; editing remains available. */
    }
  }, [key]);
  useEffect(() => {
    let active = true;
    void supabase
      .from("studio_learning_activities")
      .select("prompt,approved")
      .eq("course_id", courseId)
      .eq("activity_key", key)
      .maybeSingle()
      .then(({ data, error }) => {
        if (active && !error && data && typeof data.prompt === "string") {
          setActivity(data.prompt);
          setSaved(true);
          setApproved(!!data.approved);
        }
      });
    return () => {
      active = false;
    };
  }, [courseId, key]);
  if (method !== "steps" && method !== "scenario") return null;
  if (!evidence)
    return (
      <p className="mt-2 text-xs text-amber-700">
        Insufficient explanatory source text to draft this activity. Trainer must supply verified
        content.
      </p>
    );
  return (
    <div className="mt-3 space-y-2 rounded-md border border-border bg-background p-3">
      <p className="text-xs font-semibold">Editable activity draft · trainer review required</p>
      <Textarea
        aria-label="Activity instructions"
        value={activity}
        onChange={(event) => {
          setActivity(event.target.value);
          setSaved(false);
          setApproved(false);
          setVerified(false);
        }}
        rows={4}
      />
      <blockquote className="border-l-2 border-primary pl-3 text-xs text-muted-foreground">
        {evidence}
      </blockquote>
      <p className="text-xs text-muted-foreground">
        Evidence: {lesson.sourceRefs.map((ref) => `${ref.sourceId}, p.${ref.page}`).join("; ")}. No
        model answer is asserted without trainer verification.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!activity.trim() || syncing || published}
          onClick={async () => {
            setSyncing(true);
            try {
              const { error } = await supabase.from("studio_learning_activities").upsert(
                {
                  course_id: courseId,
                  activity_key: key,
                  lesson_title: lesson.title,
                  kind: method,
                  prompt: activity,
                  evidence,
                  source_refs: lesson.sourceRefs,
                  approved: false,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "course_id,activity_key" },
              );
              if (error) throw error;
              window.localStorage.setItem(
                key,
                JSON.stringify({
                  kind: method,
                  prompt: activity,
                  evidence,
                  sourceRefs: lesson.sourceRefs,
                  reviewRequired: true,
                }),
              );
              setSaved(true);
              setApproved(false);
              setVerified(false);
              toast.success("Activity saved.");
            } catch {
              toast.error("We couldn’t save the activity. Please try again.");
            } finally {
              setSyncing(false);
            }
          }}
        >
          Save draft
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            void navigator.clipboard
              .writeText(
                `${activity}\\n\\nSource evidence: ${evidence}\\nSource pages: ${lesson.sourceRefs.map((ref) => `${ref.sourceId} p.${ref.page}`).join("; ")}`,
              )
              .then(
                () => toast.success("Activity copied."),
                () => toast.error("Could not copy activity."),
              )
          }
        >
          Copy
        </Button>
        {saved && (
          <span className="text-xs text-muted-foreground">
            {approved ? "Trainer approved · not published" : "Saved to cloud · pending approval"}
          </span>
        )}
        {saved && !approved && (
          <label className="flex w-full items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={verified}
              onChange={(event) => setVerified(event.target.checked)}
              disabled={published || syncing}
            />
            I have verified this activity against its source and approved its wording.
          </label>
        )}
        {saved && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={syncing || published || (!approved && !verified)}
            onClick={async () => {
              setSyncing(true);
              const { data, error } = await supabase
                .from("studio_learning_activities")
                .update({ approved: !approved })
                .eq("course_id", courseId)
                .eq("activity_key", key)
                .select("approved")
                .single();
              setSyncing(false);
              if (error || !data) {
                toast.error("Could not update activity approval.");
                return;
              }
              setApproved(data.approved);
              setVerified(false);
              toast.success(
                data.approved
                  ? "Activity approved for future publication."
                  : "Activity returned to review.",
              );
            }}
          >
            {approved ? "Reopen review" : "Approve activity"}
          </Button>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/studio/$id")({
  head: () => ({
    meta: [
      { title: "Edit course — Plusticity Studio" },
      { name: "description", content: "Add lessons, videos and quizzes to your course." },
      { property: "og:title", content: "Edit course — Plusticity Studio" },
      { property: "og:description", content: "Build your farming course." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditorRoute,
});

function EditorRoute() {
  const { id } = Route.useParams();
  return <Editor key={id} />;
}

type Q = { q: string; options: string[]; answer: number };
type LessonRow = {
  id: string;
  position: number;
  kind: string;
  title: string;
  video_url: string | null;
  body: string;
  quiz: unknown;
  module_id: string | null;
};
type ModuleRow = { id: string; course_id: string; title: string; position: number };

const MODULE_TITLE_RE = /^MODULE\s+(\d+)\b(?:\s*[-–:]\s*(.*))?/i;

/** Groups persisted lessons by their real studio_modules record. Lessons with no module_id (legacy imports, or not yet organised) fall back to their "MODULE N" title prefix if present, else a single "Unassigned lessons" bucket. */
function groupLessonsIntoModules(lessons: LessonRow[], realModules: ModuleRow[]) {
  const modules: { key: string; title: string; lessons: LessonRow[]; moduleId: string | null }[] =
    realModules.map((m) => ({ key: m.id, title: m.title, lessons: [], moduleId: m.id }));
  const legacy: { key: string; title: string; lessons: LessonRow[]; moduleId: string | null }[] =
    [];
  const plain: LessonRow[] = [];
  for (const lesson of lessons) {
    if (lesson.module_id) {
      const mod = modules.find((m) => m.moduleId === lesson.module_id);
      if (mod) {
        mod.lessons.push(lesson);
        continue;
      }
    }
    const match = lesson.title.match(MODULE_TITLE_RE);
    if (!match) {
      plain.push(lesson);
      continue;
    }
    const number = match[1];
    const label = match[2]?.trim();
    const key = `legacy-module-${number}`;
    let mod = legacy.find((m) => m.key === key);
    if (!mod) {
      mod = {
        key,
        title: `Module ${number}${label ? " · " + label : ""}`,
        lessons: [],
        moduleId: null,
      };
      legacy.push(mod);
    }
    mod.lessons.push(lesson);
  }
  legacy.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  const all = [...modules, ...legacy];
  if (plain.length)
    all.push({ key: "unassigned", title: "Unassigned lessons", lessons: plain, moduleId: null });
  return all;
}

function lessonIsComplete(lesson: LessonRow) {
  if (lesson.kind === "quiz")
    return Array.isArray(lesson.quiz) && (lesson.quiz as unknown[]).length > 0;
  if (lesson.kind === "video") return !!lesson.video_url;
  if (lesson.kind === "scorm") return !!scormLessonRef(lesson.body);
  if (lesson.kind === "slide")
    return parseLessonSlides(lesson.body).some((slide) => slide.blocks.length > 0);
  return (
    lesson.body.trim().length > 0 && !lesson.body.includes("Review required before publishing.")
  );
}

type Screen = string;

function Editor() {
  const { id } = Route.useParams();
  const [screen, setScreen] = useState<Screen>("overview");
  const [designTab, setDesignTab] = useState<"auto" | "manual">("auto");
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [reviewingLessons, setReviewingLessons] = useState(false);
  const { user, ready: authReady } = useAuth();
  const [factoryStep, setFactoryStep] = useState(0);
  const [showExtractedText, setShowExtractedText] = useState(false);
  const [firstContentPage, setFirstContentPage] = useState(1);
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([]);
  const qc = useQueryClient();
  const nav = useNavigate();
  const confirm = useConfirm();
  const { data: course, isLoading } = useQuery({
    queryKey: ["studio-course", id],
    queryFn: async () =>
      (await supabase.from("studio_courses").select("*").eq("id", id).maybeSingle()).data,
  });
  const { data: lessons } = useQuery({
    queryKey: ["studio-lessons", id],
    queryFn: async () =>
      ((await supabase.from("studio_lessons").select("*").eq("course_id", id).order("position"))
        .data ?? []) as unknown as LessonRow[],
  });
  const { data: studioModules } = useQuery({
    queryKey: ["studio-modules", id],
    queryFn: async () =>
      ((
        await supabase
          .from("studio_modules" as never)
          .select("*")
          .eq("course_id", id)
          .order("position")
      ).data ?? []) as unknown as ModuleRow[],
  });
  useEffect(() => {
    if (lessons && studioModules && lessons.length === 0 && studioModules.length === 0) {
      setScreen((current) => (current === "overview" ? "import" : current));
    }
  }, [lessons, studioModules]);
  const [sourceText, setSourceText] = useState("");
  const [sourcePages, setSourcePages] = useState<SourcePage[] | null>(null);
  const [sourceName, setSourceName] = useState("Training manual");
  const [draft, setDraft] = useState<DraftCourse | null>(null);
  const [importing, setImporting] = useState(false);
  const [manualFormat, setManualFormat] = useState<"reading" | "slide">("reading");
  const [readingFile, setReadingFile] = useState(false);
  const [localOcr, setLocalOcr] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState("");
  const [recognizedPages, setRecognizedPages] = useState<{ page: number; confidence: number }[]>([]);
  const [lowTextPages, setLowTextPages] = useState<number[]>([]);
  const extractionController = useRef<AbortController | null>(null);
  useEffect(() => () => extractionController.current?.abort(), []);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDraft, setAiDraft] = useState<{
    lessonTitle: string;
    lessonSummary: string;
    questions: { question: string; options: string[]; correctIndex: number; sourceQuote: string }[];
    droppedUnsupportedQuestions: number;
  } | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");
  const [batchDrafts, setBatchDrafts] = useState<
    {
      sourceTitle: string;
      sourceRefs: string;
      lessonTitle: string;
      lessonSummary: string;
      questions: {
        question: string;
        options: string[];
        correctIndex: number;
        sourceQuote: string;
      }[];
    }[]
  >([]);
  const [designChoices, setDesignChoices] = useState<Record<number, string[]>>({});
  const [designApproved, setDesignApproved] = useState<Record<number, boolean>>({});
  const [designRationale, setDesignRationale] = useState<Record<number, string>>({});
  const [designLoading, setDesignLoading] = useState<number | null>(null);
  const [restoredDesign, setRestoredDesign] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("farmschool:learning-design:" + id);
      if (saved) {
        const state = JSON.parse(saved) as {
          draft?: DraftCourse;
          sourceText?: string;
          sourceName?: string;
          sourcePages?: SourcePage[];
          choices?: Record<number, string[]>;
          approved?: Record<number, boolean>;
          rationale?: Record<number, string>;
        };
        if (state.draft?.lessons && Array.isArray(state.draft.lessons)) setDraft(state.draft);
        if (typeof state.sourceText === "string") setSourceText(state.sourceText);
        if (typeof state.sourceName === "string") setSourceName(state.sourceName);
        if (Array.isArray(state.sourcePages)) setSourcePages(state.sourcePages);
        if (state.choices) setDesignChoices(state.choices);
        if (state.approved) setDesignApproved(state.approved);
        if (state.rationale) setDesignRationale(state.rationale);
      }
    } catch {
      toast.error("Saved learning design could not be restored.");
    } finally {
      setRestoredDesign(true);
    }
  }, [id]);
  useEffect(() => {
    if (!restoredDesign) return;
    try {
      window.localStorage.setItem(
        "farmschool:learning-design:" + id,
        JSON.stringify({
          draft,
          sourceText,
          sourceName,
          sourcePages,
          choices: designChoices,
          approved: designApproved,
          rationale: designRationale,
        }),
      );
    } catch {
      toast.error("Learning design could not be saved in this browser.");
    }
  }, [
    id,
    restoredDesign,
    draft,
    sourceText,
    sourceName,
    sourcePages,
    designChoices,
    designApproved,
    designRationale,
  ]);

  const proposeDesign = async (
    index: number,
    lesson: { title: string; body: string; sourceRefs: { sourceId: string }[] },
  ) => {
    if (designLoading !== null || lesson.body.length < 100) return;
    setDesignLoading(index);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) throw new Error("Please sign in.");
      const response = await fetch("/api/course-factory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.session.access_token,
        },
        body: JSON.stringify({
          courseId: id,
          title: lesson.title,
          sourceId: lesson.sourceRefs[0]?.sourceId ?? sourceName,
          sourceText: lesson.body.slice(0, 12000),
          mode: "design",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Could not propose learning methods.");
      await persistDesign(index, payload.methods, false, payload.rationale);
      setDesignChoices((p) => ({ ...p, [index]: payload.methods }));
      setDesignApproved((p) => ({ ...p, [index]: false }));
      setDesignRationale((p) => ({ ...p, [index]: payload.rationale }));
      toast.success("AI proposal ready for review.");
    } catch (error) {
      toast.error(friendlyError(error, "AI proposal failed."));
    } finally {
      setDesignLoading(null);
    }
  };

  const designTable = () => supabase.from("studio_learning_designs" as never);
  const sourceDraftTable = () => supabase.from("studio_course_source_drafts" as never);
  const [cloudDraftReady, setCloudDraftReady] = useState(false);
  const [cloudDraftEnabled, setCloudDraftEnabled] = useState(false);
  const [cloudSaveStatus, setCloudSaveStatus] = useState<
    "loading" | "unavailable" | "pending" | "saving" | "saved" | "error"
  >("loading");
  useEffect(() => {
    let cancelled = false;
    const loadCloudDraft = async () => {
      const { data, error } = await sourceDraftTable()
        .select("*")
        .eq("course_id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        if (!["PGRST205", "42P01"].includes(error.code ?? ""))
          toast.error(friendlyError(error, "Cloud draft could not be loaded. Please try again."));
        setCloudSaveStatus("unavailable");
        setCloudDraftReady(true);
        return;
      }
      const row = data as unknown as {
        source_name: string;
        source_text: string;
        source_pages: SourcePage[] | null;
        draft: DraftCourse | null;
      } | null;
      if (row) {
        setSourceName(row.source_name);
        setSourceText(row.source_text);
        setSourcePages(Array.isArray(row.source_pages) ? row.source_pages : null);
        if (row.draft?.lessons && Array.isArray(row.draft.lessons)) {
          setDraft(row.draft);
          const firstPage = row.draft.lessons.flatMap((lesson) =>
            lesson.sourceRefs.map((ref) => ref.page),
          );
          if (firstPage.length) setFirstContentPage(Math.min(...firstPage));
        }
      }
      setCloudDraftEnabled(true);
      setCloudSaveStatus("saved");
      setCloudDraftReady(true);
    };
    void loadCloudDraft();
    return () => {
      cancelled = true;
    };
  }, [id]);
  useEffect(() => {
    if (!cloudDraftReady || !cloudDraftEnabled || !restoredDesign || course?.published) return;
    setCloudSaveStatus("pending");
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      setCloudSaveStatus("saving");
      const { error } = await sourceDraftTable().upsert(
        {
          course_id: id,
          source_name: sourceName,
          source_text: sourceText,
          source_pages: sourcePages,
          draft,
        } as never,
        { onConflict: "course_id" },
      );
      if (cancelled) return;
      if (error) {
        setCloudSaveStatus("error");
        toast.error(friendlyError(error, "Cloud draft autosave failed. Please try again."));
      } else setCloudSaveStatus("saved");
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    id,
    cloudDraftReady,
    cloudDraftEnabled,
    restoredDesign,
    sourceName,
    sourceText,
    sourcePages,
    draft,
    course?.published,
  ]);

  const lessonKey = (
    index: number,
    lesson: { title: string; sourceRefs: { sourceId: string; page: number }[] },
  ) =>
    JSON.stringify([
      index,
      lesson.title,
      lesson.sourceRefs.map((ref) => [ref.sourceId, ref.page]),
      "body" in lesson && typeof lesson.body === "string"
        ? Array.from(lesson.body).reduce(
            (hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619),
            2166136261,
          ) >>> 0
        : 0,
    ]);
  const [designSyncing, setDesignSyncing] = useState(false);
  const { data: savedDesigns, refetch: refetchSavedDesigns } = useQuery({
    queryKey: ["studio-learning-designs", id],
    queryFn: async () => {
      const { data, error } = await designTable().select("*").eq("course_id", id);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        lesson_key: string;
        lesson_title: string;
        proposed_methods: string[];
        review_status: string;
        ai_rationale: string | null;
      }>;
    },
  });

  useEffect(() => {
    if (!draft?.lessons.length) return;
    let cancelled = false;
    const restore = async () => {
      const { data, error } = await designTable().select("*").eq("course_id", id);
      if (cancelled) return;
      if (error) {
        toast.error(
          friendlyError(error, "Could not load saved learning designs. Please try again."),
        );
        return;
      }
      const rows = (data ?? []) as unknown as Array<{
        lesson_key: string;
        proposed_methods: string[];
        review_status: string;
        ai_rationale: string | null;
      }>;
      const choices: Record<number, string[]> = {};
      const approved: Record<number, boolean> = {};
      const rationale: Record<number, string> = {};
      draft.lessons.forEach((lesson, index) => {
        const row = rows.find((item) => item.lesson_key === lessonKey(index, lesson));
        if (!row) return;
        choices[index] = row.proposed_methods;
        approved[index] = row.review_status === "approved";
        if (row.ai_rationale) rationale[index] = row.ai_rationale;
      });
      setDesignChoices(choices);
      setDesignApproved(approved);
      setDesignRationale(rationale);
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [id, draft]);
  const persistDesign = async (
    index: number,
    methods: string[],
    approved: boolean,
    rationale?: string,
  ) => {
    const lesson = draft?.lessons[index];
    if (!lesson) throw new Error("Analyse a manual before saving a learning design.");
    const row = {
      course_id: id,
      lesson_key: lessonKey(index, lesson),
      lesson_title: lesson.title,
      source_references: lesson.sourceRefs,
      proposed_methods: methods,
      ai_rationale: rationale ?? designRationale[index] ?? null,
      review_status: approved ? "approved" : "proposed",
    };
    const { error } = await designTable().upsert(row as never, {
      onConflict: "course_id,lesson_key",
    });
    if (error) throw error;
    await refetchSavedDesigns();
  };
  const updateSavedMethods = async (lessonKeyValue: string, methods: string[]) => {
    if (designSyncing || course?.published) return;
    setDesignSyncing(true);
    try {
      const { error } = await designTable()
        .update({
          proposed_methods: methods,
          review_status: "proposed",
        } as never)
        .eq("course_id", id)
        .eq("lesson_key", lessonKeyValue);
      if (error) throw error;
      setDesignApproved((previous) => {
        const next = { ...previous };
        draft?.lessons.forEach((lesson, index) => {
          if (lessonKey(index, lesson) === lessonKeyValue) next[index] = false;
        });
        return next;
      });
      setDesignChoices((previous) => {
        const next = { ...previous };
        draft?.lessons.forEach((lesson, index) => {
          if (lessonKey(index, lesson) === lessonKeyValue) next[index] = methods;
        });
        return next;
      });
      await refetchSavedDesigns();
      toast.success("Teaching methods saved; approval reset for review.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not update teaching methods."));
    } finally {
      setDesignSyncing(false);
    }
  };
  const updateSavedApproval = async (lessonKeyValue: string, approved: boolean) => {
    if (designSyncing || course?.published) return;
    setDesignSyncing(true);
    try {
      const { error } = await designTable()
        .update({
          review_status: approved ? "approved" : "proposed",
        } as never)
        .eq("course_id", id)
        .eq("lesson_key", lessonKeyValue);
      if (error) throw error;
      await refetchSavedDesigns();
      toast.success(approved ? "Saved design approved." : "Saved design reopened for review.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not update saved design."));
    } finally {
      setDesignSyncing(false);
    }
  };
  const saveDesignSelection = async (index: number, methods: string[]) => {
    if (designSyncing) return;
    setDesignSyncing(true);
    try {
      await persistDesign(index, methods, false);
      setDesignChoices((p) => ({ ...p, [index]: methods }));
      setDesignApproved((p) => ({ ...p, [index]: false }));
    } catch (error) {
      toast.error(friendlyError(error, "Could not save design."));
    } finally {
      setDesignSyncing(false);
    }
  };
  const toggleDesignApproval = async (index: number, lesson: { title: string; body: string }) => {
    if (designSyncing) return;
    const next = !designApproved[index];
    const methods = choicesFor(index, lesson.title, lesson.body);
    if (next && !methods.length) return;
    setDesignSyncing(true);
    try {
      await persistDesign(index, methods, next);
      setDesignApproved((p) => ({ ...p, [index]: next }));
      toast.success(next ? "Learning design approved and saved." : "Learning design reopened.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not update approval."));
    } finally {
      setDesignSyncing(false);
    }
  };

  const learningMethods = [
    {
      id: "illustrated",
      label: "Illustrated explanation",
      detail: "Explain key ideas with diagrams and examples",
    },
    {
      id: "video",
      label: "Video demonstration",
      detail: "Suggest a demonstration; trainer supplies or verifies the video",
    },
    {
      id: "steps",
      label: "Step-by-step practice",
      detail: "Turn a procedure into an actionable checklist",
    },
    {
      id: "scenario",
      label: "Scenario exercise",
      detail: "Apply knowledge to a realistic farming decision",
    },
    {
      id: "quiz",
      label: "Knowledge check",
      detail: "Assess comprehension with source-grounded questions",
    },
    {
      id: "visual",
      label: "Visual identification",
      detail: "Identify equipment, crops, symptoms or animals",
    },
  ];
  const recommendMethods = (title: string, body: string) => {
    const content = (title + " " + body).toLowerCase();
    const picks = ["illustrated", "quiz"];
    if (
      /inspect|procedure|step|install|apply|prepare|harvest|plant|handle|maintain|operate/.test(
        content,
      )
    )
      picks.push("steps", "video");
    if (/identify|recognise|recognize|symptom|diagram|part|species|disease|pest/.test(content))
      picks.push("visual");
    if (/risk|decision|problem|safety|manage|respond|prevent/.test(content)) picks.push("scenario");
    if (picks.length < 4) picks.push("scenario");
    return [...new Set(picks)];
  };
  const choicesFor = (index: number, title: string, body: string) =>
    designChoices[index] ?? recommendMethods(title, body);
  const changeDesign = (index: number, choices: string[]) => {
    setDesignChoices((p) => ({ ...p, [index]: choices }));
    setDesignApproved((p) => ({ ...p, [index]: false }));
  };

  const [showSourceEditor, setShowSourceEditor] = useState(false);
  const [showCourseSettings, setShowCourseSettings] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: STUDIO_CATEGORIES[0] ?? "Farm Management",
    level: "Beginner",
    cover_url: "",
    theme: "default" as CourseThemeName,
    price: "0",
    prerequisite_course_id: "",
    target_audience: "",
    value_proposition: "",
    outcomes_timeline: "",
    core_messaging: "",
  });
  useEffect(() => {
    if (course)
      setForm({
        title: course.title,
        description: course.description,
        category: course.category,
        level: course.level,
        cover_url: course.cover_url ?? "",
        theme: isCourseTheme(course.theme) ? course.theme : "default",
        price: (course.price_cents / 100).toFixed(2),
        prerequisite_course_id: course.prerequisite_course_id ?? "",
        target_audience: course.target_audience ?? "",
        value_proposition: course.value_proposition ?? "",
        outcomes_timeline: course.outcomes_timeline ?? "",
        core_messaging: course.core_messaging ?? "",
      });
  }, [course]);
  const { data: prereqOptions = [] } = useQuery({
    queryKey: ["prerequisite-options", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("studio_courses")
        .select("id, title")
        .eq("published", true)
        .order("title");
      return (data ?? []).filter((c) => c.id !== id);
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["studio-course", id] });
    qc.invalidateQueries({ queryKey: ["studio-lessons", id] });
    qc.invalidateQueries({ queryKey: ["studio-mine"] });
    qc.invalidateQueries({ queryKey: ["studio-published"] });
  };

  const readTextFile = async (file: File | undefined) => {
    if (!file || readingFile) return;
    if (!/\.(pdf|docx|pptx|txt|md)$/i.test(file.name)) {
      toast.error("Choose a PDF, DOCX, PPTX, TXT or MD file.");
      return;
    }
    setReadingFile(true);
    const controller = new AbortController();
    extractionController.current = controller;
    setRecognizedPages([]);
    setLowTextPages([]);
    setExtractionProgress("Opening document…");
    try {
      const pages = await extractDocument(file, {
        ocr: localOcr,
        signal: controller.signal,
        onProgress: (page, total, recognizing) => setExtractionProgress(`${recognizing ? "Recognizing scanned" : "Reading"} page ${page} of ${total}…`),
        onRecognized: (page, confidence) => setRecognizedPages(previous => [...previous, { page, confidence }]),
        onLowTextPage: page => setLowTextPages(previous => [...previous, page]),
      });
      const text = pages.map((page) => page.text).join("\n\n");
      if (!text.trim()) throw new Error("This file has no readable text.");
      setSourceName(file.name);
      setSourcePages(pages);
      setSourceText(text);
      setDraft(null);
      setFirstContentPage(1);
      previewSource({ pages, name: file.name, text });

      setFactoryStep(1);
      toast.success("Manual extracted. Review the lessons below.");
    } catch (error) {
      if (controller.signal.aborted) toast.info("Document extraction cancelled.");
      else toast.error(friendlyError(error, "Could not read file."));
    } finally {
      if (extractionController.current === controller) extractionController.current = null;
      setReadingFile(false);
      setExtractionProgress("");
    }
  };
  const previewSource = (override?: { pages?: SourcePage[]; name?: string; text?: string }) => {
    try {
      const pages = override?.pages ??
        sourcePages ?? [
          {
            sourceId: (override?.name ?? sourceName).trim() || "Pasted source",
            page: 1,
            text: override?.text ?? sourceText,
          },
        ];
      const next = buildCourseDraft(
        form.title || course?.title || "Course",
        pages,
        override ? undefined : firstContentPage,
      );
      const detectedPages = next.lessons.flatMap((lesson) =>
        lesson.sourceRefs.map((ref) => ref.page),
      );
      if (detectedPages.length) setFirstContentPage(Math.min(...detectedPages));
      setDraft(next);
      setDesignChoices({});
      setDesignApproved({});
      setDesignRationale({});
      if (!next.lessons.length) toast.error("No readable lessons found.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not parse source."));
    }
  };
  const reviseOutline = (nextLessons: DraftCourse["lessons"]) => {
    if (!draft || course?.published) return;
    setDraft({ ...draft, lessons: nextLessons });
    setDesignChoices({});
    setDesignApproved({});
    setDesignRationale({});
    setAiDraft(null);
    setBatchDrafts([]);
  };
  const importDraft = async () => {
    if (!draft?.lessons.length || importing || course?.published) return;
    const bodies = draft.lessons.map((lesson) => {
      const body = manualFormat === "slide" ? formatManualAsSlides(lesson.body) : lesson.body;
      return (
        body +
        "\n\nSource: " +
        lesson.sourceRefs.map((ref) => ref.sourceId + ", page " + ref.page).join("; ") +
        "\nReview required before publishing."
      );
    });
    if (bodies.some((body) => body.length > 20000)) {
      toast.error(
        "A lesson exceeds the 20,000-character limit. Split the source into smaller lessons.",
      );
      return;
    }
    setImporting(true);
    try {
      const start = lessons?.length ?? 0;
      const moduleIds = new Map<string, string>();
      const names = [
        ...new Set(draft.lessons.map((lesson) => lesson.module).filter((m): m is string => !!m)),
      ];
      if (names.length) {
        const base = studioModules?.length ?? 0;
        const { data: created, error: moduleError } = await supabase
          .from("studio_modules" as never)
          .insert(names.map((title, i) => ({ course_id: id, title, position: base + i })) as never)
          .select("id, title");
        if (moduleError) throw moduleError;
        for (const m of (created ?? []) as unknown as { id: string; title: string }[])
          moduleIds.set(m.title, m.id);
      }
      const rows = draft.lessons.map((lesson, index) => ({
        course_id: id,
        kind: manualFormat,
        position: start + index,
        title: lesson.title,
        module_id: lesson.module ? (moduleIds.get(lesson.module) ?? null) : null,
        body: bodies[index]!,
      }));
      const { error } = await supabase.from("studio_lessons").insert(rows);
      if (error) throw error;
      toast.success(
        `Imported ${rows.length} ${manualFormat === "slide" ? "slide" : "reading"} lessons for review.`,
      );
      setDraft(null);
      setSourceText("");
      refresh();
      qc.invalidateQueries({ queryKey: ["studio-modules", id] });
    } catch (error) {
      toast.error(friendlyError(error, "Import failed."));
    } finally {
      setImporting(false);
    }
  };

  const generateAiDraft = async () => {
    if (!draft?.lessons.length || aiLoading || course?.published) return;
    const lesson = draft.lessons[0];
    if (!lesson) return;
    if (!designApproved[0]) {
      toast.error("Approve the first lesson learning design before generating.");
      return;
    }
    setAiLoading(true);
    setAiDraft(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) throw new Error("Please sign in.");
      const response = await fetch("/api/course-factory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({
          courseId: id,
          title: lesson.title,
          sourceId: lesson.sourceRefs[0]?.sourceId ?? sourceName,
          sourceText: lesson.body.slice(0, 12000),
          approvedMethods: choicesFor(0, lesson.title, lesson.body),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "AI generation failed.");
      setAiDraft(payload);
    } catch (error) {
      toast.error(friendlyError(error, "AI generation failed."));
    } finally {
      setAiLoading(false);
    }
  };

  const generateBatch = async () => {
    if (!draft?.lessons.length || batchRunning || aiLoading || course?.published) return;
    const candidates = draft.lessons
      .map((lesson, index) => ({ lesson, index }))
      .filter(({ lesson }) => lesson.body.length >= 100)
      .slice(0, 5);
    if (!candidates.length) {
      toast.error("No lessons with enough source text (100 characters).");
      return;
    }
    if (candidates.some(({ index }) => !designApproved[index])) {
      toast.error("Approve the learning design for each selected lesson before batch generation.");
      return;
    }
    if (
      !(await confirm({
        title: `Generate ${candidates.length} AI lesson drafts?`,
        description:
          "Each lesson uses part of your daily AI allowance. You can review every draft before saving.",
        confirmLabel: "Generate drafts",
      }))
    )
      return;
    setBatchRunning(true);
    setBatchDrafts([]);
    const results: {
      sourceTitle: string;
      sourceRefs: string;
      lessonTitle: string;
      lessonSummary: string;
      questions: {
        question: string;
        options: string[];
        correctIndex: number;
        sourceQuote: string;
      }[];
    }[] = [];
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) throw new Error("Please sign in.");
      for (const [index, candidate] of candidates.entries()) {
        const { lesson } = candidate;
        setBatchProgress(`Generating ${index + 1} of ${candidates.length}: ${lesson.title}`);
        const response = await fetch("/api/course-factory", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({
            courseId: id,
            title: lesson.title,
            sourceId: lesson.sourceRefs[0]?.sourceId ?? sourceName,
            sourceText: lesson.body.slice(0, 12000),
            approvedMethods: choicesFor(candidate.index, lesson.title, lesson.body),
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message ?? "AI generation stopped.");
        results.push({
          sourceTitle: lesson.title,
          sourceRefs: lesson.sourceRefs
            .map((ref) => `${ref.sourceId}, page ${ref.page}`)
            .join("; "),
          lessonTitle: payload.lessonTitle,
          lessonSummary: payload.lessonSummary,
          questions: payload.questions,
        });
        setBatchDrafts([...results]);
      }
      toast.success(`Generated ${results.length} draft lessons. Review before saving.`);
    } catch (error) {
      toast.error(friendlyError(error, "Batch generation stopped."));
    } finally {
      setBatchProgress("");
      setBatchRunning(false);
    }
  };

  const saveBatchDrafts = async () => {
    if (!batchDrafts.length || batchRunning || aiLoading || course?.published) return;
    setBatchRunning(true);
    let saved = 0;
    try {
      for (const item of batchDrafts) {
        const position = (lessons?.length ?? 0) + saved * 2;
        const { error: readingError } = await supabase.from("studio_lessons").insert({
          course_id: id,
          kind: "reading",
          position,
          title: item.lessonTitle,
          body: `${item.lessonSummary}\n\nSource: ${item.sourceRefs}\nReview required before publishing.`,
        });
        if (readingError) throw readingError;
        saved++;
        if (item.questions.length) {
          const { data: quiz, error: quizError } = await supabase
            .from("studio_lessons")
            .insert({
              course_id: id,
              kind: "quiz",
              position: position + 1,
              title: `Knowledge check: ${item.lessonTitle}`,
              body: "pass:80",
              quiz: item.questions.map((q) => ({ q: q.question, options: q.options })),
            })
            .select("id")
            .single();
          if (quizError || !quiz) throw quizError ?? new Error("Quiz insert failed.");
          const { error: answerError } = await supabase.from("studio_quiz_answers").upsert({
            lesson_id: quiz.id,
            course_id: id,
            answers: item.questions.map((q) => q.correctIndex),
          });
          if (answerError) throw answerError;
        }
      }
      setBatchDrafts([]);
      toast.success(
        `Saved ${saved} AI lesson drafts. Review each lesson and quiz before publishing.`,
      );
    } catch (error) {
      setBatchDrafts((current) => current.slice(saved));
      toast.error(friendlyError(error, "Batch save interrupted. Review saved lessons."));
    } finally {
      setBatchRunning(false);
      refresh();
    }
  };

  const saveAiDraft = async () => {
    if (!aiDraft || course?.published || aiLoading) return;
    if (!aiDraft.questions.length) {
      toast.error("No source-verified questions to save.");
      return;
    }
    setAiLoading(true);
    try {
      const position = lessons?.length ?? 0;
      const { error: readingError } = await supabase.from("studio_lessons").insert({
        course_id: id,
        kind: "reading",
        position,
        title: aiDraft.lessonTitle,
        body: `${aiDraft.lessonSummary}\n\nSource: ${draft?.lessons[0]?.sourceRefs.map((ref) => `${ref.sourceId}, page ${ref.page}`).join("; ") ?? sourceName}\nReview required before publishing.`,
      });
      if (readingError) throw readingError;
      const { data: quiz, error: quizError } = await supabase
        .from("studio_lessons")
        .insert({
          course_id: id,
          kind: "quiz",
          position: position + 1,
          title: `Knowledge check: ${aiDraft.lessonTitle}`,
          body: "pass:80",
          quiz: aiDraft.questions.map((q) => ({ q: q.question, options: q.options })),
        })
        .select("id")
        .single();
      if (quizError || !quiz) throw quizError ?? new Error("Quiz insert failed.");
      const { error: answerError } = await supabase.from("studio_quiz_answers").upsert({
        lesson_id: quiz.id,
        course_id: id,
        answers: aiDraft.questions.map((q) => q.correctIndex),
      });
      if (answerError) throw answerError;
      setAiDraft(null);
      toast.success("AI reading and quiz saved as drafts. Verify all content before publishing.");
      refresh();
    } catch (error) {
      toast.error(friendlyError(error, "Could not save AI draft."));
    } finally {
      setAiLoading(false);
    }
  };

  const saveDetails = async () => {
    if (form.cover_url && !/^https:\/\//.test(form.cover_url)) {
      toast.error("Cover image link must start with https://");
      return;
    }
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Enter a valid price.");
      return;
    }
    const { price: _price, ...rest } = form;
    const { error } = await supabase
      .from("studio_courses")
      .update({
        ...rest,
        cover_url: form.cover_url || null,
        prerequisite_course_id: form.prerequisite_course_id || null,
        price_cents: Math.round(price * 100),
      })
      .eq("id", id);
    if (error) toast.error("Could not save — check the title is 3–120 letters.");
    else {
      toast.success("Saved");
      refresh();
    }
  };
  const { data: videoLinks = [], refetch: refetchLinks } = useQuery({
    queryKey: ["studio-video-links", id],
    queryFn: async () =>
      ((
        await supabase
          .from("course_external_content")
          .select(
            "id, lesson_id, item_id, objectives, item:external_content_items(title, provider:external_content_providers(name))",
          )
          .eq("course_id", id)
      ).data ?? []) as unknown as VideoLink[],
  });
  const addLesson = async (kind: string, moduleId?: string | null) => {
    const title =
      kind === "quiz"
        ? "Knowledge check"
        : kind === "video"
          ? "New video lesson"
          : kind === "scorm"
            ? "SCORM e-learning"
            : kind === "slide"
              ? "New slide lesson"
              : "New reading";
    const { data, error } = await supabase
      .from("studio_lessons")
      .insert({
        course_id: id,
        kind,
        position: (lessons?.at(-1)?.position ?? -1) + 1,
        title,
        module_id: moduleId ?? null,
      })
      .select("id")
      .single();
    if (error || !data) toast.error("Could not add lesson.");
    else {
      refresh();
      setSelectedLesson(data.id);
      setScreen("lesson");
    }
  };
  const createModule = async () => {
    const { data, error } = await supabase
      .from("studio_modules" as never)
      .insert({
        course_id: id,
        title: `Module ${(studioModules?.length ?? 0) + 1}`,
        position: studioModules?.length ?? 0,
      } as never)
      .select("id")
      .single();
    if (error || !data) {
      toast.error("Could not create module.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["studio-modules", id] });
    return (data as unknown as { id: string }).id;
  };
  const renameModule = async (moduleId: string, title: string) => {
    const { error } = await supabase
      .from("studio_modules" as never)
      .update({ title } as never)
      .eq("id", moduleId);
    if (error) {
      toast.error("Could not rename module.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["studio-modules", id] });
  };
  const deleteModule = async (moduleId: string) => {
    const ok = await confirm({
      tone: "danger",
      title: "Delete this module?",
      confirmLabel: "Delete module",
      description: <p>Its lessons move to Unassigned lessons, not deleted.</p>,
    });
    if (!ok) return;
    const { error } = await supabase
      .from("studio_modules" as never)
      .delete()
      .eq("id", moduleId);
    if (error) {
      toast.error("Could not delete module.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["studio-modules", id] });
    qc.invalidateQueries({ queryKey: ["studio-lessons", id] });
    if (screen === moduleId) setScreen("overview");
  };
  const assignLessonToModule = async (lessonId: string, moduleId: string | null) => {
    const { error } = await supabase
      .from("studio_lessons")
      .update({ module_id: moduleId } as never)
      .eq("id", lessonId);
    if (error) {
      toast.error("Could not move lesson.");
      return;
    }
    refresh();
  };
  const reorderLesson = async (lessonId: string, direction: number) => {
    const { error } = await supabase.rpc("studio_move_lesson", {
      _course_id: id,
      _lesson_id: lessonId,
      _direction: direction,
    });
    if (error) toast.error(friendlyError(error, "Could not move the lesson."));
    else refresh();
  };
  const deleteLessons = async (lessonIds: string[]) => {
    if (!lessonIds.length) return;
    const ok = await confirm({
      tone: "danger",
      title: `Delete ${lessonIds.length} lesson${lessonIds.length === 1 ? "" : "s"}?`,
      confirmLabel: "Delete",
      description: <p>This can't be undone.</p>,
    });
    if (!ok) return;
    const { error } = await supabase.from("studio_lessons").delete().in("id", lessonIds);
    if (error) {
      toast.error("Could not delete lessons.");
      return;
    }
    toast.success(`Deleted ${lessonIds.length} lesson${lessonIds.length === 1 ? "" : "s"}.`);
    refresh();
  };
  const modules = groupLessonsIntoModules(lessons ?? [], studioModules ?? []);
  const draftGroups = draft ? groupDraftLessons(draft.lessons) : [];
  const draftGroupFor = (moduleTitle: string) =>
    draftGroups.find(
      (g) => g.title === moduleTitle || moduleTitle.startsWith(g.title.split(" · ")[0] ?? g.title),
    );
  const pendingReviewCount = (lessons ?? []).filter((lesson) =>
    /Review required before publishing\./i.test(lesson.body),
  ).length;
  const markAllReviewed = async () => {
    if (!course || course.published || reviewingLessons || !pendingReviewCount) return;
    const accepted = await confirm({
      title: "Mark all imported lessons as reviewed?",
      confirmLabel: "Mark all reviewed",
      description: (
        <p>
          I have checked the content and source evidence for all {pendingReviewCount} imported
          lessons. This records my review; it does not publish the course.
        </p>
      ),
    });
    if (!accepted) return;
    setReviewingLessons(true);
    try {
      const { data: count, error } = await supabase.rpc("studio_mark_imported_reviewed", {
        _course_id: id,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["studio-lessons", id] });
      toast.success(`${count} imported lesson${count === 1 ? "" : "s"} marked as reviewed.`);
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't save your lesson review. Please try again."));
    } finally {
      setReviewingLessons(false);
    }
  };
  const readiness = [
    {
      label: "Course title and description",
      ready: form.title.trim().length >= 3 && form.description.trim().length >= 30,
    },
    {
      label: "Industry and topic selected",
      ready:
        !!form.category.trim() &&
        !form.category.endsWith(" / General") &&
        !form.category.endsWith(" / "),
    },
    { label: "At least one lesson", ready: (lessons?.length ?? 0) > 0 },
    { label: "Imported lessons reviewed", ready: pendingReviewCount === 0 },
  ];
  const readyToPublish = readiness.every((item) => item.ready);

  const setPublished = async (published: boolean) => {
    if (published && !readyToPublish) {
      toast.error("Complete the publishing checklist and save your course details first.");
      return;
    }
    if (published && !lessons?.length) {
      toast.error("Add at least one lesson before publishing.");
      return;
    }
    if (published && pendingReviewCount > 0) {
      toast.error("Check your imported lessons, then mark them as reviewed before publishing.");
      return;
    }
    if (published) {
      const { error: approvalError } = await supabase.rpc(
        "studio_approve_review" as never,
        { _course_id: id } as never,
      );
      if (approvalError) {
        toast.error(
          friendlyError(approvalError, "We couldn't record your review. Please try again."),
        );
        return;
      }
    }
    const { data: publishedId, error } = published
      ? await supabase.rpc("studio_publish_version", { _course_id: id, _note: changeNote })
      : await supabase
          .from("studio_courses")
          .update({ published: false })
          .eq("id", id)
          .select("id")
          .single()
          .then((r) => ({ data: r.data?.id, error: r.error }));
    if (error) {
      toast.error(
        /creator|approv/i.test(error.message)
          ? "Your creator application must be approved before you can publish."
          : "We couldn't change the publishing status. Please try again.",
        /creator|approv/i.test(error.message)
          ? { action: { label: "Apply", onClick: () => nav({ to: "/creator-application" }) } }
          : undefined,
      );
      return;
    }
    refresh();
    toast.success(
      published ? "Version published — learners can now see it." : "Moved back to draft.",
    );
    if (publishedId && publishedId !== id) nav({ to: "/studio/$id", params: { id: publishedId } });
    qc.invalidateQueries({ queryKey: ["studio-versions"] });
  };
  const [deleting, setDeleting] = useState(false);
  const remove = async () => {
    if (!course || deleting) return;
    if (course.published) {
      toast.warning("Unpublish this course before deleting it.", {
        description: "Published courses can't be deleted while learners can see them.",
      });
      return;
    }
    const ok = await confirm({
      tone: "danger",
      title: "Delete this draft course?",
      confirmLabel: "Delete course",
      cancelLabel: "Keep course",
      description: (
        <>
          <p>
            You're about to permanently delete{" "}
            <strong className="text-foreground">{course.title}</strong>, including all of its
            lessons, quizzes and saved import work.
          </p>
          <p>This can't be undone.</p>
        </>
      ),
    });
    if (!ok) return;
    setDeleting(true);
    const { data, error } = await supabase.rpc("studio_delete_draft", { _course_id: id });
    setDeleting(false);
    const result = error ? "error" : data;
    if (result === "deleted") {
      toast.success(`"${course.title}" was deleted.`);
      refresh();
      nav({ to: "/studio" });
      return;
    }
    toast.error(
      result === "published"
        ? "Unpublish this course before deleting it."
        : result === "not_owner"
          ? "Only the trainer who created this course can delete it."
          : result === "not_signed_in"
            ? "Your session has ended. Please sign in again."
            : result === "not_found"
              ? "This course no longer exists."
              : "We couldn't delete the course. Please try again.",
    );
  };

  if (isLoading || !authReady)
    return (
      <Phone>
        <Header />
        <Sheet>
          <CanvasHeading title="Loading…" />
        </Sheet>
      </Phone>
    );
  if (!course)
    return (
      <Phone>
        <Header />
        <Sheet>
          <CanvasHeading title="Course not found" />
          <Link to="/studio" className="mt-4 inline-block text-primary">
            Back to Studio
          </Link>
        </Sheet>
      </Phone>
    );
  if (course.author_id !== user?.id)
    return (
      <Phone>
        <Header />
        <Sheet>
          <CanvasHeading title="Course Studio" />
          <p className="mt-4">Only the course owner can open this editor.</p>
          <Link to="/studio" className="text-primary">
            Back to Studio
          </Link>
        </Sheet>
      </Phone>
    );
  return (
    <Phone>
      <Header />
      <Sheet wide>
        <div className="mb-5 space-y-3">
          <CanvasHeading eyebrow={course.published ? "Published" : "Draft"} title="Course editor" />
          <div className="flex flex-wrap gap-2">
            <Link
              to="/studio"
              className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs"
            >
              <ArrowLeft className="h-3 w-3" />
              All my courses
            </Link>
            <Link
              to="/class/$id"
              params={{ id }}
              className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs"
            >
              <Eye className="h-3 w-3" />
              Preview
            </Link>
            {course.published && (
              <Link
                to="/learning-activities/$courseId"
                params={{ courseId: id }}
                className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs"
              >
                Learner activities
              </Link>
            )}
          </div>
        </div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-semibold">{course.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              v1.{course.version_number - 1} ·{" "}
              {course.published
                ? "Published"
                : course.revision_of
                  ? "Draft revision · published course unchanged"
                  : "Draft"}
            </p>
          </div>
          <StudioCourseActions course={course} onChanged={refresh} />
        </div>
        <div className="grid min-w-0 gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="min-w-0 border-b border-border pb-4 lg:border-b-0 lg:border-r lg:pr-5">
            <nav
              aria-label="Course workspace"
              className="grid grid-cols-2 gap-1.5 lg:grid-cols-1 lg:gap-1"
            >
              {[
                { key: "overview", label: "Course details" },
                { key: "import", label: "Course Design" },
                { key: "content", label: "Content" },
                { key: "performance", label: "Performance" },
                { key: "history", label: "Version history" },
                { key: "publish", label: "Review & publish" },
              ].map((item) => (
                <Button
                  key={item.key}
                  variant={screen === item.key ? "secondary" : "ghost"}
                  className="h-auto min-h-9 justify-start whitespace-normal text-left"
                  onClick={() => setScreen(item.key)}
                >
                  {item.label}
                </Button>
              ))}
            </nav>
            <div className="mt-5 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Curriculum</h3>
              <Button
                size="icon"
                variant="ghost"
                title="Add module"
                aria-label="Add module"
                disabled={course.published}
                onClick={createModule}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 max-h-72 space-y-4 overflow-y-auto lg:max-h-[65vh]">
              {modules.map((mod) => (
                <div key={mod.key} className="space-y-0.5">
                  <Button
                    variant={screen === mod.key ? "secondary" : "ghost"}
                    className="h-auto w-full justify-start whitespace-normal text-left text-xs font-bold"
                    onClick={() => setScreen(mod.key)}
                  >
                    {mod.title}
                    <span className="ml-auto pl-2 text-muted-foreground">{mod.lessons.length}</span>
                  </Button>
                  <div className="space-y-0.5 border-l border-border pl-2">
                    {mod.lessons.map((lesson) => {
                      const Icon =
                        lesson.kind === "quiz"
                          ? HelpCircle
                          : lesson.kind === "video"
                            ? Video
                            : lesson.kind === "scorm"
                              ? Package
                              : FileText;
                      return (
                        <Button
                          key={lesson.id}
                          variant={
                            screen === "lesson" && selectedLesson === lesson.id
                              ? "secondary"
                              : "ghost"
                          }
                          className="h-auto min-h-10 w-full justify-start whitespace-normal text-left text-xs"
                          onClick={() => {
                            setSelectedLesson(lesson.id);
                            setScreen("lesson");
                          }}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1 break-words">{lesson.title}</span>
                          {lessonIsComplete(lesson) && (
                            <Check className="h-3 w-3 shrink-0 text-primary" />
                          )}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={course.published}
                onClick={() => addLesson("reading")}
              >
                <Plus className="h-3 w-3" />
                Reading
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={course.published}
                onClick={() => addLesson("slide")}
              >
                <LayoutGrid className="h-3 w-3" />
                Slides
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={course.published}
                onClick={() => addLesson("video")}
              >
                <Video className="h-3 w-3" />
                Video
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={course.published}
                onClick={() => addLesson("quiz")}
              >
                <HelpCircle className="h-3 w-3" />
                Quiz
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={course.published}
                onClick={() => addLesson("scorm")}
              >
                <Package className="h-3 w-3" />
                SCORM
              </Button>
            </div>
          </aside>
          <main className="min-w-0 space-y-6">
            {course.published && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-primary bg-muted p-4">
                <p className="text-sm">
                  This published version is read-only. Create a draft revision to make changes.
                </p>
                <StudioCourseActions course={course} onChanged={refresh} revisionOnly />
              </div>
            )}
            {screen === "history" && (
              <StudioVersions
                courseId={course.revision_of ?? id}
                onOpened={(newId) => nav({ to: "/studio/$id", params: { id: newId } })}
              />
            )}
            {screen === "lesson" &&
              (() => {
                const lesson = lessons?.find((l) => l.id === selectedLesson);
                if (!lesson)
                  return (
                    <p className="py-10 text-muted-foreground">
                      Select a lesson from the curriculum, or add a new one.
                    </p>
                  );
                const index = lessons?.findIndex((l) => l.id === lesson.id) ?? 0;
                return (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-semibold">Lesson editor</h2>
                      <select
                        aria-label="Lesson module"
                        value={lesson.module_id ?? ""}
                        disabled={course.published}
                        onChange={(e) => assignLessonToModule(lesson.id, e.target.value || null)}
                        className="max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Unassigned lessons</option>
                        {studioModules?.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={index === 0 || course.published}
                        onClick={() => reorderLesson(lesson.id, -1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                        Move up
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={index === (lessons?.length ?? 0) - 1 || course.published}
                        onClick={() => reorderLesson(lesson.id, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                        Move down
                      </Button>
                    </div>
                    <LessonEditor
                      key={lesson.id}
                      lesson={lesson}
                      index={index}
                      link={videoLinks.find((v) => v.lesson_id === lesson.id)}
                      onChange={() => {
                        refresh();
                        void refetchLinks();
                      }}
                      courseId={id}
                      sourceText={
                        lessons
                          ?.slice(0, index)
                          .reverse()
                          .find((l) => l.kind !== "quiz")?.body ?? ""
                      }
                      readOnly={course.published}
                    />
                  </div>
                );
              })()}
            {screen === "overview" && (
              <fieldset disabled={course.published} className="min-w-0 space-y-6">
                <section className="flex h-full flex-col space-y-3 border-b border-border pb-6">
                  <h2 className="font-semibold">Course details</h2>
                  <div className="grid flex-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Input
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        aria-label="Title"
                        maxLength={120}
                        placeholder="Title"
                      />
                      <Textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        placeholder="What will learners gain from this course?"
                        rows={4}
                        maxLength={4000}
                      />
                      <DescriptionAssistant
                        courseId={id}
                        title={form.title}
                        sourceText={sourceText}
                        onText={(t) => setForm((f) => ({ ...f, description: t }))}
                      />
                      <PolishButton
                        courseId={id}
                        title={form.title}
                        text={form.description}
                        onText={(t) => setForm((f) => ({ ...f, description: t }))}
                      />
                      <div>
                        <label className="block text-xs font-medium">Industry</label>
                        <select
                          value={courseIndustry(form.category)}
                          onChange={(e) => {
                            const selected = e.target.value;
                            setForm({
                              ...form,
                              category:
                                selected === "Agriculture"
                                  ? "Farm Management"
                                  : selected + " / General",
                            });
                            setNewTopic("");
                          }}
                          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                          aria-label="Industry"
                        >
                          {INDUSTRIES.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium">Topic</label>
                          {courseIndustry(form.category) === "Agriculture" ? (
                            <select
                              value={STUDIO_CATEGORIES.includes(form.category) ? form.category : ""}
                              onChange={(e) => setForm({ ...form, category: e.target.value })}
                              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                              aria-label="Topic"
                            >
                              {!STUDIO_CATEGORIES.includes(form.category) && (
                                <option value="">Select a topic</option>
                              )}
                              {STUDIO_CATEGORIES.map((c) => (
                                <option key={c}>{c}</option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              value={newTopic || form.category.split(" / ").slice(1).join(" / ")}
                              onChange={(e) => {
                                setNewTopic(e.target.value);
                                setForm({
                                  ...form,
                                  category: courseIndustry(form.category) + " / " + e.target.value,
                                });
                              }}
                              aria-label="Topic"
                              placeholder="e.g. Patient care, Retail operations"
                              maxLength={100}
                              className="mt-1"
                            />
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium">Level</label>
                          <select
                            value={form.level}
                            onChange={(e) => setForm({ ...form, level: e.target.value })}
                            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                            aria-label="Level"
                          >
                            {["Beginner", "Intermediate", "Advanced"].map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium">Cover image</label>
                      <div className="mt-1">
                        <CoverImageInput
                          value={form.cover_url}
                          onChange={(url) => setForm({ ...form, cover_url: url })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium">Theme</label>
                      <div
                        className="mt-1 flex flex-wrap gap-2"
                        role="radiogroup"
                        aria-label="Course theme"
                      >
                        {COURSE_THEME_NAMES.map((name) => (
                          <button
                            key={name}
                            type="button"
                            role="radio"
                            aria-checked={form.theme === name}
                            aria-label={COURSE_THEMES[name].label}
                            onClick={() => setForm({ ...form, theme: name })}
                            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${form.theme === name ? "border-foreground" : "border-transparent"}`}
                            style={{ backgroundColor: COURSE_THEMES[name].primary }}
                          >
                            {form.theme === name && (
                              <Check
                                className="h-4 w-4"
                                style={{ color: COURSE_THEMES[name].primaryForeground }}
                              />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium">Price (USD)</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.price}
                        onChange={(e) => setForm({ ...form, price: e.target.value })}
                        className="mt-1"
                        aria-label="Price in US dollars"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        0 is free. Buyers pay this once to enrol via Stripe Checkout.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3 border-t border-border pt-4">
                    <div>
                      <label className="block text-xs font-medium">Prerequisites</label>
                      <p className="text-xs text-muted-foreground">
                        Require a learner to finish another published course first.
                      </p>
                      <select
                        value={form.prerequisite_course_id}
                        onChange={(e) =>
                          setForm({ ...form, prerequisite_course_id: e.target.value })
                        }
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
                    <label className="block space-y-1 text-xs font-medium">
                      Core Messaging
                      <Textarea
                        value={form.core_messaging}
                        onChange={(e) => setForm({ ...form, core_messaging: e.target.value })}
                        placeholder="Key messaging on ROI"
                        rows={2}
                        maxLength={2000}
                      />
                    </label>
                  </div>
                  <Button onClick={saveDetails} className="mt-auto w-full">
                    Save details
                  </Button>
                </section>
              </fieldset>
            )}
            {screen === "content" && (
              <StudioContentLibrary
                courseId={id}
                modules={(studioModules ?? []).map((m) => ({ id: m.id, title: m.title }))}
                readOnly={course.published}
              />
            )}
            {screen === "import" && (
              <div
                className="flex gap-1 rounded-full border border-border p-1 w-fit"
                role="tablist"
                aria-label="Design method"
              >
                {(
                  [
                    { key: "auto", label: "Auto Design" },
                    { key: "manual", label: "Manual Design" },
                  ] as const
                ).map((t) => (
                  <Button
                    key={t.key}
                    role="tab"
                    aria-selected={designTab === t.key}
                    size="sm"
                    variant={designTab === t.key ? "default" : "ghost"}
                    className="rounded-full"
                    onClick={() => setDesignTab(t.key)}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            )}
            {screen === "import" && designTab === "manual" && (
              <fieldset disabled={course.published} className="min-w-0 space-y-6">
                {modules.length === 0 && (
                  <section className="space-y-3 rounded-2xl border border-dashed border-border p-4">
                    <h2 className="font-semibold">Add your first lesson</h2>
                    <p className="text-xs text-muted-foreground"></p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => addLesson("video")}>
                        <Video className="h-4 w-4" />
                        Video
                      </Button>
                      <VideoLibraryPicker
                        courseId={id}
                        position={lessons?.length ?? 0}
                        usedItemIds={videoLinks.map((v) => v.item_id)}
                        onAdded={() => {
                          refresh();
                          void refetchLinks();
                        }}
                      />
                      <Button size="sm" variant="outline" onClick={() => addLesson("reading")}>
                        <FileText className="h-4 w-4" />
                        Reading
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => addLesson("slide")}>
                        <LayoutGrid className="h-4 w-4" />
                        Slides
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => addLesson("quiz")}>
                        <HelpCircle className="h-4 w-4" />
                        Quiz
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => addLesson("scorm")}>
                        <Package className="h-4 w-4" />
                        SCORM
                      </Button>
                    </div>
                  </section>
                )}
                <section className="space-y-3 border-b border-border pb-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold">Modules</h2>
                    <Button size="sm" variant="outline" onClick={createModule}>
                      <Plus className="h-4 w-4" />
                      Add module
                    </Button>
                  </div>
                  {studioModules?.length ? (
                    <ul className="space-y-2">
                      {studioModules.map((m) => (
                        <li key={m.id} className="flex items-center gap-2">
                          <Input
                            key={m.id + m.title}
                            defaultValue={m.title}
                            onBlur={(e) => {
                              if (e.target.value.trim() && e.target.value !== m.title)
                                void renameModule(m.id, e.target.value);
                            }}
                            className="h-8"
                            aria-label="Module title"
                          />
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {modules.find((g) => g.moduleId === m.id)?.lessons.length ?? 0} lessons
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Delete module"
                            onClick={() => deleteModule(m.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No modules yet. Add one, or use Auto Design to create modules automatically.
                    </p>
                  )}
                </section>
                <section className="space-y-3 border-b border-border pb-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold">Manage lessons</h2>
                    {selectedLessonIds.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          void deleteLessons(selectedLessonIds);
                          setSelectedLessonIds([]);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete {selectedLessonIds.length} selected
                      </Button>
                    )}
                  </div>
                  {lessons?.length ? (
                    (() => {
                      const titleCounts = new Map<string, number>();
                      for (const l of lessons)
                        titleCounts.set(l.title, (titleCounts.get(l.title) ?? 0) + 1);
                      return (
                        <ul className="space-y-1.5">
                          {lessons.map((l) => {
                            const duplicate = (titleCounts.get(l.title) ?? 0) > 1;
                            const checked = selectedLessonIds.includes(l.id);
                            return (
                              <li
                                key={l.id}
                                className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm ${duplicate ? "border-destructive/40 bg-destructive/5" : "border-border"}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    setSelectedLessonIds((cur) =>
                                      e.target.checked
                                        ? [...cur, l.id]
                                        : cur.filter((x) => x !== l.id),
                                    )
                                  }
                                />
                                <Button
                                  variant="ghost"
                                  className="min-w-0 flex-1 justify-start truncate"
                                  onClick={() => {
                                    setSelectedLesson(l.id);
                                    setScreen("lesson");
                                  }}
                                >
                                  {l.title}
                                  {duplicate && (
                                    <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                                      Possible duplicate
                                    </span>
                                  )}
                                </Button>
                                <select
                                  value={l.module_id ?? ""}
                                  onChange={(e) =>
                                    assignLessonToModule(l.id, e.target.value || null)
                                  }
                                  className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                                  aria-label="Module"
                                >
                                  <option value="">Unassigned</option>
                                  {studioModules?.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.title}
                                    </option>
                                  ))}
                                </select>
                              </li>
                            );
                          })}
                        </ul>
                      );
                    })()
                  ) : (
                    <p className="text-xs text-muted-foreground">No lessons yet.</p>
                  )}
                </section>
              </fieldset>
            )}
            {screen === "import" && designTab === "auto" && (
              <div className="min-w-0 space-y-6">
                <section className="space-y-3 border-b border-border pb-6">
                  <h2 className="font-semibold">Build from a manual</h2>
                  <nav aria-label="Course Factory steps" className="flex flex-wrap gap-2">
                    {["Upload", "Review & approve", "Generate & import"].map((label, i) => (
                      <Button
                        key={label}
                        type="button"
                        size="sm"
                        variant={factoryStep === i ? "secondary" : "ghost"}
                        onClick={() => setFactoryStep(i)}
                      >
                        {i + 1}. {label}
                      </Button>
                    ))}
                  </nav>

                  {factoryStep === 0 && (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Paste extracted text from a training manual. Module and chapter headings
                        become draft reading lessons. Upload PDF, Word, PowerPoint or plain text.
                        Enable local recognition for scanned English PDFs. Review every lesson
                        before publishing.
                      </p>
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={localOcr} disabled={readingFile} onChange={event => setLocalOcr(event.target.checked)} />Recognize scanned English PDF pages on this device</label>
                      {localOcr && <p className="text-xs text-muted-foreground">Up to 20 pages with little embedded text, within the 12 MB document limit. First use downloads the recognition engine from Plusticity. Source pages stay on your device during recognition. Check spelling, numbers and reading order; tables and handwriting may be inaccurate.</p>}
                      {readingFile && <div className="flex items-center gap-2"><p role="status" aria-live="polite" className="text-xs">{extractionProgress}</p><Button type="button" size="sm" variant="outline" onClick={() => extractionController.current?.abort()}>Cancel extraction</Button></div>}
                      {!readingFile && recognizedPages.length > 0 && <p role="status" className="text-xs">Recognized {recognizedPages.length} scanned pages. Review all extracted text before importing.{recognizedPages.some(page => page.confidence < 70) && ` Low-confidence pages: ${recognizedPages.filter(page => page.confidence < 70).map(page => page.page).join(", ")}.`}</p>}
                      {!readingFile && !recognizedPages.length && lowTextPages.length > 0 && <p role="status" className="text-xs">Pages with little embedded text: {lowTextPages.join(", ")}. Check the original pages. Scanned images may need local recognition; upload again with recognition enabled.</p>}
                      <label className="block text-xs font-medium">
                        Upload a manual (PDF, DOCX, PPTX, TXT or MD)
                        <input
                          type="file"
                          accept=".pdf,.docx,.pptx,.txt,.md"
                          disabled={readingFile}
                          onChange={(e) => {
                            void readTextFile(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                          className="mt-1 block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-primary"
                        />
                      </label>
                      <Input
                        value={sourceName}
                        onChange={(e) => setSourceName(e.target.value)}
                        placeholder="Source document name"
                        aria-label="Source document name"
                        maxLength={160}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowExtractedText((v) => !v)}
                      >
                        {showExtractedText
                          ? "Hide extracted text"
                          : sourceText
                            ? "Edit extracted text"
                            : "Paste text manually instead"}
                      </Button>
                      {showExtractedText && (
                        <Textarea
                          value={sourceText}
                          onChange={(e) => {
                            setSourceText(e.target.value);
                            setSourcePages(null);
                            setDraft(null);
                          }}
                          placeholder={"Module 1: Introduction\\nYour training content..."}
                          rows={6}
                          maxLength={1000000}
                          aria-label="Extracted manual text"
                        />
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          previewSource();
                          setFactoryStep(1);
                        }}
                        disabled={!sourceText.trim()}
                      >
                        Analyse manual & build course outline
                      </Button>
                      <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
                        Cloud source draft:{" "}
                        {cloudSaveStatus === "saved"
                          ? "Saved"
                          : cloudSaveStatus === "saving"
                            ? "Saving…"
                            : cloudSaveStatus === "pending"
                              ? "Unsaved changes — saving shortly"
                              : cloudSaveStatus === "loading"
                                ? "Loading…"
                                : cloudSaveStatus === "error"
                                  ? "Save failed — check connection"
                                  : "Cloud storage unavailable"}
                      </p>
                      {!!savedDesigns?.length && (
                        <div className="space-y-2 rounded-xl border border-border p-4">
                          <h3 className="font-semibold">Saved learning designs</h3>
                          <p className="text-xs text-muted-foreground">
                            These records are available across devices. To edit or generate their
                            lesson content, upload the source manual on this device.
                          </p>
                          <p className="text-xs font-medium">
                            {
                              savedDesigns.filter((item) => item.review_status === "approved")
                                .length
                            }{" "}
                            of {savedDesigns.length} designs approved
                          </p>
                          {savedDesigns.map((item, index) => (
                            <details
                              key={item.lesson_key}
                              className="rounded-lg border border-border bg-background p-3 text-xs"
                            >
                              <summary className="cursor-pointer font-medium">
                                {index + 1}. {item.lesson_title} ·{" "}
                                {item.review_status === "approved" ? "✓ Approved" : "Needs review"}
                              </summary>
                              <div className="mt-2 space-y-2">
                                <p className="font-medium">Teaching and assessment methods</p>
                                {learningMethods.map((method) => (
                                  <label
                                    key={method.id}
                                    className="flex cursor-pointer items-start gap-2"
                                  >
                                    <input
                                      type="checkbox"
                                      className="mt-0.5"
                                      disabled={designSyncing || course?.published}
                                      checked={item.proposed_methods.includes(method.id)}
                                      onChange={(event) =>
                                        void updateSavedMethods(
                                          item.lesson_key,
                                          event.target.checked
                                            ? [...item.proposed_methods, method.id]
                                            : item.proposed_methods.filter(
                                                (value) => value !== method.id,
                                              ),
                                        )
                                      }
                                    />
                                    <span>{method.label}</span>
                                  </label>
                                ))}
                              </div>
                              {item.ai_rationale && (
                                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                                  <strong>AI explanation:</strong> {item.ai_rationale}
                                </p>
                              )}
                              <p className="mt-2 text-muted-foreground">
                                Teaching methods can be changed here. To generate lesson content,
                                analyse the original source manual on this device.
                              </p>
                              {!course?.published && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    designSyncing ||
                                    (item.review_status !== "approved" &&
                                      !item.proposed_methods.length)
                                  }
                                  onClick={() =>
                                    void updateSavedApproval(
                                      item.lesson_key,
                                      item.review_status !== "approved",
                                    )
                                  }
                                >
                                  {item.review_status === "approved"
                                    ? "Reopen approval"
                                    : "Approve saved design"}
                                </Button>
                              )}
                            </details>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {factoryStep === 1 &&
                    (draft ? (
                      <div className="space-y-5">
                        <div className="flex flex-wrap items-end gap-3 border-b border-border pb-4">
                          <label className="space-y-1 text-xs font-medium">
                            <span className="block">First content page</span>
                            <Input
                              type="number"
                              min={1}
                              max={sourcePages?.at(-1)?.page ?? 500}
                              value={firstContentPage}
                              aria-label="First content page"
                              className="w-24"
                              disabled={course.published}
                              onChange={(event) =>
                                setFirstContentPage(Math.max(1, Number(event.target.value) || 1))
                              }
                            />
                          </label>
                          <Button
                            variant="outline"
                            disabled={course.published || !sourceText.trim()}
                            onClick={async () => {
                              if (
                                await confirm({
                                  title: "Rebuild the outline?",
                                  description:
                                    "This replaces your outline edits and approvals. Your original source and saved course lessons stay unchanged.",
                                  confirmLabel: "Rebuild outline",
                                })
                              )
                                previewSource();
                            }}
                          >
                            Rebuild outline
                          </Button>
                        </div>
                        <ManualLessonReview
                          draft={draft}
                          readOnly={course.published}
                          busy={
                            designSyncing || designLoading !== null || batchRunning || aiLoading
                          }
                          methods={learningMethods}
                          choices={choicesFor}
                          approved={designApproved}
                          rationale={designRationale}
                          onEdit={(index, lesson) =>
                            reviseOutline(
                              draft.lessons.map((item, i) => (i === index ? lesson : item)),
                            )
                          }
                          onSplit={(index, paragraph, title) => {
                            const lesson = draft.lessons[index];
                            if (lesson)
                              reviseOutline(
                                draft.lessons.flatMap((item, i) =>
                                  i === index
                                    ? splitDraftLessonAt(lesson, paragraph, title)
                                    : [item],
                                ),
                              );
                          }}
                          onMerge={(index) => {
                            const first = draft.lessons[index];
                            const second = draft.lessons[index + 1];
                            if (first && second)
                              reviseOutline([
                                ...draft.lessons.slice(0, index),
                                mergeDraftLessons(first, second),
                                ...draft.lessons.slice(index + 2),
                              ]);
                          }}
                          onDelete={async (index) => {
                            if (
                              await confirm({
                                title: "Remove this lesson from the outline?",
                                description:
                                  "The original manual and saved course lessons will not be deleted.",
                                confirmLabel: "Remove lesson",
                                tone: "danger",
                              })
                            )
                              reviseOutline(draft.lessons.filter((_, i) => i !== index));
                          }}
                          onMethods={(index, methods) => void saveDesignSelection(index, methods)}
                          onApprove={(index, lesson) => void toggleDesignApproval(index, lesson)}
                          onPropose={(index, lesson) => void proposeDesign(index, lesson)}
                          activity={(method, lesson) => (
                            <SourceActivity
                              method={method}
                              lesson={lesson}
                              courseId={id}
                              published={course.published}
                            />
                          )}
                        />
                        <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
                          <Button variant="outline" onClick={() => setFactoryStep(0)}>
                            Back to upload
                          </Button>
                          <Button
                            disabled={!draft.lessons.length}
                            onClick={() => setFactoryStep(2)}
                          >
                            Continue to generation
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="py-6 text-sm text-muted-foreground">
                        Upload a manual to review its lessons.
                      </p>
                    ))}

                  {factoryStep === 2 &&
                    (draft ? (
                      <div className="space-y-3">
                        <div className="space-y-2 rounded-xl border border-border bg-background p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              disabled={batchRunning || aiLoading || !!course.published}
                              onClick={generateBatch}
                            >
                              {batchRunning ? "Working…" : "Generate batch (up to 5 lessons)"}
                            </Button>
                            {batchProgress && (
                              <p className="text-xs text-muted-foreground">{batchProgress}</p>
                            )}
                            {batchDrafts.length > 0 && (
                              <Button
                                type="button"
                                size="sm"
                                disabled={batchRunning || aiLoading}
                                onClick={saveBatchDrafts}
                              >
                                Save {batchDrafts.length} batch drafts
                              </Button>
                            )}
                          </div>
                          {batchDrafts.map((item, i) => (
                            <div key={i} className="rounded-lg border border-border p-2 text-xs">
                              <p className="font-medium">
                                {item.lessonTitle} — {item.questions.length} quiz questions
                              </p>
                              <p className="text-muted-foreground">{item.sourceRefs}</p>
                              <p className="mt-1 whitespace-pre-wrap">{item.lessonSummary}</p>
                              {item.questions.map((q, j) => (
                                <p key={j} className="mt-1">
                                  Q: {q.question} — source: {q.sourceQuote}
                                </p>
                              ))}
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            disabled={
                              aiLoading ||
                              !draft.lessons.length ||
                              !!course.published ||
                              (draft.lessons[0]?.body.length ?? 0) < 100
                            }
                            onClick={generateAiDraft}
                          >
                            {aiLoading
                              ? "Generating…"
                              : "Generate AI lesson and quiz preview (first lesson)"}
                          </Button>
                          {aiDraft && (
                            <div className="space-y-2 rounded-lg border border-border p-3 text-xs">
                              <p className="font-semibold">
                                AI draft — verify against your manual before using
                              </p>
                              <p className="font-medium">{aiDraft.lessonTitle}</p>
                              <FormattedLesson content={aiDraft.lessonSummary} />
                              {aiDraft.questions.map((q, i) => (
                                <div key={i} className="space-y-1 border-t border-border pt-2">
                                  <p className="font-medium">
                                    {i + 1}. {q.question}
                                  </p>
                                  {q.options.map((option, j) => (
                                    <p key={j}>
                                      {j === q.correctIndex ? "✓ " : "○ "}
                                      {option}
                                    </p>
                                  ))}
                                  <p className="italic text-muted-foreground">
                                    Source quote: {q.sourceQuote}
                                  </p>
                                </div>
                              ))}
                              {!!aiDraft.droppedUnsupportedQuestions && (
                                <p>
                                  {aiDraft.droppedUnsupportedQuestions} question(s) removed because
                                  their source quotes were not found.
                                </p>
                              )}
                              <p className="text-muted-foreground">
                                Review all answers and citations. Saving does not publish the
                                course.
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                disabled={
                                  aiLoading || !aiDraft.questions.length || !!course.published
                                }
                                onClick={saveAiDraft}
                              >
                                Save AI lesson and quiz as drafts
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="space-y-2 rounded-xl border border-border bg-background p-4">
                          <h3 className="text-sm font-medium">Suggested knowledge checks</h3>
                          <p className="text-xs text-muted-foreground">
                            These are source-based question prompts, not AI-generated
                            multiple-choice quizzes. Review the suggested answer and create verified
                            options using the Quiz editor in each lesson.
                          </p>
                          {suggestReviewQuestions(draft, 8).map((item, i) => (
                            <div key={i} className="rounded-lg border border-border p-2 text-xs">
                              <p className="font-medium">{item.question}</p>
                              <p className="mt-1 text-muted-foreground">
                                Source answer: {item.suggestedAnswer}
                              </p>
                              <p className="mt-1 text-muted-foreground">
                                {item.sourceId}, page {item.page}
                              </p>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between border-t border-border pt-3">
                          <Button variant="outline" onClick={() => setFactoryStep(1)}>
                            Back: Review & approve
                          </Button>
                          <label className="flex flex-wrap items-center gap-2 text-sm">
                            Import as
                            <select
                              className="rounded-md border border-input bg-background px-2 py-1"
                              value={manualFormat}
                              disabled={importing || !!course.published}
                              onChange={(event) =>
                                setManualFormat(
                                  event.target.value === "slide" ? "slide" : "reading",
                                )
                              }
                            >
                              <option value="reading">Reading lessons</option>
                              <option value="slide">Interactive slides</option>
                            </select>
                          </label>
                          <Button
                            type="button"
                            onClick={importDraft}
                            disabled={!draft.lessons.length || importing || !!course.published}
                          >
                            {importing ? "Importing…" : "Add draft lessons to course"}
                          </Button>
                        </div>
                        {course.published && (
                          <p className="text-xs text-destructive">
                            Unpublish the course before importing draft material.
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        Upload or paste a source manual and analyse it first.
                      </p>
                    ))}
                </section>
              </div>
            )}
            {screen === "performance" && (
              <div className="min-w-0 space-y-6">
                <CourseAnalytics courseId={id} />
              </div>
            )}
            {screen === "publish" && (
              <div className="min-w-0 space-y-6">
                <div className="grid min-w-0 items-stretch gap-6 lg:grid-cols-2">
                  <section className="flex h-full flex-col space-y-2 border-b border-border pb-6">
                    <h2 className="font-semibold">Publish v1.{course.version_number - 1}</h2>
                    {!course.published && (
                      <Textarea
                        aria-label="Version change note"
                        value={changeNote}
                        onChange={(e) => setChangeNote(e.target.value)}
                        placeholder="What changed in this version?"
                        maxLength={1000}
                      />
                    )}
                    <ul className="space-y-2">
                      {readiness.map((item) => (
                        <li key={item.label} className="flex items-center gap-2 text-xs">
                          <Check
                            className={
                              item.ready ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"
                            }
                          />
                          {item.label}
                        </li>
                      ))}
                    </ul>
                    {!course.published && pendingReviewCount > 0 && (
                      <div className="space-y-2 border-l-2 border-primary py-2 pl-3">
                        <p className="text-sm text-muted-foreground">
                          {pendingReviewCount} imported lessons awaiting your review.
                        </p>
                        <Button
                          variant="outline"
                          disabled={reviewingLessons}
                          onClick={markAllReviewed}
                        >
                          <Check className="h-4 w-4" />
                          {reviewingLessons ? "Saving review…" : "Mark all lessons as reviewed"}
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Course details, modules and lesson content are checked automatically before
                      this is allowed.
                    </p>
                    {course.published ? (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setPublished(false)}
                      >
                        Unpublish
                      </Button>
                    ) : (
                      <Button
                        className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                        disabled={!readyToPublish || reviewingLessons}
                        onClick={() => setPublished(true)}
                      >
                        Publish to catalogue
                      </Button>
                    )}
                    {!readyToPublish && !course.published && (
                      <p className="text-xs text-muted-foreground">
                        Finish the course title, description, industry/topic, and add at least one
                        lesson with every imported lesson reviewed, to enable publishing.
                      </p>
                    )}
                    <Button
                      variant="ghost"
                      className="mt-2 w-full text-destructive"
                      onClick={remove}
                      disabled={deleting || course.published}
                    >
                      <Trash2 className="h-4 w-4" />
                      {deleting ? "Deleting…" : "Delete course"}
                    </Button>
                  </section>
                  <aside className="flex h-full flex-col space-y-3 border-b border-border pb-6">
                    <h2 className="font-semibold">Trainer review</h2>
                    <p className="text-sm text-muted-foreground">
                      Check the source evidence, lesson content and assessments before publishing.
                    </p>
                    <div className="rounded-lg bg-muted/40 p-3 text-xs">
                      <p className="font-medium">AI learning design</p>
                      <p className="mt-1 text-muted-foreground">
                        Proposed teaching and assessment methods with trainer approval are planned,
                        not yet active.
                      </p>
                    </div>
                    <Link
                      to="/class/$id"
                      params={{ id }}
                      className="inline-flex items-center gap-2 text-sm font-medium text-primary"
                    >
                      <Eye className="h-4 w-4" />
                      Preview as learner
                    </Link>
                  </aside>
                </div>
              </div>
            )}
            {![
              "overview",
              "performance",
              "publish",
              "import",
              "history",
              "lesson",
              "content",
            ].includes(screen) &&
              (() => {
                const moduleIndex = modules.findIndex((m) => m.key === screen);
                const mod = modules[moduleIndex];
                if (!mod)
                  return (
                    <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      Module not found.{" "}
                      <button
                        type="button"
                        className="font-medium text-primary"
                        onClick={() => setScreen("overview")}
                      >
                        Back to Overview
                      </button>
                    </p>
                  );
                const dGroup = draftGroupFor(mod.title);
                const videoLessons = mod.lessons.filter((l) => l.kind === "video");
                const quizLessons = mod.lessons.filter((l) => l.kind === "quiz");
                const goToModule = (index: number) => {
                  const next = modules[index];
                  setScreen(next ? next.key : "overview");
                };
                return (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="font-semibold">{mod.title}</h2>
                        <p className="text-xs text-muted-foreground">
                          {mod.lessons.length} lesson{mod.lessons.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setScreen("overview")}>
                        <LayoutGrid className="h-4 w-4" />
                        Overview
                      </Button>
                    </div>
                    <Tabs defaultValue="lessons">
                      <TabsList className="flex-wrap">
                        <TabsTrigger value="lessons">Lessons</TabsTrigger>
                        <TabsTrigger value="content">Content</TabsTrigger>
                        <TabsTrigger value="media">Media</TabsTrigger>
                        <TabsTrigger value="activities">Activities</TabsTrigger>
                        <TabsTrigger value="assessment">Assessment</TabsTrigger>
                      </TabsList>
                      <TabsContent value="lessons" className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground"></p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => addLesson("video", mod.moduleId)}
                            >
                              <Video className="h-4 w-4" />
                              Video
                            </Button>
                            <VideoLibraryPicker
                              courseId={id}
                              position={lessons?.length ?? 0}
                              usedItemIds={videoLinks.map((v) => v.item_id)}
                              onAdded={() => {
                                refresh();
                                void refetchLinks();
                              }}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => addLesson("reading", mod.moduleId)}
                            >
                              <FileText className="h-4 w-4" />
                              Reading
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => addLesson("quiz", mod.moduleId)}
                            >
                              <HelpCircle className="h-4 w-4" />
                              Quiz
                            </Button>
                          </div>
                        </div>
                        {mod.lessons.map((l) => (
                          <Button
                            key={l.id}
                            variant="outline"
                            className="h-auto w-full justify-start whitespace-normal text-left"
                            onClick={() => {
                              setSelectedLesson(l.id);
                              setScreen("lesson");
                            }}
                          >
                            {l.title}
                            <FileText className="ml-auto h-4 w-4 shrink-0" />
                          </Button>
                        ))}
                        {mod.lessons.length === 0 && (
                          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                            Add this module's first video, reading or quiz.
                          </p>
                        )}
                      </TabsContent>
                      <TabsContent value="content" className="space-y-3">
                        {dGroup ? (
                          <>
                            <div className="space-y-3 rounded-xl border border-border bg-background p-4">
                              <h3 className="font-semibold">AI learning design review</h3>
                              <p className="text-xs text-muted-foreground">
                                Suggested teaching and assessment methods are based on topic
                                keywords. Approve or adjust each lesson before content generation.
                              </p>
                              {dGroup.items.map(({ lesson, index: i }) => (
                                <details key={i} className="rounded-lg border border-border p-3">
                                  <summary className="cursor-pointer text-sm font-medium">
                                    {lesson.title}{" "}
                                    {designApproved[i] ? "✓ Approved" : "· Needs review"}
                                  </summary>
                                  <div className="mt-3 space-y-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={
                                        designLoading !== null ||
                                        lesson.body.length < 100 ||
                                        !!course.published
                                      }
                                      onClick={() => void proposeDesign(i, lesson)}
                                    >
                                      {designLoading === i
                                        ? "Designing…"
                                        : "Ask AI to propose methods"}
                                    </Button>
                                    {designRationale[i] && (
                                      <p className="rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                                        <strong>AI rationale:</strong> {designRationale[i]}
                                      </p>
                                    )}
                                    {learningMethods.map((method) => (
                                      <label
                                        key={method.id}
                                        className="flex items-start gap-2 text-sm"
                                      >
                                        <input
                                          type="checkbox"
                                          className="mt-1"
                                          checked={choicesFor(
                                            i,
                                            lesson.title,
                                            lesson.body,
                                          ).includes(method.id)}
                                          disabled={designSyncing}
                                          onChange={(e) =>
                                            void saveDesignSelection(
                                              i,
                                              e.target.checked
                                                ? [
                                                    ...choicesFor(i, lesson.title, lesson.body),
                                                    method.id,
                                                  ]
                                                : choicesFor(i, lesson.title, lesson.body).filter(
                                                    (x) => x !== method.id,
                                                  ),
                                            )
                                          }
                                        />
                                        <span>
                                          <span className="font-medium">{method.label}</span>
                                          <span className="block text-xs text-muted-foreground">
                                            {method.detail}
                                          </span>
                                        </span>
                                      </label>
                                    ))}
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={designApproved[i] ? "secondary" : "outline"}
                                      disabled={
                                        designSyncing ||
                                        !choicesFor(i, lesson.title, lesson.body).length
                                      }
                                      onClick={() => void toggleDesignApproval(i, lesson)}
                                    >
                                      {designApproved[i]
                                        ? "Reopen review"
                                        : "Approve lesson design"}
                                    </Button>
                                  </div>
                                </details>
                              ))}
                            </div>
                            <div className="space-y-2 rounded-xl border border-border bg-background p-4">
                              <h3 className="font-semibold">Source sections</h3>
                              {dGroup.items.map(({ lesson, index: i }) => (
                                <details
                                  key={i}
                                  className="rounded-lg border border-border bg-muted/20 p-3"
                                >
                                  <summary className="cursor-pointer text-sm font-medium">
                                    {lesson.title}{" "}
                                    <span className="text-xs font-normal text-muted-foreground">
                                      · {lesson.sourceRefs.length} source pages
                                    </span>
                                  </summary>
                                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                                    {lesson.body.slice(0, 2500)}
                                    {lesson.body.length > 2500 ? "…" : ""}
                                  </p>
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Source:{" "}
                                    {lesson.sourceRefs
                                      .map((ref) => `${ref.sourceId} p.${ref.page}`)
                                      .join(", ")}
                                  </p>
                                </details>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                            No AI draft content loaded for this module. Import a source manual from
                            Overview to review it here.
                          </p>
                        )}
                      </TabsContent>
                      <TabsContent value="media" className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => addLesson("video", mod.moduleId)}
                          >
                            <Video className="h-4 w-4" />
                            Add video lesson
                          </Button>
                          <VideoLibraryPicker
                            courseId={id}
                            position={lessons?.length ?? 0}
                            usedItemIds={videoLinks.map((v) => v.item_id)}
                            onAdded={() => {
                              refresh();
                              void refetchLinks();
                            }}
                          />
                        </div>
                        {videoLessons.length ? (
                          <ul className="space-y-2">
                            {videoLessons.map((l) => {
                              const link = videoLinks.find((v) => v.lesson_id === l.id);
                              return (
                                <li
                                  key={l.id}
                                  className="rounded-xl border border-border p-3 text-sm"
                                >
                                  <p className="font-medium">{l.title}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {link
                                      ? `Library video · ${link.item?.title ?? ""}`
                                      : l.video_url || "No video link set yet"}
                                  </p>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                            No video lessons in this module yet.
                          </p>
                        )}
                      </TabsContent>
                      <TabsContent value="activities" className="space-y-3">
                        {dGroup ? (
                          <div className="space-y-3 rounded-xl border border-border bg-background p-4">
                            <h3 className="font-semibold">Learning activity storyboard</h3>
                            <p className="text-xs text-muted-foreground">
                              Preview the mix of presentation and assessment methods. These are
                              activity plans, not generated videos, images or quizzes.
                            </p>
                            {dGroup.items.map(({ lesson, index }) => (
                              <details key={index} className="rounded-lg border border-border p-3">
                                <summary className="cursor-pointer text-sm font-medium">
                                  {lesson.title} ·{" "}
                                  {designApproved[index]
                                    ? "Approved design"
                                    : "Pending design approval"}
                                </summary>
                                <div className="mt-3 space-y-2">
                                  <div className="rounded-lg bg-muted/40 p-3 text-sm">
                                    <strong>1. Lesson introduction</strong>
                                    <p className="text-xs text-muted-foreground">
                                      Introduce the learning objective and connect it to the
                                      original manual.
                                    </p>
                                  </div>
                                  {choicesFor(index, lesson.title, lesson.body).map(
                                    (method, methodIndex) => (
                                      <div
                                        key={method}
                                        className="rounded-lg bg-muted/40 p-3 text-sm"
                                      >
                                        <strong>
                                          {methodIndex + 2}.{" "}
                                          {activityLabels[method]?.title ?? method}
                                        </strong>
                                        <p className="text-xs text-muted-foreground">
                                          {activityLabels[method]?.description ??
                                            "Trainer review required."}
                                        </p>
                                        <SourceActivity
                                          method={method}
                                          lesson={lesson}
                                          courseId={id}
                                          published={!!course.published}
                                        />
                                      </div>
                                    ),
                                  )}
                                  <p className="text-xs text-muted-foreground">
                                    Source:{" "}
                                    {lesson.sourceRefs
                                      .map((ref) => `${ref.sourceId} p.${ref.page}`)
                                      .join(", ")}
                                  </p>
                                </div>
                              </details>
                            ))}
                          </div>
                        ) : (
                          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                            No AI activity storyboard for this module yet. Import a source manual
                            from Overview to generate one.
                          </p>
                        )}
                      </TabsContent>
                      <TabsContent value="assessment" className="space-y-3">
                        {dGroup && (
                          <div className="space-y-2 rounded-xl border border-border bg-background p-4">
                            <h3 className="font-semibold">Suggested knowledge checks</h3>
                            <p className="text-xs text-muted-foreground">
                              These are source-based question prompts, not AI-generated
                              multiple-choice quizzes. Create verified questions using the Quiz
                              editor in the Lessons tab.
                            </p>
                            {suggestReviewQuestions(
                              {
                                title: draft?.title ?? "",
                                status: "draft",
                                warnings: [],
                                lessons: dGroup.items.map((i) => i.lesson),
                              },
                              8,
                            ).map((item, i) => (
                              <div key={i} className="rounded-lg border border-border p-2 text-xs">
                                <p className="font-medium">{item.question}</p>
                                <p className="mt-1 text-muted-foreground">
                                  Source answer: {item.suggestedAnswer}
                                </p>
                                <p className="mt-1 text-muted-foreground">
                                  {item.sourceId}, page {item.page}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="space-y-2">
                          <h3 className="text-sm font-semibold">Quiz lessons in this module</h3>
                          {quizLessons.length ? (
                            <ul className="space-y-1.5">
                              {quizLessons.map((l) => (
                                <li
                                  key={l.id}
                                  className="rounded-xl border border-border p-3 text-sm"
                                >
                                  <p className="font-medium">{l.title}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {Array.isArray(l.quiz) ? (l.quiz as unknown[]).length : 0}{" "}
                                    question
                                    {Array.isArray(l.quiz) && (l.quiz as unknown[]).length === 1
                                      ? ""
                                      : "s"}{" "}
                                    · edit in the Lessons tab
                                  </p>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                              No quiz lessons in this module yet. Add one from the Lessons tab.
                            </p>
                          )}
                        </div>
                      </TabsContent>
                    </Tabs>
                    <div className="flex justify-between">
                      <Button
                        variant="outline"
                        onClick={() =>
                          moduleIndex > 0 ? goToModule(moduleIndex - 1) : setScreen("overview")
                        }
                      >
                        <ChevronLeft className="h-4 w-4" />
                        {moduleIndex > 0 ? "Previous module" : "Overview"}
                      </Button>
                      <Button
                        onClick={() =>
                          moduleIndex < modules.length - 1
                            ? goToModule(moduleIndex + 1)
                            : setScreen("publish")
                        }
                      >
                        {moduleIndex < modules.length - 1 ? "Next module" : "Finish · Publish"}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })()}
          </main>
        </div>
      </Sheet>
    </Phone>
  );
}

function LessonEditor({
  lesson,
  index,
  onChange,
  courseId,
  sourceText,
  link,
  readOnly = false,
}: {
  lesson: LessonRow;
  index: number;
  onChange: () => void;
  courseId: string;
  sourceText: string;
  link?: VideoLink | undefined;
  readOnly?: boolean;
}) {
  const { user: lessonUser } = useAuth();
  const [objectives, setObjectives] = useState(link?.objectives ?? "");
  const [title, setTitle] = useState(lesson.title);
  const [video, setVideo] = useState(lesson.video_url ?? "");
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const uploadVideoFile = async (file: File) => {
    if (!lessonUser) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Choose a video file.");
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      toast.error("Video must be smaller than 500MB.");
      return;
    }
    setUploadingVideo(true);
    try {
      const path = `${lessonUser.id}/${courseId}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("lesson-videos")
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from("lesson-videos").getPublicUrl(path);
      setVideo(publicUrl);
      toast.success("Video uploaded. Save the lesson to keep it.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not upload the video."));
    } finally {
      setUploadingVideo(false);
    }
  };
  const [body, setBody] = useState(lesson.body);
  const [kind, setKind] = useState(lesson.kind);
  const [initialQuiz] = useState(lesson.quiz);
  const [qs, setQs] = useState<QuizDraftQuestion[]>([]);
  const [quizLoad, setQuizLoad] = useState<"loading" | "ready" | "failed">(
    lesson.kind === "quiz" ? "loading" : "ready",
  );
  const [passMark, setPassMark] = useState(() => parsePassMark(lesson.body));
  const [sampleSize, setSampleSize] = useState<number | null>(() => quizSampleSize(lesson.body));
  const [privateExam, setPrivateExam] = useState(() => privateQuizBankId(lesson.body) !== null);
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const baseline = useRef(
    JSON.stringify({
      title: lesson.title,
      video: lesson.video_url ?? "",
      body: lesson.body,
      kind: lesson.kind,
      qs,
      passMark,
      sampleSize,
      privateExam,
      objectives,
    }),
  );
  useEffect(() => {
    if (lesson.kind !== "quiz") return;
    let active = true;
    void (async () => {
      try {
        const bankId = privateQuizBankId(lesson.body);
        let questions = parseQuizQuestions(initialQuiz);
        let keys: unknown;
        if (bankId) {
          const { data, error } = await supabase.from("studio_exam_banks").select("questions,answers").eq("id", bankId).maybeSingle();
          if (error || !data) throw new Error("Private exam unavailable");
          questions = parseQuizQuestions(data.questions);
          keys = data.answers;
        } else {
          const { data, error } = await supabase.from("studio_quiz_answers").select("answers").eq("lesson_id", lesson.id).maybeSingle();
          if (error) throw error;
          keys = data?.answers;
        }
        if (!active) return;
        if (!questions) throw new Error("Quiz unavailable");
        const next = loadQuizDraft(questions, keys);
        baseline.current = JSON.stringify({ ...JSON.parse(baseline.current), qs: next });
        setQs(next);
        setQuizLoad("ready");
      } catch { if (active) setQuizLoad("failed"); }
    })();
    return () => {
      active = false;
    };
  }, [lesson.id, lesson.kind, initialQuiz]);
  const Icon =
    lesson.kind === "video"
      ? Video
      : lesson.kind === "quiz"
        ? HelpCircle
        : lesson.kind === "scorm"
          ? Package
          : FileText;
  const save = async (silent = false) => {
    if (readOnly || saving || quizLoad !== "ready") return;
    setSaving(true);
    try {
      if (video && !/^https:\/\//.test(video)) {
        if (!silent) toast.error("Video link must start with https://");
        return;
      }
      if (kind === "slide" && !parseLessonSlides(body).some((slide) => slide.blocks.length > 0)) {
        if (!silent) toast.error("Add teaching text or an activity to your slides before saving.");
        return;
      }
      let error;
      if (kind === "quiz") {
        let quiz: ReturnType<typeof buildQuiz>;
        try {
          quiz = buildQuiz(qs);
        } catch (err) {
          if (!silent && err instanceof Error) toast.error(err.message);
          return;
        }
        if (
          sampleSize !== null &&
          (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > qs.length)
        ) {
          if (!silent) toast.error("Choose a random sample size within the question pool.");
          return;
        }
        if (privateExam) {
          if (sampleSize === null) { if (!silent) toast.error("Choose a sample size for the private exam."); return; }
          ({ error } = await supabase.rpc("studio_save_private_quiz", { _lesson: lesson.id, _title: title, _pass_mark: passMark, _questions: quiz.questions, _answers: quiz.keys, _sample_size: sampleSize }));
        } else ({ error } = await supabase.rpc("studio_save_quiz_pool", {
          _lesson_id: lesson.id,
          _title: title,
          _pass_mark: passMark,
          _questions: quiz.questions,
          _answers: quiz.keys,
          _sample_size: sampleSize,
        }));
      } else {
        ({ error } = await supabase
          .from("studio_lessons")
          .update({ title, kind, video_url: video || null, body })
          .eq("id", lesson.id));
      }
      if (error) {
        if (!silent) toast.error("Could not save lesson.");
        return;
      }
      if (link) {
        const { error: e3 } = await supabase
          .from("course_external_content")
          .update({ objectives })
          .eq("id", link.id);
        if (e3) {
          if (!silent) toast.error("Could not save the learning objectives.");
          return;
        }
      }
      if (!silent) toast.success("Lesson saved");
      baseline.current = JSON.stringify({
        title,
        video,
        body,
        kind,
        qs,
        passMark,
        sampleSize,
        privateExam,
        objectives,
      });
      setSaved(true);
      onChange();
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    setSaved(
      baseline.current ===
        JSON.stringify({ title, video, body, kind, qs, passMark, sampleSize, privateExam, objectives }),
    );
  }, [title, video, body, kind, qs, passMark, sampleSize, privateExam, objectives]);
  const del = async () => {
    if (
      readOnly ||
      !(await confirm({
        tone: "danger",
        title: "Delete this lesson?",
        description: `“${lesson.title}” will be removed from this course. This cannot be undone.`,
        confirmLabel: "Delete lesson",
      }))
    )
      return;
    const { error } = await supabase.from("studio_lessons").delete().eq("id", lesson.id);
    if (error) {
      toast.error("We couldn't remove that lesson. Please try again.");
      return;
    }
    toast.success(
      link
        ? "Video removed from this course. It's still in the shared library."
        : "Lesson removed.",
    );
    onChange();
  };
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <Icon className="h-5 w-5 shrink-0 text-primary" />
        <h3 className="min-w-0 flex-1 break-words font-semibold">
          {index + 1}. {lesson.title}
        </h3>
        <span role="status" className="shrink-0 text-xs text-muted-foreground">
          {readOnly ? "Read-only" : saving ? "Saving…" : saved ? "Saved" : "Unsaved changes"}
        </span>
      </div>
      <fieldset disabled={readOnly || saving} className="space-y-4 p-4 md:p-6">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Lesson title"
          maxLength={120}
        />
        {link && (
          <div className="rounded-xl bg-primary/5 p-3 text-xs text-muted-foreground">
            Library video: <strong className="text-foreground">{link.item?.title}</strong> ·{" "}
            {link.item?.provider?.name}. Learners see the provider's player or a Watch Video button.
          </div>
        )}
        {link && (
          <Textarea
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Learning objectives, one per line"
            aria-label="Learning objectives"
          />
        )}
        {lesson.kind === "video" && !link && (
          <div className="space-y-2">
            <Input
              value={video}
              onChange={(e) => setVideo(e.target.value)}
              placeholder="Video link (https://… .mp4 or YouTube)"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={uploadingVideo}
                onClick={() => videoFileInputRef.current?.click()}
              >
                {uploadingVideo ? "Uploading…" : "Upload a video file"}
              </Button>
              <span className="text-xs text-muted-foreground">MP4, up to 500MB</span>
              <input
                ref={videoFileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadVideoFile(file);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        )}
        {lesson.kind === "scorm" && (
          <ScormPicker value={scormLessonRef(body)} onChange={(pid) => setBody(`scorm:${pid}`)} />
        )}
        {kind === "slide" && !readOnly && (
          <SlideEditor value={body} onChange={setBody} readOnly={false} />
        )}
        {kind !== "quiz" && kind !== "scorm" && kind !== "slide" && (
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            aria-label="Lesson notes"
            placeholder="Lesson notes, steps or checklist"
            maxLength={20000}
          />
        )}
        {kind === "reading" && !readOnly && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const { content, footer } = splitLessonSource(body);
              const next = formatManualAsSlides(content) + footer;
              if (next.length > 20000) {
                toast.error("Shorten the reading before converting it to slides.");
                return;
              }
              setBody(next);
              setKind("slide");
            }}
          >
            <LayoutGrid />
            Turn reading into slides
          </Button>
        )}
        {!readOnly && quizLoad === "ready" && kind !== "scorm" && kind !== "slide" && (
          <LessonAssistant
            courseId={courseId}
            title={title}
            kind={kind}
            text={kind === "quiz" ? sourceText : body}
            onText={setBody}
            onQuestions={(n) =>
              setQs((cur) =>
                [
                  ...cur.filter((q) => q.q.trim()),
                  ...n.map((question) => ({ ...question, kind: "choice" as const })),
                ].slice(0, 50),
              )
            }
          />
        )}
        {!readOnly &&
          quizLoad === "ready" &&
          kind !== "quiz" &&
          kind !== "scorm" &&
          kind !== "slide" && (
            <PolishButton courseId={courseId} title={title} text={body} onText={setBody} />
          )}
        {quizLoad !== "ready" && (
          <p role="status" className="text-sm text-muted-foreground">
            {quizLoad === "loading"
              ? "Loading questions and answer keys…"
              : "The quiz could not be loaded. Reopen the lesson to retry."}
          </p>
        )}
        {lesson.kind === "quiz" && quizLoad === "ready" && (
          <div className="space-y-3">
            <QuestionBank
              questions={qs}
              disabled={readOnly || saving}
              onAdd={(row) => setQs(appendBankQuestion(qs, row.question, row.answer))}
            />
            {qs.map((question, qi) => (
              <QuizQuestionEditor
                key={qi}
                question={question}
                index={qi}
                onChange={(next) =>
                  setQs((previous) => previous.map((item, i) => (i === qi ? next : item)))
                }
                onRemove={() => setQs((previous) => previous.filter((_, i) => i !== qi))}
              />
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={qs.length >= 50}
              onClick={() => setQs([...qs, newQuizQuestion("choice")])}
            >
              <Plus className="h-4 w-4" />
              Add question
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sampleSize !== null}
                disabled={readOnly || saving || privateExam || qs.length === 0}
                onChange={(e) =>
                  setSampleSize(e.target.checked ? Math.min(5, Math.max(1, qs.length)) : null)
                }
              />
              Draw a random selection for each attempt
            </label>
            {sampleSize !== null && (
              <label className="flex items-center gap-2 text-sm">
                Questions per attempt
                <Input
                  className="max-w-24"
                  aria-label="Random questions per attempt"
                  type="number"
                  min="1"
                  max={qs.length}
                  value={sampleSize}
                  disabled={readOnly || saving}
                  onChange={(e) => setSampleSize(Number(e.target.value))}
                />
              </label>
            )}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={privateExam} disabled={readOnly || saving || qs.length === 0} onChange={event => { setPrivateExam(event.target.checked); if (event.target.checked && sampleSize === null) setSampleSize(Math.min(5, Math.max(1, qs.length))); }} />Keep the complete question pool private</label>
            {privateExam && <p className="text-xs text-muted-foreground">Learners receive only the questions selected when starting an attempt. Each save creates a private bank version; active attempts keep their original selection. Questions seen in earlier public versions remain known. Authorized author exports include the complete questions and answers.</p>}
            {!privateExam && privateQuizBankId(lesson.body) && <p className="text-xs text-muted-foreground">Saving with pool privacy off places the full question pool in lesson content. Learners can read it once the course is published.</p>}
            {sampleSize !== null && (
              <p className="text-xs text-muted-foreground">
                The saved quiz questions form the pool (up to 50). Each learner gets a
                server-selected set and has four hours to finish. Editing this library or quiz later
                does not change an active attempt’s saved questions.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm">
              Pass mark
              <select
                value={passMark}
                onChange={(e) => setPassMark(Number(e.target.value))}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                aria-label="Pass mark"
              >
                {PASS_MARKS.map((m) => (
                  <option key={m} value={m}>
                    {m}%
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted-foreground">
              Learners need {passMark}% to pass. Each question is worth one point.
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={saving || readOnly || quizLoad !== "ready"}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save lesson"}
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={del}>
            {link ? "Remove from course" : "Delete"}
          </Button>
        </div>
      </fieldset>
      {kind === "slide" && readOnly && (
        <div className="px-4 pb-4 md:px-6 md:pb-6">
          <SlideEditor value={body} onChange={setBody} readOnly />
        </div>
      )}
    </div>
  );
}
