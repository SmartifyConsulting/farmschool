import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";
import { AuthCard } from "./auth";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Choose a new password — FarmerPlus Learning" },
    { name: "description", content: "Set a new FarmerPlus password." },
    { property: "og:title", content: "New password — FarmerPlus" },
    { property: "og:description", content: "Set a new password." },
  ] }),
  component: Reset,
});

function Reset() {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const nav = useNavigate();
  return (
    <AuthCard title="Choose a new password">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const { error } = await supabase.auth.updateUser({ password: pw });
        if (error) setMsg(error.message); else nav({ to: "/" });
      }}>
        <label className="block text-sm font-medium" htmlFor="pw">New password</label>
        <PasswordInput id="pw" value={pw} onChange={setPw} autoComplete="new-password" />
        {msg && <p className="text-sm text-destructive">{msg}</p>}
        <button className="w-full rounded-full bg-accent py-3 font-semibold text-accent-foreground">Save password</button>
      </form>
    </AuthCard>
  );
}
