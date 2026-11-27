import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
export function StudioSavedWorkspaces() {
  const { user } = useAuth();
  const work = useQuery({
    queryKey: ["studio-working-projects", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studio_workspace_drafts" as never)
        .select("id,updated_at,title:state->>title" as never)
        .eq("author_id", user!.id)
        .eq("state->>kind", "material")
        .order("updated_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as unknown as { id: string; updated_at: string; title: string | null }[];
    },
  });
  if (!work.data?.length) return null;
  return (
    <section aria-label="Saved training workspaces" className="mb-5 space-y-2">
      <h2 className="text-sm font-semibold">Continue a training workspace</h2>
      <div className="divide-y rounded-lg border">
        {work.data.map((row) => (
          <Link
            key={row.id}
            to="/studio/materials/$projectId"
            params={{ projectId: row.id }}
            search={{ step: "outline", topic: "" }}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm text-primary hover:bg-muted/40"
          >
            <span>{row.title || "Untitled training workspace"}</span>
            <span className="supporting-text text-muted-foreground">
              Saved {new Date(row.updated_at).toLocaleString()}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
