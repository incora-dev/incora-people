import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { LocaleProvider } from "@/components/LocaleProvider";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import { MVP_PROGRESS } from "@/lib/product-progress";

// One typeface for the whole app: Inter covers both Latin and Cyrillic, so
// Ukrainian and English text render with the same font.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(
    host ? `${protocol}://${host}` : "http://localhost:3000",
  );
  const description =
    "Internal people operations workspace and product roadmap for INCORA.";

  return {
    metadataBase,
    title: {
      default: "INCORA People",
      template: "%s · INCORA People",
    },
    description,
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
      shortcut: "/favicon.svg",
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    },
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "INCORA People",
    },
    openGraph: {
      title: "INCORA People",
      description,
      type: "website",
      images: [
        {
          url: new URL("/og.png", metadataBase).toString(),
          width: 1536,
          height: 1024,
          alt: `INCORA People MVP — ${MVP_PROGRESS}% complete`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "INCORA People",
      description,
      images: [new URL("/og.png", metadataBase).toString()],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const requestHeaders = await headers();
  const previewState = requestHeaders.get("x-incora-view-as-state");
  const initialPreview: {
    state: "active" | "expired";
    targetName: string;
    expiresAt: string;
    returnPath: string;
  } | null =
    previewState === "active" || previewState === "expired"
      ? {
          state: previewState,
          targetName: decodeHeaderValue(
            requestHeaders.get("x-incora-view-as-target"),
          ),
          expiresAt: requestHeaders.get("x-incora-view-as-expires") ?? "",
          returnPath:
            requestHeaders.get("x-incora-view-as-return") ?? "/employees",
        }
      : null;
  return (
    <html lang={locale}>
      <body className={inter.variable}>
        <LocaleProvider locale={locale}>
          <AppShell initialPreview={initialPreview}>{children}</AppShell>
        </LocaleProvider>
      </body>
    </html>
  );
}

function decodeHeaderValue(value: string | null) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}
