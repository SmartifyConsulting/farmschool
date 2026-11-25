import { describe, expect, it } from "vitest";
import { libraryCourseStage, type LibraryCourse } from "./library-course-stage";
const base: LibraryCourse = {
  id: "course",
  title: "Training",
  description: "A complete course description for learners.",
  category: "Education / Training",
  published: false,
  author_id: "owner",
  library_scope: "admin",
  studio_lessons: [{ count: 10 }],
  studio_review_approvals: [],
};
describe("verified Library stages", () => {
  it("keeps unstarted imports in Raw and lesson-bearing unreviewed courses in Drafts", () => {
    expect(libraryCourseStage({ ...base, studio_lessons: [{ count: 0 }] })).toBe("raw");
    expect(libraryCourseStage(base)).toBe("drafts");
    expect(libraryCourseStage({ ...base, studio_lessons: [{ count: 1772 }] })).toBe("drafts");
  });
  it("requires the owner's review and complete details before Completed", () => {
    expect(
      libraryCourseStage({ ...base, studio_review_approvals: [{ reviewer_id: "owner" }] }),
    ).toBe("produced");
    expect(libraryCourseStage({ ...base, studio_review_approvals: { reviewer_id: "other" } })).toBe(
      "drafts",
    );
    expect(
      libraryCourseStage({
        ...base,
        description: "",
        studio_review_approvals: [{ reviewer_id: "owner" }],
      }),
    ).toBe("drafts");
    expect(libraryCourseStage({ ...base, published: true })).toBe("produced");
  });
});
