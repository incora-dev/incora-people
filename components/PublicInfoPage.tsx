import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./PublicInfoPage.module.css";

const pages = [
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function PublicInfoPage({
  currentPage,
  title,
  intro,
  children,
}: {
  currentPage: (typeof pages)[number]["href"];
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.siteHeader}>
          <Link
            className={styles.brand}
            href="/about"
            aria-label="INCORA People home"
          >
            <span className={styles.logoFrame}>
              <Image
                src="/incora-logo.png"
                alt="INCORA"
                width={120}
                height={34}
                unoptimized
                priority
              />
            </span>
            <span className={styles.brandName}>People</span>
          </Link>
          <nav className={styles.navigation} aria-label="Public information">
            {pages.map((page) => (
              <Link
                aria-current={currentPage === page.href ? "page" : undefined}
                className={
                  currentPage === page.href ? styles.activeLink : undefined
                }
                href={page.href}
                key={page.href}
              >
                {page.label}
              </Link>
            ))}
            <Link className={styles.signInLink} href="/login">
              Sign in
            </Link>
          </nav>
        </header>

        <main className={styles.content}>
          <div className={styles.pageHeading}>
            <span className={styles.eyebrow}>INCORA · PEOPLE</span>
            <h1>{title}</h1>
            <p>{intro}</p>
          </div>
          <div className={styles.body}>{children}</div>
        </main>

        <footer className={styles.footer}>
          <span>INCORA People · Internal employee management</span>
          <span>
            Support: <a href="mailto:info@incorainc.com">info@incorainc.com</a>
          </span>
        </footer>
      </div>
    </div>
  );
}
