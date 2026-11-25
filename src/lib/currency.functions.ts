import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { COUNTRY_CURRENCIES } from "./country-currencies";

const supported = new Set(Object.values(COUNTRY_CURRENCIES));
const currency = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine((code) => supported.has(code));
export const getCourseExchangeRate = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ from: currency, to: currency }).parse(input))
  .handler(async ({ data }) => {
    const { courseExchangeRate } = await import("./currency-rates.server");
    return courseExchangeRate(data.from, data.to);
  });
