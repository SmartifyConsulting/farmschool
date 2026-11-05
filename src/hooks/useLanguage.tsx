import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";
import { DEFAULT_LANGUAGE_CODE, languageByCode, type Language } from "@/lib/languages";

const STORAGE_KEY = "farmschool:language";

type LanguageContextValue = { language: Language; setLanguageCode: (code: string) => void };
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [code, setCode] = useState(DEFAULT_LANGUAGE_CODE);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setCode(saved);
    } catch { /* storage may be disabled; default language applies */ }
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void supabase.from("profiles").select("preferred_language").maybeSingle().then(({ data, error }) => {
      if (!active || error) return;
      const preferred = (data as { preferred_language?: string } | null)?.preferred_language;
      if (preferred) setCode(preferred);
    });
    return () => { active = false; };
  }, [user]);

  const setLanguageCode = (next: string) => {
    setCode(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    if (user) void supabase.from("profiles").upsert({ user_id: user.id, preferred_language: next } as never);
  };

  return <LanguageContext.Provider value={{ language: languageByCode(code), setLanguageCode }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
