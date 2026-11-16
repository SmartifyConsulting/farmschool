import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Scissors, Trash2, Check, Wand2, Sparkles, FolderOpen, FileText, LayoutGrid, Video, Package, Image as ImageIcon, Loader2, Plus, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { FormattedLesson } from "@/components/FormattedLesson";
import { reflowText, type DraftCourse, type DraftLesson } from "@/lib/course-factory";

export type LessonPagePreview = {
  lessonTitle: string;
  lessonSummary: string;
  questions: { question: string; options: string[]; correctIndex: number; sourceQuote: string }[];
  droppedUnsupportedQuestions: number;
};

export type MethodSuggestions = {
  illustrated?: string;
  visual?: string;
  videoQueries?: string[];
  steps?: string[];
  scenarios?: string[];
  quiz?: { question: string; options: string[]; correctIndex: number; sourceQuote: string };
  activities?: string;
};

const ILLUSTRATION_BUCKET = "lesson-illustrations";
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

/** These method ids present as "how the content is delivered", grouped with the delivery-kind toggle below; the rest are "how it's tested". */
const TRAINING_FORMAT_METHOD_IDS = ["illustrated", "video"];
/** Rough estimate of wrapped lines so a textarea's `rows` always fits its text — no inner scrollbar. */
function autoRows(text: string, min: number) {
  const explicitLines = text.split("\n").length;
  const wrappedLines = Math.ceil(text.length / 80);
  return Math.max(min, explicitLines, wrappedLines) + 1;
}
type FormatRef = { source: "delivery" | "method"; id: string };
/** Delivery-medium chips that flank the training-method toggles in drop order: Reading first, SCORM last. */
const DELIVERY_FORMAT_ITEMS: { id: string; label: string; icon: LucideIcon; position: "before" | "after" }[] = [
  { id: "reading", label: "Reading", icon: FileText, position: "before" },
  { id: "scorm", label: "SCORM", icon: Package, position: "after" },
];
const MAX_SLIDES = 20;
const ILLUSTRATED_STYLES = ["Photography", "Illustration", "Diagram", "Animation", "Infographic", "Screenshot"];
function defaultSlides(): FormatRef[][] {
  return [[], [], []];
}
function resizeSlides(current: FormatRef[][], count: number): FormatRef[][] {
  const next = Math.max(1, Math.min(MAX_SLIDES, count));
  const copy = current.slice(0, next);
  while (copy.length < next) copy.push([]);
  return copy;
}
const SOURCE_WORD = /[a-z0-9]{4,}/g;
/** Share of the generated suggestion's own words that also appear in the lesson's source text —
 * a measured overlap, not an AI self-rating, so it can't be inflated by the model's own confidence. */
function groundingConfidence(suggestion: MethodSuggestions | undefined, sourceText: string): number | null {
  if (!suggestion) return null;
  const parts: string[] = [];
  if (suggestion.illustrated) parts.push(suggestion.illustrated);
  if (suggestion.visual) parts.push(suggestion.visual);
  if (suggestion.videoQueries) parts.push(...suggestion.videoQueries);
  if (suggestion.steps) parts.push(...suggestion.steps);
  if (suggestion.scenarios) parts.push(...suggestion.scenarios);
  if (suggestion.quiz) parts.push(suggestion.quiz.question, ...suggestion.quiz.options, suggestion.quiz.sourceQuote);
  if (suggestion.activities) parts.push(suggestion.activities);
  const generatedWords = parts.join(" ").toLowerCase().match(SOURCE_WORD) ?? [];
  if (!generatedWords.length) return null;
  const sourceWords = new Set(sourceText.toLowerCase().match(SOURCE_WORD) ?? []);
  const matched = generatedWords.filter(word => sourceWords.has(word)).length;
  return Math.round((matched / generatedWords.length) * 100);
}

/** Preview-only media picker for a draft lesson: click/drop an image or video, uploaded to a
 * public bucket under the trainer's own folder. Not yet carried through to the published lesson —
 * this is just to let the trainer see roughly how the lesson will look while reviewing the outline. */
