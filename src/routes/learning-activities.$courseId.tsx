import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Phone } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/learning-activities/$courseId")({
  head: () => pageMeta("Learning activities — Mobile School", "Practice your skills with trainer-approved course exercises and scenarios."),
  component: PublishedLearningActivities,
});

function PublishedLearningActivities() {
  const { courseId } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["published-learning-activities", courseId],
    queryFn: async () => {
      const { data: course, error: courseError } = await supabase.from("studio_courses")
        .select("id,title,published").eq("id", courseId).eq("published", true).maybeSingle();
      if (courseError) throw courseError;
      if (!course) return null;
      const { data: activities, error: activitiesError } = await supabase.from("studio_learning_activities")
        .select("id,lesson_title,kind,prompt,source_refs")
        .eq("course_id", courseId).eq("approved", true).order("lesson_title");
      if (activitiesError) throw activitiesError;
      return { course, activities: activities ?? [] };
    },
  });
  return <Phone>
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <Link to="/" className="text-sm text-primary">← Back to learning</Link>
      {isLoading ? <p>Loading learning activities…</p>
        : error ? <p role="alert">Could not load learning activities.</p>
        : !data ? <p>This course is not available to learners.</p>
        : <>
          <header><p className="text-xs uppercase tracking-wide text-muted-foreground">Approved learning activities</p>
            <h1 className="mt-1 text-2xl font-semibold">{data.course.title}</h1></header>
          {data.activities.length === 0 ? <p>No approved activities have been released for this course yet.</p>
            : <div className="space-y-5">{data.activities.map(activity => <section key={activity.id} className="rounded-xl border border-border p-5">
              <p className="text-xs font-medium text-muted-foreground">{activity.kind === "steps" ? "Practical exercise" : "Applied scenario"}</p>
              <h2 className="mt-1 text-lg font-semibold">{activity.lesson_title}</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{activity.prompt}</p>
              <p className="mt-3 text-xs text-muted-foreground">Trainer-approved activity</p>
            </section>)}</div>}
        </>}
    </main>
  </Phone>;
}
