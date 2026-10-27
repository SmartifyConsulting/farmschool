import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ask")({
  server: { handlers: { POST: async ({ request }) => {
    const { handleAsk } = await import("@/lib/ai/ask.server");
    return handleAsk(request);
  } } },
});
