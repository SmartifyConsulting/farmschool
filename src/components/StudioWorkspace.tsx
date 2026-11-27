import { useState, type ReactNode } from "react";
import { FileText, ListTree, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useConfirm } from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/friendly-error";
import { toast } from "sonner";
import type { useStudioAutosave } from "@/hooks/useStudioAutosave";

export function StudioSaveStatus({ autosave }: { autosave: ReturnType<typeof useStudioAutosave> }) {
  const confirm = useConfirm();
  const text =
    autosave.loadError ||
    {
      loading: "Opening saved workspace…",
      saving: "Saving…",
      saved: "Working draft saved",
      offline: "Offline — saved on this device",
      conflict: "Another tab saved changes. Your copy is retained.",
      error: "Autosave needs attention. Keep a recovery copy.",
    }[autosave.status];
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-xs"
      role={autosave.status === "conflict" || autosave.status === "error" ? "alert" : "status"}
    >
      <span title={autosave.savedAt ? new Date(autosave.savedAt).toLocaleString() : undefined}>
        {text}
      </span>
      {(autosave.loadError || ["error", "offline"].includes(autosave.status)) && (
        <Button size="sm" variant="ghost" onClick={autosave.retry}>
          Retry save
        </Button>
      )}
      {["error", "offline", "conflict"].includes(autosave.status) && (
        <Button size="sm" variant="outline" onClick={autosave.downloadRecovery}>
          Download my recovery copy
        </Button>
      )}
      {autosave.status === "conflict" && (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            if (
              !(await confirm({
                title: "Load the saved cloud version?",
                description:
                  "Download your recovery copy first if you want to keep this tab's changes. The cloud version replaces only this editor's working copy.",
                confirmLabel: "Load cloud version",
              }))
            )
              return;
            try {
              await autosave.useRemote();
            } catch (error) {
              toast.error(friendlyError(error));
            }
          }}
        >
          Load cloud version
        </Button>
      )}
    </div>
  );
}

export function StudioWorkspace({
  title,
  onTitleChange,
  breadcrumb,
  steps,
  step,
  onStepChange,
  outline,
  settings,
  source,
  children,
  actions,
  footer,
  saveStatus,
  locked = false,
}: {
  title: string;
  onTitleChange: (title: string) => void;
  breadcrumb: ReactNode;
  steps: { id: string; label: string }[];
  step: string;
  onStepChange: (id: string) => void;
  outline: ReactNode;
  settings: ReactNode;
  source?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  saveStatus?: ReactNode;
  locked?: boolean;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  return (
    <section
      className="studio-workspace flex h-[calc(100dvh-80px)] min-h-0 flex-col overflow-hidden bg-card md:h-dvh"
      aria-label="Course Studio workspace"
    >
      <header className="shrink-0 space-y-2 border-b px-3 py-2 md:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav aria-label="Studio breadcrumb" className="text-xs text-muted-foreground">
            {breadcrumb}
          </nav>
          {saveStatus}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Training title"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            disabled={locked}
            maxLength={200}
            className="h-9 min-w-40 flex-1 border-transparent bg-transparent px-0 text-lg font-semibold shadow-none"
          />
          <Button
            size="sm"
            variant="outline"
            className="md:hidden"
            onClick={() => setOutlineOpen(!outlineOpen)}
          >
            <ListTree />
            Outline
          </Button>
          {source && (
            <Button
              size="sm"
              variant="outline"
              aria-pressed={sourceOpen}
              onClick={() => setSourceOpen(!sourceOpen)}
            >
              <FileText />
              Source
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
            <Settings2 />
            Settings
          </Button>
          {actions}
        </div>
        <nav aria-label="Studio workflow steps" className="flex flex-wrap gap-1">
          {steps.map((item, index) => (
            <Button
              key={item.id}
              size="sm"
              variant={step === item.id ? "secondary" : "ghost"}
              aria-current={step === item.id ? "step" : undefined}
              onClick={() => {
                onStepChange(item.id);
                setOutlineOpen(false);
              }}
            >
              {index + 1}. {item.label}
            </Button>
          ))}
        </nav>
      </header>
      <div
        className={`grid min-h-0 flex-1 grid-cols-1 ${sourceOpen ? "md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(250px,320px)]" : "md:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]"}`}
      >
        <aside
          aria-label="Studio outline panel"
          className={`${outlineOpen ? "block" : "hidden md:block"} min-h-0 overflow-y-auto overscroll-contain border-r p-3`}
        >
          {outline}
        </aside>
        <main
          aria-label="Studio editing canvas"
          className={`${outlineOpen ? "hidden md:block" : ""} min-h-0 min-w-0 overflow-y-auto overscroll-contain p-3 md:p-4`}
        >
          {children}
        </main>
        {sourceOpen && (
          <aside
            aria-label="Studio source reference"
            className="min-h-0 overflow-y-auto overscroll-contain border-l p-3 max-lg:absolute max-lg:inset-x-3 max-lg:bottom-20 max-lg:top-40 max-lg:z-20 max-lg:rounded-lg max-lg:border max-lg:bg-card max-lg:shadow-lg"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Source reference</h2>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Close source reference"
                onClick={() => setSourceOpen(false)}
              >
                <X />
              </Button>
            </div>
            {source}
          </aside>
        )}
      </div>
      {footer && <footer className="shrink-0 border-t px-3 py-2 text-sm">{footer}</footer>}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Generation Settings</SheetTitle>
          </SheetHeader>
          <div className="mt-5 space-y-5">{settings}</div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
