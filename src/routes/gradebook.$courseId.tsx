import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { gradebookCsv, gradebookReport, gradebookSummary } from "@/lib/gradebook";
import { pageMeta } from "@/lib/page-meta";
import { CourseCertificates } from "@/components/CourseCertificates";
import { CourseGrading } from "@/components/CourseGrading";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/gradebook/$courseId")({
  component: GradebookPage,
  head: () =>
    pageMeta(
      "Course gradebook — Plusticity",
      "Review course progress, quiz scores and competency assessments.",
    ),
});

function GradebookPage() {
  const { courseId } = Route.useParams();
  const { user, ready } = useAuth();
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    setPage(0);
  }, [courseId]);
  const report = useQuery({
    queryKey: ["course-gradebook", courseId, user?.id, page],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("course_gradebook", {
        _course: courseId,
        _offset: page * 50,
        _limit: 50,
      });
      if (error) throw error;
      return gradebookReport.parse(data);
    },
  });
  const exportPage = () => {
    if (!report.data) return;
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", gradebookCsv(report.data)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `gradebook-${courseId}-page-${page + 1}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const quizzes = report.data?.lessons.filter((lesson) => lesson.kind === "quiz") ?? [];
  const exportAll = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { data, error } = await supabase.rpc("course_gradebook_export", { _course: courseId });
      if (error) throw error;
      const complete = gradebookReport.parse(data);
      if (complete.learners.length !== complete.total)
        throw new Error("Could not load the complete export.");
      const url = URL.createObjectURL(
        new Blob(["\uFEFF", gradebookCsv(complete)], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `gradebook-${courseId}-all.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setExporting(false);
    }
  };
  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading
          eyebrow={report.data?.course.title ?? "Course Studio"}
          title="Course gradebook"
        />
        <div className="mt-4 flex flex-wrap gap-4">
          <Link
            to="/studio/$id"
            params={{ id: courseId }}
            className="text-sm font-semibold text-primary"
          >
            Back to course
          </Link>
          <Link
            to="/competencies/$courseId"
            params={{ courseId }}
            className="text-sm font-semibold text-primary"
          >
            Assessments & submissions
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Latest quiz and competency scores are shown. Missing grades remain empty. Quiz and
          competency means are separate; this report does not change course completion or
          certificate rules.
        </p>
        {!ready || (user && report.isLoading) ? (
          <p className="py-8">Loading gradebook…</p>
        ) : !user ? (
          <p className="py-8">
            <Link to="/auth">Sign in</Link> to view your course gradebook.
          </p>
        ) : report.error ? (
          <p role="alert" className="py-8 text-destructive">
            Could not load this gradebook. Only the course author can view it.
          </p>
        ) : (
          report.data && (
            <div className="mt-6 space-y-4 pb-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  {report.data.total} learners · page {page + 1}
                </p>
                <Button
                  variant="outline"
                  disabled={!report.data.learners.length}
                  onClick={exportPage}
                >
                  Export this page (CSV)
                </Button>
                <Button
                  variant="outline"
                  disabled={exporting || !report.data.total}
                  onClick={exportAll}
                >
                  {exporting ? "Preparing export…" : "Export whole course (CSV)"}
                </Button>
              </div>
              {!report.data.total ? (
                <p className="py-8 text-sm text-muted-foreground">
                  No learners, assignments or assessment activity yet.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">
                      Latest grades for {report.data.course.title}
                    </caption>
                    <thead className="bg-muted">
                      <tr>
                        {[
                          "Learner",
                          "Progress",
                          "Certified",
                          "Pending work",
                          "Quiz mean",
                          "Competency mean",
                          "Final grade",
                          ...quizzes.map((quiz) => "Quiz: " + quiz.title),
                          ...report.data.competencies.map(
                            (competency) => competency.code + ": " + competency.title,
                          ),
                        ].map((heading, index) => (
                          <th key={index} scope="col" className="min-w-32 p-3 align-top">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.data.learners.map((learner) => {
                        const summary = gradebookSummary(learner, report.data!);
                        return (
                          <tr key={learner.userId} className="border-t">
                            <th scope="row" className="p-3 font-medium">
                              {learner.name}
                              <span className="block text-xs text-muted-foreground">
                                {learner.userId.slice(0, 8)}
                              </span>
                            </th>
                            <td className="p-3">
                              {summary.progress}%
                              <span className="block text-xs text-muted-foreground">
                                {summary.completed}/{report.data!.lessons.length} lessons
                              </span>
                            </td>
                            <td className="p-3">{learner.certified ? "Yes" : "No"}</td>
                            <td className="p-3">{learner.pendingSubmissions}</td>
                            <td className="p-3">
                              {summary.quizMean === null ? "—" : summary.quizMean + "%"}
                            </td>
                            <td className="p-3">
                              {summary.competencyMean === null ? "—" : summary.competencyMean + "%"}
                            </td>
                            <td className="p-3">
                              {learner.finalGrade?.score === null ||
                              learner.finalGrade?.score === undefined
                                ? "—"
                                : learner.finalGrade.score + "%"}
                              {learner.finalGrade?.overridden && (
                                <span className="block text-xs text-muted-foreground">
                                  Approved override
                                </span>
                              )}
                            </td>
                            {quizzes.map((quiz) => (
                              <td key={quiz.id} className="p-3">
                                {learner.quizScores[quiz.id] ? (
                                  <>
                                    {learner.quizScores[quiz.id]!.score}%
                                    <span className="block text-xs text-muted-foreground">
                                      {learner.quizScores[quiz.id]!.attempts} attempts ·{" "}
                                      {learner.quizScores[quiz.id]!.passed
                                        ? "Latest passed"
                                        : "Latest not passed"}
                                    </span>
                                  </>
                                ) : (
                                  "—"
                                )}
                              </td>
                            ))}
                            {report.data!.competencies.map((competency) => (
                              <td key={competency.id} className="p-3">
                                {learner.competencyScores[competency.id] ? (
                                  <>
                                    {learner.competencyScores[competency.id]!.score ?? "—"}%
                                    <span className="block text-xs text-muted-foreground">
                                      {learner.competencyScores[competency.id]!.achieved
                                        ? "Demonstrated"
                                        : "Not yet demonstrated"}
                                    </span>
                                  </>
                                ) : (
                                  "—"
                                )}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page === 0 || report.isFetching}
                  onClick={() => setPage(page - 1)}
                >
                  Previous page
                </Button>
                <Button
                  variant="outline"
                  disabled={(page + 1) * 50 >= report.data.total || report.isFetching}
                  onClick={() => setPage(page + 1)}
                >
                  Next page
                </Button>
              </div>
            </div>
          )
        )}
        {report.data && <CourseCertificates key={courseId} courseId={courseId} />}
        {report.data && <CourseGrading key={"grading:" + courseId} report={report.data} />}
      </Sheet>
    </Phone>
  );
}
