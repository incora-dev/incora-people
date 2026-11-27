"use client";

import { createContext, useContext } from "react";
import type { Locale, TranslationKey } from "@/lib/i18n";

// Kept free of runtime imports from lib/i18n so editing translations during
// dev HMR does not re-create the context and orphan mounted providers.
export type LocaleContextValue = {
  locale: Locale;
  t: (key: TranslationKey | string) => string;
};

export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useI18n() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useI18n must be used within LocaleProvider.");
  return value;
}
