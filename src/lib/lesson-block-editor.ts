import { blockFenceEnd, parseBlocks, type SlideBlock } from "./lesson-slides";

export type BlockKind = SlideBlock["kind"];
export const BLOCK_TEMPLATES: {
  kind: BlockKind;
  label: string;
  category: string;
  source: string;
}[] = [
  {
    kind: "text",
    label: "Text",
    category: "Text",
    source: ":::text\nAdd teaching text here.\n:::",
  },
  { kind: "tip", label: "Pro tip", category: "Text", source: ":::tip\nAdd a practical tip.\n:::" },
  {
    kind: "warning",
    label: "Safety warning",
    category: "Text",
    source: ":::warning\nExplain the safety concern.\n:::",
  },
  {
    kind: "takeaway",
    label: "Key takeaway",
    category: "Text",
    source: ":::takeaway\nSummarise the key idea.\n:::",
  },
  {
    kind: "tabs",
    label: "Tabs",
    category: "Text",
    source:
      ":::tabs\n### Topic 1\nExplain the first topic.\n### Topic 2\nExplain the second topic.\n:::",
  },
  {
    kind: "accordion",
    label: "Accordion",
    category: "Text",
    source:
      ":::accordion\n### Step 1\nExplain the first step.\n### Step 2\nExplain the second step.\n:::",
  },
  {
    kind: "checklist",
    label: "Checklist",
    category: "Text",
    source: ":::checklist\n- First task\n- Second task\n:::",
  },
  {
    kind: "flip",
    label: "Flip card",
    category: "Interactions",
    source: ":::flip\nWrite a question or concept.\n---\nWrite the answer or explanation.\n:::",
  },
  {
    kind: "hotspot",
    label: "Hotspot image",
    category: "Interactions",
    source:
      ":::hotspot\nhttps://example.com/image.jpg\n### 20,30 Label one\nExplain this point.\n:::",
  },
  {
    kind: "columns",
    label: "Columns",
    category: "Interactions",
    source: ":::columns\nFirst column text.\n---col---\nSecond column text.\n:::",
  },
  {
    kind: "quizcheck",
    label: "Quiz check",
    category: "Assessments",
    source:
      ":::quizcheck\n### What should you check first?\nA*: The safety instructions\nA: Nothing\nH: Think about safe preparation.\n:::",
  },
  {
    kind: "image",
    label: "Image",
    category: "Multimedia",
    source:
      ":::image\nhttps://example.com/image.jpg\nReplace with your image URL and caption.\n:::",
  },
  {
    kind: "video",
    label: "Video",
    category: "Multimedia",
    source: ":::video\nhttps://example.com/video.mp4\n00:10 Add a pause-point note.\n:::",
  },
  {
    kind: "photo",
    label: "Photo evidence",
    category: "Multimedia",
    source: ":::photo\nUpload a photo of your completed task for trainer sign-off.\n:::",
  },
  {
    kind: "facts",
    label: "Facts",
    category: "Multimedia",
    source: ":::facts\n### A source-supported fact\nExplain its supporting evidence.\n:::",
  },
];

export function serializeBlocks(blocks: SlideBlock[]): string {
  return blocks.map(serializeBlock).join("\n\n");
}

export function serializeBlock(block: SlideBlock): string {
  if (block.kind === "text") return block.fenced ? ":::text\n" + block.body + "\n:::" : block.body;
  let body = "";
  if ("body" in block) body = block.body;
  else if (block.kind === "flip") body = block.front + "\n---\n" + block.back;
  else if (block.kind === "tabs" || block.kind === "accordion")
    body = block.items.map((item) => "### " + item.label + "\n" + item.body).join("\n");
  else if (block.kind === "checklist") body = block.items.map((item) => "- " + item).join("\n");
  else if (block.kind === "photo") body = block.prompt;
  else if (block.kind === "image") body = block.url + (block.caption ? "\n" + block.caption : "");
  else if (block.kind === "video")
    body = [
      block.url,
      ...block.interactions.map(
        (item) =>
          String(Math.floor(item.atSeconds / 60)).padStart(2, "0") +
          ":" +
          String(item.atSeconds % 60).padStart(2, "0") +
          " " +
          item.note,
      ),
    ].join("\n");
  else if (block.kind === "hotspot")
    body = [
      block.image,
      ...block.points.map(
        (item) => "### " + item.x + "," + item.y + " " + item.label + "\n" + item.body,
      ),
    ].join("\n");
  else if (block.kind === "facts")
    body = block.items
      .map(
        (item) =>
          "### " + item.claim + "\n" + item.evidence + (item.image ? "\n" + item.image : ""),
      )
      .join("\n");
  else if (block.kind === "quizcheck")
    body = block.items
      .map((item) =>
        [
          "### " + item.question,
          ...item.options.map(
            (option, i) => "A" + (item.correctIndices.includes(i) ? "*" : "") + ": " + option,
          ),
          ...(item.hint ? ["H: " + item.hint] : []),
        ].join("\n"),
      )
      .join("\n");
  else if (block.kind === "columns")
    body = block.columns.map(serializeBlocks).join("\n---col---\n");
  return ":::" + block.kind + "\n" + body + "\n:::";
}

