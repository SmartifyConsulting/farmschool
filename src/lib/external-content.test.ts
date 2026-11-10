import { describe, expect, it } from "vitest";
import { canonicalKey, officialEmbed, parseCsv, parseDuration, videoRow } from "./external-content";

describe("external video library", () => {
  it("treats different YouTube link styles as the same video (duplicate detection)", () => {
    expect(canonicalKey("https://www.youtube.com/watch?v=K8HaLSDlUgA")).toBe("youtube:K8HaLSDlUgA");
    expect(canonicalKey("https://youtu.be/K8HaLSDlUgA")).toBe("youtube:K8HaLSDlUgA");
  });
  it("ignores trailing slashes, query strings and case for website links", () => {
    expect(canonicalKey("https://www.AccessAgriculture.org/Managing-vegetable-nematodes/?cat_id=1"))
      .toBe("url:www.accessagriculture.org/managing-vegetable-nematodes");
  });
  it("only embeds official YouTube players; other sites become link-outs", () => {
    expect(officialEmbed("https://youtu.be/K8HaLSDlUgA")).toBe("https://www.youtube-nocookie.com/embed/K8HaLSDlUgA");
    expect(officialEmbed("https://www.accessagriculture.org/managing-vegetable-nematodes")).toBeNull();
  });
  it("parses CSV with quoted commas", () => {
    const rows = parseCsv('title,url\n"Sow, then thin",https://youtu.be/K8HaLSDlUgA\n');
    expect(rows).toEqual([{ title: "Sow, then thin", url: "https://youtu.be/K8HaLSDlUgA" }]);
  });
  it("reads durations", () => {
    expect(parseDuration("5:30")).toBe(330);
    expect(parseDuration("1:02:03")).toBe(3723);
  });
  it("auto-detects a tab-separated paste or file", () => {
    const rows = parseCsv("title\turl\nSow, then thin\thttps://youtu.be/K8HaLSDlUgA\n");
    expect(rows).toEqual([{ title: "Sow, then thin", url: "https://youtu.be/K8HaLSDlUgA" }]);
  });
  it("accepts a link pasted without a scheme by adding https:// automatically", () => {
    const parsed = videoRow.parse({ url: "www.accessagriculture.org/managing-vegetable-nematodes" });
    expect(parsed.url).toBe("https://www.accessagriculture.org/managing-vegetable-nematodes");
  });
});
