import { DOMParser } from "@xmldom/xmldom";
import { buildQuiz, type QuizDraftQuestion } from "./studio-quiz";
import { readBankQuestion } from "./question-bank";
import { QUESTION_BANK_FILE_LIMIT } from "./question-bank-transfer";

type Entry = { category: string; question: unknown; answer: unknown };
const children = (element: Element, name: string): Element[] =>
  Array.from(element.childNodes).filter(
    (node): node is Element => node.nodeType === 1 && node.nodeName === name,
  );
const child = (element: Element, name: string) => children(element, name)[0];
const textOf = (element: Element | undefined) => element?.textContent?.trim() ?? "";
const value = (element: Element, name: string) => textOf(child(element, name));
function formatted(element: Element | undefined) {
  if (!element) return "";
  let text = textOf(child(element, "text"));
  if ((element.getAttribute("format") || "html") === "html") {
    if (/<\/?(?!p\b|br\b|strong\b|b\b|em\b|i\b|u\b|span\b|div\b)[a-z][^>]*>/i.test(text))
      throw new Error(
        "This file contains rich media or unsupported HTML. Convert it to text questions first.",
      );
    text = text
      .replace(/<br\b[^>]*>|<\/(?:p|div)\s*>/gi, "\n")
      .replace(/<\/?(?:p|div|strong|b|em|i|u|span)\b[^>]*>/gi, "");
    text = text.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi, (entity) => {
      const named: Record<string, string> = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&apos;": "'",
        "&nbsp;": " ",
      };
      if (named[entity.toLowerCase()]) return named[entity.toLowerCase()]!;
      const number =
        entity.startsWith("&#x") || entity.startsWith("&#X")
          ? parseInt(entity.slice(3, -1), 16)
          : Number(entity.slice(2, -1));
      if (!Number.isInteger(number) || number < 0 || number > 0x10ffff)
        throw new Error("Unsupported character in question file.");
      return String.fromCodePoint(number);
    });
  }
  return text.trim();
}
const escape = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
const textTag = (text: string) => "<text>" + escape(text) + "</text>";

export function exportMoodleQuestionXml(entries: Entry[]): string {
  if (!entries.length || entries.length > 500) throw new Error("Export 1 to 500 questions.");
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>', "<quiz>"];
  let category = "";
  for (const entry of entries) {
    const draft = readBankQuestion(entry.question, entry.answer);
    if (entry.category !== category) {
      category = entry.category;
      parts.push(
        '<question type="category"><category>' +
          textTag("$course$/" + category) +
          "</category></question>",
      );
    }
    const kind = {
      choice: "multichoice",
      boolean: "truefalse",
      blank: "shortanswer",
      written: "essay",
      match: "matching",
    }[draft.kind];
    parts.push(
      '<question type="' +
        kind +
        '"><name>' +
        textTag(draft.q.slice(0, 100)) +
        '</name><questiontext format="plain_text">' +
        textTag(draft.q) +
        "</questiontext><defaultgrade>1</defaultgrade><penalty>0</penalty><hidden>0</hidden>",
    );
    if (draft.kind === "choice") {
      parts.push(
        "<single>true</single><shuffleanswers>1</shuffleanswers><answernumbering>abc</answernumbering>",
      );
      draft.options.forEach((option, index) => {
        if (option.trim())
          parts.push(
            '<answer fraction="' +
              (index === draft.answer ? 100 : 0) +
              '" format="plain_text">' +
              textTag(option) +
              "</answer>",
          );
      });
    } else if (draft.kind === "boolean") {
      ["true", "false"].forEach((answer, index) =>
        parts.push(
          '<answer fraction="' +
            (index === draft.answer ? 100 : 0) +
            '">' +
            textTag(answer) +
            "</answer>",
        ),
      );
    } else if (draft.kind === "blank") {
      parts.push("<usecase>0</usecase>");
      draft.accepted
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((answer) =>
          parts.push('<answer fraction="100" format="plain_text">' + textTag(answer) + "</answer>"),
        );
    } else if (draft.kind === "match") {
      parts.push("<shuffleanswers>1</shuffleanswers>");
      draft.pairs.forEach((pair) =>
        parts.push(
          '<subquestion format="plain_text">' +
            textTag(pair.left) +
            "<answer>" +
            textTag(pair.right) +
            "</answer></subquestion>",
        ),
      );
    } else {
      parts.push(
        '<responseformat>plain</responseformat><responserequired>1</responserequired><responsefieldlines>10</responsefieldlines><attachments>0</attachments><graderinfo format="plain_text">' +
          textTag(draft.rubric) +
          "</graderinfo>",
      );
    }
    parts.push("</question>");
  }
  parts.push("</quiz>");
  const result = parts.join("\n");
  if (new TextEncoder().encode(result).byteLength > QUESTION_BANK_FILE_LIMIT)
    throw new Error("This XML export exceeds 10 MB.");
  return result;
}

