import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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

export function MaterialProducer({
  sources,
  folderId,
  initialBody,
  initialTitle,
  onClose,
  onSaved,
}: {
  sources: LibraryFile[];
  folderId: string | null;
  initialBody?: string | undefined;
  initialTitle?: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const generate = useServerFn(generateTrainingTopic);
  const illustrate = useServerFn(generateTrainingIllustration);
  const [title, setTitle] = useState(initialTitle ?? sources[0]!.file_name.replace(/\.[^.]+$/, ""));
  const [instruction, setInstruction] = useState(
    "Teach every source topic. Preserve procedures, exceptions and responsibilities. Use varied learning components. Mark scenarios as hypothetical.",
  );
  const [units, setUnits] = useState<SourceUnit[]>([]);
  const [topics, setTopics] = useState<TrainingTopic[]>([]);
  const [results, setResults] = useState<Record<string, TopicResult>>({});
  const cache = useRef<Record<string, TopicResult>>({});
  const [selected, setSelected] = useState(0);
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
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const all: SourceUnit[] = [];
        const low: string[] = [];
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
          all.push(...sourceUnits(file.id, file.original_file_name, pages));
        }
        if (!all.length || all.reduce((n, u) => n + u.text.length, 0) > 1000000)
          throw new Error("Choose readable sources totalling at most 1,000,000 characters.");
        const saved = initialBody ? readTrainingPackage(initialBody) : null;
        if (!cancelled) {
          setUnits(all);
          setBlanks(low);
          setTopics(saved?.topics ?? initialOutline(all));
          setLegacy(!!initialBody && !saved);
          if (saved) {
            setTitle(saved.title);
            setInstruction(saved.instruction);
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
  }, [sources, initialBody]);
  const topic = topics[selected];
  const result = topic ? results[topic.id] : undefined;
  const pkg: TrainingPackage = { version: 1, title, instruction, topics, results };
  const problems = coverageProblems(topics, units, results, instruction);
  if (blanks.length)
    problems.unshift("Replace or OCR pages with little readable text before completion.");
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
    if (busy) return;
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
  const run = async (only?: string) => {
    if (busy || loading || error) return;
    const issues = outlineProblems(topics, units);
    if (issues.length) {
      toast.error(issues[0]);
      return;
    }
    if (blanks.length || topics.length > 50) {
      toast.error(
        blanks.length
          ? "Use readable or OCR-processed source pages first."
          : "Split this output into at most 50 topics before generating.",
      );
      return;
    }
    const chosen = topics.filter(
      (t) =>
        (!only || t.id === only) && cache.current[t.id]?.key !== topicKey(t, units, instruction),
    );
    if (!chosen.length) {
      toast.info("Topics are current. Edit the outline or instructions to request new content.");
      return;
    }
    if (
      !(await confirm({
        title: `Generate ${chosen.length} topic${chosen.length === 1 ? "" : "s"}?`,
        description: `This uses ${chosen.length} AI requests from your allowance. Finished topics are kept if a later request fails. Keep this window open to retain progress. Nothing is published.`,
        confirmLabel: "Generate planned slides",
      }))
    )
      return;
    stopped.current = false;
    setGenerationError("");
    setBusy(true);
    setDirty(true);
    try {
      for (const [index, t] of chosen.entries()) {
        if (stopped.current) break;
        setProgress(`Generating topic ${index + 1} of ${chosen.length}: ${t.title}`);
        const output = await generate({
          data: {
            title,
            instruction,
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
      }
    } catch (e) {
      const message = friendlyError(
        e,
        "Generation stopped. Finished topics are retained; retry remaining topics.",
      );
      setGenerationError(message);
      toast.error(message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  };
  const save = async () => {
    if (!user || busy || problems.length || !title.trim()) return;
    setBusy(true);
    try {
      const key = JSON.stringify(pkg);
      if (attempt.current?.key !== key) {
        const id = crypto.randomUUID();
        const name = (title.trim().replace(/[\\/:*?"<>|]/g, "-") || "Training") + ".html";
        attempt.current = {
          key,
          id,
          name,
          path: `${user.id}/library/produced/${id}/${name}`,
          blob: new Blob([trainingHtml(pkg)], { type: "text/html;charset=utf-8" }),
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
            `HTML training: ${topics.length} reviewed topics. Sources: ${sources.map((s) => s.file_name).join(", ")}`.slice(
              0,
              4000,
            ),
          _folder_id: folderId,
        }) as never,
      );
      if (registered.error) throw registered.error;
      if (registered.data !== out.id) throw new Error("Save not confirmed. Retry this output.");
      toast.success(
        "HTML slides saved to Completed. Earlier outputs and Raw sources are preserved.",
      );
      onSaved();
    } catch (e) {
      toast.error(friendlyError(e, "Could not confirm the save. Retry the same output."));
    } finally {
      setBusy(false);
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
    const next = [...topics];
    [next[selected], next[selected + delta]] = [next[selected + delta]!, next[selected]!];
    setTopics(next);
    setSelected(selected + delta);
    setDirty(true);
  };
  const uploadImage = async (file: File) => {
    try {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8000000)
        throw new Error("Choose a PNG, JPEG or WebP smaller than 8 MB.");
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const image = canvas.toDataURL("image/jpeg", 0.5);
      if (image.length > 120000) throw new Error("Choose a smaller illustration.");
      change({ image, mediaReviewed: false });
    } catch (e) {
      toast.error(friendlyError(e, "Could not read the image."));
    }
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
      const output = await illustrate({
        data: {
          sourceIds: sources.map((s) => s.id),
          caption: `${topic.title}. ${topic.mediaPlan}`.slice(0, 600),
        },
      });
      const bytes = Uint8Array.from(atob(output.base64), (c) => c.charCodeAt(0));
      await uploadImage(new File([bytes], "illustration.png", { type: "image/png" }));
      change({
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
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
        <DialogTitle>Design training from source material</DialogTitle>
        <p className="supporting-text text-muted-foreground">
          Outline → topic slides and media → coverage review → HTML. Original sources stay
          unchanged.
        </p>
        {loading ? (
          <p role="status">Reading every source page…</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : (
          <>
            <fieldset disabled={busy} className="space-y-4">
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
                {topics.length} topics · {topics.reduce((n, t) => n + t.slides, 0)} planned slides.
                Edit or combine the page-based starter topics before generating.
              </p>
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
              <Tabs defaultValue="outline">
                <SectionTabsList aria-label="Training design steps">
                  {["Outline", "Slides and media", "Coverage review", "Preview"].map((label, i) => (
                    <SectionTabsTrigger
                      key={label}
                      value={["outline", "slides", "review", "preview"][i]!}
                    >
                      {i + 1}. {label}
                    </SectionTabsTrigger>
                  ))}
                </SectionTabsList>
                <TabsContent value="outline" className="space-y-3">
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
                  <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
                    <nav
                      aria-label="Training outline"
                      className="max-h-[55vh] space-y-1 overflow-auto"
                    >
                      {topics.map((t, i) => (
                        <button
                          type="button"
                          key={t.id}
                          aria-current={selected === i ? "step" : undefined}
                          className={`block w-full rounded-md border p-2 text-left text-sm ${selected === i ? "border-primary bg-primary/10" : ""}`}
                          onClick={() => setSelected(i)}
                        >
                          {i + 1}. {t.title}
                          <span className="block text-xs text-muted-foreground">
                            {results[t.id]?.key === topicKey(t, units, instruction)
                              ? results[t.id]?.reviewed
                                ? "Reviewed"
                                : "Generated — review required"
                              : "Not generated / changed"}
                          </span>
                        </button>
                      ))}
                    </nav>
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
                            max={8}
                            value={topic.slides}
                            onChange={(e) => {
                              const slides = Number(e.target.value);
                              if (Number.isInteger(slides) && slides >= 2 && slides <= 8)
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
                              setTopics(topics.filter((t) => t.id !== topic.id));
                              setSelected(Math.max(0, selected - 1));
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
                </TabsContent>
                <TabsContent value="slides" className="space-y-3">
                  <label className="block text-sm">
                    Topic
                    <select
                      className="ml-2 max-w-full rounded-md border p-2"
                      value={selected}
                      onChange={(e) => setSelected(Number(e.target.value))}
                    >
                      {topics.map((t, i) => (
                        <option key={t.id} value={i}>
                          {i + 1}. {t.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  {topic && (
                    <>
                      <label className="block text-sm">
                        Assigned source text
                        <Textarea
                          readOnly
                          className="max-h-56"
                          value={units
                            .filter((u) => topic.unitIds.includes(u.id))
                            .map((u) => `${u.file} — page ${u.page}\n${u.text}`)
                            .join("\n\n")}
                        />
                      </label>
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
                        I checked media relevance, accuracy, permission and available video
                        captions.
                      </label>
                    </>
                  )}
                </TabsContent>
                <TabsContent value="review" className="space-y-3">
                  <p className="supporting-text">
                    Assignment checks detect structural gaps. Compare slides with the source for
                    factual accuracy and complete teaching coverage; AI claims alone are
                    insufficient.
                  </p>
                  {topics.map((t) => (
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
                    srcDoc={trainingHtml(pkg, problems.length > 0)}
                  />
                </TabsContent>
              </Tabs>
              <div className="flex flex-wrap gap-2">
                <Button disabled={!title.trim()} onClick={() => void run()}>
                  Generate remaining topics
                </Button>
                <Button variant="outline" onClick={download}>
                  Download HTML {problems.length ? "draft" : "slides"}
                </Button>
                <Button variant="outline" onClick={saveDraft}>
                  Save progress in this browser
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
                  Save HTML slides to Completed
                </Button>
                <Button variant="outline" onClick={() => void close()}>
                  Cancel
                </Button>
              </div>
              <p className="supporting-text text-muted-foreground">
                One AI request per topic. Images are uploaded or supplied by you; unavailable media
                stays labelled as a placeholder. Saving does not publish a course.
              </p>
              {generationError && (
                <p role="alert" className="rounded-lg border p-3 text-sm">
                  {generationError}
                </p>
              )}
            </fieldset>
            {busy && (
              <div role="status">
                <p>{progress || "Saving training…"}</p>
                {progress && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      stopped.current = true;
                      setProgress("Stopping after the current topic…");
                    }}
                  >
                    Stop after this topic
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
