import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Settings2, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Rough gender guess from common browser voice-name conventions (e.g. "Microsoft Zira",
 * "Google UK English Female"). Browsers don't expose gender directly, so this is a heuristic,
 * not a guarantee — voices that don't match either list are grouped as "Other". */
const FEMALE_HINTS = /female|zira|samantha|victoria|karen|moira|tessa|fiona|susan|linda|heera|ava/i;
const MALE_HINTS = /male|david|daniel|alex|fred|george|james|mark|thomas|rishi/i;
function guessGender(voice: SpeechSynthesisVoice): "Female" | "Male" | "Other" {
  if (FEMALE_HINTS.test(voice.name)) return "Female";
  if (MALE_HINTS.test(voice.name)) return "Male";
  return "Other";
}
/** "en-ZA" -> "English (South Africa)", falling back to the raw BCP-47 tag if Intl can't name it. */
function accentLabel(lang: string): string {
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    return dn.of(lang) ?? lang;
  } catch {
    return lang;
  }
}

type Pronunciation = { term: string; replacement: string };

/** Substitutes each dictionary term (whole word, case-insensitive) with its spoken-form replacement —
 * only in the text handed to speech synthesis, never in what's displayed on screen. */
function applyPronunciation(text: string, dictionary: Pronunciation[]): string {
  return dictionary.reduce((acc, { term, replacement }) => {
    if (!term.trim()) return acc;
    const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return acc.replace(new RegExp(`\\b${escaped}\\b`, "gi"), replacement);
  }, text);
}

export function LessonNarration({ text, language, pronunciationDictionary }: { text: string; language?: string; pronunciationDictionary?: Pronunciation[] }) {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<"idle" | "playing" | "paused" | "error">("idle");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [accent, setAccent] = useState(() => { try { return localStorage.getItem("plusticity:narration:accent") ?? ""; } catch { return ""; } });
  const [gender, setGender] = useState(() => { try { return localStorage.getItem("plusticity:narration:gender") ?? ""; } catch { return ""; } });
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  useEffect(() => {
    if (!("speechSynthesis" in window && "SpeechSynthesisUtterance" in window)) return;
    setSupported(true);
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      if (current.current) {
        current.current = null;
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const accentOptions = useMemo(() => {
    const langs = [...new Set(voices.map((v) => v.lang))];
    return langs.map((lang) => [lang, accentLabel(lang)] as const).sort((a, b) => a[1].localeCompare(b[1]));
  }, [voices]);
  const matchingVoice = useMemo(() => {
    const byAccent = accent ? voices.filter((v) => v.lang === accent) : voices;
    const byGender = gender ? byAccent.filter((v) => guessGender(v) === gender) : byAccent;
    return byGender[0] ?? byAccent[0] ?? voices[0] ?? null;
  }, [voices, accent, gender]);

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
    const spoken = applyPronunciation(text, pronunciationDictionary ?? []);
    const chunks =
      spoken.replace(/^[#*>-]+\s*/gm, "").match(/[\s\S]{1,240}(?:\s|$)|\S{1,240}/g) ?? [];
    const next = () => {
      const chunk = chunks.shift()?.trim();
      if (!chunk) {
        current.current = null;
        setStatus("idle");
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunk);
      if (matchingVoice) utterance.voice = matchingVoice;
      else if (language) utterance.lang = language;
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
  const genderOptions = useMemo(() => [...new Set(voices.map(guessGender))], [voices]);
  return (
    <div className="space-y-2">
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
        {!!accentOptions.length && (
          <Button type="button" variant="ghost" size="sm" aria-label="Voice settings" onClick={() => setShowSettings((s) => !s)}>
            <Settings2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      {showSettings && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1 text-muted-foreground">
            Accent
            <select
              value={accent}
              onChange={(e) => { setAccent(e.target.value); try { localStorage.setItem("plusticity:narration:accent", e.target.value); } catch { /* ignore */ } }}
              className="rounded border border-input bg-background px-1 py-0.5"
            >
              <option value="">Any</option>
              {accentOptions.map(([lang, label]) => <option key={lang} value={lang}>{label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 text-muted-foreground">
            Voice
            <select
              value={gender}
              onChange={(e) => { setGender(e.target.value); try { localStorage.setItem("plusticity:narration:gender", e.target.value); } catch { /* ignore */ } }}
              className="rounded border border-input bg-background px-1 py-0.5"
            >
              <option value="">Any</option>
              {genderOptions.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <p className="basis-full text-[11px] text-muted-foreground">
            Uses your own browser's voices, so what's available differs by device — not a course-wide setting.
          </p>
        </div>
      )}
      {status === "error" && (
        <p role="status" className="text-xs text-muted-foreground">
          The browser could not play lesson audio. Try again or check your speech settings.
        </p>
      )}
    </div>
  );
}
