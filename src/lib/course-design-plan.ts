import { z } from "zod";
import {
  DEFAULT_COURSE_METHODOLOGY,
  LEARNING_BLUEPRINT_IDS,
  learningBlueprint,
} from "./course-methodology";
import type { SourceUnit, TrainingTopic } from "./training-design";
export const BLOOM_LEVELS = [
  "remember",
  "understand",
  "apply",
  "analyse",
  "evaluate",
  "create",
] as const;
export const designerChoicesSchema = z.object({
  goal: z.string().trim().min(10).max(1000),
  audience: z.string().trim().min(3).max(300),
  priorKnowledge: z.string().max(600),
  durationMinutes: z.number().int().min(5).max(480),
  depth: z.enum(["Concise", "Balanced", "In-depth"]),
  tone: z.enum(["Plain and practical", "Formal", "Conversational and encouraging"]),
  language: z.string().min(2).max(60),
  outputPreferences: z.string().max(1000).optional(),
  blueprint: z.enum(LEARNING_BLUEPRINT_IDS),
  country: z.string().max(100).optional(),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]).optional(),
  sourceFidelity: z.string().max(500).optional(),
  assessmentCriteria: z
    .array(z.object({ criterion: z.string().max(200), mustPass: z.boolean() }))
    .max(6)
    .optional(),
});
export type DesignerChoices = z.infer<typeof designerChoicesSchema>;
export const recoverableDesignerChoicesSchema = designerChoicesSchema.extend({
  goal: z.string().max(1000),
  audience: z.string().max(300),
  language: z.string().max(60),
  durationMinutes: z.number().int().min(0).max(480),
});
export const designerDefaults: DesignerChoices = {
  goal: "Create a complete, concise training course from the supplied material.",
  audience: "People who need to apply this material in their work",
  priorKnowledge: "Assume no prior training on this material.",
  durationMinutes: 60,
  depth: "Concise",
  tone: "Plain and practical",
  language: "English",
  blueprint: DEFAULT_COURSE_METHODOLOGY,
};
export const SETUP_FIELDS = [
  "goal",
  "audience",
  "priorKnowledge",
  "durationMinutes",
  "depth",
  "tone",
  "language",
  "level",
  "country",
  "sourceFidelity",
  "assessmentCriteria",
  "outputPreferences",
] as const;
export const courseSetupSchema = z.object({
  choices: designerChoicesSchema,
  findings: z
    .array(
      z.object({
        field: z.enum(SETUP_FIELDS),
        basis: z.enum(["document", "recommendation", "missing"]),
        explanation: z.string().min(5).max(600),
        unitIds: z.array(z.string().max(160)).max(10),
        quote: z.string().max(400),
      }),
    )
    .length(SETUP_FIELDS.length),
});
export const plannedObjectiveSchema = z.object({
  id: z.string().min(1).max(80),
  statement: z.string().min(10).max(400),
  bloom: z.enum(BLOOM_LEVELS),
  evidence: z.enum(["knowledge", "decision", "written", "performance", "project"]),
  criterion: z.string().min(10).max(600),
});
export const plannedLessonSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(3).max(150),
  objectiveIds: z.array(z.string().max(80)).min(1).max(10),
  sourceUnitIds: z.array(z.string().max(160)).min(1).max(50),
  activity: z.string().min(20).max(1000),
  assessment: z.string().min(20).max(1000),
  mediaPurpose: z.string().max(600),
  media: z.enum(["diagram", "image", "video", "none"]),
});
export const courseDesignPlanSchema = z.object({
  courseSetup: courseSetupSchema.optional(),
  version: z.literal(1),
  title: z.string().min(3).max(200),
  introduction: z.string().min(20).max(1000),
  objectives: z.array(plannedObjectiveSchema).min(1).max(60),
  modules: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        title: z.string().min(3).max(180),
        minutes: z.number().int().min(1).max(480),
        lessons: z.array(plannedLessonSchema).min(1).max(30),
      }),
    )
    .min(1)
    .max(12),
  coverage: z
    .array(
      z.object({
        unitId: z.string().min(1).max(160),
        disposition: z.enum(["teach", "consolidate", "resource"]),
        lessonIds: z.array(z.string().max(80)).max(50),
        reason: z.string().min(5).max(800),
      }),
    )
    .min(1)
    .max(2000),
  evaluation: z.object({
    reaction: z.string().min(10).max(1000),
    learning: z.string().min(10).max(1000),
    behaviour: z.string().min(10).max(1000),
    results: z.string().min(10).max(1000),
  }),
  accessibility: z.object({
    alternatives: z.string().min(10).max(1000),
    captions: z.string().min(10).max(800),
    participation: z.string().min(10).max(800),
  }),
  motivation: z.object({
    attention: z.string().min(10).max(800),
    relevance: z.string().min(10).max(800),
    confidence: z.string().min(10).max(800),
    satisfaction: z.string().min(10).max(800),
  }),
  cognitiveLoad: z.string().min(20).max(1000),
  multimedia: z.string().min(20).max(1000),
  retrieval: z
    .array(
      z.object({
        day: z.number().int().min(1).max(90),
        objectiveIds: z.array(z.string().max(80)).min(1).max(10),
        question: z.string().min(10).max(700),
        answer: z.string().min(10).max(1500),
      }),
    )
    .min(3)
    .max(12),
  notes: z.array(z.string().min(5).max(1200)).max(30),
});
export type CourseDesignPlan = z.infer<typeof courseDesignPlanSchema>;
/** Short identifiers reduce copying mistakes in model output; stored plans retain real provenance. */
export function designPlannerSources(units: SourceUnit[]) {
  return units.map((unit, index) => ({
    id: `s${String(index + 1).padStart(4, "0")}`,
    file: unit.file,
    page: unit.page,
    pages: unit.pages,
    text: unit.text,
  }));
}
export function restorePlannedSourceIds(value: unknown, units: SourceUnit[]) {
  const plan = courseDesignPlanSchema.parse(value);
  const aliases = new Map(
    designPlannerSources(units).map((unit, index) => [unit.id, units[index]!.id]),
  );
  plan.coverage.forEach((item) => {
    item.unitId = aliases.get(item.unitId) ?? item.unitId;
  });
  plan.courseSetup?.findings.forEach((item) => {
    item.unitIds = item.unitIds.map((id) => aliases.get(id) ?? id);
  });
  plan.modules.forEach((module) =>
    module.lessons.forEach((lesson) => {
      lesson.sourceUnitIds = lesson.sourceUnitIds.map((id) => aliases.get(id) ?? id);
    }),
  );
  return plan;
}
export const instructionalDesignSchema = z.object({
  objectives: z.array(plannedObjectiveSchema).max(10),
  activity: z.string().max(1000),
  assessment: z.string().max(1000),
  retrieval: z
    .array(
      z.object({
        day: z.number().int(),
        question: z.string().max(700),
        answer: z.string().max(1500),
      }),
    )
    .max(12),
  mediaPurpose: z.string().max(600),
  mediaType: z.enum(["diagram", "image", "video", "none"]),
});

