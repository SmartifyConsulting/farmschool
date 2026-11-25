import { Button } from "@/components/ui/button";
import { MATERIAL_TYPES, type MaterialType } from "@/lib/library-materials";
export function MaterialTypeFilters({
  value,
  onChange,
}: {
  value: MaterialType;
  onChange: (type: MaterialType) => void;
}) {
  return (
    <div role="group" aria-label="Filter library file types" className="mb-4 flex flex-wrap gap-2">
      {MATERIAL_TYPES.map((type) => (
        <Button
          key={type}
          size="sm"
          variant={type === value ? "default" : "outline"}
          className="text-[13px]"
          aria-pressed={type === value}
          onClick={() => onChange(type)}
        >
          {type}
        </Button>
      ))}
    </div>
  );
}
