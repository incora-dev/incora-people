"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
  Bug,
  CalendarDays,
  ChevronDown,
  Clock3,
  LayoutDashboard,
  ListTodo,
  MessagesSquare,
  Menu,
  Plus,
  PackageSearch,
  Search,
  Settings,
  ReceiptText,
  Umbrella,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { GlobalTimeControl } from "@/components/GlobalTimeControl";
import { BugReportDialog } from "@/components/BugReportDialog";
import { IncoraRoadGame } from "@/components/IncoraRoadGame";
import { MobileAppMenu } from "@/components/MobileAppMenu";
import { useI18n } from "@/components/LocaleProvider";
import { useDismissibleLayer } from "@/components/ui/useDismissibleLayer";
import { MVP2_PROGRESS } from "@/lib/product-progress";
import { localizeNotification } from "@/lib/notification-text";

const navigation = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/employees", label: "People", icon: Users },
  { href: "/leave", label: "Leave", icon: Umbrella },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/time", label: "Time", icon: Clock3 },
  { href: "/expenses", label: "Reimbursements", icon: ReceiptText },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/knowledge", label: "Knowledge base", icon: BookOpen },
  { href: "/one-on-one", label: "One-on-one", icon: MessagesSquare },
];

type SearchResult = {
  id: number;
  firstName: string;
  lastName: string;
  jobTitle: string;
  department: string;
};

