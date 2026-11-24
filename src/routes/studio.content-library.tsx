import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Download, FileArchive, FileText, Image as ImageIcon, Library, Loader2, Video } from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { toast } from "sonner";
import { BulkCourseUpload } from "@/components/BulkCourseUpload";

export const Route = createFileRoute("/studio/content-library")({
  head: () => ({ meta: [{ title: "Content Library — Plusticity" }] }),
  component: ContentLibraryPage,
});

type ContentFile = {
  id: string;
  course_id: string;
  course_title: string;
  file_name: string;
  file_type: string;
  storage_path: string;
  size_bytes: number;
  description: string;
  created_at: string;
};

const TYPE_ICON: Record<string, typeof Video> = {
  video: Video,
  pdf: FileText,
  text: FileText,
  document: FileText,
  image: ImageIcon,
  scorm: FileArchive,
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A read-only, cross-course view of every file a trainer has uploaded into any of their courses' Content Libraries — the per-course Content Library tab only ever showed one course at a time. */
function ContentLibraryPage() {
  const { user, ready } = useAuth();
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: files, isLoading } = useQuery({
    queryKey: ["content-library-all", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: courses } = await supabase
        .from("studio_courses")
        .select("id, title")
        .eq("author_id", user!.id);
      const courseIds = (courses ?? []).map((c) => c.id);
      if (!courseIds.length) return [] as ContentFile[];
      const titleById = new Map((courses ?? []).map((c) => [c.id, c.title]));
      const { data: items } = await supabase
        .from("studio_content_files")
        .select("id, course_id, file_name, file_type, storage_path, size_bytes, description, created_at")
        .in("course_id", courseIds)
        .order("created_at", { ascending: false });
      return ((items ?? []) as Omit<ContentFile, "course_title">[]).map((f) => ({
        ...f,
        course_title: titleById.get(f.course_id) ?? "Course",
      }));
    },
  });

  const download = async (file: ContentFile) => {
    setDownloading(file.id);
    try {
      const { data, error } = await supabase.storage.from("studio-content").createSignedUrl(file.storage_path, 60);
      if (error || !data) throw error ?? new Error("No URL returned");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not open this file.");
    } finally {
      setDownloading(null);
    }
  };

  const filtered = (files ?? []).filter(
    (f) =>
      f.file_name.toLowerCase().includes(search.toLowerCase()) ||
      f.course_title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Phone>
      <Header />
      <Sheet wide>
        <div className="mb-4 flex items-center gap-2">
          <Link to="/studio" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <CanvasHeading eyebrow="For trainers" title="Content Library" />
        </div>
        {ready && !user ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            <Link to="/auth" className="font-semibold text-primary">Sign in</Link> to view your content library.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Every file you've uploaded into any course's Content Library, in one place.
            </p>
            <details className="mb-5 rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Upload PDFs, documents or SCORM packages</summary>
              <div className="mt-3">
                <BulkCourseUpload requireAdmin={false} />
              </div>
            </details>
            <Input
              aria-label="Search files"
              placeholder="Search by file name or course"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-4 max-w-md"
            />
            {isLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></p>
            ) : !filtered.length ? (
              <p className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <Library className="h-8 w-8" />
                {files?.length ? "No files match your search." : "Nothing here yet — save a file to a course's Content Library and it'll show up here."}
              </p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {filtered.map((file) => {
                  const Icon = TYPE_ICON[file.file_type] ?? FileText;
                  return (
                    <div key={file.id} className="flex items-center gap-3 p-3">
                      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{file.file_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          <Link to="/studio/$id" params={{ id: file.course_id }} className="hover:text-primary hover:underline">{file.course_title}</Link>
                          {" · "}{formatSize(file.size_bytes)}
                          {file.description && ` · ${file.description}`}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" disabled={downloading === file.id} onClick={() => void download(file)}>
                        {downloading === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Open
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Sheet>
    </Phone>
  );
}
