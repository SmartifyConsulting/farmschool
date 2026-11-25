import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BlockAI } from "@/components/BlockAI";
import { BlockPicker } from "@/components/BlockPicker";
import { ColumnsEditor } from "@/components/ColumnsEditor";
import {
  BLOCK_TEMPLATES,
  blockEntries,
  replaceEntry,
  serializeBlock,
} from "@/lib/lesson-block-editor";

export function BlockListEditor({
  value,
  onChange,
  inColumn = false,
  courseId,
  lessonTitle,
}: {
  value: string;
  onChange: (source: string) => void;
  inColumn?: boolean;
  courseId?: string | undefined;
  lessonTitle: string;
}) {
  const previous = useRef<{ source: string; kind: string; id: number }[]>([]);
  const counter = useRef(0);
  const entries = blockEntries(value, inColumn);
  const used = new Set<number>();
  const identities = entries.map((entry, index) => {
    const kind = entry.heading ? "heading" : entry.block.kind;
    const match =
      previous.current.find(
        (old) => old.source === entry.source && old.kind === kind && !used.has(old.id),
      ) ??
      (previous.current[index]?.kind === kind && !used.has(previous.current[index]!.id)
        ? previous.current[index]
        : undefined);
    const id = match?.id ?? ++counter.current;
    used.add(id);
    return { source: entry.source, kind, id };
  });
  previous.current = identities;
  return (
    <div className="min-w-0 space-y-3">
      {entries.map((entry, index) => (
        <section
          key={identities[index]!.id}
          className="min-w-0 space-y-2 rounded-lg border bg-background p-3"
          aria-label={entry.heading ? "Slide heading" : `${entry.block.kind} block`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-xs font-semibold">
              {entry.heading
                ? "Slide heading"
                : BLOCK_TEMPLATES.find((item) => item.kind === entry.block.kind)?.label}
            </p>
            {!entry.heading && (
              <>
                <BlockAI
                  courseId={courseId}
                  kind={entry.block.kind}
                  lessonTitle={lessonTitle}
                  source={entry.source}
                  onGenerated={(text) => onChange(replaceEntry(value, entry, text))}
                />
                {!inColumn && entry.block.kind !== "columns" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onChange(
                        replaceEntry(
                          value,
                          entry,
                          serializeBlock({ kind: "columns", columns: [[entry.block], []] }),
                        ),
                      )
                    }
                  >
                    Split into columns
                  </Button>
                )}
              </>
            )}
          </div>
          {entry.block.kind === "columns" ? (
            <ColumnsEditor
              source={entry.source}
              courseId={courseId}
              lessonTitle={lessonTitle}
              onChange={(text) => onChange(replaceEntry(value, entry, text))}
            />
          ) : (
            <BlockSourceInput
              label={entry.heading ? "Slide heading" : `Edit ${entry.block.kind} block`}
              value={entry.source}
              rows={entry.heading ? 2 : 5}
              onChange={(text) => onChange(replaceEntry(value, entry, text, false))}
            />
          )}
        </section>
      ))}
      <BlockPicker
        inColumn={inColumn}
        courseId={courseId}
        lessonTitle={lessonTitle}
        onInsert={(text) => onChange([value.trimEnd(), text].filter(Boolean).join("\n\n"))}
      />
    </div>
  );
}

function BlockSourceInput({
  value,
  onChange,
  label,
  rows,
}: {
  value: string;
  onChange: (text: string) => void;
  label: string;
  rows: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft((current) => (current.trim() === value.trim() ? current : value));
  }, [value]);
  return (
    <Textarea
      aria-label={label}
      value={draft}
      rows={rows}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange(event.target.value);
      }}
    />
  );
}
