import type { Metadata } from "next";
import { PublicInfoPage } from "@/components/PublicInfoPage";
import styles from "@/components/PublicInfoPage.module.css";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms for authorized use of the INCORA People platform.",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <PublicInfoPage
      currentPage="/terms"
      title="Terms of Service"
      intro="Last updated: 18 November 2026. These terms describe the expected use of INCORA People, an internal INCORA employee platform."
    >
      <section className={styles.section}>
        <h2>Authorized access</h2>
        <p>
          INCORA People is for employees and administrators whose accounts have
          been provisioned and enabled by INCORA. Sign in with the Google
          account linked to your provisioned account. A Google account by itself
          does not authorize access. INCORA administrators assign and may change
          application roles and permissions.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Responsible use</h2>
        <p>
          Use the service for authorized INCORA work and only access or handle
          information permitted by your role. Keep access to your Google account
          secure, sign out on shared devices, and promptly report suspected
          unauthorized access. Do not attempt to bypass access controls, misuse
          another person’s account, or disclose employee information outside
          authorized work.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Administration and availability</h2>
        <p>
          INCORA administrators manage accounts, permissions, and employee
          records through the application. The service may be changed or
          unavailable during maintenance or operational interruptions. These
          pages do not replace official employment documents or INCORA’s
          internal policies.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Information and contact</h2>
        <p>
          Information in INCORA People is handled as described in the{" "}
          <a href="/privacy">Privacy Policy</a>. For access, support, or terms
          questions, contact{" "}
          <a href="mailto:info@incorainc.com">info@incorainc.com</a>.
        </p>
      </section>
    </PublicInfoPage>
  );
}
