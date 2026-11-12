import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import {
  validateCourseArchive,
  archiveRestoreNotes,
  type CourseArchive,
} from "@/lib/course-archive";
import type { Json } from "@/integrations/supabase/types";

export async function downloadCourseArchive(courseId: string) {
  const { data, error } = await supabase.rpc("export_course_archive", { _course: courseId });
  if (error) throw error;
  const archive = validateCourseArchive(data);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "plusticity-course-" + courseId + ".json";
  a.click();
  URL.revokeObjectURL(url);
}
export function CourseArchiveRestore() {
  const input = useRef<HTMLInputElement>(null);
  const [archive, setArchive] = useState<CourseArchive | null>(null);
  const [request, setRequest] = useState<string>(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const restore = async () => {
    if (!archive || busy) return;
    if (
      !(await confirm({
        title: "Restore as a new draft?",
        description: archiveRestoreNotes(archive).join(" "),
        confirmLabel: "Restore new draft",
      }))
    )
      return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("restore_course_archive", {
        _request: request,
        _archive: archive as unknown as Json,
      });
      if (error || !data) throw error ?? new Error("Restore failed");
      toast.success(
        "Course content restored as a new draft. Review settings and media before publishing.",
      );
      navigate({ to: "/studio/$id", params: { id: data } });
    } catch (error) {
      toast.error(
        friendlyError(
          error,
          "Could not restore this content archive. No partial course was created.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="my-4 space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">Restore course content</h2>
      <p className="text-sm text-muted-foreground">
        Import a Plusticity content archive as a new draft. Archives contain private answer keys;
        keep them secure.
      </p>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        aria-label="Plusticity content archive"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          setArchive(null);
          if (!file) return;
          if (file.size > 5000000) {
            toast.error("Choose an archive smaller than 5 MB.");
            return;
          }
          try {
            const parsed = validateCourseArchive(JSON.parse(await file.text()));
            setArchive(parsed);
            setRequest(crypto.randomUUID());
          } catch {
            toast.error("This file is not a complete supported Plusticity content archive.");
          }
        }}
      />
      {archive && (
        <>
          <p className="font-medium">
            {archive.snapshot.course.title} · {archive.snapshot.lessons.length} lessons
          </p>
          {archiveRestoreNotes(archive).map((note) => (
            <p key={note} className="text-sm">
              {note}
            </p>
          ))}
          <Button
            type="button"
            disabled={busy || archive.snapshot.lessons.some((l) => l.kind === "scorm")}
            onClick={restore}
          >
            Restore new draft
          </Button>
        </>
      )}
    </section>
  );
}
