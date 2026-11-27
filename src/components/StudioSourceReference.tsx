import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LibraryFile } from "@/lib/library-materials";

export function StudioSourceReference({
  files = [],
  page = 1,
  text = "",
  sourceName = "Source text",
}: {
  files?: LibraryFile[];
  page?: number;
  text?: string;
  sourceName?: string;
}) {
  const [selected, setSelected] = useState(files[0]?.id ?? "");
  const file = files.find((item) => item.id === selected) ?? files[0];
  const url = useQuery({
    queryKey: ["studio-source-preview", file?.id, file?.storage_path],
    enabled: !!file,
    staleTime: 300000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("studio-content")
        .createSignedUrl(file!.storage_path, 900);
      if (error) throw error;
      return data!.signedUrl;
    },
  });
  return (
    <div className="space-y-3">
      {files.length > 1 && (
        <label className="block text-sm">
          Original file
          <select
            className="mt-1 w-full rounded-md border bg-background p-2"
            value={file?.id}
            onChange={(event) => setSelected(event.target.value)}
          >
            {files.map((item) => (
              <option key={item.id} value={item.id}>
                {item.file_name}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="break-words text-sm font-semibold">
        {file?.file_name ?? sourceName} · page {page}
      </p>
      {url.isError && (
        <p role="alert" className="supporting-text">
          The original file could not be opened. Your extracted source text is retained below.
        </p>
      )}
      {url.data && (
        <>
          <a
            className="text-sm text-primary underline"
            href={url.data}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open original file
          </a>
          {/\.pdf$/i.test(file?.original_file_name ?? "") && (
            <iframe
              title="Original PDF source"
              src={`${url.data}#page=${page}`}
              className="h-[48vh] w-full rounded-lg border"
            />
          )}
        </>
      )}
      <div className="whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-3 text-sm">
        {text || "Select a topic with assigned source text, or open the original file."}
      </div>
    </div>
  );
}