export type BlockEntry = {
  start: number;
  end: number;
  source: string;
  block: SlideBlock;
  heading?: boolean;
};
export function columnSources(source: string): string[] {
  const body = source.slice(source.indexOf("\n") + 1, source.lastIndexOf("\n:::"));
  const columns: string[][] = [[]];
  let depth = 0;
  for (const line of body.split("\n")) {
    if (!depth && /^---col---\s*$/.test(line)) columns.push([]);
    else {
      columns.at(-1)!.push(line);
      if (/^:::\w+\s*$/.test(line)) depth++;
      else if (/^:::\s*$/.test(line)) depth = Math.max(0, depth - 1);
    }
  }
  return columns.map((column) => column.join("\n"));
}

export function serializeColumns(columns: string[]): string {
  return columns.length === 1
    ? columns[0]!
    : ":::columns\n" + columns.join("\n---col---\n") + "\n:::";
}

export function blockEntries(source: string, inColumn = false): BlockEntry[] {
  const lines = source.split("\n");
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const entries: BlockEntry[] = [];
  let plainStart = 0;
  const add = (from: number, to: number, block?: SlideBlock, heading = false) => {
    const raw = source.slice(from, to);
    const text = raw.trim();
    if (!text) return;
    const start = from + raw.indexOf(text);
    const end = !block && !heading ? to : start + text.length;
    entries.push({
      start,
      end,
      source: text,
      block: block ?? { kind: "text", body: text },
      heading,
    });
  };
  for (let i = 0; i < lines.length; i++) {
    if (!inColumn && /^#{1,2}\s+/.test(lines[i]!)) {
      add(plainStart, offsets[i]!);
      add(offsets[i]!, offsets[i]! + lines[i]!.length, undefined, true);
      plainStart = offsets[i]! + lines[i]!.length;
      continue;
    }
    if (!/^:::\w+\s*$/.test(lines[i]!)) continue;
    const end = blockFenceEnd(lines, i);
    if (end < 0) continue;
    const rawEnd = offsets[end]! + lines[end]!.length;
    const parsed = parseBlocks(source.slice(offsets[i]!, rawEnd), inColumn ? 1 : 0);
    if (parsed.length !== 1 || (parsed[0]!.kind === "text" && !parsed[0]!.fenced)) continue;
    add(plainStart, offsets[i]!);
    add(offsets[i]!, rawEnd, parsed[0]);
    plainStart = rawEnd;
    i = end;
  }
  add(plainStart, source.length);
  return entries;
}

export function replaceEntry(
  source: string,
  entry: BlockEntry,
  replacement: string,
  preserveBoundary = true,
): string {
  const boundary = source.slice(entry.start, entry.end).match(/\n[\t \n]*$/)?.[0] ?? "";
  const suffix = preserveBoundary
    ? boundary
    : entry.block.kind === "text" &&
        !entry.block.fenced &&
        !entry.heading &&
        entry.end < source.length
      ? boundary || "\n\n"
      : "";
  return (
    source.slice(0, entry.start) +
    replacement +
    (suffix && !replacement.endsWith(suffix) ? suffix : "") +
    source.slice(entry.end)
  );
}

export function validateGeneratedBlock(source: string, kind: BlockKind): string {
  const text = source.trim();
  if (!text || text.length > 16000 || /^(?:#{1,2}\s|```)/m.test(text))
    throw new Error("The generated block could not be validated. Try a more specific description.");
  const blocks = parseBlocks(text);
  if (
    blocks.length !== 1 ||
    blocks[0]!.kind !== kind ||
    (kind === "text" &&
      blocks[0]!.kind === "text" &&
      !blocks[0]!.fenced &&
      /^:::|^---col---/m.test(text))
  )
    throw new Error("The generated block could not be validated. Try a more specific description.");
  if (kind === "columns") {
    const columns = blocks[0] as Extract<SlideBlock, { kind: "columns" }>;
    if (
      columns.columns.length > 4 ||
      columns.columns.some(
        (column) =>
          !column.length ||
          serializeBlocks(column).includes(":::columns") ||
          /:::|---col---/.test(
            column
              .filter((b) => b.kind === "text")
              .map((block) => block.body)
              .join("\n"),
          ),
      )
    )
      throw new Error("The generated columns contain an invalid block. Please try again.");
  }
  if (serializeBlock(blocks[0]!).replace(/\s/g, "") !== text.replace(/\s/g, ""))
    throw new Error("The generated block contains unsupported content. Please try again.");
  return kind === "text" && blocks[0]!.kind === "text" && !blocks[0]!.fenced
    ? serializeBlock({ kind: "text", body: text, fenced: true })
    : text;
}
