import { z } from "zod";
import {
  courseDesignPlanSchema,
  designerChoicesSchema,
  designerDefaults,
  SETUP_FIELDS,
  recoverableDesignerChoicesSchema,
  type DesignerChoices,
  type CourseDesignPlan,
} from "./course-design-plan";
import type { SourceUnit } from "./training-design";
import type { DesignReference } from "./design-reference";
export type SetupField = (typeof SETUP_FIELDS)[number];
export const prefillStateSchema = z.object({
  requestId: z.string().uuid(),
  sourceKey: z.string(),
  baseline: recoverableDesignerChoicesSchema,
  protectedFields: z.array(z.enum(SETUP_FIELDS)),
  referenceKey: z.string(),
  status: z.enum(["pending", "complete", "failed"]),
  plan: courseDesignPlanSchema.optional(),
  error: z.string().optional(),
});
export type CoursePrefillState = z.infer<typeof prefillStateSchema>;
export const setupLabels: Record<SetupField, string> = {
  goal: "Learning goal",
  audience: "Audience",
  priorKnowledge: "Prior knowledge",
  durationMinutes: "Learning time",
  depth: "Depth",
  tone: "Tone",
  language: "Language",
  level: "Level",
  country: "Country / region",
  sourceFidelity: "Details to preserve",
  assessmentCriteria: "Assessment criteria",
  outputPreferences: "Visual and output suggestions",
};
export function choiceKey(choices: DesignerChoices) {
  return JSON.stringify(
    {
      ...choices,
      outputPreferences: choices.outputPreferences ?? "",
      country: choices.country ?? "",
      level: choices.level ?? "Beginner",
      sourceFidelity: choices.sourceFidelity ?? "",
      assessmentCriteria: choices.assessmentCriteria ?? [],
    },
    (_key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
        : value,
  );
}
export function prefillSourceKey(units: SourceUnit[]) {
  const value = JSON.stringify(units);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return `${value.length}:${hash >>> 0}`;
}
export const prefillReferenceKey = (references: DesignReference[]) => JSON.stringify(references);
export function setupProtectedFields(choices: DesignerChoices): SetupField[] {
  const base = JSON.parse(choiceKey(designerDefaults)),
    current = JSON.parse(
      choiceKey({
        ...choices,
        goal: choices.goal || designerDefaults.goal,
        audience: choices.audience || designerDefaults.audience,
      }),
    );
  return SETUP_FIELDS.filter(
    (field) => JSON.stringify(current[field]) !== JSON.stringify(base[field]),
  );
}
export function mergeCoursePrefill(
  current: DesignerChoices,
  state: CoursePrefillState,
  edited: SetupField[] = [],
): DesignerChoices {
  const setup = state.plan?.courseSetup;
  if (!setup) return current;
  const next = { ...current };
  for (const field of SETUP_FIELDS) {
    const finding = setup.findings.find((item) => item.field === field);
    if (
      !finding ||
      finding.basis === "missing" ||
      state.protectedFields.includes(field) ||
      edited.includes(field)
    )
      continue;
    if (
      JSON.stringify(current[field]) !== JSON.stringify(state.baseline[field]) &&
      JSON.stringify(current[field]) !== JSON.stringify(setup.choices[field])
    )
      continue;
    Object.assign(next, { [field]: setup.choices[field] });
  }
  next.blueprint = current.blueprint;
  return next;
}
export function reusablePrefill(
  state: CoursePrefillState | null | undefined,
  choices: DesignerChoices,
  units: SourceUnit[],
  references: DesignReference[],
) {
  return state?.status === "complete" &&
    state.plan?.courseSetup &&
    state.sourceKey === prefillSourceKey(units) &&
    state.referenceKey === prefillReferenceKey(references) &&
    choiceKey(state.plan.courseSetup.choices) === choiceKey(choices)
    ? state.plan
    : undefined;
}
export function resetInferredChoices(
  current: DesignerChoices,
  state: CoursePrefillState | null,
): DesignerChoices {
  if (!state?.plan?.courseSetup) return current;
  const next = { ...current };
  for (const field of SETUP_FIELDS)
    if (
      !state.protectedFields.includes(field) &&
      JSON.stringify(current[field]) === JSON.stringify(state.plan.courseSetup.choices[field])
    )
      Object.assign(next, { [field]: designerDefaults[field] });
  return next;
}
/** Source-based labels need a real, verbatim supporting excerpt; unsupported claims are downgraded. */
export function validateSetupEvidence(
  plan: CourseDesignPlan,
  units: SourceUnit[],
  baseline: DesignerChoices,
  protectedFields: SetupField[],
) {
  const setup = plan.courseSetup;
  if (!setup) throw Error("The document analysis did not return course setup suggestions.");
  if (new Set(setup.findings.map((item) => item.field)).size !== SETUP_FIELDS.length)
    throw Error("The document analysis did not account for every setup field.");
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
  for (const finding of setup.findings) {
    if (
      finding.field === "country" &&
      finding.basis !== "document" &&
      !protectedFields.includes("country")
    )
      finding.basis = "missing";
    if (
      finding.basis === "document" &&
      (!finding.quote.trim() ||
        !finding.unitIds.length ||
        finding.unitIds.some((id) => !units.some((unit) => unit.id === id)) ||
        !units.some(
          (unit) =>
            finding.unitIds.includes(unit.id) &&
            normalize(unit.text).includes(normalize(finding.quote)),
        ))
    ) {
      finding.basis = finding.field === "country" ? "missing" : "recommendation";
      finding.explanation =
        "AI recommendation: a supporting document excerpt could not be verified. Review this choice.";
      finding.unitIds = [];
      finding.quote = "";
      if (finding.field === "country") setup.choices.country = baseline.country ?? "";
    }
    if (finding.basis === "missing" || protectedFields.includes(finding.field))
      Object.assign(setup.choices, { [finding.field]: baseline[finding.field] });
  }
  if (!protectedFields.includes("assessmentCriteria"))
    setup.choices.assessmentCriteria = setup.choices.assessmentCriteria?.map((item) => ({
      ...item,
      mustPass: false,
    }));
  setup.choices.blueprint = baseline.blueprint;
}
