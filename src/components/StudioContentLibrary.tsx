import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileArchive, FileText, Library, Plus, Trash2, Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { useConfirm } from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/friendly-error";
import {
  CONTENT_TYPE_LABELS,
  detectContentFileType,
  inferModuleId,
  type ContentFileType,
} from "@/lib/studio-content";
import { toast } from "sonner";

const MAX_FILE_BYTES = 500 * 1024 * 1024;

const TYPE_ICON: Record<ContentFileType, typeof Video> = {
  video: Video,
  pdf: FileText,
  text: FileText,
  scorm: FileArchive,
};

type ContentFile = {
  id: string;
  course_id: string;
  module_id: string | null;
  file_name: string;
  file_type: string;
  storage_path: string;
  size_bytes: number;
  created_at: string;
};

export function StudioContentLibrary({
  courseId,
  modules,
  readOnly = false,
}: {
  courseId: string;
  modules: { id: string; title: string }[];
  readOnly?: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [catalogueSearch, setCatalogueSearch] = useState("");

  const { data: files = [] } = useQuery({
    queryKey: ["studio-content-files", courseId],
    queryFn: async () =>
      ((
        await supabase
          .from("studio_content_files")
          .select("*")
          .eq("course_id", courseId)
          .order("created_at", { ascending: false })
      ).data ?? []) as ContentFile[],
  });

  const { data: catalogue = [] } = useQuery({
    queryKey: ["studio-content-catalogue", user?.id, courseId],
    enabled: catalogueOpen && !!user,
    queryFn: async () => {
      const { data: courses } = await supabase
        .from("studio_courses")
        .select("id, title")
        .eq("author_id", user!.id)
        .neq("id", courseId);
      const courseIds = (courses ?? []).map((c) => c.id);
      if (courseIds.length === 0) return [];
      const titleById = new Map((courses ?? []).map((c) => [c.id, c.title]));
      const { data: items } = await supabase
        .from("studio_content_files")
        .select("*")
        .in("course_id", courseIds)
        .order("created_at", { ascending: false });
      return ((items ?? []) as ContentFile[]).map((f) => ({
        ...f,
        course_title: titleById.get(f.course_id) ?? "Course",
      }));
    },
  });

  const reuse = async (item: ContentFile & { course_title: string }) => {
    const { error } = await supabase.from("studio_content_files").insert({
      course_id: courseId,
      module_id: inferModuleId(item.file_name, modules),
      file_name: item.file_name,
      file_type: item.file_type,
      storage_path: item.storage_path,
      size_bytes: item.size_bytes,
    });
    if (error) {
      toast.error(friendlyError(error, "Could not add this file."));
      return;
    }
    toast.success(`Added "${item.file_name}" to this course.`);
    qc.invalidateQueries({ queryKey: ["studio-content-files", courseId] });
  };

  const uploadFiles = async (incoming: File[]) => {
    if (!user) return;
    for (const file of incoming) {
      const type = detectContentFileType(file.name);
      if (!type) {
        toast.error(`"${file.name}" isn't a supported type. Use MP4, PDF, TXT or a SCORM .zip.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`"${file.name}" is larger than 500MB.`);
        continue;
      }
      setUploading(file.name);
      try {
        const path = `${user.id}/${courseId}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("studio-content")
          .upload(path, file, file.type ? { contentType: file.type } : {});
        if (uploadError) throw uploadError;
        const { error: insertError } = await supabase.from("studio_content_files").insert({
          course_id: courseId,
          module_id: inferModuleId(file.name, modules),
          file_name: file.name,
          file_type: type,
          storage_path: path,
          size_bytes: file.size,
        });
        if (insertError) throw insertError;
      } catch (error) {
        toast.error(friendlyError(error, `Could not upload "${file.name}".`));
      }
    }
    setUploading(null);
    qc.invalidateQueries({ queryKey: ["studio-content-files", courseId] });
  };

  const removeFile = async (file: ContentFile) => {
    if (
      !(await confirm({
        title: "Delete this file?",
        description: `"${file.file_name}" will be permanently removed.`,
        confirmLabel: "Delete",
        tone: "danger",
      }))
    )
      return;
    const { count } = await supabase
      .from("studio_content_files")
      .select("id", { count: "exact", head: true })
      .eq("storage_path", file.storage_path);
    if ((count ?? 0) <= 1) {
      const { error: storageError } = await supabase.storage
        .from("studio-content")
        .remove([file.storage_path]);
      if (storageError) {
        toast.error(friendlyError(storageError, "Could not delete the file."));
        return;
      }
    }
    const { error } = await supabase.from("studio_content_files").delete().eq("id", file.id);
    if (error) {
      toast.error(friendlyError(error, "Could not delete the file."));
      return;
    }
    toast.success("File deleted.");
    qc.invalidateQueries({ queryKey: ["studio-content-files", courseId] });
  };

  const reassign = async (file: ContentFile, moduleId: string) => {
    const { error } = await supabase
      .from("studio_content_files")
      .update({ module_id: moduleId || null })
      .eq("id", file.id);
    if (error) {
      toast.error(friendlyError(error, "Could not move the file."));
      return;
    }
    qc.invalidateQueries({ queryKey: ["studio-content-files", courseId] });
  };

  const groups = [
    ...modules.map((mod) => ({
      key: mod.id,
      title: mod.title,
      files: files.filter((f) => f.module_id === mod.id),
    })),
    {
      key: "unassigned",
      title: "Unassigned",
      files: files.filter((f) => !f.module_id || !modules.some((m) => m.id === f.module_id)),
    },
  ].filter((group) => group.files.length > 0 || group.key !== "unassigned");

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Content library</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload MP4 videos, PDFs, text files or SCORM packages (.zip). Files are automatically
            sorted into the module whose name they best match; reassign any file with the dropdown
            below it.
          </p>
        </div>
        {!readOnly && (
          <Button variant="outline" size="sm" onClick={() => setCatalogueOpen(true)}>
            <Library className="h-4 w-4" />
            Reuse from catalogue
          </Button>
        )}
      </div>
      <Dialog open={catalogueOpen} onOpenChange={setCatalogueOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reuse content from your other courses</DialogTitle>
          </DialogHeader>
          <Input
            value={catalogueSearch}
            onChange={(e) => setCatalogueSearch(e.target.value)}
            placeholder="Search by file name or course"
            aria-label="Search your content catalogue"
          />
          <ul className="mt-2 space-y-2">
            {catalogue
              .filter((item) => {
                const q = catalogueSearch.trim().toLowerCase();
                if (!q) return true;
                return (
                  item.file_name.toLowerCase().includes(q) ||
                  item.course_title.toLowerCase().includes(q)
                );
              })
              .map((item) => {
                const Icon = TYPE_ICON[item.file_type as ContentFileType] ?? FileText;
                const alreadyAdded = files.some((f) => f.storage_path === item.storage_path);
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium">{item.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {CONTENT_TYPE_LABELS[item.file_type as ContentFileType] ?? item.file_type} ·
                        from "{item.course_title}"
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={alreadyAdded}
                      onClick={() => reuse(item)}
                    >
                      <Plus className="h-4 w-4" />
                      {alreadyAdded ? "Added" : "Add"}
                    </Button>
                  </li>
                );
              })}
            {catalogue.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No content in your other courses yet.
              </p>
            )}
          </ul>
        </DialogContent>
      </Dialog>
      {!readOnly && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const dropped = Array.from(e.dataTransfer.files ?? []);
            if (dropped.length && !uploading) void uploadFiles(dropped);
          }}
          onClick={() => !uploading && inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center text-sm ${dragging ? "border-primary bg-primary/5" : "border-input"}`}
        >
          <Upload className="h-7 w-7 text-muted-foreground" />
          <p className="font-semibold">
            {uploading ? `Uploading ${uploading}…` : "Upload content files"}
          </p>
          <p className="text-muted-foreground">
            Drag files here or click to browse. MP4, PDF, TXT or SCORM .zip, up to 500MB each.
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".mp4,.mov,.m4v,.webm,.pdf,.txt,.md,.zip"
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              if (picked.length) void uploadFiles(picked);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No content uploaded yet.</p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.key}>
              <h3 className="text-sm font-semibold">{group.title}</h3>
              <ul className="mt-2 space-y-2">
                {group.files.map((file) => {
                  const Icon = TYPE_ICON[file.file_type as ContentFileType] ?? FileText;
                  return (
                    <li
                      key={file.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
                    >
                      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium">{file.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {CONTENT_TYPE_LABELS[file.file_type as ContentFileType] ?? file.file_type}{" "}
                          · {(file.size_bytes / (1024 * 1024)).toFixed(1)} MB
                        </p>
                      </div>
                      {!readOnly && (
                        <>
                          <select
                            aria-label={`Module for ${file.file_name}`}
                            value={file.module_id ?? ""}
                            onChange={(e) => reassign(file, e.target.value)}
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                          >
                            <option value="">Unassigned</option>
                            {modules.map((mod) => (
                              <option key={mod.id} value={mod.id}>
                                {mod.title}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Delete ${file.file_name}`}
                            onClick={() => removeFile(file)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
