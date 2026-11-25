import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/database-pages";
import { latestCompetencyEvidence } from "@/lib/competency-evidence";
import { RubricBreakdown } from "@/components/RubricBreakdown";

import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SectionTabsList, SectionTabsTrigger } from "@/components/SectionTabs";
export function MySkills() {
  const { user, ready } = useAuth();
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["my-competency-evidence", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await readAllPages(
        supabase
          .from("learner_competency_evidence")
          .select(
            "id,competency_id,achieved,score,notes,assessed_at,created_at,course_competencies(code,title),competency_rubric_assessments(criteria_snapshot,marks,total_points,max_points,pass_mark,rubric_version)",
            { count: "exact" },
          )
          .eq("user_id", user!.id)
          .order("assessed_at", { ascending: false })
          .order("id"),
      );
      return data;
    },
  });
  const latest = latestCompetencyEvidence(data);
  return (
    <Tabs defaultValue="skills" className="mt-4">
      <SectionTabsList aria-label="My Skills sections">
        <SectionTabsTrigger value="skills">Skills</SectionTabsTrigger>
        <SectionTabsTrigger value="feedback">Trainer Feedback</SectionTabsTrigger>
      </SectionTabsList>
      {(["skills", "feedback"] as const).map((view) => (
        <TabsContent key={view} value={view}>
          <p className="mt-4 text-sm text-muted-foreground">
            {view === "skills"
              ? "Your latest trainer-assessed competencies. These outcomes are separate from course completion certificates."
              : "Trainer notes, rubric breakdowns and assessment history for your competencies."}
          </p>
          {!ready || (user && isLoading) ? (
            <p className="py-8">Loading {view === "skills" ? "skills" : "trainer feedback"}…</p>
          ) : !user ? (
            <p className="py-8">
              <Link to="/auth">Sign in</Link> to see your{" "}
              {view === "skills" ? "skills" : "trainer feedback"}.
            </p>
          ) : error ? (
            <p role="alert" className="py-8 text-destructive">
              Could not load your assessment records.
            </p>
          ) : !latest.length ? (
            <p className="py-8 text-sm text-muted-foreground">
              {view === "skills"
                ? "No trainer-assessed competencies yet."
                : "No trainer feedback yet."}
            </p>
          ) : (
            <div className="mt-6 space-y-4 pb-10">
              {latest.map((item) => (
                <article key={item.id} className="rounded-xl border p-4">
                  <h2 className="font-semibold">
                    {item.course_competencies
                      ? item.course_competencies.code + " · " + item.course_competencies.title
                      : "Competency assessment"}
                  </h2>
                  <p className="mt-2 text-sm font-medium">
                    {item.achieved ? "Demonstrated" : "Not yet demonstrated"}
                    {item.score !== null ? " · " + item.score + "%" : ""}
                  </p>
                  {view === "feedback" && (
                    <>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                        {item.notes || "No written trainer feedback for this assessment."}
                      </p>
                      <RubricBreakdown snapshot={item.competency_rubric_assessments} />
                    </>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Assessed{" "}
                    {new Date(item.assessed_at ?? item.created_at).toLocaleString("en-ZA", {
                      timeZone: "Africa/Johannesburg",
                    })}{" "}
                    SAST
                  </p>
                  {view === "feedback" && (
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer">Assessment history</summary>
                      {data
                        .filter((row) => row.competency_id === item.competency_id)
                        .map((row) => (
                          <div key={row.id} className="mt-2 whitespace-pre-wrap border-t pt-2">
                            <p>
                              {new Date(row.assessed_at ?? row.created_at).toLocaleDateString(
                                "en-ZA",
                                {
                                  timeZone: "Africa/Johannesburg",
                                },
                              )}{" "}
                              · {row.achieved ? "Demonstrated" : "Not yet demonstrated"} ·{" "}
                              {row.score ?? "—"}%<br />
                              {row.notes}
                            </p>
                            <RubricBreakdown snapshot={row.competency_rubric_assessments} />
                          </div>
                        ))}
                    </details>
                  )}
                </article>
              ))}
            </div>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
