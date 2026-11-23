import { getServerI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function ViewAsExpiredPage() {
  const { t } = await getServerI18n();
  return (
    <section className="panel forbidden-panel" role="status">
      <h1>{t("Employee preview expired")}</h1>
      <p>{t("Exit preview to return to the original administrator screen.")}</p>
    </section>
  );
}
