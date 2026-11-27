export type LessonProsePart =
  | { kind: "paragraph" | "heading"; text: string; level?: number }
  | { kind: "bullets" | "numbers"; items: string[] };
/** Lists may immediately follow their labels without a blank line. */
export function lessonProseParts(content: string): LessonProsePart[] {
  const parts: LessonProsePart[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      parts.push({ kind: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };
  for (const raw of content.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      parts.push({ kind: "heading", level: heading[1]!.length, text: heading[2]! });
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line),
      number = /^\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || number) {
      flush();
      const kind = bullet ? "bullets" : "numbers";
      const last = parts.at(-1),
        text = (bullet ?? number)![1]!;
      if (last?.kind === kind) last.items.push(text);
      else parts.push({ kind, items: [text] });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return parts;
}
