import { ExternalLink, PlayCircle, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export type LinkedVideo = {
  lesson_id: string;
  objectives: string;
  item: {
    title: string; description: string; thumbnail_url: string | null; embed_url: string | null;
    original_url: string; import_status: string; language: string;
    provider: { name: string; attribution: string; enabled: boolean } | null;
  } | null;
};

/** Learner view of a shared-library video: official embed first, otherwise a link-out. */
export function ExternalVideo({ video }: { video: LinkedVideo }) {
  const it = video.item;
  if (!it || it.import_status === "unavailable" || it.provider?.enabled === false) {
    return <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-2xl bg-muted text-center text-sm text-muted-foreground">
      <VideoOff className="h-8 w-8" />This video is currently unavailable.<span className="text-xs">You can still read the notes below and continue the course.</span>
    </div>;
  }
  return <div className="space-y-3">
    {it.embed_url ? (
      <iframe src={it.embed_url} title={it.title} className="aspect-video w-full rounded-2xl" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen />
    ) : (
      <div className="relative overflow-hidden rounded-2xl bg-primary/10">
        {it.thumbnail_url ? <img src={it.thumbnail_url} alt="" className="aspect-video w-full object-cover" loading="lazy" />
          : <div className="grid aspect-video w-full place-items-center text-primary"><PlayCircle className="h-14 w-14" /></div>}
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-2 bg-background/90 p-3">
          <p className="text-xs text-muted-foreground">Opens on {it.provider?.name ?? "the provider's site"} in a new tab. Your progress here is kept.</p>
          <Button asChild size="sm"><a href={it.original_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />Watch Video</a></Button>
        </div>
      </div>
    )}
    {video.objectives.trim() && <div className="rounded-xl border border-border p-3">
      <h3 className="text-sm font-semibold">Learning objectives</h3>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
        {video.objectives.split("\n").filter((l) => l.trim()).map((l, i) => <li key={i}>{l.replace(/^[-•*]\s*/, "")}</li>)}
      </ul>
    </div>}
    {it.description && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{it.description.replace(/^Sample record\.\s*/, "")}</p>}
    <p className="text-xs text-muted-foreground">{it.provider?.attribution || `Video by ${it.provider?.name ?? "an external provider"}.`} · {it.language}</p>
  </div>;
}

export const LINKED_VIDEO_SELECT = "lesson_id, objectives, item:external_content_items(title, description, thumbnail_url, embed_url, original_url, import_status, language, provider:external_content_providers(name, attribution, enabled))";
