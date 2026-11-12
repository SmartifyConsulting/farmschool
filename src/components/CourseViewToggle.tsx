import { useEffect, useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";

type CourseView = "cards" | "list";

export function useCourseView(page: string, defaultView: CourseView) {
  const key = `plusticity:${page}:view`;
  const [view, setView] = useState<CourseView>(defaultView);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      setView(saved === "cards" || saved === "list" ? saved : defaultView);
    } catch {
      setView(defaultView);
    }
  }, [key, defaultView]);
  const chooseView = (next: CourseView) => {
    setView(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      return;
    }
  };
  return [view, chooseView] as const;
}

export function CourseViewToggle({ view, onChange }: {
  view: CourseView;
  onChange: (view: CourseView) => void;
}) {
  return (
    <div role="group" aria-label="Course display" className="flex shrink-0 gap-1">
      <Button type="button" size="sm" variant={view === "cards" ? "default" : "outline"}
        aria-pressed={view === "cards"} onClick={() => onChange("cards")}>
        <LayoutGrid aria-hidden="true" className="size-4" /> Cards
      </Button>
      <Button type="button" size="sm" variant={view === "list" ? "default" : "outline"}
        aria-pressed={view === "list"} onClick={() => onChange("list")}>
        <List aria-hidden="true" className="size-4" /> List
      </Button>
    </div>
  );
}
