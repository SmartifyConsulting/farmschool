import { describe, expect, it } from "vitest";
import { courseWizardInput, readWizardEvents, validateGeneratedCourse, wizardDefaults, type WizardEvent } from "./course-wizard";

const input = { ...wizardDefaults, topic: "Safe composting for smallholders", lessonCount: 2 };
const draft = {
  title: "Practical composting", description: "Learn to build and maintain a safe compost pile.", category: "Soil Management",
  lessons: [1, 2].map(n => ({ title: `Composting lesson ${n}`, body: "Safe composting practices and practical activities. ".repeat(10) })),
  quiz: { title: "Final knowledge check", questions: [1, 2, 3].map(() => ({ question: "Which material belongs in this compost pile?", options: ["Leaves", "Glass", "Metal", "Plastic"], correctIndex: 0 })) },
};
describe("AI course wizard", () => {
  it("honours the selected lesson count", () => {
    expect(validateGeneratedCourse(draft, input).lessons).toHaveLength(2);
    expect(() => validateGeneratedCourse(draft, { ...input, lessonCount: 4 })).toThrow();
  });
  it("uses the existing configurable quiz pass marks", () => {
    expect(courseWizardInput.parse({ ...input, passMark: 80 }).passMark).toBe(80);
    expect(courseWizardInput.safeParse({ ...input, passMark: 101 }).success).toBe(false);
  });
  it("rejects answer keys outside the four choices", () => {
    expect(() => validateGeneratedCourse({ ...draft, quiz: { ...draft.quiz, questions: draft.quiz.questions.map(q => ({ ...q, correctIndex: 4 })) } }, input)).toThrow();
  });
  it("reads fragmented stream events and the final unterminated line", async () => {
    const event: WizardEvent = { type: "draft", draft };
    const bytes = new TextEncoder().encode(JSON.stringify({ type: "progress", message: "Writing" }) + "\n" + JSON.stringify(event));
    const response = new Response(new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 17)); c.enqueue(bytes.slice(17)); c.close(); } }));
    const events: WizardEvent[] = [];
    await readWizardEvents(response, e => events.push(e));
    expect(events).toEqual([{ type: "progress", message: "Writing" }, event]);
  });
});