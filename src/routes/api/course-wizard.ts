import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/course-wizard")({
  server: { handlers: { POST: async ({ request }) => {
    const { handleCourseWizard } = await import("@/lib/ai/course-wizard.server");
    return handleCourseWizard(request);
  } } },
});