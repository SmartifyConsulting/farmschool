import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2, PiggyBank } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  getLedgerSettings,
  getZarRate,
  listTokenLedger,
  saveLedgerSettings,
} from "@/lib/token-ledger.functions";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/friendly-error";
import {
  UNATTRIBUTED,
  currencyName,
  dayOf,
  getDisplayRate,
  userLabel,
  estimateSavings,
  failureReasons,
  productLabel,
  retailerLabel,
  totals,
  usd,
  num,
  type Row,
} from "./token-ledger-shared";
export function useZarRate() {
  const fn = useServerFn(getZarRate);
  return useQuery({
    queryKey: ["zar-rate"],
    queryFn: () => fn(),
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
  });
}

export function BudgetStrip() {
  const qc = useQueryClient();
  const settingsFn = useServerFn(getLedgerSettings);
  const saveFn = useServerFn(saveLedgerSettings);
  const ledgerFn = useServerFn(listTokenLedger);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const month = useQuery({
    queryKey: ["token-ledger-month", monthStart],
    queryFn: () => ledgerFn({ data: { from: monthStart, to: today } }),
    staleTime: 60_000,
  });
  const settings = useQuery({ queryKey: ["ledger-settings"], queryFn: () => settingsFn() });
  const rate = useZarRate().data?.rate ?? null;

  const [budgetText, setBudgetText] = useState("");
  const [alertText, setAlertText] = useState("80");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!settings.data) return;
    setBudgetText(
      settings.data.monthlyBudgetUsd != null
        ? String(Math.round(settings.data.monthlyBudgetUsd * (rate ?? 1) * 100) / 100)
        : "",
    );
    setAlertText(String(settings.data.alertAtPercent));
  }, [settings.data, rate]);

  const spend = useMemo(() => totals((month.data?.rows ?? []) as Row[]).cost, [month.data]);
  const budget = settings.data?.monthlyBudgetUsd ?? null;
  const alertAt = settings.data?.alertAtPercent ?? 80;
  const pct = budget ? (spend / budget) * 100 : 0;
  const dayOfMonth = now.getUTCDate() + now.getUTCHours() / 24;
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const forecast = dayOfMonth >= 1 ? (spend / dayOfMonth) * daysInMonth : null;

  async function save(): Promise<void> {
    const typed = budgetText.trim() === "" ? null : Number(budgetText);
    const level = Number(alertText);
    if (typed !== null && (!Number.isFinite(typed) || typed < 0)) {
      toast.error(`Enter the budget as a number, e.g. ${rate ? "400" : "20"}`);
      return;
    }
    const value = typed === null ? null : typed / (rate ?? 1);
    if (!Number.isInteger(level) || level < 1 || level > 100) {
      toast.error("The warning level must be between 1 and 100%.");
      return;
    }
    setSaving(true);
    try {
      await saveFn({ data: { monthlyBudgetUsd: value, alertAtPercent: level } });
      await qc.invalidateQueries({ queryKey: ["ledger-settings"] });
      toast.success(value ? `Budget set to ${usd(value)} a month` : "Budget removed");
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't save the budget"));
    } finally {
      setSaving(false);
    }
  }

  const over = budget != null && pct >= 100;
  const warn = budget != null && !over && pct >= alertAt;

  return (
    <div
      className={cn(
        "rounded-md border bg-card p-3",
        over ? "border-destructive/50" : warn ? "border-amber-500/50" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            This month so far
          </p>
          <p className="mt-1 font-mono text-base font-semibold tabular-nums">
            {month.isLoading ? "…" : usd(spend)}
            {budget != null && (
              <span className="text-xs font-normal text-muted-foreground">
                {" "}
                of {usd(budget)} budget
              </span>
            )}
          </p>
          {forecast != null && !month.isLoading && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              At this pace: about {usd(forecast)} by the end of the month
              {budget != null && forecast > budget ? " — over budget" : ""}.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-[11px] text-muted-foreground">
            Monthly budget ({rate ? "Rand" : "USD"})
            <Input
              inputMode="decimal"
              placeholder={rate ? "e.g. 400" : "e.g. 20"}
              value={budgetText}
              onChange={(e) => setBudgetText(e.target.value)}
              className="h-8 w-[110px] text-xs"
              disabled={settings.data?.ready === false}
            />
          </label>
          <label className="space-y-1 text-[11px] text-muted-foreground">
            Warn me at (%)
            <Input
              inputMode="numeric"
              value={alertText}
              onChange={(e) => setAlertText(e.target.value)}
              className="h-8 w-[80px] text-xs"
              disabled={settings.data?.ready === false}
            />
          </label>
          <Button size="sm" onClick={save} disabled={saving || settings.data?.ready === false}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </div>

      {budget != null && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full",
              over ? "bg-destructive" : warn ? "bg-amber-500" : "bg-primary",
            )}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      )}

      {(over || warn) && (
        <p
          className={cn(
            "mt-2 flex items-center gap-1.5 text-xs",
            over ? "text-destructive" : "text-amber-600",
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {over
            ? `The monthly budget has been reached (${pct.toFixed(0)}%). Nothing is switched off.`
            : `${pct.toFixed(0)}% of the monthly budget is used.`}
        </p>
      )}
      {settings.data?.ready === false && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Budget settings are unavailable. Contact support if this persists.
        </p>
      )}
      {settings.data?.ready && budget == null && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Set a monthly budget to get a progress bar here and a warning on this screen when you
          reach the percentage you choose.
        </p>
      )}
    </div>
  );
}

