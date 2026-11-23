import type { Metadata } from "next";
import { PublicInfoPage } from "@/components/PublicInfoPage";
import styles from "@/components/PublicInfoPage.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy information for the INCORA People employee platform.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <PublicInfoPage
      currentPage="/privacy"
      title="Privacy Policy"
      intro="Last updated: 18 November 2026. This notice describes how the INCORA People application processes information."
    >
      <section className={styles.section}>
        <h2>Who operates the service</h2>
        <p>
          INCORA People is an internal employee-management service provided for
          INCORA. For privacy questions or requests about information in the
          service, contact{" "}
          <a href="mailto:info@incorainc.com">info@incorainc.com</a>. The
          specific registered legal entity responsible for this processing has
          not been identified in the application configuration and should be
          confirmed by INCORA.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Information processed</h2>
        <p>
          INCORA administrators maintain employee and account information used
          by the service. Depending on a person’s role and records, this can
          include name, work and personal contact details, date of birth,
          address, job and organization details, employment dates and status,
          emergency contacts or dependants, tax or passport details where
          maintained, leave and time records, compensation or reimbursement
          records, documents, assigned assets, tasks, and 1:1 meeting notes. The
          application also records account roles, access and audit events,
          notification preferences, and session metadata. Some employee records
          may be sensitive and are available only through role- and
          permission-based application access.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Google Sign-In</h2>
        <p>
          The sign-in flow requests the OpenID Connect scopes{" "}
          <code>openid</code>, <code>email</code>, and <code>profile</code>. The
          application validates Google’s identity token and uses the verified
          email address and stable Google account subject to match an account
          already provisioned by INCORA. Google may return basic profile claims
          under the requested <code>profile</code> scope; the application does
          not use a Google profile name or photo to populate the employee
          profile. It does not call Google APIs for Gmail, Drive, Calendar, or
          other Google content. It stores the account link and application
          session data needed to admit and authorize the user; it does not use
          Google Sign-In to create an employee account.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Use and access</h2>
        <p>
          Information is used to authenticate users, operate internal HR and
          employee workflows, provide notifications requested by those
          workflows, and maintain security and audit records. Access is assigned
          by INCORA administrators and enforced by server-side permissions. Some
          information is available to the employee concerned, while sensitive
          records are limited to authorized HR, administrators, or managers
          where the application’s access rules permit it.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Service providers and sharing</h2>
        <p>
          The application runs on Cloudflare Workers and stores structured
          application data in Cloudflare D1 and private files in Cloudflare R2.
          Google provides account authentication. Resend is used for configured
          transactional and announcement email. Google Chat can receive
          configured company-announcement notifications, and Expo’s push service
          is used for mobile push notifications. These providers receive only
          the information needed for the corresponding service. INCORA’s
          specific data-region configuration has not been verified for this
          notice; no residency guarantee is made here.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Security</h2>
        <p>
          The application checks Google identity and provisioned account status,
          applies server-side role and access rules, and uses secure, HTTP-only
          session cookies for web sign-in. Private employee files are served
          through authorized application routes. These are application controls,
          not a claim of a particular certification or a guarantee about a
          provider’s infrastructure.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Retention and requests</h2>
        <p>
          Web sign-in sessions expire after eight hours, and expired
          authentication artifacts are periodically cleaned up. The application
          does not define one automatic retention period for employee HR
          records. Eligible erroneous test profiles can be permanently removed;
          significant HR or business history is protected from that deletion
          workflow. The applicable organization-wide HR retention schedule has
          not been verified for this notice. To request access to, correction
          of, or review of information about you, contact{" "}
          <a href="mailto:info@incorainc.com">info@incorainc.com</a>. Requests
          are reviewed by INCORA; removal may be limited where records must be
          retained for operational or legal reasons.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Questions</h2>
        <p>
          Contact <a href="mailto:info@incorainc.com">info@incorainc.com</a> for
          questions about this notice or the use of INCORA People.
        </p>
      </section>
    </PublicInfoPage>
  );
}
