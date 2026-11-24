import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type VideoInteractionPoint = { atSeconds: number; note: string };

type YTPlayerLike = { pauseVideo: () => void; playVideo: () => void; getCurrentTime: () => number };
type Props = {
  kind: "file" | "youtube";
  /** A video file URL for kind "file", or a bare YouTube video id for kind "youtube". */
  src: string;
  interactions: VideoInteractionPoint[];
  className?: string;
};

let youtubeApiPromise: Promise<void> | null = null;
/** Loads the YouTube IFrame Player API script once per page; a plain <iframe src> can't be paused from script. */
function loadYouTubeApi(): Promise<void> {
  const w = window as unknown as { YT?: { Player: unknown }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve();
  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise(resolve => {
      const prev = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    });
  }
  return youtubeApiPromise;
}

/**
 * Plays an uploaded video file or a YouTube video and pauses it at each trainer-authored point to
 * show a learning note that the viewer must click "Continue" past before playback resumes. This is
 * a single click-to-continue hotspot per pause point, not a multi-region clickable canvas.
 */
export function InteractiveVideoPlayer({ kind, src, interactions, className }: Props) {
  const sorted = [...interactions].sort((a, b) => a.atSeconds - b.atSeconds);
  const sortedKey = sorted.map(p => p.atSeconds).join(",");
  const [activePoint, setActivePoint] = useState<VideoInteractionPoint | null>(null);
  const triggeredRef = useRef<Set<number>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<YTPlayerLike | null>(null);

  const checkPoint = (currentTime: number, pause: () => void) => {
    for (const point of sorted) {
      const already = triggeredRef.current.has(point.atSeconds);
      if (!already && currentTime >= point.atSeconds) {
        triggeredRef.current.add(point.atSeconds);
        pause();
        setActivePoint(point);
        return;
      }
      if (already && currentTime < point.atSeconds - 0.5) triggeredRef.current.delete(point.atSeconds);
    }
  };

  useEffect(() => {
    if (kind !== "file") return;
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = () => checkPoint(video.currentTime, () => video.pause());
    const onSeeked = () => {
      for (const point of sorted) if (video.currentTime < point.atSeconds - 0.5) triggeredRef.current.delete(point.atSeconds);
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeked", onSeeked);
    return () => { video.removeEventListener("timeupdate", onTimeUpdate); video.removeEventListener("seeked", onSeeked); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, src, sortedKey]);

  useEffect(() => {
    if (kind !== "youtube") return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    void loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current) return;
      const YT = (window as unknown as { YT: { Player: new (el: HTMLElement, opts: unknown) => YTPlayerLike } }).YT;
      const player = new YT.Player(containerRef.current, {
        videoId: src,
        playerVars: { enablejsapi: 1 },
        events: {
          onReady: () => {
            ytPlayerRef.current = player;
            interval = setInterval(() => {
              if (!ytPlayerRef.current) return;
              checkPoint(ytPlayerRef.current.getCurrentTime(), () => ytPlayerRef.current?.pauseVideo());
            }, 500);
          },
        },
      } as unknown);
    });
    return () => { cancelled = true; if (interval) clearInterval(interval); ytPlayerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, src, sortedKey]);

  const resume = () => {
    setActivePoint(null);
    if (kind === "file") void videoRef.current?.play();
    else ytPlayerRef.current?.playVideo();
  };

  return (
    <div className={className ?? "relative aspect-video overflow-hidden rounded bg-muted"}>
      {kind === "file" ? (
        <video ref={videoRef} src={src} controls className="h-full w-full" />
      ) : (
        <div ref={containerRef} className="h-full w-full" />
      )}
      {activePoint && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/95 p-4 text-center">
          <p className="text-sm font-medium">{activePoint.note}</p>
          <Button size="sm" onClick={resume}>Continue</Button>
        </div>
      )}
    </div>
  );
}
