import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { useConfirm } from "@/components/ConfirmDialog";
import { toast } from "sonner";
import { BulkCourseUpload } from "@/components/BulkCourseUpload";
import { useLibraryMaterials } from "@/hooks/useLibraryMaterials";
import { MaterialProducer } from "@/components/MaterialProducer";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SectionTabsList, SectionTabsTrigger } from "@/components/SectionTabs";
import {
  canTransform,
  linkedMaterials,
  libraryFolderPath,
  type LibraryFile,
  type LibraryFolder,
  type MaterialStage,
} from "@/lib/library-materials";
import { friendlyError } from "@/lib/friendly-error";
import { CATALOGUE_SECTORS } from "@/lib/catalogue-sectors";
import { MaterialTypeFilters } from "@/components/MaterialTypeFilters";
import { AutoCategoriseButton } from "@/components/AutoCategoriseButton";
import { LibraryCourses } from "@/components/LibraryCourses";
import type { LibraryCourseStage } from "@/lib/library-course-stage";
import {
  materialSector,
  matchesMaterialType,
  sectorKeywords,
  type MaterialType,
} from "@/lib/library-materials";

type ContentFile = LibraryFile;
type FolderRow = LibraryFolder;

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
export function ContentLibraryContent({
  scope = "personal",
  initialStage = "raw",
}: {
  scope?: "personal" | "admin";
  initialStage?: LibraryCourseStage;
}) {
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

  const {
    files,
    folders: allFolders,
    links: derivations,
    loading: isLoading,
    error: libraryError,
  } = useLibraryMaterials();
  const [stage, setStage] = useState<LibraryCourseStage>(initialStage);
  const [selected, setSelected] = useState<string[]>([]);
  const [fileType, setFileType] = useState<MaterialType>("All");
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [uploadSector, setUploadSector] = useState("Uncategorised");
  const [producer, setProducer] = useState<{
    sources: LibraryFile[];
    initialBody?: string;
    initialTitle?: string;
  } | null>(null);
  useEffect(() => {
    setProducer(null);
    setSelected([]);
    setFolderPath([]);
    setSelectedSector(null);
    setSearch("");
    setStage(initialStage);
  }, [user?.id, initialStage]);
  const editCopy = async (file: LibraryFile) => {
    try {
      const sources = linkedMaterials(file.id, "produced", files, derivations);
      if (!sources.length) throw new Error("The source files for this output are unavailable.");
      const { data, error } = await supabase.storage
        .from("studio-content")
        .download(file.storage_path);
      if (error || !data) throw error ?? new Error("Could not open this output.");
      if (data.size > 1000000) throw new Error("This output is too large for the lesson editor.");
      setProducer({
        sources,
        initialBody: await data.text(),
        initialTitle: file.file_name.replace(/\.md$/i, ""),
      });
    } catch (error) {
      toast.error(friendlyError(error, "Could not open an editable copy."));
    }
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["content-library-all"] });
    qc.invalidateQueries({ queryKey: ["content-library-folders"] });
    qc.invalidateQueries({ queryKey: ["content-library-links"] });
  };

  const folders = allFolders.filter((f) => f.parent_id === currentFolderId);
  const updateSector = async (file: LibraryFile, sector: string) => {
    const { error } = await supabase
      .from("content_library_files" as never)
      .update({ keywords: sectorKeywords(file.keywords, sector) } as never)
      .eq("id", file.id);
    if (error) toast.error(friendlyError(error, "Could not change the sector."));
    else {
      toast.success(`Sector updated to ${sector}.`);
      refresh();
    }
  };
  const filtered = (files ?? []).filter(
    (f) =>
      f.material_stage === stage &&
      matchesMaterialType(f, fileType) &&
      (!selectedSector || materialSector(f, files, derivations) === selectedSector) &&
      (!search.trim() ||
        (f.file_name + " " + libraryFolderPath(f.folder_id, allFolders))
          .toLowerCase()
          .includes(search.trim().toLowerCase())),
  );
  const shownFiles = search.trim()
    ? filtered
    : filtered.filter((f) => f.folder_id === currentFolderId);
  const sectors = [
    ...new Set(filtered.map((file) => materialSector(file, files, derivations))),
  ].sort((a, b) => a.localeCompare(b));

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
      description: `"${folder.name}" and any subfolders will be deleted in both Raw and Completed views. Files move to the root and keep their stage and sector.`,
    });
    if (!ok) return;
    const { error } = await supabase
      .from("content_library_folders" as never)
      .delete()
      .eq("id", folder.id);
    if (error) {
      toast.error("Could not delete this folder.");
      return;
    }
    toast.success("Folder deleted.");
    refresh();
  };
  const deleteFile = async (file: ContentFile) => {
    if (
      file.material_stage === "raw" &&
      linkedMaterials(file.id, "raw", files, derivations).length
    ) {
      toast.error("Keep this Raw source while it has linked Completed outputs.");
      return;
    }
    const ok = await confirm({
      tone: "danger",
      title: "Delete this file?",
      confirmLabel: "Delete file",
      description: `"${file.file_name}" will be permanently removed from your content library.`,
    });
    if (!ok) return;
    const { error } = await supabase
      .from("content_library_files" as never)
      .delete()
      .eq("id", file.id);
    if (error) {
      toast.error("Could not delete this file.");
      return;
    }
    const cleanup = await supabase.storage.from("studio-content").remove([file.storage_path]);
    if (cleanup.error) toast.warning("File record deleted; stored-file cleanup is pending.");
    else toast.success("File deleted.");
    setSelected((current) => current.filter((id) => id !== file.id));
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
      const { data, error } = await supabase.storage
        .from("studio-content")
        .createSignedUrl(file.storage_path, 60);
      if (error || !data) throw error ?? new Error("No URL returned");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not open this file.");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      {ready && !user ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          <Link to="/auth" className="font-semibold text-primary">
            Sign in
          </Link>{" "}
          to view your content library.
        </p>
      ) : (
        <>
          <Tabs
            value={stage}
            onValueChange={(value) => {
              setStage(value as LibraryCourseStage);
              setSearch("");
              setFolderPath([]);
              setSelected([]);
              setSelectedSector(null);
              setFileType("All");
            }}
          >
            <SectionTabsList aria-label="Content Library stages">
              <SectionTabsTrigger value="raw">Raw Material</SectionTabsTrigger>
              <SectionTabsTrigger value="drafts">Drafts</SectionTabsTrigger>
              <SectionTabsTrigger value="produced">Completed</SectionTabsTrigger>
            </SectionTabsList>
            <TabsContent value={stage}>
              <LibraryCourses scope={scope} stage={stage} />
              {stage !== "drafts" && (
                <>
                  <p className="mb-4 text-sm text-muted-foreground">
                    {stage === "raw"
                      ? "Original uploaded sources. Transform selected documents into reusable learning material; originals stay unchanged."
                      : "Transformed learning material, linked to its Raw sources. Completed does not mean published to learners."}
                  </p>
                  <MaterialTypeFilters value={fileType} onChange={setFileType} />
                  <Input
                    aria-label="Search files and folders"
                    placeholder="Search by file or folder name"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="mb-4 max-w-md"
                  />
                  {stage === "raw" && (
                    <section
                      className="mb-5 rounded-lg border border-border p-3"
                      aria-label="Upload content"
                    >
                      <h2 className="text-sm font-semibold">Upload source material</h2>
                      <div className="mt-3">
                        {selectedSector === null && (
                          <label className="mb-3 block text-sm">
                            Industry / sector
                            <select
                              className="ml-2 max-w-full rounded-md border bg-background p-2"
                              value={uploadSector}
                              onChange={(e) => setUploadSector(e.target.value)}
                            >
                              {CATALOGUE_SECTORS.map((sector) => (
                                <option key={sector}>{sector}</option>
                              ))}
                            </select>
                          </label>
                        )}
                        <BulkCourseUpload
                          requireAdmin={false}
                          sector={selectedSector ?? uploadSector}
                          folderId={currentFolderId}
                        />
                      </div>
                    </section>
                  )}
                  {stage === "raw" && selected.length > 0 && (
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <Button
                        onClick={() =>
                          setProducer({
                            sources: files.filter((file) => selected.includes(file.id)),
                          })
                        }
                      >
                        Transform selected ({selected.length})
                      </Button>
                      <Button variant="outline" onClick={() => setSelected([])}>
                        Clear selection
                      </Button>
                    </div>
                  )}

                  {selectedSector === null && (
                    <div
                      className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                      aria-label="Library sector folders"
                    >
                      {sectors.map((sector) => (
                        <button
                          key={sector}
                          className="flex items-center gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-left"
                          onClick={() => {
                            setSelectedSector(sector);
                            setFolderPath([]);
                          }}
                        >
                          <Folder className="h-8 w-8 shrink-0 fill-yellow-300 text-yellow-500" />
                          <span>
                            <span className="block text-sm font-semibold">{sector}</span>
                            <span className="supporting-text text-muted-foreground">
                              {
                                filtered.filter(
                                  (file) => materialSector(file, files, derivations) === sector,
                                ).length
                              }{" "}
                              {filtered.filter(
                                (file) => materialSector(file, files, derivations) === sector,
                              ).length === 1
                                ? "file"
                                : "files"}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedSector === null && libraryError && (
                    <p role="alert">Could not load your complete library.</p>
                  )}
                  {selectedSector === null && isLoading && (
                    <p role="status">Loading sector folders…</p>
                  )}
                  {selectedSector === null && !libraryError && !isLoading && !sectors.length && (
                    <p className="supporting-text py-6 text-muted-foreground">
                      No {stage === "raw" ? "Raw" : "Completed"} files match these filters.
                    </p>
                  )}
                  {selectedSector !== null && (
                    <Button
                      className="mb-3"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedSector(null);
                        setFolderPath([]);
                      }}
                    >
                      All sectors
                    </Button>
                  )}
                  {!libraryError && (
                    <div className="mb-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <nav className="flex flex-wrap items-center gap-1 text-sm">
                          <button
                            className="font-medium text-primary hover:underline"
                            onClick={() => setFolderPath([])}
                          >
                            {selectedSector ?? "All sectors"}
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
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!user || isLoading}
                            onClick={() => setCreatingFolder(true)}
                          >
                            <FolderPlus className="h-4 w-4" /> New folder
                          </Button>
                          <AutoCategoriseButton
                            mode="library"
                            disabled={!user || isLoading}
                            items={filtered
                              .filter(
                                (file) => !currentFolderId || file.folder_id === currentFolderId,
                              )
                              .map((file) => ({
                                id: file.id,
                                title: file.file_name,
                                description: file.description ?? "",
                                folderId: file.folder_id,
                                sector: materialSector(file, files, derivations),
                              }))}
                            onApplied={refresh}
                          />
                        </div>
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
                          <Button
                            size="sm"
                            disabled={newFolderName.trim().length < 1}
                            onClick={createFolder}
                          >
                            Create
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setCreatingFolder(false);
                              setNewFolderName("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                      {folders.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                          {folders.map((folder) => (
                            <div
                              key={folder.id}
                              className="group relative flex items-center gap-2 rounded-xl border border-border p-3"
                            >
                              {renaming?.type === "folder" && renaming.id === folder.id ? (
                                <div className="flex w-full items-center gap-1">
                                  <Input
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    className="h-8 text-sm"
                                    autoFocus
                                  />
                                  <Button size="sm" className="h-8 px-2" onClick={saveRename}>
                                    Save
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                    onClick={() =>
                                      setFolderPath([
                                        ...folderPath,
                                        { id: folder.id, name: folder.name },
                                      ])
                                    }
                                  >
                                    <Folder className="h-5 w-5 shrink-0 text-muted-foreground" />
                                    <span className="truncate text-sm font-medium">
                                      {folder.name}
                                    </span>
                                  </button>
                                  <div className="hidden items-center gap-0.5 group-hover:flex">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      aria-label={`Rename ${folder.name}`}
                                      onClick={() => {
                                        setRenaming({ type: "folder", id: folder.id });
                                        setRenameValue(folder.name);
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-destructive"
                                      aria-label={`Delete ${folder.name}`}
                                      onClick={() => deleteFolder(folder)}
                                    >
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

                  {selectedSector === null &&
                  !search.trim() &&
                  !folderPath.length ? null : libraryError ? (
                    <p role="alert">
                      Could not load your complete library. Please refresh to try again.
                    </p>
                  ) : isLoading ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </p>
                  ) : !shownFiles.length ? (
                    <p className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                      {search.trim() ? (
                        <FilePlus2 className="h-8 w-8" />
                      ) : (
                        <Library className="h-8 w-8" />
                      )}
                      {search.trim()
                        ? "No files match your search."
                        : folderPath.length
                          ? "This folder is empty."
                          : stage === "raw"
                            ? "Nothing here yet — upload a file above and it'll show up here."
                            : "No Completed material yet. Select a document in Raw and choose Transform."}
                    </p>
                  ) : (
                    <div className="divide-y divide-border rounded-lg border border-border">
                      {shownFiles.map((file) => {
                        const Icon = TYPE_ICON[file.file_type] ?? FileText;
                        return (
                          <div key={file.id} className="flex flex-wrap items-center gap-3 p-3">
                            {stage === "raw" && canTransform(file) && (
                              <input
                                type="checkbox"
                                aria-label={`Select ${file.file_name} for transformation`}
                                checked={selected.includes(file.id)}
                                disabled={!selected.includes(file.id) && selected.length >= 20}
                                onChange={(e) =>
                                  setSelected((current) =>
                                    e.target.checked
                                      ? [...current, file.id]
                                      : current.filter((id) => id !== file.id),
                                  )
                                }
                              />
                            )}
                            <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              {renaming?.type === "file" && renaming.id === file.id ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    className="h-8 text-sm"
                                    autoFocus
                                  />
                                  <Button size="sm" className="h-8 px-2" onClick={saveRename}>
                                    Save
                                  </Button>
                                </div>
                              ) : (
                                <p className="break-words text-sm font-medium">{file.file_name}</p>
                              )}
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-[13px] ${stage === "raw" && linkedMaterials(file.id, stage, files, derivations).length ? "bg-emerald-100 text-emerald-900" : "bg-muted text-muted-foreground"}`}
                              >
                                {stage === "produced"
                                  ? "Completed"
                                  : linkedMaterials(file.id, stage, files, derivations).length
                                    ? "Completed"
                                    : "Raw"}
                              </span>
                              <p className="truncate text-xs text-muted-foreground">
                                {formatSize(file.size_bytes)}
                                {file.description && ` · ${file.description}`}
                              </p>
                              {linkedMaterials(file.id, stage, files, derivations).length > 0 && (
                                <div className="mt-1 text-sm text-muted-foreground">
                                  {stage === "raw" ? "Completed outputs: " : "Raw sources: "}
                                  {linkedMaterials(file.id, stage, files, derivations).map(
                                    (related) => (
                                      <button
                                        key={related.id}
                                        className="mr-3 text-left text-primary underline"
                                        onClick={() => void download(related)}
                                      >
                                        {related.file_name}
                                      </button>
                                    ),
                                  )}
                                </div>
                              )}
                            </div>
                            {stage === "raw" && canTransform(file) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setProducer({ sources: [file] })}
                              >
                                Transform
                              </Button>
                            )}
                            {stage === "produced" && /\.md$/i.test(file.original_file_name) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void editCopy(file)}
                              >
                                Edit copy
                              </Button>
                            )}
                            <select
                              aria-label={`Sector for ${file.file_name}`}
                              className="max-w-full rounded-md border bg-background p-1.5 text-[13px]"
                              value={materialSector(file, files, derivations)}
                              onChange={(e) => void updateSector(file, e.target.value)}
                            >
                              {CATALOGUE_SECTORS.map((sector) => (
                                <option key={sector}>{sector}</option>
                              ))}
                            </select>
                            {!search.trim() && (
                              <select
                                className="rounded-md border border-input bg-background p-1.5 text-xs"
                                aria-label={`Move ${file.file_name}`}
                                value={file.folder_id ?? ""}
                                onChange={(e) => moveFile(file, e.target.value)}
                              >
                                <option value="">Root</option>
                                {allFolders.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Rename ${file.file_name}`}
                              onClick={() => {
                                setRenaming({ type: "file", id: file.id });
                                setRenameValue(file.file_name);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={downloading === file.id}
                              onClick={() => void download(file)}
                            >
                              {downloading === file.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                              Open
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              aria-label={`Delete ${file.file_name}`}
                              onClick={() => deleteFile(file)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
          {producer && (
            <MaterialProducer
              sources={producer.sources}
              initialBody={producer.initialBody}
              initialTitle={producer.initialTitle}
              folderId={currentFolderId}
              onClose={() => setProducer(null)}
              onSaved={() => {
                const outputSectors = [
                  ...new Set(
                    producer.sources.map((file) => materialSector(file, files, derivations)),
                  ),
                ];
                setSelectedSector(
                  outputSectors.length === 1 ? outputSectors[0]! : "General and Cross-industry",
                );
                setFileType("All");
                setProducer(null);
                setSelected([]);
                setStage("produced");
                setSearch("");
                refresh();
              }}
            />
          )}
        </>
      )}
    </>
  );
}
