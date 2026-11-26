export type SlideBlock =
  | { kind: "text"; body: string; fenced?: true }
  | { kind: "tip" | "warning" | "takeaway"; body: string }
  | { kind: "flip"; front: string; back: string }
  | { kind: "tabs" | "accordion"; items: { label: string; body: string }[] }
  | { kind: "checklist"; items: string[] }
  | { kind: "photo"; prompt: string }
  | {
      kind: "hotspot";
      image: string;
      points: { x: number; y: number; label: string; body: string }[];
    }
  | { kind: "image"; url: string; caption: string }
  | { kind: "video"; url: string; youtube: boolean; interactions: { atSeconds: number; note: string }[] }
  | { kind: "facts"; items: { claim: string; evidence: string; image: string | null }[] }
  | { kind: "quizcheck"; items: { question: string; options: string[]; correctIndices: number[]; hint: string | null }[] }
  | { kind: "columns"; columns: SlideBlock[][] };

export type LessonSlide = { title: string; blocks: SlideBlock[] };

/** Extracts the video id from a youtube.com/youtu.be URL (watch, youtu.be short link, /embed/, /shorts/), or null if it isn't a recognized YouTube link. */
export function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return parsed.pathname.slice(1) || null;
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
      const match = /^\/(?:embed|shorts)\/([^/]+)/.exec(parsed.pathname);
      if (match) return match[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export function practicalTaskIndex(slides: LessonSlide[], slideIndex: number, blockIndex: number): number {
  return slides.reduce((total, slide) => total + slide.blocks.length, 0)
    + slides.slice(0, slideIndex).reduce((total, slide) => total + slide.blocks.length, 0)
    + blockIndex;
}

export function slideBlockLocations(slides: LessonSlide[]) {
  let nestedIndex = slides.reduce((total, slide) => total + slide.blocks.length, 0) * 2;
  return slides.flatMap((slide, si) => slide.blocks.flatMap((block, bi) => {
    const top = { block, path: `${si}:${bi}`, taskIndex: practicalTaskIndex(slides, si, bi) };
    return block.kind === "columns"
      ? [top, ...block.columns.flatMap((column, ci) => column.map((child, i) => ({ block: child, path: `${si}:${bi}:${ci}:${i}`, taskIndex: nestedIndex++ })))]
      : [top];
  }));
}

/** Plain manual text remains readable. Only complete, recognised widgets become interactive. */
export function blockFenceEnd(lines: string[], start: number): number {
  if (lines[start]?.trim() !== ":::columns") {
    let end = start + 1;
    while (end < lines.length && !/^:::/.test(lines[end]!)) end++;
    return /^:::\s*$/.test(lines[end] ?? "") ? end : -1;
  }
  let depth = 1;
  for (let end = start + 1; end < lines.length; end++) {
    if (/^:::\w+\s*$/.test(lines[end]!)) depth++;
    else if (/^:::\s*$/.test(lines[end]!) && --depth === 0) return end;
  }
  return -1;
}

export function parseBlocks(source: string | string[], depth = 0): SlideBlock[] {
  const lines = typeof source === "string" ? source.replace(/\r\n?/g, "\n").split("\n") : source;
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
      /^:::(text|tip|warning|takeaway|flip|tabs|accordion|checklist|photo|hotspot|image|video|facts|quizcheck|columns)\s*$/.exec(line);
    if (!marker) {
      plain.push(line);
      continue;
    }
    const end = blockFenceEnd(lines, i);
    if (end < 0) {
      plain.push(line);
      continue;
    }
    const body = lines
      .slice(i + 1, end)
      .join("\n")
      .trim();
    const kind = marker[1];
    let block: SlideBlock | undefined;
    if (kind === "text" && body) block = { kind, body, fenced: true };
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
    if (kind === "image") {
      const bodyLines = body.split("\n");
      const url = bodyLines[0]?.trim();
      if (url && (/^https:\/\//.test(url) || (url.length <= 120000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url)))) block = { kind, url, caption: bodyLines.slice(1).join("\n").trim() };
    }
    if (kind === "video") {
      const bodyLines = body.split("\n").map((l) => l.trim()).filter(Boolean);
      const url = bodyLines[0];
      if (url && /^https:\/\//.test(url)) {
        const interactions = bodyLines.slice(1).flatMap((l) => {
          const match = /^(\d+):([0-5]\d)\s+(\S.*)$/.exec(l);
          return match ? [{ atSeconds: Number(match[1]) * 60 + Number(match[2]), note: match[3]!.trim() }] : [];
        });
        block = { kind, url, youtube: /youtube\.com|youtu\.be/.test(url), interactions };
      }
    }
    if (kind === "facts") {
      const parts = body.split(/^###\s+/m);
      const items = parts.slice(1).map((part) => {
        const partLines = part.split("\n");
        const claim = partLines[0]?.trim() ?? "";
        const rest = partLines.slice(1).join("\n").trim().split("\n").map((l) => l.trim()).filter(Boolean);
        const lastLine = rest.at(-1);
        const image = lastLine && /^https:\/\//.test(lastLine) ? lastLine : null;
        const evidence = (image ? rest.slice(0, -1) : rest).join(" ").trim();
        return { claim, evidence, image };
      });
      if (!parts[0]?.trim() && items.length && items.every((item) => item.claim && item.evidence)) block = { kind, items };
    }
    if (kind === "quizcheck") {
      const parts = body.split(/^###\s+/m);
      const items = parts.slice(1).flatMap((part) => {
        const partLines = part.split("\n");
        const question = partLines[0]?.trim() ?? "";
        const options: string[] = [];
        const correctIndices: number[] = [];
        let hint: string | null = null;
        for (const l of partLines.slice(1)) {
          const trimmed = l.trim();
          const answer = /^A(\*)?:\s*(\S.*)$/.exec(trimmed);
          if (answer) {
            if (answer[1]) correctIndices.push(options.length);
            options.push(answer[2]!.trim());
            continue;
          }
          const hintLine = /^H:\s*(\S.*)$/.exec(trimmed);
          if (hintLine) hint = hintLine[1]!.trim();
        }
        return question && options.length >= 2 && correctIndices.length ? [{ question, options, correctIndices, hint }] : [];
      });
      if (!parts[0]?.trim() && items.length) block = { kind, items };
    }
    if (kind === "columns") {
      const columns: string[][] = [[]];
      let innerDepth = 0;
      for (const columnLine of body.split("\n")) {
        if (!innerDepth && /^---col---\s*$/.test(columnLine)) columns.push([]);
        else {
          columns.at(-1)!.push(columnLine);
          if (/^:::\w+\s*$/.test(columnLine)) innerDepth++;
          else if (/^:::\s*$/.test(columnLine)) innerDepth = Math.max(0, innerDepth - 1);
        }
      }
      if (depth < 1 && columns.length >= 2)
        block = { kind, columns: columns.map((column) => parseBlocks(column, depth + 1)) };
    }
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
  const sourceLines = content.replace(/\r\n?/g, "\n").split("\n");
  let fenceEnd = -1;
  for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex++) {
    const line = sourceLines[lineIndex]!;
    if (lineIndex > fenceEnd && /^:::\w+\s*$/.test(line)) fenceEnd = blockFenceEnd(sourceLines, lineIndex);
    const heading = /^(?:#{1,2}\s+)(.+)$/.exec(line);
    if (heading && lineIndex > fenceEnd) {
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
      if (block.kind === "columns") return block.columns.map((blocks) => slideText({ title: "", blocks }, revealAnswers));
      if (block.kind === "quizcheck") return block.items.flatMap((item) => revealAnswers ? [item.question, ...item.options] : [item.question]);
      if (block.kind === "facts") return block.items.flatMap((item) => [item.claim, item.evidence]);
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