function MediaPicker({ lesson, disabled, onChange }: { lesson: DraftLesson; disabled: boolean; onChange: (mediaUrl: string | null, mediaKind: "image" | "video" | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = async (file: File) => {
    const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : null;
    if (!kind) { toast.error("Choose an image or video file."); return; }
    if (file.size > MAX_MEDIA_BYTES) { toast.error("File must be smaller than 25MB."); return; }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { toast.error("Please sign in to upload."); return; }
    setUploading(true);
    const path = `${auth.user.id}/${crypto.randomUUID()}-${file.name}`.replace(/\s+/g, "-");
    const { error } = await supabase.storage.from(ILLUSTRATION_BUCKET).upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) { toast.error("Could not upload the file."); return; }
    const { data } = supabase.storage.from(ILLUSTRATION_BUCKET).getPublicUrl(path);
    onChange(data.publicUrl, kind);
  };
  if (lesson.mediaUrl) {
    return (
      <div className="relative mt-1 overflow-hidden rounded bg-muted">
        {lesson.mediaKind === "video" ? (
          <video src={lesson.mediaUrl} className="h-16 w-full object-cover" muted />
        ) : (
          <img src={lesson.mediaUrl} alt="" className="h-16 w-full object-cover" />
        )}
        {!disabled && (
          <button type="button" onClick={() => onChange(null, null)} className="absolute right-1 top-1 rounded-full bg-background p-0.5 shadow" aria-label="Remove media">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled || uploading}
      onClick={() => inputRef.current?.click()}
      className="mt-1 flex h-10 w-full items-center justify-center gap-1.5 rounded bg-muted text-muted-foreground hover:bg-muted/70 disabled:opacity-60"
    >
      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
      <span>{uploading ? "Uploading…" : "Add image or video"}</span>
      <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={event => {
        const file = event.target.files?.[0];
        if (file) void upload(file);
        event.target.value = "";
      }} />
    </button>
  );
}

type Props = {
  draft: DraftCourse;
  readOnly: boolean;
  busy: boolean;
  methods: { id: string; label: string; detail: string; icon?: LucideIcon }[];
  choices: (index: number, title: string, body: string) => string[];
  approved: Record<number, boolean>;
  rationale: Record<number, string>;
  onEdit: (index: number, lesson: DraftLesson) => void;
  onSplit: (index: number, paragraph: number, title: string) => void;
  onMerge: (index: number) => void;
  onDelete: (index: number) => void;
  onMethods: (index: number, methods: string[]) => void;
  onApprove: (index: number, lesson: DraftLesson) => void;
  previews: Record<number, LessonPagePreview>;
  previewLoading: number | null;
  onPreview: (index: number, lesson: DraftLesson) => void;
  suggestions: Record<number, MethodSuggestions>;
  suggestLoading: number | null;
  onSuggest: (index: number, lesson: DraftLesson, methods: string[]) => void;
  /** Bump focusToken (any changing value) alongside focusIndex to jump the stepper to that lesson's module, even if focusIndex repeats. */
  focusIndex?: number | null;
  focusToken?: number;
};

export function ManualLessonReview(props: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [splitting, setSplitting] = useState<number | null>(null);
  const [splitAt, setSplitAt] = useState<number | null>(null);
  const [splitTitle, setSplitTitle] = useState("");
  const [aiMethods, setAiMethods] = useState<Record<number, string[]>>({});
  const [activeGroup, setActiveGroup] = useState(0);
  const moduleCount = new Set(props.draft.lessons.map(lesson => lesson.module).filter(Boolean)).size;
  const pageCount = new Set(props.draft.lessons.flatMap(lesson => lesson.sourceRefs.map(ref => `${ref.sourceId}:${ref.page}`))).size;
  const groups: { label: string; start: number; end: number }[] = [];
  props.draft.lessons.forEach((lesson, index) => {
    const label = lesson.module || "Other lessons";
    const last = groups.at(-1);
    if (last && last.label === label && lesson.module === props.draft.lessons[index - 1]?.module) {
      last.end = index + 1;
    } else {
      groups.push({ label, start: index, end: index + 1 });
    }
  });
  const safeActiveGroup = Math.min(activeGroup, Math.max(groups.length - 1, 0));
  const visible = groups[safeActiveGroup] ?? { label: "", start: 0, end: props.draft.lessons.length };
  useEffect(() => {
    if (props.focusIndex == null) return;
    const gi = groups.findIndex(g => props.focusIndex! >= g.start && props.focusIndex! < g.end);
    if (gi !== -1) setActiveGroup(gi);
    requestAnimationFrame(() =>
      document.getElementById(`outline-lesson-${props.focusIndex}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusToken]);
  return <section aria-label="Detected lessons" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Detected outline</h3>
      <p className="text-xs text-muted-foreground">{moduleCount ? `${moduleCount} modules · ` : ""}{props.draft.lessons.length} lessons · {pageCount} source pages · {Object.values(props.approved).filter(Boolean).length} approved</p>
    </div>
    {props.draft.warnings.length > 0 && <details className="border-l-2 border-border pl-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Source notes ({props.draft.warnings.length})</summary>{props.draft.warnings.map((warning, index) => <p key={index} className="mt-2">{warning}</p>)}</details>}
    <div className="min-w-0 flex-1 space-y-4">
    {groups.length > 1 && <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
      <Button size="sm" variant="ghost" disabled={safeActiveGroup === 0} onClick={() => setActiveGroup(g => g - 1)}>Previous module</Button>
      <p className="text-xs text-muted-foreground">Module {safeActiveGroup + 1} of {groups.length} · {visible.label}</p>
      <Button size="sm" variant="ghost" disabled={safeActiveGroup === groups.length - 1} onClick={() => setActiveGroup(g => g + 1)}>Next module</Button>
    </div>}
    <ol className="space-y-4">
      {props.draft.lessons.slice(visible.start, visible.end).map((lesson, offset) => {
        const index = visible.start + offset;
        const pages = lesson.sourceRefs.map(ref => ref.page);
        const selected = props.choices(index, lesson.title, lesson.body);
        const paragraphs = lesson.body.split(/\n{2,}/);
        const newModule = lesson.module && lesson.module !== props.draft.lessons[index - 1]?.module;
        return <li key={index} id={`outline-lesson-${index}`} className="min-w-0 scroll-mt-4 space-y-3">
          {newModule && <h4 className="flex items-center gap-2 pt-2 text-sm font-semibold text-primary"><FolderOpen className="h-4 w-4" />Module: {lesson.module}</h4>}
          <div className={`min-w-0 rounded-lg border border-border bg-background p-4 sm:p-5 ${lesson.module ? "sm:ml-4" : ""}`}>
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-sm font-semibold text-secondary-foreground">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <Input aria-label={`Lesson ${index + 1} title`} value={lesson.title} maxLength={120} disabled={props.readOnly || props.busy} onChange={event => props.onEdit(index, { ...lesson, title: event.target.value })} className="font-semibold" />
              <p className="mt-2 text-xs text-muted-foreground">{pages.length ? `Source pages ${Math.min(...pages)}–${Math.max(...pages)}` : "Pasted source"}{props.approved[index] ? " · Approved" : " · Needs review"}</p>
            </div>
          </div>
          <label className="mt-3 block space-y-1 text-xs font-medium text-muted-foreground">
            <span>Source</span>
            <Textarea aria-label={`Lesson ${index + 1} source`} rows={autoRows(lesson.body, 5)} value={lesson.body} disabled={props.readOnly || props.busy} onChange={event => props.onEdit(index, { ...lesson, body: event.target.value })} className="resize-none text-sm leading-relaxed text-foreground" />
          </label>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={props.readOnly || props.busy || paragraphs.length < 2} onClick={() => { setSplitting(splitting === index ? null : index); setSplitAt(null); }}><Scissors className="h-4 w-4" />Split</Button>
            <Button size="sm" variant="ghost" disabled={props.readOnly || props.busy || index === props.draft.lessons.length - 1} onClick={() => props.onMerge(index)}><ArrowDownToLine className="h-4 w-4" />Merge next</Button>
            <Button size="sm" variant="ghost" disabled={props.readOnly || props.busy} onClick={() => props.onEdit(index, { ...lesson, body: reflowText(lesson.body) })}><Wand2 className="h-4 w-4" />Polish</Button>
            <Button size="icon" variant="ghost" title="Remove lesson from outline" aria-label={`Remove lesson ${index + 1}`} disabled={props.readOnly || props.busy} onClick={() => props.onDelete(index)}><Trash2 className="h-4 w-4" /></Button>
          </div>
          {(() => {
            const renderMethodToggle = (method: Props["methods"][number], draggableFormat?: boolean) => {
              const isSelected = selected.includes(method.id);
              const aiChosen = aiMethods[index] ?? selected;
              const wantsAi = aiChosen.includes(method.id);
              return (
                <div
                  key={method.id}
                  title={method.detail}
                  className="flex items-center gap-1"
                  draggable={draggableFormat}
                  onDragStart={draggableFormat ? event => {
                    event.dataTransfer.setData("application/json", JSON.stringify({ source: "method", id: method.id }));
                    event.dataTransfer.effectAllowed = "copy";
                  } : undefined}
                >
                  <Button
                    type="button"
                    size="sm"
                    variant={isSelected ? "secondary" : "outline"}
                    aria-pressed={isSelected}
                    className={draggableFormat ? "cursor-grab active:cursor-grabbing" : undefined}
                    onClick={() => props.onMethods(index, isSelected ? selected.filter(value => value !== method.id) : [...selected, method.id])}
                  >
                    {method.icon && <method.icon className="h-3.5 w-3.5" />}
                    {method.label}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-pressed={wantsAi}
                    disabled={!isSelected}
                    title="Generate this with AI"
                    aria-label={`Generate ${method.label} with AI`}
                    onClick={() => setAiMethods(p => ({
                      ...p,
                      [index]: wantsAi ? aiChosen.filter(m => m !== method.id) : [...aiChosen, method.id],
                    }))}
                  >
                    <Wand2 className={`h-4 w-4 ${isSelected && wantsAi ? "text-primary" : "text-muted-foreground"}`} />
                  </Button>
                  {method.id === "illustrated" && isSelected && (
                    <select
                      aria-label="Illustrated explanation style"
                      value={lesson.illustratedStyle ?? ILLUSTRATED_STYLES[0]}
                      disabled={props.readOnly || props.busy}
                      onChange={event => props.onEdit(index, { ...lesson, illustratedStyle: event.target.value })}
                      className="h-8 rounded border border-input bg-background px-1 text-xs"
                    >
                      {ILLUSTRATED_STYLES.map(style => (
                        <option key={style} value={style}>{style}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            };
            const trainingFormatMethods = props.methods.filter(m => TRAINING_FORMAT_METHOD_IDS.includes(m.id));
            const testLearningMethods = props.methods.filter(m => !TRAINING_FORMAT_METHOD_IDS.includes(m.id));
            const slides = lesson.slideKinds ?? defaultSlides();
            const formatMeta = (ref: FormatRef) =>
              ref.source === "delivery"
                ? DELIVERY_FORMAT_ITEMS.find(d => d.id === ref.id)
                : props.methods.find(m => m.id === ref.id);
            const updateSlides = (next: FormatRef[][]) => props.onEdit(index, { ...lesson, kind: "slide", slideKinds: next });
            return (
              <>
                <fieldset disabled={props.readOnly || props.busy} className="mt-4 space-y-3">
                  <legend className="text-xs font-semibold text-muted-foreground">Training format</legend>
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">Slides</span>
                    <select
                      aria-label="Number of slides"
                      value={slides.length}
                      disabled={props.readOnly || props.busy}
                      onChange={event => updateSlides(resizeSlides(slides, Number(event.target.value) || 1))}
                      className="h-7 rounded border border-input bg-background px-1 text-xs"
                    >
                      {Array.from({ length: MAX_SLIDES }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>{n} slide{n === 1 ? "" : "s"}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {slides.map((formats, si) => (
                      <div
                        key={si}
                        onDragOver={event => event.preventDefault()}
                        onDrop={event => {
                          event.preventDefault();
                          const raw = event.dataTransfer.getData("application/json");
                          if (!raw) return;
                          try {
                            const ref = JSON.parse(raw) as FormatRef;
                            updateSlides(slides.map((f, i) => (i === si ? (f.some(x => x.source === ref.source && x.id === ref.id) ? f : [...f, ref]) : f)));
                          } catch { /* ignore a non-format drop */ }
                        }}
                        className="relative flex h-28 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-background p-2"
                      >
                        <span className="absolute left-1.5 top-1 text-[10px] text-muted-foreground">Slide {si + 1}</span>
                        {!props.readOnly && !props.busy && (
                          <button type="button" aria-label={`Delete slide ${si + 1}`} onClick={() => updateSlides(slides.filter((_, i) => i !== si))} className="absolute right-1 top-1 text-muted-foreground hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                        {formats.length ? (
                          <div className="mt-3 flex flex-wrap items-center justify-center gap-1">
                            {formats.map(ref => {
                              const meta = formatMeta(ref);
                              const Icon = meta?.icon ?? FileText;
                              return (
                                <span key={`${ref.source}:${ref.id}`} title={meta?.label ?? ref.id} className="flex items-center gap-0.5 rounded bg-secondary px-1 py-0.5">
                                  <Icon className="h-4 w-4 text-secondary-foreground" />
                                  {!props.readOnly && !props.busy && (
                                    <button type="button" aria-label={`Remove ${meta?.label ?? ref.id} from slide ${si + 1}`} onClick={() => updateSlides(slides.map((f, i) => (i === si ? f.filter(x => !(x.source === ref.source && x.id === ref.id)) : f)))}>
                                      <X className="h-2.5 w-2.5 text-secondary-foreground" />
                                    </button>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <FileText className="mt-3 h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    ))}
                    {!props.readOnly && !props.busy && slides.length < MAX_SLIDES && (
                      <button type="button" onClick={() => updateSlides([...slides, []])} className="flex h-28 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary">
                        <Plus className="h-5 w-5" />
                        <span className="text-[10px]">Add slide</span>
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Drag a format below onto a slide — a slide can hold more than one.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {DELIVERY_FORMAT_ITEMS.filter(d => d.position === "before").map(({ id, label, icon: Icon }) => (
                      <div
                        key={id}
                        draggable
                        onDragStart={event => { event.dataTransfer.setData("application/json", JSON.stringify({ source: "delivery", id })); event.dataTransfer.effectAllowed = "copy"; }}
                        className="flex cursor-grab items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm active:cursor-grabbing"
                      >
                        <Icon className="h-3.5 w-3.5" />{label}
                      </div>
                    ))}
                    {trainingFormatMethods.map(method => renderMethodToggle(method, true))}
                    {DELIVERY_FORMAT_ITEMS.filter(d => d.position === "after").map(({ id, label, icon: Icon }) => (
                      <div
                        key={id}
                        draggable
                        onDragStart={event => { event.dataTransfer.setData("application/json", JSON.stringify({ source: "delivery", id })); event.dataTransfer.effectAllowed = "copy"; }}
                        className="flex cursor-grab items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm active:cursor-grabbing"
                      >
                        <Icon className="h-3.5 w-3.5" />{label}
                      </div>
                    ))}
                  </div>
                </fieldset>
                <fieldset disabled={props.readOnly || props.busy} className="mt-4 space-y-2 border-t border-border pt-3">
                  <legend className="text-xs font-semibold text-muted-foreground">Knowledge check</legend>
                  <div className="flex flex-wrap gap-2">{testLearningMethods.map(method => renderMethodToggle(method))}</div>
                </fieldset>
              </>
            );
          })()}
          {(() => {
            const needsGeneration = (aiMethods[index] ?? selected).length > 0;
            const generated = !!props.suggestions[index];
            const readyToReview = !needsGeneration || generated;
            const confidence = generated ? groundingConfidence(props.suggestions[index], lesson.body) : null;
            return (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                {confidence != null ? (
                  <p className="text-xs text-muted-foreground" title="Share of the generated content's own words that were found in this lesson's source text">
                    {confidence}% grounded in source
                  </p>
                ) : <span />}
                <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  aria-expanded={expanded === index}
                  disabled={props.readOnly || props.suggestLoading !== null || lesson.body.length < 100}
                  onClick={() => {
                    const opening = expanded !== index;
                    setExpanded(opening ? index : null);
                    if (opening && !aiMethods[index]) setAiMethods((p) => ({ ...p, [index]: selected }));
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                  {props.suggestLoading === index ? "Generating…" : "Generate"}
                </Button>
                {readyToReview && (
                  <>
                    <Button size="sm" variant="secondary" disabled={props.readOnly || props.previewLoading !== null || lesson.body.length < 100 || !selected.length} onClick={() => props.onPreview(index, lesson)}>{props.previewLoading === index ? "Generating…" : "Preview"}</Button>
                    <Button size="sm" variant={props.approved[index] ? "secondary" : "outline"} disabled={props.readOnly || props.busy || !selected.length || !lesson.title.trim()} onClick={() => props.onApprove(index, lesson)}><Check className="h-4 w-4" />{props.approved[index] ? "Reopen" : "Approve"}</Button>
                  </>
                )}
                </div>
              </div>
            );
          })()}
          {props.previews[index] && <div className="mt-4 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-xs font-semibold text-primary">AI-generated page preview — for your checked methods; review before publishing</p>
            {lesson.mediaUrl && (
              <div className="max-w-xs overflow-hidden rounded bg-muted">
                {lesson.mediaKind === "video" ? <video src={lesson.mediaUrl} className="h-24 w-full object-cover" muted /> : <img src={lesson.mediaUrl} alt="" className="h-24 w-full object-cover" />}
              </div>
            )}
            <FormattedLesson content={props.previews[index].lessonSummary} />
            {props.previews[index].questions.map((q, i) => (
              <div key={i} className="space-y-1 border-t border-border pt-2 text-sm">
                <p className="font-medium">{i + 1}. {q.question}</p>
                {q.options.map((option, j) => (
                  <p key={j} className="text-sm">{j === q.correctIndex ? "✓ " : "○ "}{option}</p>
                ))}
                <p className="text-xs italic text-muted-foreground">Source quote: {q.sourceQuote}</p>
              </div>
            ))}
            {!!props.previews[index].droppedUnsupportedQuestions && (
              <p className="text-xs text-muted-foreground">{props.previews[index].droppedUnsupportedQuestions} question(s) removed — their source quotes weren't found in the text.</p>
            )}
          </div>}
          {splitting === index && <div className="mt-4 space-y-2 border-t border-border pt-3">
            <h4 className="text-sm font-medium">Click “Split here” where the next lesson should start</h4>
            <div className="max-h-[28rem] space-y-1 overflow-y-auto rounded-md border border-border p-3">
              {paragraphs.map((paragraph, pi) => <div key={pi}>
                {pi > 0 && (splitAt === pi
                  ? <div className="my-2 space-y-2 rounded-md border border-primary bg-primary/5 p-3">
                      <label className="block text-xs font-medium">New lesson title<Input autoFocus value={splitTitle} maxLength={120} onChange={event => setSplitTitle(event.target.value)} className="mt-1" /></label>
                      <div className="flex gap-2"><Button size="sm" disabled={!splitTitle.trim()} onClick={() => { props.onSplit(index, pi, splitTitle); setSplitting(null); setSplitAt(null); }}><Scissors className="h-4 w-4" />Split into two lessons</Button><Button size="sm" variant="ghost" onClick={() => setSplitAt(null)}>Cancel</Button></div>
                    </div>
                  : <button type="button" onClick={() => { setSplitAt(pi); setSplitTitle(paragraph.length <= 90 && !/[.!?]$/.test(paragraph) ? paragraph : `${lesson.title.slice(0, 105)} — part 2`); }} className="group my-1 flex w-full items-center gap-2 text-xs text-muted-foreground hover:text-primary"><span className="h-px flex-1 bg-border group-hover:bg-primary" /><Scissors className="h-3 w-3" />Split here<span className="h-px flex-1 bg-border group-hover:bg-primary" /></button>)}
                <p className="whitespace-pre-line text-sm leading-relaxed">{paragraph}</p>
              </div>)}
            </div>
          </div>}
          {expanded === index && <div className="mt-4 space-y-3 border-t border-border pt-4">
            {props.rationale[index] && <p className="text-xs text-muted-foreground">{props.rationale[index]}</p>}
            {!!selected.length && (
              <p className="text-xs text-muted-foreground">
                The <Wand2 className="inline h-3 w-3 align-text-bottom" /> toggle on each option above picks what the AI generates; the rest you write yourself.
              </p>
            )}
            <Button
              size="sm"
              disabled={props.readOnly || props.suggestLoading !== null || !(aiMethods[index] ?? selected).length}
              onClick={() => props.onSuggest(index, lesson, aiMethods[index] ?? selected)}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {props.suggestLoading === index ? "Generating…" : "Generate"}
            </Button>
            <div className="space-y-3">
              {props.methods.map((method) => {
                const s = props.suggestions[index];
                const isSelected = selected.includes(method.id);
                const wantsAi = (aiMethods[index] ?? selected).includes(method.id);
                if (!isSelected) {
                  return (
                    <div key={method.id} className="space-y-1 rounded-md border border-dashed border-border p-2">
                      <p className="text-xs font-medium text-muted-foreground">{method.label}</p>
                      <p className="text-xs text-muted-foreground">Not selected — tick it above for an AI suggestion, or write this yourself.</p>
                    </div>
                  );
                }
                if (!wantsAi) {
                  return (
                    <div key={method.id} className="space-y-1 rounded-md border border-dashed border-border p-2">
                      <p className="text-xs font-medium text-muted-foreground">{method.label}</p>
                      <p className="text-xs text-muted-foreground">You've chosen to write this one yourself.</p>
                    </div>
                  );
                }
                if (props.suggestLoading === index || !s) {
                  return (
                    <div key={method.id} className="space-y-1">
                      <p className="text-xs font-medium">{method.label}</p>
                      <p className="text-xs text-muted-foreground">{props.suggestLoading === index ? "Generating…" : "Click \"Generate\" above."}</p>
                    </div>
                  );
                }
                if (method.id === "illustrated" || method.id === "visual") {
                  const caption = method.id === "illustrated" ? s.illustrated : s.visual;
                  return (
                    <div key={method.id} className="max-w-xs space-y-1">
                      <p className="text-xs font-medium">{method.label}</p>
                      {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
                      <MediaPicker lesson={lesson} disabled={props.readOnly || props.busy} onChange={(mediaUrl, mediaKind) => props.onEdit(index, { ...lesson, mediaUrl, mediaKind })} />
                    </div>
                  );
                }
                if (method.id === "video") {
                  return (
                    <div key={method.id} className="space-y-1">
                      <p className="text-xs font-medium">{method.label} — suggested searches</p>
                      {s.videoQueries?.length ? (
                        <ul className="list-disc space-y-0.5 pl-4 text-xs">
                          {s.videoQueries.map((q, i) => <li key={i}><a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer" className="text-primary underline">{q}</a></li>)}
                        </ul>
                      ) : <p className="text-xs text-muted-foreground">No suggestions returned.</p>}
                    </div>
                  );
                }
                if (method.id === "steps") {
                  return (
                    <div key={method.id} className="space-y-1">
                      <p className="text-xs font-medium">{method.label}</p>
                      {s.steps?.length ? <ol className="list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">{s.steps.map((step, i) => <li key={i}>{step}</li>)}</ol> : <p className="text-xs text-muted-foreground">No suggestions returned.</p>}
                    </div>
                  );
                }
                if (method.id === "scenario") {
                  return (
                    <div key={method.id} className="space-y-1">
                      <p className="text-xs font-medium">{method.label}</p>
                      {s.scenarios?.length ? s.scenarios.map((sc, i) => <p key={i} className="text-xs text-muted-foreground">{sc}</p>) : <p className="text-xs text-muted-foreground">No suggestions returned.</p>}
                    </div>
                  );
                }
                if (method.id === "quiz") {
                  return (
                    <div key={method.id} className="space-y-1">
                      <p className="text-xs font-medium">{method.label}</p>
                      {s.quiz ? <>
                        <p className="text-xs">{s.quiz.question}</p>
                        {s.quiz.options.map((option, j) => <p key={j} className="text-xs text-muted-foreground">{j === s.quiz!.correctIndex ? "✓ " : "○ "}{option}</p>)}
                        <p className="text-xs italic text-muted-foreground">Source quote: {s.quiz.sourceQuote}</p>
                      </> : <p className="text-xs text-muted-foreground">No suggestion returned.</p>}
                    </div>
                  );
                }
                return (
                  <div key={method.id} className="space-y-1">
                    <p className="text-xs font-medium">{method.label}</p>
                    {s.activities ? <p className="text-xs text-muted-foreground">{s.activities}</p> : <p className="text-xs text-muted-foreground">No suggestion returned.</p>}
                  </div>
                );
              })}
            </div>
          </div>}
          </div>
        </li>;
      })}
    </ol>
    </div>
  </section>;
}