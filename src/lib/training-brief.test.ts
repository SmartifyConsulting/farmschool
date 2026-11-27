import { expect, it } from "vitest";
import {
  FOUNDATION_TRAINING_INSTRUCTION,
  TRAINING_BRIEF_MAX,
  instructionForTrainingBrief,
} from "./training-brief";

it("uses the full foundation instructions when the optional brief is empty", () => {
  expect(instructionForTrainingBrief()).toBe(FOUNDATION_TRAINING_INSTRUCTION);
  expect(instructionForTrainingBrief(" \n\t ")).toBe(FOUNDATION_TRAINING_INSTRUCTION);
});
it("adds trainer preferences without dropping the source coverage requirements", () => {
  const instruction = instructionForTrainingBrief(
    "  More videos, practical scenarios and simple language for beginners.  ",
  );
  expect(instruction.startsWith(FOUNDATION_TRAINING_INSTRUCTION)).toBe(true);
  expect(instruction).toContain(
    "Trainer output preferences:\nMore videos, practical scenarios and simple language for beginners.",
  );
  expect(instruction).toContain("Preserve procedures, exceptions and responsibilities");
});
it("keeps the combined instructions within the existing generation API limit", () => {
  expect(instructionForTrainingBrief("x".repeat(TRAINING_BRIEF_MAX))).toHaveLength(1000);
  expect(() => instructionForTrainingBrief("x".repeat(TRAINING_BRIEF_MAX + 1))).toThrow(
    "Shorten your training brief",
  );
});
