import type { TrainingTopic } from "./training-design";
import {
  parseLessonSlides,
  slideBlockLocations,
  splitLessonSource,
  type SlideBlock,
} from "./lesson-slides";
import { serializeTrainingSlides } from "./visual-training-editor";
type Tool = TrainingTopic["tools"][number];
function plainPart(block: SlideBlock): string {
  if ("body" in block) return block.body;
  if (block.kind === "flip") return `${block.front}\n\n${block.back}`;
  if (block.kind === "tabs" || block.kind === "accordion")
    return block.items.map((item) => `### ${item.label}\n${item.body}`).join("\n\n");
  if (block.kind === "checklist") return block.items.map((item) => `- ${item}`).join("\n");
  if (block.kind === "columns")
    return block.columns
      .map((column, i) => `### ${i + 1}\n${column.map(plainPart).join("\n\n")}`)
      .join("\n\n");
  if (block.kind === "quizcheck")
    return block.items
      .map(
        (item) =>
          `${item.question}\n${item.options.map((option, i) => `${i + 1}. ${option}`).join("\n")}\n\nSuggested response: ${item.correctIndices.map((i) => item.options[i]).join("; ")}${item.hint ? `\n${item.hint}` : ""}`,
      )
      .join("\n\n");
  return "";
}
/** Keep unsolicited widgets' teaching, examples and feedback without activating an unselected tool. */
export function conformTrainingSlideTools(topic: TrainingTopic, body: string): string {
  if (!topic.slideTools) return body;
  const interactive: Tool[] = ["columns", "flip", "tabs", "checklist", "quizcheck"];
  const slides = parseLessonSlides(body);
  for (const [i, slide] of slides.entries()) {
    const selected = topic.slideTools[i] ?? [];
    const normalize = (blocks: SlideBlock[]): SlideBlock[] =>
      blocks.map((block) => {
        const next =
          block.kind === "columns" ? { ...block, columns: block.columns.map(normalize) } : block;
        return interactive.includes(next.kind as Tool) && !selected.includes(next.kind as Tool)
          ? { kind: "text", body: plainPart(next), fenced: true }
          : next;
      });
    slide.blocks = normalize(slide.blocks);
  }
  return serializeTrainingSlides(slides) + splitLessonSource(body).footer;
}
export function defaultSlideTools(headings: string[], tools: Tool[]): Tool[][] {
  const rows: Tool[][] = headings.map(() => []);
  for (const tool of tools) {
    const pattern =
      tool === "explanation"
        ? /learn|introduc|attention|concept|explain/i
        : tool === "columns" || tool === "tabs"
          ? /see|show|demonstr|model|explor/i
          : tool === "scenario" || tool === "checklist"
            ? /apply|practi|perform|experience|attempt/i
            : tool === "flip"
              ? /reflect|review|debrief/i
              : /confirm|assess|check|evaluat|test/i;
    const found = headings.findIndex((heading) => pattern.test(heading.split(":")[0]!));
    const fallback =
      tool === "explanation"
        ? 0
        : tool === "columns" || tool === "tabs"
          ? 1
          : tool === "scenario" || tool === "checklist"
            ? 2
            : tool === "flip"
              ? 3
              : headings.length - 1;
    rows[found >= 0 ? found : Math.min(Math.max(0, fallback), headings.length - 1)]?.push(tool);
  }
  return rows;
}
export function slideToolsFor(topic: TrainingTopic, index: number): Tool[] {
  return topic.slideTools?.[index] ?? defaultSlideTools(topic.headings, topic.tools)[index] ?? [];
}
export function changeSlideTool(
  topic: TrainingTopic,
  index: number,
  tool: Tool,
  checked: boolean,
): { tools: Tool[]; slideTools: Tool[][] } {
  const slideTools = topic.headings.map((_, i) => [...slideToolsFor(topic, i)]);
  slideTools[index] = checked
    ? [...new Set([...slideTools[index]!, tool])]
    : slideTools[index]!.filter((item) => item !== tool);
  return { slideTools, tools: [...new Set(slideTools.flat())] };
}
export function slideToolProblems(topic: TrainingTopic, body: string): string[] {
  if (!topic.slideTools) return [];
  if (topic.slideTools.length !== topic.slides)
    return [`Choose learning tools for each slide in ${topic.title}.`];
  const slides = parseLessonSlides(body);
  const problems: string[] = [];
  const interactive: Tool[] = ["columns", "flip", "tabs", "checklist", "quizcheck"];
  for (const [index, selected] of topic.slideTools.entries()) {
    if (!slides[index]) continue;
    const kinds = new Set(slideBlockLocations([slides[index]!]).map((item) => item.block.kind));
    if (selected.some((tool) => interactive.includes(tool) && !kinds.has(tool as never)))
      problems.push(`Restore the selected learning tools on slide ${index + 1} of ${topic.title}.`);
    if (interactive.some((tool) => kinds.has(tool as never) && !selected.includes(tool)))
      problems.push(`Remove unselected learning tools from slide ${index + 1} of ${topic.title}.`);
  }
  return problems;
}

/** Manual authoring makes the actual widgets the new selection; prose intent is retained. */
export function toolsFromEditedBody(
  topic: TrainingTopic,
  body: string,
): { tools: Tool[]; slideTools: Tool[][] } {
  const interactive: Tool[] = ["columns", "flip", "tabs", "checklist", "quizcheck"];
  const slideTools = parseLessonSlides(body).map((slide, index) => {
    const kinds = new Set(slideBlockLocations([slide]).map((item) => item.block.kind));
    return [
      ...slideToolsFor(topic, index).filter((tool) => !interactive.includes(tool)),
      ...interactive.filter((tool) => kinds.has(tool as never)),
    ];
  });
  return { slideTools, tools: [...new Set(slideTools.flat())] };
}
