import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/admin/api-connections")({
  component: ApiConnections,
  head: () =>
    pageMeta(
      "API connections — Plusticity",
      "Review active API key connections across all accounts.",
    ),
});

type KeyRow = {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  scopes: string[];
  daily_limit: number;
  usage_count: number;
  total_requests: number;
  revoked_at: string | null;
};

function ApiConnections() {
  const { user, ready } = useAuth();
  const { data: admin, isLoading: checking } = useQuery({
    queryKey: ["api-connections-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user!.id,
        _role: "admin",
      });
      if (error) throw error;
      return !!data;
    },
  });
  const {
    data: rows,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin-api-connections"],
    enabled: !!admin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select(
          "id, user_id, name, prefix, created_at, last_used_at, scopes, daily_limit, usage_count, total_requests, revoked_at",
        )
        .is("revoked_at", null)
        .order("last_used_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      const keys = (data ?? []) as KeyRow[];
      const userIds = [...new Set(keys.map((k) => k.user_id))];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds)
        : { data: [] as { user_id: string; full_name: string }[] };
      const names = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));
      return keys.map((k) => ({ ...k, ownerName: names.get(k.user_id) ?? "Unknown user" }));
    },
  });
  return (
    <Phone>
      <Header />
      <Sheet>
        <div className="mx-auto max-w-4xl space-y-4 pb-10">
          <CanvasHeading eyebrow="Administration" title="API connections" />
          {!ready || checking ? (
            <p className="text-sm text-muted-foreground">Checking permissions…</p>
          ) : !user ? (
            <p className="text-sm">
              <Link to="/auth" className="font-semibold text-primary">
                Sign in
              </Link>{" "}
              as an administrator.
            </p>
          ) : !admin ? (
            <p className="text-sm text-muted-foreground">Administrator access required.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Active API key connections across every account. Only the key's short prefix is ever
                stored or shown here — the full secret key is never retrievable after it was
                created, for anyone, including administrators.
              </p>
              {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  Could not load connections. Run the admin API connections migration in Supabase
                  first.
                </p>
              )}
              {!isLoading && !error && (rows?.length ?? 0) === 0 && (
                <p className="py-8 text-sm text-muted-foreground">No active API connections.</p>
              )}
              <div className="space-y-2">
                {rows?.map((k) => (
                  <div key={k.id} className="rounded-2xl border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">
                        {k.name}{" "}
                        <span className="font-mono text-xs text-muted-foreground">
                          {k.prefix}••••
                        </span>
                      </p>
                      <span className="text-xs text-muted-foreground">Owner: {k.ownerName}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Scopes: {k.scopes.join(", ")} · Daily limit {k.daily_limit} ·{" "}
                      {k.total_requests} total requests
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(k.created_at).toLocaleDateString()} · Last used{" "}
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "never"}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Sheet>
    </Phone>
  );
}
