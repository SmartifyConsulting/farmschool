import { z } from "zod";
export const designReferenceSchema = z.object({
  fileId: z.string().uuid(),
  name: z.string().min(1).max(255),
  text: z.string().max(12000),
  image: z.boolean(),
});
export const designReferencesSchema = z.array(designReferenceSchema).max(3);
export type DesignReference = z.infer<typeof designReferenceSchema>;
