import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PHOTO_EVIDENCE_BUCKET = "practical-evidence";

/** Learner records that they uploaded evidence for one photo block; the RPC enforces ownership and that an approved sign-off cannot be overwritten. */
export const submitPracticalPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      lessonId: z.string().uuid(),
      blockIndex: z.number().int().min(0),
      photoPath: z.string().min(1).max(500),
    }),
  )
  .handler(async ({ data, context }) => {
    const { data: submission, error } = await context.supabase.rpc("lesson_photo_submit", {
      _lesson: data.lessonId,
      _block: data.blockIndex,
      _path: data.photoPath,
    });
    if (error) return { error: error.message } as const;
    return { submission } as const;
  });

/** The trainer (course author) signs off or rejects a learner's practical evidence. */
export const reviewPracticalPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      submissionId: z.string().uuid(),
      status: z.enum(["approved", "rejected"]),
      note: z.string().trim().max(1000).default(""),
    }),
  )
  .handler(async ({ data, context }) => {
    const { data: submission, error } = await context.supabase.rpc("lesson_photo_review", {
      _submission: data.submissionId,
      _status: data.status,
      _note: data.note,
    });
    if (error) return { error: error.message } as const;
    return { submission } as const;
  });
