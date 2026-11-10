import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Maximize2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { isFinished } from "@/lib/scorm";
import { ScormFrame, type ScormResult } from "@/components/ScormFrame";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/scorm/$id")({
  head: () => pageMeta("SCORM course player — Plusticity", "Complete a SCORM e-learning course and save your score."),
  component: ScormPlayer,
});

type Attempt = ScormResult;

function ScormPlayer() {
  const { id } = Route.useParams();
  const { user, ready } = useAuth();
  const frameWrap = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<Attempt | null>(null);
  const { data: pkg, isLoading } = useQuery({ queryKey: ["scorm-package", id], queryFn: async () =>
    (await supabase.from("scorm_packages").select("id, title, scorm_version, entry_url").eq("id", id).maybeSingle()).data });
  const status = result?.lesson_status;
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <Button asChild variant="ghost" size="sm"><Link to="/scorm"><ArrowLeft className="mr-1 h-4 w-4" />SCORM courses</Link></Button>
        <h1 className="min-w-0 flex-1 truncate font-semibold">{pkg?.title ?? "Course player"}</h1>
        {status && (
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${status === "failed" ? "bg-destructive/10 text-destructive" : isFinished(status) ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
            {status === "failed" ? <XCircle className="h-3.5 w-3.5" /> : isFinished(status) ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
            {status.charAt(0).toUpperCase() + status.slice(1)}{result?.score_raw != null ? ` · ${result.score_raw}${result.score_max ? `/${result.score_max}` : ""}` : ""}
          </span>
        )}
        <Button variant="outline" size="sm" onClick={() => frameWrap.current?.requestFullscreen?.()} aria-label="Full screen"><Maximize2 className="h-4 w-4" /></Button>
      </div>
      <div ref={frameWrap} className="relative flex-1 bg-card">
        {ready && !user ? <p className="p-10 text-center text-sm text-muted-foreground"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> to take this course and save your results.</p>
          : !isLoading && !pkg ? <p className="p-10 text-center text-sm text-muted-foreground">This SCORM course could not be found.</p>
          : pkg && user ? <ScormFrame pkg={pkg} userId={user.id} learnerName={(user.user_metadata?.["full_name"] as string) ?? user.email ?? "Learner"} onResult={setResult} />
          : <p className="p-10 text-center text-sm text-muted-foreground">Loading course…</p>}
      </div>
    </div>
  );
}
