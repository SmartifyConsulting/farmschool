import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { licenseOrder } from "@/lib/cohort-licenses";

const checkoutInput = z.object({
  cohortId: z.string().uuid(),
  courseId: z.string().uuid(),
  quantity: z.number().int().min(1).max(1000),
  requestId: z.string().uuid(),
});

function secureUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("A secure checkout address is required.");
  return url;
}
export const createCohortLicenseCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => checkoutInput.parse(input))
  .handler(async ({ data, context }) => {
    const secret = process.env["STRIPE_SECRET_KEY"];
    const site = process.env["SITE_URL"];
    if (!secret || !site) return { error: "Paid enrolment is not configured yet." } as const;
    const origin = secureUrl(site);
    if (origin.pathname !== "/" || origin.search || origin.hash)
      return { error: "The application checkout address needs to be configured." } as const;
    const { data: rawOrder, error: orderError } = await context.supabase.rpc(
      "create_course_license_order",
      {
        _cohort: data.cohortId,
        _course: data.courseId,
        _quantity: data.quantity,
        _request: data.requestId,
      },
    );
    if (orderError) throw orderError;
    const order = licenseOrder.parse(rawOrder);
    if (
      order.buyer_id !== context.userId ||
      order.cohort_id !== data.cohortId ||
      order.course_id !== data.courseId ||
      order.quantity !== data.quantity
    )
      throw new Error("Could not confirm the purchase request.");
    if (order.status === "active") return { kind: "purchased" as const };
    if (order.status !== "pending")
      return {
        error: "This purchase was refunded or disputed. Start a fresh purchase request.",
      } as const;
    if (order.checkout_url)
      return { kind: "checkout" as const, url: secureUrl(order.checkout_url).href };
    const destination = new URL("/admin/cohorts", origin);
    destination.searchParams.set("cohort", order.cohort_id);
    destination.searchParams.set("license_order", order.id);
    const returnUrl = destination.href;
    const body = new URLSearchParams({
      mode: "payment",
      "line_items[0][quantity]": String(order.quantity),
      "line_items[0][price_data][currency]": order.currency,
      "line_items[0][price_data][unit_amount]": String(order.unit_price_cents),
      "line_items[0][price_data][product_data][name]":
        order.course_title + " — named learner licences",
      client_reference_id: context.userId,
      "metadata[purchase_kind]": "cohort_license",
      "metadata[license_order_id]": order.id,
      "metadata[cohort_id]": order.cohort_id,
      "metadata[course_id]": order.course_id,
      "metadata[user_id]": context.userId,
      "metadata[quantity]": String(order.quantity),
      "metadata[price_cents]": String(order.unit_price_cents),
      "metadata[currency]": order.currency,
      success_url: returnUrl,
      cancel_url: returnUrl,
    });
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + secret,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": "cohort-license/" + order.id,
      },
      body,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      return { error: "Could not start group checkout. Retry the same purchase request." } as const;
    const session = z
      .object({ id: z.string().startsWith("cs_"), url: z.string() })
      .safeParse(await response.json());
    if (!session.success)
      return {
        error: "Could not confirm group checkout. Retry the same purchase request.",
      } as const;
    const checkoutUrl = secureUrl(session.data.url).href;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("bind_course_license_checkout", {
      _order: order.id,
      _session: session.data.id,
      _url: checkoutUrl,
    });
    if (error)
      return {
        error: "Could not save checkout confirmation. Retry the same purchase request.",
      } as const;
    return { kind: "checkout" as const, url: checkoutUrl };
  });
