import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Maximize2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { isFinished, normaliseStatus } from "@/lib/scorm";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/scorm/$id")({
  head: () => pageMeta("SCORM course player — Mobile School", "Complete a SCORM e-learning course and save your score."),
  component: ScormPlayer,
});

type Attempt = { lesson_status: string; score_raw: number | null; score_max: number | null; suspend_data: string; lesson_location: string };

function ScormPlayer() {
  const { id } = Route.useParams();
  const { user, ready } = useAuth();
  const frameWrap = useRef<HTMLDivElement>(null);
  const [apiReady, setApiReady] = useState(false);
  const [result, setResult] = useState<Attempt | null>(null);
  const { data: pkg, isLoading } = useQuery({ queryKey: ["scorm-package", id], queryFn: async () =>
    (await supabase.from("scorm_packages").select("id, title, scorm_version, entry_url").eq("id", id).maybeSingle()).data });

  // Install the SCORM 1.2 (window["API"]) and 2004 (window["API_1484_11"]) bridges before the iframe loads.
  useEffect(() => {
    if (!user || !pkg) return;
    let cancelled = false;
    const w = window as unknown as Record<string, unknown>;
    (async () => {
      const { data: prev } = await supabase.from("scorm_attempts").select("lesson_status, score_raw, score_max, suspend_data, lesson_location").eq("package_id", pkg.id).eq("user_id", user.id).maybeSingle();
      if (cancelled) return;
      const cmi: Record<string, string> = {
        "cmi.core.student_id": user.id, "cmi.learner_id": user.id,
        "cmi.core.student_name": (user.user_metadata?.["full_name"] as string) ?? user.email ?? "Learner", "cmi.learner_name": (user.user_metadata?.["full_name"] as string) ?? "Learner",
        "cmi.core.lesson_status": prev?.lesson_status ?? "not attempted",
        "cmi.core.entry": prev ? "resume" : "ab-initio", "cmi.entry": prev ? "resume" : "ab-initio",
        "cmi.suspend_data": prev?.suspend_data ?? "", "cmi.core.lesson_location": prev?.lesson_location ?? "", "cmi.location": prev?.lesson_location ?? "",
        "cmi.core.score.raw": prev?.score_raw?.toString() ?? "", "cmi.score.raw": prev?.score_raw?.toString() ?? "",
        "cmi.core.score.max": prev?.score_max?.toString() ?? "", "cmi.score.max": prev?.score_max?.toString() ?? "",
        "cmi.core.lesson_mode": "normal", "cmi.mode": "normal", "cmi.core.credit": "credit", "cmi.credit": "credit",
        "cmi.completion_status": prev && isFinished(prev.lesson_status) ? "completed" : "unknown",
        "cmi.success_status": prev?.lesson_status === "passed" || prev?.lesson_status === "failed" ? prev.lesson_status : "unknown",
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const save = async () => {
        const num = (k1: string, k2: string) => { const v = parseFloat(cmi[k1] || cmi[k2] || ""); return Number.isFinite(v) ? v : null; };
        const v12 = pkg.scorm_version === "1.2" ? cmi["cmi.core.lesson_status"] : undefined;
        const row = {
          user_id: user.id, package_id: pkg.id,
          lesson_status: normaliseStatus(v12, cmi["cmi.completion_status"], cmi["cmi.success_status"]),
          score_raw: num("cmi.core.score.raw", "cmi.score.raw"), score_max: num("cmi.core.score.max", "cmi.score.max"),
          suspend_data: cmi["cmi.suspend_data"] ?? "", lesson_location: cmi["cmi.core.lesson_location"] || cmi["cmi.location"] || "",
          updated_at: new Date().toISOString(),
        };
        await supabase.from("scorm_attempts").upsert(row, { onConflict: "user_id,package_id" });
        setResult(row);
      };
      const commit = () => { clearTimeout(timer); void save(); return "true"; };
      const set = (k: string, v: string) => {
        cmi[k] = String(v);
        if (k === "cmi.score.scaled" && !cmi["cmi.score.raw"]) { cmi["cmi.score.raw"] = String(Math.round(parseFloat(v) * 100)); cmi["cmi.score.max"] = "100"; }
        clearTimeout(timer); timer = setTimeout(() => void save(), 2000); return "true";
      };
      const get = (k: string) => k.endsWith("._count") ? "0" : (cmi[k] ?? "");
      w["API"] = { LMSInitialize: () => "true", LMSFinish: commit, LMSGetValue: get, LMSSetValue: set, LMSCommit: commit, LMSGetLastError: () => "0", LMSGetErrorString: () => "", LMSGetDiagnostic: () => "" };
      w["API_1484_11"] = { Initialize: () => "true", Terminate: commit, GetValue: get, SetValue: set, Commit: commit, GetLastError: () => "0", GetErrorString: () => "", GetDiagnostic: () => "" };
      // Also accept postMessage from packages that report results that way.
      const onMsg = (e: MessageEvent) => {
        if (e.origin !== window.location.origin || typeof e.data !== "object" || !e.data?.scorm) return;
        const d = e.data.scorm as Record<string, string>;
        Object.entries(d).forEach(([k, v]) => { cmi[k] = String(v); });
        commit();
      };
      window.addEventListener("message", onMsg);
      w["__scormCleanup"] = () => { window.removeEventListener("message", onMsg); clearTimeout(timer); void save(); };
      if (prev) setResult(prev);
      setApiReady(true);
    })();
    return () => { cancelled = true; (w["__scormCleanup"] as (() => void) | undefined)?.(); delete w["API"]; delete w["API_1484_11"]; delete w["__scormCleanup"]; };
  }, [user, pkg]);

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
          : apiReady && pkg ? <iframe title={pkg.title} src={pkg.entry_url} className="absolute inset-0 h-full w-full border-0" allow="fullscreen; autoplay" allowFullScreen />
          : <p className="p-10 text-center text-sm text-muted-foreground">Loading course…</p>}
      </div>
    </div>
  );
}
