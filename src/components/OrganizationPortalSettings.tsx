import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { portalPath, portalSlugSchema } from "@/lib/customer-portal";

type Settings = { slug: string; enabled: boolean; public_message: string; version: number; agriculture_only: boolean };

export function OrganizationPortalSettings({ organizationId }: { organizationId: string }) {
  const { user } = useAuth();
  const settings = useQuery({
    queryKey: ["organization-portal-settings", organizationId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_portals")
        .select("slug,enabled,public_message,version,agriculture_only")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">Customer training portal</h2>
      <p className="text-sm text-muted-foreground">
        Give learners a sign-in page, catalogue and learning area with your workspace name, logo and
        colours. Plusticity manages training, assessments and results.
      </p>
      {settings.isPending ? (
        <p>Loading portal settings…</p>
      ) : settings.isError ? (
        <div role="alert">
          <p>Portal settings could not be loaded.</p>
          <Button variant="outline" onClick={() => settings.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <PortalEditor
          key={organizationId + ":" + (settings.data?.version ?? 0)}
          organizationId={organizationId}
          initial={settings.data}
        />
      )}
    </section>
  );
}

function PortalEditor({
  organizationId,
  initial,
}: {
  organizationId: string;
  initial: Settings | null;
}) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [agricultureOnly, setAgricultureOnly] = useState(initial?.agriculture_only ?? false);
  const [message, setMessage] = useState(
    initial?.public_message ?? "Sign in to access your training.",
  );
  const [busy, setBusy] = useState(false);
  const parsed = portalSlugSchema.safeParse(slug);
  const path = parsed.success ? portalPath(parsed.data) : null;
  const save = async () => {
    if (busy || !parsed.success) return;
    if (
      !(await confirm({
        title: enabled ? "Publish this training portal?" : "Save this portal as disabled?",
        description: enabled
          ? `Your workspace name, logo, colour and this public welcome message will be visible at ${path}. ${agricultureOnly ? "Only agriculture-classified training will appear, including published public agriculture courses. Their catalogue details may also appear on a connected customer website." : "Training is limited to your workspace inventory."} Your private workspace welcome and member details remain private. Learners still need membership and the usual course access. The chosen address is permanent.`
          : "The address stays reserved. Visitors will not see the portal while it is disabled. Existing training records remain available through Plusticity.",
        confirmLabel: "Save portal",
      }))
    )
      return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_organization_portal", {
        _organization: organizationId,
        _slug: parsed.data,
        _enabled: enabled,
        _message: message.trim(),
        _expected: initial?.version ?? 0,
        _agriculture_only: agricultureOnly,
      });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["organization-portal-settings", organizationId] }),
        qc.invalidateQueries({ queryKey: ["customer-portal"] }),
        qc.invalidateQueries({ queryKey: ["learning-shell-brand"] }),
      ]);
      toast.success("Customer portal saved.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        Portal address
        <Input
          value={slug}
          disabled={busy || !!initial}
          minLength={3}
          maxLength={63}
          placeholder="your-company"
          onChange={(event) => setSlug(event.target.value.toLowerCase())}
        />
        <span className="text-xs text-muted-foreground">
          3–63 lowercase letters, numbers or hyphens; begin and end with a letter or number. The
          address cannot be changed after saving.
        </span>
      </label>
      {path && <p className="break-all text-sm">{path}</p>}
      <label className="block text-sm">
        Public welcome message
        <Textarea
          value={message}
          maxLength={2000}
          disabled={busy}
          onChange={(event) => setMessage(event.target.value)}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={agricultureOnly} disabled={busy} onChange={event => setAgricultureOnly(event.target.checked)} />
        Agriculture training only, including published public agriculture courses
      </label>
      <p className="text-xs text-muted-foreground">This uses the course's classified topic. Unknown and other-industry topics are excluded. Content must still be reviewed and accurately classified before publishing.</p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Publish the portal and its branding
      </label>
      <p className="text-xs text-muted-foreground">
        Changes to workspace branding also update the public portal. Registering an account never
        automatically joins this workspace.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy || !parsed.success} onClick={save}>
          {busy ? "Saving…" : "Save portal"}
        </Button>
        {initial?.enabled && (
          <>
            <Button asChild variant="outline">
              <Link to="/portal/$slug" params={{ slug: initial.slug }}>
                Open portal
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    new URL(portalPath(initial.slug), window.location.origin).href,
                  );
                  toast.success("Portal address copied.");
                } catch (error) {
                  toast.error(friendlyError(error));
                }
              }}
            >
              Copy portal address
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
