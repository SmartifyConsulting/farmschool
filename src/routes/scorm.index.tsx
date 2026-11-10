import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { FileArchive, Loader2, Play, Trash2 } from "lucide-react";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { useConfirm } from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/friendly-error";
import { mimeFor, parseManifest, findEntryFile } from "@/lib/scorm";
import { pageMeta } from "@/lib/page-meta";
import { toast } from "sonner";

export const Route = createFileRoute("/scorm/")({
  head: () =>
    pageMeta(
      "SCORM courses — Mobile School",
      "Upload SCORM e-learning packages and play them in Mobile School.",
    ),
  component: ScormLibrary,
});

const MAX_ZIP = 200 * 1024 * 1024;

function ScormLibrary() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const { data: packages = [] } = useQuery({
    queryKey: ["scorm-packages"],
    queryFn: async () =>
      (
        await supabase
          .from("scorm_packages")
          .select("id, title, scorm_version, created_at, author_id, entry_url")
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const upload = async (file: File) => {
    if (!user) return;
    if (!/\.zip$/i.test(file.name)) {
      toast.error("Please choose a .zip SCORM package.");
      return;
    }
    if (file.size > MAX_ZIP) {
      toast.error("The package must be smaller than 200MB.");
      return;
    }
    try {
      setProgress("Opening package…");
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(file);
      let entries = Object.values(zip.files).filter(
        (f) => !f.dir && !f.name.startsWith("__MACOSX"),
      );
      // Some tools wrap everything in one top folder; strip it.
      const manifestFile = entries.find(
        (f) => f.name.toLowerCase().endsWith("imsmanifest.xml") && f.name.split("/").length <= 2,
      );
      const prefix =
        manifestFile && manifestFile.name.includes("/")
          ? manifestFile.name.slice(0, manifestFile.name.lastIndexOf("/") + 1)
          : "";
      if (prefix) entries = entries.filter((f) => f.name.startsWith(prefix));
      const rel = (n: string) => n.slice(prefix.length);
      const names = entries.map((f) => rel(f.name));
      const fallback = file.name.replace(/\.zip$/i, "");
      const meta = manifestFile
        ? parseManifest(await manifestFile.async("string"), fallback, names)
        : { title: fallback, version: "1.2" as const, entryPath: findEntryFile(names) };
      const pkgId = crypto.randomUUID();
      const base = `${user.id}/${pkgId}`;
      let done = 0;
      const queue = [...entries];
      const worker = async () => {
        for (let f = queue.shift(); f; f = queue.shift()) {
          const path = rel(f.name);
          const blob = new Blob([await f.async("arraybuffer")], { type: mimeFor(path) });
          const { error } = await supabase.storage
            .from("scorm-packages")
            .upload(`${base}/${path}`, blob, { contentType: mimeFor(path) });
          if (error) throw error;
          setProgress(`Uploading files… ${++done} of ${entries.length}`);
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      const entryUrl = `/api/scorm-file/${base}/${meta.entryPath.split("?")[0]}`;
      const { error } = await supabase.from("scorm_packages").insert({
        id: pkgId,
        author_id: user.id,
        title: meta.title,
        scorm_version: meta.version,
        entry_path: meta.entryPath,
        entry_url: entryUrl,
        file_count: entries.length,
      });
      if (error) throw error;
      toast.success(`"${meta.title}" is ready to play.`);
      qc.invalidateQueries({ queryKey: ["scorm-packages"] });
    } catch (e) {
      toast.error(
        friendlyError(
          e,
          "We couldn't upload that package. Check it is a valid SCORM zip and try again.",
        ),
      );
    } finally {
      setProgress(null);
    }
  };

  const remove = async (id: string, title: string) => {
    if (
      !(await confirm({
        title: "Delete SCORM course?",
        description: `"${title}" and learner results will be removed. This cannot be undone.`,
        confirmLabel: "Delete",
        tone: "danger",
      }))
    )
      return;
    const { error } = await supabase.from("scorm_packages").delete().eq("id", id);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    toast.success("SCORM course deleted.");
    qc.invalidateQueries({ queryKey: ["scorm-packages"] });
  };

  return (
    <Phone>
      <Header />
      <Sheet wide>
        <div className="mb-4">
          <CanvasHeading eyebrow="E-learning" title="SCORM courses" />
        </div>
        {ready && user ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f && !progress) void upload(f);
            }}
            onClick={() => !progress && inputRef.current?.click()}
            className={`mb-6 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center text-sm ${dragging ? "border-primary bg-primary/5" : "border-input"}`}
          >
            {progress ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p>{progress}</p>
              </>
            ) : (
              <>
                <FileArchive className="h-7 w-7 text-muted-foreground" />
                <p className="font-semibold">Upload a SCORM package (.zip)</p>
                <p className="text-muted-foreground">
                  Drag it here or click to browse. SCORM 1.2 and 2004 from Articulate, Captivate,
                  iSpring and others.
                </p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
          </div>
        ) : ready ? (
          <p className="mb-6 text-sm text-muted-foreground">
            <Link to="/auth" className="font-semibold text-primary">
              Sign in
            </Link>{" "}
            to upload or play SCORM courses.
          </p>
        ) : null}
        {packages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No SCORM courses yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((p) => (
              <li key={p.id} className="rounded-xl border bg-card p-4">
                <p className="break-words font-semibold">{p.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  SCORM {p.scorm_version} · uploaded {new Date(p.created_at).toLocaleDateString()}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button asChild size="sm">
                    <Link to="/scorm/$id" params={{ id: p.id }}>
                      <Play className="mr-1 h-4 w-4" />
                      Play
                    </Link>
                  </Button>
                  {user?.id === p.author_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => remove(p.id, p.title)}
                      aria-label={`Delete ${p.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </Phone>
  );
}
