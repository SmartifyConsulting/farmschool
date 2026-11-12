import { z } from "zod";
import { quizResult } from "./quiz-pools";

const draftChoice = z.number().int().min(-1).max(49);
export const examDraftAnswers = z
  .array(z.union([z.null(), draftChoice, z.string().max(2000), z.array(draftChoice).max(50)]))
  .max(50);
export const examPolicySettings = z.object({
  maxAttempts: z.number().int().min(1).max(1000).nullable(),
  durationMinutes: z.number().int().min(1).max(1440),
  startSpacingMinutes: z.number().int().min(0).max(10080),
});
export const examStartResponse = z.object({
  attemptId: z.string().uuid(),
  questions: z.unknown(),
  expiresAt: z.string(),
  serverNow: z.string().optional(),
  resumed: z.boolean().optional(),
  draftAnswers: examDraftAnswers.optional(),
  draftVersion: z.number().int().nonnegative().optional(),
  result: quizResult.nullable().optional(),
  attemptsUsed: z.number().int().nonnegative().optional(),
  maxAttempts: z.number().int().positive().nullable().optional(),
  durationMinutes: z.number().int().positive().optional(),
  nextStartAt: z.string().nullable().optional(),
});
export const examStatus = z.object({
  attemptsUsed: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive().nullable(),
  durationMinutes: z.number().int().positive(),
  startSpacingMinutes: z.number().int().nonnegative(),
  nextStartAt: z.string().nullable(),
  canResume: z.boolean(),
});

export function remainingExamSeconds(expiresAt: string, serverNow: string, elapsedMs: number) {
  const expires = Date.parse(expiresAt),
    now = Date.parse(serverNow);
  if (!Number.isFinite(expires) || !Number.isFinite(now) || !Number.isFinite(elapsedMs)) return 0;
  return Math.max(0, Math.ceil((expires - now - Math.max(0, elapsedMs)) / 1000));
}
