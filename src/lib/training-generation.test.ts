import { describe, expect, it, vi } from "vitest";
import { initialOutline, sourceUnits, topicKey, type TrainingTopic } from "./training-design";
import { runTrainingGeneration, trainingGenerationPlan } from "./training-generation";
import { readTrainingPackage, trainingHtml } from "./training-html";

const units = sourceUnits("10000000-0000-4000-8000-000000000001", "Policy.pdf", [
  { page: 1, text: "Reporting concerns\nRecord concerns and follow the reporting procedure." },
  { page: 2, text: "Documenting concerns\nKeep accurate records and respect confidentiality." },
]);
function fixture() {
  const topics = initialOutline(units);
  const results = Object.fromEntries(
    topics.map((t) => [
      t.id,
      {
        key: topicKey(t, units, "teach"),
        body: "## Existing teaching\nKeep this reviewed teaching content.",
        reviewed: true,
      },
    ]),
  );
  const actions = {
    stopped: () => false,
    progress: vi.fn(),
    slides: vi.fn().mockResolvedValue(undefined),
    image: vi.fn().mockResolvedValue("data:image/jpeg;base64,aGVsbG8="),
    video: vi.fn().mockResolvedValue({
      configured: true,
      videoId: "abcdefghijk",
      title: "Reporting demonstration",
      channelTitle: "Training provider",
    }),
    attach: vi.fn((id: string, patch: Partial<TrainingTopic>) =>
      Object.assign(
        topics.find((t) => t.id === id)!,
        patch,
      ),
    ),
  };
  return { topics, results, actions };
}
describe("training generation with media", () => {
  it("finishes every requested lesson before spending allowance on media", async () => {
    const f = fixture();
    const order: string[] = [];
    f.actions.slides.mockImplementation(async (topic: TrainingTopic) => {
      order.push("slides:" + topic.id);
    });
    f.actions.image.mockImplementation(async () => {
      order.push("image");
      throw Error("Your AI allowance is used up.");
    });
    const warnings = await runTrainingGeneration(
      trainingGenerationPlan(f.topics, units, {}, "teach", { images: true, videos: false }),
      f.actions,
    );
    expect(order.slice(0, 2)).toEqual(f.topics.map((topic) => "slides:" + topic.id));
    expect(order[2]).toBe("image");
    expect(warnings.join(" ")).toContain("content is retained");
  });
  it("repairs media on existing slides without regenerating or unreviewing their teaching", async () => {
    const f = fixture();
    const tasks = trainingGenerationPlan(f.topics, units, f.results, "teach", {
      images: true,
      videos: true,
    });
    expect(tasks.every((t) => !t.slides && t.image && t.video)).toBe(true);
    await runTrainingGeneration(tasks, f.actions);
    expect(f.actions.slides).not.toHaveBeenCalled();
    expect(f.actions.image).toHaveBeenCalledTimes(2);
    expect(f.actions.video).toHaveBeenCalledTimes(2);
    expect(f.results["topic-1"]?.reviewed).toBe(true);
    expect(f.topics.every((t) => t.image && t.video && !t.mediaReviewed)).toBe(true);
    expect(f.topics[0]?.attribution).toContain("AI-generated illustration");
    expect(f.topics[0]?.attribution).toContain("Training provider");
    const html = trainingHtml(
      { version: 1, title: "Policy", instruction: "teach", topics: f.topics, results: f.results },
      true,
    );
    expect(html).toContain('<img src="data:image/jpeg;base64,aGVsbG8="');
    expect(html).toContain('data-video="abcdefghijk"');
    expect(readTrainingPackage(html)?.topics[0]?.video).toContain("abcdefghijk");
  });
  it("keeps existing attachments and supports opting out of automatic media", () => {
    const f = fixture();
    f.topics[0]!.image = "https://images.example.com/approved.jpg";
    f.topics[0]!.video = "https://youtu.be/abcdefghijk";
    expect(
      trainingGenerationPlan(
        f.topics,
        units,
        f.results,
        "teach",
        { images: true, videos: true },
        f.topics[0]!.id,
      ),
    ).toEqual([]);
    expect(
      trainingGenerationPlan(f.topics, units, f.results, "teach", { images: false, videos: false }),
    ).toEqual([]);
  });
  it("retains generated slides if illustration generation fails and resumes with media only", async () => {
    const f = fixture();
    const tasks = trainingGenerationPlan(
      f.topics,
      units,
      {},
      "teach",
      { images: true, videos: true },
      "topic-1",
    );
    f.actions.image.mockRejectedValueOnce(new Error("Your AI allowance is used up."));
    expect((await runTrainingGeneration(tasks, f.actions)).join(" ")).toContain("allowance");
    expect(f.actions.slides).toHaveBeenCalledOnce();
    expect(f.actions.attach).not.toHaveBeenCalled();
    expect(f.actions.video).not.toHaveBeenCalled();
    const resumed = trainingGenerationPlan(
      f.topics,
      units,
      f.results,
      "teach",
      { images: true, videos: true },
      "topic-1",
    );
    expect(resumed[0]?.slides).toBe(false);
  });
  it("shows missing video configuration once without inventing or attaching URLs", async () => {
    const f = fixture();
    f.actions.video.mockResolvedValue({ configured: false, videoId: null, title: null });
    const warnings = await runTrainingGeneration(
      trainingGenerationPlan(f.topics, units, f.results, "teach", { images: true, videos: true }),
      f.actions,
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("not configured");
    expect(f.actions.video).toHaveBeenCalledOnce();
    expect(f.actions.image).toHaveBeenCalledTimes(2);
    expect(f.topics.every((t) => !t.video)).toBe(true);
  });
  it("reports empty search results and rejects invalid returned video identifiers", async () => {
    const f = fixture();
    f.actions.video.mockResolvedValueOnce({ configured: true, videoId: null, title: null });
    const tasks = trainingGenerationPlan(
      f.topics,
      units,
      f.results,
      "teach",
      { images: false, videos: true },
      "topic-1",
    );
    expect((await runTrainingGeneration(tasks, f.actions))[0]).toContain("No supporting video");
    f.actions.video.mockResolvedValueOnce({
      configured: true,
      videoId: "../outside",
      title: "Bad result",
    });
    expect((await runTrainingGeneration(tasks, f.actions)).join(" ")).toContain("invalid video");
    expect(f.actions.attach).not.toHaveBeenCalled();
  });
  it("retains successful illustrations and respects Stop before searching for videos", async () => {
    const f = fixture();
    let stopped = false;
    f.actions.stopped = () => stopped;
    f.actions.image.mockImplementation(async () => {
      stopped = true;
      return "data:image/jpeg;base64,aGVsbG8=";
    });
    await runTrainingGeneration(
      trainingGenerationPlan(f.topics, units, f.results, "teach", { images: true, videos: true }),
      f.actions,
    );
    expect(f.topics[0]?.image).toBeTruthy();
    expect(f.actions.image).toHaveBeenCalledOnce();
    expect(f.actions.video).not.toHaveBeenCalled();
  });
});
