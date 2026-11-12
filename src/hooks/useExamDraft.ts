import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { saveQuizAttemptDraft, type beginQuizAttempt } from "@/lib/learning.functions";
import type { QuizResponse } from "@/lib/studio-quiz";
import { createExamDraftWriter } from "@/lib/exam-draft-writer";

type Exam = Awaited<ReturnType<typeof beginQuizAttempt>> | null;
export function useExamDraft(exam: Exam, answers: (QuizResponse | undefined)[], enabled: boolean) {
  const save = useServerFn(saveQuizAttemptDraft);
  const saveRef = useRef(save);
  saveRef.current = save;
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const writerRef = useRef<ReturnType<typeof createExamDraftWriter> | null>(null);
  writerRef.current ??= createExamDraftWriter((data) => saveRef.current({ data }));
  const writer = writerRef.current;
  const [state, setState] = useState(writer.state);
  useEffect(() => writer.subscribe(() => setState(writer.state())), [writer]);
  useEffect(() => writer.load(exam), [writer, exam]);
  const flush = useCallback(() => {
    writer.setAnswers(Array.from(answersRef.current, (answer) => answer ?? null));
    return writer.flush();
  }, [writer]);
  useEffect(() => {
    if (!exam || !enabled) return;
    const timer = setTimeout(() => {
      void flush().catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [exam, answers, enabled, state.version, flush]);
  return {
    flush,
    settle: writer.settle,
    ...state,
    dirty: writer.dirty(Array.from(answers, (answer) => answer ?? null)),
  };
}
