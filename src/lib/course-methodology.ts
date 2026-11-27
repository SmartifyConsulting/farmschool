export const DEFAULT_COURSE_METHODOLOGY = "learn-see-apply-reflect-confirm" as const;
export const LEARNING_STAGES = [
  {
    id: "learn",
    label: "Learn",
    detail: "Understand the concept in concise, meaningful language.",
  },
  {
    id: "see",
    label: "See",
    detail: "Explore a realistic, source-supported workplace example or visual.",
  },
  { id: "apply", label: "Apply", detail: "Make a decision or complete an interactive exercise." },
  {
    id: "reflect",
    label: "Reflect",
    detail: "Explain why the approach works and provide feedback.",
  },
  {
    id: "confirm",
    label: "Confirm",
    detail: "Demonstrate understanding through a knowledge check.",
  },
] as const;
export const COURSE_METHODOLOGY_INSTRUCTION =
  "For each lesson, use Learn → See → Apply → Reflect → Confirm: explain the concept clearly; show a realistic, source-supported example (label invented scenarios hypothetical); include an interactive application; explain the reasoning and feedback; finish with a source-grounded knowledge check. Use meaningful teaching content at every stage, not stage labels alone. Use visuals where they improve understanding. Do not invent factual, legal or policy requirements.";

export const LEARNING_BLUEPRINT_IDS = [
  DEFAULT_COURSE_METHODOLOGY,
  "gagne",
  "merrill",
  "peyton",
  "scenario",
  "problem",
  "kolb",
  "five-e",
  "gradual-release",
  "mastery",
  "case",
  "project",
] as const;
export type LearningBlueprintId = (typeof LEARNING_BLUEPRINT_IDS)[number];
export type LearningBlueprint = {
  id: LearningBlueprintId;
  name: string;
  purpose: string;
  stages: readonly string[];
  assessment: string;
  practicalEvidence: boolean;
  tools: readonly string[];
};
/** Digital teaching sequences adapted for Plusticity; not claims of accreditation or validated efficacy. */
export const LEARNING_BLUEPRINTS: readonly LearningBlueprint[] = [
  {
    id: DEFAULT_COURSE_METHODOLOGY,
    name: "Learn–See–Apply–Reflect–Confirm",
    purpose: "General workplace learning and professional development",
    stages: LEARNING_STAGES.map((stage) => stage.label),
    assessment: "A source-grounded application task with feedback and a knowledge check",
    practicalEvidence: false,
    tools: ["explanation", "columns", "scenario", "quizcheck"],
  },
  {
    id: "gagne",
    name: "Gagné’s Nine Events",
    purpose: "Comprehensive, scaffolded learning",
    stages: [
      "Gain attention",
      "State objectives",
      "Recall prior learning",
      "Present content",
      "Provide guidance",
      "Practise",
      "Give feedback",
      "Assess performance",
      "Support transfer",
    ],
    assessment: "Practice with feedback, an aligned assessment and a transfer task",
    practicalEvidence: false,
    tools: ["explanation", "scenario", "quizcheck"],
  },
  {
    id: "merrill",
    name: "Merrill’s First Principles",
    purpose: "Real-world tasks and practical problem solving",
    stages: [
      "Engage with a real task",
      "Activate prior knowledge",
      "Demonstrate",
      "Apply",
      "Integrate",
    ],
    assessment: "Apply the demonstrated skill to a source-grounded real-world task",
    practicalEvidence: true,
    tools: ["explanation", "columns", "scenario", "quizcheck"],
  },
  {
    id: "peyton",
    name: "Peyton’s Four-Step Approach",
    purpose: "Procedural and physical skills",
    stages: ["Demonstrate", "Deconstruct", "Comprehend", "Perform"],
    assessment:
      "An observed performance checklist; online questions alone do not prove practical competence",
    practicalEvidence: true,
    tools: ["explanation", "checklist", "quizcheck"],
  },
  {
    id: "scenario",
    name: "Scenario-Based Learning",
    purpose: "Judgement, safeguarding, compliance and decision-making",
    stages: [
      "Set the context",
      "Present the decision",
      "Explore consequences",
      "Reflect on reasoning",
      "Transfer and check",
    ],
    assessment: "Plausible decisions with consequence-based explanatory feedback",
    practicalEvidence: false,
    tools: ["explanation", "scenario", "quizcheck"],
  },
  {
    id: "problem",
    name: "Problem-Based Learning",
    purpose: "Complex and open-ended problem solving",
    stages: [
      "Encounter the problem",
      "Identify knowledge gaps",
      "Investigate evidence",
      "Develop a solution",
      "Evaluate and reflect",
    ],
    assessment: "An evidence-based solution judged against explicit criteria",
    practicalEvidence: true,
    tools: ["explanation", "columns", "quizcheck"],
  },
  {
    id: "kolb",
    name: "Kolb’s Experiential Learning",
    purpose: "Leadership, coaching and learning from experience",
    stages: [
      "Concrete experience",
      "Reflective observation",
      "Abstract conceptualisation",
      "Active experimentation",
    ],
    assessment: "A reflection and an applied experiment with feedback",
    practicalEvidence: true,
    tools: ["explanation", "scenario", "quizcheck"],
  },
  {
    id: "five-e",
    name: "5E Instructional Model",
    purpose: "Exploration, discovery and conceptual learning",
    stages: ["Engage", "Explore", "Explain", "Elaborate", "Evaluate"],
    assessment: "Apply and explain the concept in a new context",
    practicalEvidence: false,
    tools: ["explanation", "tabs", "quizcheck"],
  },
  {
    id: "gradual-release",
    name: "Gradual Release of Responsibility",
    purpose: "Building independent competence",
    stages: [
      "I do — model",
      "We do — guided practice",
      "You do together — collaboration",
      "You do alone — independent practice",
    ],
    assessment:
      "An independent application; collaboration activities need an actual facilitator or peer workflow",
    practicalEvidence: true,
    tools: ["explanation", "checklist", "quizcheck"],
  },
  {
    id: "mastery",
    name: "Mastery Learning",
    purpose: "Competency-focused training with remediation",
    stages: [
      "Set the standard",
      "Teach and practise",
      "Check understanding",
      "Provide corrective feedback",
      "Reassess and transfer",
    ],
    assessment:
      "A criterion-based assessment, remediation and reassessment; practical skills need observed evidence",
    practicalEvidence: true,
    tools: ["explanation", "checklist", "quizcheck"],
  },
  {
    id: "case",
    name: "Case-Based Learning",
    purpose: "Professional analysis and evidence-based reasoning",
    stages: [
      "Present the case",
      "Analyse evidence",
      "Consider alternatives",
      "Decide and justify",
      "Debrief and transfer",
    ],
    assessment: "A justified response assessed using explicit evidence and reasoning criteria",
    practicalEvidence: false,
    tools: ["explanation", "tabs", "scenario", "quizcheck"],
  },
  {
    id: "project",
    name: "Project-Based Learning",
    purpose: "Creating a tangible, assessable deliverable",
    stages: [
      "Define the challenge",
      "Plan the project",
      "Investigate and create",
      "Critique and revise",
      "Present and reflect",
    ],
    assessment:
      "A tangible deliverable evaluated with a rubric; a quiz is supporting evidence only",
    practicalEvidence: true,
    tools: ["explanation", "checklist", "quizcheck"],
  },
];
export const SUPPORTING_DESIGN_MODELS = [
  { name: "ADDIE", purpose: "Plan analysis, design, development, implementation and evaluation." },
  {
    name: "Bloom’s Taxonomy",
    purpose: "Write measurable objectives and match assessment to the intended cognitive demand.",
  },
  {
    name: "Kirkpatrick’s Four Levels",
    purpose:
      "Plan reaction, learning, behaviour and results measures; do not infer workplace impact from a quiz.",
  },
  {
    name: "Universal Design for Learning",
    purpose: "Offer accessible ways to engage, understand and demonstrate learning.",
  },
  { name: "ARCS", purpose: "Support attention, relevance, confidence and satisfaction." },
  {
    name: "Mayer’s Multimedia Principles",
    purpose: "Use relevant, coherent media and reduce distracting presentation.",
  },
  {
    name: "Backward Design",
    purpose: "Align outcomes, acceptable evidence and learning activities.",
  },
  {
    name: "Cognitive Load Theory",
    purpose: "Segment complex material and avoid unnecessary load.",
  },
  {
    name: "Spaced Retrieval",
    purpose:
      "Plan later retrieval and practice; generation alone does not schedule follow-up learning.",
  },
] as const;
export function learningBlueprint(id?: string) {
  return LEARNING_BLUEPRINTS.find((blueprint) => blueprint.id === id);
}
export function learningBlueprintInstruction(id?: string) {
  const blueprint = learningBlueprint(id);
  return blueprint
    ? `Use the ${blueprint.name} learning blueprint. Teach these stages in order: ${blueprint.stages.join(" → ")}. ${blueprint.assessment}. ${blueprint.practicalEvidence ? "Describe the practical task and evidence needed; do not claim that an online quiz establishes practical competence." : ""} Every stage needs substantive source-grounded teaching or an actionable activity, not a label alone. Label hypothetical scenarios. Keep learner-facing stage headings and explanatory feedback. Design guidance: ${SUPPORTING_DESIGN_MODELS.map((model) => model.purpose).join(" ")}`
    : "Follow the trainer’s custom lesson structure.";
}
