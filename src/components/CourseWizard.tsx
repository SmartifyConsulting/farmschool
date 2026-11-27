import { CourseDesignerWizard } from "@/components/CourseDesignerWizard";
import { CourseAssessmentConstraints } from "@/components/CourseAssessmentConstraints";
import { TrainingOutlinePreview } from "@/components/TrainingOutlinePreview";
import { CourseDesignReview } from "@/components/CourseDesignReview";
import {
  designerDefaults,
  topicsFromDesignPlan,
  type DesignerChoices,
  type CourseDesignPlan,
} from "@/lib/course-design-plan";
import { planCourseDesign } from "@/lib/course-design-plan.functions";
import { sourceUnits, type SourceUnit } from "@/lib/training-design";
import { createMaterialWorkspace } from "@/lib/studio-workspace";
import { detectContentFileType } from "@/lib/studio-content";
import { useAuth } from "@/hooks/useLearning";
import type { DesignReference } from "@/lib/design-reference";
import { LearningBlueprintSelector } from "@/components/LearningBlueprintSelector";
import { DEFAULT_COURSE_METHODOLOGY, LEARNING_BLUEPRINT_IDS } from "@/lib/course-methodology";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, FileUp, LoaderCircle, Save, Sparkles, Square, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  courseWizardInput,
  readWizardEvents,
  wizardDefaults,
  type CourseWizardDraft,
  type CourseWizardInput,
} from "@/lib/course-wizard";
import { saveWizardDraft } from "@/lib/course-wizard.functions";
import { extractDocument } from "@/lib/document-extraction";
import { estimateMinutes, formatMinutes } from "@/lib/duration-estimate";
import { PASS_MARKS } from "@/lib/studio";
import { friendlyError } from "@/lib/friendly-error";
import { useConfirm } from "@/components/ConfirmDialog";

