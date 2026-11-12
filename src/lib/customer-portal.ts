import { z } from "zod";
import { learningBrandSchema } from "./learning-brand";

export const portalSlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/)
  .refine((value) => !["admin", "plusticity", "support", "login", "api"].includes(value));
export const publicPortalSchema = z.object({
  slug: portalSlugSchema,
  message: z.string().max(2000),
  brand: learningBrandSchema,
});
export const portalCourseReport = z.object({
  organization_id: z.string().uuid(),
  can_manage: z.boolean(),
  total: z.number().int().nonnegative(),
  records: z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string(),
        description: z.string(),
        cover_url: z.string().nullable(),
        price_cents: z.number().int().nonnegative(),
        currency: z.string(),
        assigned: z.boolean(),
        total_lessons: z.number().int().nonnegative(),
        completed_lessons: z.number().int().nonnegative(),
        certified: z.boolean(),
        access: z.boolean(),
      }),
    )
    .max(100),
});
export function readPortalSlug(value: unknown): string | undefined {
  const parsed = portalSlugSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
export function portalPath(slug: string) {
  return "/portal/" + portalSlugSchema.parse(slug);
}
export function portalSearch(input: Record<string, unknown>): { portal?: string } {
  const portal = readPortalSlug(input["portal"]);
  return portal ? { portal } : {};
}
