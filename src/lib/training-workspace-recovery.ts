import { z } from "zod";
import { packageSchema, topicSchema, TRAINING_TOOLS } from "./training-design";
// Working copies may contain unfinished fields. Strict checks still run before generation/completion.
export const recoverableTrainingPackage = packageSchema.extend({
  topics: z
    .array(
      topicSchema.extend({
        module: z.string().max(180),
        title: z.string().max(180),
        objective: z.string().max(500),
        unitIds: z.array(z.string().max(160)).max(50),
        tools: z.array(z.enum(TRAINING_TOOLS)).max(7),
        slides: z.preprocess(
          (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0),
          z.number().int().min(0).max(12),
        ),
        headings: z.array(z.string().max(160)).max(12),
      }),
    )
    .max(250),
});
