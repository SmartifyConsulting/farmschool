import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/database-pages";

export function LearningPrograms() {
  const { user } = useAuth();
  const result = useQuery({
    queryKey: ["my-programs", user?.id],
    enabled: !!user,
    refetchInterval: 30000,
    queryFn: async () =>
      (
        await readAllPages(
          supabase.rpc("my_learning_programs", {}, { count: "exact" }).order("title").order("id"),
        )
      ).data,
  });
  const awards = useQuery({
    queryKey: ["my-program-awards", user?.id],
    enabled: !!user,
    refetchInterval: 30000,
    queryFn: async () =>
      (
        await readAllPages(
          supabase
            .from("program_awards")
            .select("id,title,issued_at,expires_at", { count: "exact" })
            .order("issued_at", { ascending: false })
            .order("id"),
        )
      ).data,
  });
  if (!user) return null;
  return (
    <section className="my-5 space-y-3">
      <h2 className="font-semibold">My learning programs</h2>
      {result.isPending ? (
        <p>Loading programs…</p>
      ) : result.isError ? (
        <p role="alert">Could not load your programs.</p>
      ) : result.data.length ? (
        result.data.map((p) => (
          <article className="rounded-xl border p-4" key={p.id}>
            <Link
              className="font-semibold text-primary underline"
              to="/programs/$id"
              params={{ id: p.id }}
            >
              {p.title}
            </Link>
            <p className="text-xs">
              Version {p.version}
              {p.due_at ? ` · Due ${new Date(p.due_at).toLocaleDateString()}` : ""}
            </p>
          </article>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">No cohort programs assigned.</p>
      )}
      <h3 className="font-semibold">Program completion records</h3>
      {awards.isPending ? (
        <p>Loading completion records…</p>
      ) : awards.isError ? (
        <p role="alert">Could not load program completion history.</p>
      ) : awards.data.length ? (
        awards.data.map((award) => (
          <article className="rounded-xl border p-3 text-sm" key={award.id}>
            <p>
              {award.title} · Completed {new Date(award.issued_at).toLocaleDateString()}
            </p>
            {award.expires_at && (
              <p>Original validity until {new Date(award.expires_at).toLocaleDateString()}</p>
            )}
            <p className="break-all text-xs">Historical completion record {award.id}</p>
          </article>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">No program completion records yet.</p>
      )}
    </section>
  );
}
