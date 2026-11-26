import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";

export function OrganizationLogoInput({
  organizationId,
  value,
  onChange,
  disabled,
  onUploadingChange,
}: {
  organizationId: string;
  value: string;
  onChange: (url: string) => void;
  disabled: boolean;
  onUploadingChange: (busy: boolean) => void;
}) {
  const { user } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const active = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const upload = async (file: File) => {
    if (disabled || active.current || !user) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Choose a PNG, JPEG or WebP logo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("The logo must be 5 MB or smaller.");
      return;
    }
    active.current = true;
    setUploading(true);
    onUploadingChange(true);
    try {
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > 40000000)
          throw new Error("Choose a logo with smaller image dimensions.");
        const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare this image.");
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (data) => (data ? resolve(data) : reject(new Error("Could not prepare this image."))),
            "image/png",
          ),
        );
        if (blob.size > 5 * 1024 * 1024) throw new Error("Choose a smaller logo.");
        const path = `${user.id}/organization-logos/${organizationId}/${crypto.randomUUID()}.png`;
        const storage = supabase.storage.from("course-covers");
        const saved = await storage.upload(path, blob, { contentType: "image/png", upsert: false });
        if (saved.error) throw saved.error;
        onChange(storage.getPublicUrl(path).data.publicUrl);
        toast.success("Logo uploaded. Save branding to apply it to the workspace.");
      } finally {
        bitmap.close();
      }
    } catch (error) {
      toast.error(friendlyError(error, "Could not upload the logo. Your current logo was kept."));
    } finally {
      active.current = false;
      setUploading(false);
      onUploadingChange(false);
    }
  };
  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={disabled || uploading ? -1 : 0}
        aria-label="Choose or drop organisation logo"
        aria-disabled={disabled || uploading}
        className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 text-center text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${dragging ? "border-primary bg-primary/5" : "border-input"}`}
        onClick={() => {
          if (!disabled && !uploading) input.current?.click();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!disabled && !uploading) input.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !uploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void upload(file);
        }}
      >
        {uploading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <p role="status">Uploading logo…</p>
          </>
        ) : (
          <>
            {value ? (
              <img
                src={value}
                alt="Organisation logo preview"
                className="organization-logo max-h-24 max-w-full rounded-md p-2 object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <ImagePlus className="h-6 w-6 text-muted-foreground" />
            )}
            <p>Drag and drop your logo, or click to upload</p>
            <p className="supporting-text text-muted-foreground">
              PNG, JPEG or WebP · up to 5 MB · original proportions preserved
            </p>
          </>
        )}
      </div>
      <input
        ref={input}
        type="file"
        aria-label="Upload organisation logo"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
      {value && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || uploading}
          onClick={() => onChange("")}
        >
          Remove logo
        </Button>
      )}
    </div>
  );
}
