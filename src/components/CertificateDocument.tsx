import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Printer } from "lucide-react";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { certificateBrandSchema, type CertificateBrand } from "@/lib/certificate-brand";
import { accessibleBrandColor, safeBrandLogo } from "@/lib/learning-brand";
import { certificateStatus, type CertificateRecord } from "@/lib/certificates";
import { credentialCode } from "@/lib/studio";
import { CertificateLifecycle } from "@/components/CertificateLifecycle";
import { Button } from "@/components/ui/button";
import logo from "@/assets/plusticity-logo-navy.png";

export function CertificateIssuer({ brand }: { brand: CertificateBrand }) {
  const [failed, setFailed] = useState(false);
  const url = safeBrandLogo(brand.logo);
  return (
    <div className="space-y-3 text-center">
      {url && !failed && (
        <img
          src={url}
          referrerPolicy="no-referrer"
          alt={brand.issuer_name + " logo"}
          className="mx-auto max-h-36 max-w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}
      <p className="text-xl font-semibold">{brand.issuer_name}</p>
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">{brand.heading}</p>
    </div>
  );
}

export type DisplayCertificate = CertificateRecord & {
  course_ref: string;
  expires_at: string | null;
};
export function CertificateDocument({
  certificate,
  learnerName,
}: {
  certificate: DisplayCertificate;
  learnerName: string;
}) {
  const { user } = useAuth();
  const issuer = useQuery({
    queryKey: ["certificate-brand", user?.id, certificate.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_certificate_brand", {
        _certificate: certificate.id,
      });
      if (error) throw error;
      return data === null ? null : certificateBrandSchema.parse(data);
    },
  });
  if (issuer.isPending) return <p>Loading certificate…</p>;
  if (issuer.isError)
    return (
      <div role="alert">
        <p>Could not load certificate branding. Please retry before printing.</p>
        <Button variant="outline" onClick={() => issuer.refetch()}>
          Retry
        </Button>
      </div>
    );
  const brand = issuer.data;
  const style = brand
    ? ({ "--primary": accessibleBrandColor(brand.color).css } as CSSProperties)
    : undefined;
  return (
    <div style={style} className="space-y-4">
      <div id="certificate" className="rounded-2xl border-4 border-primary p-6 text-center sm:p-10">
        {brand ? (
          <CertificateIssuer key={certificate.id} brand={brand} />
        ) : (
          <>
            <img src={logo} alt="Plusticity" className="mx-auto h-[176px] w-auto" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Certificate of Completion
            </p>
          </>
        )}
        <p className="mt-4 text-sm text-muted-foreground">This certifies that</p>
        <p className="mt-1 font-display text-2xl font-bold sm:text-3xl">{learnerName}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          {certificate.revoked_at
            ? "This certificate has been revoked for"
            : "has a recorded course completion in"}
        </p>
        <p className="mt-1 text-lg font-semibold">{certificate.title}</p>
        {certificate.course_version !== null && (
          <p className="mt-2 text-xs">Course version {certificate.course_version}</p>
        )}
        {certificate.revoked_at && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-destructive">
            Revoked {new Date(certificate.revoked_at).toLocaleDateString()}:{" "}
            {certificate.revocation_reason}
          </p>
        )}
        {certificate.source === "studio" &&
          !certificate.validated_at &&
          !certificate.revoked_at && (
            <p className="mt-3 text-xs text-muted-foreground">
              Historical record issued before version-based validation.
            </p>
          )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span>
            Issued{" "}
            {new Date(certificate.issued_at).toLocaleDateString(undefined, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          {certificate.expires_at && (
            <span>Valid until {new Date(certificate.expires_at).toLocaleDateString()}</span>
          )}
          <span className="flex items-center gap-1 font-semibold text-primary">
            <BadgeCheck className="h-4 w-4" />
            {certificateStatus(certificate)} · {credentialCode(certificate.id)}
          </span>
        </div>
        {brand && (brand.signatory_name || brand.signatory_title) && (
          <div className="mx-auto mt-8 max-w-xs border-t pt-3">
            <p className="font-semibold">{brand.signatory_name}</p>
            <p className="text-sm">{brand.signatory_title}</p>
          </div>
        )}
        {brand?.footer && <p className="mt-5 whitespace-pre-wrap text-xs">{brand.footer}</p>}
      </div>
      <CertificateLifecycle key={certificate.id} certificate={certificate} />
      <Button onClick={() => window.print()} className="mx-auto flex print:hidden">
        <Printer className="h-4 w-4" />
        Print or save as PDF
      </Button>
    </div>
  );
}
