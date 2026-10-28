import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { courseWizardDraft, courseWizardInput, validateGeneratedCourse } from "@/lib/course-wizard";

export const saveWizardDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ courseId: z.string().uuid(), input: courseWizardInput, draft: courseWizardDraft }).parse(value))
  .handler(async ({ data, context }) => {
    const draft = validateGeneratedCourse(data.draft, data.input);
    const { data: id, error } = await context.supabase.rpc("studio_save_generated_course", {
      _course_id: data.courseId, _draft: draft, _level: data.input.level, _pass_mark: data.input.passMark,
    });
    if (error || !id) throw new Error("Your draft could not be saved. Please try again; no partial course will be created.");
    return { id };
  });