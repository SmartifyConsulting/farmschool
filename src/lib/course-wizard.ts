import { z } from "zod";
import { DEFAULT_PASS_MARK, PASS_MARKS } from "@/lib/studio";

export const courseWizardInput = z.object({
  topic: z.string().trim().min(10).max(1000),
  audience: z.string().trim().min(3).max(200),
  lessonCount: z.number().int().min(2).max(8),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]),
  language: z.string().trim().min(2).max(60),
  passMark: z.number().refine(n => PASS_MARKS.some(mark => mark === n)),
  /** Localizes spelling, regulatory references and examples (e.g. "South Africa"); left blank, the AI defaults to generic, non-jurisdiction-specific guidance. */
  country: z.string().trim().max(100).optional(),
  tone: z.enum(["Plain and practical", "Formal", "Conversational and encouraging"]),
  /** Target word count per lesson — the page-density/granularity control. */
  lessonLength: z.enum(["Concise", "Standard", "In-depth"]),
  /** Lets the model use OpenAI's built-in web search for current facts beyond the topic prompt; off by default so output stays limited to the model's own training knowledge. */
  webSearch: z.boolean().optional(),
  /** Free-text instruction on what must stay word-for-word from the trainer's own material vs. what to leave out — prevents the AI from diluting or hallucinating compliance-critical details. */
  sourceFidelity: z.string().trim().max(500).optional(),
  /** Weighted assessment criteria the final quiz should be checked against; "must pass" criteria are called out as non-negotiable in the generation instructions. */
  rubricCriteria: z.array(z.object({
    criterion: z.string().trim().min(1).max(200),
    mustPass: z.boolean(),
  })).max(6).optional(),
  /** Extracted text from an optional uploaded document — when present, the outline is grounded in it instead of written from the topic alone. */
  sourceText: z.string().trim().max(60000).optional(),
  sourceName: z.string().trim().max(200).optional(),
});

export const courseWizardDraft = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(20).max(4000),
  category: z.string().min(2).max(100),
  lessons: z.array(z.object({
    title: z.string().min(3).max(120),
    body: z.string().min(200).max(20000),
  })).min(2).max(8),
  quiz: z.object({
    title: z.string().min(3).max(120),
    questions: z.array(z.object({
      question: z.string().min(10).max(500),
      options: z.array(z.string().min(1).max(300)).length(4),
      correctIndex: z.number().int().min(0).max(3),
    })).min(3).max(8),
  }),
  /** Transparent self-reported notes — what the AI assumed, what it couldn't verify, and what it deliberately left out — shown to the trainer alongside the draft, not hidden in it. */
  notes: z.array(z.string().min(1).max(300)).max(5).optional(),
});

export type CourseWizardInput = z.infer<typeof courseWizardInput>;
export type CourseWizardDraft = z.infer<typeof courseWizardDraft>;
export const wizardDefaults: CourseWizardInput = {
  topic: "", audience: "Smallholder farmers", lessonCount: 4,
  level: "Beginner", language: "English", passMark: DEFAULT_PASS_MARK,
  tone: "Plain and practical", lessonLength: "Standard",
};

export function validateGeneratedCourse(value: unknown, input: CourseWizardInput): CourseWizardDraft {
  const draft = courseWizardDraft.parse(value);
  if (draft.lessons.length !== input.lessonCount) throw new Error("The course has an unexpected number of lessons. Please generate it again.");
  return draft;
}

export type WizardEvent =
  | { type: "progress"; message: string }
  | { type: "draft"; draft: CourseWizardDraft }
  | { type: "error"; message: string };

/** Consume newline-delimited events even when network chunks split a line. */
export async function readWizardEvents(response: Response, onEvent: (event: WizardEvent) => void) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The course could not be received. Please try again.");
  let pending = "";
  const decoder = new TextDecoder();
  const consume = (line: string) => { if (line.trim()) onEvent(JSON.parse(line) as WizardEvent); };
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      lines.forEach(consume);
      if (done) break;
    }
    consume(pending);
  } finally { reader.releaseLock(); }
}