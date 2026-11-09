import { useState, type ReactNode } from "react";
import { ArrowDownToLine, Scissors, Trash2, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DraftCourse, DraftLesson } from "@/lib/course-factory";

type Props = {
  draft: DraftCourse;
  readOnly: boolean;
  busy: boolean;
  methods: { id: string; label: string; detail: string }[];
  choices: (index: number, title: string, body: string) => string[];
  approved: Record<number, boolean>;
  rationale: Record<number, string>;
  onEdit: (index: number, lesson: DraftLesson) => void;
  onSplit: (index: number, offset: number) => void;
  onMerge: (index: number) => void;
  onDelete: (index: number) => void;
  onMethods: (index: number, methods: string[]) => void;
  onApprove: (index: number, lesson: DraftLesson) => void;
  onPropose: (index: number, lesson: DraftLesson) => void;
  activity: (method: string, lesson: DraftLesson) => ReactNode;
};

export function ManualLessonReview(props: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [splitting, setSplitting] = useState<number | null>(null);
  const pageCount = new Set(props.draft.lessons.flatMap(lesson => lesson.sourceRefs.map(ref => `${ref.sourceId}:${ref.page}`))).size;
  return <section aria-label="Detected lessons" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Detected outline</h3>
      <p className="text-xs text-muted-foreground">{props.draft.lessons.length} lessons · {pageCount} source pages · {Object.values(props.approved).filter(Boolean).length} approved</p>
    </div>
    {props.draft.warnings.length > 0 && <details className="border-l-2 border-border pl-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Source notes ({props.draft.warnings.length})</summary>{props.draft.warnings.map((warning, index) => <p key={index} className="mt-2">{warning}</p>)}</details>}
    <ol className="space-y-4">
      {props.draft.lessons.map((lesson, index) => {
        const pages = lesson.sourceRefs.map(ref => ref.page);
        const selected = props.choices(index, lesson.title, lesson.body);
        const paragraphs = lesson.body.split("\n\n");
        let offset = 0;
        return <li key={index} className="min-w-0 rounded-lg border border-border bg-background p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-sm font-semibold text-secondary-foreground">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <Input aria-label={`Lesson ${index + 1} title`} value={lesson.title} maxLength={120} disabled={props.readOnly || props.busy} onChange={event => props.onEdit(index, { ...lesson, title: event.target.value })} className="font-semibold" />
              <p className="mt-2 text-xs text-muted-foreground">{pages.length ? `Source pages ${Math.min(...pages)}–${Math.max(...pages)}` : "Pasted source"}{props.approved[index] ? " · Approved" : " · Needs review"}</p>
            </div>
          </div>
          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{lesson.body.replace(/\s+/g, " ")}</p>
          <fieldset disabled={props.readOnly || props.busy} className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            {props.methods.map(method => <label key={method.id} title={method.detail} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.includes(method.id)} onChange={event => props.onMethods(index, event.target.checked ? [...selected, method.id] : selected.filter(value => value !== method.id))} />{method.label}</label>)}
          </fieldset>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button size="sm" variant="ghost" aria-expanded={expanded === index} onClick={() => setExpanded(expanded === index ? null : index)}><ChevronDown className="h-4 w-4" />Source & activities</Button>
            <Button size="sm" variant="ghost" disabled={props.readOnly || props.busy || paragraphs.length < 2} onClick={() => setSplitting(splitting === index ? null : index)}><Scissors className="h-4 w-4" />Split</Button>
            <Button size="sm" variant="ghost" disabled={props.readOnly || props.busy || index === props.draft.lessons.length - 1} onClick={() => props.onMerge(index)}><ArrowDownToLine className="h-4 w-4" />Merge next</Button>
            <Button size="icon" variant="ghost" title="Remove lesson from outline" aria-label={`Remove lesson ${index + 1}`} disabled={props.readOnly || props.busy} onClick={() => props.onDelete(index)}><Trash2 className="h-4 w-4" /></Button>
            <Button size="sm" variant={props.approved[index] ? "secondary" : "outline"} disabled={props.readOnly || props.busy || !selected.length || !lesson.title.trim()} onClick={() => props.onApprove(index, lesson)}><Check className="h-4 w-4" />{props.approved[index] ? "Reopen" : "Approve"}</Button>
          </div>
          {splitting === index && <div className="mt-4 space-y-2 border-t border-border pt-3"><h4 className="text-sm font-medium">Start the next lesson at</h4><select aria-label={`Split lesson ${index + 1} at paragraph`} defaultValue="" className="w-full rounded-md border border-input bg-background p-2 text-sm" onChange={event => { if (event.target.value) { props.onSplit(index, Number(event.target.value)); setSplitting(null); } }}><option value="">Choose a paragraph…</option>{paragraphs.map((paragraph, pi) => { const start = offset; offset += paragraph.length + 2; return pi === 0 ? null : <option key={pi} value={start}>{paragraph.slice(0, 100)}</option>; })}</select></div>}
          {expanded === index && <div className="mt-4 space-y-4 border-t border-border pt-4">
            <label className="block space-y-2 text-sm font-medium"><span>Extracted source</span><Textarea aria-label={`Lesson ${index + 1} source`} rows={10} value={lesson.body} disabled={props.readOnly || props.busy} onChange={event => props.onEdit(index, { ...lesson, body: event.target.value })} className="text-sm leading-relaxed" /></label>
            <Button size="sm" variant="outline" disabled={props.readOnly || props.busy || lesson.body.length < 100} onClick={() => props.onPropose(index, lesson)}>Suggest activities with AI</Button>
            {props.rationale[index] && <p className="text-xs text-muted-foreground">{props.rationale[index]}</p>}
            {selected.filter(method => method === "steps" || method === "scenario").map(method => <div key={method}>{props.activity(method, lesson)}</div>)}
          </div>}
        </li>;
      })}
    </ol>
  </section>;
}