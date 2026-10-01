import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput, inputCls } from "@/components/PasswordInput";
import { ROLES, mapAuthError, passwordRules } from "@/lib/auth-errors";
import logo from "@/assets/mobile-school-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { mode?: "signup" } => (s['mode'] === "signup" ? { mode: "signup" } : {}),
  head: () => ({ meta: [
    { title: "Sign in or sign up — Mobile School" },
    { name: "description", content: "Sign in or create a free Mobile School learner account." },
    { property: "og:title", content: "Sign in — Mobile School" },
    { property: "og:description", content: "Access your agricultural courses." },
  ] }),
  component: AuthPage,
});

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-primary p-5">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-xl">
        <Link to="/"><img src={logo.url} alt="Mobile School" className="mx-auto mb-4 h-28 w-auto object-contain" /></Link>
        <h1 className="mb-5 text-center text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  );
}

const signupSchema = z.object({
  fullName: z.string().trim().min(1, "Please enter your full name").max(100, "Name is too long"),
  region: z.string().trim().min(1, "Please enter your region or country").max(100, "Region is too long"),
  role: z.enum(ROLES, { message: "Please choose your role" }),
  email: z.string().trim().email("Please enter a valid email address").max(255),
});

type Errors = Partial<Record<"fullName" | "region" | "role" | "email" | "password" | "confirm", string>>;
const Err = ({ id, msg }: { id: string; msg?: string | undefined }) => msg ? <p id={id} className="mt-1 text-xs text-destructive">{msg}</p> : null;

function AuthPage() {
  const search = Route.useSearch();
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">(search.mode === "signup" ? "up" : "in");
  const [f, setF] = useState({ fullName: "", region: "", role: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => { setF({ ...f, [k]: v }); setErrors({ ...errors, [k]: undefined }); };
  const rules = passwordRules(f.password, f.email);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    if (mode === "in") {
      if (!f.email || !f.password) return setMsg("Please enter your email and password.");
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
      setBusy(false);
      return error ? setMsg(mapAuthError(error, "signin")) : nav({ to: "/" });
    }
    const errs: Errors = {};
    const parsed = signupSchema.safeParse(f);
    if (!parsed.success) for (const i of parsed.error.issues) errs[i.path[0] as keyof Errors] ??= i.message;
    if (rules.some((r) => !r.ok)) errs.password = "Your password doesn't meet all the rules below.";
    if (f.password !== f.confirm) errs.confirm = "Passwords don't match.";
    setErrors(errs);
    if (Object.keys(errs).length) { document.getElementById(Object.keys(errs)[0]!)?.focus(); return; }
    setBusy(true);
    const d = parsed.data!;
    const { data, error } = await supabase.auth.signUp({ email: d.email, password: f.password, options: { emailRedirectTo: window.location.origin, data: { full_name: d.fullName } } });
    if (error || !data.user) { setBusy(false); return setMsg(mapAuthError(error, "signup")); }
    const { error: pErr } = await supabase.from("profiles").upsert({ user_id: data.user.id, full_name: d.fullName, region: d.region, learner_role: d.role });
    setBusy(false);
    if (pErr) console.error(pErr);
    if (!data.session) return setMsg("Account created — please sign in.");
    nav({ to: "/" });
  };

  return (
    <AuthCard title={mode === "in" ? "Welcome back" : "Create your free account"}>
      <div className="mb-5 flex rounded-full bg-muted p-1 text-sm">
        {(["in", "up"] as const).map((m) => <button key={m} type="button" onClick={() => { setMode(m); setMsg(null); setErrors({}); }} className={`flex-1 rounded-full py-1.5 ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{m === "in" ? "Sign in" : "Sign up"}</button>)}
      </div>
      <form onSubmit={submit} noValidate className="space-y-3">
        {mode === "up" && <>
          <div><label className="block text-sm font-medium" htmlFor="fullName">Full name</label>
            <input id="fullName" autoComplete="name" value={f.fullName} onChange={(e) => set("fullName")(e.target.value)} aria-invalid={!!errors.fullName} className={inputCls} /><Err id="e-name" msg={errors.fullName} /></div>
          <div><label className="block text-sm font-medium" htmlFor="region">Region / country</label>
            <input id="region" autoComplete="country-name" value={f.region} onChange={(e) => set("region")(e.target.value)} aria-invalid={!!errors.region} className={inputCls} /><Err id="e-region" msg={errors.region} /></div>
          <div><label className="block text-sm font-medium" htmlFor="role">Role</label>
            <select id="role" value={f.role} onChange={(e) => set("role")(e.target.value)} aria-invalid={!!errors.role} className={inputCls}>
              <option value="">Choose your role</option>{ROLES.map((r) => <option key={r}>{r}</option>)}
            </select><Err id="e-role" msg={errors.role} /></div>
        </>}
        <div><label className="block text-sm font-medium" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" value={f.email} onChange={(e) => set("email")(e.target.value)} aria-invalid={!!errors.email} className={inputCls} /><Err id="e-email" msg={errors.email} /></div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium" htmlFor="password">Password</label>
            {mode === "in" && <Link to="/forgot-password" tabIndex={-1} className="text-xs text-primary">Forgot password?</Link>}
          </div>
          <PasswordInput id="password" value={f.password} onChange={set("password")} autoComplete={mode === "in" ? "current-password" : "new-password"} />
          <Err id="e-pw" msg={errors.password} />
          {mode === "up" && <ul className="mt-2 space-y-1 text-xs" aria-live="polite">
            {rules.map((r) => <li key={r.id} className={`flex items-center gap-1.5 ${r.ok && f.password ? "text-primary" : "text-muted-foreground"}`}>{r.ok && f.password ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}{r.label}</li>)}
          </ul>}
        </div>
        {mode === "up" && <div><label className="block text-sm font-medium" htmlFor="confirm">Confirm password</label>
          <PasswordInput id="confirm" value={f.confirm} onChange={set("confirm")} autoComplete="new-password" /><Err id="e-confirm" msg={errors.confirm} /></div>}
        {msg && <p aria-live="polite" className="rounded-lg bg-muted p-2 text-sm">{msg}</p>}
        <button disabled={busy} className="w-full rounded-full bg-accent py-3 font-semibold text-accent-foreground disabled:opacity-60">{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}</button>
      </form>
      <Link to="/" className="mt-4 block text-center text-xs text-muted-foreground">Continue browsing without an account</Link>
    </AuthCard>
  );
}
