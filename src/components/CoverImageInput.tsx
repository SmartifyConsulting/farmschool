import { useRef, useState } from "react";
import { ImageIcon, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const COVER_BUCKET = "course-covers";
const MAX_BYTES = 5 * 1024 * 1024;

/** Drag-and-drop (or click-to-browse) cover image picker; uploads to the course-covers bucket and reports back its public URL. Also accepts a pasted link. */
export function CoverImageInput({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please drop an image file."); return; }
    if (file.size > MAX_BYTES) { toast.error("Image must be smaller than 5MB."); return; }
    setUploading(true);
    const path = `${crypto.randomUUID()}-${file.name}`.replace(/\s+/g, "-");
    const { error } = await supabase.storage.from(COVER_BUCKET).upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) { toast.error("Could not upload the image."); return; }
    const { data } = supabase.storage.from(COVER_BUCKET).getPublicUrl(path);
    onChange(data.publicUrl);
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 text-center text-sm transition-colors ${dragging ? "border-primary bg-primary/5" : "border-input"}`}
      >
        {value ? (
          <div className="relative w-full">
            <img src={value} alt="Cover preview" className="mx-auto max-h-32 rounded-md object-cover" />
            <button type="button" onClick={(e) => { e.stopPropagation(); onChange(""); }} className="absolute -right-2 -top-2 rounded-full bg-background p-1 shadow" aria-label="Remove cover image">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : uploading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
            <p className="text-muted-foreground">Drag and drop a cover image, or click to browse</p>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void upload(file);
        e.target.value = "";
      }} />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Or paste a cover image link (https://…)" />
    </div>
  );
}
