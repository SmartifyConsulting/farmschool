export type Language = { code: string; name: string; nativeName: string };

/** 30 supported languages, including Nigeria's three major languages (Hausa, Yoruba, Igbo) and five major Indian languages (Hindi, Bengali, Tamil, Telugu, Marathi). */
export const LANGUAGES: Language[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "af", name: "Afrikaans", nativeName: "Afrikaans" },
  { code: "zu", name: "Zulu", nativeName: "isiZulu" },
  { code: "xh", name: "Xhosa", nativeName: "isiXhosa" },
  { code: "st", name: "Sotho", nativeName: "Sesotho" },
  { code: "tn", name: "Tswana", nativeName: "Setswana" },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili" },
  { code: "ha", name: "Hausa", nativeName: "Hausa" },
  { code: "yo", name: "Yoruba", nativeName: "Yorùbá" },
  { code: "ig", name: "Igbo", nativeName: "Igbo" },
  { code: "am", name: "Amharic", nativeName: "አማርኛ" },
  { code: "so", name: "Somali", nativeName: "Soomaali" },
  { code: "sn", name: "Shona", nativeName: "chiShona" },
  { code: "mg", name: "Malagasy", nativeName: "Malagasy" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "ar", name: "Arabic", nativeName: "العربية" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు" },
  { code: "mr", name: "Marathi", nativeName: "मराठी" },
  { code: "ur", name: "Urdu", nativeName: "اردو" },
  { code: "zh", name: "Mandarin Chinese", nativeName: "中文" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "tl", name: "Filipino", nativeName: "Filipino" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
];

export const DEFAULT_LANGUAGE_CODE = "en";

const FALLBACK_LANGUAGE = LANGUAGES[0]!;

export function languageByCode(code: string): Language {
  return LANGUAGES.find((l) => l.code === code) ?? FALLBACK_LANGUAGE;
}
