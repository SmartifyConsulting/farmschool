import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/database-pages";
import { assignmentNotifications } from "@/lib/assignment-notifications";
import { extendedDeadline } from "@/lib/deadline-extension";

export function useAssignmentNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["assignment-notifications", user?.id],
    enabled: !!user,
    staleTime: 30000,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data: memberships } = await readAllPages(
        supabase
          .from("cohort_members")
          .select("cohort_id", { count: "exact" })
          .eq("user_id", user!.id)
          .order("cohort_id"),
      );
      if (!memberships.length) return [];
      const [assignments, certificates, receipts, extensions] = await Promise.all([
        readAllPages(
          supabase
            .from("cohort_course_assignments")
            .select(
              "cohort_id,course_id,assigned_at,due_at,cohorts(name),studio_courses(title,published)",
              { count: "exact" },
            )
            .in(
              "cohort_id",
              memberships.map((item) => item.cohort_id),
            )
            .order("cohort_id")
            .order("course_id"),
        ),
        readAllPages(
          supabase
            .from("certificates")
            .select("course_ref", { count: "exact" })
            .eq("user_id", user!.id)
            .eq("source", "studio")
            .is("revoked_at", null)
            .order("id"),
        ),
        readAllPages(
          supabase
            .from("notification_reads")
            .select("notification_key", { count: "exact" })
            .eq("user_id", user!.id)
            .order("notification_key"),
        ),
        readAllPages(
          supabase
            .from("course_deadline_extensions")
            .select("course_id,due_at", { count: "exact" })
            .eq("user_id", user!.id)
            .order("course_id"),
        ),
      ]);
      return assignmentNotifications(
        assignments.data
          .filter((item) => item.studio_courses?.published)
          .map((item) => ({
            cohortId: item.cohort_id,
            cohortName: item.cohorts?.name ?? "Your cohort",
            courseId: item.course_id,
            courseTitle: item.studio_courses!.title,
            assignedAt: item.assigned_at,
            dueAt: extendedDeadline(
              item.due_at,
              extensions.data.find((extension) => extension.course_id === item.course_id)?.due_at,
            ),
          })),
        new Set(certificates.data.map((item) => item.course_ref)),
        new Set(receipts.data.map((item) => item.notification_key)),
        Date.now(),
      );
    },
  });
}
