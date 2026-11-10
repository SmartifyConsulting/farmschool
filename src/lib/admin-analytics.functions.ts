import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PlatformAnalytics = {
  totals: {
    courses: number;
    publishedCourses: number;
    learners: number;
    avgScore: number | null;
    certificates: number;
    scormAttempts: number;
    scormCompletionRate: number | null;
    scormAvgScore: number | null;
  };
  courses: {
    id: string;
    title: string;
    published: boolean;
    learners: number;
    completionRate: number;
    avgScore: number | null;
  }[];
};

/** Platform-wide analytics are aggregated in Postgres to avoid transferring all learner events. */
export const getPlatformAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_platform_analytics");
    if (error) throw new Error("Could not load platform analytics.");
    return data as PlatformAnalytics;
  });
