import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  PenSquare,
  Library,
  ZoomIn,
  ZoomOut,
  ClipboardCheck,
  Folder,
  FolderPlus,
  Pencil,
  Trash2,
  FolderInput,
  ChevronRight,
  Check,
  X,
} from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { useConfirm } from "@/components/ConfirmDialog";
import { toast } from "sonner";
import { CourseWizard } from "@/components/CourseWizard";
import { AutoCategoriseButton } from "@/components/AutoCategoriseButton";
import { StudioCourseActions } from "@/components/StudioCourseActions";
import { StudioSavedWorkspaces } from "@/components/StudioSavedWorkspaces";
import { CourseViewToggle, useCourseView } from "@/components/CourseViewToggle";

/** Card-grid column counts from most spacious (fewest, largest cards) to most compact (most, smallest cards per row). */
const CARD_GRID_CLASSES = [
  "md:grid-cols-2 xl:grid-cols-3",
  "md:grid-cols-3 xl:grid-cols-4",
  "md:grid-cols-4 xl:grid-cols-5",
  "md:grid-cols-5 xl:grid-cols-6",
];

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "Course Studio — Plusticity" },
      {
        name: "description",
        content: "Create courses with video lessons, readings and quizzes across industries.",
      },
      { property: "og:title", content: "Course Studio — Plusticity" },
      { property: "og:description", content: "Build and publish courses across industries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudioLayout,
});

function StudioLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return path === "/studio" || path === "/studio/" ? <Studio /> : <Outlet />;
}

type FolderRow = { id: string; name: string; parent_id: string | null };
type SelectedKey = `folder:${string}` | `course:${string}`;

