import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { friendlyError } from "@/lib/friendly-error";
import {
  PHOTO_EVIDENCE_BUCKET,
  reviewPracticalPhoto,
  submitPracticalPhoto,
} from "@/lib/practical-evidence.functions";

const MAX_BYTES = 8 * 1024 * 1024;

type Submission = {
  id: string;
  user_id: string;
  photo_path: string;
  status: "pending" | "approved" | "rejected";
  trainer_note: string;
};

/** Learner uploads a photo for a practical task; the course author (trainer) signs it off. Private storage, so the preview URL is signed and short-lived. */
export function PhotoEvidence({
  lessonId,
  blockIndex,
  prompt,
  isTrainer,
}: {
  lessonId: string;
  blockIndex: number;
  prompt: string;
  isTrainer: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const submit = useServerFn(submitPracticalPhoto);
  const review = useServerFn(reviewPracticalPhoto);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const key = ["photo-evidence", lessonId, blockIndex, isTrainer];

  const { data: submission, isLoading } = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async (): Promise<Submission | null> => {
      let query = supabase
        .from("lesson_photo_submissions")
        .select("id, user_id, photo_path, status, trainer_note")
        .eq("lesson_id", lessonId)
        .eq("block_index", blockIndex);
      if (!isTrainer) query = query.eq("user_id", user!.id);
      const { data } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
      return (data as Submission | null) ?? null;
    },
  });

  const { data: previewUrl } = useQuery({
    queryKey: [...key, "url", submission?.photo_path],
    enabled: !!submission,
    queryFn: async () => {
      const { data } = await supabase.storage
        .from(PHOTO_EVIDENCE_BUCKET)
        .createSignedUrl(submission!.photo_path, 300);
      return data?.signedUrl ?? null;
    },
  });

  if (!user) return <p className="text-sm text-muted-foreground">Sign in to upload evidence.</p>;
  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be smaller than 8MB.");
      return;
    }
    setBusy(true);
    try {
      const ext = (file.name.match(/\.\w+$/)?.[0] ?? "").slice(0, 10);
      const path = `${user.id}/${lessonId}/${blockIndex}-${crypto.randomUUID()}${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(PHOTO_EVIDENCE_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const response = await submit({ data: { lessonId, blockIndex, photoPath: path } });
      if ("error" in response) throw new Error(response.error);
      await qc.invalidateQueries({ queryKey: key });
    } catch (error) {
      toast.error(friendlyError(error, "Could not upload the photo."));
    } finally {
      setBusy(false);
    }
  };

  const decide = async (status: "approved" | "rejected") => {
    if (!submission || busy) return;
    setBusy(true);
    try {
      const response = await review({
        data: { submissionId: submission.id, status, note },
      });
      if ("error" in response) throw new Error(response.error);
      await qc.invalidateQueries({ queryKey: key });
    } catch (error) {
      toast.error(friendlyError(error, "Could not record the sign-off."));
    } finally {
      setBusy(false);
    }
  };

  if (isTrainer) {
    if (!submission)
      return <p className="text-sm text-muted-foreground">No photo submitted yet.</p>;
    return (
      <div className="space-y-2">
        {previewUrl && (
          <img src={previewUrl} alt="Submitted evidence" className="max-h-48 rounded-lg" />
        )}
        <p className="text-xs font-semibold capitalize">{submission.status}</p>
        {submission.status === "pending" && (
          <>
            <Textarea
              aria-label="Note for the learner"
              rows={2}
              maxLength={1000}
              placeholder="Optional note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={busy} onClick={() => decide("approved")}>
                <Check /> Sign off
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => decide("rejected")}
              >
                <X /> Send back
              </Button>
            </div>
          </>
        )}
        {submission.trainer_note && (
          <p className="text-sm text-muted-foreground">Note: {submission.trainer_note}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Camera className="size-4" /> Practical evidence
      </p>
      <p className="text-sm">{prompt}</p>
      {previewUrl && (
        <img src={previewUrl} alt="Your submitted evidence" className="max-h-48 rounded-lg" />
      )}
      {submission && (
        <p
          className={
            "text-xs font-semibold capitalize " +
            (submission.status === "approved"
              ? "text-primary"
              : submission.status === "rejected"
                ? "text-destructive"
                : "text-muted-foreground")
          }
        >
          {submission.status === "approved" ? "Signed off by trainer" : submission.status}
        </p>
      )}
      {submission?.trainer_note && (
        <p className="text-sm text-muted-foreground">Trainer note: {submission.trainer_note}</p>
      )}
      {submission?.status !== "approved" && (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-primary">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          {submission ? "Upload a new photo" : "Upload a photo"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
