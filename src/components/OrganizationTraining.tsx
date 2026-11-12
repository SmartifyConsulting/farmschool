import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useLearning";
import { useConfirm } from "@/components/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/database-pages";
import { friendlyError } from "@/lib/friendly-error";
import { CohortLicenses } from "@/components/CohortLicenses";
import { CohortBillingManagers } from "@/components/CohortBillingManagers";
import { CohortAssignmentRules } from "@/components/CohortAssignmentRules";

const summarySchema = z.object({
  members: z.number(),
  private_courses: z.number(),
  cohorts: z.number(),
  assigned_learner_courses: z.number(),
  verified_current: z.number(),
});
export function OrganizationTraining({ organizationId }: { organizationId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [selected, setSelected] = useState("");
  const [newId, setNewId] = useState<string>(() => crypto.randomUUID());
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [seats, setSeats] = useState("");
  const [autoFree, setAutoFree] = useState(false);
  const [policyVersion, setPolicyVersion] = useState(0);
  const [learner, setLearner] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [memberPage, setMemberPage] = useState(0);
  const [course, setCourse] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [coursePage, setCoursePage] = useState(0);
  const [due, setDue] = useState("");
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("cohort");
    if (value && z.string().uuid().safeParse(value).success) setSelected(value);
  }, []);
  const overview = useQuery({
    queryKey: ["organization-training", organizationId, user?.id],
    refetchInterval: 30000,
    queryFn: async () => {
      const [cohorts, summary] = await Promise.all([
        readAllPages(
          supabase
            .rpc(
              "organization_training_cohorts",
              { _organization: organizationId },
              { count: "exact" },
            )
            .order("name")
            .order("id"),
        ),
        supabase.rpc("organization_learning_summary", { _organization: organizationId }),
      ]);
      if (summary.error) throw summary.error;
      return { cohorts: cohorts.data, summary: summarySchema.parse(summary.data) };
    },
  });
  const current = overview.data?.cohorts.find((c) => c.id === selected);
  const {
    id: settingsId,
    name: settingsName,
    seat_limit: settingsLimit,
    auto_enrol_free: settingsAuto,
    policy_version: settingsVersion,
  } = current ?? {};
  useEffect(() => {
    if (!settingsId) return;
    setName(settingsName ?? "");
    setSeats(settingsLimit == null ? "" : String(settingsLimit));
    setAutoFree(settingsAuto ?? false);
    setPolicyVersion(settingsVersion ?? 0);
  }, [settingsId, settingsName, settingsLimit, settingsAuto, settingsVersion]);
  const assignments = useQuery({
    queryKey: ["organization-cohort-courses", selected, user?.id],
    enabled: !!current,
    queryFn: async () =>
      (
        await readAllPages(
          supabase
            .rpc("organization_cohort_courses", { _cohort: selected }, { count: "exact" })
            .order("title")
            .order("course_id"),
        )
      ).data,
  });
  const members = useQuery({
    queryKey: ["organization-cohort-members", selected, memberPage, user?.id],
    enabled: !!current,
    queryFn: async () => {
      const { data, error, count } = await supabase
        .rpc("organization_cohort_people", { _cohort: selected }, { count: "exact" })
        .order("full_name")
        .order("user_id")
        .range(memberPage * 50, memberPage * 50 + 49);
      if (error || count === null) throw error ?? new Error("Missing member count");
      return { rows: data ?? [], count };
    },
  });
  const people = useQuery({
    queryKey: ["organization-member-choices", organizationId, peopleSearch, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("organization_people", { _organization: organizationId })
        .ilike("full_name", "%" + peopleSearch.replace(/[\\%_]/g, "\\$&") + "%")
        .order("full_name")
        .order("user_id")
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  const courses = useQuery({
    queryKey: ["organization-course-choices", organizationId, courseSearch, coursePage, user?.id],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .rpc(
          "organization_assignable_courses",
          { _organization: organizationId },
          { count: "exact" },
        )
        .ilike("title", "%" + courseSearch.replace(/[\\%_]/g, "\\$&") + "%")
        .order("title")
        .order("id")
        .range(coursePage * 50, coursePage * 50 + 49);
      if (error || count === null) throw error ?? new Error("Missing course count");
      return { rows: data ?? [], count };
    },
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["organization-training", organizationId] }),
      qc.invalidateQueries({ queryKey: ["organization-cohort-members", selected] }),
      qc.invalidateQueries({ queryKey: ["organization-cohort-courses", selected] }),
      qc.invalidateQueries({ queryKey: ["cohort-progress"] }),
      qc.invalidateQueries({ queryKey: ["my-programs"] }),
    ]);
  };
  const act = async (action: () => PromiseLike<{ error: unknown }>, message: string) => {
    if (busy) return false;
    setBusy(true);
    try {
      const { error } = await action();
      if (error) throw error;
      await refresh();
      toast.success(message);
      return true;
    } catch (error) {
      toast.error(friendlyError(error));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    const saved = await act(
      () =>
        supabase.rpc("create_organization_cohort", {
          _organization: organizationId,
          _cohort: newId,
          _name: newName.trim(),
        }),
      "Organization cohort created.",
    );
    if (saved) {
      setSelected(newId);
      setNewId(crypto.randomUUID());
      setNewName("");
      setMemberPage(0);
    }
  };
  const save = () => {
    const limit = seats.trim() ? Number(seats) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 100000)) {
      toast.error("Choose a seat limit from 1 to 100,000, or leave it blank.");
      return;
    }
    act(
      () =>
        supabase.rpc("save_organization_cohort", {
          _cohort: selected,
          _name: name.trim(),
          _seats: limit,
          _auto_free: autoFree,
          _expected: policyVersion,
        }),
      "Cohort settings saved.",
    );
  };
  const member = async (id: string, include: boolean) => {
    if (
      !include &&
      !(await confirm({
        title: "Remove this cohort member?",
        description:
          "Named licences stay consumed. Independent purchases and completion records are retained.",
        confirmLabel: "Remove cohort member",
      }))
    )
      return;
    act(
      () =>
        supabase.rpc("set_organization_cohort_member", {
          _cohort: selected,
          _user: id,
          _include: include,
        }),
      include ? "Member added to cohort." : "Member removed from cohort.",
    );
  };
  const assign = async (id: string, include: boolean) => {
    if (
      !include &&
      !(await confirm({
        title: "End this course assignment?",
        description:
          "Group-licensed access through this assignment will end. Personal purchases and earned certificates remain.",
        confirmLabel: "End assignment",
      }))
    )
      return;
    act(
      () =>
        supabase.rpc("set_organization_cohort_course", {
          _cohort: selected,
          _course: id,
          _include: include,
          _due: include && due ? new Date(due).toISOString() : null,
        }),
      "Course assignment saved.",
    );
  };
  return (
    <section className="space-y-4 rounded-xl border p-4">
      <h2 className="font-semibold">Organization learning</h2>
      {overview.isPending ? (
        <p>Loading training overview…</p>
      ) : overview.isError ? (
        <p role="alert">Could not load this organization's training.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Members", overview.data.summary.members],
              ["Private courses", overview.data.summary.private_courses],
              ["Cohorts", overview.data.summary.cohorts],
              ["Learner-course assignments", overview.data.summary.assigned_learner_courses],
              ["Verified current certificates", overview.data.summary.verified_current],
            ].map(([label, value]) => (
              <p className="rounded border p-3 text-sm" key={label}>
                {label}
                <strong className="block text-xl">{value}</strong>
              </p>
            ))}
          </div>
          <Link className="block text-primary underline" to="/cohorts">
            Open scoped course and program reports
          </Link>
          <Link
            className="block text-primary underline"
            to="/organizations/$id/programs"
            params={{ id: organizationId }}
          >
            Manage organization programs
          </Link>
          <div className="flex flex-wrap gap-3">
            <Input
              aria-label="New organization cohort name"
              placeholder="New cohort name"
              value={newName}
              maxLength={200}
              disabled={busy}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button disabled={busy || newName.trim().length < 2} onClick={create}>
              Create cohort
            </Button>
          </div>
          <select
            className="w-full rounded border p-2"
            aria-label="Organization training cohort"
            value={selected}
            disabled={busy}
            onChange={(e) => {
              setSelected(e.target.value);
              setMemberPage(0);
            }}
          >
            <option value="">Choose a cohort</option>
            {overview.data.cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.member_count} members
              </option>
            ))}
          </select>
          {selected && !current && <p>This cohort is unavailable in this organization.</p>}
          {current && (
            <div className="space-y-5">
              <section className="space-y-3 rounded border p-3">
                <h3 className="font-semibold">Cohort settings</h3>
                <label className="block text-sm">
                  Name
                  <Input
                    value={name}
                    maxLength={200}
                    disabled={busy}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Seat limit (blank for no limit)
                  <Input
                    type="number"
                    min={1}
                    max={100000}
                    value={seats}
                    disabled={busy}
                    onChange={(e) => setSeats(e.target.value)}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={autoFree}
                    disabled={busy}
                    onCheckedChange={(v) => setAutoFree(v === true)}
                  />
                  Automatically enrol members in assigned free courses
                </label>
                <Button disabled={busy || name.trim().length < 2} onClick={save}>
                  Save cohort settings
                </Button>
              </section>
              <section className="space-y-3 rounded border p-3">
                <h3 className="font-semibold">Cohort members</h3>
                <Input
                  aria-label="Find organization member to add"
                  placeholder="Find an organization member"
                  value={peopleSearch}
                  onChange={(e) => {
                    setPeopleSearch(e.target.value);
                    setLearner("");
                  }}
                />
                <select
                  className="w-full rounded border p-2"
                  aria-label="Organization member to add"
                  value={learner}
                  disabled={busy}
                  onChange={(e) => setLearner(e.target.value)}
                >
                  <option value="">Choose from the first 50 matching members</option>
                  {people.data?.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
                {people.isError && <p role="alert">Could not load member choices.</p>}
                <Button disabled={busy || !learner} onClick={() => member(learner, true)}>
                  Add to cohort
                </Button>
                {members.isPending ? (
                  <p>Loading cohort members…</p>
                ) : members.isError ? (
                  <p role="alert">Could not load cohort members.</p>
                ) : (
                  <>
                    {members.data.rows.map((p) => (
                      <div
                        key={p.user_id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span>{p.full_name}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => member(p.user_id, false)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        disabled={!memberPage}
                        onClick={() => setMemberPage(memberPage - 1)}
                      >
                        Previous members
                      </Button>
                      <Button
                        variant="outline"
                        disabled={(memberPage + 1) * 50 >= members.data.count}
                        onClick={() => setMemberPage(memberPage + 1)}
                      >
                        Next members
                      </Button>
                    </div>
                  </>
                )}
              </section>
              <section className="space-y-3 rounded border p-3">
                <h3 className="font-semibold">Assigned courses</h3>
                <Input
                  aria-label="Find course for organization cohort"
                  placeholder="Find a published course"
                  value={courseSearch}
                  onChange={(e) => {
                    setCourseSearch(e.target.value);
                    setCoursePage(0);
                    setCourse("");
                  }}
                />
                {courses.isPending ? (
                  <p>Loading course choices…</p>
                ) : courses.isError ? (
                  <p role="alert">Could not load course choices.</p>
                ) : (
                  <>
                    <select
                      className="w-full rounded border p-2"
                      aria-label="Course to assign"
                      value={course}
                      disabled={busy}
                      onChange={(e) => setCourse(e.target.value)}
                    >
                      <option value="">Choose a published course</option>
                      {courses.data.rows.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        disabled={!coursePage}
                        onClick={() => {
                          setCoursePage(coursePage - 1);
                          setCourse("");
                        }}
                      >
                        Previous courses
                      </Button>
                      <Button
                        variant="outline"
                        disabled={(coursePage + 1) * 50 >= courses.data.count}
                        onClick={() => {
                          setCoursePage(coursePage + 1);
                          setCourse("");
                        }}
                      >
                        Next courses
                      </Button>
                    </div>
                  </>
                )}
                <label className="block text-sm">
                  Course deadline (optional)
                  <Input
                    type="datetime-local"
                    value={due}
                    disabled={busy}
                    onChange={(e) => setDue(e.target.value)}
                  />
                </label>
                <Button disabled={busy || !course} onClick={() => assign(course, true)}>
                  Assign course / update deadline
                </Button>
                {assignments.isPending ? (
                  <p>Loading assignments…</p>
                ) : assignments.isError ? (
                  <p role="alert">Could not load course assignments.</p>
                ) : (
                  assignments.data?.map((a) => (
                    <article className="space-y-2 rounded border p-3 text-sm" key={a.course_id}>
                      <p>
                        {a.title} · {a.published ? "Published" : "Currently unpublished"}
                        {a.due_at ? ` · Due ${new Date(a.due_at).toLocaleDateString()}` : ""}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => assign(a.course_id, false)}
                      >
                        End assignment
                      </Button>
                    </article>
                  ))
                )}
              </section>
              <CohortAssignmentRules key={selected+":rules"} cohortId={selected} organizationId={organizationId} />
              <CohortBillingManagers key={selected+":billing"} cohortId={selected} organizationId={organizationId} />
              {current.can_bill && assignments.data && (
                <CohortLicenses
                  key={selected}
                  cohortId={selected}
                  courses={assignments.data
                    .filter((a) => a.published && a.price_cents > 0)
                    .map((a) => ({
                      id: a.course_id,
                      title: a.title,
                      price_cents: a.price_cents,
                      currency: a.currency,
                    }))}
                />
              )}
              {!current.can_bill && (
                <p className="text-sm">
                  Paid licence management is limited to the organization owner, active cohort creator and appointed billing managers.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
