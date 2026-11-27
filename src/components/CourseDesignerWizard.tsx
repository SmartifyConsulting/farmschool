import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LearningBlueprintSelector } from "@/components/LearningBlueprintSelector";
import { DesignReferenceAttachments } from "@/components/DesignReferenceAttachments";
import { designerChoicesSchema, type DesignerChoices } from "@/lib/course-design-plan";
import { learningBlueprint, type LearningBlueprintId } from "@/lib/course-methodology";
import type { DesignReference } from "@/lib/design-reference";
const steps = [
  "Goal and audience",
  "Length and depth",
  "Style and references",
  "Learning Blueprint",
  "Check choices",
  "Build outline",
];
export function CourseDesignerWizard({
  value,
  onChange,
  references,
  onReferencesChange,
  onPlan,
  busy = false,
  error = "",
  sourceSummary,
  sourceInput,
  extraQuestions,
}: {
  value: DesignerChoices;
  onChange: (choices: DesignerChoices) => void;
  references: DesignReference[];
  onReferencesChange: (references: DesignReference[]) => void;
  onPlan: () => void;
  busy?: boolean;
  error?: string;
  sourceSummary: string;
  sourceInput?: ReactNode;
  extraQuestions?: Partial<Record<number, ReactNode>>;
}) {
  const [step, setStep] = useState(0);
  const [validation, setValidation] = useState("");
  const [attaching, setAttaching] = useState(false);
  const change = <K extends keyof DesignerChoices>(key: K, next: DesignerChoices[K]) =>
    onChange({ ...value, [key]: next });
  const next = () => {
    const stageSchema =
      step === 0
        ? designerChoicesSchema.pick({ goal: true, audience: true, priorKnowledge: true })
        : step === 1
          ? designerChoicesSchema.pick({ durationMinutes: true, depth: true })
          : step === 2
            ? designerChoicesSchema.pick({ tone: true, language: true })
            : step === 3
              ? designerChoicesSchema.pick({ blueprint: true })
              : designerChoicesSchema;
    const parsed = stageSchema.safeParse(value);
    if (!parsed.success) {
      setValidation(
        step === 0
          ? "Describe the learning goal and audience before continuing."
          : step === 1
            ? "Choose a target duration between 5 and 480 minutes."
            : "Complete the choices in this step before continuing.",
      );
      return;
    }
    setValidation("");
    setStep((old) => Math.min(steps.length - 1, old + 1));
  };
  return (
    <section aria-label="AI course designer wizard" className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="supporting-text">
          Step {step + 1} of {steps.length}
        </p>
        <h2 className="mt-1 text-xl font-semibold">{steps[step]}</h2>
        <p className="supporting-text mt-2 text-muted-foreground">{sourceSummary}</p>
      </div>
      <fieldset disabled={busy || attaching} className="space-y-4">
        {step === 0 && (
          <>
            {sourceInput}
            <label className="block text-sm">
              What should learners be able to do?
              <Textarea
                value={value.goal}
                maxLength={1000}
                onChange={(event) => change("goal", event.target.value)}
                rows={3}
              />
            </label>
            <label className="block text-sm">
              Who is the course for?
              <Input
                value={value.audience}
                maxLength={300}
                onChange={(event) => change("audience", event.target.value)}
              />
            </label>
            <label className="block text-sm">
              What do they already know?
              <Textarea
                value={value.priorKnowledge}
                maxLength={600}
                onChange={(event) => change("priorKnowledge", event.target.value)}
                rows={2}
              />
            </label>
          </>
        )}
        {step === 1 && (
          <>
            <label className="block text-sm">
              Target learning time (minutes)
              <Input
                type="number"
                min={5}
                max={480}
                value={value.durationMinutes}
                onChange={(event) => change("durationMinutes", Number(event.target.value))}
              />
            </label>
            <label className="block text-sm">
              Depth
              <select
                className="mt-1 w-full rounded-md border bg-background p-2"
                value={value.depth}
                onChange={(event) =>
                  change("depth", event.target.value as DesignerChoices["depth"])
                }
              >
                {["Concise", "Balanced", "In-depth"].map((depth) => (
                  <option key={depth}>{depth}</option>
                ))}
              </select>
            </label>
            <p className="supporting-text">
              A concise course consolidates repetition and keeps essential guidance. The planner
              will flag a duration that cannot reasonably fit the material, and distinguish
              supporting resources from taught content.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <label className="block text-sm">
              Describe the training output you want (optional)
              <Textarea
                value={value.outputPreferences ?? ""}
                maxLength={1000}
                rows={3}
                placeholder="For example: use worked examples, relevant videos and simple diagrams. Leave blank for the foundation design."
                onChange={(event) => change("outputPreferences", event.target.value)}
              />
            </label>
            <label className="block text-sm">
              Tone
              <select
                className="mt-1 w-full rounded-md border bg-background p-2"
                value={value.tone}
                onChange={(event) => change("tone", event.target.value as DesignerChoices["tone"])}
              >
                {["Plain and practical", "Formal", "Conversational and encouraging"].map((tone) => (
                  <option key={tone}>{tone}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Language
              <Input
                value={value.language}
                maxLength={60}
                onChange={(event) => change("language", event.target.value)}
              />
            </label>
          </>
        )}
        {step === 3 && (
          <LearningBlueprintSelector
            allowCustom={false}
            value={value.blueprint}
            onChange={(id) => {
              if (learningBlueprint(id)) change("blueprint", id as LearningBlueprintId);
            }}
          />
        )}
        {step >= 4 && (
          <dl className="grid gap-3 rounded-lg border p-4 text-sm">
            <div>
              <dt className="font-semibold">Goal</dt>
              <dd>{value.goal}</dd>
            </div>
            <div>
              <dt className="font-semibold">Audience</dt>
              <dd>{value.audience}</dd>
            </div>
            <div>
              <dt className="font-semibold">Length and tone</dt>
              <dd>
                {value.durationMinutes} minutes · {value.depth} · {value.tone} · {value.language}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Blueprint</dt>
              <dd>{learningBlueprint(value.blueprint)?.name}</dd>
            </div>
            <div>
              <dt className="font-semibold">Design references</dt>
              <dd>
                {references.length
                  ? references.map((reference) => reference.name).join(", ")
                  : "None — use the foundation design"}
              </dd>
            </div>
          </dl>
        )}
        {step === 5 && (
          <p className="supporting-text">
            The AI will read the source sections, propose modules and lessons, map every section,
            consolidate repetition and build the learning-design checks. This uses one request from
            the existing AI allowance. Course content is generated after the outline is ready.
          </p>
        )}
        {extraQuestions?.[step]}
      </fieldset>
      {step === 2 && (
        <fieldset disabled={busy}>
          <DesignReferenceAttachments
            value={references}
            onChange={onReferencesChange}
            onBusyChange={setAttaching}
          />
        </fieldset>
      )}
      {(error || validation) && (
        <p role="alert" className="text-sm text-destructive">
          {error || validation}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 border-t pt-3">
        <Button
          variant="outline"
          disabled={step === 0 || busy || attaching}
          onClick={() => {
            setValidation("");
            setStep((old) => Math.max(0, old - 1));
          }}
        >
          Back
        </Button>
        {step === steps.length - 1 ? (
          <Button
            disabled={busy || attaching}
            onClick={() => {
              if (designerChoicesSchema.safeParse(value).success) onPlan();
              else setValidation("Complete the course choices first.");
            }}
          >
            {busy ? "Planning the course…" : "Build AI outline"}
          </Button>
        ) : (
          <Button disabled={busy || attaching} onClick={next}>
            Next
          </Button>
        )}
      </div>
    </section>
  );
}
