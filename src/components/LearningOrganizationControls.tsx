import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/database-pages";
import { friendlyError } from "@/lib/friendly-error";

function useOrganizations(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-organizations", user?.id],
    enabled: enabled && !!user,
    queryFn: async () =>
      (
        await readAllPages(
          supabase.rpc("my_organizations", {}, { count: "exact" }).order("name").order("id"),
        )
      ).data,
  });
}
export function CourseOrganizationButton({
  course,
}: {
  course: { id: string; published: boolean };
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const orgs = useOrganizations(open);
  const scope = useQuery({
    queryKey: ["course-organization", course.id, user?.id],
    enabled: open && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_courses")
        .select("organization_id")
        .eq("course_id", course.id)
        .maybeSingle();
      if (error) throw error;
      return data?.organization_id ?? null;
    },
  });
  useEffect(() => {
    if (scope.isSuccess) setSelected(scope.data ?? "");
  }, [scope.data, scope.isSuccess]);
  const save = async () => {
    if (busy || !scope.isSuccess) return;
    if (
      !(await confirm({
        title: selected
          ? "Restrict this course to an organization?"
          : "Allow public course publishing?",
        description:
          "Only unpublished canonical courses can change scope. Private courses appear only to their organization members and their author. Course prerequisites and payment rules still apply. Independently hosted media retains its provider's own access rules.",
        confirmLabel: "Save course privacy",
      }))
    )
      return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_course_organization", {
        _course: course.id,
        _organization: selected || null,
        _expected: scope.data,
      });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["course-organization", course.id] }),
        qc.invalidateQueries({ queryKey: ["studio-courses"] }),
        qc.invalidateQueries({ queryKey: ["class", course.id] }),
      ]);
      toast.success("Course privacy saved.");
      setOpen(false);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Privacy
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Course privacy</DialogTitle>
          </DialogHeader>
          {scope.isPending || orgs.isPending ? (
            <p>Loading course privacy…</p>
          ) : scope.isError || orgs.isError ? (
            <p role="alert">Could not load course privacy settings.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">
                Set privacy before publishing. Revisions and copies retain the source course's
                private organization. Existing course ownership stays with its author.
              </p>
              <select
                className="w-full rounded border p-2"
                aria-label="Course organization"
                disabled={busy || course.published}
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Public catalogue when published</option>
                {scope.data && !orgs.data.some((o) => o.id === scope.data) && (
                  <option value={scope.data}>Current private organization</option>
                )}
                {orgs.data.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} · Private organization course
                  </option>
                ))}
              </select>
              {course.published && (
                <p className="text-sm">
                  Unpublish this course before changing its privacy. Draft revisions inherit privacy
                  from the canonical course.
                </p>
              )}
              <Button
                type="button"
                disabled={busy || course.published || selected === (scope.data ?? "")}
                onClick={save}
              >
                Save privacy
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function CohortOrganizationBinding({ cohortId }: { cohortId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const orgs = useOrganizations(true);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const scope = useQuery({
    queryKey: ["cohort-organization", cohortId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_cohorts")
        .select("organization_id")
        .eq("cohort_id", cohortId)
        .maybeSingle();
      if (error) throw error;
      return data?.organization_id ?? null;
    },
  });
  const bind = async () => {
    if (busy || !selected || !scope.isSuccess) return;
    if (
      !(await confirm({
        title: "Bind this cohort to an organization?",
        description:
          "All current members and private courses must belong to this organization. Future membership and course assignments will enforce the same boundary. The cohort cannot be transferred to another organization.",
        confirmLabel: "Bind organization cohort",
      }))
    )
      return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("bind_organization_cohort", {
        _cohort: cohortId,
        _organization: selected,
        _expected: scope.data,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["cohort-organization", cohortId] });
      toast.success("Cohort bound to the organization.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">Organization boundary</h2>
      {scope.isPending || orgs.isPending ? (
        <p>Loading organization settings…</p>
      ) : scope.isError || orgs.isError ? (
        <p role="alert">Could not load organization settings.</p>
      ) : scope.data ? (
        <p className="text-sm">
          This cohort is bound to{" "}
          {orgs.data.find((o) => o.id === scope.data)?.name ?? "its private organization"}. Members
          and private courses must remain in that organization.
        </p>
      ) : (
        <>
          <p className="text-sm">
            Bind before assigning private organization courses. Current members must already belong
            to the organization.
          </p>
          <select
            className="w-full rounded border p-2"
            aria-label="Cohort organization"
            value={selected}
            disabled={busy}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose an organization you manage</option>
            {orgs.data
              .filter((o) => o.can_manage)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </select>
          <Button type="button" disabled={busy || !selected} onClick={bind}>
            Bind organization
          </Button>
        </>
      )}
    </section>
  );
}
