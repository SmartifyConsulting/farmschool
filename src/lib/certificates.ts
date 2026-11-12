export type CertificateRecord = {
  id: string;
  title: string;
  issued_at: string;
  source: string;
  course_version: number | null;
  validated_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
};

export function certificateStatus(
  certificate: Pick<CertificateRecord, "revoked_at" | "validated_at"> & { source?: string },
) {
  if (certificate.revoked_at) return "Revoked";
  if (certificate.source && certificate.source !== "studio") return "Completion record";
  return certificate.validated_at ? "Completion verified" : "Historical record";
}
