"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  Bug,
  BookOpen,
  CalendarDays,
  Clock3,
  LayoutDashboard,
  ListTodo,
  Map,
  MessagesSquare,
  Package,
  PackageSearch,
  ReceiptText,
  Search,
  Settings,
  Umbrella,
  UserPlus,
  UserRoundCog,
  Users,
  X,
} from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";

type SearchResult = {
  id: number;
  firstName: string;
  lastName: string;
  jobTitle: string;
  department: string;
};

type MobileSession = {
  user: {
    role: string;
    employeeId: number | null;
    firstName: string;
    lastName: string;
  };
  access: { manageSettings: boolean; manageProjects: boolean };
  preview?: { state: "active" | "expired" } | null;
};

const mobileNavigation = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/employees", label: "People", icon: Users },
  { href: "/leave", label: "Leave", icon: Umbrella },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/time", label: "Time", icon: Clock3 },
  { href: "/expenses", label: "Reimbursements", icon: ReceiptText },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/knowledge", label: "Knowledge base", icon: BookOpen },
  { href: "/one-on-one", label: "One-on-one", icon: MessagesSquare },
  { href: "/company-assets", label: "Assets", icon: Package },
];

export function MobileAppMenu({
  open,
  pathname,
  query,
  results,
  session,
  progress,
  onClose,
  onQueryChange,
  onClearQuery,
  onReportBug,
  readOnlyPreview = false,
}: {
  open: boolean;
  pathname: string;
  query: string;
  results: SearchResult[];
  session: MobileSession | null;
  progress: number;
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onClearQuery: () => void;
  onReportBug: () => void;
  readOnlyPreview?: boolean;
}) {
  const { t } = useI18n();
  const visibleNavigation = readOnlyPreview
    ? mobileNavigation.filter((item) => item.href !== "/knowledge")
    : mobileNavigation;
  const menuRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!mounted || !open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const root = menuRef.current;
    const siblings = root
      ? (Array.from(document.body.children).filter(
          (element) => element !== root,
        ) as HTMLElement[])
      : [];
    const siblingState = siblings.map((element) => ({
      element,
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: (element as HTMLElement & { inert?: boolean }).inert ?? false,
    }));
    siblings.forEach((element) => {
      (element as HTMLElement & { inert?: boolean }).inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    window.requestAnimationFrame(() =>
      root?.querySelector<HTMLElement>("button[aria-label]")?.focus(),
    );
    return () => {
      document.body.style.overflow = previousOverflow;
      siblingState.forEach(({ element, ariaHidden, inert }) => {
        (element as HTMLElement & { inert?: boolean }).inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      window.requestAnimationFrame(() => previousFocusRef.current?.focus());
    };
  }, [mounted, open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="mobile-menu-backdrop"
      role="presentation"
      onPointerDown={onClose}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
          ),
        );
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <section
        className="mobile-menu-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-menu-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="mobile-menu-heading">
          <div>
            <span className="avatar small">
              {session
                ? `${session.user.firstName[0] ?? ""}${session.user.lastName[0] ?? ""}`
                : "…"}
            </span>
            <span>
              <strong id="mobile-menu-title">{t("Full menu")}</strong>
              <small>
                {session
                  ? `${session.user.firstName} ${session.user.lastName}`
                  : t("Loading…")}
              </small>
            </span>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t("Close menu")}
          >
            <X size={18} />
          </button>
        </header>

        <label className="mobile-menu-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("Search people…")}
            aria-label={t("Global search")}
          />
          {query && (
            <button
              type="button"
              onClick={onClearQuery}
              aria-label={t("Clear search")}
            >
              <X size={14} />
            </button>
          )}
        </label>

        {query.trim().length >= 2 && (
          <div className="mobile-menu-results">
            {results.map((person) => (
              <Link
                href={`/employees/${person.id}`}
                key={person.id}
                onClick={onClose}
              >
                <span className="avatar small">
                  {person.firstName[0]}
                  {person.lastName[0]}
                </span>
                <span>
                  <strong>
                    {person.firstName} {person.lastName}
                  </strong>
                  <small>
                    {person.jobTitle} · {person.department}
                  </small>
                </span>
              </Link>
            ))}
            {results.length === 0 && <p>{t("No matching people.")}</p>}
          </div>
        )}

        <div className="mobile-menu-section">
          <span className="mobile-menu-label">{t("Navigation")}</span>
          <nav className="mobile-menu-links">
            {visibleNavigation.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  className={active ? "active" : ""}
                  href={item.href}
                  key={item.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={18} />
                  <span>{t(item.label)}</span>
                </Link>
              );
            })}
            <Link
              className={pathname.startsWith("/org") ? "active" : ""}
              href="/org"
              onClick={onClose}
              aria-current={pathname.startsWith("/org") ? "page" : undefined}
            >
              <Users size={18} />
              <span>{t("Org chart")}</span>
            </Link>
            {session?.user.role === "super_admin" && (
              <Link
                className={pathname.startsWith("/roadmap") ? "active" : ""}
                href="/roadmap"
                onClick={onClose}
                aria-current={
                  pathname.startsWith("/roadmap") ? "page" : undefined
                }
              >
                <Map size={18} />
                <span>{t("Roadmap")}</span>
                <small>{progress}%</small>
              </Link>
            )}
          </nav>
        </div>

        {!readOnlyPreview && (
          <div className="mobile-menu-section">
            <span className="mobile-menu-label">{t("Quick actions")}</span>
            <div className="mobile-quick-actions">
              <Link href="/leave" onClick={onClose}>
                <Umbrella size={17} />
                <span>{t("Request leave")}</span>
              </Link>
              <Link href="/time" onClick={onClose}>
                <Clock3 size={17} />
                <span>{t("Open timesheet")}</span>
              </Link>
              <Link href="/tasks" onClick={onClose}>
                <ListTodo size={17} />
                <span>{t("New people task")}</span>
              </Link>
              <Link href="/employees" onClick={onClose}>
                <UserPlus size={17} />
                <span>{t("Add a person")}</span>
              </Link>
            </div>
          </div>
        )}

        <div className="mobile-menu-section">
          <span className="mobile-menu-label">{t("Account")}</span>
          <div className="mobile-account-links">
            {session?.user.employeeId && (
              <Link
                href={`/employees/${session.user.employeeId}`}
                onClick={onClose}
              >
                {t("My profile")}
              </Link>
            )}
            {!readOnlyPreview && (
              <Link href="/profile/settings" onClick={onClose}>
                <UserRoundCog size={17} />
                {t("Personal settings")}
              </Link>
            )}
            {session && (
              <Link href="/inventory" onClick={onClose}>
                <PackageSearch size={17} />
                {t("Office inventory")}
              </Link>
            )}
            {session?.access.manageSettings && !readOnlyPreview && (
              <>
                <Link href="/settings" onClick={onClose}>
                  <Settings size={17} />
                  {t("Admin settings")}
                </Link>
              </>
            )}
            {session?.access.manageProjects && !readOnlyPreview && (
              <Link href="/projects" onClick={onClose}>
                <Clock3 size={17} />
                {t("Time projects")}
              </Link>
            )}
            {!readOnlyPreview && (
              <>
                <button type="button" onClick={onReportBug}>
                  <Bug size={17} />
                  {t("Report a bug")}
                </button>
                <Link href="/api/auth/logout" onClick={onClose}>
                  {t("Sign out")}
                </Link>
              </>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
