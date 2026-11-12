/** Builds xAPI 1.0.3-shaped statements from existing progress/quiz/SCORM/certificate rows, so they can be exported to any LRS. We don't run our own LRS; this is the interop boundary. */

import { createHash } from "node:crypto";

const BASE = "https://plusticity.app/xapi";

export type XapiStatement = {
  id: string;
  timestamp: string;
  actor: { objectType: "Agent"; account: { homePage: string; name: string } };
  verb: { id: string; display: { "en-US": string } };
  object: { objectType: "Activity"; id: string; definition: { name: { "en-US": string } } };
  result?: { completion?: boolean; success?: boolean; score?: { scaled: number } };
};

function actor(userId: string) {
  return { objectType: "Agent" as const, account: { homePage: BASE, name: userId } };
}
const VERB = {
  completed: { id: BASE + "/verbs/completed", display: { "en-US": "completed" } },
  passed: { id: BASE + "/verbs/passed", display: { "en-US": "passed" } },
  failed: { id: BASE + "/verbs/failed", display: { "en-US": "failed" } },
  attempted: { id: BASE + "/verbs/attempted", display: { "en-US": "attempted" } },
};
/** A stable id so re-exporting the same facts never produces a different statement. */
function stableId(...parts: string[]): string {
  const bytes = createHash("sha1")
    .update(Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex"))
    .update(JSON.stringify(parts)).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

export type XapiInput = {
  enrollments?: { user_id: string; course_id: string }[];
  cohortMembers?: { cohort_id: string; user_id: string }[];
  cohortAssignments?: { cohort_id: string; course_id: string }[];
  courses: { id: string; title: string }[];
  lessons: { id: string; course_id: string; title: string }[];
  progress: {
    user_id: string;
    course_id: string;
    lesson_id: string;
    completed: boolean;
    updated_at: string;
  }[];
  attempts: {
    user_id: string;
    course_id: string;
    lesson_id: string;
    score: number;
    passed: boolean;
    created_at: string;
  }[];
  scormPackages: { id: string; title: string }[];
  scormAttempts: {
    user_id: string;
    package_id: string;
    lesson_status: string;
    score_raw: number | null;
    score_max: number | null;
    updated_at: string;
  }[];
  certificates: {
    user_id: string;
    source: string;
    course_ref: string;
    title: string;
    issued_at: string;
    revoked_at?: string | null;
    expires_at?: string | null;
  }[];
};

export function buildXapiStatements(input: XapiInput): XapiStatement[] {
  const lessonTitle = new Map(input.lessons.map((l) => [l.id, l.title]));
  const scormTitle = new Map(input.scormPackages.map((p) => [p.id, p.title]));
  const statements: XapiStatement[] = [];
  for (const p of input.progress.filter((p) => p.completed)) {
    statements.push({
      id: stableId("lesson", p.user_id, p.course_id, p.lesson_id, p.updated_at),
      timestamp: p.updated_at,
      actor: actor(p.user_id),
      verb: VERB.completed,
      object: {
        objectType: "Activity",
        id: BASE + "/activities/lessons/" + p.lesson_id,
        definition: { name: { "en-US": lessonTitle.get(p.lesson_id) ?? "Lesson" } },
      },
      result: { completion: true },
    });
  }
  for (const a of input.attempts) {
    statements.push({
      id: stableId("quiz", a.user_id, a.lesson_id, a.created_at),
      timestamp: a.created_at,
      actor: actor(a.user_id),
      verb: a.passed ? VERB.passed : VERB.failed,
      object: {
        objectType: "Activity",
        id: BASE + "/activities/quizzes/" + a.lesson_id,
        definition: { name: { "en-US": lessonTitle.get(a.lesson_id) ?? "Quiz" } },
      },
      result: { completion: true, success: a.passed, score: { scaled: a.score / 100 } },
    });
  }
  for (const s of input.scormAttempts) {
    const done = s.lesson_status === "completed" || s.lesson_status === "passed";
    statements.push({
      id: stableId("scorm", s.user_id, s.package_id, s.updated_at),
      timestamp: s.updated_at,
      actor: actor(s.user_id),
      verb: done ? VERB.completed : VERB.attempted,
      object: {
        objectType: "Activity",
        id: BASE + "/activities/scorm/" + s.package_id,
        definition: { name: { "en-US": scormTitle.get(s.package_id) ?? "SCORM package" } },
      },
      result:
        s.score_raw !== null && s.score_max
          ? { completion: done, score: { scaled: Math.max(-1, Math.min(1, s.score_raw / s.score_max)) } }
          : { completion: done },
    });
  }
  for (const c of input.certificates.filter((certificate) => !certificate.revoked_at)) {
    statements.push({
      id: stableId("certificate", c.user_id, c.source, c.course_ref, c.issued_at),
      timestamp: c.issued_at,
      actor: actor(c.user_id),
      verb: VERB.completed,
      object: {
        objectType: "Activity",
        id: BASE + "/activities/certificates/" + c.source + "/" + c.course_ref,
        definition: { name: { "en-US": c.title } },
      },
      result: { completion: true, success: true },
    });
  }
  return statements.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export type ComplianceRow = {
  userId: string;
  courseId: string;
  courseTitle: string;
  completionRate: number;
  certified: boolean;
  compliant: boolean;
};

/** One row per learner-per-course: used to answer "who still owes evidence of completion". */
export function summariseCompliance(input: XapiInput): ComplianceRow[] {
  const lessonsByCourse = new Map<string, string[]>();
  for (const l of input.lessons)
    lessonsByCourse.set(l.course_id, [...(lessonsByCourse.get(l.course_id) ?? []), l.id]);
  const courseTitle = new Map(input.courses.map((c) => [c.id, c.title]));
  const certified = new Set(
    input.certificates.filter((certificate) => !certificate.revoked_at && (!certificate.expires_at || Date.parse(certificate.expires_at) > Date.now())).map((c) => c.source + ":" + c.course_ref + ":" + c.user_id),
  );
  const pairs = new Set(
    [...input.progress, ...input.attempts, ...(input.enrollments ?? [])].map((row) => row.user_id + ":" + row.course_id),
  );
  for (const assignment of input.cohortAssignments ?? []) {
    for (const member of input.cohortMembers ?? []) {
      if (member.cohort_id === assignment.cohort_id) pairs.add(member.user_id + ":" + assignment.course_id);
    }
  }
  for (const certificate of input.certificates) {
    if (certificate.source === "studio") pairs.add(certificate.user_id + ":" + certificate.course_ref);
  }
  const rows: ComplianceRow[] = [];
  for (const pair of pairs) {
    const [userId, courseId] = pair.split(":") as [string, string];
    const total = lessonsByCourse.get(courseId)?.length ?? 0;
    const done = new Set(
      input.progress
        .filter((p) => p.user_id === userId && p.course_id === courseId && p.completed && lessonsByCourse.get(courseId)?.includes(p.lesson_id))
        .map((p) => p.lesson_id),
    ).size;
    const completionRate = total ? Math.round((done / total) * 100) : 0;
    const certificate = certified.has("studio:" + courseId + ":" + userId);
    rows.push({
      userId,
      courseId,
      courseTitle: courseTitle.get(courseId) ?? "Course",
      completionRate,
      certified: certificate,
      compliant: certificate,
    });
  }
  return rows.sort((a, b) => a.completionRate - b.completionRate);
}
