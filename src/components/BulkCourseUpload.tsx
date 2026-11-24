import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { CheckCircle2, FileArchive, FileText, Loader2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { friendlyError } from "@/lib/friendly-error";
import { mimeFor, parseManifest, findEntryFile } from "@/lib/scorm";

const MAX_ZIP = 200 * 1024 * 1024;
const DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];

type FileStatus = { name: string; kind: "scorm" | "document"; state: "pending" | "working" | "done" | "error"; message: string; href?: string };

/** Drag-and-drop bulk intake: any mix of PDFs/Word docs and SCORM .zip packages, auto-detected by
 * extension — no manual "provider"/type selection needed. Each document becomes its own unpublished
 * draft course; each .zip is uploaded as a SCORM package. Used on the admin Library page. */
export function BulkCourseUpload() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<FileStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const { data: admin } = useQuery({
    queryKey: ["admin-course-upload", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", { _user_id: user!.id, _role: "admin" });
      if (error) throw error;
      return !!data;
    },
  });

  const uploadScorm = async (file: File): Promise<Partial<FileStatus>> => {
    if (file.size > MAX_ZIP) return { state: "error", message: "Package must be smaller than 200MB." };
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(file);
    let entries = Object.values(zip.files).filter((f) => !f.dir && !f.name.startsWith("__MACOSX"));
    const manifestFile = entries.find((f) => f.name.toLowerCase().endsWith("imsmanifest.xml") && f.name.split("/").length <= 2);
    const prefix = manifestFile && manifestFile.name.includes("/") ? manifestFile.name.slice(0, manifestFile.name.lastIndexOf("/") + 1) : "";
    if (prefix) entries = entries.filter((f) => f.name.startsWith(prefix));
    const rel = (n: string) => n.slice(prefix.length);
    const names = entries.map((f) => rel(f.name));
    const fallback = file.name.replace(/\.zip$/i, "");
    const meta = manifestFile
      ? parseManifest(await manifestFile.async("string"), fallback, names)
      : { title: fallback, version: "1.2" as const, entryPath: findEntryFile(names) };
    const pkgId = crypto.randomUUID();
    const base = `${user!.id}/${pkgId}`;
    const q = [...entries];
    const worker = async () => {
      for (let f = q.shift(); f; f = q.shift()) {
        const path = rel(f.name);
        const blob = new Blob([await f.async("arraybuffer")], { type: mimeFor(path) });
        const { error } = await supabase.storage.from("scorm-packages").upload(`${base}/${path}`, blob, { contentType: mimeFor(path) });
        if (error) throw error;
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    const entryUrl = `/api/scorm-file/${base}/${meta.entryPath.split("?")[0]}`;
    const { error } = await supabase.from("scorm_packages").insert({
      id: pkgId, author_id: user!.id, title: meta.title, scorm_version: meta.version,
      entry_path: meta.entryPath, entry_url: entryUrl, file_count: entries.length,
    });
    if (error) throw error;
    return { state: "done", message: `"${meta.title}" uploaded — play it from /scorm.`, href: "/scorm" };
  };

  /** Stores the file itself as a reusable content item — distinct from a complete course, which the
   * Course Wizard builds separately. Nothing here creates a course or lessons. */
  const uploadDocument = async (file: File): Promise<Partial<FileStatus>> => {
    const path = `${user!.id}/library/${crypto.randomUUID()}-${file.name}`.replace(/\s+/g, "-");
    const { error: uploadError } = await supabase.storage.from("studio-content").upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (uploadError) throw uploadError;
    const lower = file.name.toLowerCase();
    const fileType = lower.endsWith(".pdf") ? "pdf" : lower.endsWith(".docx") ? "document" : "text";
    const { error } = await supabase.from("content_library_files" as never).insert({
      author_id: user!.id,
      file_name: file.name,
      original_file_name: file.name,
      file_type: fileType,
      storage_path: path,
      size_bytes: file.size,
    } as never);
    if (error) throw error;
    return { state: "done", message: `"${file.name}" saved to your content library.` };
  };

  const processFiles = async (files: File[]) => {
    if (!user || busy) return;
    const items: FileStatus[] = files.map((f) => ({
      name: f.name,
      kind: /\.zip$/i.test(f.name) ? "scorm" : "document",
      state: "pending",
      message: "",
    }));
    const unsupported = files.filter((f) => !/\.zip$/i.test(f.name) && !DOCUMENT_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext)));
    setQueue((prev) => [...items, ...prev]);
    setBusy(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const isScorm = /\.zip$/i.test(file.name);
      setQueue((prev) => prev.map((q) => (q === items[i] ? { ...q, state: "working", message: isScorm ? "Reading package…" : "Reading document…" } : q)));
      try {
        if (unsupported.includes(file)) throw new Error("Unsupported file type — use .pdf, .docx, .txt, .md or a SCORM .zip.");
        const result = isScorm ? await uploadScorm(file) : await uploadDocument(file);
        setQueue((prev) => prev.map((q) => (q === items[i] ? { ...q, ...result } as FileStatus : q)));
      } catch (e) {
        setQueue((prev) => prev.map((q) => (q === items[i] ? { ...q, state: "error", message: friendlyError(e, "Could not process this file.") } : q)));
      }
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["scorm-packages"] });
    qc.invalidateQueries({ queryKey: ["content-library-files"] });
  };

  if (!admin) return <p className="text-sm text-muted-foreground">Admin access required.</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Drop as many PDFs, Word documents or SCORM .zip packages as you like — each PDF/document is saved as a
        reusable content file (not a course), each .zip is uploaded as a SCORM package. The app detects which is
        which by file type. To build a complete course, use Create course on the Studio page instead.
      </p>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const files = Array.from(e.dataTransfer.files);
          if (files.length) void processFiles(files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center ${dragging ? "border-primary bg-primary/5" : "border-border"}`}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">Drag and drop files here</p>
        <p className="text-xs text-muted-foreground">PDF, DOCX, TXT, MD or SCORM .zip — any mix, any number</p>
        <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>Choose files</Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.zip"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void processFiles(files);
            e.target.value = "";
          }}
        />
      </div>
      {queue.length > 0 && (
        <div className="divide-y divide-border rounded-lg border border-border">
          {queue.map((item, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              {item.kind === "scorm" ? <FileArchive className="h-5 w-5 shrink-0 text-muted-foreground" /> : <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.state === "working" ? item.message || "Working…" : item.message}
                  {item.href && (
                    <>
                      {" · "}
                      <Link to={item.href} className="text-primary hover:underline">Open</Link>
                    </>
                  )}
                </p>
              </div>
              {item.state === "working" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
              {item.state === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
              {item.state === "error" && <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
