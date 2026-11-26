import { createOpenAI } from "@ai-sdk/openai";
import { generateImage } from "ai";

// dall-e-3 is the image model this project uses.
// "gpt-image-2.5-sunburst" is not a real OpenAI model id — do not reintroduce it.
export async function createLessonImage(
  apiKey: string,
  caption: string,
  subject = "farming/agriculture",
) {
  const { image } = await generateImage({
    model: createOpenAI({ apiKey }).image("dall-e-3"),
    prompt: `Clear, simple educational illustration for a training course about ${subject}. ${caption} Plain background, labelled parts only where natural, no watermarks, no surrounding text.`,
    size: "1024x1024",
    maxRetries: 0,
  });
  return { base64: image.base64 };
}
