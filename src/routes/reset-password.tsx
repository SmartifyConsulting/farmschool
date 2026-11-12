import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";
import { mapAuthError, passwordRules } from "@/lib/auth-errors";
import { AuthCard } from "./auth";
import { readPortalSlug } from "@/lib/customer-portal";
import { useCustomerPortal } from "@/hooks/useCustomerPortal";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (input: Record<string, unknown>): { portal?: string } => readPortalSlug(input["portal"]) ? { portal: readPortalSlug(input["portal"])! } : {},
  head: () => ({ meta: [
    { title: "Choose a new password — Plusticity" },
    { name: "description", content: "Set a new Plusticity password." },
    { property: "og:title", content: "New password — Plusticity" },
    { property: "og:description", content: "Set a new password." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Reset,
});

function Reset() {
  const { portal: slug } = Route.useSearch();
  const portal = useCustomerPortal(slug);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const nav = useNavigate();
  const rules = passwordRules(pw, "");
  if (slug && (portal.isPending || portal.isError || !portal.data)) return <AuthCard title={portal.isPending ? "Loading training portal…" : "Training portal unavailable"}><p>Contact your training manager if this address no longer works.</p></AuthCard>;
  return (
    <AuthCard brand={!portal.isError ? portal.data?.brand : undefined} title="Choose a new password">
      <form className="space-y-3" noValidate onSubmit={async (e) => {
        e.preventDefault(); setMsg(null);
        if (rules.some((r) => !r.ok)) return setMsg("Your password doesn't meet all the rules.");
        if (pw !== confirm) return setMsg("Passwords don't match.");
        const { error } = await supabase.auth.updateUser({ password: pw });
        if (!error) return slug ? nav({ to: "/portal/$slug", params: { slug } }) : nav({ to: "/" });
        const m = mapAuthError(error, "reset");
        setExpired(m.includes("expired") || /session/i.test(error.message));
        setMsg(m);
      }}>
        <label className="block text-sm font-medium" htmlFor="pw">New password</label>
        <PasswordInput id="pw" value={pw} onChange={setPw} autoComplete="new-password" />
        <ul className="space-y-1 text-xs" aria-live="polite">{rules.slice(0, 3).map((r) => <li key={r.id} className={`flex items-center gap-1.5 ${r.ok && pw ? "text-primary" : "text-muted-foreground"}`}>{r.ok && pw ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}{r.label}</li>)}</ul>
        <label className="block text-sm font-medium" htmlFor="confirm">Confirm new password</label>
        <PasswordInput id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {msg && <p aria-live="polite" className="text-sm text-destructive">{msg} {expired && <Link to="/forgot-password" search={slug ? { portal: slug } : {}} className="underline">Request a new link</Link>}</p>}
        <button className="w-full rounded-full bg-accent py-3 font-semibold text-accent-foreground">Save password</button>
      </form>
    </AuthCard>
  );
}
