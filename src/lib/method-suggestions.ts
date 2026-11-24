import { z } from "zod";

// Strict structured output requires every field; unused methods return null.
export const methodSuggestionsSchema = z.object({
  illustrated: z.string().max(300).nullable(),
  visual: z.string().max(300).nullable(),
  videoQueries: z.array(z.string().max(120)).max(3).nullable(),
  steps: z.array(z.string().max(200)).max(8).nullable(),
  scenarios: z.array(z.string().max(400)).max(2).nullable(),
  quiz: z.object({
    question: z.string().max(300),
    options: z.array(z.string().max(220)).length(4),
    correctIndex: z.number().int().min(0).max(3),
    sourceQuote: z.string().max(350),
    /** A gentle nudge shown only if the learner asks for it, never giving away the answer outright. */
    hint: z.string().max(200).nullable(),
  }).nullable(),
  activities: z.string().max(300).nullable(),
  /** 2 to 3 short claim+evidence pairs for a fact-card layout, each with its own image slot the trainer fills in. */
  facts: z.array(z.object({
    claim: z.string().max(140),
    evidence: z.string().max(300),
  })).max(3).nullable(),
});