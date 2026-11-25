import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  courseDetailsReady,
  courseReviewRecorded,
  type LibraryCourse,
} from "./library-course-stage";

export const progressLibraryCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ courseId: z.string().uuid(), action: z.enum(["complete", "publish"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const result = await context.supabase
      .from("studio_courses")
      .select(
        "id,title,description,category,published,author_id,library_scope,revision_of,studio_lessons(count),studio_review_approvals(reviewer_id)" as never,
      )
      .eq("id", data.courseId)
      .eq("author_id", context.userId)
      .is("deleted_at", null)
      .single();
    const course = result.data as unknown as LibraryCourse | null;
    if (result.error || !course) throw new Error("Only the course owner can manage this course.");
    if (course.library_scope === "admin") {
      const admin = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (admin.error || !admin.data) throw new Error("Admin access is required for this library.");
    }
    if (course.published) throw new Error("This course is already published.");
    if (!courseDetailsReady(course) || !(course.studio_lessons[0]?.count ?? 0))
      throw new Error("Complete the course details, industry and lessons in the editor first.");
    if (data.action === "complete") {
      const approved = await context.supabase.rpc("studio_approve_review", {
        _course_id: course.id,
      });
      if (approved.error)
        throw new Error(
          "Review the imported lessons and quiz answer keys in the editor before marking this course Completed.",
        );
      return { id: course.id, action: "complete" };
    }
    if (!courseReviewRecorded(course)) throw new Error("Review this course before publishing it.");
    const privacy = await context.supabase
      .from("organization_courses")
      .select("organization_id")
      .eq("course_id", course.revision_of ?? course.id)
      .maybeSingle();
    if (privacy.error) throw new Error("Could not check course privacy. Try again.");
    if (privacy.data)
      throw new Error(
        "This course is private. Set Privacy to Public catalogue in the editor before publishing.",
      );
    const published = await context.supabase.rpc("studio_publish_version", {
      _course_id: course.id,
      _note: "Published from Completed Library",
    });
    if (published.error || !published.data)
      throw new Error(
        "The publishing checks were not satisfied. Open the editor to review the checklist.",
      );
    return { id: published.data, action: "publish" };
  });
