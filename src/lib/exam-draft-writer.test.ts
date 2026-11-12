import { expect, it, vi } from "vitest";
import { createExamDraftWriter } from "./exam-draft-writer";

it("serializes edits made while a previous save is in flight", async () => {
  let release!: (value: { version: number }) => void;
  const send = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValue({ version: 2 });
  const writer = createExamDraftWriter(send);
  writer.load({ attemptId: "attempt", draftAnswers: [], draftVersion: 0 });
  writer.setAnswers([0]);
  const first = writer.flush();
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  writer.setAnswers([1]);
  const second = writer.flush();
  expect(send).toHaveBeenCalledTimes(1);
  release({ version: 1 });
  await first;
  await second;
  expect(send.mock.calls.map((call) => call[0])).toEqual([
    { attemptId: "attempt", answers: [0], version: 0 },
    { attemptId: "attempt", answers: [1], version: 1 },
  ]);
  expect(writer.dirty([1])).toBe(false);
});
it("keeps failed edits available for a version-checked retry", async () => {
  const send = vi
    .fn()
    .mockRejectedValueOnce(new Error("Answers changed in another tab."))
    .mockResolvedValue({ version: 1 });
  const writer = createExamDraftWriter(send);
  writer.load({ attemptId: "attempt" });
  writer.setAnswers(["Unfinished answer"]);
  await expect(writer.flush()).rejects.toThrow("another tab");
  expect(writer.state().version).toBe(0);
  expect(writer.dirty(["Unfinished answer"])).toBe(true);
  await writer.flush();
  expect(send.mock.calls[1]?.[0].version).toBe(0);
  expect(writer.state().error).toBe("");
});
it("does not apply a late save acknowledgement to a reloaded attempt", async () => {
  let release!: (value: { version: number }) => void;
  const writer = createExamDraftWriter(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  writer.load({ attemptId: "old", draftVersion: 0 });
  writer.setAnswers([0]);
  const saved = writer.flush();
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  writer.load({ attemptId: "new", draftVersion: 8, draftAnswers: [1] });
  release({ version: 1 });
  await saved;
  expect(writer.state().version).toBe(8);
  expect(writer.dirty([1])).toBe(false);
});
