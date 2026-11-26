import { z } from "zod";
import { parseLessonSlides, slideBlockLocations } from "./lesson-slides";

export const TRAINING_TOOLS = [
  "explanation",
  "columns",
  "flip",
  "tabs",
  "checklist",
  "scenario",
  "quizcheck",
] as const;
export const TOOL_LABELS: Record<(typeof TRAINING_TOOLS)[number], string> = {
  explanation: "Explanation",
  columns: "Process / comparison diagram",
  flip: "Flip cards",
  tabs: "Tabbed exploration",
  checklist: "Checklist",
  scenario: "Practical scenario",
  quizcheck: "Knowledge check",
};
export type SourceUnit = { id: string; sourceId: string; file: string; page: number; text: string };
export const topicSchema = z.object({
  id: z.string().min(1).max(100),
  module: z.string().trim().min(1).max(180),
  title: z.string().trim().min(1).max(180),
  objective: z.string().trim().min(1).max(500),
  unitIds: z.array(z.string().min(1).max(160)).min(1).max(50),
  references: z.array(z.string().max(400)).max(50).default([]),
  tools: z.array(z.enum(TRAINING_TOOLS)).min(2).max(7),
  slides: z.number().int().min(2).max(8),
  headings: z.array(z.string().trim().min(1).max(160)).min(2).max(8),
  image: z.string().max(120000).default(""),
  alt: z.string().max(500).default(""),
  video: z.string().max(1000).default(""),
  attribution: z.string().max(1000).default(""),
  mediaReviewed: z.boolean().default(false),
  mediaPlan: z.string().max(1000).default(""),
});
export type TrainingTopic = z.infer<typeof topicSchema>;
export type TopicResult = { key: string; body: string; reviewed: boolean };
export type TrainingPackage = {
  version: 1;
  title: string;
  instruction: string;
  topics: TrainingTopic[];
  results: Record<string, TopicResult>;
};
export const packageSchema = z.object({
  version: z.literal(1),
  title: z.string().max(200),
  instruction: z.string().max(1000),
  topics: z.array(topicSchema).max(250),
  results: z.record(
    z.string(),
    z.object({ key: z.string().max(1500000), body: z.string().max(100000), reviewed: z.boolean() }),
  ),
});

