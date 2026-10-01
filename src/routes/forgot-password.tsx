import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { inputCls } from "@/components/PasswordInput";
import { AuthCard } from "./auth";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [
    { title: "Forgot password — FarmerPlus Learning" },
    { name: "description", content: "Reset your FarmerPlus password." },
    { property: "og:title", content: "Forgot password — FarmerPlus" },
    { property: "og:description", content: "Reset your password." },
  ] }),
  component: Forgot,
});

function Forgot() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <AuthCard title="Reset your password">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        setMsg(error ? error.message : "If that email has an account, a reset link is on its way.");
      }}>
        <label className="block text-sm font-medium" htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        <button className="w-full rounded-full bg-accent py-3 font-semibold text-accent-foreground">Send reset link</button>
      </form>
      <Link to="/auth" className="mt-4 block text-center text-sm text-muted-foreground">Back to sign in</Link>
    </AuthCard>
  );
}