type Notification = {
  id: number;
  title: string;
  message: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

type SessionInfo = {
  user: {
    email: string;
    role: string;
    employeeId: number | null;
    firstName: string;
    lastName: string;
    jobTitle: string;
    locale: "uk" | "en";
  };
  access: {
    viewAudit: boolean;
    manageSettings: boolean;
    manageProjects: boolean;
  };
  preview: {
    state: "active" | "expired";
    targetName: string;
    expiresAt: string;
    returnPath: string;
  } | null;
};

type PreviewBannerInfo = NonNullable<SessionInfo["preview"]>;

export function AppShell({
  children,
  initialPreview = null,
}: {
  children: React.ReactNode;
  initialPreview?: PreviewBannerInfo | null;
}) {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const isPublicInformationPage = ["/about", "/privacy", "/terms"].includes(
    pathname.replace(/\/+$/, "") || "/",
  );
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const searchLayerRef = useRef<HTMLDivElement>(null);
  const quickLayerRef = useRef<HTMLDivElement>(null);
  const notificationLayerRef = useRef<HTMLDivElement>(null);
  const userLayerRef = useRef<HTMLDivElement>(null);
  const userButtonRef = useRef<HTMLButtonElement>(null);
  const peopleLayerRef = useRef<HTMLDivElement>(null);
  const logoResetRef = useRef<number | null>(null);
  const logoClickCountRef = useRef(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(
    pathname.startsWith("/employees") || pathname.startsWith("/org"),
  );
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [userMenuPosition, setUserMenuPosition] = useState<{
    left: number;
    bottom: number;
  } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bugDialogOpen, setBugDialogOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [logoClicks, setLogoClicks] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [previewInfo, setPreviewInfo] = useState<PreviewBannerInfo | null>(
    initialPreview,
  );
  const [previewExitBusy, setPreviewExitBusy] = useState(false);
  const [previewExitError, setPreviewExitError] = useState("");

  useDismissibleLayer(searchOpen, searchLayerRef, () => setSearchOpen(false));
  useDismissibleLayer(quickOpen, quickLayerRef, () => setQuickOpen(false));
  useDismissibleLayer(notificationsOpen, notificationLayerRef, () =>
    setNotificationsOpen(false),
  );
  useDismissibleLayer(userOpen, userLayerRef, () => setUserOpen(false));
  useDismissibleLayer(peopleOpen, peopleLayerRef, () => setPeopleOpen(false));

  useEffect(() => {
    if (!userOpen) return;

    function updateMenuPosition() {
      const trigger = userButtonRef.current;
      if (!trigger) return;
      const bounds = trigger.getBoundingClientRect();
      const menuWidth = Math.min(300, Math.max(0, window.innerWidth - 24));
      setUserMenuPosition({
        left: Math.max(
          12,
          Math.min(bounds.left, window.innerWidth - menuWidth - 12),
        ),
        bottom: Math.max(12, window.innerHeight - bounds.top + 8),
      });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [userOpen]);

  useEffect(() => {
    if (isPublicInformationPage) return;

    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setQuickOpen(false);
        setNotificationsOpen(false);
        setUserOpen(false);
        setMobileMenuOpen(false);
      }
    }
    window.addEventListener("keydown", shortcut);
    fetch("/api/notifications")
      .then(
        async (response) =>
          (await response.json()) as { notifications?: Notification[] },
      )
      .then((data) => setNotifications(data.notifications ?? []))
      .catch(() => undefined);
    fetch("/api/me")
      .then(async (response) =>
        response.ok ? ((await response.json()) as SessionInfo) : null,
      )
      .then((data) => {
        if (!data) return;
        setSession(data);
        setPreviewInfo(data.preview ?? null);
        if (
          !data.preview &&
          !document.cookie
            .split("; ")
            .some((item) => item.startsWith("incora_locale=")) &&
          data.user.locale !== locale
        ) {
          return fetch("/api/preferences", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ locale: data.user.locale }),
          }).then(() => window.location.reload());
        }
      })
      .catch(() => undefined);
    return () => window.removeEventListener("keydown", shortcut);
  }, [isPublicInformationPage, locale]);

  useEffect(() => {
    if (isPublicInformationPage) return;

    const timer = window.setTimeout(() => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then(
          async (response) =>
            (await response.json()) as { results?: SearchResult[] },
        )
        .then((data) => {
          setResults(data.results ?? []);
          setSearchOpen(true);
        })
        .catch(() => setResults([]));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [isPublicInformationPage, query]);

  if (pathname === "/login" || isPublicInformationPage) return children;

  const previewMode = previewInfo?.state === "active";
  const previewExpired = previewInfo?.state === "expired";
  const visibleNavigation = previewMode
    ? navigation.filter((item) => item.href !== "/knowledge")
    : navigation;
  const unread = notifications.filter((item) => !item.readAt).length;

  async function exitPreview() {
    if (previewExitBusy) return;
    setPreviewExitBusy(true);
    setPreviewExitError("");
    try {
      const response = await fetch("/api/view-as/exit", { method: "POST" });
      const result = (await response.json()) as {
        returnPath?: string;
        error?: string;
      };
      if (!response.ok) {
        setPreviewExitError(t(result.error ?? "Could not exit preview."));
        return;
      }
      setPreviewInfo(null);
      setSession(null);
      window.location.assign(result.returnPath ?? "/employees");
    } catch {
      setPreviewExitError(t("Could not exit preview."));
    } finally {
      setPreviewExitBusy(false);
    }
  }

  if (previewExpired) {
    return (
      <div className="preview-expired-shell">
        <PreviewBanner
          info={previewInfo}
          busy={previewExitBusy}
          error={previewExitError}
          onExit={() => void exitPreview()}
          t={t}
        />
        <main className="main-content">{children}</main>
      </div>
    );
  }

  async function markNotificationRead(id: number) {
    if (previewMode) return;
    const readAt = new Date().toISOString();
    setNotifications((items) =>
      items.map((item) => (item.id === id ? { ...item, readAt } : item)),
    );
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => undefined);
  }

  async function markAllNotificationsRead() {
    if (previewMode) return;
    const readAt = new Date().toISOString();
    setNotifications((items) => items.map((item) => ({ ...item, readAt })));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => undefined);
  }

  function chargeEasterEgg() {
    if (previewMode) return;
    if (pathname !== "/") router.push("/");
    const next = logoClickCountRef.current + 1;
    logoClickCountRef.current = next;
    setLogoClicks(next);
    if (logoResetRef.current) window.clearTimeout(logoResetRef.current);
    if (next >= 10) {
      logoClickCountRef.current = 0;
      setLogoClicks(0);
      setGameOpen(true);
      return;
    }
    logoResetRef.current = window.setTimeout(() => {
      logoClickCountRef.current = 0;
      setLogoClicks(0);
    }, 5000);
  }

  return (
    <div
      className={previewMode ? "app-shell view-as-preview" : "app-shell"}
      data-preview-readonly={previewMode ? "true" : undefined}
      onClickCapture={(event) => {
        if (!previewMode) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const link = target.closest("a[href]");
        if (!(link instanceof HTMLAnchorElement)) return;
        if (
          new URL(link.href, window.location.href).origin !==
          window.location.origin
        ) {
          event.preventDefault();
        }
      }}
    >
      {previewMode && (
        <PreviewBanner
          info={previewInfo}
          busy={previewExitBusy}
          error={previewExitError}
          onExit={() => void exitPreview()}
          t={t}
        />
      )}
      <aside className="sidebar">
        <button
          type="button"
          className={`brand-lockup brand-easter-trigger ${logoClicks >= 7 ? "charged" : ""}`}
          aria-label={t("INCORA logo")}
          onClick={chargeEasterEgg}
        >
          <Image
            src="/incora-logo.png"
            alt="INCORA"
            width={120}
            height={34}
            priority
            unoptimized
          />
          <span>PEOPLE</span>
        </button>

        <nav className="main-nav" aria-label={t("Main navigation")}>
          <NavLink
            href="/"
            label={t("Home")}
            icon={LayoutDashboard}
            pathname={pathname}
          />
          <div className="nav-group" ref={peopleLayerRef}>
            <button
              type="button"
              className={
                pathname.startsWith("/employees") || pathname.startsWith("/org")
                  ? "nav-item active"
                  : "nav-item"
              }
              aria-expanded={peopleOpen}
              aria-controls="people-submenu"
              onClick={() => setPeopleOpen((open) => !open)}
            >
              <Users size={18} strokeWidth={1.8} />
              <span>{t("People")}</span>
              <ChevronDown
                className={peopleOpen ? "nav-chevron open" : "nav-chevron"}
                size={14}
              />
            </button>
            {peopleOpen && (
              <div className="nav-submenu" id="people-submenu">
                <Link
                  className={pathname.startsWith("/employees") ? "active" : ""}
                  href="/employees"
                  aria-current={
                    pathname.startsWith("/employees") ? "page" : undefined
                  }
                >
                  {t("People")}
                </Link>
                <Link
                  className={pathname.startsWith("/org") ? "active" : ""}
                  href="/org"
                  aria-current={
                    pathname.startsWith("/org") ? "page" : undefined
                  }
                >
                  {t("Org chart")}
                </Link>
              </div>
            )}
          </div>
          {visibleNavigation.slice(2).map((item) => (
            <NavLink
              {...item}
              label={t(item.label)}
              pathname={pathname}
              key={item.href}
            />
          ))}
        </nav>

        <div className="sidebar-bottom" ref={userLayerRef}>
          {session?.access.manageProjects && !previewMode && (
            <Link className="nav-item" href="/projects">
              <Clock3 size={18} strokeWidth={1.8} />
              <span>{t("Time projects")}</span>
            </Link>
          )}
          {session && (
            <Link className="nav-item" href="/inventory">
              <PackageSearch size={18} strokeWidth={1.8} />
              <span>{t("Office inventory")}</span>
            </Link>
          )}
          {session?.access.manageSettings && !previewMode && (
            <>
              <Link className="nav-item" href="/settings">
                <Settings size={18} strokeWidth={1.8} />
                <span>{t("Settings")}</span>
              </Link>
            </>
          )}
          {previewMode ? (
            <div className="sidebar-user preview-user-identity">
              <span className="avatar small">
                {session
                  ? `${session.user.firstName[0] ?? ""}${session.user.lastName[0] ?? ""}`
                  : "…"}
              </span>
              <span>
                <strong>
                  {session
                    ? `${session.user.firstName} ${session.user.lastName}`
                    : previewInfo?.targetName}
                </strong>
                <small>
                  {session
                    ? t(session.user.role.replaceAll("_", " "))
                    : t("Employee preview")}
                </small>
              </span>
            </div>
          ) : (
            <button
              ref={userButtonRef}
              type="button"
              className="sidebar-user"
              aria-expanded={userOpen}
              aria-controls="sidebar-user-menu"
              onClick={() => {
                setUserMenuPosition(null);
                setUserOpen((open) => !open);
              }}
            >
              <span className="avatar small">
                {session
                  ? `${session.user.firstName[0] ?? ""}${session.user.lastName[0] ?? ""}`
                  : "…"}
              </span>
              <span>
                <strong>
                  {session
                    ? `${session.user.firstName} ${session.user.lastName}`
                    : t("Loading…")}
                </strong>
                <small>
                  {session
                    ? t(session.user.role.replaceAll("_", " "))
                    : t("Workspace user")}
                </small>
              </span>
              <ChevronDown size={13} />
            </button>
          )}
          {!previewMode && userOpen && (
            <div
              className="dropdown-panel sidebar-user-menu"
              id="sidebar-user-menu"
              style={
                userMenuPosition ? userMenuPosition : { visibility: "hidden" }
              }
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.stopPropagation();
                setUserOpen(false);
                setUserMenuPosition(null);
                userButtonRef.current?.focus();
              }}
            >
              {session?.user.employeeId && (
                <Link
                  href={`/employees/${session.user.employeeId}`}
                  onClick={() => setUserOpen(false)}
                >
                  {t("My profile")}
                </Link>
              )}
              <Link href="/profile/settings" onClick={() => setUserOpen(false)}>
                {t("Personal settings")}
              </Link>
              {session?.access.manageSettings && (
                <Link href="/settings" onClick={() => setUserOpen(false)}>
                  {t("Admin settings")}
                </Link>
              )}
              <div className="sidebar-user-menu-divider" role="separator" />
              <Link
                href="/api/auth/logout"
                className="sidebar-user-menu-logout"
                onClick={() => setUserOpen(false)}
              >
                {t("Sign out")}
              </Link>
            </div>
          )}
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="mobile-brand">
            <button
              type="button"
              className={`mobile-brand-trigger ${logoClicks >= 7 ? "charged" : ""}`}
              aria-label={t("INCORA logo")}
              onClick={chargeEasterEgg}
            >
              <Image
                src="/incora-logo.png"
                alt="INCORA"
                width={120}
                height={34}
                unoptimized
              />
            </button>
          </div>
          <div className="global-search-wrap" ref={searchLayerRef}>
            <label className="global-search">
              <Search size={17} />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => query.length >= 2 && setSearchOpen(true)}
                placeholder={t("Search people…")}
                aria-label={t("Global search")}
              />
              {query ? (
                <button
                  onClick={() => {
                    setQuery("");
                    setSearchOpen(false);
                  }}
                  aria-label={t("Clear search")}
                >
                  <X size={14} />
                </button>
              ) : (
                <kbd>Ctrl K</kbd>
              )}
            </label>
            {searchOpen && (
              <div className="dropdown-panel search-results">
                <span className="dropdown-label">{t("People")}</span>
                {results.map((person) => (
                  <Link
                    href={`/employees/${person.id}`}
                    key={person.id}
                    onClick={() => setSearchOpen(false)}
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
          </div>
          <div className="topbar-actions">
            {!previewMode && (
              <>
                <GlobalTimeControl />
                <div className="dropdown-anchor" ref={quickLayerRef}>
                  <button
                    className="button primary-button quick-add"
                    onClick={() => setQuickOpen((open) => !open)}
                  >
                    <Plus size={16} /> {t("Add")} <ChevronDown size={13} />
                  </button>
                  {quickOpen && (
                    <div className="dropdown-panel quick-menu">
                      <Link href="/leave" onClick={() => setQuickOpen(false)}>
                        <Umbrella size={16} />
                        <span>
                          <strong>{t("Request leave")}</strong>
                          <small>{t("Vacation, sick or unpaid")}</small>
                        </span>
                      </Link>
                      <Link
                        href="/employees"
                        onClick={() => setQuickOpen(false)}
                      >
                        <UserPlus size={16} />
                        <span>
                          <strong>{t("Add a person")}</strong>
                          <small>{t("Create an employee record")}</small>
                        </span>
                      </Link>
                      <Link href="/time" onClick={() => setQuickOpen(false)}>
                        <Clock3 size={16} />
                        <span>
                          <strong>{t("Open timesheet")}</strong>
                          <small>{t("Manual entries and corrections")}</small>
                        </span>
                      </Link>
                      <Link href="/tasks" onClick={() => setQuickOpen(false)}>
                        <ListTodo size={16} />
                        <span>
                          <strong>{t("New people task")}</strong>
                          <small>{t("Onboarding or offboarding")}</small>
                        </span>
                      </Link>
                    </div>
                  )}
                </div>
                <div className="dropdown-anchor" ref={notificationLayerRef}>
                  <button
                    className="icon-button"
                    onClick={() => setNotificationsOpen((open) => !open)}
                    aria-label={t("Notifications")}
                  >
                    <Bell size={18} />
                    {unread > 0 && (
                      <span className="notification-count">{unread}</span>
                    )}
                  </button>
                  {notificationsOpen && (
                    <div className="dropdown-panel notifications-menu">
                      <div className="dropdown-heading">
                        <strong>{t("Notifications")}</strong>
                        {unread > 0 && !previewMode ? (
                          <button
                            type="button"
                            onClick={markAllNotificationsRead}
                          >
                            {t("Mark all read")}
                          </button>
                        ) : (
                          <span>
                            {previewMode
                              ? t("Read-only preview")
                              : t("All read")}
                          </span>
                        )}
                      </div>
                      {notifications.slice(0, 6).map((item) => {
                        const display = localizeNotification(item, locale);
                        return (
                          <Link
                            href={item.href}
                            key={item.id}
                            onClick={() => {
                              if (!previewMode)
                                void markNotificationRead(item.id);
                              setNotificationsOpen(false);
                            }}
                            className={item.readAt ? "" : "unread"}
                          >
                            <span>
                              <strong>{display.title}</strong>
                              <small>{display.message}</small>
                            </span>
                          </Link>
                        );
                      })}
                      {notifications.length === 0 && (
                        <p>{t("No notifications yet.")}</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
            <button
              type="button"
              className="icon-button mobile-menu-button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label={t("Open full menu")}
              aria-expanded={mobileMenuOpen}
            >
              <Menu size={19} />
            </button>
          </div>
        </header>

        <MobileAppMenu
          open={mobileMenuOpen}
          pathname={pathname}
          query={query}
          results={results}
          session={session}
          progress={MVP2_PROGRESS}
          onClose={() => setMobileMenuOpen(false)}
          onQueryChange={setQuery}
          onClearQuery={() => {
            setQuery("");
            setResults([]);
          }}
          onReportBug={() => {
            setMobileMenuOpen(false);
            setBugDialogOpen(true);
          }}
          readOnlyPreview={previewMode}
        />

        <main className="main-content">{children}</main>

        <footer className="app-footer">
          <div className="app-footer-copy">
            <strong>INCORA People</strong>
            <span>{t("Internal team workspace")}</span>
          </div>
          {!previewMode && (
            <nav className="app-footer-actions" aria-label={t("Footer links")}>
              <button type="button" onClick={() => setBugDialogOpen(true)}>
                <Bug size={16} />
                <span>{t("Report a bug")}</span>
              </button>
            </nav>
          )}
        </footer>

        <nav className="mobile-nav" aria-label={t("Mobile navigation")}>
          {visibleNavigation.slice(0, 5).map((item) => {
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
                aria-current={active ? "page" : undefined}
              >
                <Icon size={19} />
                <span>{t(item.label)}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      {!previewMode && bugDialogOpen && (
        <BugReportDialog onClose={() => setBugDialogOpen(false)} />
      )}
      {!previewMode && gameOpen && (
        <IncoraRoadGame onClose={() => setGameOpen(false)} />
      )}
    </div>
  );
}

function PreviewBanner({
  info,
  busy,
  error,
  onExit,
  t,
}: {
  info: PreviewBannerInfo | null;
  busy: boolean;
  error: string;
  onExit: () => void;
  t: (key: string) => string;
}) {
  if (!info) return null;
  const expired = info.state === "expired";
  return (
    <aside className="view-as-banner" role="status" aria-live="polite">
      <div className="view-as-banner-copy">
        <strong>
          {expired
            ? t("Employee preview expired")
            : `${t("Preview mode")}: ${info.targetName}`}
        </strong>
        <span>
          {expired
            ? t("Exit preview to return to the original administrator screen.")
            : t(
                "You are seeing INCORA People with this employee’s permissions. Changes are unavailable.",
              )}
        </span>
        {error && <small role="alert">{error}</small>}
      </div>
      <button
        type="button"
        className="button ghost-button view-as-exit"
        onClick={onExit}
        disabled={busy}
      >
        {busy ? t("Exiting preview…") : t("Exit preview")}
      </button>
    </aside>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  pathname,
}: {
  href: string;
  label: string;
  icon: typeof Users;
  pathname: string;
}) {
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      className={active ? "nav-item active" : "nav-item"}
      href={href}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={18} strokeWidth={1.8} />
      <span>{label}</span>
    </Link>
  );
}
