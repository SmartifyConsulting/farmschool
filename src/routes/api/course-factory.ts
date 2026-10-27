import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/course-factory")({
  server: { handlers: { POST: async ({ request }) => {
    const { handleCourseFactoryGenerate } = await import("@/lib/ai/course-factory.server");
    return handleCourseFactoryGenerate(request);
  } } },
});
