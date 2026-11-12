import { createContext, useContext, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import {
  brandContext,
  learningBrandSchema,
  safeBrandLogo,
  type LearningBrand,
} from "@/lib/learning-brand";
import { publicPortalSchema, readPortalSlug } from "@/lib/customer-portal";

export const LearningBrandContext = createContext<LearningBrand | null>(null);
export const useLearningBrand = () => useContext(LearningBrandContext);
export function useLearningBrandForPath(path: string, portalSearch?: string) {
  const { user, ready } = useAuth();
  const scope = brandContext(path);
  const routeSlug = readPortalSlug(path.match(/^\/portal\/([^/]+)\/?$/)?.[1]);
  const publicSlug = routeSlug ?? (["/auth", "/forgot-password", "/reset-password"].includes(path) ? portalSearch : undefined);
  const enabled = !!publicSlug || (!!user && !!(scope.course || scope.organization || portalSearch));
  const query = useQuery({
    queryKey: ["learning-shell-brand", user?.id, scope.course, scope.organization, publicSlug, portalSearch],
    enabled,
    staleTime: 15000,
    refetchInterval: 30000,
    queryFn: async () => {
      if (publicSlug) {
        const { data, error } = await supabase.rpc("organization_portal", { _slug: publicSlug });
        if (error) throw error;
        return data === null ? null : publicPortalSchema.parse(data).brand;
      }
      if (portalSearch && !scope.organization) {
        const { data, error } = await supabase.rpc("portal_learning_brand", { _slug: portalSearch, _course: scope.course });
        if (error) throw error;
        return data === null ? null : learningBrandSchema.parse(data);
      }
      const { data, error } = await supabase.rpc("learning_shell_brand", {
        _course: scope.course,
        _organization: scope.organization,
      });
      if (error) throw error;
      return data === null ? null : learningBrandSchema.parse(data);
    },
  });
  const portal = publicSlug ?? (!scope.organization ? portalSearch : undefined);
  return {
    brand: enabled && !query.isError ? (query.data ?? null) : null,
    portal,
    isPending: (enabled && query.isPending) || (!!portal && !ready),
    requiresSignIn: !!portal && !publicSlug && ready && !user,
    retry: () => query.refetch(),
  };
}
export function BrandHome({ brand, children, className = "" }: { brand: LearningBrand; children: ReactNode; className?: string }) {
  return brand.portalSlug ? <Link to="/portal/$slug" params={{ slug: brand.portalSlug }} className={className} aria-label={brand.name + " training portal"}>{children}</Link> : <Link to="/organizations/$id" params={{ id: brand.id }} className={className} aria-label={brand.name + " workspace"}>{children}</Link>;
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
