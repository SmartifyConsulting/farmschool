import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { mapAuthError } from "@/lib/auth-errors";
import { inputCls } from "@/components/PasswordInput";
import { AuthCard } from "./auth";
import { readPortalSlug } from "@/lib/customer-portal";
import { useCustomerPortal } from "@/hooks/useCustomerPortal";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: (input: Record<string, unknown>): { portal?: string } => readPortalSlug(input["portal"]) ? { portal: readPortalSlug(input["portal"])! } : {},
  head: () => ({ meta: [
    { title: "Forgot password — Plusticity" },
    { name: "description", content: "Reset your Plusticity password." },
    { property: "og:title", content: "Forgot password — Plusticity" },
    { property: "og:description", content: "Reset your password." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Forgot,
});

function Forgot() {
  const { portal: slug } = Route.useSearch();
  const portal = useCustomerPortal(slug);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  if (slug && (portal.isPending || portal.isError || !portal.data)) return <AuthCard title={portal.isPending ? "Loading training portal…" : "Training portal unavailable"}><p>Contact your training manager if this address no longer works.</p></AuthCard>;
  return (
    <AuthCard brand={!portal.isError ? portal.data?.brand : undefined} title="Reset your password">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password${slug ? "?portal=" + encodeURIComponent(slug) : ""}` });
        setMsg(error ? mapAuthError(error, "reset") : "If that email has an account, a reset link is on its way.");
      }}>
        <label className="block text-sm font-medium" htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        <button className="w-full rounded-full bg-accent py-3 font-semibold text-accent-foreground">Send reset link</button>
      </form>
      <Link to="/auth" search={slug ? { portal: slug } : {}} className="mt-4 block text-center text-sm text-muted-foreground">Back to sign in</Link>
    </AuthCard>
  );
}
