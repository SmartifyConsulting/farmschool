export type LibraryCourseStage = "raw" | "drafts" | "produced";
export type LibraryCourse = {
  id: string;
  title: string;
  description: string;
  category: string;
  published: boolean;
  author_id: string;
  library_scope: "personal" | "admin";
  revision_of?: string | null;
  studio_lessons: { count: number }[];
  studio_review_approvals: { reviewer_id: string } | { reviewer_id: string }[] | null;
};
export function courseReviewRecorded(course: LibraryCourse) {
  const approvals = Array.isArray(course.studio_review_approvals)
    ? course.studio_review_approvals
    : course.studio_review_approvals
      ? [course.studio_review_approvals]
      : [];
  return approvals.some((approval) => approval.reviewer_id === course.author_id);
}
export function courseDetailsReady(
  course: Pick<LibraryCourse, "title" | "description" | "category">,
) {
  return (
    course.title.trim().length >= 3 &&
    course.description.trim().length >= 30 &&
    !!course.category.trim() &&
    !course.category.endsWith(" / General") &&
    !course.category.endsWith(" / ")
  );
}
export function libraryCourseStage(course: LibraryCourse): LibraryCourseStage {
  if (course.published) return "produced";
  if (!(course.studio_lessons[0]?.count ?? 0)) return "raw";
  return courseReviewRecorded(course) && courseDetailsReady(course) ? "produced" : "drafts";
}
