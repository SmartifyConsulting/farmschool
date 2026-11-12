import { z } from "zod";
import { verifyStripeSignature } from "./stripe-webhook-verify";

const eventSchema = z.object({
  id: z.string().min(1), type: z.string(), created: z.number().int().nonnegative(),
  data: z.object({ object: z.record(z.unknown()) }),
});
const sessionSchema = z.object({
  id: z.string().startsWith("cs_"), created: z.number().int().nonnegative(),
  payment_status: z.literal("paid"), mode: z.literal("payment"),
  amount_total: z.number().int().positive(), currency: z.string().regex(/^[a-z]{3}$/),
  metadata: z.object({
    course_id: z.string().uuid(), user_id: z.string().uuid(),
    price_cents: z.string().optional(), currency: z.string().optional(),
    purchase_kind: z.literal("cohort_license").optional(), license_order_id: z.string().uuid().optional(), cohort_id: z.string().uuid().optional(), quantity: z.string().regex(/^[1-9][0-9]{0,3}$/).optional(),
  }),
});

function objectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return null;
}

async function stripeGet(path: string) {
  const secret = process.env["STRIPE_SECRET_KEY"];
  if (!secret) throw new Error("Stripe is not configured");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Could not verify Stripe payment");
  return response.json();
}

export async function handleStripeLearningWebhook(request: Request): Promise<Response> {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!secret) return new Response("Not configured", { status: 503 });
  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret))
    return new Response("Invalid signature", { status: 400 });
  let parsed: unknown;
  try { parsed = JSON.parse(payload); } catch { return new Response("Invalid event", { status: 400 }); }
  const checked = eventSchema.safeParse(parsed);
  if (!checked.success) return new Response("Invalid event", { status: 400 });
  const event = checked.data;
  const object = event.data.object;
  let action: "paid" | "refunded" | "dispute_open" | "dispute_won" | "dispute_lost";
  let rawSession: unknown;
  const checkout = event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded";
  if (checkout) {
    const metadata = object["metadata"];
    if (!metadata || typeof metadata !== "object" || !("course_id" in metadata)) return new Response("Unrelated payment ignored");
    if (object["payment_status"] !== "paid") return new Response("Payment not completed");
    action = "paid";
    rawSession = object;
  } else if (event.type === "charge.refunded") {
    if (object["refunded"] !== true) return new Response("Partial refund recorded by Stripe; access retained");
    action = "refunded";
  } else if (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
    action = event.type === "charge.dispute.created" ? "dispute_open"
      : object["status"] === "won" || object["status"] === "warning_closed" ? "dispute_won" : "dispute_lost";
  } else return new Response("Ignored");

  try {
    if (!checkout) {
      let intent = objectId(object["payment_intent"]);
      if (!intent) {
        const chargeId = objectId(object["charge"]);
        if (chargeId) intent = objectId((await stripeGet(`charges/${encodeURIComponent(chargeId)}`)).payment_intent);
      }
      if (!intent) throw new Error("Payment reference unavailable");
      const sessions = await stripeGet(`checkout/sessions?${new URLSearchParams({ payment_intent: intent, limit: "100" })}`);
      if (!Array.isArray(sessions.data) || sessions.has_more) throw new Error("Ambiguous payment reference");
      const matches = sessions.data.filter((session: { metadata?: { course_id?: string; user_id?: string } }) =>
        session.metadata?.course_id && session.metadata?.user_id);
      if (!matches.length) return new Response("Unrelated payment ignored");
      if (matches.length !== 1) throw new Error("Ambiguous course purchase");
      rawSession = matches[0];
    }
    const session = sessionSchema.safeParse(rawSession);
    if (!session.success) return new Response("Invalid course purchase", { status: 400 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bulk=session.data.metadata.purchase_kind==="cohort_license";
    if (bulk && (!session.data.metadata.license_order_id || !session.data.metadata.cohort_id || !session.data.metadata.quantity || !session.data.metadata.price_cents)) return new Response("Invalid group licence purchase",{status:400});
    const { error } = await supabaseAdmin.rpc(bulk ? "apply_cohort_license_payment" : "apply_learning_payment_event", {
      _event: { id: event.id, type: event.type, created: event.created, action, session: session.data },
    });
    if (error) throw new Error("Could not record course payment");
    return new Response("ok");
  } catch {
    return new Response("Payment processing unavailable. Retry this event.", { status: 503 });
  }
}
