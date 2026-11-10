import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { askLessonTutor } from "@/lib/lesson-tutor.functions";

type Turn = { question: string; answer?: string; error?: string };

export function LessonTutor({
  courseId,
  lessonId,
  title,
  signedIn,
}: {
  courseId: string;
  lessonId: string;
  title: string;
  signedIn: boolean;
}) {
  const ask = useServerFn(askLessonTutor);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const tail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tail.current?.scrollIntoView({ block: "nearest" });
  }, [turns]);
  const send = async () => {
    const value = question.trim();
    if (!signedIn || busy || !value) return;
    const followUpTo = [...turns].reverse().find((turn) => turn.answer)?.question;
    setQuestion("");
    setBusy(true);
    setTurns((prev) => [...prev.slice(-14), { question: value }]);
    let response: Omit<Turn, "question">;
    try {
      const result = await ask({
        data: { courseId, lessonId, question: value, ...(followUpTo ? { followUpTo } : {}) },
      });
      response =
        "answer" in result && result.answer
          ? { answer: result.answer }
          : { error: result.error ?? "Could not get an answer." };
    } catch {
      response = { error: "Could not reach the lesson tutor. Please try again." };
    } finally {
      setBusy(false);
    }
    setTurns((prev) => [...prev.slice(0, -1), { question: value, ...response }]);
  };
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <MessageCircle />
          Ask about this lesson
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full max-w-md flex-col sm:max-w-md">
        <SheetHeader className="pr-7">
          <SheetTitle>Ask about this lesson</SheetTitle>
          <SheetDescription>
            {title} · The tutor uses this lesson’s written material.
          </SheetDescription>
        </SheetHeader>
        {!signedIn ? (
          <Link className="text-sm font-semibold text-primary underline" to="/auth">
            Sign in to ask a question
          </Link>
        ) : (
          <>
            <div
              className="min-h-0 flex-1 space-y-3 overflow-y-auto"
              role="log"
              aria-label="Lesson tutor conversation"
            >
              {!turns.length && (
                <p className="text-sm text-muted-foreground">
                  Ask for a simpler explanation or a hint about a concept in the lesson.
                </p>
              )}
              {turns.map((turn, index) => (
                <div key={index} className="space-y-2 break-words text-sm">
                  <p className="whitespace-pre-wrap rounded-xl bg-primary/10 p-3">
                    <strong>You: </strong>
                    {turn.question}
                  </p>
                  {turn.answer && (
                    <p className="whitespace-pre-wrap rounded-xl bg-muted p-3">
                      <strong>Tutor: </strong>
                      {turn.answer}
                    </p>
                  )}
                  {turn.error && <p className="text-destructive">{turn.error}</p>}
                </div>
              ))}
              {busy && <p className="text-sm text-muted-foreground">Finding an explanation…</p>}
              <div ref={tail} />
            </div>
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <Textarea
                aria-label="Your question about the lesson"
                rows={3}
                maxLength={800}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="What would you like explained?"
              />
              <Button type="submit" disabled={busy || !question.trim()}>
                Ask tutor
              </Button>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
