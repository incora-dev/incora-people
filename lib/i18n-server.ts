import { cookies } from "next/headers";
import {
  LOCALE_COOKIE,
  normalizeLocale,
  translate,
  type TranslationKey,
} from "@/lib/i18n";

export async function getServerI18n() {
  const locale = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return {
    locale,
    t: (key: TranslationKey | string) => translate(locale, key),
  };
}
