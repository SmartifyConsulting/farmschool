/** Pure SCORM helpers shared by the uploader and the player (browser-safe). */

export type ScormManifest = { title: string; version: "1.2" | "2004"; entryPath: string };

/** Reads imsmanifest.xml text and finds the title, SCORM version and launch file. */
export function parseManifest(xml: string, fallbackTitle: string, files: string[]): ScormManifest {
  const version: "1.2" | "2004" = /2004|adlcp_v1p3|CAM 1\.3/i.test(xml) ? "2004" : "1.2";
  const orgTitle = xml.match(/<organization\b[^>]*>[\s\S]*?<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const anyTitle = xml.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const title = decodeXml(orgTitle || anyTitle || fallbackTitle);
  const href = xml.match(/<resource\b[^>]*adlcp:scormtype\s*=\s*["']sco["'][^>]*href\s*=\s*["']([^"']+)["']/i)?.[1]
    ?? xml.match(/<resource\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*adlcp:scormtype\s*=\s*["']sco["']/i)?.[1]
    ?? xml.match(/<resource\b[^>]*href\s*=\s*["']([^"']+)["']/i)?.[1];
  return { title, version, entryPath: href ? decodeXml(href) : findEntryFile(files) };
}

/** Without a manifest, look for the usual launch file names. */
export function findEntryFile(files: string[]): string {
  for (const name of ["index.html", "story.html", "index_lms.html", "story_html5.html"]) {
    const hit = files.filter((f) => f.toLowerCase().split("/").pop() === name).sort((a, b) => a.length - b.length)[0];
    if (hit) return hit;
  }
  const html = files.filter((f) => /\.html?$/i.test(f)).sort((a, b) => a.length - b.length)[0];
  if (!html) throw new Error("No HTML launch file was found in this package.");
  return html;
}

function decodeXml(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/** Normalises SCORM 1.2 / 2004 status values into one stored status. */
export function normaliseStatus(v12: string | undefined, completion: string | undefined, success: string | undefined): string {
  if (success === "passed" || success === "failed") return success;
  if (v12) return v12;
  if (completion) return completion;
  return "incomplete";
}

export function isFinished(status: string) {
  return status === "passed" || status === "completed";
}

const MIME: Record<string, string> = {
  html: "text/html", htm: "text/html", js: "application/javascript", css: "text/css", json: "application/json",
  xml: "application/xml", xsd: "application/xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  svg: "image/svg+xml", webp: "image/webp", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", swf: "application/x-shockwave-flash", txt: "text/plain",
  vtt: "text/vtt", pdf: "application/pdf", ico: "image/x-icon",
};
export function mimeFor(path: string) {
  return MIME[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

const CHILDREN: Record<string, string> = {
  "cmi.core._children": "student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time",
  "cmi.core.score._children": "raw,min,max",
  "cmi.score._children": "scaled,raw,min,max",
  "cmi.objectives._children": "id,score,status,success_status,completion_status,description",
  "cmi.interactions._children": "id,objectives,time,timestamp,type,correct_responses,weighting,student_response,learner_response,result,latency,description",
  "cmi.student_data._children": "mastery_score,max_time_allowed,time_limit_action",
  "cmi.student_preference._children": "audio,language,speed,text",
  "cmi.learner_preference._children": "audio_level,language,delivery_speed,audio_captioning",
};
/** Answers SCORM `._children` keyword reads (Articulate checks these on launch); null when not a keyword. */
export function cmiChildren(key: string): string | null {
  if (!key.endsWith("._children")) return null;
  return CHILDREN[key] ?? "";
}
/** Counts stored entries for a `._count` read, e.g. cmi.interactions._count → number of distinct cmi.interactions.N.* indexes. */
export function cmiCount(cmi: Record<string, string>, key: string): number {
  const prefix = key.slice(0, -"_count".length);
  const idx = new Set<string>();
  for (const k of Object.keys(cmi)) if (k.startsWith(prefix)) { const n = k.slice(prefix.length).split(".")[0]; if (n && /^\d+$/.test(n)) idx.add(n); }
  return idx.size;
}

/** Studio lessons of kind "scorm" store the linked package as `scorm:<packageId>` in the body. */
export function scormLessonRef(body: string): string | null {
  return body.match(/^scorm:([0-9a-f-]{36})/i)?.[1] ?? null;
}
