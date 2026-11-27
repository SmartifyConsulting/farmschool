import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { extractDocument } from "@/lib/document-extraction";
import { detectContentFileType } from "@/lib/studio-content";
import { friendlyError } from "@/lib/friendly-error";
import { type DesignReference } from "@/lib/design-reference";
import { toast } from "sonner";
export function DesignReferenceAttachments({
  value,
  onChange,
  onBusyChange,
}: {
  value: DesignReference[];
  onChange: (references: DesignReference[]) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const attach = async (files: File[]) => {
    if (!user || busy) return;
    if (value.length + files.length > 3) {
      toast.error("Attach up to three design references.");
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    const next = [...value];
    try {
      for (const file of files) {
        if (!/\.(pdf|docx|pptx|txt|md|png|jpe?g|webp)$/i.test(file.name))
          throw Error("Use PDF, Word, PowerPoint, text, PNG, JPEG or WebP reference files.");
        const image = /\.(png|jpe?g|webp)$/i.test(file.name);
        if (file.size > (image ? 2 : 12) * 1024 * 1024)
          throw Error(
            image
              ? "Reference images must be 2 MB or smaller."
              : "Reference documents must be 12 MB or smaller.",
          );
        const text = image
          ? ""
          : (await extractDocument(file))
              .map((page) => page.text)
              .join("\n\n")
              .slice(0, 12000);
        if (!image && !text.trim())
          throw Error("This reference has no readable text. Use a readable document or an image.");
        const id = crypto.randomUUID();
        const path = `${user.id}/library/design-references/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const upload = await supabase.storage
          .from("studio-content")
          .upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (upload.error) throw upload.error;
        const saved = await supabase.from("content_library_files" as never).insert({
          id,
          author_id: user.id,
          file_name: file.name,
          original_file_name: file.name,
          file_type: detectContentFileType(file.name),
          storage_path: path,
          size_bytes: file.size,
          material_stage: "raw",
          classification: "Course design reference",
          keywords: ["purpose:design-reference"],
          description:
            "Design and layout reference, separate from factual training source material.",
        } as never);
        if (saved.error) throw saved.error;
        next.push({ fileId: id, name: file.name, text, image });
        onChange([...next]);
      }
      await qc.invalidateQueries({ queryKey: ["content-library-all"] });
    } catch (error) {
      toast.error(friendlyError(error, "Could not attach this reference."));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  return (
    <section
      aria-label="Course design reference attachments"
      className="space-y-2 rounded-lg border border-dashed p-3"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void attach([...event.dataTransfer.files]);
      }}
    >
      <input
        ref={input}
        type="file"
        multiple
        accept=".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp"
        aria-label="Attach course design reference files"
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          void attach([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy || value.length >= 3}
        onClick={() => input.current?.click()}
      >
        <Paperclip />
        {busy ? "Attaching…" : "Attach design reference"}
      </Button>
      <p className="supporting-text text-muted-foreground">
        Drop an example document or image here to show the AI your preferred layout. These guide
        presentation; training facts still come from the raw material. Documents use up to 12,000
        extracted characters; images are supplied to the AI.
      </p>
      <ul className="space-y-1">
        {value.map((reference) => (
          <li key={reference.fileId} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 break-words">{reference.name}</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={busy}
              aria-label={`Detach ${reference.name}`}
              onClick={() => onChange(value.filter((item) => item.fileId !== reference.fileId))}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
