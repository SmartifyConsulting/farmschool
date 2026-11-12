import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/friendly-error";

const detailSchema = z.object({
  share: z
    .object({ token: z.string().uuid(), enabled: z.boolean(), learner_name: z.string() })
    .nullable(),
  renewals: z.array(
    z.object({
      id: z.string().uuid(),
      started_at: z.string(),
      completed_at: z.string().nullable(),
      expires_at: z.string().nullable(),
      course_version: z.number().nullable(),
    }),
  ),
});
export function CertificateLifecycle({
  certificate,
}: {
  certificate: {
    id: string;
    source: string;
    course_ref: string;
    validated_at: string | null;
    revoked_at: string | null;
    expires_at: string | null;
  };
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const details = useQuery({
    queryKey: ["certificate-lifecycle", certificate.id, user?.id],
    enabled: !!user,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_certificate_lifecycle", {
        _certificate: certificate.id,
      });
      if (error) throw error;
      return detailSchema.parse(data);
    },
  });
  const share = details.data?.share;
  const active = details.data?.renewals.find((r) => !r.completed_at);
  const act = async (kind: "share" | "renew") => {
    if (busy) return;
    if (
      !(await confirm(
        kind === "share"
          ? {
              title: share?.enabled
                ? "Disable public verification?"
                : "Enable public verification?",
              description: share?.enabled
                ? "The current verification link will stop working."
                : "Anyone with the link can see your profile name, course title, issue date, current status and any certificate issuer branding, signatory details and wording. You can disable sharing at any time.",
              confirmLabel: share?.enabled ? "Disable sharing" : "Enable sharing",
            }
          : {
              title: "Start certificate renewal?",
              description:
                "Pass every course quiz again after starting. Your trainer must also approve practical photo tasks again. Earlier completion records are kept. The course must still be available to you.",
              confirmLabel: "Start renewal",
            },
      ))
    )
      return;
    setBusy(true);
    try {
      const result =
        kind === "share"
          ? await supabase.rpc("set_certificate_sharing", {
              _certificate: certificate.id,
              _enabled: !share?.enabled,
            })
          : await supabase.rpc("start_certificate_renewal", { _certificate: certificate.id });
      if (result.error) throw result.error;
      await qc.invalidateQueries({ queryKey: ["certificate-lifecycle", certificate.id] });
      toast.success(
        kind === "share"
          ? "Certificate sharing updated."
          : "Renewal started. Retake the course quizzes, then claim your certificate again.",
      );
    } catch (error) {
      toast.error(
        friendlyError(
          error,
          kind === "renew"
            ? "Renewal may not be available yet. Check the renewal window, course access and assessment requirements with your trainer."
            : "Could not update sharing. Add your full name to your profile before sharing.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border p-4 text-sm print:hidden">
      <h2 className="font-semibold">Verification and renewal</h2>
      {details.isPending ? (
        <p>Loading certificate settings…</p>
      ) : details.isError ? (
        <p role="alert">Could not load certificate settings.</p>
      ) : (
        <>
          <Button type="button" variant="outline" disabled={busy} onClick={() => act("share")}>
            {share?.enabled ? "Disable verification link" : "Enable verification link"}
          </Button>
          {share?.enabled && (
            <div className="space-y-2">
              <p>Shared name: {share.learner_name}</p>
              <Input
                aria-label="Public verification link"
                readOnly
                value={
                  typeof window === "undefined"
                    ? ""
                    : new URL("/verify/" + share.token, window.location.origin).href
                }
              />
              <a
                className="block underline"
                href={"/verify/" + share.token}
                target="_blank"
                rel="noreferrer"
              >
                Open verification page
              </a>
            </div>
          )}
          {certificate.expires_at && (
            <p>Current validity ends {new Date(certificate.expires_at).toLocaleDateString()}.</p>
          )}
          {certificate.source === "studio" &&
            certificate.validated_at &&
            certificate.expires_at &&
            !certificate.revoked_at &&
            (active ? (
              <p>
                Renewal started {new Date(active.started_at).toLocaleString()}. Pass every quiz
                again and obtain fresh practical photo approvals, then claim the certificate from
                the course.
              </p>
            ) : (
              <Button type="button" variant="outline" disabled={busy} onClick={() => act("renew")}>
                Start renewal
              </Button>
            ))}
          {certificate.source === "studio" && (
            <Link
              className="block underline"
              to="/class/$id"
              params={{ id: certificate.course_ref }}
            >
              Open course
            </Link>
          )}
          {details.data.renewals.map((r) => (
            <p key={r.id}>
              {r.completed_at
                ? `Renewed ${new Date(r.completed_at).toLocaleDateString()} · Course version ${r.course_version} · Valid until ${new Date(r.expires_at!).toLocaleDateString()}`
                : `Renewal in progress since ${new Date(r.started_at).toLocaleDateString()}`}
            </p>
          ))}
        </>
      )}
    </section>
  );
}

export function CourseCertificatePolicy({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [days, setDays] = useState("");
  const [windowDays, setWindowDays] = useState("30");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const policy = useQuery({
    queryKey: ["certificate-policy", courseId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("course_certificate_policy", {
        _course: courseId,
      });
      if (error) throw error;
      return z
        .object({
          validity_days: z.number().nullable(),
          renewal_window_days: z.number(),
          version: z.number(),
        })
        .parse(data);
    },
  });
  useEffect(() => {
    if (!policy.data) return;
    setDays(policy.data.validity_days === null ? "" : String(policy.data.validity_days));
    setWindowDays(String(policy.data.renewal_window_days));
  }, [policy.data]);
  const save = async () => {
    if (!policy.data || busy) return;
    const validity = days.trim() === "" ? null : Number(days);
    const window = Number(windowDays);
    if (
      (validity !== null && (!Number.isInteger(validity) || validity < 1 || validity > 3650)) ||
      !Number.isInteger(window) ||
      window < 0 ||
      window > 365 ||
      (validity !== null && window > validity) ||
      reason.trim().length < 20
    ) {
      toast.error("Set valid days and a reason of at least 20 characters.");
      return;
    }
    if (
      !(await confirm({
        title: "Change certificate validity?",
        description:
          "This applies to newly issued certificates and newly started renewal cycles. Existing awards keep their original validity. Renewal requires fresh passes on every course quiz and fresh practical photo approvals.",
        confirmLabel: "Save policy",
      }))
    )
      return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_course_certificate_policy", {
        _course: courseId,
        _days: validity,
        _window: window,
        _version: policy.data.version,
        _reason: reason.trim(),
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["certificate-policy", courseId] });
      setReason("");
      toast.success("Certificate policy saved.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">Certificate validity policy</h2>
      {policy.isPending ? (
        <p>Loading policy…</p>
      ) : policy.isError ? (
        <p role="alert">Could not load certificate policy.</p>
      ) : (
        <>
          <p className="text-sm">
            Current policy:{" "}
            {policy.data.validity_days === null
              ? "No expiry"
              : `${policy.data.validity_days} days validity, renewal opens ${policy.data.renewal_window_days} days before expiry`}
            . Existing awards are preserved.
          </p>
          <label className="block text-sm">
            New validity period in days (blank for no expiry)
            <Input
              type="number"
              min={1}
              max={3650}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block text-sm">
            Renewal window in days before expiry
            <Input
              type="number"
              min={0}
              max={365}
              value={windowDays}
              onChange={(e) => setWindowDays(e.target.value)}
              disabled={busy}
            />
          </label>
          <Textarea
            aria-label="Certificate policy change reason"
            placeholder="Reason for this policy (20–2000 characters)"
            value={reason}
            maxLength={2000}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
          <Button type="button" onClick={save} disabled={busy}>
            Save certificate policy
          </Button>
        </>
      )}
    </section>
  );
}
