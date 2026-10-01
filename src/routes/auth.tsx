import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput, inputCls } from "@/components/PasswordInput";
import logo from "@/assets/mobile-school-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Sign in — FarmerPlus Learning" },
    { name: "description", content: "Sign in or create a FarmerPlus learner account." },
    { property: "og:title", content: "Sign in — FarmerPlus" },
    { property: "og:description", content: "Access your agricultural courses." },
  ] }),
  component: AuthPage,
});

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-primary p-5">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-xl">
        <img src={logo.url} alt="Mobile School" className="mx-auto mb-4 h-10 w-auto object-contain" />
        <h1 className="mb-5 text-center text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function AuthPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message); else nav({ to: "/" });
    } else {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      setMsg(error ? error.message : "Check your email to confirm your account.");
    }
    setBusy(false);
  };
  return (
    <AuthCard title={mode === "in" ? "Welcome back" : "Create your account"}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="email">Email</label>
        <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium" htmlFor="password">Password</label>
          {mode === "in" && <Link to="/forgot-password" tabIndex={-1} className="text-xs text-primary">Forgot password?</Link>}
        </div>
        <PasswordInput id="password" value={password} onChange={setPassword} autoComplete={mode === "in" ? "current-password" : "new-password"} />
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        <button disabled={busy} className="w-full rounded-full bg-accent py-3 font-semibold text-accent-foreground disabled:opacity-60">{mode === "in" ? "Sign in" : "Sign up"}</button>
      </form>
      <button onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }} className="mt-4 w-full text-center text-sm text-muted-foreground">
        {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
      <Link to="/" className="mt-2 block text-center text-xs text-muted-foreground">Continue browsing</Link>
    </AuthCard>
  );
}
