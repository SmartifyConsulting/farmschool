import { z } from "zod";

export const competencySubmission = z.object({
  body: z.string().trim().min(20).max(20000),
  evidenceUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return url.protocol === "https:" && !!url.hostname && !url.username && !url.password;
      } catch {
        return false;
      }
    }, "Use a secure HTTPS evidence link without embedded credentials.")
    .transform((value) => (value ? new URL(value).href : "")),
});
