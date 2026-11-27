import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { portalPath, portalSlugSchema } from "@/lib/customer-portal";

const settingsSchema = z
  .object({ slug: portalSlugSchema, enabled: z.boolean(), version: z.number().int() })
  .nullable();
type Settings = z.infer<typeof settingsSchema>;

export function AdminOrganizationPortalPath({
  organizationId,
  onClose,
}: {
  organizationId: string;
  onClose: () => void;
}) {
  const settings = useQuery({
    queryKey: ["admin-organization-portal", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "admin_organization_portal_settings" as never,
        { _organization: organizationId } as never,
      );
      if (error) throw error;
      return settingsSchema.parse(data);
    },
  });
  return (
    <div className="w-full space-y-3 border-t border-border pt-3">
      {settings.isPending ? (
        <p className="text-sm text-muted-foreground">Loading portal address…</p>
      ) : settings.isError ? (
        <div role="alert" className="space-y-2">
          <p>{friendlyError(settings.error, "Could not load this portal address.")}</p>
          <Button variant="outline" size="sm" onClick={() => settings.refetch()}>
            Retry
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <PathEditor
          key={organizationId + ":" + (settings.data?.version ?? 0)}
          organizationId={organizationId}
          initial={settings.data}
          onClose={onClose}
        />
      )}
    </div>
  );
}

function PathEditor({
  organizationId,
  initial,
  onClose,
}: {
  organizationId: string;
  initial: Settings;
  onClose: () => void;
}) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const confirm = useConfirm();
  const qc = useQueryClient();
  const parsed = portalSlugSchema.safeParse(slug);
  const changed = !!initial && parsed.success && parsed.data !== initial.slug;
  const save = async () => {
    if (saving.current || !initial || !parsed.success || !changed) return;
    saving.current = true;
    setBusy(true);
    try {
      if (
        !(await confirm({
          title: "Change this portal address?",
          description: `${portalPath(initial.slug)} will stop working and become available for reuse. The new address will be ${portalPath(parsed.data)}. Update links on connected websites. Training records, publishing status and catalogue scope stay the same.`,
          confirmLabel: "Change portal address",
        }))
      )
        return;
      const { error } = await supabase.rpc(
        "admin_change_organization_portal_path" as never,
        { _organization: organizationId, _slug: parsed.data, _expected: initial.version } as never,
      );
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-organization-portal", organizationId] }),
        qc.invalidateQueries({ queryKey: ["organization-portal-settings", organizationId] }),
        qc.invalidateQueries({ queryKey: ["customer-portal"] }),
        qc.invalidateQueries({ queryKey: ["learning-shell-brand"] }),
      ]);
      toast.success("Portal address updated.");
      onClose();
    } catch (error) {
      toast.error(friendlyError(error, "Could not change this portal address."));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  if (!initial)
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          No portal has been created. Create one in workspace Settings first.
        </p>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  return (
    <div className="space-y-3">
      <label className="block max-w-lg space-y-1 text-sm">
        Portal pathname
        <Input
          value={slug}
          onChange={(event) => setSlug(event.target.value.toLowerCase())}
          disabled={busy}
          minLength={3}
          maxLength={63}
          aria-invalid={!parsed.success}
        />
      </label>
      <p className="text-sm text-muted-foreground">
        3–63 lowercase letters, numbers or hyphens; begin and end with a letter or number. This
        edits the /portal/ pathname, not a custom domain.
      </p>
      {parsed.success && (
        <p className="break-all text-sm">
          {portalPath(parsed.data)}
          {initial.enabled ? "" : " · Portal disabled"}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !changed} onClick={save}>
          {busy ? "Saving…" : "Save portal address"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
