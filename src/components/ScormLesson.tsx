import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { isFinished, scormLessonRef } from "@/lib/scorm";
import { ScormFrame, type ScormResult } from "@/components/ScormFrame";
import { useLearningBrand } from "@/components/LearningBrand";

/** A SCORM package embedded inside a Studio course lesson. */
export function ScormLesson({ body, onFinished }: { body: string; onFinished: () => void }) {
  const brand = useLearningBrand();
  const pkgId = scormLessonRef(body);
  const { user } = useAuth();
  const [result, setResult] = useState<ScormResult | null>(null);
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const { data: pkg, isLoading } = useQuery({ queryKey: ["scorm-package", pkgId], enabled: !!pkgId, queryFn: async () =>
    (await supabase.from("scorm_packages").select("id, title, scorm_version, entry_url").eq("id", pkgId!).maybeSingle()).data });
  if (!pkgId) return <p className="text-sm text-muted-foreground">The trainer hasn't attached the e-learning yet.</p>;
  if (!user) return <p className="text-sm text-muted-foreground"><Link to="/auth" search={brand?.portalSlug ? { portal: brand.portalSlug } : {}} className="font-semibold text-primary">Sign in</Link> to take this e-learning and save your score.</p>;
  if (!isLoading && !pkg) return <p className="text-sm text-muted-foreground">This e-learning is no longer available.</p>;
  const onResult = (r: ScormResult) => { setResult(r); if (isFinished(r.lesson_status)) onFinished(); };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {result && <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{result.lesson_status.charAt(0).toUpperCase() + result.lesson_status.slice(1)}{result.score_raw != null ? ` · ${result.score_raw}${result.score_max ? `/${result.score_max}` : ""}` : ""}</span>}
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => wrap?.requestFullscreen?.()} aria-label="Full screen"><Maximize2 className="h-4 w-4" /></Button>
      </div>
      <div ref={setWrap} className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border bg-card md:aspect-video">
        {pkg && <ScormFrame pkg={pkg} userId={user.id} learnerName={(user.user_metadata?.["full_name"] as string) ?? user.email ?? "Learner"} onResult={onResult} />}
      </div>
    </div>
  );
}
