import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { portableCourse, portablePlayer, buildScormZip } from "./scorm-export";
import { validateCourseArchive } from "./course-archive";
const courseId = "10000000-0000-4000-8000-000000000001";
const lessonId = "10000000-0000-4000-8000-000000000002";
const fixture = () =>
  validateCourseArchive({
    format: "plusticity-course",
    version: 1,
    exported_at: "2026-11-12T00:00:00Z",
    snapshot: {
      course: { id: courseId, title: "Course <safe> & useful", description: "Practical teaching" },
      modules: [],
      lessons: [
        {
          id: lessonId,
          module_id: null,
          title: "Read",
          kind: "reading",
          body: '<script>alert("unsafe")</script>',
          position: 0,
          video_url: null,
          quiz: [],
        },
      ],
      answers: [],
      videos: [],
      activities: [],
    },
  });
class Node {
  tag: string;
  textContent = "";
  children: Node[] = [];
  value = "";
  disabled = false;
  checked = false;
  listeners: Record<string, (event: { preventDefault(): void }) => void> = {};
  constructor(tag: string) {
    this.tag = tag;
  }
  append(...children: Node[]) {
    this.children.push(...children);
  }
  replaceChildren() {
    this.children = [];
  }
  setAttribute() {}
  addEventListener(name: string, fn: (event: { preventDefault(): void }) => void) {
    this.listeners[name] = fn;
  }
  trigger(name: string) {
    this.listeners[name]?.({ preventDefault() {} });
  }
  all(): Node[] {
    return [this, ...this.children.flatMap((node) => node.all())];
  }
}
function launch(
  input = portableCourse(fixture()),
  options: { saved?: string; location?: string; commit?: string; connected?: boolean } = {},
) {
  const main = new Node("main");
  const status = new Node("p");
  const values: Record<string, string> = {
    "cmi.suspend_data": options.saved ?? "",
    "cmi.core.lesson_location": options.location ?? "",
  };
  const calls: string[] = [];
  const api = {
    LMSInitialize: () => {
      calls.push("initialize");
      return "true";
    },
    LMSGetValue: (k: string) => values[k] ?? "",
    LMSSetValue: (k: string, v: string) => {
      values[k] = v;
      calls.push(k);
      return "true";
    },
    LMSCommit: () => options.commit ?? "true",
    LMSFinish: () => {
      calls.push("finish");
      return "true";
    },
  };
  const events: Record<string, () => void> = {};
  const window = {
    PLUSTICITY_COURSE: input,
    API: options.connected === false ? undefined : api,
    parent: null as unknown,
    opener: null,
    addEventListener: (name: string, fn: () => void) => {
      events[name] = fn;
    },
  };
  window.parent = window;
  runInNewContext("(" + portablePlayer.toString() + ")()", {
    window,
    document: {
      getElementById: (id: string) => (id === "course" ? main : status),
      createElement: (tag: string) => new Node(tag),
    },
    URL,
  });
  return { main, status, values, calls, events };
}
describe("portable SCORM export", () => {
  it("writes a root single-SCO manifest, local assets and script-safe content", async () => {
    const zip = await JSZip.loadAsync(await buildScormZip(fixture()));
    expect(Object.keys(zip.files).sort()).toEqual(
      ["README.txt", "course.js", "imsmanifest.xml", "index.html", "player.js", "style.css"].sort(),
    );
    const manifest = new DOMParser().parseFromString(
      await zip.file("imsmanifest.xml")!.async("string"),
      "application/xml",
    );
    expect(manifest.getElementsByTagName("title")[0]!.textContent).toBe("Course <safe> & useful");
    expect(manifest.getElementsByTagName("resource")[0]!.getAttribute("href")).toBe("index.html");
    expect(await zip.file("course.js")!.async("string")).not.toContain("<script>");
    expect(await zip.file("player.js")!.async("string")).not.toContain("innerHTML");
  });
  it("refuses to drop nested packages, private photo work or AI assessment", () => {
    const nested = fixture();
    nested.snapshot.lessons[0]!.kind = "scorm";
    expect(() => portableCourse(nested)).toThrow("Nested SCORM");
    const photos = fixture();
    photos.snapshot.lessons[0]!.kind = "slide";
    photos.snapshot.lessons[0]!.body = "## Evidence\n:::photo\nShow practical evidence.\n:::";
    expect(() => portableCourse(photos)).toThrow("photo approval");
    const written = fixture();
    written.snapshot.lessons[0]!.kind = "quiz";
    written.snapshot.lessons[0]!.quiz = [{ kind: "written", q: "Explain your approach" }];
    written.snapshot.answers = [
      {
        lesson_id: lessonId,
        answers: [{ rubric: "Assess the safety and completeness of the proposed approach." }],
      },
    ];
    expect(() => portableCourse(written)).toThrow("AI-graded");
  });
  it("requires an LMS connection and reports failed persistence honestly", () => {
    expect(launch(undefined, { connected: false }).status.textContent).toContain("cannot be saved");
    const failed = launch(undefined, { commit: "false" });
    expect(failed.status.textContent).toContain("could not confirm");
    expect(failed.calls[0]).toBe("initialize");
  });
  it("saves completion, resumes a valid state and finishes only once", () => {
    const result = launch();
    result.main
      .all()
      .find((node) => node.textContent === "Mark lesson complete")!
      .trigger("click");
    expect(result.values["cmi.core.lesson_status"]).toBe("completed");
    const resumed = launch(undefined, { saved: result.values["cmi.suspend_data"]! });
    expect(resumed.main.all().some((node) => node.textContent === "Lesson completed")).toBe(true);
    resumed.events["pagehide"]!();
    resumed.events["pagehide"]!();
    expect(resumed.calls.filter((call) => call === "finish")).toHaveLength(1);
  });
  it("grades choice, boolean, blanks and matches before reporting passed", () => {
    const extended = portableCourse(fixture());
    extended.lessons[0] = { title: "Extended assessment", kind: "quiz", body: "", video_url: null, passMark: 100, questions: [{ kind: "multi", q: "Select crops", options: ["Maize", "Bean", "Stone"] }, { kind: "numeric", q: "Required litres" }], answers: [[0, 1], { value: 10.5, tolerance: 0.1 }] };
    const checked = launch(extended);
    const entries = checked.main.all().filter(node => node.tag === "input");
    entries[0]!.checked = true; entries[1]!.checked = true; entries[3]!.value = "10.6";
    checked.main.all().find(node => node.tag === "form")!.trigger("submit");
    expect(checked.values["cmi.core.score.raw"]).toBe("100");
    entries[2]!.checked = true;
    checked.main.all().find(node => node.tag === "form")!.trigger("submit");
    expect(checked.values["cmi.core.score.raw"]).toBe("50");
    const course = portableCourse(fixture());
    course.lessons[0] = {
      title: "Assessment",
      kind: "quiz",
      body: "",
      video_url: null,
      passMark: 100,
      questions: [
        { kind: "choice", q: "Pick", options: ["Yes", "No"] },
        { kind: "boolean", q: "True?" },
        { kind: "blank", q: "Type water" },
        { kind: "match", q: "Match", left: ["A", "B"], right: ["One", "Two"] },
      ],
      answers: [0, 1, ["water"], [1, 0]],
    };
    const result = launch(course);
    const fields = result.main.all().filter((node) => ["select", "input"].includes(node.tag));
    ["0", "1", " WATER ", "1", "0"].forEach((value, index) => {
      fields[index]!.value = value;
    });
    result.main
      .all()
      .find((node) => node.tag === "form")!
      .trigger("submit");
    expect(result.values["cmi.core.lesson_status"]).toBe("passed");
    expect(result.values["cmi.core.score.raw"]).toBe("100");
    fields[0]!.value = "1";
    result.main
      .all()
      .find((node) => node.tag === "form")!
      .trigger("submit");
    expect(result.values["cmi.core.lesson_status"]).toBe("incomplete");
  });
});
