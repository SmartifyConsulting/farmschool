import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { listTokenLedger } from "@/lib/token-ledger.functions";
import { cn } from "@/lib/utils";
import {
  BudgetStrip,
  DailyCostChart,
  FailureReasons,
  SavingsCard,
  SpendByRetailer,
  SpendByUser,
  TopProducts,
  useZarRate,
} from "./token-ledger-insights";
import {
  NO_USER,
  UNATTRIBUTED,
  downloadCsv,
  isFailed,
  num,
  productLabel,
  retailerLabel,
  rowsToCsv,
  runLabel,
  setDisplayRate,
  storeLabel,
  totals,
  usd,
  userLabel,
  type Row,
} from "./token-ledger-shared";

const monthKey = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const dayHeading = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const ymd = (d: Date) => d.toISOString().slice(0, 10);

type GroupMode = "month" | "day" | "product" | "user" | "run";

const GROUP_LABEL: Record<GroupMode, string> = {
  month: "Month",
  day: "Day",
  product: "Product",
  user: "User",
  run: "Bulk action",
};
const EMPTY_GROUPS = new Set([UNATTRIBUTED, NO_USER, "Single action"]);

export function TokenLedger() {
  const fn = useServerFn(listTokenLedger);
  const [from, setFrom] = useState(() => ymd(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(() => ymd(new Date()));
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["token-ledger", from, to],
    queryFn: () => fn({ data: { from, to } }),
    enabled: !!from && !!to && from <= to,
  });
  const [tab, setTab] = useState<"ledger" | "reports">("ledger");
  const [activityFilter, setActivityFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [groupMode, setGroupMode] = useState<GroupMode>("day");
  const allRows = (data?.rows ?? []) as Row[];
  const zar = useZarRate();
  setDisplayRate(zar.data?.rate ?? null);

  const activityOptions = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.operation))).sort(),
    [allRows],
  );
  const userOptions = useMemo(() => Array.from(new Set(allRows.map(userLabel))).sort(), [allRows]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (activityFilter !== "all" && r.operation !== activityFilter) return false;
      if (resultFilter === "ok" && isFailed(r)) return false;
      if (resultFilter === "failed" && !isFailed(r)) return false;
      if (userFilter !== "all" && userLabel(r) !== userFilter) return false;
      if (
        q &&
        !`${r.product_name ?? ""} ${r.store_name ?? ""} ${r.retailer_name ?? ""}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [allRows, activityFilter, resultFilter, userFilter, search]);
  const t = useMemo(() => totals(rows), [rows]);

  const groups = useMemo(() => {
    const keyOf = (r: Row) =>
      groupMode === "product"
        ? productLabel(r)
        : groupMode === "user"
          ? userLabel(r)
          : groupMode === "run"
            ? runLabel(r)
            : groupMode === "day"
              ? dayHeading(r.created_at)
              : monthKey(r.created_at);
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const k = keyOf(r);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    const entries = Array.from(m.entries());
    if (groupMode === "month" || groupMode === "day") return entries; // rows arrive newest first
    return entries.sort((a, b) => {
      if (EMPTY_GROUPS.has(a[0])) return 1;
      if (EMPTY_GROUPS.has(b[0])) return -1;
      return totals(b[1]).cost - totals(a[1]).cost;
    });
  }, [rows, groupMode]);

  const preset = (days: number) => {
    setFrom(ymd(new Date(Date.now() - days * 86_400_000)));
    setTo(ymd(new Date()));
  };
  const exportRows = () => {
    const { header, lines } = rowsToCsv(rows);
    downloadCsv(`token-ledger_${from}_to_${to}.csv`, header, lines);
  };

  const showProduct = groupMode !== "product";
  const showUser = groupMode !== "user";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Token ledger</h3>
          <p className="text-xs text-muted-foreground">
            Every paid AI and search call Plusticity makes, with tokens used and estimated cost.
            Exact billing is on each provider's account.
          </p>
          <p className="text-[11px] text-muted-foreground">
            {zar.data
              ? `Amounts are shown in rand at R${zar.data.rate.toFixed(2)} per US dollar (rate of ${zar.data.asOf}). Providers bill in dollars, so these are estimates.`
              : zar.isLoading
                ? "Loading the exchange rate…"
                : "Amounts are in US dollars (the rand exchange rate couldn't be fetched just now)."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-border p-0.5">
            {(["ledger", "reports"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={tab === k}
                onClick={() => setTab(k)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  tab === k
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {k === "ledger" ? "Ledger" : "Reports"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            From
            <Input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 w-[140px] text-xs"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            To
            <Input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 w-[140px] text-xs"
            />
          </label>
          <Select value="" onValueChange={(v) => preset(Number(v))}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue placeholder="Quick pick" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Today</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {tab === "reports" ? (
        <TokenReport rows={allRows} loading={isLoading} />
      ) : (
        <>
          <BudgetStrip />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Calls", num(rows.length)],
              ["Tokens", num(t.tokens)],
              ["Estimated cost", usd(t.cost)],
              ["Failed calls", num(t.failed)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-border bg-card p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 font-mono text-base font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-2 lg:grid-cols-2">
            <SavingsCard rows={allRows} />
            <SpendByRetailer rows={allRows} />
          </div>
          <SpendByUser rows={allRows} />
          <DailyCostChart rows={allRows} />
          <TopProducts rows={allRows} />

          <div className="flex flex-wrap items-center gap-2">
            <Select value={activityFilter} onValueChange={setActivityFilter}>
              <SelectTrigger className="h-8 w-[190px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All activities</SelectItem>
                {activityOptions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={resultFilter} onValueChange={setResultFilter}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All results</SelectItem>
                <SelectItem value="ok">Successful</SelectItem>
                <SelectItem value="failed">Failed only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {userOptions.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Search product, store or retailer"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-[240px] text-xs"
            />
            <span className="ml-1 text-xs text-muted-foreground">Group by</span>
            <Select value={groupMode} onValueChange={(v) => setGroupMode(v as GroupMode)}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(GROUP_LABEL) as GroupMode[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {GROUP_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-8"
              onClick={exportRows}
              disabled={!rows.length}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>

          <div className="overflow-hidden rounded-md border border-border bg-card">
            {error ? (
              <p className="p-6 text-sm text-muted-foreground">{(error as Error).message}</p>
            ) : isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Nothing recorded for these filters.
              </p>
            ) : (
              <Accordion key={groupMode} type="multiple" defaultValue={[groups[0]?.[0] ?? ""]}>
                {groups.map(([label, list]) => {
                  const g = totals(list);
                  return (
                    <AccordionItem
                      key={label}
                      value={label}
                      className="border-border last:border-b-0"
                    >
                      <AccordionTrigger className="bg-muted/50 px-4 py-3 text-sm font-medium hover:no-underline">
                        <span className="flex flex-1 items-center justify-between gap-3 pr-3 text-left">
                          <span className="truncate">{label}</span>
                          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                            {num(g.tokens)} tokens · {usd(g.cost)} · {list.length} call
                            {list.length === 1 ? "" : "s"}
                            {g.failed > 0 && (
                              <span className="text-destructive"> · {g.failed} failed</span>
                            )}
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="px-0 pb-0">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="border-y border-border text-left text-muted-foreground">
                              <tr>
                                <th className="px-4 py-2 font-medium">When</th>
                                <th className="px-4 py-2 font-medium">Activity</th>
                                {showProduct && <th className="px-4 py-2 font-medium">Product</th>}
                                {showProduct && <th className="px-4 py-2 font-medium">Store</th>}
                                {showUser && <th className="px-4 py-2 font-medium">User</th>}
                                <th className="px-4 py-2 font-medium">Model</th>
                                <th className="px-4 py-2 text-right font-medium">In</th>
                                <th className="px-4 py-2 text-right font-medium">Out</th>
                                <th className="px-4 py-2 text-right font-medium">Total</th>
                                <th className="px-4 py-2 text-right font-medium">Cost</th>
                                <th className="px-4 py-2 font-medium">Result</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {list.map((r) => {
                                const failed = isFailed(r);
                                return (
                                  <tr key={r.id}>
                                    <td className="whitespace-nowrap px-4 py-2">
                                      {groupMode === "day"
                                        ? new Date(r.created_at).toLocaleTimeString()
                                        : new Date(r.created_at).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2">
                                      {r.operation}
                                      {r.run_label && (
                                        <div className="text-[10px] text-muted-foreground">
                                          {r.run_label}
                                        </div>
                                      )}
                                    </td>
                                    {showProduct && (
                                      <td className="px-4 py-2">
                                        {r.product_name ?? (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                    )}
                                    {showProduct && (
                                      <td className="px-4 py-2">
                                        {r.store_name ?? (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                    )}
                                    {showUser && (
                                      <td className="whitespace-nowrap px-4 py-2">
                                        {r.user_name ?? (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                    )}
                                    <td className="px-4 py-2 font-mono">{r.model ?? "—"}</td>
                                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                                      {num(r.input_tokens ?? 0)}
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                                      {num(r.output_tokens ?? 0)}
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                                      {num(r.total_tokens ?? 0)}
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                                      {usd(Number(r.cost_usd ?? 0))}
                                    </td>
                                    <td className="px-4 py-2">
                                      <Badge
                                        variant={failed ? "destructive" : "outline"}
                                        className="text-[10px]"
                                      >
                                        {failed
                                          ? r.status === 429
                                            ? "No credit / limit"
                                            : `Error ${r.status}`
                                          : "OK"}
                                      </Badge>
                                      {failed && r.error_message && (
                                        <div
                                          className="mt-0.5 max-w-[260px] truncate text-[10px] text-muted-foreground"
                                          title={r.error_message}
                                        >
                                          {r.error_message}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </div>
        </>
      )}
    </section>
  );
}

type ReportGroup = "activity" | "product" | "store" | "retailer" | "user" | "run" | "model" | "day";

const REPORT_GROUP_LABEL: [ReportGroup, string][] = [
  ["activity", "Activity"],
  ["product", "Product"],
  ["store", "Store"],
  ["retailer", "Retailer"],
  ["user", "User"],
  ["run", "Bulk action"],
  ["model", "Model"],
  ["day", "Day"],
];

function TokenReport({ rows, loading }: { rows: Row[]; loading: boolean }) {
  const [activity, setActivity] = useState("all");
  const [model, setModel] = useState("all");
  const [result, setResult] = useState("all");
  const [groupBy, setGroupBy] = useState<ReportGroup>("activity");

  const activities = useMemo(
    () => Array.from(new Set(rows.map((r) => r.operation))).sort(),
    [rows],
  );
  const models = useMemo(() => Array.from(new Set(rows.map((r) => r.model ?? "—"))).sort(), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const failed = isFailed(r);
        if (activity !== "all" && r.operation !== activity) return false;
        if (model !== "all" && (r.model ?? "—") !== model) return false;
        if (result === "ok" && failed) return false;
        if (result === "failed" && !failed) return false;
        return true;
      }),
    [rows, activity, model, result],
  );
  const t = useMemo(() => totals(filtered), [filtered]);

  const grouped = useMemo(() => {
    const keyOf = (r: Row) =>
      groupBy === "activity"
        ? r.operation
        : groupBy === "model"
          ? (r.model ?? "—")
          : groupBy === "product"
            ? productLabel(r)
            : groupBy === "store"
              ? storeLabel(r)
              : groupBy === "retailer"
                ? retailerLabel(r)
                : groupBy === "user"
                  ? userLabel(r)
                  : groupBy === "run"
                    ? runLabel(r)
                    : r.created_at.slice(0, 10);
    const m = new Map<string, Row[]>();
    for (const r of filtered) m.set(keyOf(r), [...(m.get(keyOf(r)) ?? []), r]);
    return Array.from(m.entries())
      .map(([k, list]) => ({ key: k, calls: list.length, ...totals(list) }))
      .sort((a, b) => {
        if (groupBy === "day") return b.key.localeCompare(a.key);
        if (EMPTY_GROUPS.has(a.key)) return 1;
        if (EMPTY_GROUPS.has(b.key)) return -1;
        return b.cost - a.cost;
      });
  }, [filtered, groupBy]);

  const groupName = REPORT_GROUP_LABEL.find(([k]) => k === groupBy)![1];
  const exportReport = () =>
    downloadCsv(
      `token-report_by-${groupBy}.csv`,
      [groupName, "Calls", "Tokens", "Cost USD", "Share %", "Failed"],
      grouped.map((g) => [
        g.key,
        g.calls,
        g.tokens,
        Number(g.cost.toFixed(6)),
        t.cost > 0 ? Number(((g.cost / t.cost) * 100).toFixed(1)) : 0,
        g.failed,
      ]),
    );

  const picker = (
    label: string,
    value: string,
    set: (v: string) => void,
    options: [string, string][],
  ) => (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <Select value={value} onValueChange={set}>
        <SelectTrigger className="h-8 w-[180px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {picker("Activity", activity, setActivity, [
          ["all", "All activities"],
          ...activities.map((a) => [a, a] as [string, string]),
        ])}
        {picker("Model", model, setModel, [
          ["all", "All models"],
          ...models.map((a) => [a, a] as [string, string]),
        ])}
        {picker("Result", result, setResult, [
          ["all", "All results"],
          ["ok", "Successful"],
          ["failed", "Failed"],
        ])}
        {picker("Group by", groupBy, (v) => setGroupBy(v as ReportGroup), REPORT_GROUP_LABEL)}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-8"
          onClick={exportReport}
          disabled={!grouped.length}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Calls", num(filtered.length)],
          ["Tokens", num(t.tokens)],
          ["Estimated cost", usd(t.cost)],
          ["Avg cost / call", usd(filtered.length ? t.cost / filtered.length : 0)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-card p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 font-mono text-base font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : grouped.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No calls match these filters.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">{groupName}</th>
                <th className="px-4 py-2 text-right font-medium">Calls</th>
                <th className="px-4 py-2 text-right font-medium">Tokens</th>
                <th className="px-4 py-2 text-right font-medium">Cost</th>
                <th className="px-4 py-2 text-right font-medium">Share</th>
                <th className="px-4 py-2 text-right font-medium">Failed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {grouped.map((g) => (
                <tr key={g.key}>
                  <td className="px-4 py-2">{g.key}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{num(g.calls)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{num(g.tokens)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{usd(g.cost)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {t.cost > 0 ? `${((g.cost / t.cost) * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{num(g.failed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <FailureReasons rows={filtered} />
    </div>
  );
}
