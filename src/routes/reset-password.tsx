import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";
import { mapAuthError, passwordRules } from "@/lib/auth-errors";
import { AuthCard } from "./auth";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Choose a new password — Mobile School" },
    { name: "description", content: "Set a new Mobile School password." },
    { property: "og:title", content: "New password — Mobile School" },
    { property: "og:description", content: "Set a new password." },
  ] }),
  component: Reset,
});

function Reset() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const nav = useNavigate();
  const rules = passwordRules(pw, "");
  return (
    <AuthCard title="Choose a new password">
      <form className="space-y-3" noValidate onSubmit={async (e) => {
        e.preventDefault(); setMsg(null);
        if (rules.some((r) => !r.ok)) return setMsg("Your password doesn't meet all the rules.");
        if (pw !== confirm) return setMsg("Passwords don't match.");
        const { error } = await supabase.auth.updateUser({ password: pw });
        if (!error) return nav({ to: "/" });
        const m = mapAuthError(error, "reset");
        setExpired(m.includes("expired") || /session/i.test(error.message));
        setMsg(m);
      }}>
        <label className="block text-sm font-medium" htmlFor="pw">New password</label>
        <PasswordInput id="pw" value={pw} onChange={setPw} autoComplete="new-password" />
        <ul className="space-y-1 text-xs" aria-live="polite">{rules.slice(0, 3).map((r) => <li key={r.id} className={`flex items-center gap-1.5 ${r.ok && pw ? "text-primary" : "text-muted-foreground"}`}>{r.ok && pw ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}{r.label}</li>)}</ul>
        <label className="block text-sm font-medium" htmlFor="confirm">Confirm new password</label>
        <PasswordInput id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {msg && <p aria-live="polite" className="text-sm text-destructive">{msg} {expired && <Link to="/forgot-password" className="underline">Request a new link</Link>}</p>}
        <button className="w-full rounded-full bg-accent py-3 font-semibold text-accent-foreground">Save password</button>
      </form>
    </AuthCard>
  );
}
