import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/database-pages";
import {
  libraryCourseStage,
  type LibraryCourse,
  type LibraryCourseStage,
} from "@/lib/library-course-stage";
import { progressLibraryCourse } from "@/lib/library-course.functions";
import { friendlyError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ConfirmDialog";

export function LibraryCourses({
  scope,
  stage,
}: {
  scope: "personal" | "admin";
  stage: LibraryCourseStage;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const progress = useServerFn(progressLibraryCourse);
  const [busy, setBusy] = useState<string | null>(null);
  const courses = useQuery({
    queryKey: ["library-courses", scope, user?.id],
    enabled: !!user,
    queryFn: async () =>
      (
        await readAllPages(
          supabase
            .from("studio_courses")
            .select(
              "id,title,description,category,published,author_id,library_scope,revision_of,studio_lessons(count),studio_review_approvals(reviewer_id)" as never,
              { count: "exact" },
            )
            .eq("author_id", user!.id)
            .eq("library_scope" as never, scope)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .order("id"),
        )
      ).data as unknown as LibraryCourse[],
  });
  const records = (courses.data ?? []).filter((course) => libraryCourseStage(course) === stage);
  const change = async (course: LibraryCourse, action: "complete" | "publish") => {
    if (busy) return;
    if (
      !(await confirm({
        title:
          action === "complete"
            ? "Mark this course Completed?"
            : "Publish to the public Catalogue?",
        confirmLabel: action === "complete" ? "Confirm review" : "Publish to Catalogue",
        description:
          action === "complete"
            ? "Confirm that you have reviewed the course content and assessment answer keys. Existing server checks must pass; this does not publish the course."
            : `“${course.title}” will become available in the public Catalogue at its saved price. Existing content, review and access checks still apply.`,
      }))
    )
      return;
    setBusy(course.id);
    try {
      await progress({ data: { courseId: course.id, action } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["library-courses"] }),
        qc.invalidateQueries({ queryKey: ["studio-mine"] }),
        qc.invalidateQueries({ queryKey: ["catalogue-published"] }),
        qc.invalidateQueries({ queryKey: ["studio-course", course.id] }),
      ]);
      toast.success(
        action === "complete"
          ? "Course moved to Completed. It is not published yet."
          : "Course published to the public Catalogue.",
      );
    } catch (error) {
      toast.error(
        friendlyError(
          error,
          "Could not update this course. Open the editor to review its checklist.",
        ),
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <section
      className="mb-5 space-y-3"
      aria-label={`${stage === "raw" ? "Unstarted imports" : stage === "drafts" ? "Draft courses" : "Completed courses"}`}
    >
      <h2 className="text-sm font-semibold">
        {stage === "raw"
          ? "Imports not yet generated"
          : stage === "drafts"
            ? "Training in progress"
            : "Completed training"}
      </h2>
      {courses.isPending ? (
        <p role="status" className="supporting-text">
          Loading training…
        </p>
      ) : courses.error ? (
        <p role="alert" className="supporting-text">
          Could not load your training.{" "}
          <button className="underline" onClick={() => void courses.refetch()}>
            Try again
          </button>
        </p>
      ) : (
        <>
          <p className="supporting-text text-muted-foreground">
            {stage === "raw"
              ? "These imports have no saved lessons yet. Their source files remain below when available."
              : stage === "drafts"
                ? "Saved lessons are working drafts until trainer review is recorded. Edit and review before marking Completed."
                : "Reviewed courses can be published to the public Catalogue. Reusable file outputs appear below."}
          </p>
          {!records.length && (
            <p className="supporting-text text-muted-foreground">
              {stage === "produced"
                ? "No reviewed courses are ready to publish yet."
                : stage === "drafts"
                  ? "No courses in progress."
                  : "No empty course imports."}
            </p>
          )}
          {records.map((course) => (
            <article
              key={course.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-sm font-semibold">{course.title}</h3>
                <p className="supporting-text text-muted-foreground">
                  {course.studio_lessons[0]?.count ?? 0} lessons ·{" "}
                  {course.published
                    ? "Published"
                    : stage === "produced"
                      ? "Reviewed — not published"
                      : stage === "drafts"
                        ? "Draft — review required"
                        : "Not generated"}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/studio/$id" params={{ id: course.id }}>
                  {course.published
                    ? "View course"
                    : stage === "raw"
                      ? "Continue import"
                      : "Edit and review"}
                </Link>
              </Button>
              {stage === "drafts" && (
                <Button size="sm" disabled={!!busy} onClick={() => void change(course, "complete")}>
                  Mark Completed
                </Button>
              )}
              {stage === "produced" && !course.published && (
                <Button size="sm" disabled={!!busy} onClick={() => void change(course, "publish")}>
                  Publish to Catalogue
                </Button>
              )}
              {stage === "produced" && course.published && (
                <Button asChild size="sm" variant="outline">
                  <Link to="/search">Open Catalogue</Link>
                </Button>
              )}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
