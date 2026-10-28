import { z } from "zod";
import { DEFAULT_PASS_MARK, PASS_MARKS } from "@/lib/studio";

export const courseWizardInput = z.object({
  topic: z.string().trim().min(10).max(1000),
  audience: z.string().trim().min(3).max(200),
  lessonCount: z.number().int().min(2).max(8),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]),
  language: z.string().trim().min(2).max(60),
  passMark: z.number().refine(n => PASS_MARKS.some(mark => mark === n)),
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
});

export type CourseWizardInput = z.infer<typeof courseWizardInput>;
export type CourseWizardDraft = z.infer<typeof courseWizardDraft>;
export const wizardDefaults: CourseWizardInput = {
  topic: "", audience: "Smallholder farmers", lessonCount: 4,
  level: "Beginner", language: "English", passMark: DEFAULT_PASS_MARK,
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