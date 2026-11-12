import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Header, Sheet, CanvasHeading, useIsAdmin } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/admin/token-ledger")({
  head: () => pageMeta("Token Ledger — Plusticity", "AI token usage, cost and monthly budget for administrators."),
  component: TokenLedger,
});

const RANGES = [7, 30, 90] as const;

function TokenLedger() {
  const { user, ready } = useAuth();
  const isAdmin = useIsAdmin();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const since = useMemo(() => new Date(Date.now() - days * 86400000).toISOString(), [days]);
  const { data: rows, error, isLoading } = useQuery({
    queryKey: ["token-ledger", days],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_usage_events")
        .select("id, created_at, operation, provider, model, user_name, total_tokens, cost_usd, status")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: settings } = useQuery({
    queryKey: ["ledger-settings"],
    enabled: isAdmin,
    queryFn: async () => (await supabase.from("ledger_settings").select("*").maybeSingle()).data,
  });
  const totals = (rows ?? []).reduce(
    (a, r) => ({ tokens: a.tokens + (r.total_tokens ?? 0), cost: a.cost + Number(r.cost_usd ?? 0) }),
    { tokens: 0, cost: 0 },
  );
  const budget = settings?.monthly_budget_usd ? Number(settings.monthly_budget_usd) : null;
  const pct = budget ? Math.min(100, Math.round((totals.cost / budget) * 100)) : null;

  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading eyebrow="Admin" title="Token Ledger" />
        {!ready ? (
          <p className="py-8 text-sm text-muted-foreground">Checking permissions…</p>
        ) : !user ? (
          <p className="py-8 text-sm"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> as an administrator.</p>
        ) : !isAdmin ? (
          <p className="py-8 text-sm text-muted-foreground">Administrator access required.</p>
        ) : (
          <div className="space-y-4 pb-10">
            <AdminNav />
            <div className="flex gap-2">
              {RANGES.map((r) => (
                <Button key={r} size="sm" variant={days === r ? "default" : "outline"} onClick={() => setDays(r)}>
                  Last {r} days
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              {[
                ["AI requests", (rows?.length ?? 0).toLocaleString()],
                ["Tokens", totals.tokens.toLocaleString()],
                ["Cost (USD)", `$${totals.cost.toFixed(2)}`],
                ["Budget used", pct === null ? "No budget set" : `${pct}%`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-muted/50 p-3">
                  <p className="text-lg font-semibold">{value}</p>
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            {isLoading && <p className="text-sm text-muted-foreground">Loading usage…</p>}
            {error && <p className="text-sm text-destructive">{friendlyError(error)}</p>}
            {rows && rows.length === 0 && <p className="py-6 text-sm text-muted-foreground">No AI usage in this period.</p>}
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr><th className="p-2">When</th><th className="p-2">Feature</th><th className="p-2">Model</th><th className="p-2">User</th><th className="p-2 text-right">Tokens</th><th className="p-2 text-right">Cost</th></tr>
                </thead>
                <tbody>
                  {(rows ?? []).map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-2 text-xs">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="p-2">{r.operation}</td>
                      <td className="p-2 text-xs">{r.model ?? r.provider}</td>
                      <td className="p-2 text-xs">{r.user_name ?? "—"}</td>
                      <td className="p-2 text-right">{(r.total_tokens ?? 0).toLocaleString()}</td>
                      <td className="p-2 text-right">${Number(r.cost_usd ?? 0).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
