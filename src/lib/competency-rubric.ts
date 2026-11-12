import { z } from "zod";

const points = z.number().finite().min(0.01).max(1000).multipleOf(0.01);
export const rubricCriteria = z
  .array(
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(3).max(200),
      description: z.string().max(2000),
      maxPoints: points,
    }),
  )
  .min(1)
  .max(30)
  .refine(
    (criteria) => new Set(criteria.map((item) => item.id)).size === criteria.length,
    "Criterion IDs must be unique",
  );
export type RubricCriterion = z.infer<typeof rubricCriteria>[number];

export function gradeCompetencyRubric(
  raw: unknown,
  marks: Record<string, number>,
  passMark: number,
) {
  const criteria = rubricCriteria.parse(raw);
  z.number().finite().min(1).max(100).multipleOf(0.01).parse(passMark);
  if (
    Object.keys(marks).length !== criteria.length ||
    Object.keys(marks).some((key) => !criteria.some((item) => item.id === key))
  )
    throw new Error("Score every criterion exactly once.");
  let totalUnits = 0;
  let maximumUnits = 0;
  for (const criterion of criteria) {
    const mark = z
      .number()
      .finite()
      .min(0)
      .max(criterion.maxPoints)
      .multipleOf(0.01)
      .parse(marks[criterion.id]);
    totalUnits += Math.round(mark * 100);
    maximumUnits += Math.round(criterion.maxPoints * 100);
  }
  const score = Math.round((totalUnits * 10000) / maximumUnits) / 100;
  return {
    total: totalUnits / 100,
    maximum: maximumUnits / 100,
    score,
    achieved: score >= passMark,
  };
}
