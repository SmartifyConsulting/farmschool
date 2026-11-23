import { createOpenAI } from "@ai-sdk/openai";
import { generateImage } from "ai";

// Verified against https://platform.openai.com/docs/models/gpt-image-2.5-sunburst
// Legacy gpt-image-1 and DALL·E models have been shut down.
export async function createLessonImage(apiKey: string, caption: string) {
  const { image } = await generateImage({
    model: createOpenAI({ apiKey }).image("gpt-image-2.5-sunburst"),
    prompt: `Clear, simple educational illustration for a farming/agriculture training course. ${caption} Plain background, labelled parts only where natural, no watermarks, no surrounding text.`,
    size: "1024x1024",
    maxRetries: 0,
  });
  return { base64: image.base64 };
}