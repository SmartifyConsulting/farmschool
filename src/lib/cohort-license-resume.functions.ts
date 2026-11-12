import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { licenseOrder } from "@/lib/cohort-licenses";

export const resumeCohortLicenseCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ cohortId: z.string().uuid(), orderId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: raw, error } = await context.supabase
      .from("course_license_orders")
      .select("*")
      .eq("id", data.orderId)
      .eq("cohort_id", data.cohortId)
      .maybeSingle();
    if (error || !raw) throw new Error("This purchase is not available to your billing account.");
    const order = licenseOrder.parse(raw);
    if (order.id !== data.orderId || order.cohort_id !== data.cohortId)
      throw new Error("Could not confirm the selected cohort purchase.");
    if (order.status === "active") return { kind: "purchased" as const };
    if (order.status !== "pending")
      return { error: "This purchase cannot be resumed while refunded or disputed." } as const;
    const created = Date.parse(order.created_at);
    if (!Number.isFinite(created)) throw new Error("Could not confirm this purchase's creation date.");
    if (created < Date.now() - 23 * 60 * 60 * 1000)
      return {
        error:
          "This checkout may have expired. Confirm its payment status before starting a replacement purchase.",
      } as const;
    if (!order.checkout_url)
      return {
        error:
          "The original buyer must retry initial checkout creation before another billing manager can resume it.",
      } as const;
    const url = new URL(order.checkout_url);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("Could not confirm a secure checkout address.");
    return { kind: "checkout" as const, url: url.href };
  });
