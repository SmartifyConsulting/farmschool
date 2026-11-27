import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { LibraryFile } from "./library-materials";
import { designReferencesSchema, type DesignReference } from "./design-reference";

export const materialProjectSchema = z
  .object({
    kind: z.literal("material"),
    sourceIds: z.array(z.string().uuid()).min(1).max(20),
    title: z.string().max(200).optional(),
    scope: z.enum(["personal", "admin"]).default("personal"),
    folderId: z.string().uuid().nullable().default(null),
    initialBody: z.string().max(16000000).optional(),
    initialTitle: z.string().max(200).optional(),
    initialInstruction: z.string().max(1000).optional(),
    sourceMode: z.enum(["studio", "legacy"]).optional(),
    designReferences: designReferencesSchema.default([]),
  })
  .passthrough();
export async function createMaterialWorkspace(
  user: string,
  sources: LibraryFile[],
  options: {
    scope: "personal" | "admin";
    folderId: string | null;
    initialTitle?: string;
    initialBody?: string;
    initialInstruction?: string;
    sourceMode?: "studio" | "legacy";
    designReferences?: DesignReference[];
  },
) {
  const id = crypto.randomUUID();
  const state = materialProjectSchema.parse({
    kind: "material",
    sourceIds: sources.map((file) => file.id),
    title: options.initialTitle ?? sources[0]?.file_name.replace(/\.[^.]+$/, ""),
    ...options,
    sourceMode: options.sourceMode ?? (options.initialBody ? "legacy" : "studio"),
  });
  const { error } = await supabase
    .from("studio_workspace_drafts" as never)
    .insert({ id, author_id: user, state } as never);
  if (error) throw error;
  return id;
}
export function isStudioEditorPath(path: string) {
  return /^\/studio\/(?:materials\/)?[0-9a-f-]{36}\/?$/i.test(path);
}
export function reorderIndexedValues<T>(
  record: Record<number, T>,
  from: number,
  to: number,
  count: number,
): Record<number, T> {
  const order = Array.from({ length: count }, (_, i) => i);
  const [moved] = order.splice(from, 1);
  if (moved === undefined) return record;
  order.splice(to, 0, moved);
  return Object.fromEntries(
    order.flatMap((old, index) => (Object.hasOwn(record, old) ? [[index, record[old]!]] : [])),
  );
}
