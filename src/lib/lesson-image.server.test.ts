import { afterEach, describe, expect, it, vi } from "vitest";
import { createLessonImage } from "./lesson-image.server";

afterEach(() => vi.unstubAllGlobals());

describe("lesson image provider request", () => {
  it("uses the documented active Image API model and returns the generated image", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      created: 1,
      data: [{ b64_json: "aW1hZ2U=" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await createLessonImage("test-key", "Show a beehive entrance.")).toEqual({ base64: "aW1hZ2U=" });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit] | undefined;
    if (!call || typeof call[1].body !== "string") throw new Error("Missing image request");
    expect(call[0]).toBe("https://api.openai.com/v1/images/generations");
    const body = JSON.parse(call[1].body);
    expect(body.model).toBe("gpt-image-2.5-sunburst");
    expect(body.size).toBe("1024x1024");
    expect(body.prompt).toContain("Show a beehive entrance.");
    expect(body).not.toHaveProperty("response_format");
  });

  it("does not silently switch models or retry when OpenAI rejects the request", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: { message: "Model unavailable", type: "invalid_request_error", param: "model", code: "model_not_found" },
    }), { status: 400, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createLessonImage("test-key", "Show a hive.")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});