import { useEffect, useRef, useState } from "react";
import { Pause, Play, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LessonNarration({ text, language }: { text: string; language?: string }) {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<"idle" | "playing" | "paused" | "error">("idle");
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  useEffect(() => {
    setSupported("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
    return () => {
      if (current.current) {
        current.current = null;
        window.speechSynthesis.cancel();
      }
    };
  }, []);
  if (!text.trim()) return null;
  if (!supported)
    return (
      <p className="text-xs text-muted-foreground">Lesson audio is unavailable in this browser.</p>
    );
  const synth = window.speechSynthesis;
  const stop = () => {
    current.current = null;
    synth.cancel();
    setStatus("idle");
  };
  const play = () => {
    if (status === "playing") {
      synth.pause();
      setStatus("paused");
      return;
    }
    if (status === "paused") {
      synth.resume();
      setStatus("playing");
      return;
    }
    const chunks =
      text.replace(/^[#*>-]+\s*/gm, "").match(/[\s\S]{1,240}(?:\s|$)|\S{1,240}/g) ?? [];
    const next = () => {
      const chunk = chunks.shift()?.trim();
      if (!chunk) {
        current.current = null;
        setStatus("idle");
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunk);
      if (language) utterance.lang = language;
      current.current = utterance;
      utterance.onend = () => {
        if (current.current === utterance) next();
      };
      utterance.onerror = () => {
        if (current.current !== utterance) return;
        current.current = null;
        setStatus("error");
      };
      synth.speak(utterance);
    };
    synth.resume();
    setStatus("playing");
    next();
  };
  const active = status === "playing" || status === "paused";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={play}>
        {status === "playing" ? (
          <>
            <Pause />
            Pause audio
          </>
        ) : status === "paused" ? (
          <>
            <Play />
            Resume audio
          </>
        ) : (
          <>
            <Volume2 />
            Listen to lesson
          </>
        )}
      </Button>
      {active && (
        <Button type="button" variant="ghost" size="sm" onClick={stop}>
          <Square />
          Stop audio
        </Button>
      )}
      {status === "error" && (
        <p role="status" className="text-xs text-muted-foreground">
          The browser could not play lesson audio. Try again or check your speech settings.
        </p>
      )}
    </div>
  );
}
