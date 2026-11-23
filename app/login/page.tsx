import Image from "next/image";
import Link from "next/link";
import { getServerI18n } from "@/lib/i18n-server";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { t } = await getServerI18n();
  const params = await searchParams;
  const destination =
    params.next?.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/";
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-logo-frame">
          <Image
            src="/incora-logo.png"
            alt="INCORA"
            width={170}
            height={48}
            priority
            unoptimized
          />
        </div>
        <p className="eyebrow">INCORA People</p>
        <h1>{t("Sign in to your workspace")}</h1>
        <p>
          {t(
            "Use any Google account. Workspace permissions are assigned separately by INCORA administrators.",
          )}
        </p>
        {params.error && (
          <p className="login-error">
            {t("Google sign-in could not be completed. Please try again.")}
          </p>
        )}
        <Link
          className="button primary-button google-login-button"
          href={`/api/auth/google?returnTo=${encodeURIComponent(destination)}`}
        >
          {t("Continue with Google")}
        </Link>
      </section>
    </main>
  );
}
