import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Header, Sheet, CanvasHeading, useIsAdmin } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/lti")({
  component: LtiPlatforms,
  head: () =>
    pageMeta("LTI platforms — Plusticity", "Register platforms that can launch Plusticity courses via LTI 1.3."),
});

type Platform = {
  id: string;
  name: string;
  issuer: string;
  client_id: string;
  deployment_id: string;
  auth_login_url: string;
  auth_token_url: string;
  key_set_url: string;
  default_course_id: string | null;
  enabled: boolean;
  created_at: string;
};
type Draft = {
  name: string;
  issuer: string;
  client_id: string;
  deployment_id: string;
  auth_login_url: string;
  auth_token_url: string;
  key_set_url: string;
  default_course_id: string;
  enabled: boolean;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  issuer: "",
  client_id: "",
  deployment_id: "",
  auth_login_url: "",
  auth_token_url: "",
  key_set_url: "",
  default_course_id: "",
  enabled: true,
};

function validDraft(d: Draft): string | null {
  if (!d.name.trim()) return "Give this platform a name.";
  if (!d.issuer.trim() || !d.client_id.trim() || !d.deployment_id.trim())
    return "Issuer, client ID and deployment ID are required.";
  if (![d.auth_login_url, d.auth_token_url, d.key_set_url].every((u) => /^https:\/\//.test(u)))
    return "All three endpoint URLs must start with https://.";
  return null;
}

function PlatformForm({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Input placeholder="Name (e.g. Our Moodle)" value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
      <Input placeholder="Deployment ID" value={draft.deployment_id} onChange={(e) => onChange({ ...draft, deployment_id: e.target.value })} />
      <Input placeholder="Issuer (iss)" value={draft.issuer} onChange={(e) => onChange({ ...draft, issuer: e.target.value })} className="sm:col-span-2" />
      <Input placeholder="Client ID" value={draft.client_id} onChange={(e) => onChange({ ...draft, client_id: e.target.value })} className="sm:col-span-2" />
      <Input placeholder="Auth login URL (https://...)" value={draft.auth_login_url} onChange={(e) => onChange({ ...draft, auth_login_url: e.target.value })} className="sm:col-span-2" />
      <Input placeholder="Auth token URL (https://...)" value={draft.auth_token_url} onChange={(e) => onChange({ ...draft, auth_token_url: e.target.value })} className="sm:col-span-2" />
      <Input placeholder="Key set (JWKS) URL (https://...)" value={draft.key_set_url} onChange={(e) => onChange({ ...draft, key_set_url: e.target.value })} className="sm:col-span-2" />
      <Input placeholder="Default course ID (optional, UUID)" value={draft.default_course_id} onChange={(e) => onChange({ ...draft, default_course_id: e.target.value })} className="sm:col-span-2" />
    </div>
  );
}

function LtiPlatforms() {
  const { user, ready } = useAuth();
  const admin = useIsAdmin();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [creating, setCreating] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<({ id: string } & Draft) | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-lti-platforms"] });

  const { data: platforms = [], isLoading, error } = useQuery({
    queryKey: ["admin-lti-platforms"],
    enabled: admin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lti_list_platforms");
      if (error) throw error;
      return (data ?? []) as Platform[];
    },
  });

  const save = async (id: string | null, draft: Draft) => {
    const err = validDraft(draft);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("lti_save_platform", {
        _id: id,
        _name: draft.name.trim(),
        _issuer: draft.issuer.trim(),
        _client_id: draft.client_id.trim(),
        _deployment_id: draft.deployment_id.trim(),
        _auth_login_url: draft.auth_login_url.trim(),
        _auth_token_url: draft.auth_token_url.trim(),
        _key_set_url: draft.key_set_url.trim(),
        _default_course_id: draft.default_course_id.trim() || null,
        _enabled: draft.enabled,
      });
      if (error) throw error;
      toast.success(id ? "Platform updated." : "Platform registered.");
      setCreating(null);
      setEditing(null);
      refresh();
    } catch (error) {
      toast.error(friendlyError(error, "Could not save this platform."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: Platform) => {
    if (!(await confirm({ title: "Delete this platform?", description: `"${p.name}" will no longer be able to launch Plusticity.`, confirmLabel: "Delete", tone: "danger" })))
      return;
    const { error } = await supabase.rpc("lti_delete_platform", { _id: p.id });
    if (error) {
      toast.error(friendlyError(error, "Could not delete this platform."));
      return;
    }
    toast.success("Platform deleted.");
    refresh();
  };

  return (
    <Phone>
      <Header />
      <Sheet>
        <div className="mx-auto max-w-4xl space-y-4 pb-10">
          <CanvasHeading eyebrow="Admin" title="LTI platforms" />
          {!ready ? (
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
                A launch only signs in an existing Plusticity account matched by email — it never creates
                one. Register the platform's login/token/JWKS endpoints here, then point the platform's
                tool configuration at <code>/api/lti/login</code> for login and <code>/api/lti/launch</code>{" "}
                for the redirect URI.
              </p>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setCreating({ ...EMPTY_DRAFT })}>
                  <Plus className="h-4 w-4" /> Register platform
                </Button>
              </div>
              {creating && (
                <div className="space-y-3 rounded-2xl border border-border p-4">
                  <p className="font-semibold">New platform</p>
                  <PlatformForm draft={creating} onChange={setCreating} />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => save(null, creating)}>
                      {busy ? "Saving…" : "Register"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setCreating(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {friendlyError(error, "Could not load platforms.")}
                </p>
              )}
              {!isLoading && !error && !platforms.length && (
                <p className="py-8 text-sm text-muted-foreground">No LTI platforms registered yet.</p>
              )}
              <div className="space-y-2">
                {platforms.map((p) => (
                  <div key={p.id} className={`rounded-2xl border border-border p-4 ${p.enabled ? "" : "opacity-60"}`}>
                    {editing?.id === p.id ? (
                      <div className="space-y-3">
                        <PlatformForm draft={editing} onChange={(d) => setEditing({ ...d, id: p.id })} />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={busy} onClick={() => save(p.id, editing)}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold">
                            {p.name}
                            {!p.enabled && (
                              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                Disabled
                              </span>
                            )}
                          </p>
                        </div>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          Issuer: {p.issuer} · Client: {p.client_id} · Deployment: {p.deployment_id}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEditing({
                                id: p.id,
                                name: p.name,
                                issuer: p.issuer,
                                client_id: p.client_id,
                                deployment_id: p.deployment_id,
                                auth_login_url: p.auth_login_url,
                                auth_token_url: p.auth_token_url,
                                key_set_url: p.key_set_url,
                                default_course_id: p.default_course_id ?? "",
                                enabled: p.enabled,
                              })
                            }
                          >
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" className="text-destructive" onClick={() => remove(p)}>
                            Delete
                          </Button>
                        </div>
                      </>
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
