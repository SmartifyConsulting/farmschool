import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseLessonSlides, slideText, splitLessonSource } from "@/lib/lesson-slides";

const input = z.object({
  courseId: z.string().uuid(),
  lessonId: z.string().uuid(),
  question: z.string().trim().min(1).max(800),
  followUpTo: z.string().trim().max(800).optional(),
});

export const askLessonTutor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(input)
  .handler(async ({ data, context }) => {
    const { data: course } = await context.supabase
      .from("studio_courses")
      .select("id")
      .eq("id", data.courseId)
      .eq("published", true)
      .maybeSingle();
    if (!course) return { error: "This course is not available." } as const;
    // Never read quiz questions or the private answer key.
    const { data: lesson } = await context.supabase
      .from("studio_lessons")
      .select("title, kind, body")
      .eq("id", data.lessonId)
      .eq("course_id", course.id)
      .in("kind", ["slide", "reading", "video"])
      .maybeSingle();
    if (!lesson?.body.trim())
      return { error: "This lesson has no written material for the tutor." } as const;
    const source =
      lesson.kind === "slide"
        ? parseLessonSlides(lesson.body)
            .map((slide) => slideText(slide, false))
            .join("\n\n")
        : splitLessonSource(lesson.body).content;
    if (!source.trim())
      return { error: "This lesson has no written material for the tutor." } as const;
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) return { error: "The lesson tutor is unavailable right now." } as const;
    const { data: used, error: quotaError } = await context.supabase.rpc(
      "lesson_tutor_reserve_request",
    );
    if (quotaError || typeof used !== "number")
      return { error: "The lesson tutor is unavailable right now." } as const;
    if (used === 0)
      return { error: "You've reached today's lesson tutor limit. Try again tomorrow." } as const;
    const { answerLessonQuestion } = await import("@/lib/ai/lesson-tutor.server");
    try {
      return {
        answer: await answerLessonQuestion(
          apiKey,
          lesson.title,
          source,
          data.question,
          data.followUpTo,
        ),
      } as const;
    } catch {
      return { error: "The lesson tutor could not answer. Please try again." } as const;
    }
  });
