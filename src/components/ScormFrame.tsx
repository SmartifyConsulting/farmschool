import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isFinished, normaliseStatus, cmiChildren, cmiCount } from "@/lib/scorm";

export type ScormResult = { lesson_status: string; score_raw: number | null; score_max: number | null; suspend_data: string; lesson_location: string };
type Pkg = { id: string; title: string; scorm_version: string; entry_url: string };

/**
 * Plays a SCORM package in a same-origin iframe and saves results to the learner's account.
 * Installs SCORM 1.2 (window.API) and 2004 (window.API_1484_11) bridges compatible with
 * Articulate Storyline/Rise, Captivate and iSpring exports.
 */
export function ScormFrame({ pkg, userId, learnerName, onResult, className }: { pkg: Pkg; userId: string; learnerName: string; onResult?: (r: ScormResult) => void; className?: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const w = window as unknown as Record<string, unknown>;
    let cleanup = () => {};
    (async () => {
      const { data: prev } = await supabase.from("scorm_attempts").select("lesson_status, score_raw, score_max, suspend_data, lesson_location").eq("package_id", pkg.id).eq("user_id", userId).maybeSingle();
      if (cancelled) return;
      const resume = !!prev?.suspend_data || !!prev?.lesson_location;
      const cmi: Record<string, string> = {
        "cmi.core.student_id": userId, "cmi.learner_id": userId,
        "cmi.core.student_name": learnerName, "cmi.learner_name": learnerName,
        "cmi.core.lesson_status": prev?.lesson_status ?? "not attempted",
        "cmi.core.entry": resume ? "resume" : "ab-initio", "cmi.entry": resume ? "resume" : "ab-initio",
        "cmi.suspend_data": prev?.suspend_data ?? "", "cmi.core.lesson_location": prev?.lesson_location ?? "", "cmi.location": prev?.lesson_location ?? "",
        "cmi.core.score.raw": prev?.score_raw?.toString() ?? "", "cmi.score.raw": prev?.score_raw?.toString() ?? "",
        "cmi.core.score.max": prev?.score_max?.toString() ?? "", "cmi.score.max": prev?.score_max?.toString() ?? "",
        "cmi.core.score.min": "0", "cmi.score.min": "0",
        "cmi.core.lesson_mode": "normal", "cmi.mode": "normal", "cmi.core.credit": "credit", "cmi.credit": "credit",
        "cmi.core.total_time": "0000:00:00", "cmi.total_time": "PT0S", "cmi.launch_data": "", "cmi.comments": "",
        "cmi.student_data.mastery_score": "", "cmi.scaled_passing_score": "", "cmi.completion_threshold": "",
        "cmi.student_preference.audio": "0", "cmi.student_preference.language": "", "cmi.student_preference.speed": "0", "cmi.student_preference.text": "0",
        "cmi.completion_status": prev && isFinished(prev.lesson_status) ? "completed" : prev ? "incomplete" : "unknown",
        "cmi.success_status": prev?.lesson_status === "passed" || prev?.lesson_status === "failed" ? prev.lesson_status : "unknown",
      };
      let lastError = "0";
      let timer: ReturnType<typeof setTimeout> | undefined;
      const save = async () => {
        const num = (k1: string, k2: string) => { const v = parseFloat(cmi[k1] || cmi[k2] || ""); return Number.isFinite(v) ? v : null; };
        const v12 = pkg.scorm_version === "1.2" ? cmi["cmi.core.lesson_status"] : undefined;
        const row = {
          user_id: userId, package_id: pkg.id,
          lesson_status: normaliseStatus(v12, cmi["cmi.completion_status"], cmi["cmi.success_status"]),
          score_raw: num("cmi.core.score.raw", "cmi.score.raw"), score_max: num("cmi.core.score.max", "cmi.score.max"),
          suspend_data: cmi["cmi.suspend_data"] ?? "", lesson_location: cmi["cmi.core.lesson_location"] || cmi["cmi.location"] || "",
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from("scorm_attempts").upsert(row, { onConflict: "user_id,package_id" });
        if (!error) onResult?.(row);
      };
      const commit = () => { clearTimeout(timer); void save(); lastError = "0"; return "true"; };
      const set = (k: string, v: string) => {
        if (k.endsWith("._children") || k.endsWith("._count")) { lastError = "402"; return "false"; }
        cmi[k] = String(v);
        if (k === "cmi.score.scaled" && !cmi["cmi.score.raw"]) { cmi["cmi.score.raw"] = String(Math.round(parseFloat(v) * 100)); cmi["cmi.score.max"] = "100"; }
        lastError = "0";
        clearTimeout(timer); timer = setTimeout(() => void save(), 2000); return "true";
      };
      const get = (k: string) => {
        lastError = "0";
        const kids = cmiChildren(k); if (kids !== null) return kids;
        if (k.endsWith("._count")) return String(cmiCount(cmi, k));
        return cmi[k] ?? "";
      };
      const errText = (c: string) => ({ "0": "No error", "401": "Not implemented", "402": "Invalid set value, element is a keyword", "403": "Element is read only" } as Record<string, string>)[c] ?? "General error";
      w["API"] = { LMSInitialize: () => "true", LMSFinish: commit, LMSGetValue: get, LMSSetValue: set, LMSCommit: commit, LMSGetLastError: () => lastError, LMSGetErrorString: errText, LMSGetDiagnostic: errText };
      w["API_1484_11"] = { Initialize: () => "true", Terminate: commit, GetValue: get, SetValue: set, Commit: commit, GetLastError: () => lastError, GetErrorString: errText, GetDiagnostic: errText };
      const onMsg = (e: MessageEvent) => {
        if (e.origin !== window.location.origin || typeof e.data !== "object" || !e.data?.scorm) return;
        Object.entries(e.data.scorm as Record<string, string>).forEach(([k, v]) => { cmi[k] = String(v); });
        commit();
      };
      window.addEventListener("message", onMsg);
      const onHide = () => { clearTimeout(timer); void save(); };
      window.addEventListener("pagehide", onHide);
      cleanup = () => { window.removeEventListener("message", onMsg); window.removeEventListener("pagehide", onHide); clearTimeout(timer); void save(); };
      if (prev) onResult?.(prev);
      setReady(true);
    })();
    return () => { cancelled = true; cleanup(); delete w["API"]; delete w["API_1484_11"]; setReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg.id, userId]);

  if (!ready) return <p className="p-10 text-center text-sm text-muted-foreground">Loading course…</p>;
  return <iframe title={pkg.title} src={pkg.entry_url} className={className ?? "absolute inset-0 h-full w-full border-0"} allow="fullscreen; autoplay" allowFullScreen />;
}
