import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({ value, onChange, id, autoComplete }: { value: string; onChange: (v: string) => void; id: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={show ? "text" : "password"} required minLength={6} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border px-3 py-2.5 pr-10 text-sm outline-none focus:border-primary" />
      <button type="button" tabIndex={-1} onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export const inputCls = "w-full rounded-xl border border-border px-3 py-2.5 text-sm outline-none focus:border-primary";
