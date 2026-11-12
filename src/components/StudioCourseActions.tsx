import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Copy, MoreHorizontal, PenSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/friendly-error";
import { toast } from "sonner";
import { downloadCourseArchive } from "@/components/CourseArchiveTools";
import { CourseOrganizationButton } from "@/components/LearningOrganizationControls";

type Course = { id: string; title: string; published: boolean };
export function StudioCourseActions({ course, onChanged, revisionOnly = false }: { course: Course; onChanged: () => void; revisionOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const exportArchive = async () => {
    if (busy || !(await confirm({ title: "Export private course content?", description: "This content archive includes your lessons and quiz answer keys. Keep the file private. Media files, learner records and operational settings are not included.", confirmLabel: "Export content archive" }))) return;
    setBusy(true);
    try { await downloadCourseArchive(course.id); } catch (error) { toast.error(friendlyError(error, "Could not export the complete course archive.")); } finally { setBusy(false); }
  };
  const exportScorm = async () => {
    if (busy || !(await confirm({ title: "Export a SCORM 1.2 package?", description: "The package contains quiz answer keys. The destination LMS manages learner access, progress and certificates. Text-based slides are flattened; video links need internet. Unsupported server-dependent activities stop the export. Test the package in the destination LMS before assigning it.", confirmLabel: "Export SCORM package" }))) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("export_course_archive", { _course: course.id });
      if (error) throw error;
      const [{ validateCourseArchive }, { buildScormZip }] = await Promise.all([import("@/lib/course-archive"), import("@/lib/scorm-export")]);
      const bytes = await buildScormZip(validateCourseArchive(data));
      const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/zip" }));
      const a = document.createElement("a"); a.href = url; a.download = "plusticity-scorm-" + course.id + ".zip"; a.click(); URL.revokeObjectURL(url);
    } catch (error) { toast.error(friendlyError(error, "Could not export this course as a portable SCORM package.")); } finally { setBusy(false); }
  };
  const copy = async (revision: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("studio_copy_draft", { _course_id: course.id, _revision: revision });
      if (error || !data) throw error ?? new Error("Copy failed");
      onChanged();
      toast.success(revision ? "Draft revision ready. Your published course is unchanged." : "Course copied as a new draft.");
      navigate({ to: "/studio/$id", params: { id: data } });
    } catch (error) { toast.error(friendlyError(error, "We couldn't create the draft. Please try again.")); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (course.published || busy) return;
    if (!(await confirm({ tone: "danger", title: "Delete this draft course?", description: `“${course.title}”, its lessons, quizzes and saved import work will be permanently deleted. This cannot be undone.`, confirmLabel: "Delete course", cancelLabel: "Keep course" }))) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("studio_delete_draft", { _course_id: course.id });
      if (error || data !== "deleted") throw new Error("Delete failed");
      toast.success("Draft course deleted."); onChanged();
      navigate({ to: "/studio" });
    } catch (error) { toast.error(friendlyError(error, "We couldn't delete this draft. Please try again.")); }
    finally { setBusy(false); }
  };
  if (revisionOnly) return <Button size="sm" disabled={busy} onClick={() => copy(true)}><PenSquare className="h-4 w-4" />{busy ? "Preparing…" : "Create draft revision"}</Button>;
  return <><CourseOrganizationButton course={course} /><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="outline" disabled={busy} aria-label={`Actions for ${course.title}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
    <DropdownMenuItem asChild><Link to="/studio/$id" params={{ id: course.id }}><PenSquare className="h-4 w-4" />Open course</Link></DropdownMenuItem>
    {course.published && <DropdownMenuItem onClick={() => copy(true)}><PenSquare className="h-4 w-4" />Create draft revision</DropdownMenuItem>}
    <DropdownMenuItem onClick={() => copy(false)}><Copy className="h-4 w-4" />Duplicate as draft</DropdownMenuItem>
    <DropdownMenuItem onClick={exportArchive}>Export content archive</DropdownMenuItem>
    <DropdownMenuItem onClick={exportScorm}>Export SCORM 1.2 package</DropdownMenuItem>
    <DropdownMenuItem disabled={course.published} className="text-destructive" onClick={remove}><Trash2 className="h-4 w-4" />Delete draft</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu></>;
}
