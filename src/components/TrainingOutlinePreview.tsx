import { Button } from "@/components/ui/button";
import { trainingOutlineGroups } from "@/lib/studio-training-outline";
import type { SourceUnit, TrainingTopic } from "@/lib/training-design";
import type { CourseDesignPlan } from "@/lib/course-design-plan";
export function TrainingOutlinePreview({
  title,
  introduction,
  topics,
  units,
  onSelect,
  plan,
}: {
  title: string;
  introduction: string;
  topics: TrainingTopic[];
  units: SourceUnit[];
  onSelect?: (id: string) => void;
  plan?: CourseDesignPlan | null;
}) {
  return (
    <section aria-label="Course outline overview" className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm italic text-muted-foreground">
          {introduction ||
            "Explore the concepts, practise applying them, and check your understanding."}
        </p>
      </div>
      <ol className="divide-y divide-border">
        {trainingOutlineGroups(topics, units).map((group, index) => (
          <li key={group.title} className="flex gap-3 py-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary font-semibold text-primary-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold">{group.title.replace(/^\d+[.)]\s*/, "")}</h3>
              <p className="supporting-text mt-1">
                Estimated{" "}
                {plan?.modules.find((module) => module.title === group.title)?.minutes ??
                  group.minutes}{" "}
                min
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                {group.topics.map((topic) => (
                  <li key={topic.id}>
                    {onSelect ? (
                      <button
                        className="text-left hover:text-primary hover:underline"
                        onClick={() => onSelect(topic.id)}
                      >
                        {topic.title.replace(/^\d+(?:\.\d+)*[.)]?\s+/, "")}
                      </button>
                    ) : (
                      <span>{topic.title.replace(/^\d+(?:\.\d+)*[.)]?\s+/, "")}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
      {!topics.length && (
        <p className="supporting-text">
          No teaching sections were found. Check the source extraction.
        </p>
      )}
      <p className="supporting-text text-muted-foreground">
        Times are estimates for the planned learning and practice activities. Select a lesson to
        edit its outline.
      </p>
    </section>
  );
}
