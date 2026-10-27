import { z } from "zod";
import { courses, allLessons } from "@/lib/courses";

export const challengeInput = z.object({ challenge: z.string().trim().min(10, "Describe your challenge in at least 10 characters.").max(2000, "Keep your challenge under 2,000 characters.") });
export const recommendationSchema = z.object({
  summary: z.string(),
  nextSteps: z.array(z.string()),
  matches: z.array(z.object({ courseId: z.string(), reason: z.string(), lessonIds: z.array(z.string()) })),
  caution: z.string(),
});
export type Recommendation = z.infer<typeof recommendationSchema>;

export function groundRecommendations(result: Recommendation): Recommendation {
  const seen = new Set<string>();
  return {
    ...result,
    nextSteps: result.nextSteps.slice(0, 3),
    matches: result.matches.filter((match) => {
      if (seen.has(match.courseId) || !courses.some((c) => c.id === match.courseId)) return false;
      seen.add(match.courseId);
      return true;
    }).slice(0, 3).map((match) => {
      const course = courses.find((c) => c.id === match.courseId);
      const ids = course ? allLessons(course).filter((l) => l.type === "video").map((l) => l.id) : [];
      return { ...match, lessonIds: [...new Set(match.lessonIds)].filter((id) => ids.includes(id)).slice(0, 2) };
    }),
  };
}