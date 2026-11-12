import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { publicPortalSchema, readPortalSlug } from "@/lib/customer-portal";

export function useCustomerPortal(value: string | undefined) {
  const slug = readPortalSlug(value);
  return useQuery({
    queryKey: ["customer-portal", slug],
    enabled: !!slug,
    staleTime: 15000,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("organization_portal", { _slug: slug! });
      if (error) throw error;
      return data === null ? null : publicPortalSchema.parse(data);
    },
  });
}