function Studio() {
  const [view, setView] = useCourseView("studio", "cards");
  const { user, ready } = useAuth();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([]);
  const currentFolderId = folderPath.at(-1)?.id ?? null;
  const [selected, setSelected] = useState<Set<SelectedKey>>(new Set());
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<SelectedKey | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [density, setDensity] = useState(() => {
    try {
      return Math.min(
        CARD_GRID_CLASSES.length - 1,
        Math.max(0, Number(localStorage.getItem("plusticity:studio:density")) || 0),
      );
    } catch {
      return 0;
    }
  });
  const changeDensity = (next: number) => {
    const clamped = Math.min(CARD_GRID_CLASSES.length - 1, Math.max(0, next));
    setDensity(clamped);
    try {
      localStorage.setItem("plusticity:studio:density", String(clamped));
    } catch {
      /* ignore */
    }
  };
  const qc = useQueryClient();
  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ["studio-mine"] });
    void qc.invalidateQueries({ queryKey: ["studio-folders"] });
  };

  const { data: allFolders } = useQuery({
    queryKey: ["studio-folders", user?.id],
    enabled: !!user,
    queryFn: async () =>
      ((
        await supabase
          .from("studio_course_folders" as never)
          .select("id, name, parent_id" as never)
          .eq("author_id" as never, user!.id as never)
      ).data ?? []) as unknown as FolderRow[],
  });
  const folders = (allFolders ?? []).filter((f) => f.parent_id === currentFolderId);

  const {
    data,
    isPending: coursesPending,
    error: coursesError,
    refetch: refetchCourses,
  } = useQuery({
    queryKey: ["studio-mine", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const result = await supabase
        .from("studio_courses")
        .select(
          "id, title, description, published, category, cover_url, version_number, revision_of, folder_id, studio_lessons(count), studio_modules(count)" as never,
        )
        .eq("author_id", user.id)
        .eq("library_scope" as never, "personal")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (result.error) throw result.error;
      return (result.data ?? []) as unknown as {
        id: string;
        title: string;
        description: string | null;
        published: boolean;
        category: string;
        cover_url: string | null;
        version_number: number;
        revision_of: string | null;
        folder_id: string | null;
        studio_lessons: { count: number }[];
        studio_modules: { count: number }[];
      }[];
    },
  });
  const coursesHere = (data ?? []).filter((c) => (c.folder_id ?? null) === currentFolderId);

  const toggleSelect = (key: SelectedKey) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const createFolder = async () => {
    const name = newFolderName?.trim();
    setNewFolderName(null);
    if (!name || !user) return;
    const { error } = await supabase
      .from("studio_course_folders" as never)
      .insert({ author_id: user.id, parent_id: currentFolderId, name } as never);
    if (error) toast.error("Could not create the folder.");
    else refreshAll();
  };

  const startRename = (key: SelectedKey, currentName: string) => {
    setRenaming(key);
    setRenameValue(currentName);
  };
  const commitRename = async () => {
    const key = renaming;
    const name = renameValue.trim();
    setRenaming(null);
    if (!key || !name) return;
    const [kind, id] = key.split(":") as ["folder" | "course", string];
    const { error } =
      kind === "folder"
        ? await supabase
            .from("studio_course_folders" as never)
            .update({ name } as never)
            .eq("id", id)
        : await supabase.from("studio_courses").update({ title: name }).eq("id", id);
    if (error) toast.error("Could not rename that.");
    else refreshAll();
  };

  const deleteSelected = async () => {
    if (!selected.size) return;
    const ok = await confirm({
      tone: "danger",
      title: `Delete ${selected.size} item${selected.size === 1 ? "" : "s"}?`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      description: (
        <p>
          Deleted folders move their courses back to the root. Deleted courses go to Deleted
          courses, recoverable only by an administrator.
        </p>
      ),
    });
    if (!ok) return;
    for (const key of selected) {
      const [kind, id] = key.split(":") as ["folder" | "course", string];
      if (kind === "folder") {
        await supabase
          .from("studio_course_folders" as never)
          .delete()
          .eq("id", id);
      } else {
        const course = (data ?? []).find((c) => c.id === id);
        if (course?.published) {
          toast.warning(`Unpublish "${course.title}" before deleting it.`);
          continue;
        }
        await supabase
          .from("studio_courses")
          .update({ deleted_at: new Date().toISOString() } as never)
          .eq("id", id);
      }
    }
    setSelected(new Set());
    refreshAll();
  };

  const moveSelected = async (destination: string) => {
    if (!selected.size) return;
    const destId = destination || null;
    for (const key of selected) {
      const [kind, id] = key.split(":") as ["folder" | "course", string];
      if (kind === "folder") {
        if (id === destId) continue;
        await supabase
          .from("studio_course_folders" as never)
          .update({ parent_id: destId } as never)
          .eq("id", id);
      } else {
        await supabase
          .from("studio_courses")
          .update({ folder_id: destId } as never)
          .eq("id", id);
      }
    }
    setSelected(new Set());
    refreshAll();
    toast.success("Moved.");
  };

  const allFolderOptions = (allFolders ?? []).map((f) => ({ id: f.id, name: f.name }));

  return (
    <Phone>
      <Header />
      <Sheet wide>
        <div className="mb-4">
          <CanvasHeading eyebrow="For trainers" title="Course Studio" />
          <StudioSavedWorkspaces />
        </div>
        {ready && !user ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            <Link to="/auth" className="font-semibold text-primary">
              Sign in
            </Link>{" "}
            to create courses.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Create and edit courses here. New courses are always created in the root folder — move
              them afterwards if you like.
            </p>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              {user && <CourseWizard />}
              <Button asChild variant="outline">
                <Link to="/studio/content-library">
                  <Library className="h-4 w-4" />
                  Content Library
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/studio/grading-queue">
                  <ClipboardCheck className="h-4 w-4" />
                  Grading Queue
                </Link>
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Input
                aria-label="Search your courses"
                placeholder="Search your courses"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-md"
              />
              <select
                aria-label="Course status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All courses</option>
                <option value="draft">Drafts</option>
                <option value="published">Published</option>
                <option value="revision">Revisions</option>
              </select>
              <CourseViewToggle view={view} onChange={setView} />
              {view === "cards" && (
                <div
                  role="group"
                  aria-label="Card size"
                  className="flex shrink-0 items-center gap-1"
                >
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="Zoom out — more, smaller cards"
                    disabled={density === CARD_GRID_CLASSES.length - 1}
                    onClick={() => changeDensity(density + 1)}
                  >
                    <ZoomOut className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="Zoom in — fewer, larger cards"
                    disabled={density === 0}
                    onClick={() => changeDensity(density - 1)}
                  >
                    <ZoomIn className="size-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Breadcrumbs */}
            <div className="mt-4 flex flex-wrap items-center gap-1 text-sm">
              <button
                type="button"
                onClick={() => setFolderPath([])}
                className={`font-medium ${!currentFolderId ? "text-foreground" : "text-primary hover:underline"}`}
              >
                Courses
              </button>
              {folderPath.map((f, i) => (
                <span key={f.id} className="flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => setFolderPath(folderPath.slice(0, i + 1))}
                    className={`font-medium ${i === folderPath.length - 1 ? "text-foreground" : "text-primary hover:underline"}`}
                  >
                    {f.name}
                  </button>
                </span>
              ))}
            </div>

            {/* Folder toolbar */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-y border-border py-2 text-sm">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={
                    selected.size > 0 && selected.size === folders.length + coursesHere.length
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set([
                            ...folders.map((f): SelectedKey => `folder:${f.id}`),
                            ...coursesHere.map((c): SelectedKey => `course:${c.id}`),
                          ])
                        : new Set(),
                    )
                  }
                />
                Select all
              </label>
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              <Button
                size="sm"
                variant="outline"
                disabled={selected.size !== 1}
                onClick={() => {
                  const key = [...selected][0]!;
                  const [kind, id] = key.split(":") as ["folder" | "course", string];
                  const current =
                    kind === "folder"
                      ? folders.find((f) => f.id === id)?.name
                      : coursesHere.find((c) => c.id === id)?.title;
                  if (current) startRename(key, current);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Rename
              </Button>
              {!!selected.size && (
                <select
                  aria-label="Move selected to"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value !== "__placeholder__") void moveSelected(e.target.value);
                    e.target.value = "";
                  }}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="__placeholder__" disabled>
                    Move to…
                  </option>
                  <option value="">Courses (root)</option>
                  {allFolderOptions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={!selected.size}
                onClick={() => void deleteSelected()}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
              <div className="ml-auto flex items-center gap-2">
                {newFolderName !== null ? (
                  <div className="flex items-center gap-1">
                    <Input
                      autoFocus
                      aria-label="New folder name"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void createFolder();
                        if (e.key === "Escape") setNewFolderName(null);
                      }}
                      className="h-8 w-40 text-xs"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Create folder"
                      onClick={() => void createFolder()}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Cancel"
                      onClick={() => setNewFolderName(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setNewFolderName("")}>
                    <FolderPlus className="h-3.5 w-3.5" />
                    New folder
                  </Button>
                )}
                <AutoCategoriseButton
                  mode="courses"
                  disabled={!user || coursesPending || !!coursesError}
                  items={coursesHere
                    .filter(
                      (c) =>
                        c.title.toLowerCase().includes(search.toLowerCase()) &&
                        (status === "all" ||
                          (status === "published" && c.published) ||
                          (status === "draft" && !c.published) ||
                          (status === "revision" && !!c.revision_of)),
                    )
                    .map((c) => ({
                      id: c.id,
                      title: c.title,
                      description: c.description ?? "",
                      folderId: c.folder_id,
                      sector: "Uncategorised",
                      published: c.published,
                    }))}
                  onApplied={refreshAll}
                />
              </div>
            </div>

            <div
              className={
                view === "cards"
                  ? `mt-5 grid gap-3 ${CARD_GRID_CLASSES[density]}`
                  : "mt-5 grid gap-3"
              }
            >
              {folders.map((f) => {
                const key: SelectedKey = `folder:${f.id}`;
                return (
                  <article
                    key={f.id}
                    className="flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-border p-3 hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggleSelect(key)}
                    />
                    <FolderInput className="h-6 w-6 shrink-0 text-amber-500" />
                    {renaming === key ? (
                      <Input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitRename();
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        onBlur={() => void commitRename()}
                        className="h-7 flex-1 text-sm"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setFolderPath([...folderPath, { id: f.id, name: f.name }])}
                        className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-primary"
                      >
                        {f.name}
                      </button>
                    )}
                  </article>
                );
              })}
              {coursesHere
                .filter(
                  (c) =>
                    c.title.toLowerCase().includes(search.toLowerCase()) &&
                    (status === "all" ||
                      (status === "published" && c.published) ||
                      (status === "draft" && !c.published) ||
                      (status === "revision" && !!c.revision_of)),
                )
                .map((c) => {
                  const key: SelectedKey = `course:${c.id}`;
                  return (
                    <article
                      key={c.id}
                      className={`min-w-0 overflow-hidden rounded-lg border border-border hover:bg-muted/50 ${view === "list" ? "flex items-center" : ""}`}
                    >
                      {c.cover_url ? (
                        <img
                          src={c.cover_url}
                          alt=""
                          className={
                            view === "cards"
                              ? "aspect-video w-full object-cover"
                              : "aspect-video w-32 shrink-0 object-cover sm:w-44"
                          }
                        />
                      ) : (
                        <div
                          className={`grid aspect-video place-items-center bg-muted text-xs text-muted-foreground ${view === "cards" ? "w-full" : "w-32 shrink-0 sm:w-44"}`}
                        >
                          No cover image
                        </div>
                      )}
                      <div className="min-w-0 flex-1 p-5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-1.5 shrink-0"
                              checked={selected.has(key)}
                              onChange={() => toggleSelect(key)}
                            />
                            {renaming === key ? (
                              <Input
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void commitRename();
                                  if (e.key === "Escape") setRenaming(null);
                                }}
                                onBlur={() => void commitRename()}
                                className="h-7 text-sm"
                              />
                            ) : (
                              <Link
                                to="/studio/$id"
                                params={{ id: c.id }}
                                className="break-words font-semibold hover:text-primary"
                              >
                                {c.title}
                              </Link>
                            )}
                          </div>
                          <StudioCourseActions course={c} onChanged={refreshAll} />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {c.category} ·{" "}
                          {(c.studio_modules as unknown as { count: number }[])[0]?.count ?? 0}{" "}
                          modules ·{" "}
                          {(c.studio_lessons as unknown as { count: number }[])[0]?.count ?? 0}{" "}
                          lessons
                        </p>
                        <Link
                          to="/competencies/$courseId"
                          params={{ courseId: c.revision_of ?? c.id }}
                          className="mt-3 inline-block text-xs font-semibold text-primary"
                        >
                          Competencies & assessment
                        </Link>
                        <Link
                          to="/gradebook/$courseId"
                          params={{ courseId: c.revision_of ?? c.id }}
                          className="ml-4 mt-3 inline-block text-xs font-semibold text-primary"
                        >
                          Gradebook
                        </Link>
                        <div className="mt-2 flex gap-2 text-[11px]">
                          <span
                            className={`rounded-full px-2 py-0.5 ${c.published ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"}`}
                          >
                            {c.published ? "Published" : c.revision_of ? "Draft revision" : "Draft"}
                          </span>
                          <span className="text-muted-foreground">v1.{c.version_number - 1}</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              {user && coursesPending && (
                <p role="status" className="col-span-full py-6 text-sm text-muted-foreground">
                  Loading your courses…
                </p>
              )}
              {coursesError && (
                <div
                  role="alert"
                  className="col-span-full rounded-md border border-destructive/30 p-4 text-sm"
                >
                  <p>Your courses could not be loaded. Please try again.</p>
                  <Button
                    className="mt-2"
                    variant="outline"
                    size="sm"
                    onClick={() => void refetchCourses()}
                  >
                    Try again
                  </Button>
                </div>
              )}
              {!coursesPending && !coursesError && !folders.length && !coursesHere.length && (
                <p className="col-span-full flex items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground">
                  <Folder className="h-5 w-5" />
                  {currentFolderId
                    ? "This folder is empty."
                    : "No courses yet — click Create above to start."}
                </p>
              )}
            </div>
          </>
        )}
      </Sheet>
    </Phone>
  );
}
