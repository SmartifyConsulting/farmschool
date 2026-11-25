import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { getCourseExchangeRate } from "@/lib/currency.functions";
import { countryCurrency, convertedCoursePrice } from "@/lib/local-currency";

export function CoursePrice({ amount, currency }: { amount: number; currency: string }) {
  const { user } = useAuth();
  const preference = useQuery({
    queryKey: ["profile", user?.id, "currency"],
    enabled: !!user,
    staleTime: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("region")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return countryCurrency(data?.region);
    },
  });
  const preferred = preference.data ?? null;
  const lookup = useServerFn(getCourseExchangeRate);
  const exchange = useQuery({
    queryKey: ["course-currency", currency.toUpperCase(), preferred?.currency],
    enabled: amount > 0 && !!preferred && preferred.currency !== currency.toUpperCase(),
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: () => lookup({ data: { from: currency.toUpperCase(), to: preferred!.currency } }),
  });
  if (amount <= 0) return <>Free</>;
  const result = convertedCoursePrice(amount, currency, preferred, exchange.data?.rate ?? null);
  return (
    <span
      className="inline-block"
      title={
        result.estimated
          ? "Estimated using exchange rates from " + exchange.data?.asOf.slice(0, 10)
          : undefined
      }
    >
      {result.estimated ? "≈ " : ""}
      {result.text}
      {result.estimated && (
        <span className="supporting-text mt-0.5 block font-normal text-muted-foreground">
          Charged {result.original} {currency.toUpperCase()}
        </span>
      )}
    </span>
  );
}