export function SavingsCard({ rows }: { rows: Row[] }) {
  const s = useMemo(() => estimateSavings(rows), [rows]);
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <PiggyBank className="h-3.5 w-3.5" /> Saved by reuse (estimate)
      </p>
      <p className="mt-1 font-mono text-base font-semibold tabular-nums text-emerald-600">
        {usd(s.usd)}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {num(s.photos)} photo{s.photos === 1 ? "" : "s"} and {num(s.passports)} passport
        {s.passports === 1 ? "" : "s"} copied instead of paid for again.
      </p>
    </div>
  );
}

export function DailyCostChart({ rows }: { rows: Row[] }) {
  const rate = getDisplayRate() ?? 1;
  const symbol = getDisplayRate() ? "R" : "$";
  const dayConfig: ChartConfig = {
    cost: { label: `Cost (${currencyName()})`, color: "var(--primary)" },
  };
  const data = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const r of rows)
      byDay.set(
        dayOf(r.created_at),
        (byDay.get(dayOf(r.created_at)) ?? 0) + Number(r.cost_usd ?? 0),
      );
    const keys = Array.from(byDay.keys()).sort();
    if (!keys.length) return [];
    const out: { day: string; cost: number }[] = [];
    const cur = new Date(`${keys[0]}T00:00:00`);
    const end = new Date(`${keys[keys.length - 1]}T00:00:00`);
    while (cur <= end) {
      const k = dayOf(cur.toISOString());
      out.push({ day: k, cost: Math.round((byDay.get(k) ?? 0) * rate * 10000) / 10000 });
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [rows, rate]);

  if (!data.length) return null;
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Cost per day ({currencyName()})
      </p>
      <ChartContainer config={dayConfig} className="mt-2 h-40 w-full">
        <BarChart data={data}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tickFormatter={(d: string) => d.slice(5)}
            minTickGap={16}
          />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${symbol}${v}`}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="cost" fill="var(--color-cost)" radius={3} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

export function TopProducts({ rows }: { rows: Row[] }) {
  const { top, unattributed } = useMemo(() => {
    const m = new Map<string, number>();
    let un = 0;
    for (const r of rows) {
      const c = Number(r.cost_usd ?? 0);
      const k = productLabel(r);
      if (k === UNATTRIBUTED) un += c;
      else m.set(k, (m.get(k) ?? 0) + c);
    }
    return {
      top: Array.from(m.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      unattributed: un,
    };
  }, [rows]);

  if (!top.length) {
    return (
      <div className="rounded-md border border-border bg-card p-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Most expensive products
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Product names appear here for calls made after the latest update; older calls are not
          attributed.
        </p>
      </div>
    );
  }
  const max = top[0]![1] || 1;
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Most expensive products
      </p>
      <ul className="mt-2 space-y-1.5">
        {top.map(([name, cost]) => (
          <li key={name} className="text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate">{name}</span>
              <span className="shrink-0 font-mono tabular-nums">{usd(cost)}</span>
            </div>
            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${(cost / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {unattributed > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Not attributed to a product: {usd(unattributed)}
        </p>
      )}
    </div>
  );
}

export function SpendByRetailer({ rows }: { rows: Row[] }) {
  const list = useMemo(() => {
    const m = new Map<string, { cost: number; calls: number }>();
    for (const r of rows) {
      const k = retailerLabel(r);
      const cur = m.get(k) ?? { cost: 0, calls: 0 };
      cur.cost += Number(r.cost_usd ?? 0);
      cur.calls++;
      m.set(k, cur);
    }
    return Array.from(m.entries()).sort((a, b) => {
      if (a[0] === UNATTRIBUTED) return 1;
      if (b[0] === UNATTRIBUTED) return -1;
      return b[1].cost - a[1].cost;
    });
  }, [rows]);
  const total = list.reduce((a, [, v]) => a + v.cost, 0);
  if (!list.length) return null;
  const max = Math.max(...list.map(([, v]) => v.cost), 0.0001);
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Spend by retailer</p>
      <ul className="mt-2 space-y-1.5">
        {list.map(([name, v]) => (
          <li key={name} className="text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate">{name}</span>
              <span className="shrink-0 font-mono tabular-nums">
                {usd(v.cost)} · {total > 0 ? `${((v.cost / total) * 100).toFixed(0)}%` : "—"} ·{" "}
                {num(v.calls)} call{v.calls === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  name === UNATTRIBUTED ? "bg-muted-foreground/40" : "bg-primary/70",
                )}
                style={{ width: `${(v.cost / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SpendByUser({ rows }: { rows: Row[] }) {
  const list = useMemo(() => {
    const m = new Map<string, { cost: number; calls: number; retailers: Map<string, number> }>();
    for (const r of rows) {
      const k = userLabel(r);
      const cur = m.get(k) ?? { cost: 0, calls: 0, retailers: new Map<string, number>() };
      const c = Number(r.cost_usd ?? 0);
      cur.cost += c;
      cur.calls++;
      const ret = retailerLabel(r);
      cur.retailers.set(ret, (cur.retailers.get(ret) ?? 0) + c);
      m.set(k, cur);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].cost - a[1].cost);
  }, [rows]);
  const total = list.reduce((a, [, v]) => a + v.cost, 0);
  if (!list.length) return null;
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Spend by user and retailer
      </p>
      <ul className="mt-2 space-y-2">
        {list.map(([name, v]) => (
          <li key={name} className="text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate font-medium">{name}</span>
              <span className="shrink-0 font-mono tabular-nums">
                {usd(v.cost)} · {total > 0 ? `${((v.cost / total) * 100).toFixed(0)}%` : "—"} ·{" "}
                {num(v.calls)} call{v.calls === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="mt-0.5 space-y-0.5 pl-3 text-muted-foreground">
              {Array.from(v.retailers.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([ret, cost]) => (
                  <li key={ret} className="flex items-center justify-between gap-3">
                    <span className="truncate">{ret}</span>
                    <span className="shrink-0 font-mono tabular-nums">{usd(cost)}</span>
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FailureReasons({ rows }: { rows: Row[] }) {
  const reasons = useMemo(() => failureReasons(rows), [rows]);
  if (!reasons.length) return null;
  const haveMessages = reasons.some((r) => r.message);
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <p className="border-b border-border px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        Why calls failed
      </p>
      <table className="w-full text-xs">
        <thead className="border-b border-border text-left text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Activity</th>
            <th className="px-4 py-2 font-medium">Error</th>
            <th className="px-4 py-2 font-medium">What the service said</th>
            <th className="px-4 py-2 text-right font-medium">Calls</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {reasons.map((r) => (
            <tr key={`${r.operation}|${r.status}|${r.message}`}>
              <td className="px-4 py-2">{r.operation}</td>
              <td className="px-4 py-2 font-mono">
                {r.status === 429 ? "429 · limit or credit" : r.status}
              </td>
              <td className="px-4 py-2 text-muted-foreground">{r.message || "—"}</td>
              <td className="px-4 py-2 text-right font-mono tabular-nums">{num(r.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!haveMessages && (
        <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          The service's own explanation is saved for failures from the latest update onwards;
          earlier failures only have the code.
        </p>
      )}
    </div>
  );
}
