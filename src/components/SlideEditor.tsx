import { useId, useState } from "react";
import { Eye, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SlidePlayer } from "@/components/SlidePlayer";
import { lessonContentKey, parseLessonSlides, splitLessonSource } from "@/lib/lesson-slides";

const templates = [
  ["Slide", "## New slide\n\nAdd teaching text here."],
  [
    "Flashcard",
    ":::flip\nWrite a question or concept.\n---\nWrite the answer or explanation.\n:::",
  ],
  [
    "Tabs",
    ":::tabs\n### Topic 1\nExplain the first topic.\n### Topic 2\nExplain the second topic.\n:::",
  ],
  [
    "Accordion",
    ":::accordion\n### Step 1\nExplain the first step.\n### Step 2\nExplain the second step.\n:::",
  ],
  ["Checklist", ":::checklist\n- First task\n- Second task\n:::"],
  ["Safety warning", ":::warning\nExplain the safety concern.\n:::"],
  ["Pro tip", ":::tip\nAdd a practical tip.\n:::"],
  ["Key takeaway", ":::takeaway\nSummarise the key idea.\n:::"],
  ["Photo evidence", ":::photo\nUpload a photo of your completed task for trainer sign-off.\n:::"],
  [
    "Hotspot image",
    ":::hotspot\nhttps://example.com/image.jpg\n### 20,30 Label one\nExplain this point.\n### 70,60 Label two\nExplain this point.\n:::",
  ],
] as const;

export function SlideEditor({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
}) {
  const [preview, setPreview] = useState(false);
  const id = useId();
  const { content, footer } = splitLessonSource(value);
  const limit = 20000 - footer.length;
  const slides = parseLessonSlides(value);
  return (
    <div className="space-y-3">
      {!readOnly && (
        <>
          <label htmlFor={id} className="text-sm font-semibold">
            Slide content
          </label>
          <p className="text-xs text-muted-foreground">
            Start each slide with ## and a title. Add an activity to the last slide using the
            buttons below, then replace the sample text.
          </p>
          <div className="flex flex-wrap gap-2">
            {templates.map(([label, template]) => {
              const next = [content.trimEnd(), template].filter(Boolean).join("\n\n");
              return (
                <Button
                  key={label}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={next.length > limit}
                  onClick={() => onChange(next + footer)}
                >
                  <Plus />
                  {label}
                </Button>
              );
            })}
          </div>
          <Textarea
            id={id}
            value={content}
            onChange={(event) => onChange(event.target.value + footer)}
            rows={14}
            maxLength={limit}
          />
        </>
      )}
      {footer && (
        <p className="whitespace-pre-line text-xs text-muted-foreground">{footer.trim()}</p>
      )}
      {readOnly || preview ? <SlidePlayer key={lessonContentKey(content)} slides={slides} /> : null}
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
  );
}
