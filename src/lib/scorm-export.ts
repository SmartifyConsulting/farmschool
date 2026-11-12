import JSZip from "jszip";
import { validateCourseArchive, type CourseArchive } from "@/lib/course-archive";
import { parseLessonSlides } from "@/lib/lesson-slides";
import { parseQuizQuestions, type QuizQuestion } from "@/lib/studio-quiz";
import { parsePassMark } from "@/lib/studio";
import { quizSampleSize } from "@/lib/quiz-pools";

export type PortableCourse = {
  title: string;
  description: string;
  lessons: {
    title: string;
    body: string;
    video_url: string | null;
    kind: string;
    questions: QuizQuestion[];
    answers: unknown[];
    passMark: number;
  }[];
};
const xml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
export function portableCourse(input: unknown): PortableCourse {
  const archive = validateCourseArchive(input);
  if (archive.snapshot.lessons.length > 100)
    throw new Error("Portable packages support up to 100 lessons.");
  if (archive.snapshot.videos.length)
    throw new Error(
      "Reconnect supplementary library videos as lesson video URLs before SCORM export.",
    );
  const lessons = [...archive.snapshot.lessons]
    .sort((a, b) => {
      const order = (id: string | null) =>
        archive.snapshot.modules.find((m) => m.id === id)?.position ?? -1;
      return (
        order(a.module_id) - order(b.module_id) ||
        a.position - b.position ||
        a.id.localeCompare(b.id)
      );
    })
    .map((lesson) => {
      if (lesson.kind === "scorm")
        throw new Error(
          "Nested SCORM activities need their original package; they cannot be flattened into this export.",
        );
      if (lesson.kind === "video" || lesson.video_url) {
        try {
          const url = new URL(lesson.video_url ?? "");
          if (url.protocol !== "https:" || url.username || url.password) throw new Error();
        } catch {
          throw new Error("Every exported video needs a public HTTPS lesson video URL.");
        }
      }
      let body = lesson.body;
      if (lesson.kind === "slide") {
        const slides = parseLessonSlides(lesson.body);
        if (slides.some((slide) => slide.blocks.some((b) => b.kind === "photo")))
          throw new Error(
            "Practical photo approval needs a trainer workflow. Remove that requirement or use a target-LMS assessment before portable export.",
          );
        body = slides
          .map((slide) =>
            [
              slide.title,
              ...slide.blocks.map((b) => {
                if (
                  b.kind === "text" ||
                  b.kind === "tip" ||
                  b.kind === "warning" ||
                  b.kind === "takeaway"
                )
                  return b.body;
                if (b.kind === "flip") return b.front + "\n" + b.back;
                if (b.kind === "tabs" || b.kind === "accordion")
                  return b.items.map((item) => item.label + "\n" + item.body).join("\n\n");
                if (b.kind === "checklist") return b.items.map((item) => "☐ " + item).join("\n");
                if (b.kind === "hotspot")
                  throw new Error(
                    "Hotspot image activities are not yet supported in portable packages.",
                  );
                return "";
              }),
            ].join("\n\n"),
          )
          .join("\n\n");
      }
      const questions = lesson.kind === "quiz" ? (parseQuizQuestions(lesson.quiz) ?? []) : [];
      if (lesson.exam_policy) throw new Error("Exam attempt controls require the Plusticity server and cannot be preserved in this standalone export.");
      if (questions.some((q) => q.kind === "written"))
        throw new Error(
          "AI-graded written responses require the Plusticity server and cannot be exported as a standalone quiz.",
        );
      if (lesson.kind === "quiz" && quizSampleSize(lesson.body) !== null)
        throw new Error("Sampled exam pools are not yet supported in portable packages.");
      const activities = archive.snapshot.activities.filter(
        (a) => a["approved"] === true && a.lesson_title === lesson.title,
      );
      if (activities.length) body += "\n\n" + activities.map((a) => a.prompt).join("\n\n");
      return {
        title: lesson.title,
        body: lesson.kind === "quiz" ? "" : body,
        kind: lesson.kind,
        video_url: lesson.video_url,
        questions,
        answers:
          (archive.snapshot.answers.find((a) => a.lesson_id === lesson.id)?.answers as unknown[]) ??
          [],
        passMark: parsePassMark(lesson.body),
      };
    });
  return {
    title: archive.snapshot.course.title,
    description: archive.snapshot.course.description,
    lessons,
  };
}

