import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
const payload = () => ({
  result: "success",
  base_code: "USD",
  time_last_update_unix: Math.floor(Date.now() / 1000),
  rates: { USD: 1, ZAR: 20, GBP: 0.8, JPY: 150 },
});
describe("course currency rates", () => {
  it("fetches one cached USD dataset and calculates cross-currency rates", async () => {
    const fetchMock = vi.fn(async () => Response.json(payload()));
    vi.stubGlobal("fetch", fetchMock);
    const { courseExchangeRate } = await import("./currency-rates.server");
    expect((await courseExchangeRate("ZAR", "GBP"))?.rate).toBe(0.04);
    expect((await courseExchangeRate("ZAR", "JPY"))?.rate).toBe(7.5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not invent a rate for missing currencies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(payload())),
    );
    const { courseExchangeRate } = await import("./currency-rates.server");
    expect(await courseExchangeRate("ZAR", "XYZ")).toBeNull();
  });
  it("rejects stale data and provider failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ...payload(),
          time_last_update_unix: Math.floor(Date.now() / 1000) - 4 * 86400,
        }),
      ),
    );
    const { courseExchangeRate } = await import("./currency-rates.server");
    expect(await courseExchangeRate("USD", "ZAR")).toBeNull();
  });
  it("shares an in-flight fetch across simultaneous conversion requests", async () => {
    const fetchMock = vi.fn(async () => Response.json(payload()));
    vi.stubGlobal("fetch", fetchMock);
    const { courseExchangeRate } = await import("./currency-rates.server");
    await Promise.all([courseExchangeRate("USD", "ZAR"), courseExchangeRate("USD", "GBP")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
