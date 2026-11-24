import { rpcArgs } from "@/lib/rpc-args";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Header, Sheet, CanvasHeading, useIsAdmin } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/admin/organizations")({
  component: AdminOrganizations,
  head: () =>
    pageMeta("Organizations — Plusticity", "Link organizations into a parent/child reporting hierarchy."),
});

type Org = { id: string; name: string; parent_id: string | null };

function AdminOrganizations() {
  const { user, ready } = useAuth();
  const admin = useIsAdmin();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: orgs = [], isLoading, error } = useQuery({
    queryKey: ["admin-organizations"],
    enabled: admin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_organizations");
      if (error) throw error;
      return (data ?? []) as Org[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-organizations"] });

  const setParent = async (orgId: string, parentId: string) => {
    try {
      const { error } = await supabase.rpc("admin_set_organization_parent", rpcArgs("admin_set_organization_parent", {
        _organization: orgId,
        _parent: parentId || null,
      }));
      if (error) throw error;
      toast.success("Updated.");
      refresh();
    } catch (error) {
      toast.error(friendlyError(error, "Could not update this organization's parent."));
    }
  };

  const createOrg = async () => {
    if (busy || newName.trim().length < 2) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_organization", rpcArgs("save_organization", {
        _organization: crypto.randomUUID(),
        _name: newName.trim(),
        _welcome: "",
        _color: "#2765BC",
        _logo: null,
        _expected: 0,
      }));
      if (error) throw error;
      toast.success("Organization created.");
      setCreating(false);
      setNewName("");
      refresh();
    } catch (error) {
      toast.error(friendlyError(error, "Could not create this organization."));
    } finally {
      setBusy(false);
    }
  };

  const saveRename = async (orgId: string) => {
    if (busy || renameValue.trim().length < 2) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_rename_organization" as never, {
        _organization: orgId,
        _name: renameValue.trim(),
      } as never);
      if (error) throw error;
      toast.success("Renamed.");
      setRenaming(null);
      refresh();
    } catch (error) {
      toast.error(friendlyError(error, "Could not rename this organization."));
    } finally {
      setBusy(false);
    }
  };

  const removeOrg = async (o: Org) => {
    const ok = await confirm({
      tone: "danger",
      title: "Delete this organization?",
      confirmLabel: "Delete organization",
      description: `"${o.name}" and its member links will be permanently removed. This can't be undone.`,
    });
    if (!ok) return;
    try {
      const { error } = await supabase.rpc("admin_delete_organization" as never, { _organization: o.id } as never);
      if (error) throw error;
      toast.success("Organization deleted.");
      refresh();
    } catch (error) {
      toast.error(friendlyError(error, "Could not delete this organization."));
    }
  };

  return (
    <Phone>
      <Header />
      <Sheet wide>
        <CanvasHeading eyebrow="Admin" title="Organizations" />
        <AdminNav />
        <div className="mx-auto max-w-4xl space-y-4 pb-10 pt-4">
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
              <p className="text-sm text-muted-foreground">
                Set a parent organization to give that parent's managers read-only visibility into this
                org's cohort and progress reports. It grants no management rights in the child org, and
                takes effect only for the link you create here.
              </p>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" /> New organization
                </Button>
              </div>
              {creating && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Organization name"
                    aria-label="New organization name"
                    maxLength={200}
                    className="max-w-xs"
                  />
                  <Button size="sm" disabled={busy || newName.trim().length < 2} onClick={createOrg}>
                    {busy ? "Creating…" : "Create"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName(""); }}>
                    Cancel
                  </Button>
                </div>
              )}
              {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {friendlyError(error, "Could not load organizations.")}
                </p>
              )}
              <div className="space-y-2">
                {orgs.map((o) => (
                  <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                    {renaming === o.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          aria-label="Rename organization"
                          maxLength={200}
                          className="max-w-xs"
                        />
                        <Button size="sm" disabled={busy || renameValue.trim().length < 2} onClick={() => saveRename(o.id)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <span className="font-semibold">{o.name}</span>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        Parent org
                        <select
                          className="rounded-md border bg-background p-1.5"
                          value={o.parent_id ?? ""}
                          onChange={(e) => setParent(o.id, e.target.value)}
                        >
                          <option value="">None</option>
                          {orgs
                            .filter((candidate) => candidate.id !== o.id)
                            .map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      {renaming !== o.id && (
                        <Button size="sm" variant="outline" onClick={() => { setRenaming(o.id); setRenameValue(o.name); }}>
                          Rename
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => removeOrg(o)}>
                        Delete
                      </Button>
                    </div>
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
