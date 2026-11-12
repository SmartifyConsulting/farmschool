import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuizQuestionEditor } from "@/components/QuizQuestionEditor";
import { useConfirm } from "@/components/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useLearning";
import { buildQuiz, newQuizQuestion, type QuizDraftQuestion } from "@/lib/studio-quiz";
import { readBankQuestion } from "@/lib/question-bank";
import { friendlyError } from "@/lib/friendly-error";

type BankRow = Database["public"]["Tables"]["quiz_question_bank"]["Row"];

export function QuestionBank({
  questions = [],
  onAdd,
  disabled = false,
}: {
  questions?: QuizDraftQuestion[];
  onAdd?: (row: BankRow) => void;
  disabled?: boolean;
}) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<QuizDraftQuestion | null>(null);
  const [editing, setEditing] = useState<BankRow | null>(null);
  const [category, setCategory] = useState("General");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setOpen(false);
    setDraft(null);
    setEditing(null);
    setSearch("");
    setFilter("");
    setPage(0);
  }, [user?.id]);
  const library = useQuery({
    queryKey: ["question-bank", user?.id, search, filter, page],
    enabled: open && !!user,
    queryFn: async () => {
      let query = supabase
        .from("quiz_question_bank")
        .select("*", { count: "exact" })
        .eq("owner_id", user!.id)
        .order("updated_at", { ascending: false })
        .order("id");
      const literal = (value: string) => value.replace(/[\\%_]/g, "\\$&");
      if (search.trim()) query = query.ilike("question->>q", `%${literal(search.trim())}%`);
      if (filter.trim()) query = query.ilike("category", `%${literal(filter.trim())}%`);
      const { data, error, count } = await query.range(page * 20, page * 20 + 19);
      if (error) throw error;
      return { rows: data, count: count ?? 0 };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["question-bank", user?.id] });
  const begin = (value: QuizDraftQuestion, row: BankRow | null = null) => {
    setDraft(value);
    setEditing(row);
    setCategory(row?.category ?? "General");
  };
  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const built = buildQuiz([draft]);
      const question = built.questions[0];
      const answer = built.keys[0];
      if (!question || answer === undefined) throw new Error("Check the question before saving.");
      if (!category.trim() || category.trim().length > 80)
        throw new Error("Enter a category of up to 80 characters.");
      const { error } = await supabase.rpc("save_bank_question", {
        _id: (editing?.id ?? null) as string,
        _category: category.trim(),
        _question: question,
        _answer: answer,
        _expected_version: editing?.version ?? 0,
      });
      if (error) throw error;
      setDraft(null);
      setEditing(null);
      await refresh();
      toast.success("Question saved to your private library.");
    } catch (error) {
      toast.error(
        friendlyError(error, "Could not save the question. Refresh the library and try again."),
      );
    } finally {
      setBusy(false);
    }
  };
  const remove = async (row: BankRow) => {
    if (
      busy ||
      !(await confirm({
        title: "Delete this library question?",
        description: "Copies already added to courses will be kept.",
        confirmLabel: "Delete question",
        tone: "danger",
      }))
    )
      return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("delete_bank_question", {
        _id: row.id,
        _expected_version: row.version,
      });
      if (error) throw error;
      if (library.data?.rows.length === 1 && page > 0) setPage(page - 1);
      await refresh();
      toast.success("Library question deleted.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || !user}
        onClick={() => setOpen(true)}
      >
        Question bank
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) {
            setOpen(next);
            if (!next) {
              setDraft(null);
              setEditing(null);
            }
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>My question bank</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Private to you. Add copies to draft quizzes; library edits never change existing
            courses. Save the lesson to keep added questions.
          </p>
          {draft ? (
            <div className="space-y-3">
              <Input
                aria-label="Question category"
                value={category}
                maxLength={80}
                onChange={(e) => setCategory(e.target.value)}
                disabled={busy}
              />
              <fieldset disabled={busy}>
                <QuizQuestionEditor
                  question={draft}
                  index={0}
                  onChange={setDraft}
                  onRemove={() => {
                    setDraft(null);
                    setEditing(null);
                  }}
                />
              </fieldset>
              <div className="flex gap-2">
                <Button type="button" onClick={save} disabled={busy}>
                  {busy ? "Saving…" : "Save to library"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setDraft(null);
                    setEditing(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Button type="button" size="sm" onClick={() => begin(newQuizQuestion("choice"))}>
                Create library question
              </Button>
              {questions.length > 0 && (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm">
                    Save a question from this quiz
                  </summary>
                  <div className="mt-2 space-y-2">
                    {questions.map((question, index) => (
                      <div key={index} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 break-words">
                          {index + 1}. {question.q || "Untitled question"}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => begin(structuredClone(question))}
                        >
                          Save copy
                        </Button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  aria-label="Search library questions"
                  placeholder="Search questions"
                  value={search}
                  maxLength={500}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                />
                <Input
                  aria-label="Filter library category"
                  placeholder="Filter category"
                  value={filter}
                  maxLength={80}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              {library.isPending ? (
                <p role="status">Loading your library…</p>
              ) : library.isError ? (
                <div role="alert">
                  <p>Could not load your question library.</p>
                  <Button type="button" variant="outline" onClick={() => library.refetch()}>
                    Retry
                  </Button>
                </div>
              ) : (
                <>
                  {!library.data.rows.length && (
                    <p className="text-sm text-muted-foreground">
                      No matching questions. Create a question or save one from a quiz.
                    </p>
                  )}
                  {library.data.rows.map((row) => (
                    <div key={row.id} className="space-y-2 rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">
                        {row.category} · Version {row.version}
                      </p>
                      <p className="break-words text-sm font-medium">
                        {String((row.question as { q?: string })?.q ?? "Question")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {onAdd && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={disabled || busy}
                            onClick={() => {
                              try {
                                onAdd(row);
                                toast.success("Copy added. Save the lesson to keep it.");
                              } catch (error) {
                                toast.error(friendlyError(error));
                              }
                            }}
                          >
                            Add to quiz
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            try {
                              begin(readBankQuestion(row.question, row.answer), row);
                            } catch (error) {
                              toast.error(friendlyError(error));
                            }
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => remove(row)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={page === 0 || busy}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {page + 1} · {library.data.count} questions
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={(page + 1) * 20 >= library.data.count || busy}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
