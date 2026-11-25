import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SectionTabsList, SectionTabsTrigger } from "@/components/SectionTabs";
import { BlockListEditor } from "@/components/BlockListEditor";
import { SlidePlayer } from "@/components/SlidePlayer";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { extractDocument } from "@/lib/document-extraction";
import { parseLessonSlides } from "@/lib/lesson-slides";
import { buildLessonScormZip } from "@/lib/scorm-export";
import { produceLibraryLesson } from "@/lib/library-production.functions";
import { friendlyError } from "@/lib/friendly-error";
import { rpcArgs } from "@/lib/rpc-args";
import { portableMaterialText, type LibraryFile } from "@/lib/library-materials";
import {
  MAX_SOURCE_CHARACTERS,
  MAX_LESSON_CHARACTERS,
  splitProductionSource,
  produceSections,
} from "@/lib/library-production";

export function MaterialProducer({
  sources,
  folderId,
  initialBody,
  initialTitle,
  onClose,
  onSaved,
}: {
  sources: LibraryFile[];
  folderId: string | null;
  initialBody?: string | undefined;
  initialTitle?: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const generate = useServerFn(produceLibraryLesson);
  const [title, setTitle] = useState(initialTitle ?? sources[0]!.file_name.replace(/\.[^.]+$/, ""));
  const [body, setBody] = useState(initialBody ?? "");
  const [sourceText, setSourceText] = useState("");
  const [instruction, setInstruction] = useState(
    "Create clear training slides with explanations, a practical example and a short checklist. Keep the source facts.",
  );
  const [loading, setLoading] = useState(!initialBody);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<"text" | "scorm">("text");
  const [edited, setEdited] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [incomplete, setIncomplete] = useState(false);
  const [transforming, setTransforming] = useState(false);
  const [stopping, setStopping] = useState(false);
  const stopRequested = useRef(false);
  const production = useRef<{ key: string; results: string[] } | null>(null);
  const sections = useMemo(() => splitProductionSource(sourceText), [sourceText]);
  const attempt = useRef<{
    key: string;
    id: string;
    path: string;
    blob: Blob;
    name: string;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    setSourceText("");
    setCompleted(0);
    setIncomplete(false);
    production.current = null;
    void (async () => {
      try {
        const sections: string[] = [];
        for (const file of sources) {
          if (file.size_bytes > 12 * 1024 * 1024)
            throw new Error("Each transformation source must be 12 MB or smaller.");
          const { data, error } = await supabase.storage
            .from("studio-content")
            .download(file.storage_path);
          if (error || !data) throw error ?? new Error("A source could not be opened.");
          const pages = await extractDocument(new File([data], file.original_file_name));
          sections.push(
            `## ${file.original_file_name}\n\n` + pages.map((page) => page.text).join("\n\n"),
          );
          if (sections.join("\n\n").length > MAX_SOURCE_CHARACTERS)
            throw new Error(
              "Choose fewer sources for this lesson: the selection exceeds 1,000,000 characters.",
            );
        }
        const text = sections.join("\n\n");
        if (!text.trim()) throw new Error("No readable source text was found.");
        if (!cancelled) {
          setSourceText(text);
          if (!initialBody) setBody(text);
        }
      } catch (error) {
        if (!cancelled)
          setLoadError(
            friendlyError(
              error,
              "Could not read these sources. Choose readable PDF, DOCX, TXT or MD files.",
            ),
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      stopRequested.current = true;
    };
  }, [sources, initialBody]);
  const close = async () => {
    if (busy) return;
    if (
      edited &&
      !(await confirm({
        title: "Discard this unsaved output?",
        description: "The Raw files are unchanged. This output has not been saved to Completed.",
        confirmLabel: "Discard output",
        cancelLabel: "Keep editing",
      }))
    )
      return;
    onClose();
  };
  const run = async () => {
    if (busy || !sections.length || loadError) return;
    const key = JSON.stringify({
      ids: sources.map((file) => file.id),
      title,
      sourceText,
      instruction,
    });
    const cachedBody = production.current?.results.join("\n\n") ?? "";
    if (
      edited &&
      body.trim() &&
      (production.current?.key !== key || body !== cachedBody || !incomplete) &&
      !(await confirm({
        title: "Replace this draft with AI output?",
        description:
          "Your current edits will be replaced by the combined lesson. Your Raw sources stay unchanged.",
        confirmLabel: "Transform material",
        cancelLabel: "Keep editing",
      }))
    )
      return;
    if (production.current?.key !== key || production.current.results.length === sections.length)
      production.current = { key, results: [] };
    const batch = production.current;
    stopRequested.current = false;
    setStopping(false);
    setCompleted(batch.results.length);
    setIncomplete(true);
    setTransforming(true);
    setBusy(true);
    try {
      const finished = await produceSections({
        sections,
        results: batch.results,
        generate: async (text, index, total) => {
          const result = await generate({
            data: {
              sourceIds: sources.map((file) => file.id),
              title,
              sourceText: text,
              instruction,
              sectionIndex: index,
              sectionCount: total,
            },
          });
          return result.body;
        },
        onProgress: (count, body) => {
          setCompleted(count);
          setBody(body);
          setEdited(true);
        },
        stopped: () => stopRequested.current,
      });
      setIncomplete(!finished);
    } catch (error) {
      toast.error(
        friendlyError(error, "Processing stopped. Completed sections are kept; retry to continue."),
      );
    } finally {
      setTransforming(false);
      setBusy(false);
    }
  };
  const save = async () => {
    if (
      !user ||
      busy ||
      incomplete ||
      body.length > MAX_LESSON_CHARACTERS ||
      !title.trim() ||
      !body.trim()
    )
      return;
    setBusy(true);
    try {
      const key = JSON.stringify({
        title,
        body,
        format,
        folderId,
        ids: sources.map((file) => file.id),
      });
      if (attempt.current?.key !== key) {
        const id = crypto.randomUUID();
        const name =
          (title.trim().replace(/[\\/:*?"<>|]/g, "-") || "Learning material") +
          (format === "scorm" ? ".zip" : ".md");
        const blob =
          format === "scorm"
            ? new Blob(
                [
                  (await buildLessonScormZip(
                    title,
                    {
                      lessonTitle: title,
                      lessonSummary: portableMaterialText(body),
                      questions: [],
                    },
                    id,
                  )) as Uint8Array<ArrayBuffer>,
                ],
                { type: "application/zip" },
              )
            : new Blob([body], { type: "text/markdown;charset=utf-8" });
        attempt.current = {
          key,
          id,
          name,
          blob,
          path: `${user.id}/library/produced/${id}/${name}`,
        };
      }
      const output = attempt.current!;
      // Retrying writes the same cached bytes to this attempt's unique private path.
      const { error: uploadError } = await supabase.storage
        .from("studio-content")
        .upload(output.path, output.blob, { contentType: output.blob.type, upsert: true });
      if (uploadError) throw uploadError;
      const { data, error } = await supabase.rpc(
        "content_library_register_produced" as never,
        rpcArgs("content_library_register_produced", {
          _file_id: output.id,
          _source_ids: sources.map((file) => file.id),
          _file_name: output.name,
          _file_type: format,
          _storage_path: output.path,
          _size_bytes: output.blob.size,
          _description: `Created from ${sources.map((file) => file.file_name).join(", ")}`.slice(
            0,
            4000,
          ),
          _folder_id: folderId,
        }) as never,
      );
      if (error) {
        // A database rejection rolls back registration. Unknown transport outcomes
        // keep bytes for idempotent retry rather than deleting a possibly saved output.
        if (/^[0-9A-Z]{5}$/.test(error.code ?? ""))
          await supabase.storage.from("studio-content").remove([output.path]);
        throw error;
      }
      if (data !== output.id)
        throw new Error("Save not confirmed. Retry this output before starting another copy.");
      toast.success("Saved to Completed. Your Raw sources are unchanged.");
      onSaved();
    } catch (error) {
      toast.error(
        friendlyError(
          error,
          "Could not confirm the output save. Retry this output; your Raw sources are unchanged.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogTitle>Produce learning material</DialogTitle>
        <p className="text-sm text-muted-foreground">
          Sources: {sources.map((file) => file.file_name).join(" · ")}. Saving here does not publish
          a course.
        </p>
        <label className="block text-sm">
          Output title
          <Input
            value={title}
            maxLength={200}
            disabled={busy}
            onChange={(e) => {
              setTitle(e.target.value);
              setEdited(true);
            }}
          />
        </label>
        {loading && <p role="status">Reading source material…</p>}
        {loadError && <p role="alert">{loadError}</p>}
        {!loading && !loadError && sections.length > 1 && (
          <p className="text-sm text-muted-foreground">
            This material will be processed in {sections.length} sections and combined into one
            lesson. Each section uses one AI request from your existing allowance.
          </p>
        )}
        {incomplete && !busy && (
          <p role="status" className="text-sm">
            {completed} of {sections.length} sections complete. Retry to finish the remaining
            sections. Keep this window open to retain progress.
          </p>
        )}
        {transforming && (
          <div role="status" className="space-y-2 text-sm">
            <p>
              {stopping
                ? "Stopping after the current section…"
                : `Processing section ${Math.min(completed + 1, sections.length)} of ${sections.length}…`}
            </p>
            <Button
              variant="outline"
              disabled={stopping}
              onClick={() => {
                stopRequested.current = true;
                setStopping(true);
              }}
            >
              Stop After This Section
            </Button>
          </div>
        )}
        <fieldset disabled={busy || loading} className="space-y-3">
          <label className="block text-sm">
            Transformation instructions (optional AI assistance)
            <Textarea
              value={instruction}
              maxLength={1000}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </label>
          <Button
            variant="outline"
            disabled={!sourceText || !!loadError || !instruction.trim() || !title.trim()}
            onClick={() => void run()}
          >
            {incomplete ? "Retry Remaining Sections" : "Transform with AI"}
          </Button>
          <p className="text-sm text-muted-foreground">
            AI runs only when you choose it and uses your existing AI allowance. You can build and
            edit blocks manually.
          </p>
          <Tabs defaultValue="edit">
            <SectionTabsList aria-label="Completed material workspace">
              <SectionTabsTrigger value="edit">Edit</SectionTabsTrigger>
              <SectionTabsTrigger value="preview">Preview</SectionTabsTrigger>
            </SectionTabsList>
            <TabsContent value="edit">
              <BlockListEditor
                value={body}
                lessonTitle={title}
                onChange={(text) => {
                  setBody(text);
                  setEdited(true);
                }}
              />
            </TabsContent>
            <TabsContent value="preview">
              {body.trim() && <SlidePlayer slides={parseLessonSlides(body)} />}
            </TabsContent>
          </Tabs>
          <label className="block text-sm">
            Output format
            <select
              className="ml-2 rounded-md border bg-background p-2"
              value={format}
              onChange={(e) => setFormat(e.target.value as "text" | "scorm")}
            >
              <option value="text">Editable lesson (.md)</option>
              <option value="scorm">SCORM text lesson (.zip)</option>
            </select>
          </label>
          <div className="flex gap-2">
            <Button
              disabled={
                incomplete || !body.trim() || body.length > MAX_LESSON_CHARACTERS || !title.trim()
              }
              onClick={() => void save()}
            >
              Save to Completed
            </Button>
            <Button variant="outline" onClick={() => void close()}>
              Cancel
            </Button>
          </div>
          {body.length > MAX_LESSON_CHARACTERS && (
            <p className="text-sm text-muted-foreground">
              Transform the source into a lesson, or shorten the draft to 100,000 characters before
              saving.
            </p>
          )}
        </fieldset>
        {busy && <p role="status">Working…</p>}
      </DialogContent>
    </Dialog>
  );
}
