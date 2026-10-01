import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Trash2 } from "lucide-react";
import { Phone, Header, Sheet } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { inputCls } from "@/components/PasswordInput";

export const Route = createFileRoute("/developer")({
  head: () => ({ meta: [
    { title: "API Keys — FarmerPlus Learning" },
    { name: "description", content: "Create API keys to access FarmerPlus lessons and your progress from other apps." },
    { property: "og:title", content: "API Keys — FarmerPlus" },
    { property: "og:description", content: "Access lessons programmatically." },
  ] }),
  component: Developer,
});

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function Developer() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { data: keys } = useQuery({
    queryKey: ["api_keys", user?.id], enabled: !!user,
    queryFn: async () => (await supabase.from("api_keys").select("id, name, prefix, created_at, last_used_at").order("created_at", { ascending: false })).data ?? [],
  });
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const key = "fp_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await supabase.from("api_keys").insert({ user_id: user!.id, name: name || "My key", prefix: key.slice(0, 10), key_hash: await sha256(key) });
    if (error) return setErr(error.message);
    setCreated(key); setName(""); qc.invalidateQueries({ queryKey: ["api_keys"] });
  };
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <Phone>
      <Header title="API keys" greeting="Developer access" />
      <Sheet>
        {ready && !user ? <p className="py-10 text-center text-sm text-muted-foreground"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> to create API keys.</p> : (
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Use an API key to read the lesson catalogue and your own progress from another app or script. Keep keys secret — anyone with a key can read your progress.</p>
            <form onSubmit={create} className="mt-4 flex gap-2">
              <input placeholder="Key name, e.g. My website" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              <button className="shrink-0 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground">Create</button>
            </form>
            {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
            {created && <div className="mt-4 rounded-xl border border-accent bg-secondary p-3 text-sm">
              <p className="font-semibold">Copy your key now — it won't be shown again.</p>
              <div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded bg-card px-2 py-1 text-xs">{created}</code>
                <button aria-label="Copy key" onClick={() => navigator.clipboard.writeText(created)}><Copy className="h-4 w-4" /></button></div>
            </div>}
            <ul className="mt-5 divide-y divide-border">
              {keys?.map((k) => (
                <li key={k.id} className="flex items-center gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1"><p className="font-medium">{k.name}</p><p className="text-xs text-muted-foreground">{k.prefix}… · {k.last_used_at ? `last used ${new Date(k.last_used_at).toLocaleDateString()}` : "never used"}</p></div>
                  <button aria-label="Revoke key" onClick={async () => { await supabase.from("api_keys").delete().eq("id", k.id); qc.invalidateQueries({ queryKey: ["api_keys"] }); }} className="text-destructive"><Trash2 className="h-4 w-4" /></button>
                </li>))}
              {keys?.length === 0 && <li className="py-4 text-sm text-muted-foreground">No keys yet.</li>}
            </ul>
          </div>
          <div className="rounded-2xl bg-muted p-4 text-xs">
            <h2 className="mb-2 text-sm font-semibold">How to use</h2>
            <p className="mb-1 font-medium">List courses and lessons</p>
            <pre className="overflow-x-auto rounded bg-card p-2">{`curl ${origin}/api/public/v1/courses \\\n  -H "Authorization: Bearer fp_..."`}</pre>
            <p className="mb-1 mt-3 font-medium">Your lesson progress</p>
            <pre className="overflow-x-auto rounded bg-card p-2">{`curl ${origin}/api/public/v1/progress \\\n  -H "Authorization: Bearer fp_..."`}</pre>
          </div>
        </div>)}
      </Sheet>
    </Phone>
  );
}
