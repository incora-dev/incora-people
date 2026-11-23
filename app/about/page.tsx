import type { Metadata } from "next";
import Link from "next/link";
import { PublicInfoPage } from "@/components/PublicInfoPage";
import styles from "@/components/PublicInfoPage.module.css";

export const metadata: Metadata = {
  title: { absolute: "INCORA People" },
  description:
    "INCORA People is an internal employee management platform for authorized INCORA employees and administrators.",
  alternates: { canonical: "/about" },
  robots: { index: true, follow: true },
};

export default function AboutPage() {
  return (
    <PublicInfoPage
      currentPage="/about"
      title="INCORA People"
      intro="An internal employee management platform used by authorized INCORA employees and administrators."
    >
      <section className={styles.section}>
        <h2>About the application</h2>
        <p>
          INCORA People brings employee information and people operations into
          one workspace. Depending on their assigned permissions, employees and
          administrators use it for employee profiles, company announcements,
          leave, time tracking, tasks, documents, assets, inventory, and related
          HR workflows.
        </p>
      </section>
      <section className={`${styles.section} ${styles.callout}`}>
        <h2>Sign in with Google</h2>
        <p>
          Google Sign-In verifies an existing, INCORA-provisioned account. A
          Google account alone does not create access to the employee platform.
        </p>
      </section>
      <Link className={styles.primaryAction} href="/login">
        Sign in to INCORA People
      </Link>
      <p>
        Need help? Contact{" "}
        <a href="mailto:info@incorainc.com">info@incorainc.com</a>.
      </p>
    </PublicInfoPage>
  );
}
