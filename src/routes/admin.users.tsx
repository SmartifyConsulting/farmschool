import { friendlyError } from "@/lib/friendly-error";
import { useConfirm } from "@/components/ConfirmDialog";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { pageMeta } from "@/lib/page-meta";
import { courses as catalogueCourses } from "@/lib/courses";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsers,
  head: () =>
    pageMeta(
      "Users — Plusticity Administration",
      "View and manage learner and trainer accounts.",
    ),
});

type ProfileRow = { user_id: string; full_name: string; region: string; learner_role: string };

function useAdminCheck() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["admin-users-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user!.id,
        _role: "admin",
      });
      if (error) throw error;
      return !!data;
    },
  });
}

function UserDrilldown({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data: progress, isLoading } = useQuery({
    queryKey: ["admin-user-progress", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_progress")
        .select("course_id, lesson_id, completed")
        .eq("user_id", userId);
      if (error) throw error;
      return data as { course_id: string; lesson_id: string; completed: boolean }[];
    },
  });
  const { data: studioTitles } = useQuery({
    queryKey: ["admin-user-studio-titles", userId, progress?.map((p) => p.course_id).join(",")],
    enabled: !!progress?.length,
    queryFn: async () => {
      const ids = [...new Set((progress ?? []).map((p) => p.course_id))];
      const { data, error } = await supabase
        .from("studio_courses")
        .select("id, title")
        .in("id", ids);
      if (error) throw error;
      return new Map((data ?? []).map((c) => [c.id, c.title]));
    },
  });
  const byCourse = new Map<string, { lessonIds: Set<string>; completed: number }>();
  for (const row of progress ?? []) {
    const entry = byCourse.get(row.course_id) ?? { lessonIds: new Set<string>(), completed: 0 };
    entry.lessonIds.add(row.lesson_id);
    if (row.completed) entry.completed++;
    byCourse.set(row.course_id, entry);
  }
  let estimatedSpend = 0;
  const rows = [...byCourse.entries()].map(([courseId, v]) => {
    const catalogueCourse = catalogueCourses.find((c) => c.id === courseId);
    if (catalogueCourse) estimatedSpend += catalogueCourse.price;
    return {
      courseId,
      title: catalogueCourse?.title ?? studioTitles?.get(courseId) ?? courseId,
      started: v.lessonIds.size,
      completed: v.completed,
    };
  });
  return (
    <div className="space-y-3 rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Training courses, progress and spend</h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No course activity recorded for this user.</p>
      )}
      {rows.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.courseId} className="rounded-lg bg-muted/40 p-2">
              <span className="font-medium">{r.title}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {r.completed} of {r.started} started lesson{r.started === 1 ? "" : "s"} completed
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Estimated spend: <strong className="text-foreground">${estimatedSpend}</strong> — the sum of
        the catalogue price of courses this user has started. No payment processing is connected
        yet, so this is an estimate, not a record of an actual transaction.
      </p>
    </div>
  );
}

