import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { DesignReference } from "./design-reference";
export async function loadDesignReferenceImages(
  db: SupabaseClient<Database>,
  user: string,
  references: DesignReference[],
) {
  if (!references.length) return [];
  const ids = [...new Set(references.map((reference) => reference.fileId))];
  const rows = await db
    .from("content_library_files")
    .select("id,storage_path")
    .eq("author_id", user)
    .in("id", ids);
  if (rows.error || rows.data?.length !== ids.length)
    throw Error("Choose design references owned by your account.");
  const images: { type: "image"; image: Uint8Array; mediaType: string }[] = [];
  for (const reference of references.filter((item) => item.image)) {
    const row = rows.data.find((item) => item.id === reference.fileId)!;
    const file = await db.storage.from("studio-content").download(row.storage_path);
    if (file.error || !file.data) throw Error("A design reference image could not be read.");
    if (file.data.size > 2 * 1024 * 1024 || !/^image\/(png|jpeg|webp)$/.test(file.data.type))
      throw Error("Use PNG, JPEG or WebP reference images up to 2 MB.");
    images.push({
      type: "image",
      image: new Uint8Array(await file.data.arrayBuffer()),
      mediaType: file.data.type,
    });
  }
  return images;
}