/** Deterministic traceability checks, not an assertion that AI preserved every factual nuance. */
export function validateCourseDesignPlan(value: unknown, units: SourceUnit[]): CourseDesignPlan {
  const plan = courseDesignPlanSchema.parse(value);
  const lessons = plan.modules.flatMap((module) => module.lessons);
  if (lessons.length > 80)
    throw Error("The outline is too fragmented. Consolidate it into fewer lessons.");
  const unitIds = new Set(units.map((unit) => unit.id)),
    lessonIds = new Set(lessons.map((lesson) => lesson.id)),
    objectiveIds = new Set(plan.objectives.map((objective) => objective.id));
  if (
    lessonIds.size !== lessons.length ||
    objectiveIds.size !== plan.objectives.length ||
    new Set(plan.modules.map((module) => module.id)).size !== plan.modules.length
  )
    throw Error("The outline contains repeated identifiers.");
  if (
    plan.coverage.length !== unitIds.size ||
    new Set(plan.coverage.map((item) => item.unitId)).size !== unitIds.size ||
    plan.coverage.some((item) => !unitIds.has(item.unitId))
  )
    throw Error(
      "The outline does not account for every source section. Your source is retained; retry planning.",
    );
  for (const lesson of lessons) {
    if (
      lesson.sourceUnitIds.some((id) => !unitIds.has(id)) ||
      lesson.objectiveIds.some((id) => !objectiveIds.has(id))
    )
      throw Error("The outline refers to unavailable source sections or objectives.");
    if (
      lesson.sourceUnitIds.reduce(
        (size, id) => size + (units.find((unit) => unit.id === id)?.text.length ?? 0),
        0,
      ) > 30000
    )
      throw Error(
        "One proposed lesson needs more than 30,000 source characters. Replan it into smaller lessons within the same module.",
      );
  }
  for (const item of plan.coverage) {
    if (item.lessonIds.some((id) => !lessonIds.has(id)))
      throw Error("A source section refers to a missing lesson.");
    if (
      item.disposition !== "resource" &&
      (!item.lessonIds.length ||
        item.lessonIds.some(
          (id) => !lessons.find((lesson) => lesson.id === id)?.sourceUnitIds.includes(item.unitId),
        ))
    )
      throw Error(
        "A teaching or consolidated section is not actually assigned to its listed lessons.",
      );
  }
  if (
    plan.objectives.some(
      (objective) => !lessons.some((lesson) => lesson.objectiveIds.includes(objective.id)),
    ) ||
    plan.retrieval.some((item) => item.objectiveIds.some((id) => !objectiveIds.has(id)))
  )
    throw Error(
      "The plan has an objective without learning activities or an invalid retrieval target.",
    );
  // Keep the original source order, even if the model proposes an unnecessary reorder.
  const first = (lesson: z.infer<typeof plannedLessonSchema>) =>
    Math.min(...lesson.sourceUnitIds.map((id) => units.findIndex((unit) => unit.id === id)));
  plan.modules.forEach((module) => module.lessons.sort((a, b) => first(a) - first(b)));
  plan.modules.sort((a, b) => first(a.lessons[0]!) - first(b.lessons[0]!));
  return plan;
}
export function topicsFromDesignPlan(
  plan: CourseDesignPlan,
  choices: DesignerChoices,
  units: SourceUnit[],
): TrainingTopic[] {
  const blueprint = learningBlueprint(choices.blueprint)!;
  return plan.modules.flatMap((module) =>
    module.lessons.map((lesson) => {
      const objectives = plan.objectives.filter((objective) =>
        lesson.objectiveIds.includes(objective.id),
      );
      return {
        id: lesson.id,
        module: module.title,
        title: lesson.title,
        objective: objectives
          .map((objective) => objective.statement)
          .join(" ")
          .slice(0, 500),
        unitIds: lesson.sourceUnitIds,
        references: [
          ...new Set(
            units
              .filter((unit) => lesson.sourceUnitIds.includes(unit.id))
              .flatMap((unit) =>
                (unit.pages ?? [unit.page]).map((page) => `${unit.file} · page ${page}`),
              ),
          ),
        ],
        tools: [
          ...new Set([...blueprint.tools, ...(lesson.media === "diagram" ? ["columns"] : [])]),
        ] as TrainingTopic["tools"],
        slides: blueprint.stages.length,
        headings: blueprint.stages.map((stage) => `${stage}: ${lesson.title}`.slice(0, 160)),
        image: "",
        alt: "",
        video: "",
        attribution: "",
        mediaReviewed: false,
        mediaPlan: lesson.mediaPurpose,
        methodology: blueprint.id,
        instructionalDesign: {
          objectives,
          activity: lesson.activity,
          assessment: lesson.assessment,
          retrieval: plan.retrieval
            .filter((item) => item.objectiveIds.some((id) => lesson.objectiveIds.includes(id)))
            .map(({ day, question, answer }) => ({ day, question, answer })),
          mediaPurpose: lesson.mediaPurpose,
          mediaType: lesson.media,
        },
      };
    }),
  );
}
export function designQualityChecks(plan: CourseDesignPlan, choices: DesignerChoices) {
  const verbs: Record<(typeof BLOOM_LEVELS)[number], string[]> = {
    remember: ["identify", "list", "name", "recall", "recognise", "recognize", "state"],
    understand: ["explain", "describe", "summarise", "summarize", "classify", "interpret"],
    apply: ["apply", "demonstrate", "use", "perform", "implement", "complete"],
    analyse: ["analyse", "analyze", "compare", "differentiate", "diagnose", "examine"],
    evaluate: ["evaluate", "justify", "assess", "prioritise", "prioritize", "recommend"],
    create: ["create", "design", "develop", "construct", "produce", "plan"],
  };
  return [
    {
      model: "ADDIE",
      status: "planned",
      detail:
        "Audience and goal → mapped design → generation → existing publication workflow → evaluation plan.",
    },
    {
      model: "Bloom’s Taxonomy",
      status: plan.objectives.every((objective) =>
        verbs[objective.bloom].includes(objective.statement.trim().split(/\s+/)[0]!.toLowerCase()),
      )
        ? "passed"
        : "review",
      detail:
        "Objective verbs are checked against their declared cognitive level. Semantic alignment still needs trainer review.",
    },
    {
      model: "Kirkpatrick’s Four Levels",
      status: "planned",
      detail:
        "Reaction, learning, behaviour and results measures are specified. No learner or workplace results are claimed.",
    },
    {
      model: "Universal Design for Learning",
      status: "planned",
      detail: plan.accessibility.alternatives,
    },
    { model: "ARCS", status: "planned", detail: plan.motivation.relevance },
    { model: "Mayer’s Multimedia Principles", status: "planned", detail: plan.multimedia },
    {
      model: "Backward Design",
      status: "passed",
      detail:
        "Every objective maps to lessons with activity and assessment briefs. Actual generated assessment quality still needs review.",
    },
    { model: "Cognitive Load Theory", status: "planned", detail: plan.cognitiveLoad },
    {
      model: "Spaced Retrieval",
      status: "planned",
      detail: `${plan.retrieval.length} source-grounded follow-up practice prompts. Delivery is not scheduled automatically.`,
    },
    {
      model: "Duration and coverage",
      status:
        plan.modules.reduce((sum, module) => sum + module.minutes, 0) >
        choices.durationMinutes * 1.2
          ? "review"
          : "passed",
      detail:
        "Duration is an estimate. Resource-only and consolidated material is visible in the coverage map; source preservation is not a guarantee of complete instructional coverage.",
    },
  ];
}
