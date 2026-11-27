import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { learningBlueprint } from "@/lib/course-methodology";
import { slideToolsFor, changeSlideTool } from "@/lib/training-slide-tools";
import {
  TRAINING_TOOLS,
  TOOL_LABELS,
  type TrainingTopic,
  type SourceUnit,
} from "@/lib/training-design";
export function TrainingOutlineEditor({
  topic,
  units,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  topic: TrainingTopic;
  units: SourceUnit[];
  index: number;
  total: number;
  onChange: (patch: Partial<TrainingTopic>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const [search, setSearch] = useState("");
  const stages = learningBlueprint(topic.methodology)?.stages ?? [];
  const matches = units.filter(
    (unit) =>
      !search ||
      `${unit.file} ${unit.page} ${(unit.pages ?? []).join(" ")} ${unit.text}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section aria-label="Selected lesson outline" className="space-y-5">
      <div className="space-y-2 border-b pb-4">
        <label className="block">
          <span className="supporting-text text-muted-foreground">Module</span>
          <Input
            aria-label="Module title"
            value={topic.module}
            maxLength={180}
            onChange={(e) => onChange({ module: e.target.value })}
            className="h-auto rounded-none border-0 bg-transparent px-0 py-1 font-medium shadow-none"
          />
        </label>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary font-semibold text-primary-foreground">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <Input
              aria-label="Lesson title"
              value={topic.title}
              maxLength={180}
              onChange={(e) => onChange({ title: e.target.value })}
              className="h-auto rounded-none border-0 bg-transparent px-0 py-1 text-xl font-semibold shadow-none"
            />
            <p className="supporting-text text-muted-foreground">
              Edit the titles and objective directly. Changes save to this working draft.
            </p>
          </div>
        </div>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Learning objective</span>
        <Textarea
          aria-label="Learning objective"
          value={topic.objective}
          rows={2}
          maxLength={500}
          onChange={(e) => onChange({ objective: e.target.value })}
          className="min-h-16 resize-y"
        />
      </label>
      <section aria-label="Lesson slide sequence">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Slide sequence</h3>
          <label className="flex items-center gap-2 text-sm">
            Slides
            <Input
              aria-label="Number of slides"
              type="number"
              min={2}
              max={12}
              value={topic.slides}
              className="h-8 w-20"
              onChange={(e) => {
                const slides = Number(e.target.value);
                if (Number.isInteger(slides) && slides >= 2 && slides <= 12)
                  onChange({
                    slides,
                    slideTools: Array.from({ length: slides }, (_, i) => slideToolsFor(topic, i)),
                    headings: Array.from(
                      { length: slides },
                      (_, i) => topic.headings[i] ?? `${topic.title} — part ${i + 1}`.slice(0, 160),
                    ),
                  });
              }}
            />
          </label>
        </div>
        <ol className="divide-y rounded-lg border px-3">
          {topic.headings.map((heading, i) => {
            const stage = stages[i] && heading.startsWith(stages[i] + ":") ? stages[i] : null;
            const value = stage ? heading.slice(stage.length + 1).trimStart() : heading;
            return (
              <li key={i} className="py-2">
                <div className="flex items-center gap-3">
                  <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {stage && <span className="w-20 shrink-0 text-sm font-medium">{stage}</span>}
                  <Input
                    aria-label={`Slide ${i + 1} title`}
                    value={value}
                    maxLength={stage ? 160 - stage.length - 2 : 160}
                    className="h-8 border-transparent bg-transparent shadow-none hover:border-input focus:border-input"
                    onChange={(e) =>
                      onChange({
                        headings: topic.headings.map((old, n) =>
                          n === i ? (stage ? `${stage}: ${e.target.value}` : e.target.value) : old,
                        ),
                      })
                    }
                  />
                </div>
                <fieldset
                  aria-label={`Learning tools for slide ${i + 1}`}
                  className="ml-9 mt-1 flex flex-wrap gap-x-3 gap-y-1"
                >
                  {TRAINING_TOOLS.map((tool) => (
                    <label
                      key={tool}
                      title={TOOL_LABELS[tool]}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <input
                        aria-label={`Slide ${i + 1}: ${TOOL_LABELS[tool]}`}
                        type="checkbox"
                        checked={slideToolsFor(topic, i).includes(tool)}
                        onChange={(e) =>
                          onChange(changeSlideTool(topic, i, tool, e.target.checked))
                        }
                      />
                      {
                        {
                          explanation: "Explanation",
                          columns: "Diagram",
                          flip: "Flip cards",
                          tabs: "Tabs",
                          checklist: "Checklist",
                          scenario: "Scenario",
                          quizcheck: "Knowledge check",
                        }[tool]
                      }
                    </label>
                  ))}
                </fieldset>
              </li>
            );
          })}
        </ol>
      </section>
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Source material and lesson options · {topic.unitIds.length} section
          {topic.unitIds.length === 1 ? "" : "s"}
        </summary>
        <div className="mt-4 space-y-4">
          <fieldset className="space-y-2 border-t pt-3">
            <legend className="text-sm font-semibold">Source material for this lesson</legend>
            <p className="supporting-text text-muted-foreground">
              The AI uses these parts of your original document for this lesson. Assignments are
              prepared automatically; adjust them only to correct a mismatch. Section numbers
              identify extracted text chunks. Word files may show the same page number for several
              sections.
            </p>
            <Input
              aria-label="Find source sections"
              placeholder="Find a source section or page"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {matches.slice(0, 50).map((unit) => (
              <label key={unit.id} className="flex gap-2 rounded-md border p-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={topic.unitIds.includes(unit.id)}
                  onChange={(e) =>
                    onChange({
                      unitIds: e.target.checked
                        ? [...topic.unitIds, unit.id]
                        : topic.unitIds.filter((id) => id !== unit.id),
                    })
                  }
                />
                <span className="min-w-0">
                  <span className="font-medium">
                    Section {units.indexOf(unit) + 1} · {unit.file} · page{" "}
                    {(unit.pages ?? [unit.page]).join(", ")}
                  </span>
                  <span className="supporting-text mt-1 block text-muted-foreground">
                    {unit.text.replace(/\s+/g, " ").slice(0, 180)}
                    {unit.text.length > 180 ? "…" : ""}
                  </span>
                </span>
              </label>
            ))}
            {matches.length > 50 && (
              <p className="supporting-text">
                Showing 50 of {matches.length} sections. Refine the search to find more.
              </p>
            )}
          </fieldset>
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button size="sm" variant="outline" disabled={!index} onClick={() => onMove(-1)}>
              Move up
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={index === total - 1}
              onClick={() => onMove(1)}
            >
              Move down
            </Button>
            <Button size="sm" variant="outline" onClick={onRemove}>
              Remove lesson
            </Button>
          </div>
        </div>
      </details>
    </section>
  );
}
