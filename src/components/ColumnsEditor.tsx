import { Button } from "@/components/ui/button";
import { useRef } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import { BlockListEditor } from "@/components/BlockListEditor";
import { columnSources, serializeColumns } from "@/lib/lesson-block-editor";

export function ColumnsEditor({
  source,
  onChange,
  courseId,
  lessonTitle,
}: {
  source: string;
  onChange: (source: string) => void;
  courseId?: string | undefined;
  lessonTitle: string;
}) {
  const confirm = useConfirm();
  const columns = columnSources(source);
  const latest = useRef(source);
  latest.current = source;
  const previous = useRef<{ source: string; id: number }[]>([]);
  const counter = useRef(0);
  const used = new Set<number>();
  const identities = columns.map((text, index) => {
    const old =
      previous.current.find((item) => item.source === text && !used.has(item.id)) ??
      (previous.current[index] && !used.has(previous.current[index]!.id)
        ? previous.current[index]
        : undefined);
    const id = old?.id ?? ++counter.current;
    used.add(id);
    return { source: text, id };
  });
  previous.current = identities;
  const write = (next: string[]) => onChange(serializeColumns(next));
  return (
    <div className="space-y-3">
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {columns.map((column, index) => (
          <section
            key={identities[index]!.id}
            className="min-w-0 space-y-3 rounded-xl border p-3"
            aria-label={`Column ${index + 1}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="mr-auto text-sm font-semibold">Column {index + 1}</h4>
              {index < columns.length - 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    write(
                      columns.flatMap((items, i) =>
                        i === index
                          ? [
                              [items.trimEnd(), columns[i + 1]!.trimStart()]
                                .filter(Boolean)
                                .join("\n\n"),
                            ]
                          : i === index + 1
                            ? []
                            : [items],
                      ),
                    )
                  }
                >
                  Merge with next
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Delete column?",
                      description:
                        "All blocks in this column will be removed. Other columns will be kept. Save the lesson to keep this change.",
                      confirmLabel: "Delete column",
                      tone: "danger",
                    })
                  ) {
                    if (latest.current !== source) {
                      toast.error(
                        "The columns changed while confirming. Your edits were kept. Please try again.",
                      );
                      return;
                    }
                    write(columns.filter((_, i) => i !== index));
                  }
                }}
              >
                Delete column
              </Button>
            </div>
            <BlockListEditor
              value={column}
              inColumn
              courseId={courseId}
              lessonTitle={lessonTitle}
              onChange={(text) => {
                const next = [...columns];
                next[index] = text;
                write(next);
              }}
            />
          </section>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={columns.length >= 4}
        onClick={() => write([...columns, ""])}
      >
        Add column
      </Button>
    </div>
  );
}
