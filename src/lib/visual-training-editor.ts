import {
  parseLessonSlides,
  splitLessonSource,
  type LessonSlide,
  type SlideBlock,
} from "./lesson-slides";
import { serializeBlocks } from "./lesson-block-editor";
export const MAX_TRAINING_BODY = 500000;
export function serializeTrainingSlides(slides: LessonSlide[]) {
  return slides
    .map(
      (slide) =>
        `## ${(slide.title || "Introduction").replace(/[\r\n]/g, " ")}\n\n${serializeBlocks(slide.blocks)}`,
    )
    .join("\n\n");
}
export function updateTrainingPart(
  body: string,
  slideIndex: number,
  blockIndex: number,
  action: "replace" | "remove" | "duplicate" | "up" | "down",
  replacement?: SlideBlock,
) {
  const slides = parseLessonSlides(body),
    slide = slides[slideIndex];
  if (!slide?.blocks[blockIndex]) return body;
  if (action === "replace" && replacement) slide.blocks[blockIndex] = replacement;
  else if (action === "remove") slide.blocks.splice(blockIndex, 1);
  else if (action === "duplicate")
    slide.blocks.splice(blockIndex + 1, 0, structuredClone(slide.blocks[blockIndex]!));
  else if (action === "up" && blockIndex > 0)
    [slide.blocks[blockIndex - 1], slide.blocks[blockIndex]] = [
      slide.blocks[blockIndex]!,
      slide.blocks[blockIndex - 1]!,
    ];
  else if (action === "down" && blockIndex < slide.blocks.length - 1)
    [slide.blocks[blockIndex + 1], slide.blocks[blockIndex]] = [
      slide.blocks[blockIndex]!,
      slide.blocks[blockIndex + 1]!,
    ];
  return serializeTrainingSlides(slides) + splitLessonSource(body).footer;
}

export function insertTrainingPart(
  body: string,
  slideIndex: number,
  afterIndex: number,
  block: SlideBlock,
) {
  const slides = parseLessonSlides(body);
  if (!slides[slideIndex]) return body;
  slides[slideIndex]!.blocks.splice(afterIndex + 1, 0, block);
  return serializeTrainingSlides(slides) + splitLessonSource(body).footer;
}
