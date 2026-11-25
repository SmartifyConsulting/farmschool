import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlockAI } from "@/components/BlockAI";
import { BLOCK_TEMPLATES } from "@/lib/lesson-block-editor";

export function BlockPicker({
  onInsert,
  inColumn = false,
  courseId,
  lessonTitle,
}: {
  onInsert: (template: string) => void;
  inColumn?: boolean;
  courseId?: string | undefined;
  lessonTitle: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Plus />
        Add block
      </Button>
      {open && (
        <div className="grid gap-4 rounded-xl border p-3 sm:grid-cols-2" aria-label="Block types">
          {["Text", "Interactions", "Assessments", "Multimedia"].map((category) => (
            <section key={category} className="min-w-0 space-y-1">
              <h4 className="text-sm font-semibold">{category}</h4>
              {BLOCK_TEMPLATES.filter(
                (item) => item.category === category && (!inColumn || item.kind !== "columns"),
              ).map((item) => (
                <div key={item.kind} className="flex flex-wrap items-center justify-between gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      onInsert(item.source);
                      setOpen(false);
                    }}
                  >
                    {item.label}
                  </Button>
                  <BlockAI
                    courseId={courseId}
                    kind={item.kind}
                    lessonTitle={lessonTitle}
                    source={item.source}
                    onGenerated={(text) => {
                      onInsert(text);
                      setOpen(false);
                    }}
                  />
                </div>
              ))}
            </section>
          ))}
          {inColumn && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Columns cannot contain another set of columns.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