/** Source pages remain distinct even when the PDF is smaller than the API request limit. */
export function sourceUnits(
  sourceId: string,
  file: string,
  pages: { page: number; text: string }[],
): SourceUnit[] {
  return pages.flatMap((page) => {
    if (!page.text.trim()) return [];
    const parts: SourceUnit[] = [];
    for (let start = 0, part = 0; start < page.text.length; part++) {
      let end = Math.min(start + 6500, page.text.length);
      if (end < page.text.length) {
        const boundary = page.text.lastIndexOf("\n", end);
        if (boundary > start + 3500) end = boundary + 1;
        if (
          /^[\uDC00-\uDFFF]$/.test(page.text[end] ?? "") &&
          /^[\uD800-\uDBFF]$/.test(page.text[end - 1] ?? "")
        )
          end--;
      }
      parts.push({
        id: `${sourceId}:${page.page}:${part}`,
        sourceId,
        file,
        page: page.page,
        text: page.text.slice(start, end),
      });
      start = end;
    }
    return parts;
  });
}
export function sourceHeading(unit: SourceUnit) {
  const lines = unit.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const heading = lines.find(
    (line) =>
      line.length > 8 &&
      line.length < 160 &&
      !/GLOBAL SAFEGUARDING\s*\||copyright|all rights reserved|^\d+$/i.test(line),
  );
  return (heading ?? `${unit.file} — page ${unit.page}`).slice(0, 150);
}
export function initialOutline(units: SourceUnit[]): TrainingTopic[] {
  const modules = new Map<string, string>();
  let currentModule = "Introduction";
  return units.map((unit, index) => {
    const title = sourceHeading(unit);
    const group = /^(\d+)[.)]\s|^(Annex\s+[A-Z])\b/i.exec(title);
    const key = group?.[1] ?? group?.[2];
    if (key) {
      if (!modules.has(key)) modules.set(key, title);
      currentModule = modules.get(key)!;
    }
    return {
      id: `topic-${index + 1}`,
      module: currentModule,
      title: sourceHeading(unit),
      objective: "Explain and apply the key points from this source section.",
      unitIds: [unit.id],
      references: [
        `${unit.file} · page ${unit.page} · section ${Number(unit.id.split(":").at(-1)) + 1}`,
      ],
      tools: [
        "explanation",
        (["columns", "flip", "tabs", "checklist", "scenario"] as const)[index % 5]!,
        "quizcheck",
      ],
      slides: 3,
      headings: [
        sourceHeading(unit).slice(0, 160),
        `Apply: ${sourceHeading(unit)}`.slice(0, 160),
        `Check: ${sourceHeading(unit)}`.slice(0, 160),
      ],
      image: "",
      alt: "",
      video: "",
      attribution: "",
      mediaReviewed: false,
      mediaPlan:
        "Use an illustration where it explains the topic; add a relevant video only after checking its source.",
    };
  });
}
export function topicKey(topic: TrainingTopic, units: SourceUnit[], instruction: string) {
  const value = JSON.stringify([
    topic.module,
    topic.title,
    topic.objective,
    topic.unitIds,
    topic.tools,
    topic.slides,
    topic.headings,
    instruction,
    units.filter((unit) => topic.unitIds.includes(unit.id)).map((unit) => [unit.id, unit.text]),
  ]);
  // Local invalidation marker, never an authentication or cryptographic token.
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return `${value.length}:${hash >>> 0}`;
}
export function outlineProblems(topics: TrainingTopic[], units: SourceUnit[]) {
  const problems: string[] = [];
  const ids = new Set(units.map((u) => u.id));
  if (!topics.length) problems.push("Add at least one topic.");
  if (topics.length > 250) problems.push("Use at most 250 topics per output.");
  if (new Set(topics.map((t) => t.id)).size !== topics.length)
    problems.push("Topic identifiers must be unique.");
  for (const topic of topics) {
    if (topic.headings.length !== topic.slides)
      problems.push(`Plan a heading for every slide in ${topic.title}.`);
    if (!topicSchema.safeParse(topic).success)
      problems.push(
        `Complete the headings, objective, tools and slide count for ${topic.title || "this topic"}.`,
      );
    if (topic.unitIds.some((id) => !ids.has(id)))
      problems.push(`Choose available source sections for ${topic.title}.`);
    if (
      topic.unitIds.reduce((n, id) => n + (units.find((u) => u.id === id)?.text.length ?? 0), 0) >
      30000
    )
      problems.push(`Split ${topic.title} into smaller topics before generating.`);
  }
  for (const unit of units)
    if (!topics.some((topic) => topic.unitIds.includes(unit.id)))
      problems.push(`Unassigned source: ${unit.file}, page ${unit.page}.`);
  return [...new Set(problems)];
}
export function publicImage(value: string) {
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value))
    return value.length <= 120000;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}
export function youtubeVideo(value: string) {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    const host = u.hostname.replace(/^www\./, "");
    const id =
      host === "youtu.be"
        ? u.pathname.slice(1)
        : ["youtube.com", "m.youtube.com"].includes(host)
          ? (u.searchParams.get("v") ?? /^\/(?:embed|shorts)\/([^/]+)/.exec(u.pathname)?.[1])
          : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
export function coverageProblems(
  topics: TrainingTopic[],
  units: SourceUnit[],
  results: Record<string, TopicResult>,
  instruction: string,
) {
  const problems = outlineProblems(topics, units);
  for (const topic of topics) {
    const result = results[topic.id];
    if (!result || result.key !== topicKey(topic, units, instruction)) {
      problems.push(`Generate or regenerate ${topic.title}.`);
      continue;
    }
    if (parseLessonSlides(result.body).length < topic.slides)
      problems.push(`Finish the planned slides for ${topic.title}.`);
    const kinds = new Set(
      slideBlockLocations(parseLessonSlides(result.body)).map((item) => item.block.kind),
    );
    if (
      topic.tools.some(
        (tool) => !["explanation", "scenario"].includes(tool) && !kinds.has(tool as never),
      )
    )
      problems.push(`Restore the planned learning components for ${topic.title}.`);
    if (!result.reviewed) problems.push(`Review source coverage and accuracy for ${topic.title}.`);
    if (topic.image && (!publicImage(topic.image) || !topic.alt.trim()))
      problems.push(`Add a valid image and alternative text for ${topic.title}.`);
    if (topic.video && !youtubeVideo(topic.video))
      problems.push(`Choose a valid YouTube video for ${topic.title}.`);
    if ((topic.image || topic.video) && (!topic.mediaReviewed || !topic.attribution.trim()))
      problems.push(`Confirm media relevance, rights and attribution for ${topic.title}.`);
  }
  return [...new Set(problems)];
}
