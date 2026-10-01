import { createFileRoute } from "@tanstack/react-router";
import { courses, VIDEO_URL } from "@/lib/courses";

export const Route = createFileRoute("/api/public/v1/courses")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { verifyApiKey, json } = await import("@/lib/api-auth.server");
        const auth = await verifyApiKey(request, "courses:read");
        if (auth instanceof Response) return auth;
        return json({
          courses: courses.map(({ image: _i, ...c }) => ({
            ...c,
            modules: c.modules.map((m) => ({ ...m, lessons: m.lessons.map((l) => ({ ...l, video_url: l.type === "video" ? VIDEO_URL : null })) })),
          })),
        });
      },
    },
  },
});
