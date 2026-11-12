import { createFileRoute } from "@tanstack/react-router";
import { handleStripeLearningWebhook } from "@/lib/stripe-learning.server";

/** Grants the enrollment after Stripe confirms payment. Never trust the client for this — only a verified webhook writes course_enrollments for a paid course. */
export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: ({ request }) => handleStripeLearningWebhook(request),
    },
  },
});
