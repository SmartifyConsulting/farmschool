import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Phone } from "@/components/AppShell";
import { MaterialProducer } from "@/components/MaterialProducer";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { materialProjectSchema } from "@/lib/studio-workspace";
import { libraryColumns, type LibraryFile } from "@/lib/library-materials";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/studio/materials/$projectId")({
  validateSearch: (input: Record<string, unknown>) => ({
    step: ["setup", "outline", "slides", "review", "preview"].includes(String(input["step"]))
      ? String(input["step"])
      : "outline",
    topic: typeof input["topic"] === "string" ? input["topic"].slice(0, 100) : "",
  }),
  head: () => ({ meta: [{ title: "Training workspace — Plusticity" }] }),
  component: MaterialWorkspace,
});
function MaterialWorkspace() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  const project = useQuery({
    queryKey: ["material-workspace", user?.id, projectId],
    enabled: !!user,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!z.string().uuid().safeParse(projectId).success)
        throw new Error("This workspace address is invalid.");
      const saved = await supabase
        .from("studio_workspace_drafts" as never)
        .select("state" as never)
        .eq("id", projectId)
        .eq("author_id", user!.id)
        .maybeSingle();
      if (saved.error) throw saved.error;
      if (!saved.data) throw new Error("This workspace is unavailable to your account.");
      const state = materialProjectSchema.parse((saved.data as { state: unknown }).state);
      const sources = await supabase
        .from("content_library_files" as never)
        .select(libraryColumns as never)
        .in("id", state.sourceIds)
        .eq("author_id", user!.id)
        .eq("material_stage", "raw");
      if (sources.error) throw sources.error;
      if (sources.data?.length !== state.sourceIds.length)
        throw new Error(
          "A raw source is unavailable. The saved workspace remains private and preserved.",
        );
      return { state, sources: sources.data as unknown as LibraryFile[] };
    },
  });
  const back =
    project.data?.state.scope === "admin" ? "/admin/external-content" : "/studio/content-library";
  return (
    <Phone>
      {!ready || (project.isPending && user) ? (
        <p className="p-5" role="status">
          Opening training workspace…
        </p>
      ) : !user ? (
        <p className="p-5">
          <Link to="/auth">Sign in</Link> to open this workspace.
        </p>
      ) : project.error ? (
        <div className="space-y-3 p-5" role="alert">
          <p>{friendlyError(project.error, "Could not open your workspace.")}</p>
          <Button onClick={() => project.refetch()}>Retry</Button>
          <Button asChild variant="outline">
            <Link to="/studio/content-library">Content Library</Link>
          </Button>
        </div>
      ) : project.data ? (
        <MaterialProducer
          sources={project.data.sources}
          folderId={project.data.state.folderId}
          initialTitle={project.data.state.initialTitle}
          initialBody={project.data.state.initialBody}
          initialInstruction={project.data.state.initialInstruction}
          initialSourceMode={project.data.state.sourceMode ?? "legacy"}
          initialDesignReferences={project.data.state.designReferences}
          initialDesignerChoices={project.data.state.designerChoices}
          initialAutoPlan={project.data.state.autoPlan ?? false}
          initialPrefill={project.data.state.prefill}
          workspace={{
            id: projectId,
            scope: project.data.state.scope,
            step: search.step,
            topic: search.topic,
            navigate: (step, topic) => {
              void navigate({
                to: "/studio/materials/$projectId",
                params: { projectId },
                search: { step, topic },
                replace: true,
              });
            },
          }}
          onClose={() => {
            void navigate({ to: back });
          }}
          onSaved={() => {
            void navigate({ to: back });
          }}
        />
      ) : null}
    </Phone>
  );
}
