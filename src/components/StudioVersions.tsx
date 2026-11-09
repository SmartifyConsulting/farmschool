import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function StudioVersions({ courseId }: { courseId: string; onOpened: (id: string) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["studio-versions", courseId], queryFn: async () => {
    const result = await supabase.from("studio_course_versions").select("id,version_number,change_note,created_at,snapshot").eq("course_id", courseId).order("version_number", { ascending: false });
    if (result.error) throw result.error;
    return result.data;
  } });
  return <section className="space-y-4"><h2 className="text-lg font-semibold">Version history</h2>
    {isLoading && <p role="status">Loading versions…</p>}
    {error && <p className="text-destructive">{friendlyError(error, "We couldn't load your versions. Please try again.")}</p>}
    {data?.length === 0 && <p className="text-sm text-muted-foreground">No published versions yet.</p>}
    {data?.map(version => {
      const snapshot = version.snapshot as { lessons?: { title: string; kind: string; body: string }[] };
      return <article key={version.id} className="rounded-lg border border-border p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">v1.{version.version_number - 1}</h3><time className="text-xs text-muted-foreground">{new Date(version.created_at).toLocaleDateString()}</time></div><Button variant="outline" size="sm" onClick={() => setExpanded(expanded === version.id ? null : version.id)}>{expanded === version.id ? "Close" : "View version"}</Button></div><p className="mt-2 text-sm">{version.change_note || "Published course"}</p>{expanded === version.id && <div className="mt-4 space-y-3 border-t border-border pt-4">{snapshot.lessons?.map((lesson, i) => <details key={i}><summary className="cursor-pointer text-sm font-medium">{lesson.title} · {lesson.kind}</summary><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{lesson.kind === "quiz" ? "Assessment saved in this version." : lesson.body}</p></details>)}</div>}</article>;
    })}
  </section>;
}