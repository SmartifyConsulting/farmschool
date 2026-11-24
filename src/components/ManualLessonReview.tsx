import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownToLine, Scissors, Trash2, Check, Wand2, Sparkles, FolderOpen, FileText, LayoutGrid, Video, Package, Library, Image as ImageIcon, Loader2, Plus, X, ChevronDown, ChevronUp, GripVertical, CheckCircle2, Circle, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { FormattedLesson } from "@/components/FormattedLesson";
import { reflowText, type DraftCourse, type DraftLesson, type IllustrationGuide } from "@/lib/course-factory";
import { buildLessonScormZip } from "@/lib/scorm-export";
import { generateLessonImage } from "@/lib/studio-ai.functions";
import { searchYouTubeVideo } from "@/lib/youtube-search.functions";
import { InteractiveVideoPlayer } from "@/components/InteractiveVideoPlayer";
import { HeroBanner } from "@/components/HeroBanner";
import { estimateMinutes, formatMinutes } from "@/lib/duration-estimate";

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
  facts?: { claim: string; evidence: string }[];
};

const ILLUSTRATION_BUCKET = "lesson-illustrations";
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

/** These method ids present as "how the content is delivered", grouped with the delivery-kind toggle below; the rest are "how it's tested". */
const TRAINING_FORMAT_METHOD_IDS = ["illustrated", "video", "facts"];
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
function defaultSlides(): FormatRef[][] {
  return [[], [], []];
}
/** Extracts the video id from a youtube.com/youtu.be URL (watch, youtu.be short link, /embed/, /shorts/), or null if it isn't a recognized YouTube link. */
function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return parsed.pathname.slice(1) || null;
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
      const match = /^\/(?:embed|shorts)\/([^/]+)/.exec(parsed.pathname);
      if (match) return match[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}
