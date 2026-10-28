import { friendlyError } from "@/lib/friendly-error";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Header, Sheet } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/creators")({
  component: CreatorReview,
  head: () => ({ meta: [{ title: "Creator approvals — Mobile School" }] }),
});

type Application = {
  user_id: string; display_name: string; expertise: string; industry: string;
  status: string; submitted_at: string; review_notes: string | null;
};

function CreatorReview() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: admin, isLoading: checking } = useQuery({
    queryKey: ["creator-admin", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", { _user_id: user!.id, _role: "admin" });
      if (error) throw error;
      return !!data;
    },
  });
  const { data: applications = [], isLoading, error } = useQuery({
    queryKey: ["creator-applications", filter],
    enabled: !!admin,
    queryFn: async () => {
      const { data, error } = await supabase.from("creator_applications" as never)
        .select("user_id,display_name,expertise,industry,status,submitted_at,review_notes" as never)
        .eq("status" as never, filter)
        .order("submitted_at" as never, { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Application[];
    },
  });
  const review = async (id: string, approve: boolean) => {
    if (!admin || busyId) return;
    setBusyId(id);
    const { error } = await supabase.rpc("creator_review_application" as never, {
      _user_id: id, _approve: approve, _notes: notes[id] || null,
    } as never);
    setBusyId(null);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(approve ? "Creator approved." : "Application rejected.");
    qc.invalidateQueries({ queryKey: ["creator-applications"] });
  };
  return <Phone>
    <Header greeting="Administration" title="Creator approvals" />
    <Sheet>
      <div className="mx-auto max-w-3xl space-y-4 pb-10">
        {!ready || checking ? <p className="text-sm text-muted-foreground">Checking permissions…</p>
        : !user ? <p className="text-sm"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> as an administrator.</p>
        : !admin ? <p className="text-sm text-muted-foreground">Administrator access required.</p>
        : <>
          <p className="text-sm text-muted-foreground">Review applicants' experience before granting permission to publish new courses. Course content still requires its own review.</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Application status">
            {["pending", "approved", "rejected"].map((status) => <Button key={status} type="button" size="sm"
              variant={filter === status ? "default" : "outline"} onClick={() => setFilter(status)}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Button>)}
          </div>
          {isLoading && <p className="text-sm text-muted-foreground">Loading applications…</p>}
          {error && <p role="alert" className="text-sm text-destructive">Could not load applications. Check that the creator migration has been applied.</p>}
          {!isLoading && !error && applications.length === 0 && <p className="py-8 text-sm text-muted-foreground">No {filter} applications.</p>}
          {applications.map((a) => <article key={a.user_id} className="space-y-3 rounded-2xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{a.display_name}</h2>
              <span className="text-xs text-muted-foreground">{a.industry} · {new Date(a.submitted_at).toLocaleDateString()}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{a.expertise}</p>
            {a.review_notes && <p className="text-xs text-muted-foreground">Review notes: {a.review_notes}</p>}
            {a.status === "pending" && <>
              <label className="block space-y-1 text-xs font-medium">Review notes (optional)
                <Textarea value={notes[a.user_id] ?? ""} onChange={(e) => setNotes((old) => ({ ...old, [a.user_id]: e.target.value }))} rows={2} maxLength={2000} />
              </label>
              <div className="flex gap-2">
                <Button type="button" disabled={!!busyId} onClick={() => void review(a.user_id, true)}>Approve</Button>
                <Button type="button" variant="outline" disabled={!!busyId} onClick={() => void review(a.user_id, false)}>Reject</Button>
              </div>
            </>}
          </article>)}
        </>}
      </div>
    </Sheet>
  </Phone>;
}