export function CourseWizard() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState<CourseWizardInput>(wizardDefaults);
  const [draft, setDraft] = useState<CourseWizardDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const courseId = useRef<string | null>(null);
  const save = useServerFn(saveWizardDraft);
  const nav = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { user } = useAuth();
  const [designerOptions, setDesignerOptions] = useState<DesignerChoices>(designerDefaults);
  const [references, setReferences] = useState<DesignReference[]>([]);
  const [coursePlan, setCoursePlan] = useState<CourseDesignPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planUnits, setPlanUnits] = useState<SourceUnit[]>([]);
  const sourceFile = useRef<File | null>(null);
  const sourceSaved = useRef<{ id: string; registered: boolean } | null>(null);
  const runPlanner = useServerFn(planCourseDesign);
  const choices: DesignerChoices = {
    ...designerOptions,
    goal: input.topic,
    audience: input.audience,
    language: input.language,
    tone: input.tone,
    blueprint: input.learningBlueprint ?? DEFAULT_COURSE_METHODOLOGY,
    country: input.country ?? "",
    level: input.level,
    sourceFidelity: input.sourceFidelity ?? "",
    assessmentCriteria: input.rubricCriteria ?? [],
  };
  const changeChoices = (value: DesignerChoices) => {
    setDesignerOptions(value);
    setInput((old) => ({
      ...old,
      topic: value.goal,
      audience: value.audience,
      language: value.language,
      tone: value.tone,
      learningBlueprint: value.blueprint,
      lessonLength: value.depth === "Balanced" ? "Standard" : value.depth,
    }));
  };
  const planOutline = async () => {
    if (planning || busy || extracting || !user) return;
    setPlanning(true);
    setError("");
    try {
      if (sourceFile.current) {
        const file = sourceFile.current;
        const saved = sourceSaved.current ?? { id: crypto.randomUUID(), registered: false };
        sourceSaved.current = saved;
        if (!saved.registered) {
          const path =
            user.id +
            "/library/course-sources/" +
            saved.id +
            "/" +
            file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
          const upload = await supabase.storage.from("studio-content").upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
          if (upload.error) {
            const prior = await supabase.storage.from("studio-content").download(path);
            if (!prior.data) throw upload.error;
          }
          const inserted = await supabase.from("content_library_files" as never).upsert(
            {
              id: saved.id,
              author_id: user.id,
              file_name: file.name,
              original_file_name: file.name,
              file_type: detectContentFileType(file.name),
              storage_path: path,
              size_bytes: file.size,
              material_stage: "raw",
            } as never,
            { onConflict: "id", ignoreDuplicates: true },
          );
          if (inserted.error) throw inserted.error;
          saved.registered = true;
        }
        const files = await supabase
          .from("content_library_files" as never)
          .select("id,file_name" as never)
          .eq("id", saved.id)
          .single();
        if (files.error) throw files.error;
        const projectId = await createMaterialWorkspace(
          user.id,
          [{ id: saved.id, file_name: file.name }],
          {
            scope: "personal",
            folderId: null,
            designerChoices: choices,
            designReferences: references,
            sourceMode: "studio",
            autoPlan: true,
            ...(input.sourceFidelity ? { initialInstruction: input.sourceFidelity } : {}),
          },
        );
        await nav({
          to: "/studio/materials/$projectId",
          params: { projectId },
          search: { step: "setup", topic: "" },
        });
        setOpen(false);
        sourceFile.current = null;
        sourceSaved.current = null;
        setInput(wizardDefaults);
        return;
      }
      const units = sourceUnits(crypto.randomUUID(), "Course brief", [
        { page: 1, text: input.sourceText || choices.goal },
      ]);
      setPlanUnits(units);
      const plan = await runPlanner({
        data: {
          requestId: crypto.randomUUID(),
          sourceKind: input.sourceText ? "author-text" : "topic",
          maxLessons: 8,
          choices,
          units,
          designReferences: references,
        },
      });
      setCoursePlan(plan);
      setInput((old) => ({
        ...old,
        lessonCount: plan.modules.reduce((count, module) => count + module.lessons.length, 0),
        designPlan: plan,
        designerChoices: choices,
        designReferences: references,
      }));
    } catch (error) {
      setError(
        friendlyError(error, "Could not build the course outline. Your choices are retained."),
      );
    } finally {
      setPlanning(false);
    }
  };

  useEffect(() => () => controller.current?.abort(), []);

  const close = async () => {
    if (saving || planning) return;
    if (
      (busy || draft) &&
      !(await confirm({
        title: "Leave this course draft?",
        description:
          "This draft has not been saved. Leaving will discard it and stop any generation in progress.",
        confirmLabel: "Discard draft",
        cancelLabel: "Keep working",
      }))
    )
      return;
    controller.current?.abort();
    setOpen(false);
    setDraft(null);
    setReviewed(false);
    setError("");
  };
  const attachFile = async (file: File) => {
    setExtracting(true);
    setError("");
    try {
      const pages = await extractDocument(file);
      const sourceText = pages.map((p) => p.text).join("\n\n");
      if (!sourceText.trim()) {
        setError("Couldn't read any text from that file.");
        return;
      }
      if (sourceText.length > 1000000)
        throw Error(
          "This source exceeds 1,000,000 characters. Split it into related source documents.",
        );
      sourceFile.current = file;
      sourceSaved.current = null;
      setCoursePlan(null);
      setInput((prev) => ({
        ...prev,
        topic: prev.topic || "Create a concise training course from " + file.name,
        sourceText,
        sourceName: file.name,
      }));
    } catch (err) {
      setError(friendlyError(err, "Couldn't read that file. Try a PDF, DOCX, TXT or MD file."));
    } finally {
      setExtracting(false);
    }
  };
  const generate = async () => {
    const parsed = courseWizardInput.safeParse({
      ...input,
      rubricCriteria: input.rubricCriteria?.filter((c) => c.criterion.trim()),
    });
    if (!parsed.success) {
      setError("Enter a topic of at least 10 characters and complete the course settings.");
      return;
    }
    setBusy(true);
    setError("");
    setDraft(null);
    setReviewed(false);
    setProgress("Connecting to OpenAI…");
    setLog(["Connecting to OpenAI…"]);
    const abort = new AbortController();
    controller.current = abort;
    let received = false;
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Please sign in again to create a course.");
      const response = await fetch("/api/course-wizard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify(parsed.data),
        signal: abort.signal,
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        throw new Error(
          failure?.message ?? "The course could not be generated. Please try again later.",
        );
      }
      await readWizardEvents(response, (event) => {
        if (event.type === "progress") {
          setProgress(event.message);
          setLog((prev) => (prev.at(-1) === event.message ? prev : [...prev, event.message]));
        }
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "draft") {
          received = true;
          courseId.current = crypto.randomUUID();
          setDraft(event.draft);
          setLog((prev) => [
            ...prev,
            "Draft ready — review it below.",
            ...(event.draft.notes ?? []),
          ]);
        }
      });
      if (!received && !abort.signal.aborted)
        throw new Error("The draft was interrupted. Nothing has been saved.");
    } catch (err) {
      if (!abort.signal.aborted) {
        const message = friendlyError(
          err,
          "The draft could not be generated. Nothing has been saved.",
        );
        setError(message);
        setLog((prev) => [...prev, message]);
      } else setLog((prev) => [...prev, "Generation stopped. Nothing has been saved."]);
      setProgress("");
    } finally {
      if (controller.current === abort) {
        setBusy(false);
        controller.current = null;
      }
    }
  };
  const saveDraft = async () => {
    if (!draft || !courseId.current || !reviewed || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await save({ data: { courseId: courseId.current, input, draft } });
      await qc.invalidateQueries({ queryKey: ["studio-mine"] });
      toast.success("Your course draft is saved. It is not published.");
      setOpen(false);
      setDraft(null);
      await nav({ to: "/studio/$id", params: { id: result.id } });
    } catch (err) {
      setError(friendlyError(err, "Your draft could not be saved. Please try again."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4" />
        Create course
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) void close();
        }}
      >
        <DialogContent
          className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-lg p-5 sm:p-7"
          onInteractOutside={(event) => {
            if (busy || saving) event.preventDefault();
          }}
        >
          <DialogHeader className="pr-7 text-left">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {draft ? "Review your course draft" : "Create a course with AI"}
            </DialogTitle>
            <DialogDescription>
              {draft
                ? "Unpublished · trainer review required"
                : "Choose your goals, build an outline, then generate an editable course"}
            </DialogDescription>
          </DialogHeader>
          {!draft && (
            <div className="space-y-4">
              {!coursePlan ? (
                <CourseDesignerWizard
                  value={choices}
                  onChange={changeChoices}
                  references={references}
                  onReferencesChange={setReferences}
                  onPlan={() => void planOutline()}
                  busy={busy || planning || extracting}
                  error={error}
                  extraQuestions={{
                    0: (
                      <label className="block text-sm">
                        Level
                        <select
                          className="mt-1 w-full rounded-md border bg-background p-2"
                          value={input.level}
                          onChange={(event) =>
                            setInput((old) => ({
                              ...old,
                              level: event.target.value as CourseWizardInput["level"],
                            }))
                          }
                        >
                          {["Beginner", "Intermediate", "Advanced"].map((level) => (
                            <option key={level}>{level}</option>
                          ))}
                        </select>
                      </label>
                    ),
                    2: (
                      <label className="block text-sm">
                        Country / region (optional)
                        <Input
                          value={input.country ?? ""}
                          maxLength={100}
                          onChange={(event) =>
                            setInput((old) => ({ ...old, country: event.target.value }))
                          }
                        />
                      </label>
                    ),
                    4: (
                      <details className="space-y-3 rounded-lg border p-3">
                        <summary className="cursor-pointer text-sm font-medium">
                          Assessment and source constraints
                        </summary>
                        <label className="block text-sm">
                          Final quiz pass mark
                          <select
                            className="mt-1 w-full rounded-md border bg-background p-2"
                            value={input.passMark}
                            onChange={(event) =>
                              setInput((old) => ({ ...old, passMark: Number(event.target.value) }))
                            }
                          >
                            {PASS_MARKS.map((mark) => (
                              <option key={mark} value={mark}>
                                {mark}%
                              </option>
                            ))}
                          </select>
                        </label>
                        <CourseAssessmentConstraints
                          sourceFidelity={input.sourceFidelity ?? ""}
                          criteria={input.rubricCriteria ?? []}
                          onChange={(value) =>
                            setInput((old) => ({
                              ...old,
                              sourceFidelity: value.sourceFidelity,
                              rubricCriteria: value.criteria,
                            }))
                          }
                        />
                        <label className="flex gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={input.webSearch ?? false}
                            disabled={!!sourceFile.current}
                            onChange={(event) =>
                              setInput((old) => ({ ...old, webSearch: event.target.checked }))
                            }
                          />
                          Allow web research for a topic-based course
                        </label>
                      </details>
                    ),
                  }}
                  sourceSummary={
                    input.sourceName
                      ? "Source: " + input.sourceName
                      : "Create a course from your goal, or attach your factual source document."
                  }
                  sourceInput={
                    <div className="space-y-2 rounded-lg border p-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.pptx,.txt,.md"
                        className="sr-only"
                        aria-label="Attach source document"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void attachFile(file);
                          event.target.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={extracting || busy || planning}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <FileUp />
                        Attach source document
                      </Button>
                      <p className="supporting-text">
                        PDF, Word, PowerPoint or text. Design example files and images can be
                        attached in the Style and references step.
                      </p>
                      {input.sourceName && <p className="text-sm">{input.sourceName}</p>}
                    </div>
                  }
                />
              ) : (
                <>
                  <TrainingOutlinePreview
                    plan={coursePlan}
                    title={coursePlan.title}
                    introduction={coursePlan.introduction}
                    topics={topicsFromDesignPlan(coursePlan, choices, planUnits)}
                    units={planUnits}
                    onSelect={() => {}}
                  />
                  <CourseDesignReview plan={coursePlan} choices={choices} />
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="outline" disabled={busy} onClick={() => setCoursePlan(null)}>
                      Back to course choices
                    </Button>
                    <Button disabled={busy} onClick={() => void generate()}>
                      {busy ? "Generating…" : "Generate complete course"}
                    </Button>
                    <span role="status" className="supporting-text">
                      {progress}
                    </span>
                    {busy && (
                      <Button variant="outline" onClick={() => controller.current?.abort()}>
                        Stop
                      </Button>
                    )}
                  </div>
                  {error && (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {draft && (
            <div className="space-y-5">
              {log.length > 0 && (
                <details className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-foreground">
                    What the AI did ({log.length})
                  </summary>
                  <ol className="mt-2 space-y-1">
                    {log.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ol>
                </details>
              )}
              <div className="space-y-2">
                <Label htmlFor="wizard-title">Course title</Label>
                <Input
                  id="wizard-title"
                  value={draft.title}
                  maxLength={120}
                  disabled={saving}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-description">Description</Label>
                <Textarea
                  id="wizard-description"
                  value={draft.description}
                  maxLength={4000}
                  disabled={saving}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span>{draft.category}</span>
                <span>{input.level}</span>
                <span>{draft.lessons.length} readings + final quiz</span>
                <span>{input.passMark}% pass mark</span>
                <span title="A rough reading-time estimate, not a measured figure">
                  ~
                  {formatMinutes(
                    draft.lessons.reduce((total, l) => total + estimateMinutes(l.body), 0) +
                      estimateMinutes("", draft.quiz.questions.length),
                  )}{" "}
                  total
                </span>
              </div>
              <div className="divide-y divide-border border-y border-border">
                {draft.lessons.map((lesson, index) => (
                  <details key={index} className="py-3">
                    <summary className="cursor-pointer font-medium">
                      <BookOpen className="mr-2 inline h-4 w-4 text-primary" />
                      {index + 1}. {lesson.title}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        ~{formatMinutes(estimateMinutes(lesson.body))}
                      </span>
                    </summary>
                    <div className="mt-3 space-y-2">
                      <Input
                        aria-label={`Lesson ${index + 1} title`}
                        maxLength={120}
                        value={lesson.title}
                        disabled={saving}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            lessons: draft.lessons.map((l, i) =>
                              i === index ? { ...l, title: e.target.value } : l,
                            ),
                          })
                        }
                      />
                      <Textarea
                        aria-label={`Lesson ${index + 1} content`}
                        rows={12}
                        maxLength={20000}
                        value={lesson.body}
                        disabled={saving}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            lessons: draft.lessons.map((l, i) =>
                              i === index ? { ...l, body: e.target.value } : l,
                            ),
                          })
                        }
                      />
                    </div>
                  </details>
                ))}
                <details className="py-3">
                  <summary className="cursor-pointer font-medium">
                    {draft.quiz.title} · {draft.quiz.questions.length} questions
                  </summary>
                  <ol className="mt-3 space-y-4">
                    {draft.quiz.questions.map((q, i) => (
                      <li key={i}>
                        <p className="font-medium">
                          {i + 1}. {q.question}
                        </p>
                        <ul className="mt-2 space-y-1 text-sm">
                          {q.options.map((option, j) => (
                            <li
                              key={j}
                              className={`flex items-center gap-2 ${j === q.correctIndex ? "text-primary" : "text-muted-foreground"}`}
                            >
                              {j === q.correctIndex ? (
                                <Check className="h-4 w-4 shrink-0" />
                              ) : (
                                <span className="w-4 shrink-0" />
                              )}
                              {option}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                </details>
              </div>
              <Label className="flex items-start gap-3 text-sm leading-relaxed">
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={saving}
                  onChange={(e) => setReviewed(e.target.checked)}
                  className="mt-1 shrink-0 accent-primary"
                />
                I have reviewed the draft. I will check the facts and quiz answers before
                publishing.
              </Label>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button disabled={!reviewed || saving} onClick={() => void saveDraft()}>
                  {saving ? (
                    <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {saving ? "Saving…" : "Save draft & open editor"}
                </Button>
                <Button variant="outline" disabled={saving} onClick={() => void close()}>
                  Discard draft
                </Button>
              </div>
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
