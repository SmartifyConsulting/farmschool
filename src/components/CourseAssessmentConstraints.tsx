import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
export function CourseAssessmentConstraints({
  sourceFidelity,
  criteria,
  onChange,
}: {
  sourceFidelity: string;
  criteria: { criterion: string; mustPass: boolean }[];
  onChange: (value: {
    sourceFidelity: string;
    criteria: { criterion: string; mustPass: boolean }[];
  }) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        Keep word-for-word / leave out (optional)
        <Textarea
          value={sourceFidelity}
          maxLength={500}
          rows={2}
          onChange={(event) => onChange({ sourceFidelity: event.target.value, criteria })}
        />
      </label>
      <p className="text-sm font-medium">Assessment criteria (optional)</p>
      {criteria.map((item, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={`Assessment criterion ${index + 1}`}
            value={item.criterion}
            maxLength={200}
            className="min-w-40 flex-1"
            onChange={(event) =>
              onChange({
                sourceFidelity,
                criteria: criteria.map((old, i) =>
                  i === index ? { ...old, criterion: event.target.value } : old,
                ),
              })
            }
          />
          <label className="flex gap-1 text-sm">
            <input
              type="checkbox"
              checked={item.mustPass}
              onChange={(event) =>
                onChange({
                  sourceFidelity,
                  criteria: criteria.map((old, i) =>
                    i === index ? { ...old, mustPass: event.target.checked } : old,
                  ),
                })
              }
            />
            Must pass
          </label>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Remove criterion ${index + 1}`}
            onClick={() =>
              onChange({ sourceFidelity, criteria: criteria.filter((_, i) => i !== index) })
            }
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        disabled={criteria.length >= 6}
        onClick={() =>
          onChange({ sourceFidelity, criteria: [...criteria, { criterion: "", mustPass: false }] })
        }
      >
        Add criterion
      </Button>
    </div>
  );
}
