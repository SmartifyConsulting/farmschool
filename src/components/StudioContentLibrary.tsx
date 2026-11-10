import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileArchive,
  FileText,
  Image as ImageIcon,
  Library,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Video,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { useConfirm } from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/friendly-error";
import { extractDocument } from "@/lib/document-extraction";
import { analyzeContentFile } from "@/lib/studio-ai.functions";
import {
  CONTENT_TYPE_LABELS,
  TEXT_EXTRACTABLE_TYPES,
  detectContentFileType,
  inferModuleId,
  sha256Hex,
  type ContentFileType,
} from "@/lib/studio-content";
import { toast } from "sonner";

const MAX_FILE_BYTES = 500 * 1024 * 1024;

const TYPE_ICON: Record<ContentFileType, typeof Video> = {
  video: Video,
  pdf: FileText,
  text: FileText,
  document: FileText,
  image: ImageIcon,
  scorm: FileArchive,
};

type ContentFile = {
  id: string;
  course_id: string;
  module_id: string | null;
  file_name: string;
  original_file_name: string;
  file_type: string;
  storage_path: string;
  size_bytes: number;
  description: string;
  classification: string;
  keywords: string[];
  file_hash: string | null;
  created_at: string;
};

type PendingUpload = {
  key: string;
  file: File;
  type: ContentFileType;
  originalName: string;
  displayName: string;
  moduleId: string;
  hash: string;
  description: string;
  classification: string;
  keywords: string[];
  aiConfident: boolean;
  duplicateOf: string | null;
  analyzing: boolean;
};

