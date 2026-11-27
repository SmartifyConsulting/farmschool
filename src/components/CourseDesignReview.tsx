import type { CourseDesignPlan, DesignerChoices } from "@/lib/course-design-plan";
import { designQualityChecks } from "@/lib/course-design-plan";
import type { SourceUnit } from "@/lib/training-design";
export function CourseDesignReview({
  plan,
  choices,
  units = [],
}: {
  plan: CourseDesignPlan;
  choices: DesignerChoices;
  units?: SourceUnit[];
}) {
  return (
    <section aria-label="Instructional design checks" className="space-y-3 rounded-lg border p-3">
      <h2 className="font-semibold">Instructional design checks</h2>
      <p className="supporting-text">
        These checks show the design and its source mappings. Factual accuracy, actual
        accessibility, practical competence and training effectiveness still require evidence and
        review.
      </p>
      <div className="divide-y">
        {designQualityChecks(plan, choices).map((check) => (
          <div key={check.model} className="py-2">
            <p className="flex items-center justify-between gap-2 text-sm font-medium">
              {check.model}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                {check.status}
              </span>
            </p>
            <p className="supporting-text mt-1 text-muted-foreground">{check.detail}</p>
          </div>
        ))}
      </div>
      <details className="border-t pt-2">
        <summary className="cursor-pointer text-sm font-medium">
          Source coverage and consolidation ({plan.coverage.length} sections)
        </summary>
        <ul className="mt-2 space-y-2 text-sm">
          {plan.coverage.map((item, index) => (
            <li key={item.unitId}>
              <span className="font-medium capitalize">{item.disposition}</span> ·{" "}
              {(() => {
                const unit = units.find((unit) => unit.id === item.unitId);
                return unit
                  ? `${unit.file} · page ${(unit.pages ?? [unit.page]).join(", ")}`
                  : `Source section ${index + 1}`;
              })()}
              <p className="supporting-text">
                {item.lessonIds
                  .map(
                    (id) =>
                      plan.modules
                        .flatMap((module) => module.lessons)
                        .find((lesson) => lesson.id === id)?.title,
                  )
                  .filter(Boolean)
                  .join("; ") || "Retained as a supporting resource"}
              </p>
              <p className="supporting-text">{item.reason}</p>
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Evaluation and follow-up practice
        </summary>
        <dl className="mt-2 grid gap-2 text-sm">
          {Object.entries(plan.evaluation).map(([level, measure]) => (
            <div key={level}>
              <dt className="font-medium capitalize">{level}</dt>
              <dd>{measure}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-3 space-y-2 text-sm">
          {plan.retrieval.map((item, index) => (
            <li key={index}>
              Day {item.day}: {item.question}
            </li>
          ))}
        </ul>
        <p className="supporting-text mt-2">
          This is a measurement and practice plan. It does not schedule reminders or claim observed
          learner results.
        </p>
      </details>
      {!!plan.notes.length && (
        <ul className="list-inside list-disc text-sm">
          {plan.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
