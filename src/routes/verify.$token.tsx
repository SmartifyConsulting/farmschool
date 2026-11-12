import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { CanvasHeading } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { certificateStatus } from "@/lib/certificates";
import { pageMeta } from "@/lib/page-meta";
import { certificateBrandSchema } from "@/lib/certificate-brand";
import { CertificateIssuer } from "@/components/CertificateDocument";

const verification = z.object({
  title: z.string(),
  learner_name: z.string(),
  source: z.string(),
  issued_at: z.string(),
  validated_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  course_version: z.number().nullable(),
  renewed_at: z.string().nullable(),
  issuer: certificateBrandSchema.nullable(),
});
export const Route = createFileRoute("/verify/$token")({
  head: () => ({
    ...pageMeta("Verify a certificate", "Check a shared training certificate."),
    meta: [
      ...pageMeta("Verify a certificate", "Check a shared training certificate.")
        .meta,
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: VerifyCertificate,
});
function VerifyCertificate() {
  const { token } = Route.useParams();
  const valid = z.string().uuid().safeParse(token).success;
  const result = useQuery({
    queryKey: ["public-certificate", token],
    enabled: valid,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("verify_certificate", { _token: token });
      if (error) throw error;
      return data === null ? null : verification.parse(data);
    },
  });
  const certificate = result.data;
  return (
    <main className="min-h-screen bg-muted px-5 py-10">
      <div className="mx-auto max-w-3xl rounded-2xl bg-card p-6 sm:p-10">
        <CanvasHeading title="Certificate verification" />
        {!valid || (result.isSuccess && !certificate) ? (
          <p>This verification link is unavailable or sharing has been disabled.</p>
        ) : result.isPending ? (
          <p>Checking certificate…</p>
        ) : result.isError ? (
          <p role="alert">Could not verify this certificate. Please try again.</p>
        ) : (
          certificate && (
            <article className="space-y-4 rounded-xl border p-6">
              {certificate.issuer && <CertificateIssuer key={token} brand={certificate.issuer} />}
              <p className="font-semibold">{certificateStatus(certificate)}</p>
              <h2 className="text-xl font-semibold">{certificate.title}</h2>
              <p>Awarded to {certificate.learner_name}</p>
              {certificate.issuer && <><p>{certificate.issuer.signatory_name}{certificate.issuer.signatory_title ? " · " + certificate.issuer.signatory_title : ""}</p><p className="whitespace-pre-wrap text-sm">{certificate.issuer.footer}</p></>}
              <p>Originally issued {new Date(certificate.issued_at).toLocaleDateString()}</p>
              {certificate.course_version !== null && (
                <p>Original course version {certificate.course_version}</p>
              )}
              {certificate.renewed_at && (
                <p>Renewed {new Date(certificate.renewed_at).toLocaleDateString()}</p>
              )}
              {certificate.expires_at && (
                <p>Valid until {new Date(certificate.expires_at).toLocaleDateString()}</p>
              )}
              <p className="text-sm text-muted-foreground">
                Status is checked against the issuer’s current record. A historical or imported
                completion record does not assert a newly verified assessment.
              </p>
            </article>
          )
        )}
      </div>
    </main>
  );
}
