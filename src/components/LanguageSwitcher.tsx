import { useState } from "react";
import { Globe, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LANGUAGES } from "@/lib/languages";
import { useLanguage } from "@/hooks/useLanguage";

export function LanguageSwitcher() {
  const [open, setOpen] = useState(false);
  const { language, setLanguageCode } = useLanguage();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Language: ${language.name}`}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25">
        <Globe className="h-5 w-5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Choose your language</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {LANGUAGES.map((l) => (
              <button key={l.code} type="button" onClick={() => { setLanguageCode(l.code); setOpen(false); }}
                className={`flex items-center justify-between gap-1 rounded-lg border px-3 py-2 text-left text-sm ${l.code === language.code ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{l.nativeName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{l.name}</span>
                </span>
                {l.code === language.code && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
