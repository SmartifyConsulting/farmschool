import { useEffect, useRef, useState } from "react";
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
  const attempt = useRef<{
    key: string;
    id: string;
    path: string;
    blob: Blob;
    name: string;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
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
          if (sections.join("\n\n").length > 100000)
            throw new Error(
              "Choose fewer or smaller sources: this selection exceeds 100,000 characters.",
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
    };
  }, [sources, initialBody]);
  const close = async () => {
    if (busy) return;
    if (
      edited &&
      !(await confirm({
        title: "Discard this unsaved output?",
        description: "The Raw files are unchanged. This output has not been saved to Processed.",
        confirmLabel: "Discard output",
        cancelLabel: "Keep editing",
      }))
    )
      return;
    onClose();
  };
  const run = async () => {
    setBusy(true);
    try {
      const result = await generate({
        data: { sourceIds: sources.map((file) => file.id), title, sourceText, instruction },
      });
      setBody(result.body);
      setEdited(true);
    } catch (error) {
      toast.error(
        friendlyError(error, "Could not transform this material. You can edit it manually."),
      );
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!user || busy || !title.trim() || !body.trim()) return;
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
          _description: `Processed from ${sources.map((file) => file.file_name).join(", ")}`.slice(
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
      toast.success("Saved to Processed. Your Raw sources are unchanged.");
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
            disabled={!sourceText || !instruction.trim() || !title.trim()}
            onClick={() => void run()}
          >
            Transform with AI
          </Button>
          <p className="text-sm text-muted-foreground">
            AI runs only when you choose it and uses your existing AI allowance. You can build and
            edit blocks manually.
          </p>
          <Tabs defaultValue="edit">
            <SectionTabsList aria-label="Processed material workspace">
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
              disabled={!body.trim() || body.length > 100000 || !title.trim()}
              onClick={() => void save()}
            >
              Save to Processed
            </Button>
            <Button variant="outline" onClick={() => void close()}>
              Cancel
            </Button>
          </div>
        </fieldset>
        {busy && <p role="status">Working…</p>}
      </DialogContent>
    </Dialog>
  );
}
