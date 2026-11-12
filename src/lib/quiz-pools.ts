import { z } from "zod";

export function quizSampleSize(body: string | null | undefined): number | null {
  const match = body?.match(
    /^pass:(\d{1,3})\nsample:([1-9]\d?)(?:\nbank:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/,
  );
  if (!match) return null;
  const mark = Number(match[1]);
  const size = Number(match[2]);
  return mark >= 1 && mark <= 100 && size <= 50 ? size : null;
}
export function privateQuizBankId(body: string | null | undefined): string | null {
  if (quizSampleSize(body) === null) return null;
  return body?.match(/\nbank:([0-9a-f-]{36})$/)?.[1] ?? null;
}
const randomInt = (max: number) => {
  const cutoff = Math.floor(0x100000000 / max) * max;
  const values = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(values);
  } while (values[0]! >= cutoff);
  return values[0]! % max;
};
export function chooseQuizIndices(
  length: number,
  size: number,
  random = (max: number) => randomInt(max),
): number[] {
  if (
    !Number.isInteger(length) ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > length ||
    length > 50
  )
    throw new Error("Choose a sample size within the question pool.");
  const indices = Array.from({ length }, (_, index) => index);
  for (let i = 0; i < size; i++) {
    const offset = random(length - i);
    if (!Number.isInteger(offset) || offset < 0 || offset >= length - i)
      throw new Error("Invalid random selection.");
    const target = i + offset;
    const value = indices[i]!;
    indices[i] = indices[target]!;
    indices[target] = value;
  }
  return indices.slice(0, size);
}
export const quizResult = z.object({
  score: z.number().int().min(0).max(100),
  passed: z.boolean(),
  passMark: z.number().int().min(1).max(100),
  correct: z.array(z.boolean()).min(1).max(50),
  feedback: z.array(z.string().max(2000).nullable()).min(1).max(50),
});
