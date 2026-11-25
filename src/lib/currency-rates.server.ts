type Rates = { rates: Record<string, number>; asOf: string; at: number };
let cache: Rates | null = null;
let pending: Promise<Rates | null> | null = null;
const TTL = 24 * 60 * 60 * 1000;

async function loadRates(): Promise<Rates | null> {
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      result?: string;
      base_code?: string;
      rates?: Record<string, number>;
      time_last_update_unix?: number;
    };
    if (
      data.result !== "success" ||
      data.base_code !== "USD" ||
      !data.rates ||
      data.rates["USD"] !== 1 ||
      !data.time_last_update_unix
    )
      return null;
    const asOf = new Date(data.time_last_update_unix * 1000).toISOString();
    if (Date.now() - data.time_last_update_unix * 1000 > 48 * 60 * 60 * 1000) return null;
    cache = { rates: data.rates, asOf, at: Date.now() };
    return cache;
  } catch {
    return null;
  }
}

export async function courseExchangeRate(
  from: string,
  to: string,
): Promise<{ rate: number; asOf: string } | null> {
  if (from === to) return { rate: 1, asOf: new Date().toISOString() };
  if (!cache || Date.now() - cache.at >= TTL) {
    pending ??= loadRates().finally(() => {
      pending = null;
    });
    if (!(await pending)) return null;
  }
  const rates = cache!.rates;
  const rate = Number(rates[to]) / Number(rates[from]);
  return Number.isFinite(rate) && rate > 0 ? { rate, asOf: cache!.asOf } : null;
}
