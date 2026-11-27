"use client";

import { useMemo } from "react";
import { type Locale, type TranslationKey, translate } from "@/lib/i18n";
import { LocaleContext } from "@/components/LocaleContext";

export { useI18n } from "@/components/LocaleContext";

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
