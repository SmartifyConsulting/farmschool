import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { gradingCategory, type Gradebook, type GradingCategory } from "@/lib/gradebook";
import { friendlyError } from "@/lib/friendly-error";

export function CourseGrading({ report }: { report: Gradebook }) {
  const qc = useQueryClient();
  const [categories, setCategories] = useState<GradingCategory[]>([]);
  const [learnerId, setLearnerId] = useState("");
  const [score, setScore] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setCategories(report.grading?.categories ?? []);
  }, [report.course.id, report.grading?.version]);
  const learner = report.learners.find((item) => item.userId === learnerId);
  const history = useQuery({
    queryKey: ["grade-decisions", report.course.id, learnerId],
    enabled: !!learnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_grade_decisions")
        .select("id,score,reason,status,review_note,proposed_at,scheme_version")
        .eq("course_id", report.course.id)
        .eq("user_id", learnerId)
        .order("proposed_at", { ascending: false })
        .order("id")
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["course-gradebook", report.course.id] }),
      qc.invalidateQueries({ queryKey: ["grade-decisions", report.course.id] }),
      qc.invalidateQueries({ queryKey: ["grade-moderation"] }),
    ]);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const parsed = gradingCategory.array().min(1).max(20).parse(categories);
      if (Math.round(parsed.reduce((sum, item) => sum + item.weight * 100, 0)) !== 10000)
        throw new Error("Category weights must total 100 percent.");
      const keys = parsed.flatMap((category) =>
        category.items.map((item) => item.kind + ":" + item.id),
      );
      if (new Set(keys).size !== keys.length)
        throw new Error("Choose each grading item only once.");
      const { error } = await supabase.rpc("save_course_grading", {
        _course: report.course.id,
        _categories: parsed,
        _expected_version: report.grading?.version ?? 0,
      });
      if (error) throw error;
      await refresh();
      toast.success("Grading categories saved.");
    } catch (error) {
      toast.error(friendlyError(error, "Check category titles, weights and selected items."));
    } finally {
      setBusy(false);
    }
  };
  const propose = async () => {
    if (!learner || busy) return;
    if (
      !score.trim() ||
      !Number.isFinite(Number(score)) ||
      Number(score) < 0 ||
      Number(score) > 100 ||
      reason.trim().length < 20
    ) {
      toast.error("Enter a score from 0 to 100 and a reason of at least 20 characters.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("propose_course_grade", {
        _course: report.course.id,
        _learner: learner.userId,
        _score: Number(score),
        _reason: reason.trim(),
        _expected_version: report.grading?.version ?? 0,
        _previous_decision: learner.finalGrade?.headId ?? null,
      });
      if (error) throw error;
      setReason("");
      setScore("");
      await refresh();
      toast.success("Grade sent for independent administrator review.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  const options = [
    ...report.lessons
      .filter((lesson) => lesson.kind === "quiz")
      .map((lesson) => ({ kind: "quiz" as const, id: lesson.id, title: "Quiz: " + lesson.title })),
    ...report.competencies.map((item) => ({
      kind: "competency" as const,
      id: item.id,
      title: "Competency: " + item.title,
    })),
  ];
  return (
    <section className="mt-6 space-y-4 rounded-xl border p-4">
      <h2 className="font-semibold">Weighted grading & grade decisions</h2>
      <p className="text-sm text-muted-foreground">
        Weights must total 100%. Items within a category count equally. The calculated grade remains
        empty until every selected item has a score. Grading changes do not issue certificates or
        change recorded quiz passes.
      </p>
      <fieldset disabled={busy} className="space-y-3">
        {categories.map((category, index) => (
          <div key={category.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label={`Category ${index + 1} title`}
                maxLength={100}
                value={category.title}
                onChange={(e) =>
                  setCategories(
                    categories.map((item) =>
                      item.id === category.id ? { ...item, title: e.target.value } : item,
                    ),
                  )
                }
              />
              <Input
                aria-label={`Category ${index + 1} weight percentage`}
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={category.weight}
                onChange={(e) =>
                  setCategories(
                    categories.map((item) =>
                      item.id === category.id ? { ...item, weight: Number(e.target.value) } : item,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setCategories(categories.filter((item) => item.id !== category.id))}
              >
                Remove category
              </Button>
            </div>
            {options.map((option) => (
              <label key={option.kind + option.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={category.items.some(
                    (item) => item.kind === option.kind && item.id === option.id,
                  )}
                  onChange={(e) =>
                    setCategories(
                      categories.map((item) =>
                        item.id !== category.id
                          ? item
                          : {
                              ...item,
                              items: e.target.checked
                                ? [...item.items, { kind: option.kind, id: option.id }]
                                : item.items.filter(
                                    (existing) =>
                                      existing.kind !== option.kind || existing.id !== option.id,
                                  ),
                            },
                      ),
                    )
                  }
                />
                {option.title}
              </label>
            ))}
            {category.items.some(
              (item) =>
                !options.some((option) => option.id === item.id && option.kind === item.kind),
            ) && (
              <p role="alert" className="text-sm text-destructive">
                A selected item was removed from the course. Remove this category and recreate its
                selection.
              </p>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={categories.length >= 20}
            onClick={() =>
              setCategories([
                ...categories,
                { id: crypto.randomUUID(), title: "", weight: 100, items: [] },
              ])
            }
          >
            Add grading category
          </Button>
          <Button type="button" onClick={save}>
            Save grading categories
          </Button>
        </div>
        <h3 className="pt-3 font-medium">Propose a final grade override</h3>
        <p className="text-sm text-muted-foreground">
          Choose a learner from the current gradebook page. A different administrator must approve
          the proposal before it becomes the final grade. Changing the grading scheme retires
          earlier overrides.
        </p>
        <select
          aria-label="Learner for grade proposal"
          className="w-full rounded-md border bg-background p-2"
          value={learnerId}
          onChange={(e) => {
            setLearnerId(e.target.value);
            setScore("");
            setReason("");
          }}
        >
          <option value="">Choose learner</option>
          {report.learners.map((item) => (
            <option key={item.userId} value={item.userId}>
              {item.name}
            </option>
          ))}
        </select>
        <Input
          aria-label="Proposed final grade"
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          placeholder="Proposed final grade (%)"
        />
        <Textarea
          aria-label="Grade proposal reason"
          maxLength={2000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain the proposed change (20–2000 characters)."
        />
        <Button type="button" disabled={!learner} onClick={propose}>
          Submit for moderation
        </Button>
      </fieldset>
      {learnerId && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Most recent 50 decisions for this learner</h3>
          {history.isError ? (
            <p role="alert">Could not load decision history.</p>
          ) : (
            history.data?.map((item) => (
              <article key={item.id} className="rounded-lg border p-3 text-sm">
                <p>
                  {item.score}% · {item.status} · grading version {item.scheme_version}
                </p>
                <p className="whitespace-pre-wrap">{item.reason}</p>
                {item.review_note && (
                  <p className="mt-2 whitespace-pre-wrap">Review: {item.review_note}</p>
                )}
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}
