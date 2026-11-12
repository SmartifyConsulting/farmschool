import { describe, expect, it } from "vitest";
import { gradeCompetencyRubric, rubricCriteria } from "./competency-rubric";

const first = "10000000-0000-4000-8000-000000000001";
const second = "10000000-0000-4000-8000-000000000002";
const criteria = [
  { id: first, title: "Safety technique", description: "", maxPoints: 30 },
  { id: second, title: "Practical execution", description: "", maxPoints: 70 },
];

describe("weighted competency rubric", () => {
  it("weights each criterion by its available points", () => {
    expect(gradeCompetencyRubric(criteria, { [first]: 30, [second]: 35 }, 80)).toEqual({
      total: 65,
      maximum: 100,
      score: 65,
      achieved: false,
    });
  });
  it("uses the displayed two-decimal percentage for the pass boundary", () => {
    expect(
      gradeCompetencyRubric([{ ...criteria[0]!, maxPoints: 3 }], { [first]: 2 }, 66.67),
    ).toMatchObject({ score: 66.67, achieved: true });
  });
  it.each([
    { [first]: 30 },
    { [first]: 30, [second]: 71 },
    { [first]: -1, [second]: 50 },
    { [first]: NaN, [second]: 50 },
    { [first]: 20.001, [second]: 50 },
    { [first]: 30, [second]: 50, extra: 1 },
  ])("rejects incomplete, invalid or extra scores: %j", (marks) => {
    expect(() => gradeCompetencyRubric(criteria, marks, 80)).toThrow();
  });
  it("rejects duplicate criteria and zero maximum points", () => {
    expect(rubricCriteria.safeParse([criteria[0], criteria[0]]).success).toBe(false);
    expect(rubricCriteria.safeParse([{ ...criteria[0], maxPoints: 0 }]).success).toBe(false);
  });
});
