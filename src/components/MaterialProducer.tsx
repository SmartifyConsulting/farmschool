import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link, useNavigate } from "@tanstack/react-router";
import { studioTrainingOutline } from "@/lib/studio-training-outline";
import { TrainingOutlinePreview } from "@/components/TrainingOutlinePreview";
import { createMaterialWorkspace } from "@/lib/studio-workspace";
import { learningBlueprint } from "@/lib/course-methodology";
import { LearningBlueprintSelector } from "@/components/LearningBlueprintSelector";
import { DesignReferenceAttachments } from "@/components/DesignReferenceAttachments";
import { designReferencesSchema, type DesignReference } from "@/lib/design-reference";
import { CourseDesignerWizard } from "@/components/CourseDesignerWizard";
import { CourseAssessmentConstraints } from "@/components/CourseAssessmentConstraints";
import { CourseDesignReview } from "@/components/CourseDesignReview";
import { planCourseDesign } from "@/lib/course-design-plan.functions";
import {
  courseDesignPlanSchema,
  designerChoicesSchema,
  designerDefaults,
  topicsFromDesignPlan,
  validateCourseDesignPlan,
  type CourseDesignPlan,
  type DesignerChoices,
} from "@/lib/course-design-plan";
import { StudioWorkspace, StudioSaveStatus } from "@/components/StudioWorkspace";
import { StudioSourceReference } from "@/components/StudioSourceReference";
import { useStudioAutosave } from "@/hooks/useStudioAutosave";
import { recoverableTrainingPackage } from "@/lib/training-workspace-recovery";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SectionTabsList, SectionTabsTrigger } from "@/components/SectionTabs";
import { BlockListEditor } from "@/components/BlockListEditor";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { extractDocument } from "@/lib/document-extraction";
import { parseLessonSlides } from "@/lib/lesson-slides";
import { friendlyError } from "@/lib/friendly-error";
import { rpcArgs } from "@/lib/rpc-args";
import type { LibraryFile } from "@/lib/library-materials";
import {
  generateTrainingTopic,
  generateTrainingIllustration,
} from "@/lib/training-design.functions";
import {
  initialOutline,
  sourceUnits,
  topicKey,
  outlineProblems,
  generationProblems,
  coverageProblems,
  TRAINING_TOOLS,
  TOOL_LABELS,
  packageSchema,
  type TrainingTopic,
  type SourceUnit,
  type TopicResult,
  type TrainingPackage,
} from "@/lib/training-design";
import { trainingHtml, readTrainingPackage } from "@/lib/training-html";
import { trainingLessonBody } from "@/lib/training-html";
import { portableMaterialText } from "@/lib/library-materials";
import { buildLessonScormZip } from "@/lib/scorm-export";
import { searchYouTubeVideo } from "@/lib/youtube-search.functions";
import { trainingGenerationPlan, runTrainingGeneration } from "@/lib/training-generation";
import { trainingImage } from "@/lib/training-image";
import { DRAFT_MATERIAL_PREFIX } from "@/lib/lesson-material-folders";
import { FOUNDATION_TRAINING_INSTRUCTION } from "@/lib/training-brief";

