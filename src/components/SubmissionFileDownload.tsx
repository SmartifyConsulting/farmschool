import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { SUBMISSION_FILE_BUCKET } from "@/lib/submission-files";
import { friendlyError } from "@/lib/friendly-error";

export function SubmissionFileDownload({
  path,
  name,
}: {
  path: string | null;
  name: string | null;
}) {
  const [busy, setBusy] = useState(false);
  if (!path) return null;
  const download = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.storage
        .from(SUBMISSION_FILE_BUCKET)
        .createSignedUrl(path, 300, { download: name ?? true });
      if (error || !data?.signedUrl) throw error ?? new Error("File unavailable");
      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.download = name ?? "evidence";
      link.rel = "noopener noreferrer";
      link.click();
    } catch (error) {
      toast.error(friendlyError(error, "Could not download this evidence file."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-auto min-h-9 max-w-full whitespace-normal break-all py-2 text-left"
      disabled={busy}
      onClick={() => void download()}
    >
      {busy ? "Preparing download…" : "Download " + (name ?? "evidence file")}
    </Button>
  );
}
