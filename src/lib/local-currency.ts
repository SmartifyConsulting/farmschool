import { COUNTRY_CODES } from "./countries";
import { COUNTRY_CURRENCIES } from "./country-currencies";

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const countryLookup = new Map(
  COUNTRY_CODES.split(" ").flatMap(
    (code) =>
      [
        [code.toLowerCase(), code],
        [(countryNames.of(code) ?? code).toLowerCase(), code],
      ] as [string, string][],
  ),
);

export function countryCurrency(
  country: string | null | undefined,
): { country: string; currency: string; locale: string } | null {
  const code = countryLookup.get(country?.trim().toLowerCase() ?? "");
  const currency = code ? COUNTRY_CURRENCIES[code] : undefined;
  return code && currency ? { country: code, currency, locale: "en-" + code } : null;
}

export function minorUnitFactor(currency: string): number {
  if (["ISK", "UGX"].includes(currency.toUpperCase())) return 100;
  try {
    return (
      10 **
      (new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2)
    );
  } catch {
    return 100;
  }
}

export function displayAmount(
  amount: number,
  currency: string,
  locale = currency.toUpperCase() === "ZAR" ? "en-ZA" : "en-US",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

export function convertedCoursePrice(
  priceMinor: number,
  base: string,
  preferred: ReturnType<typeof countryCurrency>,
  rate: number | null,
): { text: string; estimated: boolean; original: string } {
  const amount = priceMinor / minorUnitFactor(base);
  const original = displayAmount(amount, base);
  if (
    !preferred ||
    preferred.currency === base.toUpperCase() ||
    !rate ||
    !Number.isFinite(rate) ||
    rate <= 0
  )
    return {
      text:
        preferred?.currency === base.toUpperCase()
          ? displayAmount(amount, base, preferred.locale)
          : original,
      estimated: false,
      original,
    };
  return {
    text: displayAmount(amount * rate, preferred.currency, preferred.locale),
    estimated: true,
    original,
  };
}
