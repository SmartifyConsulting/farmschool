import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/database-pages";
import {
  libraryColumns,
  type LibraryFile,
  type LibraryFolder,
  type Derivation,
} from "@/lib/library-materials";

export function useLibraryMaterials(enabled = true) {
  const { user } = useAuth();
  const files = useQuery({
    queryKey: ["content-library-all", user?.id],
    enabled: enabled && !!user,
    queryFn: async () =>
      (
        await readAllPages(
          supabase
            .from("content_library_files" as never)
            .select(libraryColumns as never, { count: "exact" })
            .eq("author_id", user!.id)
            .order("created_at", { ascending: false })
            .order("id"),
        )
      ).data as unknown as LibraryFile[],
  });
  const folders = useQuery({
    queryKey: ["content-library-folders", user?.id],
    enabled: enabled && !!user,
    queryFn: async () =>
      (
        await readAllPages(
          supabase
            .from("content_library_folders" as never)
            .select("id,name,parent_id" as never, { count: "exact" })
            .eq("author_id", user!.id)
            .order("name")
            .order("id"),
        )
      ).data as unknown as LibraryFolder[],
  });
  const links = useQuery({
    queryKey: ["content-library-links", user?.id],
    enabled: enabled && !!user,
    queryFn: async () =>
      (
        await readAllPages(
          supabase
            .from("content_library_derivations" as never)
            .select("raw_file_id,produced_file_id" as never, { count: "exact" })
            .eq("author_id", user!.id)
            .order("raw_file_id")
            .order("produced_file_id"),
        )
      ).data as unknown as Derivation[],
  });
  return {
    files: files.data ?? [],
    folders: folders.data ?? [],
    links: links.data ?? [],
    loading: files.isPending || folders.isPending || links.isPending,
    error: files.error || folders.error || links.error,
  };
}
