import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  const qc = useQueryClient();
  const { user } = useAuth();
  const questions = exam?.questions ?? parseQuizQuestions(quiz);
  const sampleSize = quizSampleSize(body);
  const start = async () => {
    if (starting || submitting) return;
    if (!user) {
      toast.error("Sign in to start the quiz.");
      return;
    }
    if (
      exam &&
      !result &&
      answers.some((answer) => answer !== undefined) &&
      !(await confirm({
        title: "Start a new random attempt?",
        description:
          "Your answers on this page will be discarded and a new question selection will be created.",
        confirmLabel: "Start new attempt",
      }))
    )
      return;
    setStarting(true);
    try {
      const prepared = await begin({ data: { lessonId } });
      setExam(prepared);
      setAnswers([]);
      setResult(null);
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
          This quiz draws {sampleSize} questions for each attempt. Complete the attempt within four
          hours. Up to 50 new random attempts are available per day.
        </p>
        <Button type="button" disabled={starting} onClick={start}>
          {starting ? "Preparing questions…" : "Start random quiz"}
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
          const response = await submit({
            data: {
              lessonId,
              ...(exam ? { attemptId: exam.attemptId } : {}),
              answers: answers as QuizResponse[],
            },
          });
          setResult(response);
          await qc.invalidateQueries({ queryKey: ["progress"] });
        } catch (error) {
          toast.error(friendlyError(error, "Could not grade the quiz."));
        } finally {
          setSubmitting(false);
        }
      }}
    >
      {exam && (
        <div className="space-y-2 text-sm">
          <p>Attempt expires {new Date(exam.expiresAt).toLocaleString()}.</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={starting || submitting}
            onClick={start}
          >
            {starting ? "Preparing…" : "Start a new random attempt"}
          </Button>
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
        const options = question.kind === "choice" ? question.options : trueFalseOptions;
        const pairs = Array.isArray(answer) ? answer : [];
        return (
          <fieldset
            key={index}
            disabled={submitting || starting || (!!exam && !!result)}
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
      <Button type="submit" disabled={submitting || starting || (!!exam && !!result)}>
        {submitting ? "Grading…" : "Submit answers"}
      </Button>
    </form>
  );
}
