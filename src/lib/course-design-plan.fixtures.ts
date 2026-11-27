import type { CourseDesignPlan } from "./course-design-plan";
import { sourceUnits } from "./training-design";
export const planUnits = sourceUnits("10000000-0000-4000-8000-000000000001", "Policy.pdf", [
  { page: 1, text: "Recognise a concern and report it through the approved confidential route." },
  { page: 2, text: "Record the concern accurately without investigating the allegation yourself." },
  { page: 3, text: "Use the blank reporting form as a supporting reference after the training." },
]);
export function validPlan(): CourseDesignPlan {
  return {
    version: 1,
    title: "Recognising and reporting concerns",
    introduction: "Practise recognising concerns, reporting safely and keeping accurate records.",
    objectives: [
      {
        id: "o1",
        statement: "Apply the documented confidential reporting procedure",
        bloom: "apply",
        evidence: "decision",
        criterion:
          "Choose the correct route without investigating or sharing the concern publicly.",
      },
    ],
    modules: [
      {
        id: "m1",
        title: "Respond safely",
        minutes: 20,
        lessons: [
          {
            id: "l1",
            title: "Recognise and report a concern",
            objectiveIds: ["o1"],
            sourceUnitIds: [planUnits[0]!.id],
            activity: "Choose the reporting route in a hypothetical source-grounded scenario.",
            assessment: "Select the correct route and explain why investigation is inappropriate.",
            mediaPurpose: "Show the reporting process as an accessible text diagram.",
            media: "diagram",
          },
          {
            id: "l2",
            title: "Keep accurate confidential records",
            objectiveIds: ["o1"],
            sourceUnitIds: [planUnits[1]!.id],
            activity: "Complete a hypothetical concern record without adding unsupported details.",
            assessment: "Identify factual observations and separate them from assumptions.",
            mediaPurpose: "No additional media is needed for this concise practice.",
            media: "none",
          },
        ],
      },
    ],
    coverage: planUnits.map((unit, i) => ({
      unitId: unit.id,
      disposition: i === 2 ? "resource" : "teach",
      lessonIds: i === 2 ? [] : ["l" + (i + 1)],
      reason:
        i === 2
          ? "Retain the blank reporting form for later reference."
          : "Teach the essential reporting and confidentiality guidance.",
    })),
    evaluation: {
      reaction: "Ask learners whether the practice was relevant.",
      learning: "Review decisions against the documented reporting procedure.",
      behaviour: "Ask supervisors to review reporting practice after thirty days.",
      results: "Monitor reporting timeliness without claiming causal impact.",
    },
    accessibility: {
      alternatives: "Provide the process as readable structured text.",
      captions: "Review captions for any trainer-added video.",
      participation: "Allow untimed practice and keyboard navigation.",
    },
    motivation: {
      attention: "Begin with a realistic hypothetical concern.",
      relevance: "Explain how safe reporting supports the learner's role.",
      confidence: "Give worked examples before independent practice.",
      satisfaction: "Provide corrective feedback for the learner's decisions.",
    },
    cognitiveLoad: "Teach one decision at a time and remove repeated policy explanations.",
    multimedia: "Use a labelled reporting diagram beside its matching explanation.",
    retrieval: [1, 7, 30].map((day) => ({
      day,
      objectiveIds: ["o1"],
      question: "Which reporting route should you use for a concern?",
      answer: "Use the confidential reporting route documented in the source.",
    })),
    notes: [],
  };
}
