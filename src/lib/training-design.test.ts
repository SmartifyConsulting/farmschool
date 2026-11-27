import { describe, it, expect } from "vitest";
import {
  sourceUnits,
  initialOutline,
  outlineProblems,
  coverageProblems,
  topicKey,
  publicImage,
  youtubeVideo,
  sourceLinksOnly,
  type TrainingPackage,
} from "./training-design";
import { trainingHtml, readTrainingPackage, trainingLessonBody } from "./training-html";

const id = "10000000-0000-4000-8000-000000000001";
const units = sourceUnits(
  id,
  "Policy.pdf",
  Array.from({ length: 18 }, (_, i) => ({
    page: i + 1,
    text: `${i + 1}. Policy topic ${i + 1}\n\n${"Source-supported responsibilities, exceptions and procedures. ".repeat(20)}`,
  })),
);
function completed() {
  const topics = initialOutline(units);
  const results = Object.fromEntries(
    topics.map((t) => [
      t.id,
      {
        key: topicKey(t, units, "teach"),
        reviewed: true,
        body: `## Teaching\n${"Source supported teaching text. ".repeat(5)}\n\n:::columns\nFirst\n---col---\nSecond\n:::\n\n:::flip\nQuestion\n---\nAnswer\n:::\n\n:::tabs\n### One\nContent\n### Two\nMore content\n:::\n\n:::checklist\n- Check one\n- Check two\n:::\n\n## Practice\nHypothetical situation applying the rules.\n\n## Knowledge check\n:::quizcheck\n### What should you do?\nA*: Follow the source procedure\nA: Ignore it\nH: Refer to the source.\n:::`,
      },
    ]),
  );
  return {
    version: 1,
    title: "Safeguarding",
    instruction: "teach",
    topics,
    results,
  } satisfies TrainingPackage;
}
describe("source-faithful training design", () => {
  it("uses the workspace outline in embedded preview while exports retain their own outline",()=>{
    const pkg=completed();
    const embedded=trainingHtml(pkg,true,{embedded:true,topic:pkg.topics[1]!.id});
    expect(embedded).toContain(".training-outline{display:none}.outline-jump{display:block}");
    expect(embedded).not.toContain("move(0)})();");
    expect(trainingHtml(pkg,true)).toContain("move(0)})();");
  });
  it("preserves real source-directory links but rejects invented links", () => {
    expect(
      sourceLinksOnly("Visit https://www.example.org/help/.", [
        "Directory: https://www.example.org/help/",
      ]),
    ).toBe(true);
    expect(
      sourceLinksOnly("Visit https://invented.example/help", [
        "Directory: https://www.example.org/help/",
      ]),
    ).toBe(false);
  });
  it("creates a complete page-based outline for an 18-page PDF below the old chunk limit", () => {
    expect(units).toHaveLength(18);
    const topics = initialOutline(units);
    expect(topics).toHaveLength(18);
    expect(topics.reduce((n, t) => n + t.slides, 0)).toBe(54);
    expect(outlineProblems(topics, units)).toEqual([]);
  });
  it("retains all text when splitting long pages", () => {
    const text = "Text and Unicode 😀. ".repeat(1000);
    const chunks = sourceUnits(id, "Long.pdf", [{ page: 3, text }]);
    expect(chunks.map((u) => u.text).join("")).toBe(text);
    expect(chunks.every((u) => u.text.length <= 6500)).toBe(true);
  });
  it("blocks removed source coverage and unknown source assignments", () => {
    const topics = initialOutline(units);
    expect(outlineProblems(topics.slice(1), units).join(" ")).toContain("page 1");
    topics[0]!.unitIds = ["foreign"];
    expect(outlineProblems(topics, units).join(" ")).toContain("available source");
  });
  it("blocks incomplete, unreviewed and stale topics", () => {
    const pkg = completed();
    expect(coverageProblems(pkg.topics, units, pkg.results, "teach")).toEqual([]);
    pkg.results["topic-1"]!.reviewed = false;
    expect(coverageProblems(pkg.topics, units, pkg.results, "teach").join(" ")).toContain(
      "Review source",
    );
    pkg.topics[0]!.title = "Changed";
    expect(coverageProblems(pkg.topics, units, pkg.results, "teach").join(" ")).toContain(
      "regenerate",
    );
  });
  it("detects missing slides and interactive components after manual editing", () => {
    const pkg = completed();
    pkg.results["topic-1"]!.body = "## Only a summary\nShort text";
    const problems = coverageProblems(pkg.topics, units, pkg.results, "teach").join(" ");
    expect(problems).toContain("planned slides");
    expect(problems).toContain("learning components");
  });
  it("requires valid attributed media with alt text and explicit review", () => {
    const pkg = completed();
    pkg.topics[0]!.image = "https://images.example.com/a.jpg";
    expect(coverageProblems(pkg.topics, units, pkg.results, "teach").join(" ")).toContain(
      "alternative text",
    );
    Object.assign(pkg.topics[0]!, {
      alt: "Relevant illustration",
      attribution: "Trainer-owned photo",
      mediaReviewed: true,
    });
    expect(coverageProblems(pkg.topics, units, pkg.results, "teach")).toEqual([]);
  });
  it("rejects script/SVG image payloads and fabricated video domains", () => {
    expect(publicImage("javascript:alert(1)")).toBe(false);
    expect(publicImage("data:image/svg+xml,<svg onload=alert(1)>")).toBe(false);
    expect(youtubeVideo("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("round trips editable outline and slides, escapes teaching text and keeps draft labelling", () => {
    const pkg = completed();
    pkg.title = "</script><img src=x onerror=alert(1)>";
    const html = trainingHtml(pkg, true);
    expect(readTrainingPackage(html)).toEqual(pkg);
    expect(html).toContain("DRAFT — incomplete");
    expect(html).not.toContain(pkg.title);
    expect(html).toContain("&lt;/script&gt;");
    expect(html).toContain('id="next"');
    expect(html).toContain("data-check");
    expect(html).toContain("data-tab");
  });
  it("copies teaching content and reviewed media into the existing curriculum format", () => {
    const pkg = completed();
    pkg.topics[0]!.image = "https://images.example.com/a.jpg";
    pkg.topics[0]!.alt = "Caption";
    pkg.topics[0]!.video = "https://youtu.be/dQw4w9WgXcQ";
    const body = trainingLessonBody(pkg);
    expect(body).toContain(":::image");
    expect(body).toContain(":::video");
    expect(body).not.toContain("<script");
  });
  it("exports a linked sidebar outline with every generated slide and pending topics", () => {
    const pkg = completed();
    delete pkg.results[pkg.topics.at(-1)!.id];
    pkg.topics[0]!.module = "<script>unsafe</script>";
    const html = trainingHtml(pkg, true);
    expect(html).toContain('<aside class="training-outline">');
    expect(html).toContain('<nav aria-label="Training outline">');
    expect(html.match(/data-slide="\d+"/g)).toHaveLength(51);
    expect(html).toContain('data-slide="50"');
    expect(html).toContain("Slides not generated yet");
    expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");
    expect(html).not.toContain("<script>unsafe</script>");
    expect(html).toContain("button.onclick=()=>move(Number(button.dataset.slide))");
    expect(readTrainingPackage(html)).toEqual(pkg);
  });
});
