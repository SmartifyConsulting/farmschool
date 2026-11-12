import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Phone, Header, Sheet, CanvasHeading, useIsAdmin } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { pageMeta } from "@/lib/page-meta";
import { readAllPages } from "@/lib/database-pages";

export const Route = createFileRoute("/admin/cohorts")({
  component: CohortsPage,
  head: () => pageMeta("Cohorts — Plusticity", "Manage learner groups and course assignments."),
});

function CohortsPage() {
  const { user, ready } = useAuth();
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [learner, setLearner] = useState("");
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const enabled = !!user && isAdmin;
  const cohorts = useQuery({
    queryKey: ["cohorts", user?.id],
    enabled,
    queryFn: async () => {
      const { data } = await readAllPages(
        supabase
          .from("cohorts")
          .select("id,name", { count: "exact" })
          .eq("owner_id", user!.id)
          .order("name")
          .order("id"),
      );
      return data ?? [];
    },
  });
  const detail = useQuery({
    queryKey: ["cohort-detail", user?.id, selected],
    enabled: enabled && !!selected,
    queryFn: async () => {
      const [members, assignments] = await Promise.all([
        readAllPages(
          supabase
            .from("cohort_members")
            .select("user_id", { count: "exact" })
            .eq("cohort_id", selected)
            .order("user_id"),
        ),
        readAllPages(
          supabase
            .from("cohort_course_assignments")
            .select("course_id,due_at,studio_courses(title)", { count: "exact" })
            .eq("cohort_id", selected)
            .order("course_id"),
        ),
      ]);
      return { members: members.data ?? [], assignments: assignments.data ?? [] };
    },
  });
  const options = useQuery({
    queryKey: ["cohort-options", user?.id, search],
    enabled,
    queryFn: async () => {
      const [profiles, courses] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id,full_name")
          .ilike("full_name", `%${search}%`)
          .order("full_name")
          .limit(200),
        supabase
          .from("studio_courses")
          .select("id,title,price_cents")
          .eq("published", true)
          .order("title")
          .limit(200),
      ]);
      if (profiles.error || courses.error) throw new Error("Could not load learners and courses.");
      return { profiles: profiles.data ?? [], courses: courses.data ?? [] };
    },
  });
  const change = async (operation: () => PromiseLike<{ error: unknown }>) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await operation();
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cohorts"] }),
        queryClient.invalidateQueries({ queryKey: ["cohort-detail"] }),
        queryClient.invalidateQueries({ queryKey: ["compliance-report"] }),
        queryClient.invalidateQueries({ queryKey: ["my-course-assignments"] }),
        queryClient.invalidateQueries({ queryKey: ["assignment-notifications"] }),
      ]);
      toast.success("Cohort updated.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not update the cohort."));
    } finally {
      setBusy(false);
    }
  };
  const selectClass =
    "min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm";
  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading eyebrow="Admin" title="Cohorts" />
        {!ready ? (
          <p className="py-8">Checking access…</p>
        ) : !user ? (
          <Link to="/auth">Sign in to manage cohorts.</Link>
        ) : !isAdmin ? (
          <p className="py-8">Administrator access required.</p>
        ) : (
          <div className="mt-4 space-y-6 pb-10">
            <AdminNav />
            <p className="text-sm text-muted-foreground">
              Manage your learner groups. Assignments do not bypass course prerequisites or payment
              requirements.
            </p>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim())
                  void change(() =>
                    supabase.from("cohorts").insert({ name: name.trim(), owner_id: user.id }),
                  );
              }}
            >
              <Input
                aria-label="New cohort name"
                placeholder="New cohort name"
                maxLength={120}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="max-w-sm"
              />
              <Button disabled={busy} type="submit">
                Create cohort
              </Button>
            </form>
            {cohorts.error && <p role="alert">Could not load your cohorts.</p>}
            <select
              aria-label="Select cohort"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              className={selectClass}
            >
              <option value="">Choose a cohort</option>
              {cohorts.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {selected && (
              <>
                {detail.isLoading && <p>Loading cohort…</p>}
                {detail.error && <p role="alert">Could not load this cohort.</p>}
                <section className="space-y-3">
                  <h2 className="font-semibold">Learners ({detail.data?.members.length ?? 0})</h2>
                  <Input
                    aria-label="Find learner by name"
                    placeholder="Find learner by name"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Up to 200 matching learners are shown. Search to narrow the list.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <select
                      aria-label="Learner to add"
                      className={selectClass}
                      value={learner}
                      onChange={(event) => setLearner(event.target.value)}
                    >
                      <option value="">Choose learner</option>
                      {options.data?.profiles.map((profile) => (
                        <option key={profile.user_id} value={profile.user_id}>
                          {profile.full_name || profile.user_id}
                        </option>
                      ))}
                    </select>
                    <Button
                      disabled={busy || !learner}
                      onClick={() =>
                        void change(() =>
                          supabase
                            .from("cohort_members")
                            .upsert(
                              { cohort_id: selected, user_id: learner },
                              { onConflict: "cohort_id,user_id", ignoreDuplicates: true },
                            ),
                        )
                      }
                    >
                      Add learner
                    </Button>
                  </div>
                  {detail.data?.members.map((member) => (
                    <div
                      key={member.user_id}
                      className="flex items-center justify-between gap-3 rounded-xl border p-3"
                    >
                      <span className="break-all text-sm">
                        {options.data?.profiles.find(
                          (profile) => profile.user_id === member.user_id,
                        )?.full_name || member.user_id}
                      </span>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Remove learner from cohort?",
                              description: "Their existing learning history will be kept.",
                              confirmLabel: "Remove learner",
                            })
                          )
                            void change(() =>
                              supabase
                                .from("cohort_members")
                                .delete()
                                .eq("cohort_id", selected)
                                .eq("user_id", member.user_id),
                            );
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </section>
                <section className="space-y-3">
                  <h2 className="font-semibold">Course assignments</h2>
                  <div className="flex flex-wrap gap-2">
                    <select
                      aria-label="Course to assign"
                      className={selectClass}
                      value={course}
                      onChange={(event) => setCourse(event.target.value)}
                    >
                      <option value="">Choose a published course</option>
                      {options.data?.courses.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                          {item.price_cents > 0 ? " (purchase required)" : ""}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="datetime-local"
                      aria-label="Assignment due date"
                      value={due}
                      onChange={(event) => setDue(event.target.value)}
                      className="w-auto"
                    />
                    <Button
                      disabled={busy || !course}
                      onClick={() =>
                        void change(() =>
                          supabase
                            .from("cohort_course_assignments")
                            .upsert(
                              {
                                cohort_id: selected,
                                course_id: course,
                                due_at: due ? new Date(due).toISOString() : null,
                              },
                              { onConflict: "cohort_id,course_id" },
                            ),
                        )
                      }
                    >
                      Assign / update
                    </Button>
                  </div>
                  {options.error && <p role="alert">Could not load learners and courses.</p>}
                  {detail.data?.assignments.map((assignment) => (
                    <div
                      key={assignment.course_id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                    >
                      <div>
                        <p className="font-medium">
                          {assignment.studio_courses?.title ?? "Course unavailable"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {assignment.due_at
                            ? "Due " +
                              new Date(assignment.due_at).toLocaleString("en-ZA", {
                                timeZone: "Africa/Johannesburg",
                              }) +
                              " SAST"
                            : "No deadline"}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Remove course assignment?",
                              description: "Learner progress and purchases will be kept.",
                              confirmLabel: "Remove assignment",
                            })
                          )
                            void change(() =>
                              supabase
                                .from("cohort_course_assignments")
                                .delete()
                                .eq("cohort_id", selected)
                                .eq("course_id", assignment.course_id),
                            );
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </section>
              </>
            )}
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
