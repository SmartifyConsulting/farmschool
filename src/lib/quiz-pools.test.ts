import { describe, expect, it } from "vitest";
import { chooseQuizIndices, quizSampleSize, privateQuizBankId } from "./quiz-pools";
import { parsePassMark } from "./studio";

describe("random quiz question pools", () => {
  it("recognizes private banks without accepting malformed sampling settings", () => {
    const bank = "10000000-0000-4000-8000-000000000001";
    expect(quizSampleSize(`pass:80\nsample:5\nbank:${bank}`)).toBe(5);
    expect(privateQuizBankId(`pass:80\nsample:5\nbank:${bank}`)).toBe(bank);
    expect(privateQuizBankId(`pass:0\nsample:5\nbank:${bank}`)).toBeNull();
    expect(privateQuizBankId("pass:80\nsample:5\nbank:malformed")).toBeNull();
    expect(privateQuizBankId("pass:80\nsample:5")).toBeNull();
  });
  it("selects unique source indices without replacement", () => {
    expect(chooseQuizIndices(4, 3, (max) => max - 1)).toEqual([3, 0, 1]);
    expect(chooseQuizIndices(4, 4, (max) => max - 1).sort()).toEqual([0, 1, 2, 3]);
  });
  it("preserves a chosen order for snapshotting matching question/key entries", () => {
    const source = [
      { q: "A", key: 0 },
      { q: "B", key: 1 },
      { q: "C", key: 2 },
    ];
    const chosen = chooseQuizIndices(3, 2, (max) => max - 1);
    expect(chosen.map((index) => source[index])).toEqual([
      { q: "C", key: 2 },
      { q: "A", key: 0 },
    ]);
  });
  it.each([
    [0, 1],
    [2, 3],
    [51, 2],
    [3, 0],
    [3, 1.5],
  ])("rejects invalid pool/sample bounds", (length, size) =>
    expect(() => chooseQuizIndices(length, size)).toThrow(),
  );
  it("rejects an invalid random index provider", () =>
    expect(() => chooseQuizIndices(3, 2, () => 3)).toThrow());
  it("reads saved random settings without losing the pass mark", () => {
    expect(quizSampleSize("pass:80\nsample:5")).toBe(5);
    expect(parsePassMark("pass:80\nsample:5")).toBe(80);
    expect(quizSampleSize("pass:80")).toBeNull();
    expect(quizSampleSize("pass:80\nsample:0")).toBeNull();
    expect(quizSampleSize("pass:80\nsample:51")).toBeNull();
  });
});
