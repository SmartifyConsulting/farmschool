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
import { Textarea } from "@/components/ui/textarea";
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
import { pairedLibraryMaterials, producedMaterialStatus } from "@/lib/lesson-material-folders";
import { instructionForTrainingBrief, TRAINING_BRIEF_MAX } from "@/lib/training-brief";
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
  const [newFolderColor, setNewFolderColor] = useState("#eab308");
  const [renameColor, setRenameColor] = useState("#eab308");
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
  const [outputBriefs, setOutputBriefs] = useState<Record<string, string>>({});
  const [producer, setProducer] = useState<{
    sources: LibraryFile[];
    initialBody?: string;
    initialTitle?: string;
    initialInstruction?: string;
  } | null>(null);
  useEffect(() => {
    setProducer(null);
    setSelected([]);
    setFolderPath([]);
    setSelectedSector(null);
    setSearch("");
    setLessonId(null);
    setOutputBriefs({});
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
  const lessonFolders = pairedLibraryMaterials(files, derivations);
  const activeLesson = lessonFolders.find((folder) => folder.id === lessonId);
  const startTransformation = (sources: LibraryFile[]) => {
    if (!sources.length) return;
    setProducer({
      sources,
      initialInstruction: instructionForTrainingBrief(
        sources.length === 1 ? outputBriefs[sources[0]!.id] : "",
      ),
    });
  };
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
      color: newFolderColor,
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
      .update({
        [column]: renameValue.trim(),
        ...(renaming.type === "folder" ? { color: renameColor } : {}),
      } as never)
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
      description: `Only the "${folder.name}" container will be removed. Its files and subfolders move to its parent. Raw material, produced versions, source links and status are retained.`,
    });
    if (!ok) return;
    const { error } = await supabase.rpc(
      "delete_library_folder" as never,
      { _folder: folder.id } as never,
    );
    if (error) {
      toast.error("Could not delete this folder.");
      return;
    }
    toast.success("Folder removed. Files, subfolders and source links retained.");
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
          {!activeLesson && (
            <>
              <p className="supporting-text text-muted-foreground mb-4">
                Each raw file is paired with its produced versions. Reuse the original to create
                another version. Completed does not mean published.
              </p>
              <MaterialTypeFilters value={fileType} onChange={setFileType} />
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <Input
                  aria-label="Search raw and produced material"
                  placeholder="Search raw and produced material"
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
              <section className="mb-3 space-y-2 rounded-lg border p-2" aria-label="Upload content">
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
                  compact
                  requireAdmin={false}
                  sector={selectedSector ?? uploadSector}
                  folderId={currentFolderId}
                />
              </section>
            </>
          )}
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
                All material
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
              <label className="flex items-center gap-2 text-sm">
                Folder colour
                <Input
                  type="color"
                  aria-label="New folder colour"
                  value={newFolderColor}
                  onInput={(event) => setNewFolderColor(event.currentTarget.value)}
                  onChange={(event) => setNewFolderColor(event.target.value)}
                  className="h-8 w-12 p-1"
                />
              </label>
              <Input
                aria-label="New folder colour hex"
                value={newFolderColor}
                onChange={(event) => setNewFolderColor(event.target.value)}
                maxLength={7}
                className="h-8 w-28"
              />
              <Button
                size="sm"
                disabled={!newFolderName.trim() || !/^#[0-9a-fA-F]{6}$/.test(newFolderColor)}
                onClick={createFolder}
              >
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
              {renaming.type === "folder" && (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    Folder colour
                    <Input
                      type="color"
                      aria-label="Edit folder colour"
                      value={renameColor}
                      onInput={(event) => setRenameColor(event.currentTarget.value)}
                      onChange={(event) => setRenameColor(event.target.value)}
                      className="h-8 w-12 p-1"
                    />
                  </label>
                  <Input
                    aria-label="Edit folder colour hex"
                    value={renameColor}
                    onChange={(event) => setRenameColor(event.target.value)}
                    maxLength={7}
                    className="h-8 w-28"
                  />
                </>
              )}
              <Button
                size="sm"
                disabled={
                  !renameValue.trim() ||
                  (renaming.type === "folder" && !/^#[0-9a-fA-F]{6}$/.test(renameColor))
                }
                onClick={saveRename}
              >
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
            <p role="status">Loading raw and produced material…</p>
          ) : activeLesson ? (
            <section className="space-y-5" aria-label="Raw and produced material details">
              {[
                { title: "Raw material", members: activeLesson.sources },
                { title: "Produced material", members: activeLesson.outputs },
              ].map((section, sectionIndex) => (
                <div key={section.title} className="space-y-5">
                  {sectionIndex === 1 && activeLesson.sources.length > 0 && (
                    <section
                      className="space-y-3 rounded-lg border p-4"
                      aria-label="AI training brief"
                    >
                      <label
                        htmlFor="training-output-brief"
                        className="block text-sm font-semibold"
                      >
                        What would you like from this training?{" "}
                        <span className="font-normal text-muted-foreground">(optional)</span>
                      </label>
                      <Textarea
                        id="training-output-brief"
                        value={outputBriefs[activeLesson.id] ?? ""}
                        onChange={(event) =>
                          setOutputBriefs((old) => ({
                            ...old,
                            [activeLesson.id]: event.target.value,
                          }))
                        }
                        maxLength={TRAINING_BRIEF_MAX}
                        className="min-h-36"
                        placeholder="For example: use more videos and illustrations, include practical scenarios, explain the steps in more detail, or keep the language simple for beginners."
                      />
                      <p className="supporting-text text-muted-foreground">
                        Leave this blank to generate the foundation from your source material. Add
                        preferences for depth, examples, visuals or video emphasis. You can review
                        the outline and media choices before generating.
                      </p>
                      <Button
                        disabled={!activeLesson.sources.every(canTransform)}
                        onClick={() => startTransformation(activeLesson.sources)}
                      >
                        {activeLesson.outputs.length
                          ? "Create another training version"
                          : "Start transformation"}
                      </Button>
                    </section>
                  )}
                  <section className="space-y-3" aria-label={section.title}>
                    <h3 className="text-sm font-semibold">
                      {section.title === "Raw material" ? (
                        <>
                          Source file{" "}
                          <span className="font-normal text-muted-foreground">(Raw material)</span>
                        </>
                      ) : (
                        section.title
                      )}
                    </h3>
                    {!section.members.length && (
                      <div className="rounded-lg border p-4">
                        <p className="supporting-text text-muted-foreground">
                          {section.title === "Raw material"
                            ? "No raw source is linked to this older output. Existing files have not been matched by name."
                            : "Not started — transform the raw material to create a Draft or Completed version."}
                        </p>
                      </div>
                    )}
                    {section.members.map((file) => {
                      const raw = file.material_stage === "raw";
                      const Icon = TYPE_ICON[file.file_type] ?? FileText;
                      return (
                        <article
                          key={file.id}
                          className="flex flex-wrap items-start gap-3 rounded-lg border p-3"
                        >
                          <Icon className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1 basis-52">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="break-words text-sm font-semibold">
                                {file.file_name}
                              </h4>
                              {raw && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                  {activeLesson.status}
                                </span>
                              )}
                            </div>
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
                          <div className="order-3 flex flex-wrap gap-2">
                            {raw && canTransform(file) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startTransformation([file])}
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
                          <div className="order-2 flex flex-wrap items-center gap-2">
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
                            {allFolders.length > 0 && (
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
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </section>
                </div>
              ))}
              {!!selected.length && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      startTransformation(
                        files.filter(
                          (file) => selected.includes(file.id) && file.material_stage === "raw",
                        ),
                      )
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
              {!search.trim() && !!folders.length && (
                <div className="mb-3 divide-y rounded-lg border" aria-label="Library folders list">
                  {folders.map((folder) => (
                    <div
                      key={folder.id}
                      className="flex flex-wrap items-center gap-2 px-3 py-2"
                      style={{ backgroundColor: (folder.color ?? "#eab308") + "0d" }}
                    >
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium"
                        onClick={() =>
                          setFolderPath([...folderPath, { id: folder.id, name: folder.name }])
                        }
                      >
                        <Folder
                          className="h-5 w-5 shrink-0"
                          style={{
                            color: folder.color ?? "#eab308",
                            fill: (folder.color ?? "#eab308") + "55",
                          }}
                        />
                        <span className="break-words">{folder.name}</span>
                      </button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={"Edit folder " + folder.name}
                        onClick={() => {
                          setRenaming({ type: "folder", id: folder.id });
                          setRenameValue(folder.name);
                          setRenameColor(folder.color ?? "#eab308");
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={"Delete folder " + folder.name}
                        onClick={() => void deleteFolder(folder)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mb-3 overflow-x-auto rounded-lg border">
                <table
                  className="w-full min-w-[680px] text-left text-sm"
                  aria-label="Raw material and produced training"
                >
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="w-8 p-2">
                        <span className="sr-only">Select</span>
                      </th>
                      <th className="px-3 py-2 font-medium">Raw material</th>
                      <th className="px-3 py-2 font-medium">Produced training</th>
                      <th className="px-3 py-2 font-medium">Latest status</th>
                      <th className="px-3 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibleLessons.map((row) => (
                      <tr key={row.id} className="align-top">
                        <td className="p-2">
                          {row.sources[0] && canTransform(row.sources[0]) && (
                            <input
                              type="checkbox"
                              aria-label={"Select " + row.sources[0].file_name}
                              checked={selected.includes(row.sources[0].id)}
                              onChange={(event) =>
                                setSelected((old) =>
                                  event.target.checked
                                    ? [...new Set([...old, row.sources[0]!.id])]
                                    : old.filter((id) => id !== row.sources[0]!.id),
                                )
                              }
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            className="text-left font-medium text-primary hover:underline"
                            onClick={() => {
                              setLessonId(row.id);
                              setSelected([]);
                            }}
                          >
                            {row.sources[0]?.file_name ?? "Original source not linked"}
                          </button>
                          {row.sources[0] && (
                            <p className="supporting-text text-muted-foreground">
                              {formatSize(row.sources[0].size_bytes)}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.outputs.length ? (
                            <ul className="space-y-1">
                              {row.outputs.map((output) => (
                                <li key={output.id} className="flex flex-wrap items-center gap-x-2">
                                  <button
                                    className="text-left text-primary hover:underline"
                                    onClick={() =>
                                      /\.(?:md|html)$/i.test(output.original_file_name)
                                        ? void previewSlides(output)
                                        : void download(output)
                                    }
                                  >
                                    {output.file_name}
                                  </button>
                                  <span className="supporting-text text-muted-foreground">
                                    {producedMaterialStatus(output)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="supporting-text text-muted-foreground">
                              No produced version yet
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              "whitespace-nowrap rounded-full px-2 py-0.5 text-xs " +
                              (row.status === "Completed"
                                ? "bg-emerald-100 text-emerald-900"
                                : row.status === "Draft"
                                  ? "bg-amber-100 text-amber-900"
                                  : "bg-muted text-muted-foreground")
                            }
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {row.sources[0] && canTransform(row.sources[0]) && (
                              <Button
                                size="sm"
                                variant="outline"
                                title="Create a new produced version linked to this original"
                                onClick={() => startTransformation(row.sources)}
                              >
                                {row.outputs.length ? "Reuse" : "Transform"}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setLessonId(row.id);
                                setSelected([]);
                              }}
                            >
                              Manage
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!visibleLessons.length && (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 supporting-text text-muted-foreground">
                          No material matches these filters. Upload a raw file to start.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {!!selected.length && (
                <div className="mb-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={selected.length > 20}
                    onClick={() =>
                      startTransformation(
                        files.filter(
                          (file) => selected.includes(file.id) && file.material_stage === "raw",
                        ),
                      )
                    }
                  >
                    Transform selected ({selected.length})
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                    Clear selection
                  </Button>
                </div>
              )}
              <LibraryCourses scope={scope} search={search} sector={selectedSector} />
            </>
          )}
          {producer && (
            <MaterialProducer
              sources={producer.sources}
              initialBody={producer.initialBody}
              initialTitle={producer.initialTitle}
              initialInstruction={producer.initialInstruction}
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
      <SlidePlayer slides={parseLessonSlides(body)} outline />
    );
  } catch {
    return (
      <p role="alert">
        This slide package could not be read. Its original file remains available to download.
      </p>
    );
  }
}
