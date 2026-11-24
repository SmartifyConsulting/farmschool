import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  Download,
  FileArchive,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Library,
  Loader2,
  Pencil,
  Trash2,
  Video,
} from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { useConfirm } from "@/components/ConfirmDialog";
import { toast } from "sonner";
import { BulkCourseUpload } from "@/components/BulkCourseUpload";

export const Route = createFileRoute("/studio/content-library")({
  head: () => ({ meta: [{ title: "Content Library — Plusticity" }] }),
  component: ContentLibraryPage,
});

type ContentFile = {
  id: string;
  file_name: string;
  file_type: string;
  storage_path: string;
  size_bytes: number;
  description: string;
  created_at: string;
  folder_id: string | null;
};
type FolderRow = { id: string; name: string; parent_id: string | null };

const TYPE_ICON: Record<string, typeof Video> = {
  video: Video,
  pdf: FileText,
  text: FileText,
  document: FileText,
  image: ImageIcon,
  scorm: FileArchive,
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The trainer's single cross-course home for files uploaded via the drag-and-drop bulk uploader
 * (content_library_files — course-less by design), organised into folders they create themselves. */
function ContentLibraryPage() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([]);
  const currentFolderId = folderPath.at(-1)?.id ?? null;
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renaming, setRenaming] = useState<{ type: "folder" | "file"; id: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const { data: allFolders = [] } = useQuery({
    queryKey: ["content-library-folders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_library_folders" as never)
        .select("id, name, parent_id" as never)
        .order("name" as never);
      if (error) throw error;
      return (data ?? []) as unknown as FolderRow[];
    },
  });
  const { data: files, isLoading } = useQuery({
    queryKey: ["content-library-all", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_library_files" as never)
        .select("id, file_name, file_type, storage_path, size_bytes, description, created_at, folder_id" as never)
        .order("created_at" as never, { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ContentFile[];
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["content-library-all"] });
    qc.invalidateQueries({ queryKey: ["content-library-folders"] });
  };

  const folders = allFolders.filter((f) => f.parent_id === currentFolderId);
  const filtered = (files ?? []).filter(
    (f) => !search.trim() || f.file_name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const shownFiles = search.trim() ? filtered : filtered.filter((f) => f.folder_id === currentFolderId);

  const createFolder = async () => {
    if (!user || newFolderName.trim().length < 1) return;
    const { error } = await supabase.from("content_library_folders" as never).insert({
      author_id: user.id,
      parent_id: currentFolderId,
      name: newFolderName.trim(),
    } as never);
    if (error) {
      toast.error("Could not create this folder.");
      return;
    }
    setNewFolderName("");
    setCreatingFolder(false);
    refresh();
  };
  const saveRename = async () => {
    if (!renaming || renameValue.trim().length < 1) return;
    const table = renaming.type === "folder" ? "content_library_folders" : "content_library_files";
    const column = renaming.type === "folder" ? "name" : "file_name";
    const { error } = await supabase
      .from(table as never)
      .update({ [column]: renameValue.trim() } as never)
      .eq("id", renaming.id);
    if (error) {
      toast.error("Could not rename this.");
      return;
    }
    setRenaming(null);
    refresh();
  };
  const deleteFolder = async (folder: FolderRow) => {
    const ok = await confirm({
      tone: "danger",
      title: "Delete this folder?",
      confirmLabel: "Delete folder",
      description: `"${folder.name}" and any subfolders will be deleted. Files inside move back to the root.`,
    });
    if (!ok) return;
    const { error } = await supabase.from("content_library_folders" as never).delete().eq("id", folder.id);
    if (error) {
      toast.error("Could not delete this folder.");
      return;
    }
    toast.success("Folder deleted.");
    refresh();
  };
  const deleteFile = async (file: ContentFile) => {
    const ok = await confirm({
      tone: "danger",
      title: "Delete this file?",
      confirmLabel: "Delete file",
      description: `"${file.file_name}" will be permanently removed from your content library.`,
    });
    if (!ok) return;
    await supabase.storage.from("studio-content").remove([file.storage_path]);
    const { error } = await supabase.from("content_library_files" as never).delete().eq("id", file.id);
    if (error) {
      toast.error("Could not delete this file.");
      return;
    }
    toast.success("File deleted.");
    refresh();
  };
  const moveFile = async (file: ContentFile, folderId: string) => {
    const { error } = await supabase
      .from("content_library_files" as never)
      .update({ folder_id: folderId || null } as never)
      .eq("id", file.id);
    if (error) {
      toast.error("Could not move this file.");
      return;
    }
    refresh();
  };

  const download = async (file: ContentFile) => {
    setDownloading(file.id);
    try {
      const { data, error } = await supabase.storage.from("studio-content").createSignedUrl(file.storage_path, 60);
      if (error || !data) throw error ?? new Error("No URL returned");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not open this file.");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Phone>
      <Header />
      <Sheet wide>
        <div className="mb-4 flex items-center gap-2">
          <Link to="/studio" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <CanvasHeading eyebrow="For trainers" title="Content Library" />
        </div>
        {ready && !user ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            <Link to="/auth" className="font-semibold text-primary">Sign in</Link> to view your content library.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Every file you've uploaded as reusable content, in one place — organise it into folders
              and attach it to a lesson whenever you like.
            </p>
            <Input
              aria-label="Search files"
              placeholder="Search by file name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-4 max-w-md"
            />
            <details className="mb-5 rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Upload PDFs, documents or SCORM packages</summary>
              <div className="mt-3">
                <BulkCourseUpload requireAdmin={false} />
              </div>
            </details>

            {!search.trim() && (
              <div className="mb-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <nav className="flex flex-wrap items-center gap-1 text-sm">
                    <button
                      className="font-medium text-primary hover:underline"
                      onClick={() => setFolderPath([])}
                    >
                      Content Library
                    </button>
                    {folderPath.map((f, i) => (
                      <span key={f.id} className="flex items-center gap-1">
                        <span className="text-muted-foreground">/</span>
                        <button
                          className="font-medium text-primary hover:underline"
                          onClick={() => setFolderPath(folderPath.slice(0, i + 1))}
                        >
                          {f.name}
                        </button>
                      </span>
                    ))}
                  </nav>
                  <Button size="sm" variant="outline" onClick={() => setCreatingFolder(true)}>
                    <FolderPlus className="h-4 w-4" /> New folder
                  </Button>
                </div>
                {creatingFolder && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-2">
                    <Input
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Folder name"
                      className="max-w-xs"
                      autoFocus
                    />
                    <Button size="sm" disabled={newFolderName.trim().length < 1} onClick={createFolder}>Create</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setCreatingFolder(false); setNewFolderName(""); }}>Cancel</Button>
                  </div>
                )}
                {folders.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {folders.map((folder) => (
                      <div key={folder.id} className="group relative flex items-center gap-2 rounded-xl border border-border p-3">
                        {renaming?.type === "folder" && renaming.id === folder.id ? (
                          <div className="flex w-full items-center gap-1">
                            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="h-8 text-sm" autoFocus />
                            <Button size="sm" className="h-8 px-2" onClick={saveRename}>Save</Button>
                          </div>
                        ) : (
                          <>
                            <button
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              onClick={() => setFolderPath([...folderPath, { id: folder.id, name: folder.name }])}
                            >
                              <Folder className="h-5 w-5 shrink-0 text-muted-foreground" />
                              <span className="truncate text-sm font-medium">{folder.name}</span>
                            </button>
                            <div className="hidden items-center gap-0.5 group-hover:flex">
                              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Rename ${folder.name}`} onClick={() => { setRenaming({ type: "folder", id: folder.id }); setRenameValue(folder.name); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label={`Delete ${folder.name}`} onClick={() => deleteFolder(folder)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></p>
            ) : !shownFiles.length ? (
              <p className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                {search.trim() ? <FilePlus2 className="h-8 w-8" /> : <Library className="h-8 w-8" />}
                {search.trim()
                  ? "No files match your search."
                  : folderPath.length
                    ? "This folder is empty."
                    : "Nothing here yet — upload a file above and it'll show up here."}
              </p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {shownFiles.map((file) => {
                  const Icon = TYPE_ICON[file.file_type] ?? FileText;
                  return (
                    <div key={file.id} className="flex items-center gap-3 p-3">
                      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        {renaming?.type === "file" && renaming.id === file.id ? (
                          <div className="flex items-center gap-1">
                            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="h-8 text-sm" autoFocus />
                            <Button size="sm" className="h-8 px-2" onClick={saveRename}>Save</Button>
                          </div>
                        ) : (
                          <p className="truncate font-medium">{file.file_name}</p>
                        )}
                        <p className="truncate text-xs text-muted-foreground">
                          {formatSize(file.size_bytes)}
                          {file.description && ` · ${file.description}`}
                        </p>
                      </div>
                      {!search.trim() && (
                        <select
                          className="rounded-md border border-input bg-background p-1.5 text-xs"
                          aria-label={`Move ${file.file_name}`}
                          value={file.folder_id ?? ""}
                          onChange={(e) => moveFile(file, e.target.value)}
                        >
                          <option value="">Root</option>
                          {allFolders.map((f) => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                        </select>
                      )}
                      <Button size="icon" variant="ghost" aria-label={`Rename ${file.file_name}`} onClick={() => { setRenaming({ type: "file", id: file.id }); setRenameValue(file.file_name); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" disabled={downloading === file.id} onClick={() => void download(file)}>
                        {downloading === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Open
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${file.file_name}`} onClick={() => deleteFile(file)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Sheet>
    </Phone>
  );
}
