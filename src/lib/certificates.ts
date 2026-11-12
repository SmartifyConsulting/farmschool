export type CertificateRecord = {
  id: string;
  title: string;
  issued_at: string;
  source: string;
  course_version: number | null;
  validated_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
  expires_at?: string | null;
};

export function certificateStatus(
  certificate: Pick<CertificateRecord, "revoked_at" | "validated_at"> & {
    source?: string;
    expires_at?: string | null;
  },
  now = Date.now(),
) {
  if (certificate.revoked_at) return "Revoked";
  if (certificate.expires_at && new Date(certificate.expires_at).getTime() <= now) return "Expired";
  if (certificate.source && certificate.source !== "studio") return "Completion record";
  return certificate.validated_at ? "Completion verified" : "Historical record";
}