/** Strips the extension so the editable name field never shows it, then reattaches it on save. */
function splitExt(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return { base: fileName, ext: "" };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot) };
}

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
  const analyze = useServerFn(analyzeContentFile);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [committing, setCommitting] = useState(false);
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
      original_file_name: item.original_file_name,
      file_type: item.file_type,
      storage_path: item.storage_path,
      size_bytes: item.size_bytes,
      description: item.description,
      classification: item.classification,
      keywords: item.keywords,
      file_hash: item.file_hash,
    });
    if (error) {
      toast.error(friendlyError(error, "Could not add this file."));
      return;
    }
    toast.success(`Added "${item.file_name}" to this course.`);
    qc.invalidateQueries({ queryKey: ["studio-content-files", courseId] });
  };

  /** Stages selected files for review: hashes them for duplicate detection, extracts text where
   * possible and asks the AI assistant for a name/description/classification/module suggestion.
   * Nothing uploads yet — the trainer reviews and edits each suggestion first. */
  const selectFiles = async (incoming: File[]) => {
    if (!user) return;
    const staged: PendingUpload[] = [];
    for (const file of incoming) {
      const type = detectContentFileType(file.name);
      if (!type) {
        toast.error(
          `"${file.name}" isn't a supported type. Use MP4, PDF, DOCX, PPTX, TXT, an image or a SCORM .zip.`,
        );
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`"${file.name}" is larger than 500MB.`);
        continue;
      }
      const hash = await sha256Hex(file);
      const existingDup = files.find((f) => f.file_hash === hash);
      const stagedDup = staged.find((p) => p.hash === hash);
      const duplicateName = existingDup?.file_name ?? stagedDup?.displayName ?? null;
      staged.push({
        key: crypto.randomUUID(),
        file,
        type,
        originalName: file.name,
        displayName: file.name,
        moduleId: inferModuleId(file.name, modules) ?? "",
        hash,
        description: "",
        classification: "",
        keywords: [],
        aiConfident: false,
        duplicateOf: duplicateName,
        analyzing: TEXT_EXTRACTABLE_TYPES.includes(type),
      });
    }
    if (!staged.length) return;
    setPending((prev) => [...prev, ...staged]);

    for (const item of staged) {
      if (!TEXT_EXTRACTABLE_TYPES.includes(item.type)) continue;
      try {
        const pages = await extractDocument(item.file);
        const text = pages
          .map((p) => p.text)
          .join("\n\n")
          .slice(0, 16000);
        const result = await analyze({
          data: {
            courseId,
            fileName: item.originalName,
            extractedText: text,
            moduleTitles: modules.map((m) => m.title),
          },
        });
        const matchedModule = result.suggestedModuleTitle
          ? modules.find((m) => m.title === result.suggestedModuleTitle)
          : undefined;
        setPending((prev) =>
          prev.map((p) =>
            p.key === item.key
              ? {
                  ...p,
                  displayName: result.suggestedFileName ?? p.displayName,
                  description: result.description,
                  classification: result.classification,
                  keywords: result.keywords,
                  moduleId: matchedModule?.id ?? p.moduleId,
                  aiConfident: !!result.suggestedFileName,
                  analyzing: false,
                }
              : p,
          ),
        );
      } catch {
        // Extraction/AI failures are non-fatal — the original file name stays editable as-is.
        setPending((prev) =>
          prev.map((p) => (p.key === item.key ? { ...p, analyzing: false } : p)),
        );
      }
    }
  };

  const updatePending = (key: string, patch: Partial<PendingUpload>) =>
    setPending((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const discardPending = (key: string) => setPending((prev) => prev.filter((p) => p.key !== key));

  const commitUploads = async () => {
    if (!user || !pending.length) return;
    setCommitting(true);
    for (const item of pending) {
      const name = item.displayName.trim() || item.originalName;
      try {
        const path = `${user.id}/${courseId}/${crypto.randomUUID()}-${item.originalName}`;
        const { error: uploadError } = await supabase.storage
          .from("studio-content")
          .upload(path, item.file, item.file.type ? { contentType: item.file.type } : {});
        if (uploadError) throw uploadError;
        const { error: insertError } = await supabase.from("studio_content_files").insert({
          course_id: courseId,
          module_id: item.moduleId || null,
          file_name: name,
          original_file_name: item.originalName,
          file_type: item.type,
          storage_path: path,
          size_bytes: item.file.size,
          description: item.description,
          classification: item.classification,
          keywords: item.keywords,
          file_hash: item.hash,
        });
        if (insertError) throw insertError;
      } catch (error) {
        toast.error(friendlyError(error, `Could not upload "${item.originalName}".`));
      }
    }
    setCommitting(false);
    setPending([]);
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
            Upload MP4 videos, PDFs, Word/PowerPoint files, images, text files or SCORM packages
            (.zip). AI suggests a descriptive name, description and module for each file — review
            and edit before it's added.
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
            if (dropped.length) void selectFiles(dropped);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center text-sm ${dragging ? "border-primary bg-primary/5" : "border-input"}`}
        >
          <Upload className="h-7 w-7 text-muted-foreground" />
          <p className="font-semibold">Upload content files</p>
          <p className="text-muted-foreground">
            Drag files here or click to browse. MP4, PDF, DOCX, PPTX, images, TXT or SCORM .zip, up
            to 500MB each.
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".mp4,.mov,.m4v,.webm,.pdf,.txt,.md,.docx,.pptx,.jpg,.jpeg,.png,.webp,.zip"
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              if (picked.length) void selectFiles(picked);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {pending.length > 0 && (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" />
            Review before adding ({pending.length})
          </p>
          <ul className="space-y-3">
            {pending.map((item) => {
              const Icon = TYPE_ICON[item.type];
              const { base, ext } = splitExt(item.displayName);
              return (
                <li key={item.key} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start gap-3">
                    <Icon className="mt-2 h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={base}
                          onChange={(e) =>
                            updatePending(item.key, { displayName: `${e.target.value}${ext}` })
                          }
                          aria-label={`Name for ${item.originalName}`}
                          className="text-sm font-medium"
                        />
                        <span className="shrink-0 text-xs text-muted-foreground">{ext}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Original: {item.originalName}
                        {item.analyzing && (
                          <span className="ml-2 inline-flex items-center gap-1 text-primary">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Analysing…
                          </span>
                        )}
                        {!item.analyzing && item.aiConfident && (
                          <span className="ml-2 text-primary">AI-suggested name</span>
                        )}
                      </p>
                      {item.duplicateOf && (
                        <p className="flex items-center gap-1 text-xs text-amber-600">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          This looks identical to "{item.duplicateOf}" already in your library.
                        </p>
                      )}
                      {item.description && (
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      )}
                      {(item.classification || item.keywords.length > 0) && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.classification && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                              {item.classification}
                            </span>
                          )}
                          {item.keywords.map((k) => (
                            <span
                              key={k}
                              className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {k}
                            </span>
                          ))}
                        </div>
                      )}
                      <select
                        aria-label={`Module for ${item.originalName}`}
                        value={item.moduleId}
                        onChange={(e) => updatePending(item.key, { moduleId: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                      >
                        <option value="">Unassigned</option>
                        {modules.map((mod) => (
                          <option key={mod.id} value={mod.id}>
                            {mod.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${item.originalName} from upload`}
                      onClick={() => discardPending(item.key)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPending([])} disabled={committing}>
              Cancel all
            </Button>
            <Button size="sm" onClick={commitUploads} disabled={committing}>
              {committing ? "Uploading…" : `Add ${pending.length} file${pending.length > 1 ? "s" : ""}`}
            </Button>
          </div>
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
                          {file.classification ? ` · ${file.classification}` : ""}
                        </p>
                        {file.description && (
                          <p className="mt-1 text-xs text-muted-foreground">{file.description}</p>
                        )}
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
