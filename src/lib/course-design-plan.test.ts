import { describe, expect, it } from "vitest";
import {
  designerDefaults,
  topicsFromDesignPlan,
  validateCourseDesignPlan,
  type CourseDesignPlan,
} from "./course-design-plan";
import { sourceUnits, outlineProblems, topicKey } from "./training-design";
import { trainingHtml, readTrainingPackage } from "./training-html";
import { planUnits, validPlan } from "./course-design-plan.fixtures";
describe("semantic course plan traceability", () => {
  it("rejects a plan that silently omits source material", () => {
    const plan = validPlan();
    plan.coverage.pop();
    expect(() => validateCourseDesignPlan(plan, planUnits)).toThrow("every source section");
  });
  it("rejects a coverage claim without its source text in the lesson", () => {
    const plan = validPlan();
    plan.coverage[0]!.lessonIds = ["l2"];
    expect(() => validateCourseDesignPlan(plan, planUnits)).toThrow("not actually assigned");
  });
  it("restores source order and retains resources without inventing extra lessons", () => {
    const plan = validPlan();
    plan.modules[0]!.lessons.reverse();
    const checked = validateCourseDesignPlan(plan, planUnits);
    expect(checked.modules[0]!.lessons.map((l) => l.id)).toEqual(["l1", "l2"]);
    const topics = topicsFromDesignPlan(checked, designerDefaults, planUnits);
    expect(topics).toHaveLength(2);
    expect(outlineProblems(topics, planUnits, [planUnits[2]!.id])).toEqual([]);
    expect(outlineProblems(topics, planUnits)).toContainEqual(
      expect.stringContaining("Unassigned source"),
    );
  });
  it("rejects an objective with no aligned lesson", () => {
    const plan = validPlan();
    plan.objectives.push({ ...plan.objectives[0]!, id: "unused" });
    expect(() => validateCourseDesignPlan(plan, planUnits)).toThrow("objective without");
  });
  it("invalidates generated content when the activity or assessment changes", () => {
    const topic = topicsFromDesignPlan(validPlan(), designerDefaults, planUnits)[0]!;
    const original = topicKey(topic, planUnits, "teach");
    topic.instructionalDesign!.assessment = "Evaluate a different decision with feedback.";
    expect(topicKey(topic, planUnits, "teach")).not.toBe(original);
  });
  it("exports escaped supporting resources and follow-up practice as usable content", () => {
    const plan = validPlan();
    const pkg = {
      version: 1 as const,
      title: plan.title,
      instruction: "teach",
      designPlan: plan,
      designerChoices: designerDefaults,
      topics: topicsFromDesignPlan(plan, designerDefaults, planUnits),
      results: {},
      resources: [
        {
          title: "Reporting form",
          reference: "Policy.pdf page 3",
          text: "Retained form <script>unsafe()</script>",
        },
      ],
    };
    const html = trainingHtml(pkg, true);
    expect(html).toContain('aria-label="Supporting resources"');
    expect(html).toContain("Retained form &lt;script&gt;");
    expect(html).toContain('aria-label="Follow-up practice"');
    expect(readTrainingPackage(html)?.resources).toEqual(pkg.resources);
  });
});
