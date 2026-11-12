import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { CertificateDocument } from "@/components/CertificateDocument";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { certificateStatus } from "@/lib/certificates";

const reportSchema = z.object({
  total: z.number().int().nonnegative(),
  records: z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string(),
        source: z.string(),
        course_ref: z.string(),
        issued_at: z.string(),
        course_version: z.number().int().nullable(),
        validated_at: z.string().nullable(),
        revoked_at: z.string().nullable(),
        revocation_reason: z.string().nullable(),
        expires_at: z.string().nullable(),
      }),
    )
    .max(100),
});
export function PortalCertificates({ slug }: { slug: string }) {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const report = useQuery({
    queryKey: ["portal-certificates", user?.id, slug, page],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("portal_certificate_report", {
        _slug: slug,
        _offset: page * 24,
        _limit: 24,
      });
      if (error) throw error;
      return reportSchema.parse(data);
    },
  });
  const profile = useQuery({
    queryKey: ["portal-certificate-name", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const certificate = !report.isError
    ? report.data?.records.find((row) => row.id === selected)
    : null;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">My certificates</h2>
      {report.isPending ? (
        <p>Loading certificates…</p>
      ) : report.isError ? (
        <div role="alert">
          <p>Certificates could not be loaded. Check your portal membership or retry.</p>
          <Button variant="outline" onClick={() => report.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {report.data.total} certificates recorded for this training portal.
          </p>
          {report.data.records.map((row) => (
            <article
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
            >
              <div>
                <h3 className="font-semibold">{row.title}</h3>
                <p className="text-sm">
                  {certificateStatus(row)} · {new Date(row.issued_at).toLocaleDateString()}
                </p>
              </div>
              <Button variant="outline" onClick={() => setSelected(row.id)}>
                View certificate
              </Button>
            </article>
          ))}
          <div className="flex items-center gap-3">
            <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span>Page {page + 1}</span>
            <Button
              variant="outline"
              disabled={(page + 1) * 24 >= report.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
      <Dialog
        open={!!certificate}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-w-2xl print:max-w-none print:border-0 print:shadow-none">
          <DialogTitle className="sr-only">Certificate</DialogTitle>
          {certificate &&
            (profile.isPending ? (
              <p>Loading learner name…</p>
            ) : profile.isError ? (
              <div role="alert">
                <p>Could not load your name.</p>
                <Button variant="outline" onClick={() => profile.refetch()}>
                  Retry
                </Button>
              </div>
            ) : (
              <CertificateDocument
                key={certificate.id}
                certificate={certificate}
                learnerName={profile.data?.full_name || "Learner"}
              />
            ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
