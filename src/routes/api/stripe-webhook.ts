import { createFileRoute } from "@tanstack/react-router";
import { verifyStripeSignature } from "@/lib/stripe-webhook-verify";

type CheckoutSession = {
  id: string;
  amount_total: number | null;
  currency: string | null;
  metadata: { course_id?: string; user_id?: string } | null;
};

/** Grants the enrollment after Stripe confirms payment. Never trust the client for this — only a verified webhook writes course_enrollments for a paid course. */
export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });
        const payload = await request.text();
        if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret))
          return new Response("Invalid signature", { status: 400 });
        const event = JSON.parse(payload) as { type: string; data: { object: CheckoutSession } };
        if (event.type !== "checkout.session.completed")
          return new Response("Ignored", { status: 200 });
        const session = event.data.object;
        const courseId = session.metadata?.course_id;
        const userId = session.metadata?.user_id;
        if (!courseId || !userId) return new Response("Missing metadata", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("course_enrollments").upsert(
          {
            user_id: userId,
            course_id: courseId,
            amount_cents: session.amount_total ?? 0,
            currency: session.currency ?? "usd",
            stripe_session_id: session.id,
          },
          { onConflict: "user_id,course_id" },
        );
        if (error) return new Response("Could not record enrollment", { status: 500 });
        return new Response("ok", { status: 200 });
      },
    },
  },
});
