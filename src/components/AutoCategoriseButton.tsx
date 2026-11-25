import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CATALOGUE_SECTORS } from "@/lib/catalogue-sectors";
import { suggestSector, validSector, type CategoriseItem } from "@/lib/auto-categorise";
import { applyCategory, suggestCategoriesWithAI } from "@/lib/auto-categorise.functions";
import { friendlyError } from "@/lib/friendly-error";
import { useAuth } from "@/hooks/useLearning";

type Row = CategoriseItem & { suggestion: string; include: boolean; done: boolean; error: string };
export function AutoCategoriseButton({
  mode,
  items,
  disabled = false,
  onApplied,
}: {
  mode: "courses" | "library";
  items: CategoriseItem[];
  disabled?: boolean;
  onApplied: () => void | Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [includeCategorised, setIncludeCategorised] = useState(false);
  const [message, setMessage] = useState("");
  const { user } = useAuth();
  useEffect(() => {
    setOpen(false);
    setRows([]);
    setMessage("");
  }, [user?.id]);
  const apply = useServerFn(applyCategory);
  const ai = useServerFn(suggestCategoriesWithAI);
  const eligible = rows.filter(
    (r) =>
      !r.published && (mode === "courses" || includeCategorised || r.sector === "Uncategorised"),
  );
  const chosen = eligible.filter((r) => r.include && !r.done && validSector(r.suggestion));
  const patch = (id: string, change: Partial<Row>) =>
    setRows((old) => old.map((r) => (r.id === id ? { ...r, ...change } : r)));
  const requestAI = async () => {
    const pending = eligible.filter((r) => r.include && !r.done);
    if (!pending.length || pending.length > 50) return;
    setBusy(true);
    setMessage("");
    try {
      const suggestions = await ai({ data: { mode, ids: pending.map((r) => r.id) } });
      setRows((old) =>
        old.map((r) => {
          const suggestion = suggestions.find((s) => s.id === r.id);
          return suggestion ? { ...r, suggestion: suggestion.sector ?? "", error: "" } : r;
        }),
      );
      setMessage("Suggestions are ready to review. Nothing has been applied.");
    } catch (error) {
      setMessage(
        friendlyError(error, "Could not suggest categories. You can choose them manually."),
      );
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setMessage("");
    let saved = 0;
    try {
      for (const row of chosen) {
        try {
          await apply({
            data: { mode, id: row.id, sector: row.suggestion, expectedFolder: row.folderId },
          });
          saved++;
          patch(row.id, { done: true, error: "", include: false });
        } catch (error) {
          patch(row.id, {
            error: friendlyError(error, "Could not apply this category. Refresh or retry."),
          });
        }
      }
      setMessage(
        `${saved} of ${chosen.length} applied. Originals and published courses are unchanged.`,
      );
    } finally {
      try {
        await onApplied();
      } catch {
        setMessage(
          "Categories were applied, but the list could not refresh. Reload to see the latest results.",
        );
      } finally {
        setBusy(false);
      }
    }
  };
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label="Auto-categorise"
        title="Auto-categorise"
        disabled={disabled}
        onClick={() => {
          setRows(
            items.map((item) => ({
              ...item,
              suggestion: suggestSector(item.title, item.description),
              include: !item.published,
              done: false,
              error: "",
            })),
          );
          setIncludeCategorised(false);
          setMessage("");
          setOpen(true);
        }}
      >
        <WandSparkles className="h-4 w-4" />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto">
          <DialogTitle>Auto-categorise</DialogTitle>
          <DialogDescription>
            {mode === "courses"
              ? "Review industry folders for the courses in this view. Missing folders will be created; matching folders will be reused. Only selected unpublished drafts move."
              : "Review industry tags for files in this view. These tags organise the existing yellow sector folders; custom folders and source links stay unchanged."}
          </DialogDescription>
          {mode === "library" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeCategorised}
                disabled={busy}
                onChange={(e) => setIncludeCategorised(e.target.checked)}
              />
              Include files already categorised
            </label>
          )}
          <p className="text-sm text-muted-foreground">
            {eligible.length} eligible {eligible.length === 1 ? "item" : "items"}.{" "}
            {mode === "courses" && `${rows.filter((r) => r.published).length} published courses skipped. `}
            Local suggestions are ready; unclear subjects need your choice.
          </p>
          <fieldset disabled={busy} className="min-w-0 space-y-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => void requestAI()}
              disabled={
                !eligible.some((r) => r.include && !r.done) ||
                eligible.filter((r) => r.include && !r.done).length > 50
              }
            >
              Suggest with AI
            </Button>
            <p className="text-sm text-muted-foreground">
              AI runs only on request, for up to 50 checked items per request, using your existing
              AI allowance. You can review local suggestions or choose categories manually.
            </p>
            <div className="space-y-2">
              {eligible.map((row) => (
                <div key={row.id} className="min-w-0 rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        aria-label={`Categorise ${row.title}`}
                        checked={row.include}
                        disabled={row.done}
                        onChange={(e) => patch(row.id, { include: e.target.checked })}
                      />
                      <span className="break-words">{row.title}</span>
                    </label>
                    <select
                      aria-label={`Industry for ${row.title}`}
                      value={row.suggestion}
                      disabled={row.done}
                      className="w-full max-w-sm rounded-md border bg-background p-2 text-sm"
                      onChange={(e) => patch(row.id, { suggestion: e.target.value, error: "" })}
                    >
                      <option value="">Needs review — choose industry</option>
                      {CATALOGUE_SECTORS.filter((s) => s !== "Uncategorised").map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  {row.done && <p className="mt-1 text-sm text-primary">Applied</p>}
                  {row.error && (
                    <p role="alert" className="mt-1 text-sm text-destructive">
                      {row.error}
                    </p>
                  )}
                </div>
              ))}
              {!eligible.length && (
                <p className="text-sm">
                  No eligible items in this view. Upload material, open a folder containing drafts,
                  or widen your filters.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!chosen.length} onClick={() => void save()}>
                Apply {chosen.length} reviewed {chosen.length === 1 ? "category" : "categories"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </fieldset>
          {busy && (
            <p role="status" className="text-sm">
              Working…
            </p>
          )}
          {message && (
            <p role="status" className="text-sm">
              {message}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
