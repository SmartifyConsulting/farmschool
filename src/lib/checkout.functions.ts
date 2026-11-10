import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isPaidCourse } from "@/lib/marketplace";

/** Starts a Stripe Checkout session for a paid course. Free courses enrol directly, no Stripe call needed. */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ courseId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: course } = await context.supabase
      .from("studio_courses")
      .select("id, title, price_cents, currency, published, prerequisite_course_id")
      .eq("id", data.courseId)
      .eq("published", true)
      .maybeSingle();
    if (!course) return { error: "This course is not available." } as const;
    if (course.prerequisite_course_id) {
      const { data: prerequisiteOk } = await context.supabase.rpc("studio_prerequisite_satisfied", { _course: course.id });
      if (!prerequisiteOk) return { error: "Complete the prerequisite course before enrolling." } as const;
    }
    const { data: existing } = await context.supabase
      .from("course_enrollments")
      .select("id")
      .eq("user_id", context.userId)
      .eq("course_id", course.id)
      .maybeSingle();
    if (existing) return { error: "You're already enrolled in this course." } as const;

    if (!isPaidCourse(course.price_cents)) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("course_enrollments").insert({
        user_id: context.userId,
        course_id: course.id,
        amount_cents: 0,
        currency: course.currency,
        payment_provider: "internal",
        payment_status: "free",
      });
      if (error) return { error: "Could not enrol you in this course." } as const;
      return { kind: "enrolled" as const };
    }

    const secretKey = process.env["STRIPE_SECRET_KEY"];
    const siteUrl = process.env["SITE_URL"];
    if (!secretKey || !siteUrl) return { error: "Paid enrolment is not configured yet." } as const;
    const body = new URLSearchParams({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": course.currency,
      "line_items[0][price_data][unit_amount]": String(course.price_cents),
      "line_items[0][price_data][product_data][name]": course.title,
      client_reference_id: context.userId,
      "metadata[course_id]": course.id,
      "metadata[user_id]": context.userId,
      success_url: siteUrl + "/class/" + course.id + "?enrolled=1",
      cancel_url: siteUrl + "/class/" + course.id,
    });
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + secretKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!response.ok) return { error: "Could not start checkout. Please try again." } as const;
    const session = (await response.json()) as { url: string | null };
    if (!session.url) return { error: "Could not start checkout. Please try again." } as const;
    return { kind: "checkout" as const, url: session.url };
  });
