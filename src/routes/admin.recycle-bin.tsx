import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Phone, Header, Sheet, CanvasHeading, useIsAdmin } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useLearning";
import { useConfirm } from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/friendly-error";
import { listDeletedCourses, permanentlyDeleteCourse, restoreDeletedCourse } from "@/lib/recycle-bin.functions";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/admin/recycle-bin")({
  head: () => pageMeta("Recycle bin — Plusticity", "Deleted courses, recoverable by an administrator."),
  component: RecycleBinPage,
});

function RecycleBinPage() {
  const { user, ready } = useAuth();
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const listFn = useServerFn(listDeletedCourses);
  const restoreFn = useServerFn(restoreDeletedCourse);
  const destroyFn = useServerFn(permanentlyDeleteCourse);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: courses, isLoading } = useQuery({
    queryKey: ["recycle-bin"],
    enabled: isAdmin,
    queryFn: () => listFn(),
  });

  const restore = async (id: string, title: string) => {
    setBusyId(id);
    try {
      await restoreFn({ data: { courseId: id } });
      toast.success(`"${title}" restored — the trainer can see it again in Studio.`);
      void qc.invalidateQueries({ queryKey: ["recycle-bin"] });
    } catch (e) {
      toast.error(friendlyError(e, "Could not restore this course."));
    } finally {
      setBusyId(null);
    }
  };

  const destroy = async (id: string, title: string) => {
    const ok = await confirm({
      tone: "danger",
      title: "Permanently delete this course?",
      confirmLabel: "Delete permanently",
      cancelLabel: "Keep in bin",
      description: <p>This removes <strong>{title}</strong> and all of its lessons for good. This can't be undone.</p>,
    });
    if (!ok) return;
    setBusyId(id);
    try {
      await destroyFn({ data: { courseId: id } });
      toast.success(`"${title}" permanently deleted.`);
      void qc.invalidateQueries({ queryKey: ["recycle-bin"] });
    } catch (e) {
      toast.error(friendlyError(e, "Could not delete this course."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Phone>
      <Header />
      <Sheet wide>
        <CanvasHeading eyebrow="Admin" title="Recycle bin" />
        {!ready ? (
          <p className="py-8 text-sm text-muted-foreground">Checking permissions…</p>
        ) : !user ? (
          <p className="py-8 text-sm"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> as an administrator.</p>
        ) : !isAdmin ? (
          <p className="py-8 text-sm text-muted-foreground">Administrator access required.</p>
        ) : (
          <div className="space-y-4 pb-10">
            <AdminNav />
            <p className="text-sm text-muted-foreground">
              Courses a trainer deleted go here first — only an administrator can restore them or remove them for good.
            </p>
            {isLoading ? (
              <p className="py-8 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></p>
            ) : !courses?.length ? (
              <p className="py-8 text-sm text-muted-foreground">The recycle bin is empty.</p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {courses.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.category} · by {c.author_name} · deleted {new Date(c.deleted_at!).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => void restore(c.id, c.title)}>
                        {busyId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}Restore
                      </Button>
                      <Button size="sm" variant="destructive" disabled={busyId === c.id} onClick={() => void destroy(c.id, c.title)}>
                        <Trash2 className="h-4 w-4" />Delete permanently
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
