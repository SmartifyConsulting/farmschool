import { useState } from "react";
import { Eye, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SlidePlayer } from "@/components/SlidePlayer";
import { BlockListEditor } from "@/components/BlockListEditor";
import { VisualTrainingEditor } from "@/components/VisualTrainingEditor";
import { BlockAIContext } from "@/components/BlockAI";
import { lessonContentKey, parseLessonSlides, splitLessonSource } from "@/lib/lesson-slides";

export function SlideEditor({
  value,
  onChange,
  readOnly,
  courseId,
  lessonTitle = "Lesson",
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  courseId?: string | undefined;
  lessonTitle?: string;
}) {
  const [preview, setPreview] = useState(false);
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const { content, footer } = splitLessonSource(value);
  const limit = 20000 - footer.length;
  const change = (text: string) => {
    if (text.length > limit) {
      toast.error("This lesson is too long. Shorten a block before adding more content.");
      return;
    }
    onChange(text + footer);
  };
  return (
    <BlockAIContext.Provider
      value={{
        instructions,
        remember: (source, instruction) =>
          setInstructions((current) => ({ ...current, [source]: instruction })),
      }}
    >
      <div className="min-w-0 space-y-3">
        {!readOnly && (
          <>
            <p className="text-sm font-semibold">Slide content</p>
            <p className="text-xs text-muted-foreground">
              Add blocks to your lesson or split a block into columns. Save the lesson to keep your
              changes.
            </p>
            <VisualTrainingEditor
              value={content}
              onChange={change}
              maxLength={limit}
              lessonTitle={lessonTitle}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                change([content.trimEnd(), "## New slide"].filter(Boolean).join("\n\n"))
              }
            >
              <Plus />
              Add slide
            </Button>
            <details className="space-y-2">
              <summary className="cursor-pointer text-sm">
                Advanced block tools and AI assistance
              </summary>
              <BlockListEditor
                value={content}
                onChange={change}
                courseId={courseId}
                lessonTitle={lessonTitle}
              />
            </details>
            <details className="space-y-2">
              <summary className="cursor-pointer text-sm">Edit Markdown source</summary>
              <Textarea
                aria-label="Lesson Markdown source"
                value={content}
                onChange={(event) => change(event.target.value)}
                rows={14}
                maxLength={limit}
              />
            </details>
          </>
        )}
        {footer && (
          <p className="whitespace-pre-line text-xs text-muted-foreground">{footer.trim()}</p>
        )}
        {(readOnly || preview) && (
          <SlidePlayer key={lessonContentKey(content)} slides={parseLessonSlides(value)} />
        )}
        {!readOnly && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={preview}
            onClick={() => setPreview(!preview)}
          >
            <Eye />
            {preview ? "Hide preview" : "Preview slides"}
          </Button>
        )}
      </div>
    </BlockAIContext.Provider>
  );
}
