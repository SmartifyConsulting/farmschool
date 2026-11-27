import { describe, expect, it, vi } from "vitest";
import { loadDesignReferenceImages } from "./design-reference.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
function fixture(
  owned = true,
  blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
) {
  const download = vi.fn(async () => ({ data: blob, error: null }));
  const query = {
    select: () => query,
    eq: () => query,
    in: async () => ({
      data: owned
        ? [{ id: "10000000-0000-4000-8000-000000000001", storage_path: "owner/reference.png" }]
        : [],
      error: null,
    }),
  };
  const db = {
    from: () => query,
    storage: { from: () => ({ download }) },
  } as unknown as SupabaseClient<Database>;
  return { db, download };
}
const reference = {
  fileId: "10000000-0000-4000-8000-000000000001",
  name: "Example.png",
  text: "",
  image: true,
};
describe("private course design references", () => {
  it("rejects references from another author before downloading", async () => {
    const f = fixture(false);
    await expect(loadDesignReferenceImages(f.db, "owner", [reference])).rejects.toThrow("owned");
    expect(f.download).not.toHaveBeenCalled();
  });
  it("supplies an owned image as actual model image content", async () => {
    const f = fixture();
    const images = await loadDesignReferenceImages(f.db, "owner", [reference]);
    expect(images[0]).toMatchObject({ type: "image", mediaType: "image/png" });
    expect(images[0]?.image).toBeInstanceOf(Uint8Array);
  });
  it("keeps text references separate from image data", async () => {
    const f = fixture();
    expect(
      await loadDesignReferenceImages(f.db, "owner", [
        { ...reference, image: false, text: "Prefer short sections and diagrams." },
      ]),
    ).toEqual([]);
    expect(f.download).not.toHaveBeenCalled();
  });
  it("rejects oversized or unexpected image files", async () => {
    const f = fixture(true, new Blob(["Not an image"], { type: "text/html" }));
    await expect(loadDesignReferenceImages(f.db, "owner", [reference])).rejects.toThrow("PNG");
  });
});
