import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useLearning";
import { friendlyError } from "@/lib/friendly-error";
import { submitQuiz } from "@/lib/learning.functions";
import { beginQuizAttempt } from "@/lib/learning.functions";
import { quizSampleSize } from "@/lib/quiz-pools";
import { useConfirm } from "@/components/ConfirmDialog";
import { useExamDraft } from "@/hooks/useExamDraft";
import { examStatus, remainingExamSeconds } from "@/lib/exam-controls";
import { supabase } from "@/integrations/supabase/client";
import {
  parseQuizQuestions,
  responseIsComplete,
  trueFalseOptions,
  writtenResponseLimit,
  type QuizResponse,
} from "@/lib/studio-quiz";

export function StudioQuiz({
  lessonId,
  quiz,
  passed,
  body = "",
}: {
  lessonId: string;
  quiz: unknown;
  passed: boolean;
  body?: string;
}) {
  const [answers, setAnswers] = useState<(QuizResponse | undefined)[]>([]);
  const [result, setResult] = useState<Awaited<ReturnType<typeof submitQuiz>> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submit = useServerFn(submitQuiz);
  const begin = useServerFn(beginQuizAttempt);
  const confirm = useConfirm();
  const [exam, setExam] = useState<Awaited<ReturnType<typeof beginQuizAttempt>> | null>(null);
  const [starting, setStarting] = useState(false);
  const startRequest = useRef(crypto.randomUUID());
  const startIntent = useRef<boolean | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const qc = useQueryClient();
  const { user } = useAuth();
  const questions = exam?.questions ?? parseQuizQuestions(quiz);
  const sampleSize = quizSampleSize(body);
  const expired = !!exam && remaining !== null && remaining <= 0;
  const draft = useExamDraft(exam, answers, !starting && !submitting && !result && !expired);
  const status = useQuery({
    queryKey: ["my-quiz-exam-status", lessonId, user?.id],
    enabled: !!user && sampleSize !== null,
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_quiz_exam_status", { _lesson: lessonId });
      if (error) throw error;
      return examStatus.parse(data);
    },
  });
  useEffect(() => {
    if (!exam) {
      setRemaining(null);
      return;
    }
    const loaded = performance.now();
    const serverNow = exam.serverNow ?? new Date().toISOString();
    const tick = () =>
      setRemaining(remainingExamSeconds(exam.expiresAt, serverNow, performance.now() - loaded));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [exam]);
  const start = async (fresh = false) => {
    if (starting || submitting) return;
    if (!user) {
      toast.error("Sign in to start the quiz.");
      return;
    }
    if (
      exam &&
      !result &&
      !(await confirm({
        title: fresh ? "Replace this attempt?" : "Reload saved answers?",
        description: fresh
          ? "The unfinished attempt will close and another start will be consumed. Its answers on this page will be replaced."
          : "Answers on this page will be replaced with the last successfully saved answers. The original questions and timer remain.",
        confirmLabel: fresh ? "Start replacement" : "Reload saved answers",
      }))
    )
      return;
    setStarting(true);
    try {
      await draft.settle();
      if (startIntent.current !== fresh) {
        startRequest.current = crypto.randomUUID();
        startIntent.current = fresh;
      }
      const prepared = await begin({ data: { lessonId, fresh, requestId: startRequest.current } });
      startRequest.current = crypto.randomUUID();
      startIntent.current = null;
      setExam(prepared);
      setAnswers(
        (prepared.draftAnswers ?? []).map((answer) => (answer === null ? undefined : answer)),
      );
      setResult(prepared.result ?? null);
      await qc.invalidateQueries({ queryKey: ["my-quiz-exam-status", lessonId] });
      if (prepared.resumed)
        toast.info("Saved attempt restored. Its original timer is still running.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not start the quiz."));
    } finally {
      setStarting(false);
    }
  };
  if (!questions)
    return <p className="text-sm text-muted-foreground">This quiz could not be loaded.</p>;
  if (sampleSize !== null && !exam)
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          This quiz draws {sampleSize} questions for each attempt.{" "}
          {status.data
            ? `Time limit: ${status.data.durationMinutes} minutes. Starts used this cycle: ${status.data.attemptsUsed}${status.data.maxAttempts === null ? "" : ` of ${status.data.maxAttempts}`}. Minimum ${status.data.startSpacingMinutes} minutes between starts.`
            : "The server checks the current exam limits when you start."}{" "}
          Up to 50 new exam starts are available per day across quizzes. Expired and abandoned
          attempts count.
        </p>
        {status.isError && (
          <p role="status" className="text-sm">
            Could not load current controls. The server still enforces them when you start.
          </p>
        )}
        <Button type="button" disabled={starting} onClick={() => start(false)}>
          {starting
            ? "Preparing questions…"
            : status.data?.canResume
              ? "Resume saved attempt"
              : "Start exam"}
        </Button>
      </div>
    );
  if (!questions.length) return <p className="text-sm text-muted-foreground">No questions yet.</p>;
  const hasWrittenQuestions = questions.some((question) => question.kind === "written");

  const choose = (index: number, answer: QuizResponse) => {
    setAnswers((previous) => Object.assign([...previous], { [index]: answer }));
    setResult(null);
  };

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (submitting) return;
        if (!user) {
          toast.error("Sign in to take the quiz.");
          return;
        }
        if (questions.some((question, index) => !responseIsComplete(question, answers[index]))) {
          toast.error("Complete every question before submitting.");
          return;
        }
        setSubmitting(true);
        try {
          const savedVersion = exam ? await draft.flush() : undefined;
          const response = await submit({
            data: {
              lessonId,
              ...(exam ? { attemptId: exam.attemptId } : {}),
              ...(savedVersion !== undefined ? { draftVersion: savedVersion } : {}),
              answers: answers as QuizResponse[],
            },
          });
          setResult(response);
          await qc.invalidateQueries({ queryKey: ["progress"] });
          await qc.invalidateQueries({ queryKey: ["my-quiz-exam-status", lessonId] });
        } catch (error) {
          toast.error(friendlyError(error, "Could not grade the quiz."));
        } finally {
          setSubmitting(false);
        }
      }}
    >
      {exam && (
        <div className="space-y-2 text-sm">
          <p role="timer">
            {result ? "Attempt submitted." : expired
              ? "Time has ended. Answers remain saved, but this attempt can no longer be submitted."
              : `Time remaining: ${Math.floor((remaining ?? 0) / 60)}:${String((remaining ?? 0) % 60).padStart(2, "0")}`}
          </p>
          <p>
            Attempt expires {new Date(exam.expiresAt).toLocaleString()}. On-time submissions may
            finish grading within their reserved grading period.
          </p>
          {!result && (
            <p role="status">
              {draft.saving
                ? "Saving answers…"
                : draft.error
                  ? draft.error
                  : draft.dirty
                    ? "Changes waiting to save. Keep this page open."
                    : "Answers saved."}
            </p>
          )}
          {draft.error && !expired && !result && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={draft.saving || starting || submitting}
                onClick={() => void draft.flush().catch(() => {})}
              >
                Retry saving
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={draft.saving || starting || submitting}
                onClick={() => start(false)}
              >
                Reload saved answers
              </Button>
            </div>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={starting || submitting || draft.saving}
            onClick={() => start(true)}
          >
            {starting ? "Preparing…" : "Start a new attempt"}
          </Button>
          {!result && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={starting || submitting || draft.saving}
              onClick={() => start(false)}
            >
              Reload saved attempt
            </Button>
          )}
        </div>
      )}
      {passed && !result && (
        <p className="rounded-xl bg-secondary/30 px-3 py-2 text-sm">
          You already passed this quiz. You can try again.
        </p>
      )}
      {hasWrittenQuestions && (
        <p className="text-sm text-muted-foreground">
          AI grades written answers against the trainer’s rubric and gives you feedback. Keep
          personal details out of your answers.
        </p>
      )}
      {questions.map((question, index) => {
        const answer = answers[index];
        const options =
          question.kind === "choice" || question.kind === "multi"
            ? question.options
            : trueFalseOptions;
        const pairs = Array.isArray(answer) ? answer : [];
        return (
          <fieldset
            key={index}
            disabled={submitting || starting || expired || (!!exam && !!result)}
            className="min-w-0 space-y-2 rounded-2xl border border-border p-3"
          >
            <legend className="px-1 text-sm font-semibold">
              {index + 1}. {question.q}
            </legend>
            {(question.kind === "choice" || question.kind === "boolean") &&
              options.map(
                (option, position) =>
                  option.trim() && (
                    <label key={position} className="flex min-h-8 items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={"quiz-" + lessonId + "-" + index}
                        checked={answer === position}
                        onChange={() => choose(index, position)}
                      />
                      {option}
                    </label>
                  ),
              )}
            {question.kind === "multi" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Select all correct answers. One point is awarded for the exact set.
                </p>
                {question.options.map((option, position) => (
                  <label key={position} className="flex min-h-8 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pairs.includes(position)}
                      onChange={() =>
                        choose(
                          index,
                          pairs.includes(position)
                            ? pairs.filter((value) => value !== position)
                            : [...pairs, position],
                        )
                      }
                    />
                    {option}
                  </label>
                ))}
              </div>
            )}
            {question.kind === "numeric" && (
              <label className="block space-y-1 text-sm">
                <span>Numerical answer</span>
                <Input
                  inputMode="decimal"
                  maxLength={64}
                  value={typeof answer === "string" ? answer : ""}
                  onChange={(event) => choose(index, event.target.value)}
                />
                <span className="text-xs text-muted-foreground">
                  Use a decimal point or scientific notation, without commas or units.
                </span>
              </label>
            )}
            {question.kind === "blank" && (
              <Input
                aria-label={"Answer to question " + (index + 1)}
                maxLength={500}
                value={typeof answer === "string" ? answer : ""}
                onChange={(event) => choose(index, event.target.value)}
              />
            )}
            {question.kind === "written" && (
              <Textarea
                aria-label={"Written answer to question " + (index + 1)}
                rows={5}
                maxLength={writtenResponseLimit}
                value={typeof answer === "string" ? answer : ""}
                onChange={(event) => choose(index, event.target.value)}
              />
            )}
            {question.kind === "match" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Choose a different match for each item.
                </p>
                {question.left.map((left, row) => (
                  <label key={row} className="grid gap-1 text-sm sm:grid-cols-2">
                    <span className="break-words">{left}</span>
                    <select
                      className="min-w-0 rounded-md border border-input bg-background p-2"
                      value={pairs[row] ?? -1}
                      onChange={(event) =>
                        choose(
                          index,
                          question.left.map((_, i) =>
                            i === row ? Number(event.target.value) : (pairs[i] ?? -1),
                          ),
                        )
                      }
                    >
                      <option value={-1}>Choose a match</option>
                      {question.right.map((right, optionIndex) => (
                        <option key={optionIndex} value={optionIndex}>
                          {right}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
            {result?.feedback?.[index] && (
              <p className="whitespace-pre-wrap break-words text-sm">{result.feedback[index]}</p>
            )}
            {result && (
              <p
                className={
                  "text-xs font-semibold " +
                  (result.correct[index] ? "text-primary" : "text-destructive")
                }
              >
                {result.correct[index] ? "Correct" : "Not quite"}
              </p>
            )}
          </fieldset>
        );
      })}
      {result && (
        <p role="status" className="text-sm font-semibold">
          {result.passed
            ? "Passed with " + result.score + "%"
            : result.score + "% — you need " + result.passMark + "% to pass. Try again."}
        </p>
      )}
      <Button
        type="submit"
        disabled={submitting || starting || expired || draft.saving || (!!exam && !!result)}
      >
        {submitting ? "Grading…" : "Submit answers"}
      </Button>
    </form>
  );
}
