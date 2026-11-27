import { describe, expect, it } from "vitest";
import { designerDefaults, SETUP_FIELDS, type CourseDesignPlan } from "./course-design-plan";
import { planUnits, validPlan } from "./course-design-plan.fixtures";
import {
  mergeCoursePrefill,
  prefillSourceKey,
  prefillReferenceKey,
  reusablePrefill,
  validateSetupEvidence,
  prefillStateSchema,
  resetInferredChoices,
  type CoursePrefillState,
} from "./course-prefill";
export function prefilledPlan(): CourseDesignPlan {
  return {
    ...validPlan(),
    courseSetup: {
      choices: {
        ...designerDefaults,
        goal: "Apply the confidential reporting procedure without investigating concerns.",
        audience: "Staff responsible for recording concerns",
        durationMinutes: 35,
        outputPreferences: "Use a reporting process diagram and a hypothetical worked example.",
      },
      findings: SETUP_FIELDS.map((field) => ({
        field,
        basis: field === "country" ? "missing" : "recommendation",
        explanation: "Suggested learning design based on the supplied reporting policy.",
        unitIds: [],
        quote: "",
      })),
    },
  };
}
function state(): CoursePrefillState {
  return {
    requestId: "20000000-0000-4000-8000-000000000001",
    sourceKey: prefillSourceKey(planUnits),
    referenceKey: prefillReferenceKey([]),
    baseline: designerDefaults,
    protectedFields: [],
    status: "complete",
    plan: prefilledPlan(),
  };
}
describe("document-based wizard prefill", () => {
  it("fills a previously blank native goal while preserving an audience edited during analysis", () => {
    const s = state();
    s.baseline = { ...designerDefaults, goal: "" };
    const merged = mergeCoursePrefill({ ...s.baseline, audience: "My chosen learner group" }, s, [
      "audience",
    ]);
    expect(merged.goal).toBe(s.plan!.courseSetup!.choices.goal);
    expect(merged.audience).toBe("My chosen learner group");
    expect(merged.durationMinutes).toBe(35);
  });
  it("does not replace a user field even when it was edited back to its starting value", () => {
    expect(mergeCoursePrefill(designerDefaults, state(), ["durationMinutes"]).durationMinutes).toBe(
      60,
    );
  });
  it("keeps the selected blueprint and does not invent an unknown country", () => {
    const s = state();
    s.plan!.courseSetup!.choices.country = "Guessed country";
    const merged = mergeCoursePrefill({ ...designerDefaults, blueprint: "gagne" }, s);
    expect(merged.blueprint).toBe("gagne");
    expect(merged.country).toBeUndefined();
  });
  it("reuses the prepared outline only for the same choices, sources and design references", () => {
    const s = state(),
      choices = mergeCoursePrefill(designerDefaults, s);
    expect(reusablePrefill(s, choices, planUnits, [])).toBe(s.plan);
    expect(reusablePrefill(s, { ...choices, durationMinutes: 90 }, planUnits, [])).toBeUndefined();
    expect(
      reusablePrefill(s, choices, [{ ...planUnits[0]!, text: "Changed source material" }], []),
    ).toBeUndefined();
    expect(
      reusablePrefill(s, choices, planUnits, [
        {
          fileId: "30000000-0000-4000-8000-000000000001",
          name: "Example.png",
          text: "",
          image: true,
        },
      ]),
    ).toBeUndefined();
  });
  it("requires a real source quote before calling a suggestion document evidence", () => {
    const plan = prefilledPlan();
    const finding = plan.courseSetup!.findings[0]!;
    finding.basis = "document";
    finding.unitIds = [planUnits[0]!.id];
    finding.quote = "Invented quotation that is absent from the source";
    validateSetupEvidence(plan, planUnits, designerDefaults, []);
    expect(finding.basis).toBe("recommendation");
    expect(finding.quote).toBe("");
    finding.basis = "document";
    finding.unitIds = [planUnits[0]!.id];
    finding.quote = planUnits[0]!.text;
    validateSetupEvidence(plan, planUnits, designerDefaults, []);
    expect(finding.basis).toBe("document");
  });
  it("preserves author choices and never creates compulsory assessment rules from inference", () => {
    const plan = prefilledPlan();
    plan.courseSetup!.choices.blueprint = "gagne";
    plan.courseSetup!.choices.assessmentCriteria = [
      { criterion: "Report concerns", mustPass: true },
    ];
    validateSetupEvidence(
      plan,
      planUnits,
      { ...designerDefaults, audience: "My explicit audience" },
      ["audience"],
    );
    expect(plan.courseSetup!.choices.audience).toBe("My explicit audience");
    expect(plan.courseSetup!.choices.blueprint).toBe(designerDefaults.blueprint);
    expect(plan.courseSetup!.choices.assessmentCriteria![0]!.mustPass).toBe(false);
  });
  it("recovers unfinished form fields and only clears earlier AI values when a new source is attached", () => {
    const s = state();
    s.baseline = { ...s.baseline, goal: "", audience: "" };
    expect(prefillStateSchema.parse(s).baseline.goal).toBe("");
    const choices = { ...s.plan!.courseSetup!.choices, audience: "Author-edited audience" };
    const reset = resetInferredChoices(choices, s);
    expect(reset.audience).toBe("Author-edited audience");
    expect(reset.goal).toBe(designerDefaults.goal);
    expect(reset.durationMinutes).toBe(60);
  });
});
