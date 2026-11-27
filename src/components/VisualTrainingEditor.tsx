import { useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LessonBlockPreview } from "@/components/SlidePlayer";
import { TrainingPartFields } from "@/components/TrainingPartFields";
import { BLOCK_TEMPLATES } from "@/lib/lesson-block-editor";
import { parseBlocks, parseLessonSlides, type SlideBlock } from "@/lib/lesson-slides";
import {
  MAX_TRAINING_BODY,
  insertTrainingPart,
  updateTrainingPart,
} from "@/lib/visual-training-editor";

/** The same blocks learners see, with editing controls kept outside their content. */
export function VisualTrainingEditor({
  value,
  onChange,
  lessonTitle,
  maxLength = MAX_TRAINING_BODY,
}: {
  value: string;
  onChange: (value: string) => void;
  lessonTitle: string;
  maxLength?: number;
}) {
  const slides = parseLessonSlides(value);
  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, Math.max(0, slides.length - 1));
  const slide = slides[index];
  const [editing, setEditing] = useState<{
    index: number;
    block: SlideBlock;
    baseline: string;
  } | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const apply = (next: string) => {
    if (next.length > maxLength) {
      toast.error(
        "This lesson is too long. Shorten a part or use a hosted image before adding more content.",
      );
      return false;
    }
    setUndo(value);
    onChange(next);
    setEditing(null);
    setAdding(null);
    return true;
  };
  const chooseSlide = (next: number) => {
    setSelected(next);
    setEditing(null);
    setAdding(null);
  };
  const add = (template: (typeof BLOCK_TEMPLATES)[number]) => {
    const block = parseBlocks(template.source)[0];
    if (!block) return;
    const position = (adding ?? -1) + 1;
    const next = insertTrainingPart(value, index, adding ?? -1, block);
    if (apply(next)) setEditing({ index: position, block, baseline: next });
  };
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <h2 className="text-lg font-semibold">{lessonTitle}</h2>
        {undo !== null && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onChange(undo);
              setUndo(null);
              setEditing(null);
              setAdding(null);
            }}
          >
            Undo last change
          </Button>
        )}
        <label className="flex items-center gap-2 text-sm">
          Slide
          <select
            aria-label="Training slide"
            className="max-w-72 rounded-md border bg-background px-2 py-1.5"
            value={index}
            onChange={(e) => chooseSlide(Number(e.target.value))}
          >
            {slides.map((item, i) => (
              <option key={i} value={i}>
                {i + 1}. {item.title || "Introduction"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        className={editing ? "grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]" : "min-w-0"}
      >
        <section aria-label="Rendered training" className="min-w-0 space-y-4">
          <h3 className="text-xl font-semibold">{slide?.title}</h3>
          {slide?.blocks.map((block, bi) => (
            <section
              key={`${index}:${bi}`}
              className="group min-w-0 rounded-lg border border-transparent p-3 hover:border-border focus-within:border-border"
            >
              <div
                className="mb-3 flex flex-wrap justify-end gap-1"
                aria-label={`Webpart ${bi + 1} controls`}
              >
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing({ index: bi, block: structuredClone(block), baseline: value });
                    setAdding(null);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAdding(bi);
                    setEditing(null);
                  }}
                >
                  Add part
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`More actions for webpart ${bi + 1}`}
                    >
                      More
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={bi === 0}
                      onSelect={() => apply(updateTrainingPart(value, index, bi, "up"))}
                    >
                      Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bi === slide.blocks.length - 1}
                      onSelect={() => apply(updateTrainingPart(value, index, bi, "down"))}
                    >
                      Move down
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => apply(updateTrainingPart(value, index, bi, "duplicate"))}
                    >
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => apply(updateTrainingPart(value, index, bi, "remove"))}
                    >
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <LessonBlockPreview key={JSON.stringify(block)} block={block} />
            </section>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAdding((slide?.blocks.length ?? 0) - 1);
              setEditing(null);
            }}
          >
            Add webpart
          </Button>
          {adding !== null && (
            <section aria-label="Choose a webpart" className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-semibold">Add a webpart</p>
              <div className="flex flex-wrap gap-2">
                {BLOCK_TEMPLATES.filter((t) => t.kind !== "photo").map((template) => (
                  <Button
                    key={template.kind}
                    size="sm"
                    variant="outline"
                    onClick={() => add(template)}
                  >
                    {template.label}
                  </Button>
                ))}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>
                Cancel
              </Button>
            </section>
          )}
          <div className="flex justify-between border-t pt-3">
            <Button
              size="sm"
              variant="outline"
              disabled={index === 0}
              onClick={() => chooseSlide(index - 1)}
            >
              Previous slide
            </Button>
            <span className="supporting-text">
              {index + 1} / {slides.length}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={index === slides.length - 1}
              onClick={() => chooseSlide(index + 1)}
            >
              Next slide
            </Button>
          </div>
        </section>
        {editing && (
          <aside
            aria-label="Edit webpart"
            className="min-w-0 space-y-3 rounded-lg border bg-card p-4 lg:sticky lg:top-0 lg:self-start"
          >
            <h3 className="text-sm font-semibold">Edit webpart</h3>
            <TrainingPartFields
              block={editing.block}
              onChange={(block) => setEditing({ ...editing, block })}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (value !== editing.baseline) {
                    toast.error(
                      "This lesson changed while you were editing. Reopen the part to keep the latest content.",
                    );
                    return;
                  }
                  apply(updateTrainingPart(value, index, editing.index, "replace", editing.block));
                }}
              >
                Apply changes
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
