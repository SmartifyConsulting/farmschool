import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";

export function CohortEmailPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const preference = useQuery({
    queryKey: ["cohort-email-preferences", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cohort_email_preferences")
        .select("enabled")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.enabled ?? true;
    },
  });
  if (!user) return null;
  const update = async (enabled: boolean) => {
    if (busy || preference.isPending || preference.isError) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("cohort_email_preferences")
        .upsert({ user_id: user.id, enabled });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["cohort-email-preferences", user.id] });
      toast.success(
        enabled ? "Assignment email reminders enabled." : "Assignment email reminders disabled.",
      );
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="my-3 rounded-lg border p-3">
      <summary className="cursor-pointer text-sm">Email reminder preferences</summary>
      <div className="mt-2 space-y-2">
        <p className="text-xs text-muted-foreground">
          Receive assignment, approaching deadline and overdue reminders when your organisation
          enables email delivery.
        </p>
        {preference.isError ? (
          <p role="alert" className="text-sm">
            Could not load your preference.
          </p>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={busy || preference.isPending}
              checked={preference.data ?? true}
              onChange={(e) => update(e.target.checked)}
            />
            Email me about assigned courses
          </label>
        )}
      </div>
    </details>
  );
}
