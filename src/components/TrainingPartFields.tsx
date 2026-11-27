import type { SlideBlock } from "@/lib/lesson-slides";
import { extractYouTubeId } from "@/lib/lesson-slides";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { trainingImage } from "@/lib/training-image";
import { friendlyError } from "@/lib/friendly-error";
import { toast } from "sonner";
function TextField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span>{label}</span>
      {multiline ? (
        <Textarea value={value} rows={4} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}
function ImageUpload({ onChange }: { onChange: (value: string) => void }) {
  return (
    <label className="block space-y-1 text-sm">
      Upload image
      <Input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            onChange(await trainingImage(file));
          } catch (error) {
            toast.error(friendlyError(error, "Could not read the image."));
          }
          e.target.value = "";
        }}
      />
    </label>
  );
}
export function TrainingPartFields({
  block,
  onChange,
}: {
  block: SlideBlock;
  onChange: (block: SlideBlock) => void;
}) {
  if ("body" in block)
    return (
      <TextField
        label="Text"
        value={block.body}
        multiline
        onChange={(body) => onChange({ ...block, body })}
      />
    );
  if (block.kind === "flip")
    return (
      <>
        <TextField
          label="Front"
          value={block.front}
          multiline
          onChange={(front) => onChange({ ...block, front })}
        />
        <TextField
          label="Back"
          value={block.back}
          multiline
          onChange={(back) => onChange({ ...block, back })}
        />
      </>
    );
  if (block.kind === "image")
    return (
      <>
        <ImageUpload onChange={(url) => onChange({ ...block, url })} />
        <TextField
          label="Or image URL"
          value={block.url.startsWith("data:") ? "" : block.url}
          onChange={(url) => onChange({ ...block, url })}
        />
        <TextField
          label="Alternative text / caption"
          value={block.caption}
          onChange={(caption) => onChange({ ...block, caption })}
        />
      </>
    );
  if (block.kind === "video")
    return (
      <>
        <TextField
          label="Video URL (YouTube or HTTPS video file)"
          value={block.url}
          onChange={(url) => onChange({ ...block, url, youtube: !!extractYouTubeId(url) })}
        />
        {block.interactions.map((item, i) => (
          <div className="space-y-2 rounded border p-2" key={i}>
            <label className="block text-sm">
              Pause at (seconds)
              <Input
                type="number"
                min={0}
                value={item.atSeconds}
                onChange={(e) =>
                  onChange({
                    ...block,
                    interactions: block.interactions.map((old, n) =>
                      n === i ? { ...old, atSeconds: Math.max(0, Number(e.target.value)) } : old,
                    ),
                  })
                }
              />
            </label>
            <TextField
              label="Prompt"
              value={item.note}
              multiline
              onChange={(note) =>
                onChange({
                  ...block,
                  interactions: block.interactions.map((old, n) =>
                    n === i ? { ...old, note } : old,
                  ),
                })
              }
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                onChange({ ...block, interactions: block.interactions.filter((_, n) => n !== i) })
              }
            >
              Remove pause point
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              ...block,
              interactions: [
                ...block.interactions,
                { atSeconds: 0, note: "Add a reflection prompt." },
              ],
            })
          }
        >
          Add pause point
        </Button>
      </>
    );
  if (block.kind === "checklist")
    return (
      <>
        {block.items.map((item, i) => (
          <div className="flex gap-2" key={i}>
            <Input
              aria-label={`Checklist item ${i + 1}`}
              value={item}
              onChange={(e) =>
                onChange({
                  ...block,
                  items: block.items.map((old, n) => (n === i ? e.target.value : old)),
                })
              }
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={block.items.length === 1}
              onClick={() => onChange({ ...block, items: block.items.filter((_, n) => n !== i) })}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...block, items: [...block.items, "New checklist item"] })}
        >
          Add item
        </Button>
      </>
    );
  if (block.kind === "tabs" || block.kind === "accordion")
    return (
      <>
        {block.items.map((item, i) => (
          <div className="space-y-2 rounded border p-2" key={i}>
            <TextField
              label={`Section ${i + 1} title`}
              value={item.label}
              onChange={(label) =>
                onChange({
                  ...block,
                  items: block.items.map((old, n) => (n === i ? { ...old, label } : old)),
                })
              }
            />
            <TextField
              label="Content"
              value={item.body}
              multiline
              onChange={(body) =>
                onChange({
                  ...block,
                  items: block.items.map((old, n) => (n === i ? { ...old, body } : old)),
                })
              }
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={block.items.length === 1}
              onClick={() => onChange({ ...block, items: block.items.filter((_, n) => n !== i) })}
            >
              Remove section
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              ...block,
              items: [...block.items, { label: "New section", body: "Add teaching content." }],
            })
          }
        >
          Add section
        </Button>
      </>
    );
  if (block.kind === "columns")
    return (
      <>
        {block.columns.map((column, ci) => (
          <section key={ci} className="space-y-3 rounded border p-2">
            <h4 className="text-sm font-semibold">Column {ci + 1}</h4>
            {column.map((child, bi) => (
              <div key={bi} className="space-y-2 border-b pb-2">
                <TrainingPartFields
                  block={child}
                  onChange={(next) =>
                    onChange({
                      ...block,
                      columns: block.columns.map((old, n) =>
                        n === ci ? old.map((entry, j) => (j === bi ? next : entry)) : old,
                      ),
                    })
                  }
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    onChange({
                      ...block,
                      columns: block.columns.map((old, n) =>
                        n === ci ? old.filter((_, j) => j !== bi) : old,
                      ),
                    })
                  }
                >
                  Remove item
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                onChange({
                  ...block,
                  columns: block.columns.map((old, n) =>
                    n === ci ? [...old, { kind: "text", body: "Add teaching content." }] : old,
                  ),
                })
              }
            >
              Add text
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={block.columns.length === 1}
              onClick={() =>
                onChange({ ...block, columns: block.columns.filter((_, n) => n !== ci) })
              }
            >
              Remove column
            </Button>
          </section>
        ))}
        <Button
          size="sm"
          variant="outline"
          disabled={block.columns.length >= 4}
          onClick={() =>
            onChange({
              ...block,
              columns: [...block.columns, [{ kind: "text", body: "Add teaching content." }]],
            })
          }
        >
          Add column
        </Button>
      </>
    );
  if (block.kind === "quizcheck")
    return (
      <>
        {block.items.map((item, qi) => (
          <section key={qi} className="space-y-2 rounded border p-2">
            <TextField
              label={`Question ${qi + 1}`}
              value={item.question}
              multiline
              onChange={(question) =>
                onChange({
                  ...block,
                  items: block.items.map((old, n) => (n === qi ? { ...old, question } : old)),
                })
              }
            />
            {item.options.map((option, oi) => (
              <div className="flex items-center gap-2" key={oi}>
                <input
                  type="checkbox"
                  aria-label={`Question ${qi + 1} option ${oi + 1} is correct`}
                  checked={item.correctIndices.includes(oi)}
                  onChange={(e) => {
                    const indices = e.target.checked
                      ? [...item.correctIndices, oi]
                      : item.correctIndices.filter((n) => n !== oi);
                    if (indices.length)
                      onChange({
                        ...block,
                        items: block.items.map((old, n) =>
                          n === qi ? { ...old, correctIndices: indices } : old,
                        ),
                      });
                  }}
                />
                <Input
                  aria-label={`Question ${qi + 1} option ${oi + 1}`}
                  value={option}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      items: block.items.map((old, n) =>
                        n === qi
                          ? {
                              ...old,
                              options: old.options.map((text, j) =>
                                j === oi ? e.target.value : text,
                              ),
                            }
                          : old,
                      ),
                    })
                  }
                />
              </div>
            ))}
            <p className="supporting-text">
              Tick the correct answer or answers. This is ungraded practice.
            </p>
            <TextField
              label="Explanation / hint"
              value={item.hint ?? ""}
              multiline
              onChange={(hint) =>
                onChange({
                  ...block,
                  items: block.items.map((old, n) =>
                    n === qi ? { ...old, hint: hint || null } : old,
                  ),
                })
              }
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={block.items.length === 1}
              onClick={() => onChange({ ...block, items: block.items.filter((_, n) => n !== qi) })}
            >
              Remove question
            </Button>
          </section>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              ...block,
              items: [
                ...block.items,
                {
                  question: "Add a knowledge-check question.",
                  options: ["Correct answer", "Alternative answer"],
                  correctIndices: [0],
                  hint: null,
                },
              ],
            })
          }
        >
          Add question
        </Button>
      </>
    );
  if (block.kind === "facts")
    return (
      <>
        {block.items.map((item, i) => (
          <div key={i} className="space-y-2 rounded border p-2">
            <TextField
              label="Fact"
              value={item.claim}
              onChange={(claim) =>
                onChange({
                  ...block,
                  items: block.items.map((old, n) => (n === i ? { ...old, claim } : old)),
                })
              }
            />
            <TextField
              label="Supporting explanation"
              multiline
              value={item.evidence}
              onChange={(evidence) =>
                onChange({
                  ...block,
                  items: block.items.map((old, n) => (n === i ? { ...old, evidence } : old)),
                })
              }
            />
            <TextField
              label="Image URL (optional)"
              value={item.image ?? ""}
              onChange={(image) =>
                onChange({
                  ...block,
                  items: block.items.map((old, n) =>
                    n === i ? { ...old, image: image || null } : old,
                  ),
                })
              }
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={block.items.length === 1}
              onClick={() => onChange({ ...block, items: block.items.filter((_, n) => n !== i) })}
            >
              Remove fact
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              ...block,
              items: [
                ...block.items,
                { claim: "New fact", evidence: "Add supporting explanation.", image: null },
              ],
            })
          }
        >
          Add fact
        </Button>
      </>
    );
  if (block.kind === "hotspot")
    return (
      <>
        <ImageUpload onChange={(image) => onChange({ ...block, image })} />
        <TextField
          label="Image URL"
          value={block.image.startsWith("data:") ? "" : block.image}
          onChange={(image) => onChange({ ...block, image })}
        />
        {block.points.map((point, i) => (
          <div key={i} className="space-y-2 rounded border p-2">
            <TextField
              label="Label"
              value={point.label}
              onChange={(label) =>
                onChange({
                  ...block,
                  points: block.points.map((old, n) => (n === i ? { ...old, label } : old)),
                })
              }
            />
            <TextField
              label="Explanation"
              multiline
              value={point.body}
              onChange={(body) =>
                onChange({
                  ...block,
                  points: block.points.map((old, n) => (n === i ? { ...old, body } : old)),
                })
              }
            />
            {(["x", "y"] as const).map((axis) => (
              <label className="block text-sm" key={axis}>
                {axis.toUpperCase()} position (%)
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={point[axis]}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      points: block.points.map((old, n) =>
                        n === i
                          ? { ...old, [axis]: Math.min(100, Math.max(0, Number(e.target.value))) }
                          : old,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange({ ...block, points: block.points.filter((_, n) => n !== i) })}
            >
              Remove label
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              ...block,
              points: [
                ...block.points,
                { x: 50, y: 50, label: "New label", body: "Add an explanation." },
              ],
            })
          }
        >
          Add label
        </Button>
      </>
    );
  if (block.kind === "photo")
    return (
      <TextField
        label="Practical task prompt"
        multiline
        value={block.prompt}
        onChange={(prompt) => onChange({ ...block, prompt })}
      />
    );
  return null;
}
