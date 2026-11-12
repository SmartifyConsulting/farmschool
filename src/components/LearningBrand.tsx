import { createContext, useContext, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import {
  brandContext,
  learningBrandSchema,
  safeBrandLogo,
  type LearningBrand,
} from "@/lib/learning-brand";

export const LearningBrandContext = createContext<LearningBrand | null>(null);
export const useLearningBrand = () => useContext(LearningBrandContext);
export function useLearningBrandForPath(path: string) {
  const { user } = useAuth();
  const scope = brandContext(path);
  const query = useQuery({
    queryKey: ["learning-shell-brand", user?.id, scope.course, scope.organization],
    enabled: !!user && !!(scope.course || scope.organization),
    staleTime: 15000,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("learning_shell_brand", {
        _course: scope.course,
        _organization: scope.organization,
      });
      if (error) throw error;
      return data === null ? null : learningBrandSchema.parse(data);
    },
  });
  return user && (scope.course || scope.organization) && !query.isError
    ? (query.data ?? null)
    : null;
}
export function OrganizationLogo({
  brand,
  mobile = false,
}: {
  brand: LearningBrand;
  mobile?: boolean;
}) {
  const url = safeBrandLogo(brand.logo);
  const [failed, setFailed] = useState(false);
  return url && !failed ? (
    <img
      src={url}
      alt={brand.name + " logo"}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      className={
        mobile
          ? "max-h-14 max-w-full rounded bg-white p-1 object-contain"
          : "max-h-36 max-w-full rounded-lg bg-white p-2 object-contain"
      }
    />
  ) : (
    <span
      className={
        mobile
          ? "break-words text-base font-semibold"
          : "break-words text-center text-xl font-semibold"
      }
    >
      {brand.name}
    </span>
  );
}
