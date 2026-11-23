"use client";

import { createContext, useContext, useMemo } from "react";
import { type Locale, type TranslationKey, translate } from "@/lib/i18n";

type LocaleContextValue = {
  locale: Locale;
  t: (key: TranslationKey | string) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({
      locale,
      t: (key: TranslationKey | string) => translate(locale, key),
    }),
    [locale],
  );
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useI18n() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useI18n must be used within LocaleProvider.");
  return value;
}
