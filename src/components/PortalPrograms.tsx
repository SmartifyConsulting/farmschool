import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const programs = z.object({
  total: z.number().int().nonnegative(),
  records: z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string(),
        version: z.number().int(),
        due_at: z.string().nullable(),
      }),
    )
    .max(100),
});
export function PortalPrograms({ slug }: { slug: string }) {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const result = useQuery({
    queryKey: ["portal-programs", slug, user?.id, page],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("portal_learning_programs", {
        _slug: slug,
        _offset: page * 24,
        _limit: 24,
      });
      if (error) throw error;
      return programs.parse(data);
    },
  });
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">My learning programs</h2>
      {result.isPending ? (
        <p>Loading programs…</p>
      ) : result.isError ? (
        <div role="alert">
          <p>Could not load this portal's program assignments.</p>
          <Button variant="outline" onClick={() => result.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {result.data.total} active programs assigned in this training portal.
          </p>
          {result.data.records.map((program) => (
            <article key={program.id} className="rounded-xl border p-4">
              <Link
                className="font-semibold text-primary underline"
                to="/programs/$id"
                params={{ id: program.id }}
                search={{ portal: slug }}
              >
                {program.title}
              </Link>
              <p className="text-xs">
                Version {program.version}
                {program.due_at ? " · Due " + new Date(program.due_at).toLocaleDateString() : ""}
              </p>
            </article>
          ))}
          <div className="flex items-center gap-3">
            <Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span>Page {page + 1}</span>
            <Button
              variant="outline"
              disabled={(page + 1) * 24 >= result.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
