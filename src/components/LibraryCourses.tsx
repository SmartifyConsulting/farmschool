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
import { Folder } from "lucide-react";
import { catalogueSector } from "@/lib/catalogue-sectors";

export function LibraryCourses({
  scope,
  stage,
  search = "",
  sector = null,
}: {
  scope: "personal" | "admin";
  stage?: LibraryCourseStage;
  search?: string;
  sector?: string | null;
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
  const records = (courses.data ?? []).filter(
    (course) =>
      (!stage || libraryCourseStage(course) === stage) &&
      (!search.trim() ||
        (course.title + " " + course.description)
          .toLowerCase()
          .includes(search.trim().toLowerCase())) &&
      (!sector || catalogueSector(course.category) === sector),
  );
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
    <section className="mb-5 space-y-3" aria-label="Imported course folders">
      <h2 className="text-sm font-semibold">
        {!stage
          ? "Imported course folders"
          : stage === "raw"
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
            {!stage
              ? "Existing course imports are listed separately; source links are not inferred from names."
              : stage === "raw"
                ? "These imports have no saved lessons yet. Their source files remain below when available."
                : stage === "drafts"
                  ? "Saved lessons are working drafts until trainer review is recorded. Edit and review before marking Completed."
                  : "Reviewed courses can be published to the public Catalogue. Reusable file outputs appear below."}
          </p>
          {!records.length && (
            <p className="supporting-text text-muted-foreground">
              {!stage
                ? "No imported course folders match these filters."
                : stage === "produced"
                  ? "No reviewed courses are ready to publish yet."
                  : stage === "drafts"
                    ? "No courses in progress."
                    : "No empty course imports."}
            </p>
          )}
          <div className="divide-y rounded-lg border">
            {records.map((course) => {
              const courseStage = libraryCourseStage(course);
              const stage = courseStage;
              return (
                <article key={course.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <div className="flex min-w-0 flex-1 basis-64 items-start gap-2 text-left">
                    <Folder className="h-5 w-5 shrink-0 fill-yellow-300 text-yellow-500" />
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
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs ${stage === "produced" ? "bg-emerald-100 text-emerald-900" : stage === "drafts" ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground"}`}
                      >
                        {stage === "produced"
                          ? "Completed"
                          : stage === "drafts"
                            ? "Draft"
                            : "Not started"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                      <Button
                        size="sm"
                        disabled={!!busy}
                        onClick={() => void change(course, "complete")}
                      >
                        Mark Completed
                      </Button>
                    )}
                    {stage === "produced" && !course.published && (
                      <Button
                        size="sm"
                        disabled={!!busy}
                        onClick={() => void change(course, "publish")}
                      >
                        Publish to Catalogue
                      </Button>
                    )}
                    {stage === "produced" && course.published && (
                      <Button asChild size="sm" variant="outline">
                        <Link to="/search">Open Catalogue</Link>
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
