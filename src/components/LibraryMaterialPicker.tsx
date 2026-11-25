import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SectionTabsList, SectionTabsTrigger } from "@/components/SectionTabs";
import { useLibraryMaterials } from "@/hooks/useLibraryMaterials";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { rpcArgs } from "@/lib/rpc-args";
import { libraryFolderPath, type LibraryFile } from "@/lib/library-materials";
import { matchesMaterialType, materialSector, type MaterialType } from "@/lib/library-materials";
import { CATALOGUE_SECTORS } from "@/lib/catalogue-sectors";
import { MaterialTypeFilters } from "@/components/MaterialTypeFilters";

export function LibraryMaterialPicker({
  courseId,
  search,
  children,
}: {
  courseId: string;
  search: string;
  children: ReactNode;
}) {
  const library = useLibraryMaterials();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [folder, setFolder] = useState("");
  const [fileType, setFileType] = useState<MaterialType>("All");
  const [sector, setSector] = useState("");
  const [attempts] = useState(
    new Map<string, { id: string; path: string; lessonId: string | null }>(),
  );
  const reuse = async (file: LibraryFile, lesson: boolean) => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const { data: course, error: courseError } = await supabase
        .from("studio_courses")
        .select("author_id,published")
        .eq("id", courseId)
        .single();
      if (courseError || !course || course.author_id !== user.id || course.published)
        throw new Error("Open your own draft course before reusing content.");
      const key = file.id + ":" + lesson;
      if (!attempts.has(key)) {
        const id = crypto.randomUUID();
        attempts.set(key, {
          id,
          path: `${user.id}/${courseId}/library-copy/${id}/${file.original_file_name}`,
          lessonId: lesson ? crypto.randomUUID() : null,
        });
      }
      const attempt = attempts.get(key)!;
      const { error: copyError } = await supabase.storage
        .from("studio-content")
        .copy(file.storage_path, attempt.path);
      if (copyError && !/already exists|duplicate/i.test(copyError.message)) throw copyError;
      let body: string | null = null;
      if (lesson) {
        const { data, error } = await supabase.storage
          .from("studio-content")
          .download(attempt.path);
        if (error || !data) throw error ?? new Error("Could not read the Completed lesson.");
        if (data.size > 1000000)
          throw new Error("This lesson is too large to reuse as an editable lesson.");
        body = await data.text();
      }
      const { data, error } = await supabase.rpc(
        "content_library_attach_to_draft" as never,
        rpcArgs("content_library_attach_to_draft", {
          _source_id: file.id,
          _course_id: courseId,
          _file_id: attempt.id,
          _storage_path: attempt.path,
          _lesson_id: attempt.lessonId,
          _lesson_body: body,
        }) as never,
      );
      if (error) {
        if (/^[0-9A-Z]{5}$/.test(error.code ?? ""))
          await supabase.storage.from("studio-content").remove([attempt.path]);
        throw error;
      }
      if (data !== attempt.id) throw new Error("Copy not confirmed. Retry the same item.");
      toast.success(
        lesson
          ? "Completed lesson copied into your draft curriculum."
          : "File copied into your draft content library.",
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["studio-content-files", courseId] }),
        qc.invalidateQueries({ queryKey: ["studio-course", courseId] }),
        qc.invalidateQueries({ queryKey: ["studio-lessons", courseId] }),
      ]);
    } catch (error) {
      toast.error(friendlyError(error, "Could not reuse this material. Your source is unchanged."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Tabs defaultValue="raw">
      <SectionTabsList aria-label="Curriculum material source">
        <SectionTabsTrigger value="raw">Raw Material</SectionTabsTrigger>
        <SectionTabsTrigger value="produced">Completed</SectionTabsTrigger>
        <SectionTabsTrigger value="courses">Other courses</SectionTabsTrigger>
      </SectionTabsList>
      {(["raw", "produced"] as const).map((stage) => (
        <TabsContent value={stage} key={stage}>
          <MaterialTypeFilters value={fileType} onChange={setFileType} />
          <label className="mb-2 block text-sm">
            Industry / sector
            <select
              className="ml-2 max-w-full rounded-md border bg-background p-2"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            >
              <option value="">All sectors</option>
              {CATALOGUE_SECTORS.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Folder
            <select
              className="ml-2 max-w-full rounded-md border bg-background p-2"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
            >
              <option value="">All folders</option>
              <option value="root">Root</option>
              {library.folders.map((row) => (
                <option key={row.id} value={row.id}>
                  {libraryFolderPath(row.id, library.folders)}
                </option>
              ))}
            </select>
          </label>
          <p className="my-2 text-sm text-muted-foreground">
            Copies go into your unpublished draft. Original library files stay unchanged.
          </p>
          {library.error ? (
            <p role="alert">Could not load your library.</p>
          ) : library.loading ? (
            <p role="status">Loading material…</p>
          ) : (
            <ul className="space-y-2">
              {library.files
                .filter(
                  (file) =>
                    file.material_stage === stage &&
                    matchesMaterialType(file, fileType) &&
                    (!sector || materialSector(file, library.files, library.links) === sector) &&
                    (!folder ||
                      (folder === "root" ? !file.folder_id : file.folder_id === folder)) &&
                    (file.file_name + " " + libraryFolderPath(file.folder_id, library.folders))
                      .toLowerCase()
                      .includes(search.trim().toLowerCase()),
                )
                .map((file) => (
                  <li
                    key={file.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium">{file.file_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {libraryFolderPath(file.folder_id, library.folders) || "Root"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void reuse(file, false)}
                    >
                      Add file to draft
                    </Button>
                    {stage === "produced" && /\.md$/i.test(file.original_file_name) && (
                      <Button size="sm" disabled={busy} onClick={() => void reuse(file, true)}>
                        Add as lesson
                      </Button>
                    )}
                  </li>
                ))}
            </ul>
          )}
          {!library.loading &&
            !library.error &&
            !library.files.some(
              (file) =>
                file.material_stage === stage &&
                matchesMaterialType(file, fileType) &&
                (!sector || materialSector(file, library.files, library.links) === sector) &&
                (!folder || (folder === "root" ? !file.folder_id : file.folder_id === folder)) &&
                (file.file_name + " " + libraryFolderPath(file.folder_id, library.folders))
                  .toLowerCase()
                  .includes(search.trim().toLowerCase()),
            ) && (
              <p className="py-4 text-sm text-muted-foreground">
                No {stage === "raw" ? "Raw" : "Completed"} files match this search.
              </p>
            )}
        </TabsContent>
      ))}
      <TabsContent value="courses">{children}</TabsContent>
    </Tabs>
  );
}