export function MaterialProducer({
  sources,
  folderId,
  initialBody,
  initialTitle,
  initialInstruction,
  initialSourceMode = "legacy",
  initialDesignReferences = [],
  initialDesignerChoices,
  initialAutoPlan = false,
  workspace,
  onClose,
  onSaved,
}: {
  sources: LibraryFile[];
  folderId: string | null;
  initialBody?: string | undefined;
  initialTitle?: string | undefined;
  initialInstruction?: string | undefined;
  initialSourceMode?: "studio" | "legacy";
  initialDesignReferences?: DesignReference[];
  initialDesignerChoices?: DesignerChoices | undefined;
  initialAutoPlan?: boolean;
  workspace?: {
    id: string;
    scope: "personal" | "admin";
    step: string;
    topic: string;
    navigate: (step: string, topic: string) => void;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [sourceMode, setSourceMode] = useState(initialSourceMode);
  const [sourceWarnings, setSourceWarnings] = useState<string[]>([]);
  const [outlineEditing, setOutlineEditing] = useState(false);
  const [introduction, setIntroduction] = useState("");
  const [designReferences, setDesignReferences] =
    useState<DesignReference[]>(initialDesignReferences);
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [designerChoices, setDesignerChoices] = useState<DesignerChoices>(
    initialDesignerChoices ?? designerDefaults,
  );
  const [designPlan, setDesignPlan] = useState<CourseDesignPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const planningInFlight = useRef(false);
  const [planningRequestId, setPlanningRequestId] = useState("");
  const [autoPlan, setAutoPlan] = useState(initialAutoPlan);
  const runPlan = useServerFn(planCourseDesign);
  const generate = useServerFn(generateTrainingTopic);
  const illustrate = useServerFn(generateTrainingIllustration);
  const findVideo = useServerFn(searchYouTubeVideo);
  const [includeImages, setIncludeImages] = useState(true);
  const [includeVideos, setIncludeVideos] = useState(true);
  const [title, setTitle] = useState(initialTitle ?? sources[0]!.file_name.replace(/\.[^.]+$/, ""));
  const [instruction, setInstruction] = useState(
    initialInstruction ?? FOUNDATION_TRAINING_INSTRUCTION,
  );
  const [units, setUnits] = useState<SourceUnit[]>([]);
  const [topics, setTopics] = useState<TrainingTopic[]>([]);
  const topicsRef = useRef(topics);
  topicsRef.current = topics;
  const [results, setResults] = useState<Record<string, TopicResult>>({});
  const cache = useRef<Record<string, TopicResult>>({});
  const [localSelected, setLocalSelected] = useState(0);
  const selected = workspace?.topic
    ? Math.max(
        0,
        topics.findIndex((topic) => topic.id === workspace.topic),
      )
    : localSelected;
  const [localStep, setLocalStep] = useState("outline");
  const step = workspace?.step ?? localStep;
  const selectStep = (next: string) => {
    if (next === "outline") setOutlineEditing(false);
    setLocalStep(next);
    workspace?.navigate(next, topics[selected]?.id ?? "");
  };
  const setSelected = (index: number) => {
    setOutlineEditing(true);
    setLocalSelected(index);
    workspace?.navigate(step, topics[index]?.id ?? "");
  };
  const [topicSearch, setTopicSearch] = useState("");
  const [bulkTopics, setBulkTopics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [progress, setProgress] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [blanks, setBlanks] = useState<string[]>([]);
  const [legacy, setLegacy] = useState(false);
  const [storedDraft, setStoredDraft] = useState<TrainingPackage | null>(null);
  const draftKey = `plusticity-training-draft:${user?.id ?? "signed-out"}:${sources
    .map((s) => s.id)
    .sort()
    .join(",")}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      setStoredDraft(raw ? packageSchema.parse(JSON.parse(raw)) : null);
    } catch {
      setStoredDraft(null);
    }
  }, [draftKey]);
  const stopped = useRef(false);
  const attempt = useRef<{
    key: string;
    id: string;
    path: string;
    blob: Blob;
    name: string;
  } | null>(null);
  const restoredPackage = useRef<TrainingPackage | null>(null);
  const resources =
    designPlan?.coverage
      .filter((item) => item.disposition === "resource")
      .flatMap((item) => {
        const unit = units.find((unit) => unit.id === item.unitId);
        return unit
          ? [
              {
                title: `${unit.file} · page ${unit.page}`.slice(0, 300),
                text: unit.text,
                reference: `${unit.file} · page ${unit.page}`,
              },
            ]
          : [];
      }) ?? [];
  const workspaceSnapshot = {
    kind: "material",
    title,
    sourceIds: sources.map((source) => source.id),
    scope: workspace?.scope ?? "personal",
    sourceMode,
    introduction,
    designReferences,
    folderId,
    package: {
      version: 1,
      title,
      instruction,
      topics,
      results,
      sourceMode,
      introduction,
      resources,
      ...(designPlan ? { designPlan, designerChoices } : {}),
    },
    includeImages,
    includeVideos,
    generationError,
    designerChoices,
    designPlan,
    planningRequestId,
    autoPlan,
  };
  const autosave = useStudioAutosave({
    id: workspace?.id ?? sources[0]!.id,
    userId: user?.id,
    enabled: !!workspace,
    canSave: !loading,
    state: workspaceSnapshot,
    restore: (snapshot) => {
      if (typeof snapshot["autoPlan"] === "boolean") setAutoPlan(snapshot["autoPlan"]);
      if (snapshot["designerChoices"])
        setDesignerChoices(designerChoicesSchema.parse(snapshot["designerChoices"]));
      if (snapshot["designPlan"])
        setDesignPlan(courseDesignPlanSchema.parse(snapshot["designPlan"]));
      if (typeof snapshot["planningRequestId"] === "string")
        setPlanningRequestId(snapshot["planningRequestId"]);
      if (typeof snapshot["generationError"] === "string")
        setGenerationError(snapshot["generationError"]);
      if (snapshot["designReferences"])
        setDesignReferences(designReferencesSchema.parse(snapshot["designReferences"]));
      if (snapshot["sourceMode"] === "studio" || snapshot["sourceMode"] === "legacy")
        setSourceMode(snapshot["sourceMode"]);
      if (typeof snapshot["introduction"] === "string") setIntroduction(snapshot["introduction"]);
      if (snapshot["package"]) {
        const restored = recoverableTrainingPackage.parse(snapshot["package"]);
        restoredPackage.current = restored;
        setTitle(restored.title);
        setInstruction(restored.instruction);
        setTopics(restored.topics);
        setResults(restored.results);
        cache.current = restored.results;
      }
      if (typeof snapshot["includeImages"] === "boolean")
        setIncludeImages(snapshot["includeImages"]);
      if (typeof snapshot["includeVideos"] === "boolean")
        setIncludeVideos(snapshot["includeVideos"]);
    },
  });
  useEffect(() => {
    if (!autosave.ready) return;
    let cancelled = false;
    void (async () => {
      try {
        const all: SourceUnit[] = [];
        const low: string[] = [];
        const studioTopics: TrainingTopic[] = [];
        const warnings: string[] = [];
        for (const file of sources) {
          if (file.size_bytes > 12 * 1024 * 1024)
            throw new Error("Each source must be 12 MB or smaller.");
          const download = await supabase.storage
            .from("studio-content")
            .download(file.storage_path);
          if (download.error || !download.data) throw new Error("A source could not be opened.");
          const pages = await extractDocument(new File([download.data], file.original_file_name));
          for (const page of pages)
            if (page.text.trim().length < 24) low.push(`${file.file_name}, page ${page.page}`);
          if (sourceMode === "studio") {
            const prepared = studioTrainingOutline(file.id, file.original_file_name, pages);
            all.push(...prepared.units);
            studioTopics.push(...prepared.topics);
            warnings.push(...prepared.warnings);
          } else all.push(...sourceUnits(file.id, file.original_file_name, pages));
        }
        if (!all.length || all.reduce((n, u) => n + u.text.length, 0) > 1000000)
          throw new Error("Choose readable sources totalling at most 1,000,000 characters.");
        const saved =
          restoredPackage.current ?? (initialBody ? readTrainingPackage(initialBody) : null);
        if (!cancelled) {
          setUnits(all);
          setBlanks(
            sourceMode === "studio"
              ? all
                  .filter((unit) => unit.text.trim().length < 24)
                  .map((unit) => `${unit.file}, page ${unit.page}`)
              : low,
          );
          setSourceWarnings(warnings);
          setTopics(
            saved?.topics ?? (sourceMode === "studio" ? studioTopics : initialOutline(all)),
          );
          setLegacy(!!initialBody && !saved);
          if (saved) {
            setTitle(saved.title);
            setIntroduction(saved.introduction ?? "");
            setInstruction(
              restoredPackage.current
                ? saved.instruction
                : (initialInstruction ?? saved.instruction),
            );
            setResults(saved.results);
            cache.current = saved.results;
          }
        }
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, "Could not read source pages."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      stopped.current = true;
    };
  }, [sources, initialBody, initialInstruction, autosave.ready, sourceMode]);
  const topic = topics[selected];
  const result = topic ? results[topic.id] : undefined;
  const pkg: TrainingPackage = {
    version: 1,
    title,
    instruction,
    topics,
    results,
    sourceMode,
    introduction,
    resources,
    ...(designPlan ? { designPlan, designerChoices } : {}),
  };
  const rebuildStudioOutline = async () => {
    if (!user || busy || autosave.status === "conflict") return;
    if (
      !(await confirm({
        title: "Create a version using Studio’s source cleanup?",
        description:
          "Your current outline, generated content and source files are retained in this version. A new private workspace will use Studio’s existing heading detection and front-matter filtering.",
        confirmLabel: "Create corrected version",
      }))
    )
      return;
    try {
      await autosave.flush();
      const projectId = await createMaterialWorkspace(user.id, sources, {
        scope: workspace?.scope ?? "personal",
        folderId,
        initialTitle: title,
        initialInstruction: instruction,
        sourceMode: "studio",
        designReferences,
        designerChoices,
      });
      await navigate({
        to: "/studio/materials/$projectId",
        params: { projectId },
        search: { step: "setup", topic: "" },
      });
    } catch (error) {
      toast.error(friendlyError(error, "Could not create the corrected version."));
    }
  };
  const problems = coverageProblems(
    topics,
    units,
    results,
    instruction,
    designPlan?.coverage
      .filter((item) => item.disposition === "resource")
      .map((item) => item.unitId),
  );
  if (blanks.length)
    problems.unshift("Replace or OCR pages with little readable text before completion.");
  const applyDesignPlan = (plan: CourseDesignPlan) => {
    const verified = validateCourseDesignPlan(plan, units);
    setDesignPlan(verified);
    setTopics(topicsFromDesignPlan(verified, designerChoices, units));
    setTitle(verified.title);
    setIntroduction(verified.introduction);
    setGenerationError("");
    setDirty(true);
    setOutlineEditing(false);
    selectStep("outline");
  };
  const buildAIOutline = async () => {
    if (planningInFlight.current || planning || busy || loading || !autosave.ready) return;
    if (sourceMode !== "studio" || Object.keys(cache.current).length) {
      await rebuildStudioOutline();
      return;
    }
    const parsed = designerChoicesSchema.safeParse(designerChoices);
    if (!parsed.success) {
      setGenerationError("Complete your course choices before planning.");
      return;
    }
    const requestId = crypto.randomUUID();
    planningInFlight.current = true;
    setPlanningRequestId(requestId);
    setPlanning(true);
    setAutoPlan(false);
    setGenerationError("");
    try {
      await autosave.checkpoint({
        ...workspaceSnapshot,
        planningRequestId: requestId,
        autoPlan: false,
      });
      const plan = await runPlan({
        data: { requestId, sourceKind: "library", choices: parsed.data, units, designReferences },
      });
      applyDesignPlan(plan);
    } catch (error) {
      setGenerationError(
        friendlyError(
          error,
          "The outline could not be planned. Your choices and sources are retained.",
        ),
      );
    } finally {
      planningInFlight.current = false;
      setPlanning(false);
    }
  };
  const buildAIOutlineRef = useRef(buildAIOutline);
  buildAIOutlineRef.current = buildAIOutline;
  const applyDesignPlanRef = useRef(applyDesignPlan);
  applyDesignPlanRef.current = applyDesignPlan;
  const planningUserId = user?.id;
  useEffect(() => {
    if (autoPlan && !loading && autosave.ready && !planning && !designPlan && units.length)
      void buildAIOutlineRef.current();
  }, [autoPlan, loading, autosave.ready, planning, designPlan, units.length]);
  useEffect(() => {
    if (
      !planningRequestId ||
      designPlan ||
      planning ||
      loading ||
      !autosave.ready ||
      !planningUserId
    )
      return;
    let cancelled = false;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recover = async () => {
      const file = await supabase.storage
        .from("studio-content")
        .download(`${planningUserId}/course-design-plans/${planningRequestId}.result.json`);
      if (cancelled) return;
      if (file.data) {
        try {
          const saved = JSON.parse(await file.data.text()) as {
            status: string;
            plan?: unknown;
            message?: string;
          };
          if (cancelled) return;
          if (saved.status === "complete") {
            applyDesignPlanRef.current(courseDesignPlanSchema.parse(saved.plan));
            return;
          }
          if (saved.status === "failed") {
            setGenerationError(saved.message || "Planning stopped. Your choices are retained.");
            return;
          }
        } catch {
          setGenerationError(
            "The saved outline could not be recovered. Your source material is retained.",
          );
          return;
        }
      }
      if (Date.now() - started > 180000) {
        setGenerationError(
          "The planning attempt has not returned a saved outline. Your choices and source files are retained; you can try a new planning attempt.",
        );
        return;
      }
      timer = setTimeout(() => void recover(), 5000);
    };
    void recover();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [planningRequestId, designPlan, planning, loading, autosave.ready, planningUserId]);
  const change = (patch: Partial<TrainingTopic>) => {
    if (patch.unitIds)
      patch.references = patch.unitIds.map((id) => {
        const u = units.find((unit) => unit.id === id);
        return u
          ? `${u.file} · page ${u.page} · section ${Number(u.id.split(":").at(-1)) + 1}`
          : "Missing source";
      });
    if (topic) {
      setTopics((old) => old.map((t) => (t.id === topic.id ? { ...t, ...patch } : t)));
      setDirty(true);
    }
  };
  const updateResult = (id: string, patch: Partial<TopicResult>) => {
    const next = { ...cache.current, [id]: { ...cache.current[id]!, ...patch } };
    cache.current = next;
    setResults(next);
    setDirty(true);
  };
  const close = async () => {
    if (busy || planning) return;
    if (workspace) {
      await autosave.flush();
      onClose();
      return;
    }
    if (
      dirty &&
      !(await confirm({
        title: "Discard unsaved training?",
        description:
          "Unsaved outline and slides will be lost. Original sources and existing outputs stay unchanged.",
        confirmLabel: "Discard unsaved work",
        cancelLabel: "Keep editing",
      }))
    )
      return;
    onClose();
  };
  const run = async (only?: string | string[]) => {
    if (busy || planning || referenceBusy || loading || error) return;
    if (sourceMode === "studio" && !designPlan) {
      selectStep("setup");
      setGenerationError("Build the AI course outline in the setup wizard first.");
      return;
    }
    if (!autosave.ready || autosave.loadError || autosave.status === "conflict") return;
    const issues = generationProblems(topics, units, only);
    if (issues.length) {
      setGenerationError(issues[0]!);
      toast.error(issues[0]);
      return;
    }
    const chosen = trainingGenerationPlan(
      topics,
      units,
      cache.current,
      instruction,
      { images: includeImages, videos: includeVideos },
      only,
    );
    if (!chosen.length) {
      toast.info("The selected slides and media are current. Existing attachments are kept.");
      return;
    }
    if (
      !(await confirm({
        title: `Generate ${chosen.length} topic${chosen.length === 1 ? "" : "s"}?`,
        description: `This plans ${chosen.filter((t) => t.slides).length} slide requests, ${chosen.filter((t) => t.image).length} image requests and up to ${chosen.filter((t) => t.video).length} video searches from your existing daily allowance. Image generation may incur normal AI charges. Existing slides and attachments are kept. Finished work is retained if a request fails. New media needs trainer review. Nothing is published.`,
        confirmLabel: "Generate slides and media",
      }))
    )
      return;
    stopped.current = false;
    setGenerationError("");
    setBusy(true);
    setDirty(true);
    try {
      const warnings = await runTrainingGeneration(chosen, {
        stopped: () => stopped.current,
        progress: setProgress,
        slides: async (t) => {
          const output = await generate({
            data: {
              title,
              instruction,
              designReferences,
              ...(designPlan
                ? {
                    designerChoices,
                    designGuidance: {
                      accessibility: designPlan.accessibility,
                      motivation: designPlan.motivation,
                      cognitiveLoad: designPlan.cognitiveLoad,
                      multimedia: designPlan.multimedia,
                    },
                  }
                : {}),
              topic: t,
              budget: Math.min(
                12000,
                Math.max(
                  1200,
                  Math.floor(75000 / topics.length),
                  Math.ceil(
                    units
                      .filter((u) => t.unitIds.includes(u.id))
                      .reduce((n, u) => n + u.text.length, 0) * 1.5,
                  ),
                ),
              ),
              units: units.filter((u) => t.unitIds.includes(u.id)),
            },
          });
          updateResult(t.id, {
            key: topicKey(t, units, instruction),
            body: output.body,
            reviewed: false,
          });
        },
        image: imageForTopic,
        video: (t) =>
          findVideo({ data: { query: `${t.title} ${t.objective} training`.slice(0, 120) } }),
        attach: (id, patch) => {
          topicsRef.current = topicsRef.current.map((t) => (t.id === id ? { ...t, ...patch } : t));
          setTopics(topicsRef.current);
        },
      });
      if (warnings.length) setGenerationError(warnings.join(" "));
    } catch (e) {
      const message = friendlyError(
        e,
        "Generation stopped. Finished topics are retained; retry remaining topics.",
      );
      setGenerationError(message);
      toast.error(message);
    } finally {
      if (Object.keys(cache.current).length)
        await save(true, { ...pkg, topics: topicsRef.current, results: cache.current });
      setBusy(false);
      setProgress("");
    }
  };
  const save = async (asDraft = false, backgroundSnapshot?: TrainingPackage) => {
    if (!user || (busy && !backgroundSnapshot) || (!asDraft && problems.length) || !title.trim())
      return;
    const snapshot = backgroundSnapshot ?? pkg;
    if (!backgroundSnapshot) setBusy(true);
    try {
      const key = JSON.stringify([snapshot, asDraft]);
      if (attempt.current?.key !== key) {
        const id = crypto.randomUUID();
        const name = (title.trim().replace(/[\\/:*?"<>|]/g, "-") || "Training") + ".html";
        attempt.current = {
          key,
          id,
          name,
          path: `${user.id}/library/produced/${id}/${name}`,
          blob: new Blob([trainingHtml(snapshot, asDraft)], { type: "text/html;charset=utf-8" }),
        };
      }
      const out = attempt.current!;
      const upload = await supabase.storage
        .from("studio-content")
        .upload(out.path, out.blob, { contentType: out.blob.type, upsert: true });
      if (upload.error) throw upload.error;
      const registered = await supabase.rpc(
        "content_library_register_produced" as never,
        rpcArgs("content_library_register_produced", {
          _file_id: out.id,
          _source_ids: sources.map((s) => s.id),
          _file_name: out.name,
          _file_type: "text",
          _storage_path: out.path,
          _size_bytes: out.blob.size,
          _description:
            `${asDraft ? DRAFT_MATERIAL_PREFIX : ""}HTML training: ${snapshot.topics.length} ${asDraft ? "draft" : "reviewed"} topics. Sources: ${sources.map((s) => s.file_name).join(", ")}`.slice(
              0,
              4000,
            ),
          _folder_id: folderId,
        }) as never,
      );
      if (registered.error) throw registered.error;
      if (registered.data !== out.id) throw new Error("Save not confirmed. Retry this output.");
      toast.success(
        asDraft
          ? "Draft saved beside its raw material. Original sources and earlier versions are preserved."
          : "Completed material saved beside its raw material. Original sources and earlier versions are preserved.",
      );
      if (!backgroundSnapshot) onSaved();
    } catch (e) {
      toast.error(friendlyError(e, "Could not confirm the save. Retry the same output."));
    } finally {
      if (!backgroundSnapshot) setBusy(false);
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([trainingHtml(pkg, problems.length > 0)], { type: "text/html" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = title.replace(/[^a-z0-9 -]/gi, "") + ".html";
    a.click();
    URL.revokeObjectURL(url);
  };
  const saveDraft = () => {
    try {
      const draft = packageSchema.parse(pkg);
      localStorage.setItem(draftKey, JSON.stringify(draft));
      setStoredDraft(draft);
      toast.success("Draft saved in this browser. Reopen Transform on these sources to resume.");
    } catch (e) {
      toast.error(
        friendlyError(
          e,
          "Complete the outline fields first, or download the HTML draft if browser storage is full.",
        ),
      );
    }
  };
  const resumeDraft = async () => {
    if (!storedDraft) return;
    if (
      dirty &&
      !(await confirm({
        title: "Resume the saved browser draft?",
        description:
          "Current unsaved edits will be replaced by the saved draft. Original sources and Completed files stay unchanged.",
        confirmLabel: "Resume draft",
      }))
    )
      return;
    setTitle(storedDraft.title);
    restoredPackage.current = storedDraft;
    setSourceMode(storedDraft.sourceMode ?? "legacy");
    setIntroduction(storedDraft.introduction ?? "");
    setInstruction(storedDraft.instruction);
    setTopics(storedDraft.topics);
    setResults(storedDraft.results);
    cache.current = storedDraft.results;
    setSelected(0);
    setDirty(true);
  };
  const importDraft = async (file: File) => {
    try {
      if (file.size > 16000000) throw new Error("Choose a training draft smaller than 16 MB.");
      const draft = readTrainingPackage(await file.text());
      if (!draft) throw new Error("Choose an HTML training draft downloaded from Plusticity.");
      const issues = outlineProblems(draft.topics, units);
      if (issues.length)
        throw new Error("This draft does not match the currently selected source files.");
      if (
        dirty &&
        !(await confirm({
          title: "Open this training draft?",
          description:
            "Current unsaved edits will be replaced. Original sources and Completed files stay unchanged.",
          confirmLabel: "Open draft",
        }))
      )
        return;
      setTitle(draft.title);
      restoredPackage.current = draft;
      setSourceMode(draft.sourceMode ?? "legacy");
      setIntroduction(draft.introduction ?? "");
      setInstruction(draft.instruction);
      setTopics(draft.topics);
      setResults(draft.results);
      cache.current = draft.results;
      setSelected(0);
      setDirty(true);
      setStoredDraft(draft);
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch (e) {
      toast.error(friendlyError(e, "Could not open the training draft."));
    }
  };
  const exportScorm = async () => {
    if (
      !(await confirm({
        title: "Export a SCORM text package?",
        description:
          "This export flattens interactive layouts to teaching text. Media-dependent material must stay in the HTML package. Test the SCORM package in its destination LMS.",
        confirmLabel: "Export SCORM text",
      }))
    )
      return;
    try {
      const text = portableMaterialText(trainingLessonBody(pkg));
      const zip = await buildLessonScormZip(
        title,
        { lessonTitle: title, lessonSummary: text, questions: [] },
        crypto.randomUUID(),
      );
      const url = URL.createObjectURL(
        new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "training-scorm.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(friendlyError(e, "This material needs the HTML export to preserve its content."));
    }
  };
  const move = (delta: number) => {
    if (!topic || selected + delta < 0 || selected + delta >= topics.length) return;
    const next = [...topics];
    [next[selected], next[selected + delta]] = [next[selected + delta]!, next[selected]!];
    setTopics(next);
    setLocalSelected(selected + delta);
    workspace?.navigate(step, topic.id);
    setDirty(true);
  };
  const uploadImage = async (file: File) => {
    try {
      const image = await trainingImage(file);
      change({ image, mediaReviewed: false });
    } catch (e) {
      toast.error(friendlyError(e, "Could not read the image."));
    }
  };
  const imageForTopic = async (t: TrainingTopic) => {
    const output = await illustrate({
      data: {
        sourceIds: sources.map((s) => s.id),
        caption: `${t.title}. ${t.objective}. ${t.mediaPlan}. Source context: ${units
          .filter((u) => t.unitIds.includes(u.id))
          .map((u) => u.text)
          .join(" ")}`.slice(0, 600),
      },
    });
    const bytes = Uint8Array.from(atob(output.base64), (c) => c.charCodeAt(0));
    return trainingImage(new File([bytes], "illustration.png", { type: "image/png" }));
  };
  const createIllustration = async () => {
    if (!topic || busy) return;
    if (
      !(await confirm({
        title: "Generate a training illustration?",
        description:
          "This uses one image request from your AI allowance. Review the illustration for accuracy before completing this topic.",
        confirmLabel: "Generate illustration",
      }))
    )
      return;
    setBusy(true);
    try {
      const image = await imageForTopic(topic);
      change({
        image,
        alt: `Illustration: ${topic.title}`,
        attribution: "AI-generated illustration — trainer review required",
        mediaReviewed: false,
      });
    } catch (e) {
      toast.error(friendlyError(e, "Could not generate the illustration."));
    } finally {
      setBusy(false);
    }
  };
  const reorderTopic = (from: number, to: number) => {
    if (busy || from === to || from < 0 || to < 0 || from >= topics.length || to >= topics.length)
      return;
    const next = [...topics];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    setTopics(next);
    setDirty(true);
    setLocalSelected(to);
    workspace?.navigate(step, moved!.id);
  };
  const outline = (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">
        {sourceMode === "studio" && !designPlan ? "Source map" : "Training outline"}
      </h2>
      <Input
        aria-label="Search training topics"
        placeholder="Find a topic"
        value={topicSearch}
        onChange={(event) => setTopicSearch(event.target.value)}
      />
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            setBulkTopics(
              topics
                .filter((t) =>
                  (t.module + " " + t.title).toLowerCase().includes(topicSearch.toLowerCase()),
                )
                .map((t) => t.id),
            )
          }
        >
          Select visible
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setBulkTopics([])}>
          Clear
        </Button>
      </div>
      {!!bulkTopics.length && (
        <Button
          size="sm"
          disabled={
            busy || !autosave.ready || !!autosave.loadError || autosave.status === "conflict"
          }
          onClick={() => void run(bulkTopics)}
        >
          Generate selected ({bulkTopics.length})
        </Button>
      )}
      <nav aria-label="Training outline" className="space-y-1">
        {topics
          .map((item, index) => ({ item, index }))
          .filter(({ item }) =>
            (item.module + " " + item.title).toLowerCase().includes(topicSearch.toLowerCase()),
          )
          .map(({ item, index }) => (
            <div
              key={item.id}
              className={
                "flex items-start gap-2 rounded-md border p-2 " +
                (selected === index ? "border-primary bg-primary/10" : "")
              }
              draggable={
                !busy && autosave.ready && !autosave.loadError && autosave.status !== "conflict"
              }
              onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                reorderTopic(
                  topics.findIndex((t) => t.id === event.dataTransfer.getData("text/plain")),
                  index,
                );
              }}
            >
              <input
                type="checkbox"
                aria-label={"Select topic " + item.title}
                checked={bulkTopics.includes(item.id)}
                onChange={(event) =>
                  setBulkTopics((old) =>
                    event.target.checked ? [...old, item.id] : old.filter((id) => id !== item.id),
                  )
                }
                className="mt-1"
              />
              <button
                type="button"
                aria-current={selected === index ? "step" : undefined}
                className="min-w-0 flex-1 break-words text-left text-sm"
                onClick={() => setSelected(index)}
              >
                {index + 1}. {item.title}
                <span className="supporting-text block text-muted-foreground">
                  {results[item.id]?.key === topicKey(item, units, instruction)
                    ? results[item.id]?.reviewed
                      ? "Reviewed"
                      : "Generated · Needs review"
                    : "Draft"}
                </span>
              </button>
            </div>
          ))}
      </nav>
      <p className="supporting-text text-muted-foreground">
        Drag topics to reorder. Move up/down controls are also available in Outline.
      </p>
    </div>
  );
  return (
    <StudioWorkspace
      title={title}
      onTitleChange={(value) => {
        setTitle(value);
        setDirty(true);
      }}
      locked={
        planning ||
        busy ||
        loading ||
        !autosave.ready ||
        !!autosave.loadError ||
        autosave.status === "conflict"
      }
      breadcrumb={
        <>
          <Link
            to={
              workspace?.scope === "admin" ? "/admin/external-content" : "/studio/content-library"
            }
          >
            Content Library
          </Link>{" "}
          / {title}
        </>
      }
      saveStatus={workspace ? <StudioSaveStatus autosave={autosave} /> : undefined}
      steps={[
        { id: "setup", label: "Course setup" },
        { id: "outline", label: "Outline" },
        { id: "slides", label: "Slides and media" },
        { id: "review", label: "Coverage review" },
        { id: "preview", label: "Preview" },
      ]}
      step={step}
      onStepChange={selectStep}
      outline={outline}
      source={
        <StudioSourceReference
          files={sources}
          page={units.find((unit) => topic?.unitIds.includes(unit.id))?.page ?? 1}
          text={units
            .filter((unit) => topic?.unitIds.includes(unit.id))
            .map((unit) => unit.text)
            .join("\n\n")}
        />
      }
      settings={
        <fieldset
          disabled={
            busy ||
            loading ||
            !autosave.ready ||
            !!autosave.loadError ||
            autosave.status === "conflict"
          }
          className="space-y-4"
        >
          <label className="block text-sm">
            Course introduction
            <Textarea
              value={introduction}
              maxLength={1000}
              onChange={(event) => setIntroduction(event.target.value)}
              placeholder="A short introduction learners will see in the course outline"
            />
          </label>
          <LearningBlueprintSelector
            value={
              topics.length && topics.every((topic) => topic.methodology === topics[0]?.methodology)
                ? (topics[0]?.methodology ?? "custom")
                : "custom"
            }
            onChange={async (value) => {
              const blueprint = learningBlueprint(value);
              if (
                blueprint &&
                !(await confirm({
                  title: "Apply " + blueprint.name + "?",
                  description:
                    "This changes the planned stages and recommended learning tools. Existing generated content is retained and becomes out of date until regenerated against the changed outline.",
                  confirmLabel: "Apply blueprint",
                }))
              )
                return;
              setTopics((old) =>
                old.map((topic) =>
                  blueprint
                    ? {
                        ...topic,
                        methodology: blueprint.id,
                        slides: blueprint.stages.length,
                        headings: blueprint.stages.map((stage) =>
                          (stage + ": " + topic.title).slice(0, 160),
                        ),
                        tools: blueprint.tools as TrainingTopic["tools"],
                      }
                    : { ...topic, methodology: "custom" },
                ),
              );
            }}
          />
          <label className="block text-sm">
            Training title
            <Input
              value={title}
              maxLength={200}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          <p className="supporting-text">
            {new Set(units.map((u) => `${u.sourceId}:${u.page}`)).size} readable source pages ·{" "}
            {topics.length} topics · {topics.reduce((n, t) => n + t.slides, 0)} planned slides. Edit
            or combine the page-based starter topics before generating.
          </p>
          <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="text-sm font-semibold">Include supporting media</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeImages}
                onChange={(e) => setIncludeImages(e.target.checked)}
              />
              Generate missing illustrations with AI
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeVideos}
                onChange={(e) => setIncludeVideos(e.target.checked)}
              />
              Find supporting YouTube videos
            </label>
            <p className="supporting-text text-muted-foreground">
              Generation fills missing media without replacing existing slides, images or videos.
              Each image and configured video search uses an additional allowance request. Videos
              are suggested sources, not verified teaching material.
            </p>
            <p className="supporting-text">
              Attached media: {topics.filter((t) => t.image).length} illustrations ·{" "}
              {topics.filter((t) => t.video).length} videos across {topics.length} topics.
            </p>
          </fieldset>
          {legacy && (
            <p role="status">
              The earlier output has no coverage outline and remains preserved in the Library.
              Create a new complete copy here.
            </p>
          )}
          {!!blanks.length && (
            <p role="alert">
              Little readable text: {blanks.join("; ")}. Replace or OCR these pages first.
            </p>
          )}
          <label className="block text-sm">
            Generation instructions
            <Textarea
              value={instruction}
              maxLength={1000}
              onChange={(e) => {
                setInstruction(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          <DesignReferenceAttachments
            value={designReferences}
            onChange={setDesignReferences}
            onBusyChange={setReferenceBusy}
          />
          <h2 className="text-sm font-semibold">Exports and recovery</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={download}>
              Download HTML {problems.length ? "draft" : "slides"}
            </Button>
            <Button variant="outline" onClick={saveDraft}>
              Save progress in this browser
            </Button>
            <Button variant="outline" disabled={!title.trim()} onClick={() => void save(true)}>
              Save Draft to Library
            </Button>
            <label className="block text-sm">
              Open downloaded HTML draft
              <Input
                type="file"
                accept=".html,text/html"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importDraft(file);
                  e.target.value = "";
                }}
              />
            </label>
            {storedDraft && (
              <Button variant="outline" onClick={() => void resumeDraft()}>
                Resume saved draft
              </Button>
            )}
            <Button
              variant="outline"
              disabled={!!problems.length}
              onClick={() => void exportScorm()}
            >
              Download SCORM text package
            </Button>
            <Button disabled={!!problems.length || !title.trim()} onClick={() => void save()}>
              Save Completed material
            </Button>
          </div>
          <Button variant="outline" onClick={() => void close()}>
            Back to Content Library
          </Button>
        </fieldset>
      }
      actions={
        <>
          <Button
            size="sm"
            disabled={
              busy ||
              referenceBusy ||
              loading ||
              !autosave.ready ||
              autosave.status === "conflict" ||
              !title.trim()
            }
            onClick={() => void run(bulkTopics.length ? bulkTopics : undefined)}
          >
            {bulkTopics.length ? `Generate selected (${bulkTopics.length})` : "Generate remaining"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={
              busy ||
              loading ||
              !autosave.ready ||
              !!autosave.loadError ||
              autosave.status === "conflict" ||
              !!problems.length
            }
            onClick={() => void save()}
          >
            Save Completed
          </Button>
        </>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span role={generationError ? "alert" : "status"}>
            {generationError ||
              progress ||
              `${topics.filter((t) => results[t.id]?.key === topicKey(t, units, instruction)).length}/${topics.length} topics generated · ${topics.filter((t) => results[t.id]?.key === topicKey(t, units, instruction) && results[t.id]?.reviewed).length} reviewed · ${problems.length ? problems.length + " completion checks remaining" : "Ready for Completed"}`}
          </span>
          {busy && progress && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                stopped.current = true;
                setProgress("Stopping after the current request…");
              }}
            >
              Stop after this request
            </Button>
          )}
        </div>
      }
    >
      {autosave.loadError ? (
        <p role="alert">{autosave.loadError}</p>
      ) : loading || !autosave.ready ? (
        <p role="status">Opening sources and saved working copy…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : (
        <fieldset disabled={busy || planning || autosave.status === "conflict"} className="min-w-0">
          <Tabs value={step} onValueChange={selectStep}>
            <TabsContent value="setup">
              <CourseDesignerWizard
                value={designerChoices}
                onChange={(value) => {
                  setDesignerChoices(value);
                  setDesignPlan(null);
                }}
                references={designReferences}
                onReferencesChange={setDesignReferences}
                onPlan={() => void buildAIOutline()}
                busy={planning || busy}
                error={generationError}
                extraQuestions={{
                  4: (
                    <CourseAssessmentConstraints
                      sourceFidelity={designerChoices.sourceFidelity ?? ""}
                      criteria={designerChoices.assessmentCriteria ?? []}
                      onChange={(value) =>
                        setDesignerChoices((old) => ({
                          ...old,
                          sourceFidelity: value.sourceFidelity,
                          assessmentCriteria: value.criteria,
                        }))
                      }
                    />
                  ),
                }}
                sourceSummary={`${sources.length} source file${sources.length === 1 ? "" : "s"} · ${units.length} cleaned source sections. The AI will consolidate these into a teaching outline; page count does not determine module count.`}
              />
            </TabsContent>
            <TabsContent value="outline" className="space-y-3">
              {sourceMode === "studio" && !designPlan && (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  <p className="supporting-text">
                    This is the cleaned source map. It has not yet been transformed into an
                    AI-designed course outline.
                  </p>
                  <Button onClick={() => selectStep("setup")}>Continue course setup</Button>
                </div>
              )}
              {sourceMode === "legacy" && (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  <p className="supporting-text">
                    This version uses the older page-based outline. Use Studio’s existing source
                    cleanup and chapter detection in a new version; this version stays preserved.
                  </p>
                  <Button variant="outline" onClick={() => void rebuildStudioOutline()}>
                    Rebuild with Studio outline
                  </Button>
                </div>
              )}
              {!!sourceWarnings.length && (
                <p className="supporting-text text-muted-foreground">
                  {[...new Set(sourceWarnings)].join(" ")}
                </p>
              )}
              {!outlineEditing && (
                <TrainingOutlinePreview
                  title={title}
                  introduction={introduction}
                  plan={designPlan}
                  topics={topics}
                  units={units}
                  onSelect={(id) => setSelected(topics.findIndex((topic) => topic.id === id))}
                />
              )}
              {outlineEditing && (
                <Button size="sm" variant="outline" onClick={() => setOutlineEditing(false)}>
                  Back to course outline
                </Button>
              )}
              <div hidden={!outlineEditing}>
                <div className="space-y-4">
                  {topic && (
                    <section className="space-y-3" aria-label="Selected topic outline">
                      <label className="block text-sm">
                        Heading 1 — module
                        <Input
                          value={topic.module}
                          maxLength={180}
                          onChange={(e) => change({ module: e.target.value })}
                        />
                      </label>
                      <label className="block text-sm">
                        Heading 2 — topic
                        <Input
                          value={topic.title}
                          maxLength={180}
                          onChange={(e) => change({ title: e.target.value })}
                        />
                      </label>
                      <label className="block text-sm">
                        Learning objective
                        <Textarea
                          value={topic.objective}
                          maxLength={500}
                          onChange={(e) => change({ objective: e.target.value })}
                        />
                      </label>
                      <label className="block text-sm">
                        Number of slides
                        <Input
                          type="number"
                          min={2}
                          max={12}
                          value={topic.slides}
                          onChange={(e) => {
                            const slides = Number(e.target.value);
                            if (Number.isInteger(slides) && slides >= 2 && slides <= 12)
                              change({
                                slides,
                                headings: Array.from(
                                  { length: slides },
                                  (_, i) =>
                                    topic.headings[i] ??
                                    `${topic.title} — part ${i + 1}`.slice(0, 160),
                                ),
                              });
                          }}
                        />
                      </label>
                      {topic.headings.map((heading, index) => (
                        <label key={index} className="block text-sm">
                          Heading 3 — slide {index + 1}
                          <Input
                            value={heading}
                            maxLength={160}
                            onChange={(e) =>
                              change({
                                headings: topic.headings.map((old, i) =>
                                  i === index ? e.target.value : old,
                                ),
                              })
                            }
                          />
                        </label>
                      ))}
                      <fieldset className="rounded-lg border p-3">
                        <legend>Learning components</legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {TRAINING_TOOLS.map((tool) => (
                            <label className="text-sm" key={tool}>
                              <input
                                type="checkbox"
                                checked={topic.tools.includes(tool)}
                                onChange={(e) =>
                                  change({
                                    tools: e.target.checked
                                      ? [...topic.tools, tool]
                                      : topic.tools.filter((t) => t !== tool),
                                  })
                                }
                              />{" "}
                              {TOOL_LABELS[tool]}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <fieldset className="rounded-lg border p-3">
                        <legend>Assigned source pages / sections</legend>
                        <div className="max-h-40 overflow-auto">
                          {units.map((u) => (
                            <label key={u.id} className="block text-sm">
                              <input
                                type="checkbox"
                                checked={topic.unitIds.includes(u.id)}
                                onChange={(e) =>
                                  change({
                                    unitIds: e.target.checked
                                      ? [...topic.unitIds, u.id]
                                      : topic.unitIds.filter((id) => id !== u.id),
                                  })
                                }
                              />{" "}
                              {u.file} · p.{u.page} · part {Number(u.id.split(":").at(-1)) + 1}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" disabled={!selected} onClick={() => move(-1)}>
                          Move up
                        </Button>
                        <Button
                          variant="outline"
                          disabled={selected === topics.length - 1}
                          onClick={() => move(1)}
                        >
                          Move down
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            const next = topics.filter((t) => t.id !== topic.id);
                            const index = Math.max(0, selected - 1);
                            setTopics(next);
                            setLocalSelected(index);
                            workspace?.navigate(step, next[index]?.id ?? "");
                            setBulkTopics((old) => old.filter((id) => id !== topic.id));
                            setDirty(true);
                          }}
                        >
                          Remove topic
                        </Button>
                      </div>
                    </section>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setTopics([
                      ...topics,
                      {
                        ...(topics.at(-1) ?? initialOutline(units)[0]!),
                        id: crypto.randomUUID(),
                        title: "New topic",
                        unitIds: [],
                      },
                    ]);
                    setSelected(topics.length);
                    setDirty(true);
                  }}
                >
                  Add topic
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="slides" className="space-y-3">
              {topic && (
                <>
                  <Button variant="outline" onClick={() => void run(topic.id)}>
                    Generate this topic
                  </Button>
                  {result ? (
                    <BlockListEditor
                      value={result.body}
                      onChange={(body) => updateResult(topic.id, { body, reviewed: false })}
                      lessonTitle={topic.title}
                    />
                  ) : (
                    <p className="supporting-text">
                      Generate this topic to create its editable slides and learning components.
                    </p>
                  )}
                  <label className="block text-sm">
                    Illustration / video plan
                    <Textarea
                      value={topic.mediaPlan}
                      maxLength={1000}
                      onChange={(e) => change({ mediaPlan: e.target.value })}
                    />
                  </label>
                  <Button variant="outline" onClick={() => void createIllustration()}>
                    Generate illustration with AI
                  </Button>
                  <label className="block text-sm">
                    Upload illustration
                    <Input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadImage(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <label className="block text-sm">
                    Or HTTPS image URL
                    <Input
                      value={topic.image.startsWith("data:") ? "" : topic.image}
                      placeholder={
                        topic.image.startsWith("data:")
                          ? "Uploaded illustration attached"
                          : "https://…"
                      }
                      onChange={(e) => change({ image: e.target.value, mediaReviewed: false })}
                    />
                  </label>
                  {topic.image && (
                    <>
                      <img
                        src={topic.image}
                        alt={topic.alt || "Illustration awaiting alternative text"}
                        className="max-h-48 max-w-full rounded-lg"
                      />
                      <Button
                        variant="outline"
                        onClick={() => change({ image: "", mediaReviewed: false })}
                      >
                        Remove illustration
                      </Button>
                    </>
                  )}
                  <label className="block text-sm">
                    Image alternative text / caption
                    <Input
                      value={topic.alt}
                      maxLength={500}
                      onChange={(e) => change({ alt: e.target.value, mediaReviewed: false })}
                    />
                  </label>
                  <label className="block text-sm">
                    Relevant YouTube video URL
                    <Input
                      value={topic.video}
                      onChange={(e) => change({ video: e.target.value, mediaReviewed: false })}
                    />
                  </label>
                  <label className="block text-sm">
                    Media source / attribution / permission
                    <Input
                      value={topic.attribution}
                      maxLength={1000}
                      onChange={(e) =>
                        change({ attribution: e.target.value, mediaReviewed: false })
                      }
                    />
                  </label>
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={topic.mediaReviewed}
                      onChange={(e) => change({ mediaReviewed: e.target.checked })}
                    />
                    I checked media relevance, accuracy, permission and available video captions.
                  </label>
                </>
              )}
            </TabsContent>
            <TabsContent value="review" className="space-y-3">
              {designPlan && <CourseDesignReview plan={designPlan} choices={designerChoices} />}
              <p className="supporting-text">
                Assignment checks detect structural gaps. Compare slides with the source for factual
                accuracy and complete teaching coverage; AI claims alone are insufficient.
              </p>
              <p className="supporting-text">
                Review the selected topic against its original source. Select another topic in the
                outline to continue. Completed material still requires every topic and source to
                pass.
              </p>
              {topics
                .filter((t) => t.id === topic?.id)
                .map((t) => (
                  <section key={t.id} className="rounded-lg border p-3 text-sm">
                    <h3 className="font-semibold">
                      {t.module} → {t.title}
                    </h3>
                    <p>
                      {t.unitIds
                        .map((id) => {
                          const u = units.find((u) => u.id === id);
                          return u ? `${u.file} p.${u.page}` : "Missing source";
                        })
                        .join(" · ")}
                    </p>
                    <p>
                      {results[t.id] ? parseLessonSlides(results[t.id]!.body).length : 0} /{" "}
                      {t.slides} slides · {t.tools.map((tool) => TOOL_LABELS[tool]).join(", ")}
                    </p>
                    <p className="supporting-text">
                      {t.image ? "Illustration attached" : "No illustration attached"} ·{" "}
                      {t.video ? "Video attached" : "No video attached"}
                      {(t.image || t.video) && !t.mediaReviewed ? " · Media review required" : ""}
                    </p>
                    <label className="mt-2 flex gap-2">
                      <input
                        type="checkbox"
                        disabled={
                          !results[t.id] || results[t.id]!.key !== topicKey(t, units, instruction)
                        }
                        checked={results[t.id]?.reviewed ?? false}
                        onChange={(e) => updateResult(t.id, { reviewed: e.target.checked })}
                      />
                      I checked source coverage, procedures, exceptions and practice answers for
                      this topic.
                    </label>
                  </section>
                ))}
              {!!problems.length && (
                <div role="status" className="rounded-lg border p-3">
                  <p>Outstanding before Completed</p>
                  <ul className="list-inside list-disc text-sm">
                    {problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </TabsContent>
            <TabsContent value="preview">
              <iframe
                title="HTML training slide preview"
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                className="h-[65vh] w-full rounded-lg border"
                srcDoc={trainingHtml(pkg, problems.length > 0, {
                  embedded: true,
                  topic: topic?.id,
                })}
              />
            </TabsContent>
          </Tabs>
        </fieldset>
      )}
    </StudioWorkspace>
  );
}
