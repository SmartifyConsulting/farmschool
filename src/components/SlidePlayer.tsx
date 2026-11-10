import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Lightbulb, Pin, RotateCw, TriangleAlert } from "lucide-react";
import { FormattedLesson } from "@/components/FormattedLesson";
import { PhotoEvidence } from "@/components/PhotoEvidence";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LessonSlide, SlideBlock } from "@/lib/lesson-slides";

type State = { index: number; seen: number[]; checked: string[] };
const initial: State = { index: 0, seen: [0], checked: [] };
function restore(key: string | undefined, length: number): State {
  if (!key) return initial;
  try {
    const state: State = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      state &&
      Number.isInteger(state.index) &&
      state.index >= 0 &&
      state.index < length &&
      Array.isArray(state.seen) &&
      Array.isArray(state.checked)
    ) {
      return {
        ...state,
        seen: [...new Set(state.seen.filter((n) => Number.isInteger(n) && n >= 0 && n < length))],
      };
    }
  } catch {
    /* Storage can be unavailable. */
  }
  return initial;
}

export function SlidePlayer({
  slides,
  storageKey,
  completed,
  onComplete,
  saving,
  lessonId,
  isTrainer,
}: {
  slides: LessonSlide[];
  storageKey?: string;
  completed?: boolean;
  onComplete?: () => void;
  saving?: boolean;
  /** Needed only when a slide has a photo block, to scope the evidence upload/review. */
  lessonId?: string;
  isTrainer?: boolean;
}) {
  const [state, setState] = useState(() => restore(storageKey, slides.length));
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const update = (next: State) => {
    setState(next);
    if (storageKey)
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* Continue in memory. */
      }
  };
  const move = (delta: number) => {
    const index = state.index + delta;
    if (index < 0 || index >= slides.length) return;
    update({ ...state, index, seen: [...new Set([...state.seen, index])] });
  };
  const slide = slides[state.index];
  if (!slide) return <p className="text-sm text-muted-foreground">No slides yet.</p>;
  const allSeen = state.seen.length === slides.length;
  return (
    <section className="space-y-3" aria-label="Lesson slides">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <p role="status">
          Slide {state.index + 1} of {slides.length}
          {slide.title ? " · " + slide.title : ""}
        </p>
        <p>{state.seen.length} viewed</p>
      </div>
      <progress
        className="block h-2 w-full accent-primary"
        aria-label="Slides viewed"
        value={state.seen.length}
        max={slides.length}
      />
      <div
        className="min-h-48 space-y-4 rounded-2xl border border-border bg-card p-4 [touch-action:pan-y_pinch-zoom] md:p-6"
        onTouchStart={(event) => {
          gesture.current = null;
          if (
            event.touches.length !== 1 ||
            (event.target instanceof Element &&
              event.target.closest("button,input,a,select,textarea,summary,[role=tablist]"))
          )
            return;
          const touch = event.touches[0];
          if (touch) gesture.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchCancel={() => {
          gesture.current = null;
        }}
        onTouchEnd={(event) => {
          const start = gesture.current;
          const touch = event.changedTouches[0];
          gesture.current = null;
          if (!start || !touch || event.touches.length) return;
          const x = touch.clientX - start.x;
          const y = touch.clientY - start.y;
          if (Math.abs(x) > 50 && Math.abs(x) > Math.abs(y) * 1.5) move(x < 0 ? 1 : -1);
        }}
      >
        {slide.title && <h3 className="text-lg font-semibold">{slide.title}</h3>}
        {slide.blocks.map((block, i) => (
          <Block
            key={state.index + ":" + i}
            block={block}
            lessonId={lessonId}
            blockIndex={i}
            isTrainer={!!isTrainer}
            checked={(item) => state.checked.includes([state.index, i, item].join(":"))}
            toggle={(item) => {
              const key = [state.index, i, item].join(":");
              update({
                ...state,
                checked: state.checked.includes(key)
                  ? state.checked.filter((value) => value !== key)
                  : [...state.checked, key],
              });
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => move(-1)} disabled={!state.index}>
          <ChevronLeft /> Previous
        </Button>
        {state.index < slides.length - 1 ? (
          <Button type="button" onClick={() => move(1)}>
            Next <ChevronRight />
          </Button>
        ) : (
          onComplete && (
            <Button type="button" onClick={onComplete} disabled={!allSeen || completed || saving}>
              {completed ? "Completed" : saving ? "Saving…" : "Complete lesson"}
            </Button>
          )
        )}
      </div>
    </section>
  );
}

function Block({
  block,
  checked,
  toggle,
  lessonId,
  blockIndex,
  isTrainer,
}: {
  block: SlideBlock;
  checked: (item: number) => boolean;
  toggle: (item: number) => void;
  lessonId: string | undefined;
  blockIndex: number;
  isTrainer: boolean;
}) {
  const [flipped, setFlipped] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  if (block.kind === "text") return <FormattedLesson content={block.body} />;
  if (block.kind === "photo")
    return lessonId ? (
      <PhotoEvidence
        lessonId={lessonId}
        blockIndex={blockIndex}
        prompt={block.prompt}
        isTrainer={isTrainer}
      />
    ) : null;
  if (block.kind === "hotspot")
    return (
      <div className="relative overflow-hidden rounded-xl border border-border">
        <img src={block.image} alt="" className="w-full" />
        {block.points.map((point, i) => (
          <button
            key={i}
            type="button"
            aria-label={point.label}
            onClick={() => setOpen(open === i ? null : i)}
            style={{ left: point.x + "%", top: point.y + "%" }}
            className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary-foreground bg-primary text-xs font-bold text-primary-foreground shadow"
          >
            {i + 1}
          </button>
        ))}
        {open !== null && block.points[open] && (
          <div className="absolute inset-x-2 bottom-2 space-y-1 rounded-lg border border-border bg-card/95 p-3 backdrop-blur">
            <p className="text-sm font-semibold">{block.points[open]!.label}</p>
            <FormattedLesson content={block.points[open]!.body} />
          </div>
        )}
      </div>
    );
  if (block.kind === "flip")
    return (
      <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          {flipped ? "Answer" : "Flashcard"}
        </p>
        <div aria-live="polite">
          <FormattedLesson content={flipped ? block.back : block.front} />
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setFlipped(!flipped)}>
          <RotateCw />
          {flipped ? "Show front" : "Flip for answer"}
        </Button>
      </div>
    );
  if (block.kind === "checklist")
    return (
      <fieldset className="space-y-2 rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-semibold">Checklist</legend>
        {block.items.map((item, i) => (
          <label key={i} className="flex min-h-9 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-primary"
              checked={checked(i)}
              onChange={() => toggle(i)}
            />
            {item}
          </label>
        ))}
      </fieldset>
    );
  if (block.kind === "tabs")
    return (
      <Tabs defaultValue="0">
        <TabsList className="h-auto flex-wrap justify-start" aria-label="Slide topics">
          {block.items.map(({ label }, i) => (
            <TabsTrigger key={i} value={String(i)} className="whitespace-normal">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {block.items.map(({ body }, i) => (
          <TabsContent key={i} value={String(i)}>
            <FormattedLesson content={body} />
          </TabsContent>
        ))}
      </Tabs>
    );
  if (block.kind === "accordion")
    return (
      <div className="space-y-2">
        {block.items.map(({ label, body }, i) => (
          <details key={i} className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold">{label}</summary>
            <div className="mt-2">
              <FormattedLesson content={body} />
            </div>
          </details>
        ))}
      </div>
    );
  if ("body" in block) {
    const Icon = block.kind === "warning" ? TriangleAlert : block.kind === "tip" ? Lightbulb : Pin;
    const label =
      block.kind === "warning"
        ? "Safety warning"
        : block.kind === "tip"
          ? "Pro tip"
          : "Key takeaway";
    return (
      <aside
        aria-label={label}
        className={
          "space-y-1 rounded-lg border-l-4 p-3 " +
          (block.kind === "warning"
            ? "border-destructive bg-destructive/10"
            : "border-primary bg-primary/5")
        }
      >
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4" />
          {label}
        </p>
        <FormattedLesson content={block.body} />
      </aside>
    );
  }
  return null;
}
