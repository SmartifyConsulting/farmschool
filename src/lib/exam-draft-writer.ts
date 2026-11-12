import { examDraftAnswers } from "./exam-controls";
import { friendlyError } from "./friendly-error";

type Answers = ReturnType<typeof examDraftAnswers.parse>;
type Sender = (input: {
  attemptId: string;
  answers: Answers;
  version: number;
}) => Promise<{ version: number }>;
export function createExamDraftWriter(send: Sender) {
  let generation = 0;
  let attemptId: string | null = null;
  let answers: Answers = [];
  let version = 0;
  let acknowledged = "[]";
  let error = "";
  let pending: { generation: number; promise: Promise<number> } | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const state = () => ({ version, saving: pending !== null, error });
  const load = (
    attempt: { attemptId: string; draftAnswers?: Answers | undefined; draftVersion?: number | undefined } | null,
  ) => {
    generation++;
    attemptId = attempt?.attemptId ?? null;
    answers = examDraftAnswers.parse(attempt?.draftAnswers ?? []);
    version = attempt?.draftVersion ?? 0;
    acknowledged = JSON.stringify(answers);
    error = "";
    notify();
  };
  const setAnswers = (value: Answers) => {
    answers = examDraftAnswers.parse(value);
  };
  const flush = async (): Promise<number> => {
    while (pending) {
      const previous = pending;
      try {
        await previous.promise;
      } catch (reason) {
        if (previous.generation === generation) throw reason;
      }
    }
    if (!attemptId || JSON.stringify(answers) === acknowledged) return version;
    const captured = { attemptId, answers: examDraftAnswers.parse(answers), version };
    const ownGeneration = generation;
    const text = JSON.stringify(captured.answers);
    error = "";
    const promise = Promise.resolve()
      .then(() => send(captured))
      .then((result) => {
        if (!Number.isInteger(result.version) || result.version < 0)
          throw new Error("The saved answer version could not be verified.");
        if (generation === ownGeneration) {
          version = result.version;
          acknowledged = text;
        }
        return result.version;
      })
      .catch((reason) => {
        if (generation === ownGeneration)
          error = friendlyError(reason, "Could not save answers. Keep this page open and retry.");
        throw reason;
      });
    const operation = { generation: ownGeneration, promise };
    pending = operation;
    notify();
    try {
      return await promise;
    } finally {
      if (pending === operation) pending = null;
      notify();
    }
  };
  return {
    load,
    setAnswers,
    flush,
    state,
    dirty: (value: Answers) => JSON.stringify(value) !== acknowledged,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    settle: async () => {
      while (pending) {
        try {
          await pending.promise;
        } catch {
          break;
        }
      }
    },
  };
}
