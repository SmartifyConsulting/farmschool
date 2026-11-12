import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  gradeCompetencyRubric,
  rubricCriteria,
  type RubricCriterion,
} from "@/lib/competency-rubric";
import { friendlyError } from "@/lib/friendly-error";

export function CompetencyRubric({
  courseId,
  competencies,
  learners,
}: {
  courseId: string;
  competencies: { id: string; title: string }[];
  learners: { user_id: string; full_name: string }[];
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState("");
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);
  const [passMark, setPassMark] = useState("80");
  const [learner, setLearner] = useState("");
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const rubric = useQuery({
    queryKey: ["competency-rubric", selected],
    enabled: !!selected,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_competencies")
        .select("rubric,rubric_pass_mark,rubric_version")
        .eq("id", selected)
        .single();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    const parsed = rubricCriteria.safeParse(rubric.data?.rubric);
    setCriteria(parsed.success ? parsed.data : []);
    setPassMark(String(rubric.data?.rubric_pass_mark ?? 80));
    setMarks({});
  }, [selected, rubric.data]);
  const numericMarks = Object.fromEntries(
    Object.entries(marks)
      .filter(([, value]) => value !== "")
      .map(([key, value]) => [key, Number(value)]),
  );
  let preview: ReturnType<typeof gradeCompetencyRubric> | null = null;
  try {
    preview = gradeCompetencyRubric(
      rubric.data?.rubric,
      numericMarks,
      rubric.data?.rubric_pass_mark ?? 80,
    );
  } catch {
    preview = null;
  }
  const savedCriteria = rubricCriteria.safeParse(rubric.data?.rubric);
  const dirty =
    JSON.stringify(criteria) !== JSON.stringify(savedCriteria.success ? savedCriteria.data : []) ||
    Number(passMark) !== rubric.data?.rubric_pass_mark;
  const save = async () => {
    if (busy || !rubric.data) return;
    const parsed = rubricCriteria.safeParse(criteria);
    if (
      !parsed.success ||
      !Number.isFinite(Number(passMark)) ||
      Number(passMark) < 1 ||
      Number(passMark) > 100
    ) {
      toast.error("Enter 1–30 complete criteria and a pass mark from 1 to 100.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_competency_rubric", {
        _competency: selected,
        _criteria: parsed.data,
        _pass_mark: Number(passMark),
        _expected_version: rubric.data.rubric_version,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["competency-rubric", selected] });
      toast.success("Rubric saved. Earlier assessments keep their original rubric.");
    } catch (error) {
      toast.error(
        friendlyError(error, "Could not save the rubric. Refresh if it changed elsewhere."),
      );
    } finally {
      setBusy(false);
    }
  };
  const assess = async () => {
    if (busy || !rubric.data || !preview || dirty) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("assess_competency_rubric", {
        _competency: selected,
        _learner: learner,
        _marks: numericMarks,
        _notes: notes.trim(),
        _expected_version: rubric.data.rubric_version,
      });
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["competency-workspace", courseId] }),
        queryClient.invalidateQueries({ queryKey: ["my-competency-evidence"] }),
      ]);
      setMarks({});
      setNotes("");
      toast.success("Rubric assessment recorded.");
    } catch (error) {
      toast.error(
        friendlyError(error, "Could not record assessment. Refresh if the rubric changed."),
      );
    } finally {
      setBusy(false);
    }
  };
  const selectClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  return (
    <section className="space-y-4 lg:col-span-2">
      <h2 className="font-semibold">Rubric-based assessment</h2>
      <p className="text-sm text-muted-foreground">
        Available points determine each criterion's weight. Results are calculated on the server and
        retain the criteria used for grading.
      </p>
      <select
        aria-label="Competency rubric"
        value={selected}
        disabled={busy}
        onChange={(event) => setSelected(event.target.value)}
        className={selectClass}
      >
        <option value="">Choose competency</option>
        {competencies.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select>
      {rubric.error && (
        <p role="alert" className="text-destructive">
          Could not load the rubric.
        </p>
      )}
      {selected && rubric.isLoading && <p>Loading rubric…</p>}
      {selected && rubric.data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              Define criteria · version {rubric.data.rubric_version}
            </h3>
            {criteria.map((criterion, index) => (
              <fieldset
                key={criterion.id}
                disabled={busy}
                className="space-y-2 rounded-xl border p-3"
              >
                <legend className="px-1 text-xs">Criterion {index + 1}</legend>
                <Input
                  aria-label={`Criterion ${index + 1} title`}
                  placeholder="Criterion title"
                  value={criterion.title}
                  maxLength={200}
                  onChange={(event) =>
                    setCriteria(
                      criteria.map((item) =>
                        item.id === criterion.id ? { ...item, title: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Textarea
                  aria-label={`Criterion ${index + 1} description`}
                  placeholder="Describe the expected performance"
                  value={criterion.description}
                  maxLength={2000}
                  onChange={(event) =>
                    setCriteria(
                      criteria.map((item) =>
                        item.id === criterion.id
                          ? { ...item, description: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <label className="block text-xs">
                  Maximum points
                  <Input
                    type="number"
                    min={0.01}
                    max={1000}
                    step="0.01"
                    value={criterion.maxPoints}
                    onChange={(event) =>
                      setCriteria(
                        criteria.map((item) =>
                          item.id === criterion.id
                            ? { ...item, maxPoints: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setCriteria(criteria.filter((item) => item.id !== criterion.id))}
                >
                  Remove criterion
                </Button>
              </fieldset>
            ))}
            <Button
              variant="outline"
              disabled={busy || criteria.length >= 30}
              onClick={() =>
                setCriteria([
                  ...criteria,
                  { id: crypto.randomUUID(), title: "", description: "", maxPoints: 10 },
                ])
              }
            >
              Add criterion
            </Button>
            <label className="block text-sm">
              Pass mark (%)
              <Input
                type="number"
                min={1}
                max={100}
                step="0.01"
                value={passMark}
                disabled={busy}
                onChange={(event) => setPassMark(event.target.value)}
              />
            </label>
            <Button disabled={busy || !dirty} onClick={() => void save()}>
              Save rubric
            </Button>
          </div>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void assess();
            }}
          >
            <h3 className="text-sm font-semibold">Score learner against saved rubric</h3>
            {dirty && (
              <p className="text-xs text-muted-foreground">
                Save your rubric changes before grading.
              </p>
            )}
            <select
              aria-label="Rubric learner"
              required
              className={selectClass}
              value={learner}
              disabled={busy}
              onChange={(event) => {
                setLearner(event.target.value);
                setMarks({});
                setNotes("");
              }}
            >
              <option value="">Choose learner</option>
              {learners.map((item) => (
                <option key={item.user_id} value={item.user_id}>
                  {item.full_name || "Learner"} · {item.user_id.slice(0, 8)}
                </option>
              ))}
            </select>
            {savedCriteria.success &&
              savedCriteria.data.map((criterion) => (
                <label key={criterion.id} className="block text-sm">
                  {criterion.title} (out of {criterion.maxPoints})
                  <Input
                    type="number"
                    required
                    min={0}
                    max={criterion.maxPoints}
                    step="0.01"
                    disabled={busy || dirty}
                    value={marks[criterion.id] ?? ""}
                    onChange={(event) => setMarks({ ...marks, [criterion.id]: event.target.value })}
                  />
                </label>
              ))}
            {preview && (
              <p className="text-sm font-semibold">
                Preview: {preview.total}/{preview.maximum} · {preview.score}% ·{" "}
                {preview.achieved ? "Demonstrated" : "Not yet demonstrated"}
              </p>
            )}
            <Textarea
              aria-label="Rubric assessment feedback"
              required
              minLength={10}
              maxLength={2000}
              placeholder="Supporting evidence and feedback"
              value={notes}
              disabled={busy}
              onChange={(event) => setNotes(event.target.value)}
            />
            <Button disabled={busy || dirty || !preview || !learner}>
              Record rubric assessment
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}
