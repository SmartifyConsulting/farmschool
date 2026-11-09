import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";

/** Lets a trainer choose one of their uploaded SCORM packages for a Studio lesson. */
export function ScormPicker({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const { user } = useAuth();
  const { data: pkgs = [], isLoading } = useQuery({
    queryKey: ["my-scorm-packages", user?.id], enabled: !!user,
    queryFn: async () => (await supabase.from("scorm_packages").select("id, title, scorm_version, created_at").eq("author_id", user!.id).order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">SCORM course to play in this lesson</p>
      {isLoading ? <p className="text-xs text-muted-foreground">Loading your SCORM courses…</p>
        : pkgs.length === 0 ? <p className="text-xs text-muted-foreground">You haven't uploaded any SCORM courses yet.</p>
        : <ul className="space-y-1.5" role="radiogroup" aria-label="SCORM course">
          {pkgs.map(p => <li key={p.id}><label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm ${value === p.id ? "border-primary bg-primary/5" : "border-border"}`}>
            <input type="radio" name="scorm-package" checked={value === p.id} onChange={() => onChange(p.id)} />
            <Package className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 break-words">{p.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">SCORM {p.scorm_version} · {new Date(p.created_at).toLocaleDateString()}</span>
          </label></li>)}
        </ul>}
      <Link to="/scorm" target="_blank" className="inline-block text-xs font-semibold text-primary">Upload a new SCORM course (opens in a new tab), then come back</Link>
    </div>
  );
}