export function scormManifest(title: string, id: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="plusticity-${xml(id)}" version="1.0" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
<metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
<organizations default="org"><organization identifier="org"><title>${xml(title)}</title><item identifier="item" identifierref="sco"><title>${xml(title)}</title></item></organization></organizations>
<resources><resource identifier="sco" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/><file href="course.js"/><file href="player.js"/><file href="style.css"/></resource></resources></manifest>`;
}

export function portablePlayer() {
  const course = (window as unknown as { PLUSTICITY_COURSE: PortableCourse }).PLUSTICITY_COURSE;
  const main = document.getElementById("course")!;
  const status = document.getElementById("status")!;
  type Api = {
    LMSInitialize: (s: string) => string;
    LMSGetValue: (s: string) => string;
    LMSSetValue: (k: string, v: string) => string;
    LMSCommit: (s: string) => string;
    LMSFinish: (s: string) => string;
  };
  let api: Api | null = null;
  const find = (start: Window | null) => {
    let current = start;
    for (let depth = 0; current && depth < 20; depth++) {
      try {
        const candidate = (current as unknown as { API?: Api }).API;
        if (candidate) return candidate;
        if (current.parent === current) break;
        current = current.parent;
      } catch {
        break;
      }
    }
    return null;
  };
  try {
    api = find(window) ?? find(window.opener);
  } catch {
    api = null;
  }
  let ready = false;
  try {
    ready = !!api && api.LMSInitialize("") === "true";
  } catch {
    ready = false;
  }
  if (!ready || !api) {
    status.textContent =
      "Launch this package from a SCORM 1.2 LMS. Learning progress cannot be saved here.";
    return;
  }
  const lms = api;
  let finished = false;
  let state: { v: number; c: number[]; q: Record<string, number> } = { v: 1, c: [], q: {} };
  let index = 0;
  try {
    const saved = JSON.parse(lms.LMSGetValue("cmi.suspend_data") || "null");
    if (
      saved &&
      saved.v === 1 &&
      Array.isArray(saved.c) &&
      saved.c.every(
        (n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < course.lessons.length,
      ) &&
      saved.q &&
      typeof saved.q === "object" &&
      !Array.isArray(saved.q) &&
      Object.entries(saved.q).every(
        ([key, value]) =>
          /^\d+$/.test(key) &&
          Number(key) < course.lessons.length &&
          typeof value === "number" &&
          value >= 0 &&
          value <= 100,
      )
    )
      state = saved;
    const location = Number(lms.LMSGetValue("cmi.core.lesson_location"));
    if (Number.isInteger(location) && location >= 0 && location < course.lessons.length)
      index = location;
  } catch {
    status.textContent = "The saved bookmark could not be read. Starting from the first lesson.";
  }
  const element = <T extends keyof HTMLElementTagNameMap>(tag: T, text?: string) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const persist = () => {
    try {
      const quizzes = course.lessons.flatMap((l, i) => (l.questions.length ? [i] : []));
      const complete = course.lessons.every((l, i) =>
        l.questions.length ? (state.q[i] ?? -1) >= l.passMark : state.c.includes(i),
      );
      const score = quizzes.length
        ? Math.round(quizzes.reduce((sum, i) => sum + (state.q[i] ?? 0), 0) / quizzes.length)
        : null;
      const values: Record<string, string> = {
        "cmi.suspend_data": JSON.stringify(state),
        "cmi.core.lesson_location": String(index),
        "cmi.core.lesson_status": complete
          ? quizzes.length
            ? "passed"
            : "completed"
          : "incomplete",
        "cmi.core.exit": complete ? "" : "suspend",
      };
      if (score !== null) {
        values["cmi.core.score.min"] = "0";
        values["cmi.core.score.max"] = "100";
        values["cmi.core.score.raw"] = String(score);
      }
      let accepted = true;
      for (const [key, value] of Object.entries(values))
        if (lms.LMSSetValue(key, value) !== "true") accepted = false;
      if (lms.LMSCommit("") !== "true") accepted = false;
      status.textContent = accepted
        ? complete
          ? "Course complete. Your LMS has saved the result."
          : "Progress saved to your LMS."
        : "Your LMS could not confirm all progress. Keep this window open and retry saving.";
    } catch {
      status.textContent =
        "Your LMS could not save progress. Keep this window open and retry saving.";
    }
  };
  const render = () => {
    main.replaceChildren();
    const lesson = course.lessons[index]!;
    main.append(
      element("h1", course.title),
      element("p", course.description),
      element("h2", `${index + 1}. ${lesson.title}`),
    );
    const content = element("div", lesson.body);
    content.className = "content";
    main.append(content);
    if (lesson.video_url) {
      try {
        const url = new URL(lesson.video_url);
        if (url.protocol === "https:") {
          const link = element("a", "Open lesson video (internet required)");
          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          main.append(link);
        }
      } catch {
        main.append(element("p", "The video address is unavailable. Contact your trainer."));
      }
    }
    if (lesson.questions.length) {
      const form = element("form");
      const fields: (HTMLSelectElement | HTMLInputElement)[][] = [];
      lesson.questions.forEach((question, qi) => {
        const group = element("fieldset");
        group.append(element("legend", question.q));
        fields[qi] = [];
        const select = (options: string[], label: string) => {
          const text = element("label", label);
          const input = element("select");
          input.required = true;
          const empty = element("option", "Choose an answer");
          empty.value = "";
          input.append(empty);
          options.forEach((option, oi) => {
            const node = element("option", option);
            node.value = String(oi);
            input.append(node);
          });
          text.append(input);
          group.append(text);
          fields[qi]!.push(input);
        };
        if (question.kind === "choice") select(question.options, "Answer");
        else if (question.kind === "boolean") select(["True", "False"], "Answer");
        else if (question.kind === "multi") {
          group.append(element("p", "Select all correct answers. Exact set required."));
          question.options.forEach((option) => {
            const label = element("label", option);
            const input = element("input");
            input.type = "checkbox";
            label.append(input);
            group.append(label);
            fields[qi]!.push(input);
          });
        } else if (question.kind === "match")
          question.left.forEach((left) => select(question.right, left));
        else {
          const label = element("label", "Your answer");
          const input = element("input");
          input.type = "text";
          input.required = true;
          input.maxLength = 500;
          label.append(input);
          group.append(label);
          fields[qi]!.push(input);
        }
        form.append(group);
      });
      const submit = element("button", "Check answers");
      submit.type = "submit";
      form.append(submit);
      const feedback = element("p");
      feedback.setAttribute("role", "status");
      form.append(feedback);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const norm = (v: string) => v.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");
        if (
          fields.some((items, qi) =>
            lesson.questions[qi]?.kind === "multi"
              ? !items.some((f) => (f as HTMLInputElement).checked)
              : items.some((f) => !f.value.trim()),
          )
        ) {
          feedback.textContent = "Answer every question.";
          return;
        }
        let correct = 0;
        lesson.questions.forEach((question, qi) => {
          const inputs = fields[qi]!;
          const key = lesson.answers[qi];
          if (question.kind === "multi" && Array.isArray(key)) {
            const chosen = inputs.flatMap((input, index) =>
              (input as HTMLInputElement).checked ? [index] : [],
            );
            if (
              chosen.length === key.length &&
              key.every((index) => typeof index === "number" && chosen.includes(index))
            )
              correct++;
          } else if (
            question.kind === "numeric" &&
            key &&
            typeof key === "object" &&
            "value" in key &&
            "tolerance" in key &&
            typeof key.value === "number" &&
            typeof key.tolerance === "number"
          ) {
            const raw = inputs[0]!.value.trim();
            const actual = Number(raw);
            if (
              raw.length <= 64 &&
              /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw) &&
              Number.isFinite(actual) &&
              Math.abs(actual) <= 1e12 &&
              !(actual === 0 && /[1-9]/.test(raw.split(/[eE]/)[0]!))
            ) {
              const diff = Math.abs(actual - key.value);
              if (
                diff <= key.tolerance ||
                (key.tolerance > 0 &&
                  diff - key.tolerance <= Number.EPSILON * 4 * Math.max(1, diff, key.tolerance))
              )
                correct++;
            }
          } else if (
            (question.kind === "choice" || question.kind === "boolean") &&
            Number(inputs[0]!.value) === key
          )
            correct++;
          else if (
            question.kind === "blank" &&
            Array.isArray(key) &&
            key.some((k) => typeof k === "string" && norm(k) === norm(inputs[0]!.value))
          )
            correct++;
          else if (
            question.kind === "match" &&
            Array.isArray(key) &&
            key.length === inputs.length &&
            new Set(inputs.map((f) => f.value)).size === inputs.length &&
            key.every((k, i) => k === Number(inputs[i]!.value))
          )
            correct++;
        });
        const score = Math.round((correct / lesson.questions.length) * 100);
        state.q[index] = score;
        feedback.textContent = `${score}% · ${score >= lesson.passMark ? "Passed" : `Pass mark ${lesson.passMark}%. Review and try again.`}`;
        persist();
      });
      main.append(form);
    } else {
      const done = element(
        "button",
        state.c.includes(index) ? "Lesson completed" : "Mark lesson complete",
      );
      done.type = "button";
      done.addEventListener("click", () => {
        if (!state.c.includes(index)) state.c.push(index);
        persist();
        render();
      });
      main.append(done);
    }
    const nav = element("nav");
    nav.setAttribute("aria-label", "Lesson navigation");
    const previous = element("button", "Previous lesson");
    previous.disabled = index === 0;
    previous.addEventListener("click", () => {
      index--;
      persist();
      render();
    });
    const next = element("button", "Next lesson");
    next.disabled = index === course.lessons.length - 1;
    next.addEventListener("click", () => {
      index++;
      persist();
      render();
    });
    const save = element("button", "Retry saving progress");
    save.addEventListener("click", persist);
    nav.append(previous, next, save);
    main.append(nav);
  };
  render();
  persist();
  window.addEventListener("pagehide", () => {
    if (finished) return;
    persist();
    try {
      finished = lms.LMSFinish("") === "true";
    } catch {
      finished = false;
    }
  });
}

export async function buildScormZip(archive: CourseArchive) {
  const course = portableCourse(archive);
  const zip = new JSZip();
  zip.file("imsmanifest.xml", scormManifest(course.title, archive.snapshot.course.id));
  zip.file(
    "index.html",
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\'; object-src \'none\'; base-uri \'none\'"><title>' +
      xml(course.title) +
      '</title><link rel="stylesheet" href="style.css"></head><body><p id="status" role="status" aria-live="polite"></p><main id="course"></main><script src="course.js"></script><script src="player.js"></script></body></html>',
  );
  zip.file(
    "course.js",
    "window.PLUSTICITY_COURSE=" +
      JSON.stringify(course)
        .replaceAll("<", "\\u003c")
        .replaceAll("\u2028", "\\u2028")
        .replaceAll("\u2029", "\\u2029") +
      ";",
  );
  zip.file("player.js", "(" + portablePlayer.toString() + ")();");
  zip.file(
    "style.css",
    "body{font:18px/1.6 system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:1rem;color:#172b40}button,select,input{font:inherit;margin:.5rem;padding:.6rem}button:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #164f9c;outline-offset:3px}fieldset{margin:1rem 0}label{display:block}.content{white-space:pre-wrap}nav{display:flex;flex-wrap:wrap;gap:.5rem}#status{padding:1rem;border:1px solid #777}",
  );
  zip.file(
    "README.txt",
    "Plusticity native SCORM 1.2 export. Launch from a SCORM LMS. Quiz keys are part of this package. The destination LMS manages identity, access and certificates. Video links need internet. Slides are rendered as readable text; Plusticity widgets, purchases, deadlines, quotas, certificates and server moderation are not transferred. Test import, bookmarking, retakes, completion and resume in the destination LMS before assigning learners.\n",
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
