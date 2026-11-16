import { expect, it } from "vitest";
import { rpcArgs } from "./rpc-args";

it("preserves null when clearing a course organization and its previous binding", () => {
  const args = { _course: "course-id", _organization: null, _expected: null };
  expect(rpcArgs("set_course_organization", args)).toBe(args);
  expect(rpcArgs("set_course_organization", args)).toEqual(args);
});

it("preserves null for an unrestricted quiz pool", () => {
  const args = {
    _lesson_id: "lesson-id", _title: "Quiz", _pass_mark: 70,
    _questions: [], _answers: [], _sample_size: null,
  };
  expect(rpcArgs("studio_save_quiz_pool", args)).toEqual(args);
});