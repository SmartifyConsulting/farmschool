import { z } from "zod";
import { portalSlugSchema } from "./customer-portal";

export { portalSlugSchema };
export function learningPortalReturn(siteUrl: string, courseId: string, portalSlug?: string) {
  const site = new URL(siteUrl);
  if (
    site.protocol !== "https:" ||
    site.username ||
    site.password ||
    site.search ||
    site.hash ||
    (site.pathname !== "/" && site.pathname !== "")
  )
    throw new Error("Invalid application origin");
  const destination = new URL("/class/" + z.string().uuid().parse(courseId), site.origin);
  if (portalSlug !== undefined)
    destination.searchParams.set("portal", portalSlugSchema.parse(portalSlug));
  return destination;
}
