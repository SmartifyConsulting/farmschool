import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  newQuizQuestion,
  questionLabels,
  trueFalseOptions,
  writtenRubricLimit,
  type QuestionKind,
  type QuizDraftQuestion,
} from "@/lib/studio-quiz";

const selectClass = "min-w-0 rounded-md border border-input bg-background px-2 py-1 text-sm";

export function QuizQuestionEditor({
  question,
  index,
  onChange,
  onRemove,
}: {
  question: QuizDraftQuestion;
  index: number;
  onChange: (value: QuizDraftQuestion) => void;
  onRemove: () => void;
}) {
  const choices =
    question.kind === "choice" || question.kind === "multi" ? question.options : trueFalseOptions;
  return (
    <fieldset className="min-w-0 space-y-2 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-semibold">Question {index + 1}</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          Type
          <select
            className={selectClass}
            value={question.kind}
            onChange={(event) =>
              onChange(newQuizQuestion(event.target.value as QuestionKind, question.q))
            }
          >
            {Object.entries(questionLabels).map(([kind, label]) => (
              <option key={kind} value={kind}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={"Remove question " + (index + 1)}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
      <Input
        aria-label={"Question " + (index + 1) + " prompt"}
        value={question.q}
        placeholder={
          question.kind === "blank"
            ? "Write a sentence with a blank (___)"
            : "Enter the question or instruction"
        }
        maxLength={500}
        onChange={(event) => onChange({ ...question, q: event.target.value })}
      />
      {(question.kind === "choice" || question.kind === "boolean" || question.kind === "multi") && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {question.kind === "multi"
              ? "Select every correct option. Learners earn one point only for the exact set."
              : "Select the correct answer."}
          </p>
          {choices.map((choice, position) => (
            <div key={position} className="flex items-center gap-2 text-sm">
              <input
                type={question.kind === "multi" ? "checkbox" : "radio"}
                name={"quiz-key-" + index}
                checked={
                  question.kind === "multi"
                    ? question.answers.includes(position)
                    : question.answer === position
                }
                aria-label={
                  question.kind !== "boolean"
                    ? "Mark option " + (position + 1) + " correct"
                    : "Correct answer: " + choice
                }
                onChange={() =>
                  question.kind === "multi"
                    ? onChange({
                        ...question,
                        answers: question.answers.includes(position)
                          ? question.answers.filter((value) => value !== position)
                          : [...question.answers, position],
                      })
                    : onChange({ ...question, answer: position })
                }
              />
              {question.kind !== "boolean" ? (
                <Input
                  aria-label={"Option " + (position + 1)}
                  maxLength={500}
                  placeholder={"Option " + (position + 1)}
                  value={choice}
                  onChange={(event) =>
                    onChange({
                      ...question,
                      options: question.options.map((item, i) =>
                        i === position ? event.target.value : item,
                      ),
                    })
                  }
                />
              ) : (
                <span>{choice}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {question.kind === "blank" && (
        <label className="block space-y-1 text-sm">
          <span>Accepted answers, one per line</span>
          <Textarea
            rows={3}
            maxLength={5010}
            value={question.accepted}
            onChange={(event) => onChange({ ...question, accepted: event.target.value })}
          />
          <span className="text-xs text-muted-foreground">
            Capitalisation and extra spaces are ignored.
          </span>
        </label>
      )}
      {question.kind === "numeric" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label>
            Private correct number
            <Input
              value={question.value}
              maxLength={64}
              onChange={(event) => onChange({ ...question, value: event.target.value })}
            />
          </label>
          <label>
            Absolute tolerance
            <Input
              value={question.tolerance}
              maxLength={64}
              onChange={(event) => onChange({ ...question, tolerance: event.target.value })}
            />
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Use a decimal point or scientific notation; no commas or units. Put the required unit in
            the prompt. Zero tolerance requires the exact numeric value.
          </p>
        </div>
      )}
      {question.kind === "written" && (
        <label className="block space-y-1 text-sm">
          <span>Private grading rubric</span>
          <Textarea
            rows={4}
            maxLength={writtenRubricLimit}
            value={question.rubric}
            placeholder="List the facts or steps a complete answer must cover."
            onChange={(event) => onChange({ ...question, rubric: event.target.value })}
          />
          <span className="block text-xs text-muted-foreground">
            The AI grader uses this rubric to decide whether the answer earns one point.
          </span>
        </label>
      )}
      {question.kind === "match" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Enter the correct pairs. Learners see the matches in a separate order.
          </p>
          {question.pairs.map((pair, position) => (
            <div key={position} className="flex flex-wrap items-center gap-2">
              <Input
                className="min-w-24 flex-1"
                aria-label={"Pair " + (position + 1) + " prompt"}
                placeholder="Prompt"
                maxLength={500}
                value={pair.left}
                onChange={(event) =>
                  onChange({
                    ...question,
                    pairs: question.pairs.map((item, i) =>
                      i === position ? { ...item, left: event.target.value } : item,
                    ),
                  })
                }
              />
              <Input
                className="min-w-24 flex-1"
                aria-label={"Pair " + (position + 1) + " match"}
                placeholder="Correct match"
                maxLength={500}
                value={pair.right}
                onChange={(event) =>
                  onChange({
                    ...question,
                    pairs: question.pairs.map((item, i) =>
                      i === position ? { ...item, right: event.target.value } : item,
                    ),
                  })
                }
              />
              {question.pairs.length > 2 && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={"Remove pair " + (position + 1)}
                  onClick={() =>
                    onChange({
                      ...question,
                      pairs: question.pairs.filter((_, i) => i !== position),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={question.pairs.length >= 8}
            onClick={() =>
              onChange({ ...question, pairs: [...question.pairs, { left: "", right: "" }] })
            }
          >
            <Plus />
            Add pair
          </Button>
        </div>
      )}
    </fieldset>
  );
}
