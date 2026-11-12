export type SlideBlock =
  | { kind: "text"; body: string }
  | { kind: "tip" | "warning" | "takeaway"; body: string }
  | { kind: "flip"; front: string; back: string }
  | { kind: "tabs" | "accordion"; items: { label: string; body: string }[] }
  | { kind: "checklist"; items: string[] }
  | { kind: "photo"; prompt: string }
  | {
      kind: "hotspot";
      image: string;
      points: { x: number; y: number; label: string; body: string }[];
    };

export type LessonSlide = { title: string; blocks: SlideBlock[] };

export function practicalTaskIndex(slides: LessonSlide[], slideIndex: number, blockIndex: number): number {
  return slides.reduce((total, slide) => total + slide.blocks.length, 0)
    + slides.slice(0, slideIndex).reduce((total, slide) => total + slide.blocks.length, 0)
    + blockIndex;
}

/** Plain manual text remains readable. Only complete, recognised widgets become interactive. */
function parseBlocks(lines: string[]): SlideBlock[] {
  const blocks: SlideBlock[] = [];
  let plain: string[] = [];
  const flush = () => {
    const body = plain.join("\n").trim();
    if (body) blocks.push({ kind: "text", body });
    plain = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const marker =
      /^:::(tip|warning|takeaway|flip|tabs|accordion|checklist|photo|hotspot)\s*$/.exec(line);
    if (!marker) {
      plain.push(line);
      continue;
    }
    let end = i + 1;
    while (end < lines.length && !/^:::\s*$/.test(lines[end]!) && !/^:::/.test(lines[end]!)) end++;
    if (!/^:::\s*$/.test(lines[end] ?? "")) {
      plain.push(line);
      continue;
    }
    const body = lines
      .slice(i + 1, end)
      .join("\n")
      .trim();
    const kind = marker[1];
    let block: SlideBlock | undefined;
    if ((kind === "tip" || kind === "warning" || kind === "takeaway") && body)
      block = { kind, body };
    if (kind === "flip") {
      const [front, back, ...extra] = body.split(/^\s*---\s*$/m).map((s) => s.trim());
      if (front && back && !extra.length) block = { kind, front, back };
    }
    if (kind === "tabs" || kind === "accordion") {
      const parts = body.split(/^###\s+/m);
      const items = parts.slice(1).map((part) => {
        const split = part.indexOf("\n");
        return {
          label: split < 0 ? "" : part.slice(0, split).trim(),
          body: split < 0 ? "" : part.slice(split + 1).trim(),
        };
      });
      if (!parts[0]?.trim() && items.length && items.every((item) => item.label && item.body))
        block = { kind, items };
    }
    if (kind === "checklist") {
      const items = body
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => /^[-*]\s+(?:\[\s?\]\s*)?(.+)$/.exec(s.trim())?.[1]?.trim());
      if (items.length && items.every((item): item is string => !!item)) block = { kind, items };
    }
    if (kind === "photo" && body) block = { kind, prompt: body };
    if (kind === "hotspot") {
      const lines = body.split("\n");
      const image = lines[0]?.trim();
      const parts = lines
        .slice(1)
        .join("\n")
        .split(/^###\s+/m);
      const points = parts.slice(1).map((part) => {
        const split = part.indexOf("\n");
        const head = (split < 0 ? part : part.slice(0, split)).trim();
        const coords = /^(\d{1,3}),(\d{1,3})\s+(\S.*)$/.exec(head);
        return {
          x: coords ? Number(coords[1]) : -1,
          y: coords ? Number(coords[2]) : -1,
          label: coords ? coords[3]!.trim() : "",
          body: split < 0 ? "" : part.slice(split + 1).trim(),
        };
      });
      if (
        image &&
        /^https:\/\//.test(image) &&
        !parts[0]?.trim() &&
        points.length &&
        points.every(
          (point) =>
            point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100 && point.label,
        )
      )
        block = { kind, image, points };
    }
    if (block) {
      flush();
      blocks.push(block);
    } else plain.push(...lines.slice(i, end + 1));
    i = end;
  }
  flush();
  return blocks;
}

export function splitLessonSource(source: string) {
  // Imported manuals append this administrative footer for Studio's review gate.
  const footer =
    /\n\nSource: [^\n]*(?:\n(?:Review required before publishing\.|Reviewed by trainer\.))?\s*$/.exec(
      source,
    )?.[0] ?? "";
  return { content: footer ? source.slice(0, -footer.length) : source, footer };
}

export function parseLessonSlides(source: string): LessonSlide[] {
  const { content } = splitLessonSource(source);
  const groups: { title: string; lines: string[] }[] = [];
  let current = { title: "", lines: [] as string[] };
  for (const line of content.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = /^(?:#{1,2}\s+)(.+)$/.exec(line);
    if (heading) {
      groups.push(current);
      current = { title: heading[1]!.trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  groups.push(current);
  return groups.flatMap(({ title, lines }) => {
    const blocks = parseBlocks(lines);
    return blocks.length || title ? [{ title, blocks }] : [];
  });
}

/** Add breaks to long manual sections at paragraph boundaries without rewriting the source. */
export function formatManualAsSlides(source: string): string {
  let size = 0;
  let continuation = 1;
  const parts = source
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n[ \t]*\n/);
  // Keep the manual's wording; give explicitly labelled callouts and checkbox lists their native controls.
  return parts
    .map((part) => {
      if (/^#{1,2}\s/.test(part)) {
        size = part.length;
        return part;
      }
      const callout =
        /^(safety warning|warning|pro tip|tip|key takeaway|takeaway):\s*(\S[\s\S]*)$/i.exec(part);
      if (callout && callout[2]) {
        const label = callout[1]!.toLowerCase();
        const kind = label.includes("warning")
          ? "warning"
          : label.includes("tip")
            ? "tip"
            : "takeaway";
        part = ":::" + kind + "\n" + callout[2] + "\n:::";
      } else if (part && part.split("\n").every((line) => /^[-*]\s+\[ \]\s+\S/.test(line.trim()))) {
        part = ":::checklist\n" + part + "\n:::";
      }
      if (size && size + part.length > 850) {
        size = part.length;
        return "## Continued (" + continuation++ + ")\n\n" + part;
      }
      size += part.length;
      return part;
    })
    .join("\n\n");
}

export function slideText(slide: LessonSlide, revealAnswers = true): string {
  return [
    slide.title,
    ...slide.blocks.flatMap((block) => {
      if (block.kind === "flip") return revealAnswers ? [block.front, block.back] : [block.front];
      if (block.kind === "checklist") return block.items;
      if (block.kind === "tabs" || block.kind === "accordion")
        return block.items.flatMap(({ label, body }) => [label, body]);
      if (block.kind === "photo") return [block.prompt];
      if (block.kind === "hotspot") return block.points.flatMap(({ label, body }) => [label, body]);
      return "body" in block ? [block.body] : [];
    }),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function lessonContentKey(source: string): string {
  // A local resume hint, not a security boundary.
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}
