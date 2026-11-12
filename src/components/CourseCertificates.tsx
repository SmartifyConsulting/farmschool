import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { certificateStatus } from "@/lib/certificates";
import { credentialCode } from "@/lib/studio";
import { CourseCertificatePolicy } from "@/components/CertificateLifecycle";

const reportSchema = z.object({
  total: z.number().int().nonnegative(),
  records: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      learner_name: z.string(),
      issued_at: z.string(),
      course_version: z.number().nullable(),
      validated_at: z.string().nullable(),
      revoked_at: z.string().nullable(),
      revocation_reason: z.string().nullable(),
      expires_at: z.string().nullable(),
    }),
  ),
});

export function CourseCertificates({ courseId }: { courseId: string }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const report = useQuery({
    queryKey: ["course-certificates", courseId, user?.id, page],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("course_certificates", {
        _course: courseId,
        _offset: page * 50,
        _limit: 50,
      });
      if (error) throw error;
      return reportSchema.parse(data);
    },
  });
  const revoke = async () => {
    if (!selected || busy) return;
    if (reason.trim().length < 20) {
      toast.error("Give a reason of at least 20 characters.");
      return;
    }
    if (
      !(await confirm({
        title: "Revoke this certificate?",
        description:
          "The learner will see your reason. This cannot be undone, and the certificate will stop counting toward course prerequisites and compliance.",
        tone: "danger",
        confirmLabel: "Revoke certificate",
      }))
    )
      return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("revoke_studio_certificate", {
        _certificate: selected,
        _reason: reason.trim(),
      });
      if (error) throw error;
      setSelected("");
      setReason("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["course-certificates", courseId] }),
        qc.invalidateQueries({ queryKey: ["course-gradebook", courseId] }),
        qc.invalidateQueries({ queryKey: ["certificates"] }),
      ]);
      toast.success("Certificate revoked. Its original record has been kept.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-8 space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">Course certificates</h2>
      <CourseCertificatePolicy courseId={courseId} />
      <p className="text-sm text-muted-foreground">
        Certificates retain their issued course version when the course changes. Revoke only with a
        clear reason; the original record is kept.
      </p>
      {report.isPending ? (
        <p>Loading certificates…</p>
      ) : report.isError ? (
        <p role="alert">Could not load course certificates.</p>
      ) : (
        <>
          {!report.data.records.length && <p className="text-sm">No certificates on this page.</p>}
          {report.data.records.map((record) => (
            <article key={record.id} className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">
                {record.learner_name} · {credentialCode(record.id)}
              </p>
              <p className="text-xs text-muted-foreground">
                {certificateStatus(record)} · Issued{" "}
                {new Date(record.issued_at).toLocaleDateString()}
                {record.course_version !== null ? ` · Version ${record.course_version}` : ""}
                {record.expires_at ? ` · Valid until ${new Date(record.expires_at).toLocaleDateString()}` : ""}
              </p>
              {record.revoked_at ? (
                <p className="whitespace-pre-wrap text-sm text-destructive">
                  Revoked {new Date(record.revoked_at).toLocaleDateString()}:{" "}
                  {record.revocation_reason}
                </p>
              ) : selected === record.id ? (
                <div className="space-y-2">
                  <Textarea
                    aria-label="Certificate revocation reason"
                    value={reason}
                    maxLength={2000}
                    disabled={busy}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explain why this certificate must be revoked (20–2000 characters)."
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="destructive" disabled={busy} onClick={revoke}>
                      Revoke certificate
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setSelected("");
                        setReason("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setSelected(record.id);
                    setReason("");
                  }}
                >
                  Revoke
                </Button>
              )}
            </article>
          ))}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={page === 0 || busy}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {page + 1} · {report.data.total} certificates
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={(page + 1) * 50 >= report.data.total || busy}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
