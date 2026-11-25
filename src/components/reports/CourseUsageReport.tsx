import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { checkVideoLinks } from "@/lib/external-content.functions";
import { readAllPages } from "@/lib/database-pages";
import { friendlyError } from "@/lib/friendly-error";

export function CourseUsageReport() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const runCheck = useServerFn(checkVideoLinks);
  const {
    data: isAdmin,
    isLoading: checking,
    error: roleError,
  } = useQuery({
    queryKey: ["admin-home-role", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user!.id,
        _role: "admin",
      });
      if (error) throw error;
      return data === true;
    },
  });
  const {
    data: items = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["ext-course-usage", user?.id],
    enabled: !!isAdmin,
    queryFn: async () =>
      (
        await readAllPages(
          supabase
            .from("external_content_items")
            .select(
              "id,title,import_status,links:course_external_content(course:studio_courses(id,title,published))",
              { count: "exact" },
            )
            .order("created_at", { ascending: false })
            .order("id"),
        )
      ).data,
  });
  const reload = () => {
    for (const key of ["ext-course-usage", "ext-items", "ext-imports", "video-library"])
      void qc.invalidateQueries({ queryKey: [key] });
  };
  const checkLinks = async () => {
    setBusy(true);
    try {
      const r = await runCheck();
      (r.broken ? toast.warning : toast.success)(
        r.broken
          ? `${r.broken} video link${r.broken === 1 ? " is" : "s are"} unavailable.`
          : `All ${r.ok} video links are working.`,
      );
      reload();
    } catch (e) {
      toast.error(friendlyError(e, "The link check didn't finish."));
    } finally {
      setBusy(false);
    }
  };
  const status = (value: string) => (
    <span
      className={
        "ml-2 rounded-full px-2 py-0.5 text-xs " +
        (value === "active" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")
      }
    >
      {value === "active" ? "Available" : value === "unavailable" ? "Unavailable" : "Pending"}
    </span>
  );
  if (!ready || (user && checking))
    return <p className="py-8 text-sm text-muted-foreground">Checking permissions…</p>;
  if (!user)
    return (
      <p className="py-8 text-sm text-muted-foreground">
        <Link to="/auth" className="font-semibold text-primary">
          Sign in
        </Link>{" "}
        to view course usage.
      </p>
    );
  if (roleError)
    return <p role="alert">Could not check report access. Please refresh to try again.</p>;
  if (!isAdmin)
    return <p className="py-8 text-sm text-muted-foreground">Administrator access required.</p>;
  if (isLoading) return <p className="py-8 text-sm text-muted-foreground">Loading course usage…</p>;
  if (error) return <p role="alert">Could not load course usage. Please refresh to try again.</p>;
  return (
    <div className="space-y-4 pb-10">
      <Button variant="outline" disabled={busy} onClick={checkLinks}>
        <RefreshCw className="h-4 w-4" />
        Check for broken links
      </Button>
      <section>
        <h3 className="font-semibold">Used in courses</h3>
        <ul className="mt-2 space-y-2">
          {items
            .filter((i) => i.links.length)
            .map((i) => (
              <li key={i.id} className="rounded-xl border border-border p-3 text-sm">
                <p className="font-medium">
                  {i.title} {status(i.import_status)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {i.links
                    .map((l) =>
                      l.course ? `${l.course.title}${l.course.published ? "" : " (draft)"}` : "",
                    )
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          {!items.some((i) => i.links.length) && (
            <li className="text-sm text-muted-foreground">No videos are used in courses yet.</li>
          )}
        </ul>
      </section>
      <section>
        <h3 className="font-semibold">Not assigned to any course</h3>
        <p className="text-sm text-muted-foreground">
          {items
            .filter((i) => !i.links.length)
            .map((i) => i.title)
            .join(" · ") || "Every video is in use."}
        </p>
      </section>
      <section>
        <h3 className="font-semibold">Unavailable links</h3>
        <p className="text-sm text-muted-foreground">
          {items
            .filter((i) => i.import_status === "unavailable")
            .map((i) => i.title)
            .join(" · ") || "None found."}
        </p>
      </section>
    </div>
  );
}
