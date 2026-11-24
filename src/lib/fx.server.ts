// US dollar -> South African rand, for showing the Token ledger in rand.
// AI providers bill in dollars, so the ledger stores dollars and converts
// for display. The rate is fetched from a free public source and cached
// for a few hours; if it can't be fetched, callers get null and keep
// showing dollars rather than guessing a rate.

const TTL_MS = 6 * 60 * 60 * 1000;
let cache: { rate: number; asOf: string; at: number } | null = null;

export type UsdZar = { rate: number; asOf: string };

export async function getUsdZarRate(): Promise<UsdZar | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return { rate: cache.rate, asOf: cache.asOf };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: ctrl.signal }).finally(() =>
      clearTimeout(timer),
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: { rates?: Record<string, number>; time_last_update_utc?: string } = await res.json();
    const rate = Number(json?.rates?.["ZAR"]);
    // Sanity bounds: a wildly wrong figure is worse than no figure.
    if (!Number.isFinite(rate) || rate < 5 || rate > 100) throw new Error("implausible rate");
    const asOf = json?.time_last_update_utc
      ? new Date(json.time_last_update_utc).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    cache = { rate, asOf, at: Date.now() };
    return { rate, asOf };
  } catch {
    // Keep serving the last good rate if the source is briefly unreachable.
    return cache ? { rate: cache.rate, asOf: cache.asOf } : null;
  }
}
