import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Download,
  FileArchive,
  FileText,
  Folder,
  FolderPlus,
  Image as ImageIcon,
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SlidePlayer } from "@/components/SlidePlayer";
import { parseLessonSlides } from "@/lib/lesson-slides";
import { trainingHtml, readTrainingPackage } from "@/lib/training-html";
import {
  canTransform,
  linkedMaterials,
  libraryFolderPath,
  type LibraryFile,
  type LibraryFolder,
} from "@/lib/library-materials";
import { friendlyError } from "@/lib/friendly-error";
import { CATALOGUE_SECTORS } from "@/lib/catalogue-sectors";
import { MaterialTypeFilters } from "@/components/MaterialTypeFilters";
import { AutoCategoriseButton } from "@/components/AutoCategoriseButton";
import { LibraryCourses } from "@/components/LibraryCourses";
import type { LibraryCourseStage } from "@/lib/library-course-stage";
import { lessonMaterialFolders, producedMaterialStatus } from "@/lib/lesson-material-folders";
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
  const [slidePreview, setSlidePreview] = useState<{ title: string; body: string } | null>(null);
  const previewSlides = async (file: LibraryFile) => {
    try {
      const { data, error } = await supabase.storage
        .from("studio-content")
        .download(file.storage_path);
      if (error || !data || data.size > 16000000) throw new Error("Could not open these slides.");
      setSlidePreview({ title: file.file_name, body: await data.text() });
    } catch (error) {
      toast.error(friendlyError(error, "Could not open the slides."));
    }
  };
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
  const [lessonId, setLessonId] = useState<string | null>(null);
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
    setLessonId(null);
  }, [user?.id, initialStage, scope]);
  const editCopy = async (file: LibraryFile) => {
    try {
      const sources = linkedMaterials(file.id, "produced", files, derivations);
      if (!sources.length) throw new Error("The source files for this output are unavailable.");
      const { data, error } = await supabase.storage
        .from("studio-content")
        .download(file.storage_path);
      if (error || !data) throw error ?? new Error("Could not open this output.");
      if (data.size > 16000000) throw new Error("This output is too large for the lesson editor.");
      setProducer({
        sources,
        initialBody: await data.text(),
        initialTitle: file.file_name.replace(/\.(?:md|html)$/i, ""),
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
  const lessonFolders = lessonMaterialFolders(files, derivations);
  const activeLesson = lessonFolders.find((folder) => folder.id === lessonId);
  const visibleLessons = lessonFolders.filter((folder) => {
    const members = [...folder.sources, ...folder.outputs];
    return (
      members.some((file) => matchesMaterialType(file, fileType)) &&
      (!selectedSector ||
        members.some((file) => materialSector(file, files, derivations) === selectedSector)) &&
      (search.trim()
        ? members.some((file) =>
            (file.file_name + " " + libraryFolderPath(file.folder_id, allFolders))
              .toLowerCase()
              .includes(search.trim().toLowerCase()),
          )
        : members.some((file) => file.folder_id === currentFolderId))
    );
  });

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
      description: `"${folder.name}" and any subfolders will be deleted. Raw files and produced versions move to the root and keep their source links, status and sector.`,
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
      toast.error("Keep this raw source while it has linked Draft or Completed versions.");
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
      {!ready ? (
        <p role="status">Loading your content library…</p>
      ) : !user ? (
        <p className="supporting-text">
          <Link to="/auth" className="text-primary underline">
            Sign in
          </Link>{" "}
          to view your content library.
        </p>
      ) : (
        <>
          <p className="supporting-text text-muted-foreground mb-4">
            Each lesson folder keeps its raw sources and produced versions together. Draft and
            Completed describe preparation status; Completed does not mean published.
          </p>
          <MaterialTypeFilters value={fileType} onChange={setFileType} />
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Input
              aria-label="Search lesson folders and files"
              placeholder="Search lesson folders and files"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
            <label className="block text-sm">
              Industry / sector
              <select
                className="ml-2 max-w-full rounded-md border bg-background p-2"
                value={selectedSector ?? ""}
                onChange={(e) => {
                  setSelectedSector(e.target.value || null);
                  setLessonId(null);
                }}
              >
                <option value="">All sectors</option>
                {CATALOGUE_SECTORS.map((sector) => (
                  <option key={sector}>{sector}</option>
                ))}
              </select>
            </label>
          </div>
          <section className="mb-5 space-y-3 rounded-lg border p-3" aria-label="Upload content">
            <h2 className="text-sm font-semibold">Upload raw material</h2>
            {!selectedSector && (
              <label className="block text-sm">
                Sector for new uploads
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
          </section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Library folders" className="flex flex-wrap items-center gap-2 text-sm">
              <button
                className="text-primary hover:underline"
                onClick={() => {
                  setFolderPath([]);
                  setLessonId(null);
                  setSelected([]);
                }}
              >
                All lessons
              </button>
              {folderPath.map((f, i) => (
                <span key={f.id}>
                  {" "}
                  /{" "}
                  <button
                    className="text-primary hover:underline"
                    onClick={() => {
                      setFolderPath(folderPath.slice(0, i + 1));
                      setLessonId(null);
                      setSelected([]);
                    }}
                  >
                    {f.name}
                  </button>
                </span>
              ))}
              {activeLesson && <span> / {activeLesson.title}</span>}
            </nav>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={isLoading || !!libraryError}
                onClick={() => setCreatingFolder(true)}
              >
                <FolderPlus className="h-4 w-4" />
                New folder
              </Button>
              <AutoCategoriseButton
                mode="library"
                disabled={isLoading || !!libraryError}
                items={files
                  .filter(
                    (file) =>
                      (!currentFolderId || file.folder_id === currentFolderId) &&
                      (!activeLesson ||
                        [...activeLesson.sources, ...activeLesson.outputs].some(
                          (member) => member.id === file.id,
                        )),
                  )
                  .map((file) => ({
                    id: file.id,
                    title: file.file_name,
                    description: file.description,
                    folderId: file.folder_id,
                    sector: materialSector(file, files, derivations),
                  }))}
                onApplied={refresh}
              />
            </div>
          </div>
          {creatingFolder && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <Input
                aria-label="New folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="max-w-xs"
                placeholder="Folder name"
              />
              <Button size="sm" disabled={!newFolderName.trim()} onClick={createFolder}>
                Create folder
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
          {renaming && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <Input
                aria-label="Rename file or folder"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="max-w-md"
              />
              <Button size="sm" disabled={!renameValue.trim()} onClick={saveRename}>
                Save name
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
            </div>
          )}
          {libraryError ? (
            <p role="alert">Could not load your complete library. Refresh to try again.</p>
          ) : isLoading ? (
            <p role="status">Loading lesson folders…</p>
          ) : activeLesson ? (
            <section className="space-y-5" aria-label="Lesson folder contents">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setLessonId(null);
                    setSelected([]);
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to lesson folders
                </Button>
                <h2 className="text-lg font-semibold">{activeLesson.title}</h2>
                <span className="rounded-full bg-muted px-3 py-1 text-sm">
                  {activeLesson.status}
                </span>
              </div>
              <p className="supporting-text text-muted-foreground">
                All sources and versions are shown here, including files of other types than the
                current filter.
              </p>
              {[
                { title: "Raw material", members: activeLesson.sources },
                { title: "Produced material", members: activeLesson.outputs },
              ].map((section) => (
                <section key={section.title} className="space-y-3" aria-label={section.title}>
                  <h3 className="font-semibold">{section.title}</h3>
                  {!section.members.length && (
                    <p className="supporting-text text-muted-foreground">
                      {section.title === "Raw material"
                        ? "No raw source is linked to this older output. Existing files have not been matched by name."
                        : "Not started — transform the raw material to create a Draft or Completed version."}
                    </p>
                  )}
                  {section.members.map((file) => {
                    const raw = file.material_stage === "raw";
                    const Icon = TYPE_ICON[file.file_type] ?? FileText;
                    return (
                      <article
                        key={file.id}
                        className="flex flex-wrap items-start gap-3 rounded-lg border p-3"
                      >
                        {raw && canTransform(file) && (
                          <input
                            type="checkbox"
                            className="mt-1"
                            aria-label={"Select " + file.file_name}
                            checked={selected.includes(file.id)}
                            onChange={(e) =>
                              setSelected((old) =>
                                e.target.checked
                                  ? [...old, file.id]
                                  : old.filter((id) => id !== file.id),
                              )
                            }
                          />
                        )}
                        <Icon className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1 basis-52">
                          <h4 className="break-words text-sm font-semibold">{file.file_name}</h4>
                          <p className="supporting-text text-muted-foreground">
                            {raw ? "Original source — retained" : producedMaterialStatus(file)} ·{" "}
                            {formatSize(file.size_bytes)} ·{" "}
                            {new Date(file.created_at).toLocaleDateString()}
                          </p>
                          {file.description && (
                            <p className="supporting-text text-muted-foreground break-words">
                              {file.description.replace(/^\[Plusticity draft\] /, "")}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {raw && canTransform(file) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setProducer({ sources: [file] })}
                            >
                              Transform
                            </Button>
                          )}
                          {!raw && /\.(?:md|html)$/i.test(file.original_file_name) && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void previewSlides(file)}
                              >
                                View slides
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void editCopy(file)}
                              >
                                {producedMaterialStatus(file) === "Draft"
                                  ? "Continue draft"
                                  : "Edit copy"}
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={downloading === file.id}
                            onClick={() => void download(file)}
                          >
                            <Download className="h-4 w-4" />
                            Download
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={"Rename " + file.file_name}
                            onClick={() => {
                              setRenaming({ type: "file", id: file.id });
                              setRenameValue(file.file_name);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            aria-label={"Delete " + file.file_name}
                            onClick={() => void deleteFile(file)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex w-full flex-wrap gap-3">
                          <label className="text-sm">
                            Sector
                            <select
                              aria-label={"Sector for " + file.file_name}
                              className="ml-2 max-w-full rounded-md border bg-background p-1.5"
                              value={materialSector(file, files, derivations)}
                              onChange={(e) => void updateSector(file, e.target.value)}
                            >
                              {CATALOGUE_SECTORS.map((sector) => (
                                <option key={sector}>{sector}</option>
                              ))}
                            </select>
                          </label>
                          <label className="text-sm">
                            Folder
                            <select
                              className="ml-2 rounded-md border bg-background p-1.5"
                              aria-label={"Move " + file.file_name}
                              value={file.folder_id ?? ""}
                              onChange={(e) => void moveFile(file, e.target.value)}
                            >
                              <option value="">Root</option>
                              {allFolders.map((folder) => (
                                <option key={folder.id} value={folder.id}>
                                  {libraryFolderPath(folder.id, allFolders)}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </article>
                    );
                  })}
                </section>
              ))}
              {!!selected.length && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      setProducer({
                        sources: files.filter(
                          (file) => selected.includes(file.id) && file.material_stage === "raw",
                        ),
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
            </section>
          ) : (
            <>
              <div
                className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                aria-label="Lesson folders"
              >
                {!search.trim() &&
                  folders.map((folder) => (
                    <article
                      key={folder.id}
                      className="rounded-xl border border-yellow-200 bg-yellow-50 p-4"
                    >
                      <button
                        className="flex w-full items-center gap-3 text-left"
                        onClick={() =>
                          setFolderPath([...folderPath, { id: folder.id, name: folder.name }])
                        }
                      >
                        <Folder className="h-9 w-9 shrink-0 fill-yellow-300 text-yellow-500" />
                        <span className="break-words font-semibold">{folder.name}</span>
                      </button>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={"Rename " + folder.name}
                          onClick={() => {
                            setRenaming({ type: "folder", id: folder.id });
                            setRenameValue(folder.name);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={"Delete " + folder.name}
                          onClick={() => void deleteFolder(folder)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </article>
                  ))}
                {visibleLessons.map((folder) => (
                  <article
                    key={folder.id}
                    className="space-y-3 rounded-xl border border-yellow-200 bg-yellow-50 p-4"
                  >
                    <button
                      className="flex w-full flex-col gap-3 text-left"
                      onClick={() => {
                        setLessonId(folder.id);
                        setSelected([]);
                      }}
                    >
                      <div className="flex w-full items-start gap-3">
                        <Folder className="h-9 w-9 shrink-0 fill-yellow-300 text-yellow-500" />
                        <h2 className="min-w-0 break-words text-sm font-semibold">
                          {folder.title}
                        </h2>
                      </div>
                      <span
                        className={
                          "rounded-full px-2 py-1 text-xs " +
                          (folder.status === "Completed"
                            ? "bg-emerald-100 text-emerald-900"
                            : folder.status === "Draft"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-muted text-muted-foreground")
                        }
                      >
                        {folder.status}
                      </span>
                      <p className="supporting-text text-muted-foreground">
                        {folder.sources.length} raw source{folder.sources.length === 1 ? "" : "s"} ·{" "}
                        {
                          folder.outputs.filter((file) => producedMaterialStatus(file) === "Draft")
                            .length
                        }{" "}
                        drafts ·{" "}
                        {
                          folder.outputs.filter(
                            (file) => producedMaterialStatus(file) === "Completed",
                          ).length
                        }{" "}
                        completed
                      </p>
                    </button>
                    {folder.sources.filter(canTransform).map((file) => (
                      <label
                        key={file.id}
                        className="flex items-start gap-2 border-t border-yellow-200 pt-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selected.includes(file.id)}
                          onChange={(event) =>
                            setSelected((old) =>
                              event.target.checked
                                ? [...new Set([...old, file.id])]
                                : old.filter((id) => id !== file.id),
                            )
                          }
                        />
                        Select {file.file_name} for transformation
                      </label>
                    ))}
                  </article>
                ))}
              </div>
              {!!selected.length && (
                <div className="mb-4 flex flex-wrap gap-2">
                  <Button
                    disabled={selected.length > 20}
                    onClick={() =>
                      setProducer({
                        sources: files.filter(
                          (file) => selected.includes(file.id) && file.material_stage === "raw",
                        ),
                      })
                    }
                  >
                    Transform selected sources ({selected.length})
                  </Button>
                  <Button variant="outline" onClick={() => setSelected([])}>
                    Clear selection
                  </Button>
                  {selected.length > 20 && (
                    <p className="supporting-text">
                      Choose at most 20 raw source files per transformation.
                    </p>
                  )}
                </div>
              )}
              {!visibleLessons.length && !folders.length && (
                <p className="supporting-text text-muted-foreground">
                  No lesson folders match these filters. Upload raw material to start a lesson
                  folder.
                </p>
              )}
              <LibraryCourses scope={scope} search={search} sector={selectedSector} />
            </>
          )}
          {producer && (
            <MaterialProducer
              sources={producer.sources}
              initialBody={producer.initialBody}
              initialTitle={producer.initialTitle}
              folderId={currentFolderId}
              onClose={() => setProducer(null)}
              onSaved={() => {
                const id = [...producer.sources].sort((a, b) => a.id.localeCompare(b.id))[0]?.id;
                setLessonId(id ?? null);
                setProducer(null);
                setSelected([]);
                refresh();
              }}
            />
          )}
          {slidePreview && (
            <Dialog
              open
              onOpenChange={(open) => {
                if (!open) setSlidePreview(null);
              }}
            >
              <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
                <DialogTitle>{slidePreview.title}</DialogTitle>
                <LibrarySlidePreview body={slidePreview.body} />
              </DialogContent>
            </Dialog>
          )}
        </>
      )}
    </>
  );
}

function LibrarySlidePreview({ body }: { body: string }) {
  try {
    const pkg = readTrainingPackage(body);
    return pkg ? (
      <iframe
        title="Completed HTML slides"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="h-[75vh] w-full rounded-lg border"
        srcDoc={trainingHtml(
          pkg,
          Object.values(pkg.results).some((result) => !result.reviewed) ||
            pkg.topics.some(
              (topic) =>
                !pkg.results[topic.id] || ((topic.image || topic.video) && !topic.mediaReviewed),
            ),
        )}
      />
    ) : (
      <SlidePlayer slides={parseLessonSlides(body)} />
    );
  } catch {
    return (
      <p role="alert">
        This slide package could not be read. Its original file remains available to download.
      </p>
    );
  }
}
