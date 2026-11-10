import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";
import { toast } from "sonner";

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
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ id: string; limit: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const saveLimit = async (id: string) => {
    const limit = Number(editing?.limit);
    if (!editing || !Number.isFinite(limit) || limit < 1) {
      toast.error("Enter a valid daily limit.");
      return;
    }
    setBusyId(id);
    const { error } = await supabase.rpc("admin_update_api_key", {
      _id: id,
      _daily_limit: Math.round(limit),
    });
    setBusyId(null);
    if (error) {
      toast.error(friendlyError(error, "Could not update this key."));
      return;
    }
    toast.success("Daily limit updated.");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["admin-api-connections"] });
  };

  const revokeKey = async (id: string, name: string) => {
    if (
      !(await confirm({
        title: "Revoke this API key?",
        description: `"${name}" will stop working immediately. This cannot be undone.`,
        confirmLabel: "Revoke",
        tone: "danger",
      }))
    )
      return;
    setBusyId(id);
    const { error } = await supabase.rpc("admin_revoke_api_key", { _id: id });
    setBusyId(null);
    if (error) {
      toast.error(friendlyError(error, "Could not revoke this key."));
      return;
    }
    toast.success("Key revoked.");
    qc.invalidateQueries({ queryKey: ["admin-api-connections"] });
  };

  return (
    <Phone>
      <Header />
      <Sheet>
        <div className="mx-auto max-w-4xl space-y-4 pb-10">
          <CanvasHeading eyebrow="Admin" title="API connections" />
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
              <AdminNav />
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
                    {editing?.id === k.id ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          value={editing.limit}
                          onChange={(e) => setEditing({ id: k.id, limit: e.target.value })}
                          aria-label={`Daily limit for ${k.name}`}
                          className="w-28"
                        />
                        <Button size="sm" disabled={busyId === k.id} onClick={() => saveLimit(k.id)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!busyId}
                          onClick={() => setEditing({ id: k.id, limit: String(k.daily_limit) })}
                        >
                          Edit limit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          disabled={!!busyId}
                          onClick={() => revokeKey(k.id, k.name)}
                        >
                          Revoke
                        </Button>
                      </div>
                    )}
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
