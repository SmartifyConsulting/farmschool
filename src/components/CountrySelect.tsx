import type { SelectHTMLAttributes } from "react";
import { COUNTRIES } from "@/lib/countries";
import { cn } from "@/lib/utils";

export function CountrySelect({
  value,
  className,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "value"> & { value: string }) {
  return (
    <select
      {...props}
      value={value}
      autoComplete="country-name"
      className={cn(
        "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
    >
      <option value="">Choose your country</option>
      {value && !COUNTRIES.includes(value) && (
        <option value={value}>{value} (current value)</option>
      )}
      {COUNTRIES.map((country) => (
        <option key={country} value={country}>
          {country}
        </option>
      ))}
    </select>
  );
}
