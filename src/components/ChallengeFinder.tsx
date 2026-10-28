import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, LoaderCircle, Sprout, Square, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useLearning";
import { challengeInput, recommendationSchema, type Recommendation } from "@/lib/challenge";
import { getCourse, getLesson } from "@/lib/courses";

const examples = ["My fish are struggling and the tank water is cloudy.", "How can I improve my soil with compost?", "I need help pricing my vegetables for local buyers."];

export function ChallengeFinder() {
  const { session, ready } = useAuth();
  const [challenge, setChallenge] = useState("");
  const [result, setResult] = useState<Recommendation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function findLearning(event: React.FormEvent) {
    event.preventDefault();
    const parsed = challengeInput.safeParse({ challenge });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Describe your farming challenge."); return; }
    if (!session) { setError("Sign in to find learning for your farm."); return; }
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/challenge", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(parsed.data), signal: controller.signal });
      if (!response.ok && !response.headers.get("content-type")?.includes("application/x-ndjson")) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? "The search could not be completed.");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No learning suggestions were returned.");
      const decoder = new TextDecoder();
      let pending = "";
      let received = false;
      const consume = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "result") { setResult(recommendationSchema.parse(event.result)); received = true; }
      };
      while (true) {
        const chunk = await reader.read();
        pending += decoder.decode(chunk.value, { stream: !chunk.done });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        lines.forEach(consume);
        if (chunk.done) break;
      }
      consume(pending);
      if (!received) throw new Error("No learning suggestions were returned. Please start a new search.");
    } catch (err) {
      setError(controller.signal.aborted ? "Search stopped." : friendlyError(err, "The search could not be completed."));
    } finally { setBusy(false); abort.current = null; }
  }

  return (
    <section aria-labelledby="challenge-heading" className="border-b border-border py-6 md:py-8">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><Sprout className="h-6 w-6" /></span>
        <div><p className="text-xs font-semibold text-primary">AI-powered learning</p><h2 id="challenge-heading" className="text-lg font-semibold md:text-xl">What’s happening on your farm?</h2></div>
      </div>
      <form onSubmit={findLearning} className="space-y-3">
        <label htmlFor="farm-challenge" className="text-sm font-medium">Your farming challenge</label>
        <Textarea id="farm-challenge" value={challenge} onChange={(e) => setChallenge(e.target.value)} maxLength={2000} disabled={busy} placeholder="For example: My tomatoes are growing slowly. I want to improve the soil without expensive inputs." className="min-h-28 resize-y bg-background text-sm" aria-describedby={error ? "challenge-error" : undefined} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{challenge.length}/2,000</span>
          {busy ? <Button type="button" variant="outline" onClick={() => abort.current?.abort()}><Square />Stop search</Button> : ready && !session ? <Button asChild><Link to="/auth">Sign in to find learning<ArrowRight /></Link></Button> : <Button type="submit" disabled={!ready || !challenge.trim()}><BookOpen />Find relevant learning</Button>}
        </div>
      </form>
      {!result && !busy && <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">{examples.map((example) => <Button key={example} variant="link" size="sm" className="h-auto max-w-full whitespace-normal px-0 text-left text-xs" onClick={() => { setChallenge(example); setError(""); }}>{example}</Button>)}</div>}
      {busy && <p role="status" className="mt-5 flex items-center gap-2 text-sm text-primary"><LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />Finding courses and practical lessons…</p>}
      {error && <p id="challenge-error" role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      {result && <div className="mt-6 space-y-5" aria-live="polite">
        <p className="text-sm leading-relaxed">{result.summary}</p>
        {result.matches.length === 0 ? <div className="border-l-2 border-secondary pl-4"><h3 className="font-semibold">No close course match yet</h3><Button asChild variant="link" className="px-0"><Link to="/search">Explore the catalogue<ArrowRight /></Link></Button></div> : <div className="grid gap-4 md:grid-cols-3">{result.matches.map((match, index) => {
          const course = getCourse(match.courseId);
          if (!course) return null;
          return <article key={course.id} className="min-w-0 overflow-hidden rounded-lg border border-border bg-background">
            <img src={course.image} alt={course.category} className="h-32 w-full object-cover" />
            <div className="space-y-3 p-4"><p className="text-xs font-semibold text-primary">{index === 0 ? "Best match" : "Also relevant"} · {course.category}</p><h3 className="text-sm font-semibold leading-snug">{course.title}</h3><p className="text-sm leading-relaxed text-muted-foreground">{match.reason}</p>
              <Button asChild variant="outline" size="sm"><Link to="/course/$id" params={{ id: course.id }}>View course<ArrowRight /></Link></Button>
              {match.lessonIds.length > 0 && <div className="space-y-2 border-t border-border pt-3"><p className="text-xs font-semibold">Practical lessons</p>{match.lessonIds.map((id) => {
                const lesson = getLesson(course, id);
                return lesson ? <Button asChild variant="link" key={id} className="h-auto w-full justify-start whitespace-normal px-0 py-1 text-left text-xs"><Link to="/lesson/$courseId/$lessonId" params={{ courseId: course.id, lessonId: id }}><Play className="shrink-0" />{lesson.title}</Link></Button> : null;
              })}</div>}
            </div>
          </article>;
        })}</div>}
        {result.nextSteps.length > 0 && <div><h3 className="mb-2 text-sm font-semibold">Practical next steps</h3><ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">{result.nextSteps.map((step, index) => <li key={index}>{step}</li>)}</ol></div>}
        <p className="text-xs leading-relaxed text-muted-foreground">{result.caution || "AI suggestions are a learning starting point, not a diagnosis. Check local guidance with a qualified agricultural adviser."}</p>
      </div>}
    </section>
  );
}