/** Formats whole seconds as mm:ss for the pause-point time field. */
function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
/** Parses an mm:ss or plain-seconds time field; null if it isn't a recognizable time. */
function parseTimeInput(value: string): number | null {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const match = /^(\d+):([0-5]?\d)$/.exec(trimmed);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
function resizeSlides(current: FormatRef[][], count: number): FormatRef[][] {
  const next = Math.max(1, Math.min(MAX_SLIDES, count));
  const copy = current.slice(0, next);
  while (copy.length < next) copy.push([]);
  return copy;
}
/** Places a newly-selected format onto the first slide that doesn't already hold it, adding a slide if every one is full. */
function placeFormatOnSlide(ref: FormatRef, slides: FormatRef[][]): FormatRef[][] {
  const emptyIndex = slides.findIndex(f => f.length === 0);
  if (emptyIndex !== -1) return slides.map((f, i) => (i === emptyIndex ? [...f, ref] : f));
  if (slides.length < MAX_SLIDES) return [...slides, [ref]];
  const lastIndex = slides.length - 1;
  return slides.map((f, i) => (i === lastIndex ? [...f, ref] : f));
}
function removeFormatFromSlides(ref: FormatRef, slides: FormatRef[][]): FormatRef[][] {
  return slides.map(f => f.filter(x => !(x.source === ref.source && x.id === ref.id)));
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
function MediaPicker({ mediaUrl, mediaKind, disabled, onChange }: { mediaUrl?: string | null | undefined; mediaKind?: "image" | "video" | null | undefined; disabled: boolean; onChange: (mediaUrl: string | null, mediaKind: "image" | "video" | null) => void }) {
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
  if (mediaUrl) {
    return (
      <div className="relative mt-1 overflow-hidden rounded bg-muted">
        {mediaKind === "video" ? (
          <video src={mediaUrl} className="h-16 w-full object-cover" muted />
        ) : (
          <img src={mediaUrl} alt="" className="h-16 w-full object-cover" />
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
  onSuggest: (index: number, lesson: DraftLesson, methods: string[]) => Promise<MethodSuggestions | undefined>;
  /** Bump focusToken (any changing value) alongside focusIndex to jump the stepper to that lesson's module, even if focusIndex repeats. */
  focusIndex?: number | null;
  focusToken?: number;
  /** The course-level illustration style/characters, decided once in Course details — shown here for reference only; edit it there to keep every lesson's illustrations consistent. */
  illustrationGuide: IllustrationGuide;
  /** Extra controls (e.g. "First content page" / "Rebuild outline") rendered just under the summary line. */
  extraControls?: ReactNode;
  /** The course these lessons belong to — needed to save a SCORM export into its Content Library. */
  courseId: string;
  /** Inserts this one lesson into the course now, as a real studio_lesson, using the (possibly trainer-edited) per-slide text and the generated knowledge-check questions. */
  onCommit: (index: number, lesson: DraftLesson, slideTexts: string[], preview: LessonPagePreview) => void;
};

/** Splits generated lesson text into `count` contiguous, paragraph-sized chunks — one per slide. */
function splitIntoSlides(text: string, count: number): string[] {
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim());
  if (!paragraphs.length) return Array.from({ length: count }, () => "");
  const perSlide = Math.max(1, Math.ceil(paragraphs.length / count));
  return Array.from({ length: count }, (_, i) => paragraphs.slice(i * perSlide, (i + 1) * perSlide).join("\n\n"));
}

export function ManualLessonReview(props: Props) {
  const [splitting, setSplitting] = useState<number | null>(null);
  const [splitAt, setSplitAt] = useState<number | null>(null);
  const [slideEdits, setSlideEdits] = useState<Record<number, string[]>>({});
  const [splitTitle, setSplitTitle] = useState("");
  const [activeGroup, setActiveGroup] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedLessons, setCollapsedLessons] = useState<Set<number>>(() => new Set(props.draft.lessons.map((_, i) => i)));
  const knownLessonCount = useRef(props.draft.lessons.length);
  useEffect(() => {
    if (props.draft.lessons.length > knownLessonCount.current) {
      setCollapsedLessons(prev => {
        const next = new Set(prev);
        for (let i = knownLessonCount.current; i < props.draft.lessons.length; i++) next.delete(i);
        return next;
      });
    }
    knownLessonCount.current = props.draft.lessons.length;
  }, [props.draft.lessons.length]);
  const [approvedSlides, setApprovedSlides] = useState<Record<number, Set<number>>>({});
  const [generatingImageFor, setGeneratingImageFor] = useState<string | null>(null);
  const runGenerateImage = useServerFn(generateLessonImage);
  const runSearchYouTube = useServerFn(searchYouTubeVideo);
  const [searchingVideoFor, setSearchingVideoFor] = useState<number | null>(null);
  const [previewingSlides, setPreviewingSlides] = useState<Record<number, Set<number>>>({});
  const [justMovedSlide, setJustMovedSlide] = useState<Record<number, number>>({});
  const [videoUrlDraft, setVideoUrlDraft] = useState<Record<number, string>>({});
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
    setCollapsed(false);
    setCollapsedLessons(prev => {
      if (!prev.has(props.focusIndex!)) return prev;
      const next = new Set(prev);
      next.delete(props.focusIndex!);
      return next;
    });
    requestAnimationFrame(() =>
      document.getElementById(`outline-lesson-${props.focusIndex}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusToken]);
  return <section aria-label="Detected lessons" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Detected outline</h3>
      <p className="text-xs text-muted-foreground">{moduleCount ? `${moduleCount} modules · ` : ""}{props.draft.lessons.length} lessons · {pageCount} source pages · {Object.values(props.approved).filter(Boolean).length} approved · <span title="A rough reading-time estimate, not a measured figure">~{formatMinutes(props.draft.lessons.reduce((total, l) => total + estimateMinutes(l.body), 0))} total</span></p>
    </div>
    {props.extraControls}
    {props.draft.warnings.length > 0 && <details className="border-l-2 border-border pl-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Source notes ({props.draft.warnings.length})</summary>{props.draft.warnings.map((warning, index) => <p key={index} className="mt-2">{warning}</p>)}</details>}
    <div className="min-w-0 flex-1 space-y-4">
    {groups.length > 1 && <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
      <Button size="sm" variant="ghost" disabled={safeActiveGroup === 0} onClick={() => setActiveGroup(g => g - 1)}>Previous module</Button>
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        Module {safeActiveGroup + 1} of {groups.length} · {visible.label}
      </button>
      <Button size="sm" variant="ghost" disabled={safeActiveGroup === groups.length - 1} onClick={() => setActiveGroup(g => g + 1)}>Next module</Button>
    </div>}
    {!collapsed && <ol className="space-y-4">
      {props.draft.lessons.slice(visible.start, visible.end).map((lesson, offset) => {
        const index = visible.start + offset;
        const pages = lesson.sourceRefs.map(ref => ref.page);
        const selected = props.choices(index, lesson.title, lesson.body);
        const paragraphs = lesson.body.split(/\n{2,}/);
        const newModule = lesson.module && lesson.module !== props.draft.lessons[index - 1]?.module;
        /** Generates an image and saves it onto the given lesson snapshot, returning the updated lesson so callers generating more than one image in a row can thread it through without clobbering each other's field. */
        const generateImageForMethod = async (methodId: "illustrated" | "visual", caption: string, currentLesson: DraftLesson = lesson): Promise<DraftLesson> => {
          const key = `${index}:${methodId}`;
          setGeneratingImageFor(key);
          try {
            const result = await runGenerateImage({ data: { caption } });
            const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: "image/png" });
            const { data: auth } = await supabase.auth.getUser();
            if (!auth.user) { toast.error("Please sign in to upload."); return currentLesson; }
            const path = `${auth.user.id}/${crypto.randomUUID()}-ai-illustration.png`;
            const { error } = await supabase.storage.from(ILLUSTRATION_BUCKET).upload(path, blob, { contentType: "image/png" });
            if (error) { toast.error("Could not save the generated image."); return currentLesson; }
            const { data: pub } = supabase.storage.from(ILLUSTRATION_BUCKET).getPublicUrl(path);
            const updated: DraftLesson = methodId === "illustrated"
              ? { ...currentLesson, illustratedMediaUrl: pub.publicUrl, illustratedMediaKind: "image" }
              : { ...currentLesson, visualMediaUrl: pub.publicUrl, visualMediaKind: "image" };
            props.onEdit(index, updated);
            toast.success(`${methodId === "illustrated" ? "Illustration" : "Identify"} image generated.`);
            return updated;
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not generate an image.");
            return currentLesson;
          } finally {
            setGeneratingImageFor(null);
          }
        };
        const exportLessonScorm = async () => {
          const preview = props.previews[index];
          if (!preview) return;
          try {
            const bytes = await buildLessonScormZip(props.draft.title, preview, crypto.randomUUID());
            const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/zip" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${(lesson.title || "lesson").replace(/\s+/g, "-")}-scorm.zip`;
            a.click();
            URL.revokeObjectURL(url);
          } catch {
            toast.error("Could not export this lesson as SCORM.");
          }
        };
        const saveLessonToLibrary = async () => {
          const preview = props.previews[index];
          if (!preview) return;
          const { data: auth } = await supabase.auth.getUser();
          if (!auth.user) { toast.error("Please sign in to save."); return; }
          try {
            const bytes = await buildLessonScormZip(props.draft.title, preview, crypto.randomUUID());
            const fileName = `${lesson.title || "Lesson"} (SCORM).zip`;
            const path = `${auth.user.id}/${props.courseId}/${crypto.randomUUID()}-${fileName}`.replace(/\s+/g, "-");
            const { error: uploadError } = await supabase.storage
              .from("studio-content")
              .upload(path, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/zip" }), { contentType: "application/zip" });
            if (uploadError) throw uploadError;
            const { error: insertError } = await supabase.from("studio_content_files").insert({
              course_id: props.courseId,
              module_id: null,
              file_name: fileName,
              original_file_name: fileName,
              file_type: "scorm",
              storage_path: path,
              size_bytes: bytes.byteLength,
              description: `SCORM export of "${lesson.title}"`,
              classification: "SCORM package",
              keywords: [],
              file_hash: null,
            });
            if (insertError) throw insertError;
            toast.success("Saved to your Content Library.");
          } catch {
            toast.error("Could not save to the Content Library.");
          }
        };
        return <li key={index} id={`outline-lesson-${index}`} className="min-w-0 scroll-mt-4 space-y-3">
          {newModule && (() => {
          const moduleMinutes = props.draft.lessons.filter(l => l.module === lesson.module).reduce((total, l) => total + estimateMinutes(l.body), 0);
          return <h4 className="flex items-center gap-2 pt-2 text-sm font-semibold text-primary"><FolderOpen className="h-4 w-4" />Module: {lesson.module}<span className="text-xs font-normal text-muted-foreground">~{formatMinutes(moduleMinutes)}</span></h4>;
        })()}
          <div className={`min-w-0 rounded-lg border border-border bg-background p-4 sm:p-5 ${lesson.module ? "sm:ml-4" : ""}`}>
          <div className="flex items-start gap-3">
            {props.approved[index]
              ? <CheckCircle2 className="h-8 w-8 shrink-0 text-primary" aria-label={`Lesson ${index + 1} approved`} />
              : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-sm font-semibold text-secondary-foreground">{index + 1}</span>}
            <div className="min-w-0 flex-1">
              {collapsedLessons.has(index)
                ? <p className="truncate font-semibold">{lesson.title || "Untitled lesson"}</p>
                : <Input aria-label={`Lesson ${index + 1} title`} value={lesson.title} maxLength={120} disabled={props.readOnly || props.busy} onChange={event => props.onEdit(index, { ...lesson, title: event.target.value })} className="font-semibold" />}
              <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                {props.approved[index] ? <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" /> : <Circle className="h-3 w-3 shrink-0" />}
                {pages.length ? `Source pages ${Math.min(...pages)}–${Math.max(...pages)}` : "Pasted source"} · ~{formatMinutes(estimateMinutes(lesson.body))}{props.approved[index] ? " · Approved" : " · Needs review"}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label={collapsedLessons.has(index) ? `Expand lesson ${index + 1}` : `Collapse lesson ${index + 1}`}
              aria-expanded={!collapsedLessons.has(index)}
              onClick={() => setCollapsedLessons(prev => {
                const next = new Set(prev);
                if (next.has(index)) next.delete(index); else next.add(index);
                return next;
              })}
            >
              {collapsedLessons.has(index) ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
          {!collapsedLessons.has(index) && <>
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
              const ref: FormatRef = { source: "method", id: method.id };
              const toggle = () => {
                props.onMethods(index, isSelected ? selected.filter(value => value !== method.id) : [...selected, method.id]);
                if (draggableFormat) updateSlides(isSelected ? removeFormatFromSlides(ref, slides) : placeFormatOnSlide(ref, slides));
              };
              return (
                <div
                  key={method.id}
                  title={method.detail}
                  className="flex shrink-0 items-center gap-1"
                  draggable={draggableFormat && isSelected}
                  onDragStart={draggableFormat && isSelected ? event => {
                    event.dataTransfer.setData("application/json", JSON.stringify({ source: "method", id: method.id }));
                    event.dataTransfer.effectAllowed = "copy";
                  } : undefined}
                >
                  <Button
                    type="button"
                    size="sm"
                    variant={isSelected ? "secondary" : "outline"}
                    aria-pressed={isSelected}
                    title={draggableFormat ? (isSelected ? "Selected — drag to move it to another slide" : "Select to add it to a slide") : undefined}
                    className={draggableFormat && isSelected ? "cursor-grab active:cursor-grabbing" : undefined}
                    onClick={toggle}
                  >
                    {method.icon && <method.icon className="h-3.5 w-3.5" />}
                    {method.label}
                  </Button>
                </div>
              );
            };
            const renderDeliveryChip = (item: (typeof DELIVERY_FORMAT_ITEMS)[number]) => {
              const enabledFormats = lesson.enabledFormats ?? [];
              const isScorm = item.id === "scorm";
              // Attaching a package switches SCORM on by itself; other delivery mediums toggle like any other option.
              const isSelected = isScorm ? !!lesson.scormFile : enabledFormats.includes(item.id);
              const ref: FormatRef = { source: "delivery", id: item.id };
              const toggle = () => {
                if (isScorm) { promptScormUpload(); return; }
                const nextSlides = isSelected ? removeFormatFromSlides(ref, slides) : placeFormatOnSlide(ref, slides);
                props.onEdit(index, {
                  ...lesson,
                  enabledFormats: isSelected ? enabledFormats.filter(id => id !== item.id) : [...enabledFormats, item.id],
                  kind: "slide",
                  slideKinds: nextSlides,
                });
              };
              return (
                <div
                  role="button"
                  tabIndex={0}
                  key={item.id}
                  draggable={isSelected}
                  onDragStart={isSelected ? event => { event.dataTransfer.setData("application/json", JSON.stringify({ source: "delivery", id: item.id })); event.dataTransfer.effectAllowed = "copy"; } : undefined}
                  onClick={!props.readOnly && !props.busy ? toggle : undefined}
                  onKeyDown={!props.readOnly && !props.busy ? event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } } : undefined}
                  title={isScorm ? (lesson.scormFile ? `Attached: ${lesson.scormFile.name}` : "Click to upload a SCORM package") : isSelected ? "Selected — drag to move it to another slide" : "Select to add it to a slide"}
                  className={`flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium ${isSelected ? "cursor-grab active:cursor-grabbing border-primary bg-primary/10" : "cursor-pointer border-border bg-background"}`}
                >
                  <item.icon className="h-3.5 w-3.5" />{item.label}
                  {isScorm && lesson.scormFile && <Check className="h-3 w-3 text-primary" />}
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
            /** Every format the trainer has switched on anywhere in this lesson — placeable onto any slide, including a slide that already holds other formats. */
            const placeableRefs: FormatRef[] = [
              ...trainingFormatMethods.filter(m => selected.includes(m.id)).map(m => ({ source: "method" as const, id: m.id })),
              ...DELIVERY_FORMAT_ITEMS.filter(d => (d.id === "scorm" ? !!lesson.scormFile : (lesson.enabledFormats ?? []).includes(d.id))).map(d => ({ source: "delivery" as const, id: d.id })),
            ];
            const promptScormUpload = () => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".zip,application/zip,application/x-zip-compressed";
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                if (!/\.zip$/i.test(file.name)) { toast.error("Choose a SCORM .zip package."); return; }
                if (file.size > MAX_MEDIA_BYTES) { toast.error("File must be smaller than 25MB."); return; }
                const { data: auth } = await supabase.auth.getUser();
                if (!auth.user) { toast.error("Please sign in to upload."); return; }
                const path = `${auth.user.id}/${crypto.randomUUID()}-${file.name}`.replace(/\s+/g, "-");
                const { error } = await supabase.storage.from(ILLUSTRATION_BUCKET).upload(path, file, { contentType: "application/zip" });
                if (error) { toast.error("Could not upload the SCORM package."); return; }
                const { data } = supabase.storage.from(ILLUSTRATION_BUCKET).getPublicUrl(path);
                props.onEdit(index, {
                  ...lesson,
                  scormFile: { url: data.publicUrl, name: file.name },
                  kind: "slide",
                  slideKinds: placeFormatOnSlide({ source: "delivery", id: "scorm" }, slides),
                });
                toast.success(`Attached "${file.name}".`);
              };
              input.click();
            };
            return (
              <>
                <fieldset disabled={props.readOnly || props.busy} className="mt-4 space-y-3">
                  <legend className="text-xs font-semibold text-muted-foreground">Training format</legend>
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Slides</span>
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
                  <p className="text-xs text-muted-foreground">Selecting a format below adds it to a slide automatically — drag it to move it to another slide, and drag a slide's grip to reorder slides.</p>
                  {selected.includes("illustrated") && (
                    <p className="text-xs text-muted-foreground" title="Set once in Course details so every lesson's illustrations stay consistent">
                      Illustrated explanation uses the course style: {props.illustrationGuide.style}
                      {props.illustrationGuide.characters.length > 0 && ` · Characters: ${props.illustrationGuide.characters.map(c => c.name).join(", ")}`}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {DELIVERY_FORMAT_ITEMS.filter(d => d.position === "before").map(renderDeliveryChip)}
                    {trainingFormatMethods.map(method => renderMethodToggle(method, true))}
                    {DELIVERY_FORMAT_ITEMS.filter(d => d.position === "after").map(renderDeliveryChip)}
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
                            const dropped = JSON.parse(raw) as FormatRef | { source: "slide"; index: number };
                            if (dropped.source === "slide") {
                              const from = dropped.index;
                              if (from === si) return;
                              const reordered = [...slides];
                              const moved = reordered.splice(from, 1)[0];
                              if (!moved) return;
                              reordered.splice(si, 0, moved);
                              updateSlides(reordered);
                              setJustMovedSlide(p => ({ ...p, [index]: si }));
                              window.setTimeout(() => setJustMovedSlide(p => {
                                if (p[index] !== si) return p;
                                const next = { ...p };
                                delete next[index];
                                return next;
                              }), 700);
                              return;
                            }
                            const ref = dropped;
                            updateSlides(slides.map((f, i) => (i === si ? (f.some(x => x.source === ref.source && x.id === ref.id) ? f : [...f, ref]) : f)));
                          } catch { /* ignore a non-format drop */ }
                        }}
                        className={`relative flex min-h-32 w-36 flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-background p-2 pt-6 transition-all duration-300 ease-out ${justMovedSlide[index] === si ? "scale-105 border-primary border-solid bg-primary/10 shadow-md" : "border-border"}`}
                      >
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`Drag to reorder slide ${si + 1}`}
                          title="Drag to reorder"
                          draggable={!props.readOnly && !props.busy}
                          onDragStart={event => {
                            event.dataTransfer.setData("application/json", JSON.stringify({ source: "slide", index: si }));
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          className="absolute left-1 top-1 flex cursor-grab items-center text-muted-foreground active:cursor-grabbing"
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </span>
                        <span className="absolute left-6 top-1.5 text-xs text-muted-foreground">Slide {si + 1}</span>
                        {!props.readOnly && !props.busy && (
                          <button type="button" aria-label={`Delete slide ${si + 1}`} onClick={() => updateSlides(slides.filter((_, i) => i !== si))} className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-destructive">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {formats.length ? (
                          <div className="mt-3 flex w-full flex-col items-stretch gap-1.5 px-1">
                            {formats.map(ref => {
                              const meta = formatMeta(ref);
                              const Icon = meta?.icon ?? FileText;
                              const label = meta?.label ?? ref.id;
                              return (
                                <span key={`${ref.source}:${ref.id}`} className="flex items-center gap-1.5 rounded bg-secondary px-1.5 py-1">
                                  <Icon className="h-5 w-5 shrink-0 text-secondary-foreground" />
                                  <span className="flex-1 truncate text-left text-xs text-secondary-foreground">{label}</span>
                                  {!props.readOnly && !props.busy && (
                                    <button type="button" aria-label={`Remove ${label} from slide ${si + 1}`} onClick={() => updateSlides(slides.map((f, i) => (i === si ? f.filter(x => !(x.source === ref.source && x.id === ref.id)) : f)))}>
                                      <X className="h-3 w-3 shrink-0 text-secondary-foreground" />
                                    </button>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <FileText className="mt-3 h-7 w-7 text-muted-foreground" />
                        )}
                        {!props.readOnly && !props.busy && (() => {
                          const available = placeableRefs.filter(ref => !formats.some(f => f.source === ref.source && f.id === ref.id));
                          if (!available.length) return null;
                          return (
                            <select
                              aria-label={`Add a format to slide ${si + 1}`}
                              value=""
                              onChange={event => {
                                const [source, id] = event.target.value.split(":") as [FormatRef["source"], string];
                                if (!source || !id) return;
                                updateSlides(slides.map((f, i) => (i === si ? [...f, { source, id }] : f)));
                              }}
                              className="mt-1 w-full rounded border border-dashed border-border bg-background px-1 text-[11px] text-muted-foreground"
                            >
                              <option value="">+ Add format…</option>
                              {available.map(ref => (
                                <option key={`${ref.source}:${ref.id}`} value={`${ref.source}:${ref.id}`}>{formatMeta(ref)?.label ?? ref.id}</option>
                              ))}
                            </select>
                          );
                        })()}
                      </div>
                    ))}
                    {!props.readOnly && !props.busy && slides.length < MAX_SLIDES && (
                      <button type="button" onClick={() => updateSlides([...slides, []])} className="flex min-h-32 w-36 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary">
                        <Plus className="h-7 w-7" />
                        <span className="text-xs">Add slide</span>
                      </button>
                    )}
                  </div>
                </fieldset>
                <fieldset disabled={props.readOnly || props.busy} className="mt-4 space-y-2 border-t border-border pt-3">
                  <legend className="text-xs font-semibold text-muted-foreground">Knowledge check</legend>
                  <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">{testLearningMethods.map(method => renderMethodToggle(method))}</div>
                </fieldset>
              </>
            );
          })()}
          {(() => {
            const needsGeneration = selected.length > 0;
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
                  disabled={props.readOnly || props.suggestLoading !== null || lesson.body.length < 100}
                  onClick={() => {
                    const methodsToGenerate = selected.filter((id) => props.methods.some((m) => m.id === id));
                    if (!methodsToGenerate.length) return;
                    void (async () => {
                      const result = await props.onSuggest(index, lesson, methodsToGenerate);
                      if (!result) return;
                      let currentLesson = lesson;
                      for (const methodId of ["illustrated", "visual"] as const) {
                        if (!selected.includes(methodId)) continue;
                        const caption = methodId === "illustrated" ? result.illustrated : result.visual;
                        if (caption) currentLesson = await generateImageForMethod(methodId, caption, currentLesson);
                      }
                      if (selected.includes("facts") && result.facts?.length) {
                        const existing = currentLesson.factCards ?? [];
                        currentLesson = {
                          ...currentLesson,
                          factCards: result.facts.map((fact, i) => ({ ...fact, mediaUrl: existing[i]?.mediaUrl ?? null, mediaKind: existing[i]?.mediaKind ?? null })),
                        };
                        props.onEdit(index, currentLesson);
                      }
                    })();
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
          {props.previews[index] && (() => {
            const preview = props.previews[index]!;
            const slides = lesson.slideKinds ?? defaultSlides();
            const slideTexts = slideEdits[index] ?? splitIntoSlides(preview.lessonSummary, slides.length);
            return <div className="mt-4 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="text-xs font-semibold text-primary">AI-generated page preview — adjust each slide, then commit it to the course</p>
              <HeroBanner title={lesson.title} />
              {(["illustrated", "visual"] as const).filter(methodId => selected.includes(methodId)).map(methodId => {
                const caption = methodId === "illustrated" ? props.suggestions[index]?.illustrated : props.suggestions[index]?.visual;
                const key = `${index}:${methodId}`;
                const generating = generatingImageFor === key;
                const mediaUrl = methodId === "illustrated" ? lesson.illustratedMediaUrl : lesson.visualMediaUrl;
                const mediaKind = methodId === "illustrated" ? lesson.illustratedMediaKind : lesson.visualMediaKind;
                return (
                  <div key={methodId} className="max-w-xs space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{methodId === "illustrated" ? "Illustration" : "Identify"}</p>
                    {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
                    {mediaUrl && (
                      <div className="overflow-hidden rounded bg-muted">
                        {mediaKind === "video" ? <video src={mediaUrl} className="h-24 w-full object-cover" muted /> : <img src={mediaUrl} alt="" className="h-24 w-full object-cover" />}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1">
                      <Button size="sm" variant="outline" disabled={props.readOnly || props.busy || generating || !caption} onClick={() => void generateImageForMethod(methodId, caption!)}>
                        <Sparkles className="h-3.5 w-3.5" />{generating ? "Generating…" : mediaUrl ? "Regenerate with AI" : "Generate image with AI"}
                      </Button>
                    </div>
                    <MediaPicker
                      mediaUrl={mediaUrl}
                      mediaKind={mediaKind}
                      disabled={props.readOnly || props.busy}
                      onChange={(nextUrl, nextKind) => props.onEdit(index, methodId === "illustrated"
                        ? { ...lesson, illustratedMediaUrl: nextUrl, illustratedMediaKind: nextKind }
                        : { ...lesson, visualMediaUrl: nextUrl, visualMediaKind: nextKind })}
                    />
                  </div>
                );
              })}
              {selected.includes("video") && (() => {
                const videoQueries = props.suggestions[index]?.videoQueries ?? [];
                const isYouTube = lesson.videoMediaKind === "youtube" && !!lesson.videoMediaUrl;
                const youTubeId = isYouTube ? extractYouTubeId(lesson.videoMediaUrl!) : null;
                const embedUrl = () => {
                  const draft = videoUrlDraft[index]?.trim();
                  if (!draft) return;
                  const id = extractYouTubeId(draft);
                  if (!id) { toast.error("That doesn't look like a YouTube link."); return; }
                  props.onEdit(index, { ...lesson, videoMediaUrl: draft, videoMediaKind: "youtube" });
                  setVideoUrlDraft(p => ({ ...p, [index]: "" }));
                };
                const searchAndEmbed = async (query: string) => {
                  setSearchingVideoFor(index);
                  try {
                    const result = await runSearchYouTube({ data: { query } });
                    if (!result.configured) { toast.error("YouTube search isn't set up yet — paste a link instead, or ask an admin to add YOUTUBE_DATA_API_KEY."); return; }
                    if (!result.videoId) { toast.error("No matching video found for that search — try another, or paste a link."); return; }
                    props.onEdit(index, { ...lesson, videoMediaUrl: `https://youtu.be/${result.videoId}`, videoMediaKind: "youtube" });
                    toast.success(result.title ? `Embedded "${result.title}" — check it's relevant before publishing.` : "Video embedded — check it's relevant before publishing.");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not search YouTube.");
                  } finally {
                    setSearchingVideoFor(null);
                  }
                };
                return (
                  <div className="max-w-xs space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Video</p>
                    {videoQueries.length ? (
                      <ul className="space-y-1">
                        {videoQueries.map((query, qi) => (
                          <li key={qi} className="flex items-center gap-1.5">
                            {!props.readOnly && !props.busy && (
                              <Button size="sm" variant="outline" className="h-6 px-1.5 text-[11px]" disabled={searchingVideoFor === index} onClick={() => void searchAndEmbed(query)}>
                                {searchingVideoFor === index ? <Loader2 className="h-3 w-3 animate-spin" /> : <Video className="h-3 w-3" />}{lesson.videoMediaUrl ? "Replace" : "Use this"}
                              </Button>
                            )}
                            <a
                              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary underline underline-offset-2 hover:no-underline"
                            >
                              {query}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">Generate to get YouTube search suggestions for this lesson.</p>
                    )}
                    {isYouTube ? (
                      youTubeId ? (
                        <div className="space-y-1">
                          <InteractiveVideoPlayer kind="youtube" src={youTubeId} interactions={lesson.videoInteractions ?? []} />
                          {!props.readOnly && !props.busy && (
                            <Button size="sm" variant="ghost" onClick={() => props.onEdit(index, { ...lesson, videoMediaUrl: null, videoMediaKind: null })}>
                              <X className="h-3.5 w-3.5" />Remove video
                            </Button>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-destructive">Saved video link couldn't be parsed — remove and re-add it.</p>
                      )
                    ) : (
                      <>
                        {lesson.videoMediaUrl && lesson.videoMediaKind === "video" ? (
                          <div className="space-y-1">
                            <InteractiveVideoPlayer kind="file" src={lesson.videoMediaUrl} interactions={lesson.videoInteractions ?? []} />
                          </div>
                        ) : lesson.videoMediaUrl ? (
                          <div className="overflow-hidden rounded bg-muted">
                            <img src={lesson.videoMediaUrl} alt="" className="h-24 w-full object-cover" />
                          </div>
                        ) : null}
                        {!lesson.videoMediaUrl && !props.readOnly && !props.busy && (
                          <div className="flex items-center gap-1">
                            <Input
                              aria-label="YouTube link"
                              placeholder="Paste a YouTube link"
                              value={videoUrlDraft[index] ?? ""}
                              onChange={event => setVideoUrlDraft(p => ({ ...p, [index]: event.target.value }))}
                              onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); embedUrl(); } }}
                              className="h-8 text-xs"
                            />
                            <Button size="sm" variant="outline" disabled={!videoUrlDraft[index]?.trim()} onClick={embedUrl}>Embed</Button>
                          </div>
                        )}
                        <MediaPicker
                          mediaUrl={lesson.videoMediaUrl}
                          mediaKind={lesson.videoMediaKind === "youtube" ? null : lesson.videoMediaKind}
                          disabled={props.readOnly || props.busy}
                          onChange={(nextUrl, nextKind) => props.onEdit(index, { ...lesson, videoMediaUrl: nextUrl, videoMediaKind: nextKind })}
                        />
                      </>
                    )}
                    {(isYouTube ? youTubeId : lesson.videoMediaKind === "video") && (() => {
                      const points = [...(lesson.videoInteractions ?? [])].sort((a, b) => a.atSeconds - b.atSeconds);
                      const updatePoints = (next: { atSeconds: number; note: string }[]) => props.onEdit(index, { ...lesson, videoInteractions: next });
                      return (
                        <fieldset disabled={props.readOnly || props.busy} className="space-y-1.5 border-t border-border pt-2">
                          <legend className="text-xs font-medium text-muted-foreground">Pause points — video stops here until the learner clicks Continue</legend>
                          {points.map((point, pi) => (
                            <div key={pi} className="flex items-start gap-1">
                              <Input
                                aria-label={`Pause point ${pi + 1} time`}
                                defaultValue={formatSeconds(point.atSeconds)}
                                onBlur={event => {
                                  const seconds = parseTimeInput(event.target.value);
                                  if (seconds == null) { toast.error("Use mm:ss, e.g. 1:30."); event.target.value = formatSeconds(point.atSeconds); return; }
                                  updatePoints(points.map((p, i) => (i === pi ? { ...p, atSeconds: seconds } : p)));
                                }}
                                className="h-8 w-16 text-xs"
                              />
                              <Textarea
                                aria-label={`Pause point ${pi + 1} note`}
                                rows={1}
                                value={point.note}
                                onChange={event => updatePoints(points.map((p, i) => (i === pi ? { ...p, note: event.target.value } : p)))}
                                className="min-h-0 resize-none text-xs"
                              />
                              <Button size="icon" variant="ghost" aria-label={`Remove pause point ${pi + 1}`} onClick={() => updatePoints(points.filter((_, i) => i !== pi))}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                          {!props.readOnly && !props.busy && (
                            <Button size="sm" variant="outline" onClick={() => updatePoints([...points, { atSeconds: 0, note: "" }])}>
                              <Plus className="h-3.5 w-3.5" />Add pause point
                            </Button>
                          )}
                        </fieldset>
                      );
                    })()}
                  </div>
                );
              })()}
              {selected.includes("facts") && !!lesson.factCards?.length && (() => {
                const cards = lesson.factCards!;
                const citedPage = lesson.sourceRefs[0]?.page;
                const updateCard = (ci: number, patch: Partial<(typeof cards)[number]>) =>
                  props.onEdit(index, { ...lesson, factCards: cards.map((c, i) => (i === ci ? { ...c, ...patch } : c)) });
                return (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Fact cards</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {cards.map((card, ci) => (
                        <div key={ci} className="space-y-1 rounded-md border border-border bg-background p-2">
                          <Input
                            aria-label={`Fact card ${ci + 1} claim`}
                            value={card.claim}
                            disabled={props.readOnly || props.busy}
                            onChange={event => updateCard(ci, { claim: event.target.value })}
                            className="h-7 text-xs font-semibold"
                          />
                          <Textarea
                            aria-label={`Fact card ${ci + 1} evidence`}
                            rows={2}
                            value={card.evidence}
                            disabled={props.readOnly || props.busy}
                            onChange={event => updateCard(ci, { evidence: event.target.value })}
                            className="resize-none text-xs"
                          />
                          {citedPage != null && <p className="text-[11px] italic text-muted-foreground">Source: page {citedPage}</p>}
                          <MediaPicker
                            mediaUrl={card.mediaUrl}
                            mediaKind={card.mediaKind}
                            disabled={props.readOnly || props.busy}
                            onChange={(nextUrl, nextKind) => updateCard(ci, { mediaUrl: nextUrl, mediaKind: nextKind })}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {lesson.kind === "slide" ? (
                <div className="space-y-3">
                  {slideTexts.map((text, si) => {
                    const slideApproved = approvedSlides[index]?.has(si) ?? false;
                    const slidePreviewing = previewingSlides[index]?.has(si) ?? false;
                    const toggleSet = (setter: typeof setApprovedSlides) => setter(p => {
                      const next = new Set(p[index] ?? []);
                      if (next.has(si)) next.delete(si); else next.add(si);
                      return { ...p, [index]: next };
                    });
                    return (
                      <div key={si} className="space-y-2 rounded-md border border-border bg-background p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-muted-foreground">Slide {si + 1}{slideApproved && " · Approved"}</p>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" disabled={props.readOnly || props.busy} onClick={() => toggleSet(setPreviewingSlides)}>{slidePreviewing ? "Edit" : "Preview"}</Button>
                            <Button size="sm" variant={slideApproved ? "secondary" : "outline"} disabled={props.readOnly || props.busy} onClick={() => toggleSet(setApprovedSlides)}><Check className="h-3.5 w-3.5" />{slideApproved ? "Reopen" : "Approve"}</Button>
                          </div>
                        </div>
                        {slidePreviewing ? <FormattedLesson content={text} /> : (
                          <Textarea
                            aria-label={`Slide ${si + 1} content`}
                            value={text}
                            rows={autoRows(text, 2)}
                            disabled={props.readOnly || props.busy}
                            onChange={event => setSlideEdits(p => ({ ...p, [index]: slideTexts.map((t, i) => (i === si ? event.target.value : t)) }))}
                            className="resize-none text-sm"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : <FormattedLesson content={preview.lessonSummary} />}
              {preview.questions.map((q, i) => (
                <div key={i} className="space-y-1 border-t border-border pt-2 text-sm">
                  <p className="font-medium">{i + 1}. {q.question}</p>
                  {q.options.map((option, j) => (
                    <p key={j} className="text-sm">{j === q.correctIndex ? "✓ " : "○ "}{option}</p>
                  ))}
                  <p className="text-xs italic text-muted-foreground">Source quote: {q.sourceQuote}</p>
                </div>
              ))}
              {!!preview.droppedUnsupportedQuestions && (
                <p className="text-xs text-muted-foreground">{preview.droppedUnsupportedQuestions} question(s) removed — their source quotes weren't found in the text.</p>
              )}
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                <Button size="sm" variant="outline" onClick={() => void exportLessonScorm()}><Package className="h-4 w-4" />Export SCORM</Button>
                <Button size="sm" variant="outline" onClick={() => void saveLessonToLibrary()}><Library className="h-4 w-4" />Save to Content Library</Button>
                <Button
                  size="sm"
                  disabled={props.readOnly || props.busy || (lesson.kind === "slide" && !slideTexts.every((_, si) => approvedSlides[index]?.has(si)))}
                  title={lesson.kind === "slide" ? "Approve every slide above first" : undefined}
                  onClick={() => props.onCommit(index, lesson, slideTexts, preview)}
                >
                  <Check className="h-4 w-4" />Commit to course
                </Button>
              </div>
            </div>;
          })()}
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
          </>}
          </div>
        </li>;
      })}
    </ol>}
    </div>
  </section>;
}