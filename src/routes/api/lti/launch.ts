import { createFileRoute } from "@tanstack/react-router";
import { consumeLaunchState, lessonCourseIdFromClaims, verifyLtiLaunch, type LtiPlatform } from "@/lib/lti.server";

function errorPage(message: string, status = 400) {
  return new Response(
    `<!doctype html><html><body style="font-family:sans-serif;max-width:520px;margin:4rem auto;padding:0 1rem">
      <h1>Could not start this course</h1><p>${message.replace(/[<>]/g, "")}</p>
    </body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/** LTI 1.3 resource-link launch (step 2). Verifies the platform's id_token,
 * maps the email claim to an EXISTING Plusticity account, and signs the
 * browser in via a Supabase magic link before redirecting into the course. */
export const Route = createFileRoute("/api/lti/launch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData();
        const state = form.get("state");
        const idToken = form.get("id_token");
        if (typeof state !== "string" || typeof idToken !== "string") {
          return errorPage("This launch request is missing required fields.");
        }

        const launch = await consumeLaunchState(state);
        if (!launch) return errorPage("This launch has expired or was already used. Please try again from the platform.");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: platform } = await supabaseAdmin
          .from("lti_platforms")
          .select("*")
          .eq("id", launch.platform_id)
          .maybeSingle();
        if (!platform || !platform.enabled) return errorPage("This platform is no longer connected.");

        let claims;
        try {
          claims = await verifyLtiLaunch(idToken, platform as LtiPlatform, launch.nonce);
        } catch (e) {
          return errorPage(e instanceof Error ? e.message : "Could not verify this launch.");
        }

        if (!claims.email) {
          return errorPage(
            "Your institution's platform did not send an email address with this launch, so Plusticity can't match your account. Ask your administrator to enable the email claim.",
          );
        }

        const { data: userId } = await supabaseAdmin.rpc("lti_user_id_by_email", { _email: claims.email });
        if (!userId) {
          return errorPage(
            `No Plusticity account matches ${claims.email}. Ask your Plusticity administrator to invite this email address first, then launch again.`,
          );
        }

        const courseId = lessonCourseIdFromClaims(claims, platform as LtiPlatform);
        const site = process.env["SITE_URL"];
        if (!site) return errorPage("Server misconfigured: SITE_URL is not set.", 500);
        const redirectTo = `${site.replace(/\/+$/, "")}${courseId ? `/class/${courseId}` : "/"}`;

        const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: claims.email,
          options: { redirectTo },
        });
        if (error || !link?.properties?.action_link) {
          return errorPage("Could not sign you in to Plusticity. Please try again or contact support.");
        }

        return new Response(null, { status: 302, headers: { Location: link.properties.action_link } });
      },
    },
  },
});