function AdminUsers() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: admin, isLoading: checking } = useAdminCheck();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ full_name: "", region: "", learner_role: "" });
  const [open, setOpen] = useState<string | null>(null);

  const {
    data: rows,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin-users", search.trim()],
    enabled: !!admin,
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("user_id, full_name, region, learner_role")
        .order("full_name")
        .limit(100);
      const term = search.trim();
      if (term) query = query.ilike("full_name", `%${term}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data as ProfileRow[];
    },
  });
  const { data: adminIds } = useQuery({
    queryKey: ["admin-user-role-ids"],
    enabled: !!admin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.user_id));
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-user-role-ids"] });
  };

  const startEdit = (row: ProfileRow) => {
    setEditing(row.user_id);
    setEdit({ full_name: row.full_name, region: row.region, learner_role: row.learner_role });
  };
  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase.from("profiles").update(edit).eq("user_id", editing);
    if (error) {
      toast.error(friendlyError(error, "Could not save changes."));
      return;
    }
    toast.success("Profile updated.");
    setEditing(null);
    refresh();
  };
  const removeProfile = async (row: ProfileRow) => {
    const ok = await confirm({
      tone: "danger",
      title: "Remove this profile?",
      confirmLabel: "Remove profile",
      description: (
        <>
          <p>
            This removes <strong className="text-foreground">{row.full_name}</strong>'s profile
            record from Plusticity.
          </p>
          <p>Their sign-in account is not deleted — only their profile data here.</p>
        </>
      ),
    });
    if (!ok) return;
    const { error } = await supabase.from("profiles").delete().eq("user_id", row.user_id);
    if (error) {
      toast.error(friendlyError(error, "Could not remove profile."));
      return;
    }
    toast.success("Profile removed.");
    refresh();
  };
  const toggleAdmin = async (row: ProfileRow, grant: boolean) => {
    const { error } = await supabase.rpc(
      "admin_set_user_role" as never,
      { _user_id: row.user_id, _role: "admin", _grant: grant } as never,
    );
    if (error) {
      toast.error(friendlyError(error, "Could not update role."));
      return;
    }
    toast.success(
      grant
        ? `${row.full_name} is now an administrator.`
        : `Removed administrator access from ${row.full_name}.`,
    );
    refresh();
  };

  const filtered = rows ?? [];

  return (
    <Phone>
      <Header />
      <Sheet>
        <div className="mx-auto max-w-4xl space-y-4 pb-10">
          <CanvasHeading eyebrow="Admin" title="Users" />
          {!ready || checking ? (
            <p className="text-sm text-muted-foreground">Checking permissions…</p>
          ) : !user ? (
            <p className="text-sm">
              <Link to="/auth" className="font-semibold text-primary">
                Sign in
              </Link>{" "}
              as an administrator.
            </p>
          ) : !admin ? (
            <p className="text-sm text-muted-foreground">Administrator access required.</p>
          ) : (
            <>
              <AdminNav />
              <p className="text-sm text-muted-foreground">
                Manage learner and trainer profiles. Creating a brand-new sign-in isn't available
                here — invite people to sign up directly; this screen manages their profile once
                they have an account.
              </p>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name (up to 100 results)"
                aria-label="Search users"
                className="max-w-sm"
              />
              {isLoading && <p className="text-sm text-muted-foreground">Loading users…</p>}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  Could not load users. Run the admin users migration in Supabase first.
                </p>
              )}
              {!isLoading && !error && filtered.length === 0 && (
                <p className="py-8 text-sm text-muted-foreground">No users found.</p>
              )}
              <div className="space-y-2">
                {filtered.map((row) => (
                  <div key={row.user_id} className="rounded-2xl border border-border p-4">
                    {editing === row.user_id ? (
                      <div className="space-y-2">
                        <Input
                          value={edit.full_name}
                          onChange={(e) => setEdit({ ...edit, full_name: e.target.value })}
                          placeholder="Full name"
                          aria-label="Full name"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={edit.region}
                            onChange={(e) => setEdit({ ...edit, region: e.target.value })}
                            placeholder="Region"
                            aria-label="Region"
                          />
                          <Input
                            value={edit.learner_role}
                            onChange={(e) => setEdit({ ...edit, learner_role: e.target.value })}
                            placeholder="Role"
                            aria-label="Learner role"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveEdit}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold">
                              {row.full_name}{" "}
                              {adminIds?.has(row.user_id) && (
                                <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                  Admin
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {row.learner_role} · {row.region}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setOpen(open === row.user_id ? null : row.user_id)}
                            >
                              {open === row.user_id ? "Hide courses" : "View courses"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void toggleAdmin(row, !adminIds?.has(row.user_id))}
                            >
                              {adminIds?.has(row.user_id) ? "Remove admin" : "Make admin"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => void removeProfile(row)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                        {open === row.user_id && (
                          <div className="mt-3">
                            <UserDrilldown userId={row.user_id} onClose={() => setOpen(null)} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Sheet>
    </Phone>
  );
}
