import { friendlyError } from "@/lib/friendly-error";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { INDUSTRIES } from "@/lib/industries";
import { Phone, Header, Sheet } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/creator-application")({
  component: CreatorApplication,
  head: () => ({ meta: [{ title: "Become a creator — Mobile School" }] }),
});

function CreatorApplication() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [expertise, setExpertise] = useState("");
  const [industry, setIndustry] = useState<string>(INDUSTRIES[0]);
  const [busy, setBusy] = useState(false);
  const { data: application, error, isLoading } = useQuery({
    queryKey: ["creator-application", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("creator_applications" as never)
        .select("status,display_name,expertise,industry,review_notes" as never)
        .eq("user_id" as never, user!.id).maybeSingle();
      if (error) throw error;
      return data as unknown as { status: string; display_name: string; expertise: string; industry: string; review_notes: string | null } | null;
    },
  });
  const submit = async () => {
    if (name.trim().length < 3 || expertise.trim().length < 10) {
      toast.error("Add your name and at least 10 characters describing your expertise."); return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("creator_submit_application" as never, {
      _display_name: name.trim(), _expertise: expertise.trim(), _industry: industry,
    } as never);
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Application submitted for review.");
    qc.invalidateQueries({ queryKey: ["creator-application"] });
  };
  return <Phone>
    <Header greeting="Teach on Mobile School" title="Become a course creator" />
    <Sheet>
      <div className="mx-auto max-w-xl space-y-5 pb-10">
        <p className="text-sm text-muted-foreground">Tell us about your experience. Our administrators review creator applications before new courses can be published.</p>
        {ready && !user ? <p className="text-sm"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> to apply.</p> : null}
        {user && isLoading && <p className="text-sm text-muted-foreground">Loading application…</p>}
        {user && error && <p role="alert" className="text-sm text-destructive">Creator applications are not available yet. The database migration may still need to be applied.</p>}
        {application && <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-semibold">Application: {application.status}</p>
          <p className="mt-1 text-xs text-muted-foreground">{application.display_name} · {application.industry}</p>
          {application.review_notes && <p className="mt-2 text-sm">{application.review_notes}</p>}
          {application.status === "approved" && <Link to="/studio" className="mt-3 inline-block text-sm font-semibold text-primary">Open Course Studio</Link>}
        </div>}
        {user && !isLoading && !error && (!application || application.status === "rejected") &&
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
            <label className="block space-y-1 text-sm font-medium">Name or professional display name
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
            </label>
            <label className="block space-y-1 text-sm font-medium">Primary industry
              <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="w-full rounded-md border border-input bg-background p-2">
                {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-sm font-medium">Qualifications, experience and topics you can teach
              <Textarea value={expertise} onChange={(e) => setExpertise(e.target.value)} rows={5} maxLength={2000} required />
            </label>
            <Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit for review"}</Button>
          </form>}
      </div>
    </Sheet>
  </Phone>;
}
