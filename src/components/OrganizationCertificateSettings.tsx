import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { friendlyError } from "@/lib/friendly-error";

type Template = {
  heading: string;
  signatory_name: string;
  signatory_title: string;
  footer: string;
  version: number;
};
export function OrganizationCertificateSettings({ organizationId }: { organizationId: string }) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["organization-certificate-settings", organizationId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_certificate_settings")
        .select("heading,signatory_name,signatory_title,footer,version")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">Customer certificate wording</h2>
      <p className="text-sm text-muted-foreground">
        New verified awards use the customer's workspace name, logo and colour. The original issuer
        and wording are retained on awarded certificates when settings change.
      </p>
      {query.isPending ? (
        <p>Loading certificate wording…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>Certificate settings could not be loaded.</p>
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <Editor
          key={organizationId + ":" + (query.data?.version ?? 0)}
          organizationId={organizationId}
          initial={query.data}
        />
      )}
    </section>
  );
}
function Editor({ organizationId, initial }: { organizationId: string; initial: Template | null }) {
  const [heading, setHeading] = useState(initial?.heading ?? "Certificate of Completion");
  const [signatory, setSignatory] = useState(initial?.signatory_name ?? "");
  const [title, setTitle] = useState(initial?.signatory_title ?? "");
  const [footer, setFooter] = useState(initial?.footer ?? "");
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const qc = useQueryClient();
  const save = async () => {
    if (busy || !heading.trim()) return;
    if (
      !(await confirm({
        title: "Save wording for new certificates?",
        description:
          "New awards for this customer's courses, or shared courses completed through its portal, will use these details. Existing awards and renewals retain their original issuer and wording. Signatory details are printed text, not a digital signature.",
        confirmLabel: "Save certificate wording",
      }))
    )
      return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_organization_certificate_settings", {
        _organization: organizationId,
        _heading: heading.trim(),
        _signatory_name: signatory.trim(),
        _signatory_title: title.trim(),
        _footer: footer.trim(),
        _expected: initial?.version ?? 0,
      });
      if (error) throw error;
      await qc.invalidateQueries({
        queryKey: ["organization-certificate-settings", organizationId],
      });
      toast.success("Certificate wording saved.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        Certificate heading
        <Input
          value={heading}
          maxLength={200}
          onChange={(event) => setHeading(event.target.value)}
        />
      </label>
      <label className="block text-sm">
        Signatory name (optional)
        <Input
          value={signatory}
          maxLength={200}
          onChange={(event) => setSignatory(event.target.value)}
        />
      </label>
      <label className="block text-sm">
        Signatory title (optional)
        <Input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="block text-sm">
        Footer (optional)
        <Textarea
          value={footer}
          maxLength={1000}
          onChange={(event) => setFooter(event.target.value)}
        />
      </label>
      <div className="rounded-xl border p-4 text-center" aria-label="Certificate wording preview">
        <p className="font-semibold">{heading}</p>
        <p className="my-4 text-sm text-muted-foreground">
          Learner name · Course title · Verified award details
        </p>
        <p>{signatory}</p>
        <p className="text-sm">{title}</p>
        <p className="mt-3 whitespace-pre-wrap text-xs">{footer}</p>
      </div>
      <Button disabled={busy || !heading.trim()} onClick={save}>
        {busy ? "Saving…" : "Save certificate wording"}
      </Button>
    </div>
  );
}
