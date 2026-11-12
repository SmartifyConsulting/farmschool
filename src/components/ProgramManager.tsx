import { ProgramRoster } from "@/components/ProgramRoster";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Phone, Header, Sheet, CanvasHeading, useIsAdmin } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/database-pages";
import { friendlyError } from "@/lib/friendly-error";
import { programStages, type ProgramStage } from "@/lib/programs";

const newStage = (): ProgramStage => ({ title: "", required: 1, course_ids: [] });
export function ProgramManager({ organizationId }: { organizationId?: string }) {
  const { user, ready } = useAuth();
  const isAdmin = useIsAdmin();
  const organizationAccess = useQuery({
    queryKey: ["program-organization-access", organizationId, user?.id],
    enabled: !!organizationId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("my_organizations")
        .eq("id", organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const allowed = organizationId ? organizationAccess.data?.can_manage === true : isAdmin;
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [id, setId] = useState<string>(() => crypto.randomUUID());
  const [version, setVersion] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stages, setStages] = useState<ProgramStage[]>([newStage()]);
  const [busy, setBusy] = useState(false);
  const [cohort, setCohort] = useState("");
  const [published, setPublished] = useState("");
  const [due, setDue] = useState("");
  const [roster, setRoster] = useState<{ cohort: string; version: string } | null>(null);
  const [search, setSearch] = useState("");
  const data = useQuery({
    queryKey: ["program-admin", user?.id, organizationId ?? "personal"],
    enabled: !!user && allowed,
    queryFn: async () => {
      const [programs, versions, cohorts, assignments, courses] = await Promise.all([
        readAllPages(
          (organizationId
            ? supabase.rpc(
                "organization_program_drafts",
                { _organization: organizationId },
                { count: "exact" },
              )
            : supabase.from("learning_programs").select("*", { count: "exact" })
          )
            .order("created_at", { ascending: false })
            .order("id"),
        ),
        readAllPages(
          (organizationId
            ? supabase.rpc(
                "organization_program_versions",
                { _organization: organizationId },
                { count: "exact" },
              )
            : supabase.from("learning_program_versions").select("*", { count: "exact" })
          )
            .order("published_at", { ascending: false })
            .order("id"),
        ),
        readAllPages(
          (organizationId
            ? supabase.rpc(
                "organization_training_cohorts",
                { _organization: organizationId },
                { count: "exact" },
              )
            : supabase
                .from("cohorts")
                .select("id,name", { count: "exact" })
                .eq("owner_id", user!.id)
          ).order("id"),
        ),
        readAllPages(
          (organizationId
            ? supabase.rpc(
                "organization_program_assignments",
                { _organization: organizationId },
                { count: "exact" },
              )
            : supabase.from("cohort_program_assignments").select("*", { count: "exact" })
          ).order("id"),
        ),
        readAllPages(
          (organizationId
            ? supabase.rpc(
                "organization_assignable_courses",
                { _organization: organizationId },
                { count: "exact" },
              )
            : supabase
                .from("studio_courses")
                .select("id,title", { count: "exact" })
                .eq("published", true)
                .is("revision_of", null)
          )
            .order("title")
            .order("id"),
        ),
      ]);
      return {
        programs: programs.data,
        versions: versions.data,
        cohorts: cohorts.data,
        assignments: assignments.data,
        courses: courses.data,
      };
    },
  });
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["program-admin", user?.id, organizationId ?? "personal"] });
  const save = async (publish: boolean) => {
    if (busy) return;
    const parsed = programStages.safeParse(stages);
    if (!parsed.success || title.trim().length < 3) {
      toast.error(
        parsed.success
          ? "Give the program a title of at least 3 characters."
          : (parsed.error.issues[0]?.message ?? "Review program stages."),
      );
      return;
    }
    if (
      publish &&
      !(await confirm({
        title: "Publish this program version?",
        description:
          "Publishing saves an immutable version of this course set. Existing cohort assignments stay on their assigned version. Program assignment does not purchase or grant paid-course access.",
        confirmLabel: "Save and publish",
      }))
    )
      return;
    setBusy(true);
    try {
      const args = {
        _program: id,
        _title: title.trim(),
        _description: description,
        _stages: parsed.data,
        _expected: version,
      };
      const saved = organizationId
        ? await supabase.rpc("save_organization_program", {
            _organization: organizationId,
            ...args,
          })
        : await supabase.rpc("save_learning_program", args);
      if (saved.error) throw saved.error;
      setVersion(saved.data);
      if (publish) {
        const result = await supabase.rpc("publish_learning_program", {
          _program: id,
          _expected: saved.data,
        });
        if (result.error) throw result.error;
        setPublished(result.data);
      }
      await refresh();
      toast.success(publish ? "Program version published." : "Program draft saved.");
    } catch (error) {
      await refresh();
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  const assign = async (
    cohortId: string,
    versionId: string,
    active: boolean,
    expected: number,
    deadline: string | null,
  ) => {
    if (busy) return;
    if (
      !(await confirm({
        title: active ? "Assign this program version?" : "End this program assignment?",
        description: active
          ? "Current and future cohort members will see this version. Individual course access rules still apply."
          : "Learners will lose this cohort's program access. Historical completion records are kept.",
        confirmLabel: active ? "Assign program" : "End assignment",
      }))
    )
      return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc(
        organizationId ? "assign_organization_program" : "assign_cohort_program",
        {
          _cohort: cohortId,
          _version: versionId,
          _active: active,
          _expected: expected,
          _due: deadline,
        },
      );
      if (error) throw error;
      await refresh();
      toast.success("Program assignment saved.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  const updateStage = (index: number, patch: Partial<ProgramStage>) =>
    setStages(stages.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading title={organizationId ? "Organization programs" : "Learning programs"} />
        {organizationId ? (
          <Link
            className="block text-primary underline"
            to="/organizations/$id"
            params={{ id: organizationId }}
          >
            Back to organization workspace
          </Link>
        ) : (
          <AdminNav />
        )}
        {!ready ? (
          <p>Checking sign-in…</p>
        ) : !user ? (
          <Link to="/auth">Sign in</Link>
        ) : organizationId && organizationAccess.isPending ? (
          <p>Checking organization access…</p>
        ) : !allowed ? (
          <p>Program management access required.</p>
        ) : data.isPending ? (
          <p>Loading programs…</p>
        ) : data.isError ? (
          <p role="alert">Could not load program management.</p>
        ) : (
          <div className="space-y-6 py-5">
            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="font-semibold">Program draft</h2>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setId(crypto.randomUUID());
                    setVersion(0);
                    setTitle("");
                    setDescription("");
                    setStages([newStage()]);
                  }}
                >
                  New program
                </Button>
                <select
                  aria-label="Open saved program"
                  className="rounded border p-2"
                  value={data.data.programs.some((p) => p.id === id) ? id : ""}
                  disabled={busy}
                  onChange={(e) => {
                    const p = data.data.programs.find((p) => p.id === e.target.value);
                    if (!p) return;
                    setId(p.id);
                    setVersion(p.draft_version);
                    setTitle(p.title);
                    setDescription(p.description);
                    setStages(programStages.parse(p.stages));
                  }}
                >
                  <option value="">Choose a saved draft</option>
                  {data.data.programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
              <label className="block text-sm">
                Program title
                <Input
                  value={title}
                  maxLength={200}
                  disabled={busy}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Description
                <Textarea
                  value={description}
                  maxLength={5000}
                  disabled={busy}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <Input
                aria-label="Find a course for program stages"
                placeholder="Filter courses by title"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {stages.map((stage, index) => (
                <section className="space-y-2 rounded border p-3" key={index}>
                  <h3 className="font-semibold">Stage {index + 1}</h3>
                  <label className="block text-sm">
                    Stage title
                    <Input
                      value={stage.title}
                      maxLength={200}
                      disabled={busy}
                      onChange={(e) => updateStage(index, { title: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    Required course completions
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={stage.required}
                      disabled={busy}
                      onChange={(e) => updateStage(index, { required: Number(e.target.value) })}
                    />
                  </label>
                  <div className="max-h-56 space-y-2 overflow-y-auto">
                    {data.data.courses
                      .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
                      .map((course) => (
                        <label className="flex items-center gap-2 text-sm" key={course.id}>
                          <Checkbox
                            checked={stage.course_ids.includes(course.id)}
                            disabled={
                              busy ||
                              stages.some((s, i) => i !== index && s.course_ids.includes(course.id))
                            }
                            onCheckedChange={(checked) =>
                              updateStage(index, {
                                course_ids:
                                  checked === true
                                    ? [...stage.course_ids, course.id]
                                    : stage.course_ids.filter((id) => id !== course.id),
                              })
                            }
                          />
                          {course.title}
                        </label>
                      ))}
                  </div>
                  <p className="text-xs">{stage.course_ids.length} courses selected</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || index === 0}
                      onClick={() =>
                        setStages(
                          stages.map((s, i) =>
                            i === index - 1 ? stage : i === index ? stages[index - 1]! : s,
                          ),
                        )
                      }
                    >
                      Move earlier
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || stages.length === 1}
                      onClick={() => setStages(stages.filter((_, i) => i !== index))}
                    >
                      Remove stage
                    </Button>
                  </div>
                </section>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy || stages.length >= 30}
                  onClick={() => setStages([...stages, newStage()])}
                >
                  Add stage
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => save(false)}>
                  Save draft
                </Button>
                <Button disabled={busy} onClick={() => save(true)}>
                  Save and publish version
                </Button>
              </div>
            </section>
            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="font-semibold">Assign published program</h2>
              <select
                className="block w-full rounded border p-2"
                aria-label="Published program version"
                value={published}
                disabled={busy}
                onChange={(e) => setPublished(e.target.value)}
              >
                <option value="">Choose program version</option>
                {data.data.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title} · Version {v.version}
                  </option>
                ))}
              </select>
              <select
                className="block w-full rounded border p-2"
                aria-label="Program cohort"
                value={cohort}
                disabled={busy}
                onChange={(e) => setCohort(e.target.value)}
              >
                <option value="">Choose cohort</option>
                {data.data.cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <label className="block text-sm">
                Due date (optional)
                <Input
                  type="datetime-local"
                  value={due}
                  disabled={busy}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
              <Button
                disabled={busy || !cohort || !published}
                onClick={() => {
                  const existing = data.data.assignments.find(
                    (a) => a.cohort_id === cohort && a.version_id === published,
                  );
                  assign(
                    cohort,
                    published,
                    true,
                    existing?.version ?? 0,
                    due ? new Date(due).toISOString() : null,
                  );
                }}
              >
                Assign program
              </Button>
              {data.data.assignments
                .filter((a) => data.data.cohorts.some((c) => c.id === a.cohort_id))
                .map((a) => (
                  <article key={a.id} className="space-y-2 rounded border p-3 text-sm">
                    <p>
                      {data.data.versions.find((v) => v.id === a.version_id)?.title ?? "Program"} ·
                      Version {data.data.versions.find((v) => v.id === a.version_id)?.version} ·{" "}
                      {data.data.cohorts.find((c) => c.id === a.cohort_id)?.name} ·{" "}
                      {a.active ? "Active" : "Ended"}
                      {a.due_at ? ` · Due ${new Date(a.due_at).toLocaleDateString()}` : ""}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          assign(a.cohort_id, a.version_id, !a.active, a.version, a.due_at)
                        }
                      >
                        {a.active ? "End assignment" : "Restore assignment"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRoster({ cohort: a.cohort_id, version: a.version_id })}
                      >
                        View progress
                      </Button>
                    </div>
                  </article>
                ))}
            </section>
            {roster && (
              <ProgramRoster
                key={roster.cohort + roster.version}
                cohort={roster.cohort}
                version={roster.version}
              />
            )}
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
