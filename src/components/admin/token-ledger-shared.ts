// Shared types and helpers for the Token ledger screens.

export type Row = {
  id: string;
  created_at: string;
  provider?: string;
  operation: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | string | null;
  status: number | null;
  // Which product / store / retailer the call was for. Empty for farmschool's own calls, since
  // these columns exist on the shared ai_usage_events schema but aren't populated here.
  product_id?: string | null;
  product_name?: string | null;
  store_name?: string | null;
  retailer_name?: string | null;
  // Why it failed, which bulk action it belonged to, and who triggered it.
  error_message?: string | null;
  run_label?: string | null;
  user_name?: string | null;
};

// Costs are stored in US dollars (that's how providers bill). When the live
// USD->ZAR rate is known, every amount on the ledger is shown in rand instead.
let displayRate: number | null = null;
export function setDisplayRate(rate: number | null) {
  displayRate = rate && rate > 0 ? rate : null;
}
export const getDisplayRate = () => displayRate;
export const currencyName = () => (displayRate ? "Rand" : "USD");

/** Formats a dollar amount for display: "R 12.40" when the rand rate is known, "USD 0.6800" otherwise. */
export const usd = (n: number) => {
  if (displayRate) {
    const v = n * displayRate;
    return `R ${v.toFixed(v < 1 ? 3 : 2)}`;
  }
  return `USD ${n.toFixed(n < 1 ? 4 : 2)}`;
};
export const num = (n: number) => n.toLocaleString();

export const UNATTRIBUTED = "Not attributed";
export const NO_USER = "System / scheduled";

/** "Lesson title — Course title", or a plain label for calls with no linked product. */
export const productLabel = (r: Row) =>
  r.product_name ? (r.store_name ? `${r.product_name} — ${r.store_name}` : r.product_name) : UNATTRIBUTED;
export const storeLabel = (r: Row) => r.store_name || r.retailer_name || UNATTRIBUTED;
export const retailerLabel = (r: Row) => r.retailer_name || UNATTRIBUTED;
export const userLabel = (r: Row) => r.user_name || NO_USER;
export const isFailed = (r: Row) => !!r.status && r.status >= 400;

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const dayOf = dayKey;
/** A bulk action is one press, but its calls span minutes: label it with the day. */
export const runLabel = (r: Row) => (r.run_label ? `${r.run_label} · ${dayKey(r.created_at)}` : "Single action");

export function totals(rows: Row[]) {
  return rows.reduce(
    (a, r) => ({
      tokens: a.tokens + (r.total_tokens ?? 0),
      input: a.input + (r.input_tokens ?? 0),
      output: a.output + (r.output_tokens ?? 0),
      cost: a.cost + Number(r.cost_usd ?? 0),
      failed: a.failed + (isFailed(r) ? 1 : 0),
    }),
    { tokens: 0, input: 0, output: 0, cost: 0, failed: 0 },
  );
}

// ---------- why calls failed ----------

/** Groups failed calls by what they were doing and what the provider said. */
export function failureReasons(rows: Row[]) {
  const m = new Map<string, { operation: string; status: number | null; message: string; count: number }>();
  for (const r of rows.filter(isFailed)) {
    const message = (r.error_message ?? "").replace(/https?:\/\/\S+/g, "<url>").replace(/\s+/g, " ").trim().slice(0, 140);
    const key = `${r.operation}|${r.status}|${message}`;
    const cur = m.get(key) ?? { operation: r.operation, status: r.status, message, count: 0 };
    cur.count++;
    m.set(key, cur);
  }
  return Array.from(m.values()).sort((a, b) => b.count - a.count);
}

// ---------- CSV ----------

export function downloadCsv(filename: string, header: string[], lines: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...lines].map((l) => l.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function rowsToCsv(rows: Row[]): { header: string[]; lines: (string | number | null)[][] } {
  return {
    header: [
      "When", "Activity", "Product", "Store", "Retailer", "User", "Run", "Model",
      "Input tokens", "Output tokens", "Total tokens", "Cost USD", "Cost ZAR", "Result", "Error",
    ],
    lines: rows.map((r) => [
      new Date(r.created_at).toISOString(),
      r.operation,
      r.product_name ?? "",
      r.store_name ?? "",
      r.retailer_name ?? "",
      r.user_name ?? "",
      r.run_label ?? "",
      r.model ?? "",
      r.input_tokens ?? 0,
      r.output_tokens ?? 0,
      r.total_tokens ?? 0,
      Number(r.cost_usd ?? 0),
      displayRate ? Number((Number(r.cost_usd ?? 0) * displayRate).toFixed(4)) : "",
      isFailed(r) ? `Error ${r.status}` : "OK",
      r.error_message ?? "",
    ]),
  };
}
