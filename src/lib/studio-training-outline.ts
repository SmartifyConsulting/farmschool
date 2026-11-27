import { buildCourseDraft, type SourcePage } from "./course-factory";
import { sourceUnits, type SourceUnit, type TrainingTopic } from "./training-design";
import {
  DEFAULT_COURSE_METHODOLOGY,
  LEARNING_STAGES,
  learningBlueprint,
} from "./course-methodology";

/** Adapts Studio's existing heading, front-matter and paragraph handling, rather than reparsing pages. */
export function studioTrainingOutline(sourceId: string, file: string, pages: SourcePage[]) {
  const draft = buildCourseDraft(
    file.replace(/\.[^.]+$/, "").slice(0, 120),
    pages.map((page) => ({ ...page, sourceId })),
  );
  const units: SourceUnit[] = [];
  const topics: TrainingTopic[] = [];
  draft.lessons.forEach((lesson, lessonIndex) => {
    const parts = sourceUnits(sourceId, file, [
      { page: lesson.sourceRefs[0]?.page ?? 1, text: lesson.body },
    ]);
    // Keep the existing per-topic 30,000 character safety bound, including single long paragraphs.
    for (let offset = 0; offset < parts.length; offset += 4) {
      const group = parts.slice(offset, offset + 4).map((part, partIndex) => ({
        ...part,
        id: `${sourceId}:studio:${lessonIndex}:${offset + partIndex}`,
        pages: [...new Set(lesson.sourceRefs.map((ref) => ref.page))],
      }));
      units.push(...group);
      const title = (
        parts.length > 4 ? `${lesson.title} (${Math.floor(offset / 4) + 1})` : lesson.title
      ).slice(0, 150);
      topics.push({
        id: `studio-${sourceId}-${lessonIndex}-${offset}`,
        module: lesson.module ?? "Introduction",
        title,
        objective:
          lesson.objective ||
          `Explain ${title} and apply the source’s guidance to a relevant example.`.slice(0, 500),
        unitIds: group.map((unit) => unit.id),
        references: lesson.sourceRefs.map((ref) => `${file} · page ${ref.page}`),
        tools: [...learningBlueprint(DEFAULT_COURSE_METHODOLOGY)!.tools] as TrainingTopic["tools"],
        slides: 5,
        headings: LEARNING_STAGES.map((stage) => `${stage.label}: ${title}`.slice(0, 160)),
        methodology: DEFAULT_COURSE_METHODOLOGY,
        image: "",
        alt: "",
        video: "",
        attribution: "",
        mediaReviewed: false,
        mediaPlan:
          "Use relevant illustrations or video to demonstrate the See stage. Keep examples source-grounded and label hypothetical situations.",
      });
    }
  });
  return { units, topics, warnings: draft.warnings };
}
export function trainingOutlineGroups(topics: TrainingTopic[], units: SourceUnit[]) {
  const groups: { title: string; topics: TrainingTopic[]; minutes: number }[] = [];
  for (const topic of topics) {
    let group = groups.find((item) => item.title === topic.module);
    if (!group) {
      group = { title: topic.module, topics: [], minutes: 0 };
      groups.push(group);
    }
    group.topics.push(topic);
    const words = units
      .filter((unit) => topic.unitIds.includes(unit.id))
      .reduce((total, unit) => total + unit.text.split(/\s+/).length, 0);
    group.minutes += Math.max(3, Math.ceil(words / 160) + 2);
  }
  return groups;
}