export function importMoodleQuestionXml(source: string) {
  if (
    new TextEncoder().encode(source).byteLength > QUESTION_BANK_FILE_LIMIT ||
    /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)
  )
    throw new Error(
      "Choose an XML question file under 10 MB without document type or entity declarations.",
    );
  const parser = new DOMParser({
    errorHandler: {
      warning: () => {
        throw new Error("Invalid XML question file.");
      },
      error: () => {
        throw new Error("Invalid XML question file.");
      },
      fatalError: () => {
        throw new Error("Invalid XML question file.");
      },
    },
  });
  const document = parser.parseFromString(source, "application/xml");
  const root = document.documentElement;
  if (!root || root.nodeName !== "quiz")
    throw new Error("Use a Moodle XML question-bank export with a quiz root.");
  const elements = children(root, "question");
  if (
    elements.length > 1000 ||
    Array.from(root.childNodes).some((node) => node.nodeType === 1 && node.nodeName !== "question")
  )
    throw new Error("This question file has unsupported content.");
  let category = "Imported questions";
  const entries = [];
  for (const element of elements) {
    const kind = element.getAttribute("type");
    if (kind === "category") {
      category = value(child(element, "category") ?? element, "text")
        .replace(/^\$[^$]+\$\//, "")
        .trim();
      if (!category || category.length > 80)
        throw new Error("Use category names of up to 80 characters.");
      continue;
    }
    if (element.getElementsByTagName("file").length)
      throw new Error("Embedded media files are not supported by this question import.");
    const q = formatted(child(element, "questiontext"));
    let draft: QuizDraftQuestion;
    const answers = children(element, "answer");
    if (kind === "multichoice" || kind === "truefalse") {
      if (kind === "multichoice" && ["false", "0"].includes(value(element, "single")))
        throw new Error(
          "Multiple-response questions are not supported. Use single-correct-answer questions.",
        );
      const fractions = answers.map((answer) => Number(answer.getAttribute("fraction")));
      if (
        fractions.some((fraction) => fraction !== 0 && fraction !== 100) ||
        fractions.filter((fraction) => fraction === 100).length !== 1
      )
        throw new Error("Partial-credit questions are not supported.");
      if (kind === "multichoice")
        draft = {
          kind: "choice",
          q,
          options: answers.map((answer) => formatted(answer)),
          answer: fractions.indexOf(100),
        };
      else {
        const labels = answers.map((answer) => value(answer, "text").toLowerCase());
        if (answers.length !== 2 || !labels.includes("true") || !labels.includes("false"))
          throw new Error("Invalid true/false question.");
        draft = { kind: "boolean", q, answer: labels[fractions.indexOf(100)] === "true" ? 0 : 1 };
      }
    } else if (kind === "shortanswer") {
      if (value(element, "usecase") === "1")
        throw new Error("Case-sensitive short answers are not supported.");
      if (answers.some((answer) => ![0, 100].includes(Number(answer.getAttribute("fraction")))))
        throw new Error("Partial-credit answers are not supported.");
      const accepted = answers
        .filter((answer) => Number(answer.getAttribute("fraction")) === 100)
        .map((answer) => formatted(answer));
      if (accepted.some((answer) => answer.includes("*")))
        throw new Error("Wildcard short answers are not supported.");
      draft = { kind: "blank", q, accepted: accepted.join("\n") };
    } else if (kind === "matching") {
      draft = {
        kind: "match",
        q,
        pairs: children(element, "subquestion").map((pair) => ({
          left: formatted(pair),
          right: value(child(pair, "answer") ?? pair, "text"),
        })),
      };
    } else if (kind === "essay") {
      const rubric = formatted(child(element, "graderinfo"));
      if (rubric.length < 20)
        throw new Error(
          "Each essay needs grader information of at least 20 characters to become a written-response rubric.",
        );
      if (
        Number(value(element, "attachmentsrequired") || 0) > 0 ||
        Number(value(element, "attachments") || 0) !== 0
      )
        throw new Error("Essay attachment requirements cannot be imported into a quiz question.");
      if (
        Number(value(element, "minwordlimit") || 0) > 0 ||
        Number(value(element, "maxwordlimit") || 0) > 0 ||
        formatted(child(element, "responsetemplate"))
      )
        throw new Error(
          "Essay word limits and response templates require manual conversion before importing.",
        );
      draft = { kind: "written", q, rubric };
    } else
      throw new Error(
        "Unsupported Moodle question type. Use multiple choice, true/false, short answer, matching or essay questions.",
      );
    const built = buildQuiz([draft]);
    const question = built.questions[0];
    const answer = built.keys[0];
    if (!question || answer === undefined) throw new Error("Incomplete question in XML file.");
    entries.push({ category, question, answer });
    if (entries.length > 500) throw new Error("Import up to 500 questions at a time.");
  }
  if (!entries.length) throw new Error("This XML file contains no supported questions.");
  return entries;
}
