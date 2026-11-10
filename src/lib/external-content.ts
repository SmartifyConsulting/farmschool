// Client-safe helpers for the shared external video library (Access Agriculture first).
import { z } from "zod";
import { STUDIO_CATEGORIES } from "@/lib/studio";

export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/(?:embed|shorts)\/|youtube-nocookie\.com\/embed\/)([\w-]{11})/);
  return m?.[1] ?? null;
}

/** One stable key per video so the same video is never imported twice. */
export function canonicalKey(url: string): string {
  const yt = youtubeId(url);
  if (yt) return `youtube:${yt}`;
  const u = new URL(url.trim());
  const path = u.pathname.replace(/\/+$/, "").toLowerCase();
  return `url:${u.hostname.toLowerCase()}${path}`;
}

/** Only official YouTube players are embedded; everything else is shown as a link-out. */
export function officialEmbed(url: string): string | null {
  const yt = youtubeId(url);
  return yt ? `https://www.youtube-nocookie.com/embed/${yt}` : null;
}

/** Spreadsheet links often arrive without a scheme (e.g. "www.example.com/video"); add https:// before validating. */
function withScheme(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export const videoRow = z.object({
  title: z.string().trim().max(200).optional().default(""),
  url: z.preprocess(
    (v) => (typeof v === "string" ? withScheme(v) : v),
    z.string().trim().url().regex(/^https:\/\//, "Links must start with https://"),
  ),
  description: z.string().trim().max(4000).optional().default(""),
  category: z.string().trim().optional().default(""),
  language: z.string().trim().max(40).optional().default("English"),
  thumbnail: z.string().trim().optional().default(""),
  duration: z.string().trim().optional().default(""),
  published: z.string().trim().optional().default(""),
});
export type VideoRow = z.infer<typeof videoRow>;

export function normaliseCategory(c: string): string {
  const hit = STUDIO_CATEGORIES.find((x) => x.toLowerCase() === c.trim().toLowerCase());
  return hit ?? "Farm Management";
}

/** "4:30", "1:02:03" or plain seconds → seconds. */
export function parseDuration(v: string): number | null {
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  const parts = v.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((t, n) => t * 60 + n, 0);
}

/** Minimal CSV/TSV parser (quoted fields, newlines in quotes). Header row required.
 * Delimiter is auto-detected from the header line, so a tab-separated (.tsv) paste or file
 * works the same as comma-separated — "all file types" in practice means these two. */
export function parseCsv(text: string): Record<string, string>[] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = ""; if (row.some((f) => f.trim())) rows.push(row); row = [];
    } else field += c;
  }
  row.push(field); if (row.some((f) => f.trim())) rows.push(row);
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

export const CSV_TEMPLATE = "title,url,description,category,language,thumbnail,duration,published\n" +
  '"Making compost","https://www.youtube.com/watch?v=XXXXXXXXXXX","How to make compost","Soil Management","English","","5:30","2024-01-15"\n';
