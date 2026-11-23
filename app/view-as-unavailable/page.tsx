import { getServerI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function ViewAsUnavailablePage() {
  const { t } = await getServerI18n();
  return (
    <section className="panel forbidden-panel" role="status">
      <h1>{t("This screen is unavailable in employee preview")}</h1>
      <p>
        {t(
          "This area has not been verified for employee-scoped, read-only access. No administrator data was loaded.",
        )}
      </p>
    </section>
  );
}
