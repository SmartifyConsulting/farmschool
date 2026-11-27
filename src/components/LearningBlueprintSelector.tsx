import { LEARNING_BLUEPRINTS, learningBlueprint } from "@/lib/course-methodology";
export function LearningBlueprintSelector({
  value,
  onChange,
  allowCustom = true,
}: {
  value: string;
  onChange: (id: string) => void;
  allowCustom?: boolean;
}) {
  const selected = learningBlueprint(value);
  return (
    <section aria-label="Learning Blueprint" className="space-y-2">
      <label className="block text-sm">
        Learning Blueprint
        <select
          aria-label="Learning Blueprint"
          className="mt-1 w-full rounded-md border bg-background p-2"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {LEARNING_BLUEPRINTS.map((blueprint) => (
            <option key={blueprint.id} value={blueprint.id}>
              {blueprint.name}
            </option>
          ))}
          {allowCustom && <option value="custom">Custom / existing structure</option>}
        </select>
      </label>
      {selected && (
        <>
          <p className="supporting-text">{selected.purpose}</p>
          <ol className="list-inside list-decimal space-y-1 text-sm">
            {selected.stages.map((stage) => (
              <li key={stage}>{stage}</li>
            ))}
          </ol>
          <p className="supporting-text">Assessment plan: {selected.assessment}.</p>
          {selected.practicalEvidence && (
            <p className="supporting-text text-muted-foreground">
              This blueprint includes practical evidence. A generated activity or quiz does not
              establish observed practical competence.
            </p>
          )}
        </>
      )}
    </section>
  );
}
