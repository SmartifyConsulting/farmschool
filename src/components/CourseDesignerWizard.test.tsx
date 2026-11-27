import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { designerDefaults } from "@/lib/course-design-plan";
vi.mock("@/components/DesignReferenceAttachments", () => ({
  DesignReferenceAttachments: () => <button>Attach files</button>,
}));
import { CourseDesignerWizard } from "./CourseDesignerWizard";
describe("course setup wizard", () => {
  it("opens on goal and audience without dumping later questions into the same frame", () => {
    const html = renderToStaticMarkup(
      <CourseDesignerWizard
        value={designerDefaults}
        onChange={() => {}}
        references={[]}
        onReferencesChange={() => {}}
        onPlan={() => {}}
        sourceSummary="One source"
        sourceInput={<button>Attach source document</button>}
      />,
    );
    expect(html).toContain("Step 1 of 6");
    expect(html).toContain("Attach source document");
    expect(html).toContain("Who is the course for?");
    expect(html).not.toContain("Target learning time (minutes)");
    expect(html).not.toContain("Describe the training output you want");
    expect(html).not.toContain("Attach files");
    expect(html).toContain("Next");
  });
});
