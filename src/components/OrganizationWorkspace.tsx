import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useLearning";
import { useConfirm } from "@/components/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/database-pages";
import { friendlyError } from "@/lib/friendly-error";
import { departmentPath } from "@/lib/organizations";

export function OrganizationWorkspace({ organizationId }: { organizationId: string }) {
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [welcome, setWelcome] = useState("");
  const [color, setColor] = useState("#2765BC");
  const [logo, setLogo] = useState("");
  const [department, setDepartment] = useState("");
  const [newDepartmentId, setNewDepartmentId] = useState<string>(() => crypto.randomUUID());
  const [departmentVersion, setDepartmentVersion] = useState(0);
  const [departmentName, setDepartmentName] = useState("");
  const [parent, setParent] = useState("");
  const [person, setPerson] = useState("");
  const [personVersion, setPersonVersion] = useState(0);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("learner");
  const [memberDepartment, setMemberDepartment] = useState("");
  const [manager, setManager] = useState("");
  const [job, setJob] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const orgs = useQuery({
    queryKey: ["my-organizations", user?.id],
    enabled: !!user,
    refetchInterval: 30000,
    queryFn: async () =>
      (
        await readAllPages(
          supabase.rpc("my_organizations", {}, { count: "exact" }).order("name").order("id"),
        )
      ).data,
  });
  const org = orgs.data?.find((o) => o.id === organizationId);
  const directory = useQuery({
    queryKey: ["organization-directory", organizationId, user?.id],
    enabled: !!org,
    refetchInterval: 30000,
    queryFn: async () => {
      const [departments, people] = await Promise.all([
        readAllPages(
          supabase
            .from("organization_departments")
            .select("*", { count: "exact" })
            .eq("organization_id", organizationId)
            .order("name")
            .order("id"),
        ),
        readAllPages(
          supabase
            .rpc("organization_people", { _organization: organizationId }, { count: "exact" })
            .order("full_name")
            .order("user_id"),
        ),
      ]);
      return { departments: departments.data, people: people.data };
    },
  });
  useEffect(() => {
    if (!org) return;
    setName(org.name);
    setWelcome(org.welcome);
    setColor(org.brand_color);
    setLogo(org.logo_url ?? "");
  }, [org]);
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["my-organizations", user?.id] }),
      qc.invalidateQueries({ queryKey: ["organization-directory", organizationId] }),
    ]);
  };
  const mutate = async (action: () => PromiseLike<{ error: unknown }>, success: string) => {
    if (busy) return false;
    setBusy(true);
    try {
      const { error } = await action();
      if (error) throw error;
      await refresh();
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(friendlyError(error));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const saveBrand = () => {
    if (!org) return;
    mutate(
      () =>
        supabase.rpc("save_organization", {
          _organization: organizationId,
          _name: name.trim(),
          _welcome: welcome,
          _color: color,
          _logo: logo.trim() || null,
          _expected: org.version,
        }),
      "Organization settings saved.",
    );
  };
  const saveDepartment = async () => {
    const saved = await mutate(
      () =>
        supabase.rpc("save_organization_department", {
          _organization: organizationId,
          _department: department || newDepartmentId,
          _name: departmentName.trim(),
          _parent: parent || null,
          _expected: departmentVersion,
        }),
      "Department saved.",
    );
    if (saved) {
      setDepartment("");
      setDepartmentName("");
      setParent("");
      setDepartmentVersion(0);
      setNewDepartmentId(crypto.randomUUID());
    }
  };
  const savePerson = async () => {
    if (
      !(await confirm({
        title: person ? "Update workspace member?" : "Add this registered member?",
        description:
          role === "manager"
            ? "Workspace managers can manage this organization's branding, departments and members."
            : "The member can open this workspace and view their own directory details. Course access is managed separately.",
        confirmLabel: "Save member",
      }))
    )
      return;
    const saved = await mutate(
      () =>
        supabase.rpc("set_organization_member", {
          _organization: organizationId,
          _email: email.trim(),
          _role: role,
          _department: memberDepartment || null,
          _manager: manager || null,
          _job: job,
          _expected: personVersion,
        }),
      "Workspace member saved.",
    );
    if (saved) {
      setPerson("");
      setPersonVersion(0);
      setEmail("");
      setRole("learner");
      setMemberDepartment("");
      setManager("");
      setJob("");
    }
  };
  const removePerson = async (id: string, version: number) => {
    if (
      !(await confirm({
        title: "Remove this workspace member?",
        description:
          "Their workspace access ends and their reporting lines are cleared. Course purchases, learning records and certificates are retained.",
        tone: "danger",
        confirmLabel: "Remove member",
      }))
    )
      return;
    mutate(
      () =>
        supabase.rpc("remove_organization_member", {
          _organization: organizationId,
          _user: id,
          _expected: version,
        }),
      "Workspace member removed.",
    );
  };
  const people =
    directory.data?.people.filter((p) =>
      (p.full_name + " " + p.email + " " + p.job_title)
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <Phone>
      <Header />
      <Sheet wide>
        <CanvasHeading title={org?.name ?? "Organization workspace"} />
        {!ready ? (
          <p>Checking sign-in…</p>
        ) : !user ? (
          <Link to="/auth">Sign in</Link>
        ) : orgs.isPending ? (
          <p>Loading workspace…</p>
        ) : orgs.isError ? (
          <p role="alert">Could not load this workspace.</p>
        ) : !org ? (
          <p>This workspace is unavailable or your membership has ended.</p>
        ) : (
          <div className="space-y-5">
            <section
              className="space-y-3 rounded-xl border-t-4 p-5 shadow-sm"
              style={{ borderTopColor: org.brand_color }}
            >
              {org.logo_url && (
                <img
                  src={org.logo_url}
                  alt={org.name + " logo"}
                  className="max-h-28 max-w-64 object-contain"
                  referrerPolicy="no-referrer"
                />
              )}
              <h2 className="text-xl font-semibold">Welcome to {org.name}</h2>
              <p className="whitespace-pre-wrap">{org.welcome}</p>
              <Link className="font-semibold text-primary underline" to="/courses">
                Open my learning
              </Link>
              <Link className="ml-5 text-primary underline" to="/organizations">
                Switch organization
              </Link>
            </section>
            {org.can_manage && (
              <section className="space-y-3 rounded-xl border p-4">
                <h2 className="font-semibold">Workspace branding</h2>
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
                  Welcome message
                  <Textarea
                    value={welcome}
                    maxLength={5000}
                    disabled={busy}
                    onChange={(e) => setWelcome(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Brand accent
                  <Input
                    type="color"
                    value={color}
                    disabled={busy}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Logo address (HTTPS)
                  <Input
                    type="url"
                    value={logo}
                    disabled={busy}
                    onChange={(e) => setLogo(e.target.value)}
                  />
                </label>
                <Button disabled={busy || name.trim().length < 2} onClick={saveBrand}>
                  Save branding
                </Button>
              </section>
            )}
            {directory.isPending ? (
              <p>Loading directory…</p>
            ) : directory.isError ? (
              <p role="alert">Could not load your workspace directory.</p>
            ) : (
              <>
                <section className="space-y-3 rounded-xl border p-4">
                  <h2 className="font-semibold">Departments</h2>
                  {!directory.data.departments.length && <p>No departments yet.</p>}
                  {directory.data.departments.map((d) => (
                    <p className="text-sm" key={d.id}>
                      {departmentPath(d.id, directory.data.departments)}
                    </p>
                  ))}
                  {org.can_manage && (
                    <div className="space-y-3">
                      <select
                        className="w-full rounded border p-2"
                        aria-label="Edit department"
                        value={department}
                        disabled={busy}
                        onChange={(e) => {
                          const d = directory.data.departments.find((d) => d.id === e.target.value);
                          setDepartment(d?.id ?? "");
                          setDepartmentVersion(d?.version ?? 0);
                          setNewDepartmentId(crypto.randomUUID());
                          setDepartmentName(d?.name ?? "");
                          setParent(d?.parent_id ?? "");
                        }}
                      >
                        <option value="">New department</option>
                        {directory.data.departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {departmentPath(d.id, directory.data.departments)}
                          </option>
                        ))}
                      </select>
                      <Input
                        aria-label="Department name"
                        value={departmentName}
                        maxLength={200}
                        placeholder="Department name"
                        disabled={busy}
                        onChange={(e) => setDepartmentName(e.target.value)}
                      />
                      <select
                        className="w-full rounded border p-2"
                        aria-label="Parent department"
                        value={parent}
                        disabled={busy}
                        onChange={(e) => setParent(e.target.value)}
                      >
                        <option value="">Top-level department</option>
                        {directory.data.departments
                          .filter((d) => d.id !== department)
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {departmentPath(d.id, directory.data.departments)}
                            </option>
                          ))}
                      </select>
                      <Button disabled={busy || !departmentName.trim()} onClick={saveDepartment}>
                        Save department
                      </Button>
                    </div>
                  )}
                </section>
                <section className="space-y-3 rounded-xl border p-4">
                  <h2 className="font-semibold">
                    {org.can_manage ? "Workspace members" : "My directory details"}
                  </h2>
                  <Input
                    aria-label="Find workspace member"
                    placeholder="Find a member"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                  />
                  {people.slice(page * 50, page * 50 + 50).map((p) => (
                    <article key={p.user_id} className="space-y-2 rounded border p-3 text-sm">
                      <p className="font-semibold">
                        {p.full_name} ·{" "}
                        {p.is_owner
                          ? "Workspace owner"
                          : p.role === "manager"
                            ? "Workspace manager"
                            : "Learner"}
                      </p>
                      <p>
                        {p.job_title || "No job title"}
                        {p.department_id
                          ? ` · ${departmentPath(p.department_id, directory.data.departments)}`
                          : ""}
                      </p>
                      {p.manager_id && <p>Reports to {p.manager_name || "Workspace member"}</p>}
                      {org.can_manage && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || (p.is_owner && p.user_id !== user.id)}
                            onClick={() => {
                              setPerson(p.user_id);
                              setPersonVersion(p.version);
                              setEmail(p.email);
                              setRole(p.role);
                              setMemberDepartment(p.department_id ?? "");
                              setManager(p.manager_id ?? "");
                              setJob(p.job_title);
                            }}
                          >
                            Edit member
                          </Button>
                          {p.user_id !== user.id && !p.is_owner && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => removePerson(p.user_id, p.version)}
                            >
                              Remove member
                            </Button>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                  <div className="flex gap-3">
                    <Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {page + 1} · {people.length} members
                    </span>
                    <Button
                      variant="outline"
                      disabled={(page + 1) * 50 >= people.length}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                  {org.can_manage && (
                    <div className="space-y-3 border-t pt-4">
                      <h3 className="font-semibold">
                        {person ? "Edit member" : "Add registered member"}
                      </h3>
                      <label className="block text-sm">
                        Registered email
                        <Input
                          type="email"
                          value={email}
                          disabled={busy || !!person}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </label>
                      <label className="block text-sm">
                        Workspace role
                        <select
                          className="block w-full rounded border p-2"
                          value={role}
                          disabled={busy}
                          onChange={(e) => setRole(e.target.value)}
                        >
                          <option value="learner">Learner</option>
                          <option value="manager">Workspace manager</option>
                        </select>
                      </label>
                      <label className="block text-sm">
                        Job title
                        <Input
                          value={job}
                          maxLength={200}
                          disabled={busy}
                          onChange={(e) => setJob(e.target.value)}
                        />
                      </label>
                      <select
                        className="w-full rounded border p-2"
                        aria-label="Member department"
                        value={memberDepartment}
                        disabled={busy}
                        onChange={(e) => setMemberDepartment(e.target.value)}
                      >
                        <option value="">No department</option>
                        {directory.data.departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {departmentPath(d.id, directory.data.departments)}
                          </option>
                        ))}
                      </select>
                      <select
                        className="w-full rounded border p-2"
                        aria-label="Reports to"
                        value={manager}
                        disabled={busy}
                        onChange={(e) => setManager(e.target.value)}
                      >
                        <option value="">No reporting manager</option>
                        {directory.data.people
                          .filter((p) => p.user_id !== person)
                          .map((p) => (
                            <option key={p.user_id} value={p.user_id}>
                              {p.full_name}
                            </option>
                          ))}
                      </select>
                      <div className="flex gap-3">
                        <Button disabled={busy || !email.trim()} onClick={savePerson}>
                          Save member
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setPerson("");
                            setPersonVersion(0);
                            setEmail("");
                            setRole("learner");
                            setMemberDepartment("");
                            setManager("");
                            setJob("");
                          }}
                        >
                          New member
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
