import { z } from "zod";

export const certificateBrandSchema = z.object({
  issuer_name: z.string().min(1).max(200),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  logo: z.string().nullable(),
  heading: z.string().min(1).max(200),
  signatory_name: z.string().max(200),
  signatory_title: z.string().max(200),
  footer: z.string().max(1000),
  template_version: z.number().int().nonnegative(),
});
export type CertificateBrand = z.infer<typeof certificateBrandSchema>;
