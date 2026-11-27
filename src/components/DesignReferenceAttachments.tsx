import { useRef, useState, type ReactNode } from "react";
import { Plus, Paperclip, Library, X } from "lucide-react";
import { useLibraryMaterials } from "@/hooks/useLibraryMaterials";
import type { LibraryFile } from "@/lib/library-materials";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
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
  children,
}: {
  children: ReactNode;
  value: DesignReference[];
  onChange: (references: DesignReference[]) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [search, setSearch] = useState("");
  const library = useLibraryMaterials(choosing);
  const busyRef = useRef(false);
  const existing = async (row: LibraryFile) => {
    if (!user || busyRef.current || value.length >= 3) return;
    busyRef.current = true;
    setBusy(true);
    onBusyChange?.(true);
    try {
      const { data, error } = await supabase.storage
        .from("studio-content")
        .download(row.storage_path);
      if (error || !data) throw error ?? Error("Could not read this file.");
      const file = new File([data], row.original_file_name, { type: data.type });
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
        throw Error("This reference has no readable text. Choose another file.");
      onChange([...value, { fileId: row.id, name: row.file_name, text, image }]);
      setChoosing(false);
      setSearch("");
    } catch (error) {
      toast.error(friendlyError(error, "Could not attach this library file."));
    } finally {
      busyRef.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  const attach = async (files: File[]) => {
    if (!user || busyRef.current) return;
    if (value.length + files.length > 3) {
      toast.error("Attach up to three design references.");
      return;
    }
    busyRef.current = true;
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
      busyRef.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  return (
    <section
      aria-label="Course design reference attachments"
      className="space-y-2"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void attach([...event.dataTransfer.files]);
      }}
    >
      <div className="relative">
        {children}
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute bottom-2 left-2 h-8 w-8 rounded-full"
              disabled={busy || value.length >= 3}
              aria-label={busy ? "Attaching files" : "Add photos and files"}
              title="Add photos and files"
            >
              <Plus className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => input.current?.click()}>
              <Paperclip className="mr-2 size-4" />
              Add photos &amp; files
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setChoosing(true)}>
              <Library className="mr-2 size-4" />
              Add from library
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {busy && (
        <p role="status" className="supporting-text">
          Attaching files…
        </p>
      )}
      {value.length > 0 && (
        <p className="supporting-text text-muted-foreground">
          Attached files guide presentation; training facts come from the raw material.
        </p>
      )}
      <ul className="flex flex-wrap gap-2">
        {value.map((reference) => (
          <li
            key={reference.fileId}
            className="flex max-w-full items-center gap-2 rounded-md border bg-muted/30 py-1 pl-2 text-sm"
          >
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
      <Dialog
        open={choosing}
        onOpenChange={(open) => {
          if (!busy) setChoosing(open);
        }}
      >
        <DialogContent className="max-h-[80vh] max-w-xl overflow-y-auto">
          <DialogTitle>Add from library</DialogTitle>
          <DialogDescription>
            Choose up to three of your own documents or images as design references. Originals stay
            in your library.
          </DialogDescription>
          <Input
            aria-label="Search design reference files"
            placeholder="Find a document or image"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {library.error ? (
            <p role="alert">Could not load your library.</p>
          ) : library.loading ? (
            <p role="status">Loading files…</p>
          ) : (
            <ul className="space-y-2">
              {library.files
                .filter(
                  (file) =>
                    /\.(pdf|docx|pptx|txt|md|png|jpe?g|webp)$/i.test(file.original_file_name) &&
                    !value.some((ref) => ref.fileId === file.id) &&
                    file.file_name.toLowerCase().includes(search.toLowerCase()),
                )
                .slice(0, 50)
                .map((file) => (
                  <li key={file.id} className="flex items-center gap-2 rounded border p-2">
                    <span className="min-w-0 flex-1 break-words text-sm">{file.file_name}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy || value.length >= 3}
                      onClick={() => void existing(file)}
                    >
                      Attach
                    </Button>
                  </li>
                ))}
            </ul>
          )}
          <p className="supporting-text">
            PDF, Word, PowerPoint, text or images. Search to narrow the first 50 results. Documents
            up to 12 MB; images up to 2 MB.
          </p>
        </DialogContent>
      </Dialog>
    </section>
  );
}
