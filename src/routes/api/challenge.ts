import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/challenge")({
  server: { handlers: { POST: async ({ request }) => {
    const { handleChallenge } = await import("@/lib/ai/challenge.server");
    return handleChallenge(request);
  } } },
});