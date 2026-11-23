import type { Metadata } from "next";
import {
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Cloud,
  FileStack,
  Flag,
  HeartHandshake,
  Layers3,
  LifeBuoy,
  LockKeyhole,
  MessageSquareHeart,
  PlugZap,
  Route,
  Sparkles,
  Target,
  Workflow,
} from "lucide-react";
import { getServerI18n } from "@/lib/i18n-server";
import {
  FULL_PRODUCT_PROGRESS,
  MVP2_PROGRESS,
  MVP_PROGRESS,
} from "@/lib/product-progress";
import { translateRoadmap } from "@/lib/roadmap-i18n";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerI18n();
  return { title: translateRoadmap(locale, "Product roadmap") };
}

const releases = [
  {
    code: "v0.3",
    name: "Foundation completion",
    progress: 100,
    status: "Complete",
    description:
      "People records, organization structure and permission foundations.",
    completed: [
      "Employee directory",
      "Profiles and employment history",
      "Teams and live org chart",
      "Roles and access matrix",
      "Protected super administrator accounts",
      "Google OAuth, protected sessions and logout",
      "Validated CSV employee import",
      "Normalized editable organization records",
    ],
    remaining: [],
  },
  {
    code: "v0.4",
    name: "Leave v1",
    progress: 100,
    status: "Complete",
    description:
      "Daily absence requests, balances, approvals and shared availability.",
    completed: [
      "Leave policies and balances",
      "Request, withdraw and approval",
      "Company calendar",
      "CSV export",
      "Configurable company holidays",
      "Guarded request state transitions and balance reconciliation",
    ],
    remaining: [],
  },
  {
    code: "v0.5",
    name: "Time Foundations",
    progress: 100,
    status: "Complete",
    description:
      "Reliable workday tracking from every page of the application.",
    completed: [
      "Global clock-in and clock-out",
      "Breaks and manual entries",
      "Schedules and corrections",
      "Monthly summary and export",
      "Team timesheets and manager scope",
      "Monthly period locking",
      "Holiday-aware expected time",
    ],
    remaining: [],
  },
  {
    code: "v0.6",
    name: "Operational Core HR",
    progress: 100,
    status: "Complete",
    description:
      "The operational layer required for a complete internal HR workspace.",
    completed: [
      "Home dashboard",
      "Pending approvals",
      "Basic notification center",
      "Notification read state",
      "Tasks and onboarding/offboarding checklists",
      "Manual JSON backup export",
      "Private employee documents",
      "Authorised file download",
      "Google-authenticated role-based access",
      "Production migration and recovery export",
      "Ukrainian-first interface with personal language preference",
      "Private bug reports, admin ticket workflow and reporter notifications",
      "Daily office or remote work status with personal defaults",
      "Superadmin audit inside workspace settings",
      "Hidden INCORA road game and company leaderboard",
    ],
    remaining: [],
  },
  {
    code: "Extra",
    name: "Reimbursements",
    progress: 100,
    status: "Complete",
    description: "Sport, health, education and other reimbursement workflows.",
    completed: [
      "Requests and approvals",
      "Annual and per-request limits",
      "Request-count policy",
      "Audit events",
      "Private receipt upload",
      "Protected receipt download",
      "Policy enforcement and scoped reviewer actions",
    ],
    remaining: [],
  },
];

const mvp2Releases = [
  {
    code: "v1.1",
    name: "People depth",
    progress: 100,
    description:
      "Deeper employee records and the directory workflows visible in the current PeopleForce workspace.",
    completed: [
      "Advanced directory filters and columns",
      "Skills, education and certificates",
      "Emergency contacts and dependants",
      "Experience and compensation history",
      "Profile photos and covers",
    ],
    remaining: [],
  },
  {
    code: "v1.2",
    name: "Home and communications",
    progress: 100,
    description:
      "Personal tasks, planned events, announcements and company links.",
    completed: [
      "Personal tasks and planned events",
      "Announcements",
      "Company links",
      "Admin-managed home content",
    ],
    remaining: [],
  },
  {
    code: "v1.3",
    name: "Time depth",
    progress: 100,
    description:
      "Weekly attendance, project time, autofill and richer company views.",
    completed: [
      "Weekly and list views",
      "Missing clock-out correction workflow",
      "Project time with admin-managed projects",
      "Explicit standard-workday autofill",
    ],
    remaining: [],
  },
  {
    code: "v1.4",
    name: "Assets and knowledge",
    progress: 100,
    description:
      "Asset inventory, document folders and the internal knowledge base.",
    completed: [
      "Asset inventory",
      "Employee allocation",
      "Internal knowledge base",
    ],
    remaining: [],
  },
];

const deliveryColumns = [
  {
    title: "Completed",
    tone: "done",
    icon: CheckCircle2,
    items: [
      "INCORA application shell and branding",
      "People directory and employee profiles",
      "Editable organization structure",
      "Leave request and approval flow",
      "Global time tracker and corrections",
      "Reimbursement policies and requests",
      "Admin settings, access policies and audit",
      "Modular backend, validated API contracts and integration tests",
      "Cloudflare alpha deployment",
      "CSV employee import and holiday-aware Leave",
      "Tasks, onboarding/offboarding and backup export",
      "Private employee documents and receipt uploads",
      "Direct Google OAuth, protected sessions and logout",
      "Four pre-provisioned super administrators",
      "MVP definition of done and production smoke checks",
    ],
  },
  {
    title: "Pilot rollout",
    tone: "active",
    icon: Clock3,
    items: [
      "Real-user acceptance feedback",
      "Full role-based E2E and visual regression suite",
    ],
  },
  {
    title: "Planned",
    tone: "planned",
    icon: CircleDashed,
    items: [
      "Automated scheduled backup and restore drills",
      "Overnight shifts, payroll and accounting export",
      "Google Chat notification delivery",
    ],
  },
];

const productModules = [
  {
    name: "People",
    icon: Layers3,
    progress: 61,
    status: "In development",
    horizon: "MVP → Core HR Pro",
    scope:
      "Employee records, organization, compensation, documents, assets and knowledge.",
  },
  {
    name: "Time",
    icon: Clock3,
    progress: 42,
    status: "In development",
    horizon: "v0.5 → Time Advanced",
    scope:
      "Attendance, timesheets, schedules, overtime, projects and payroll export.",
  },
  {
    name: "Flow",
    icon: Workflow,
    progress: 8,
    status: "Foundation only",
    horizon: "Release 2.0",
    scope:
      "Forms, approvals, conditions, reminders, workflow runs and automation.",
  },
  {
    name: "Hire",
    icon: BriefcaseBusiness,
    progress: 0,
    status: "Planned",
    horizon: "Release 3.0",
    scope:
      "Vacancies, candidates, hiring pipelines, interviews, offers and careers.",
  },
  {
    name: "Grow",
    icon: Target,
    progress: 0,
    status: "Planned",
    horizon: "Release 4.0",
    scope:
      "1:1 meetings, objectives, reviews, competencies and development plans.",
  },
  {
    name: "Voice",
    icon: MessageSquareHeart,
    progress: 0,
    status: "Planned",
    horizon: "Release 5.0",
    scope: "Engagement, eNPS, lifecycle surveys, polls and people analytics.",
  },
  {
    name: "Help",
    icon: LifeBuoy,
    progress: 0,
    status: "Planned",
    horizon: "Release 5.1",
    scope:
      "HR cases, confidential requests, whistleblowing and service workflows.",
  },
  {
    name: "Insights",
    icon: BarChart3,
    progress: 12,
    status: "Early foundation",
    horizon: "Across releases",
    scope:
      "Dashboards, custom reports, scheduled exports, audit and BI-ready data.",
  },
  {
    name: "Integrations",
    icon: PlugZap,
    progress: 8,
    status: "Foundation",
    horizon: "Release 6.0",
    scope:
      "API, webhooks, Google authentication, calendars, Google Chat, payroll and BI tools.",
  },
];

const futureReleases = [
  {
    code: "1.2",
    name: "Core HR Professional",
    scope:
      "Advanced leave, compensation, forms, documents, assets, knowledge, reports and granular access.",
  },
  {
    code: "1.3",
    name: "Time Advanced",
    scope:
      "Overtime, overnight shifts, projects, approvals, payroll codes and advanced analytics.",
  },
  {
    code: "2.0",
    name: "Flow",
    scope:
      "Versioned workflow builder with triggers, conditions, retries, templates and run history.",
  },
  {
    code: "3.0–5.1",
    name: "Hire, Grow, Voice and Help",
    scope:
      "Recruiting, performance and development, engagement surveys and confidential HR cases.",
  },
  {
    code: "6.0",
    name: "Platform maturity",
    scope:
      "Enterprise SSO, integrations, public API, localization, retention, disaster recovery and scale.",
  },
  {
    code: "7.0",
    name: "Ukrainian HR records",
    scope:
      "Orders, P-2 records, e-signatures, military records, legal archive and statutory reporting.",
  },
];

export default async function RoadmapPage() {
  const user = await getCurrentUser();
  if (user.role !== "super_admin") redirect("/");
  const { locale } = await getServerI18n();
  const r = (value: string) => translateRoadmap(locale, value);
  return (
    <>
      <section className="roadmap-hero panel">
        <div className="roadmap-hero-copy">
          <p className="eyebrow">{r("INCORA People · product delivery")}</p>
          <h1>{r("Roadmap")}</h1>
          <p>
            {r(
              "One roadmap, two views: progress toward a secure internal MVP and progress toward the complete INCORA People platform.",
            )}
          </p>
          <div
            className="roadmap-principles"
            aria-label={r("Roadmap principles")}
          >
            <span>
              <LockKeyhole size={14} /> {r("Secure before real HR data")}
            </span>
            <span>
              <Cloud size={14} /> {r("Cloud alpha before internal pilot")}
            </span>
            <span>
              <Flag size={14} /> {r("Core HR before Hire or Grow")}
            </span>
          </div>
        </div>
      </section>

      <section
        className="roadmap-completion-grid"
        aria-label={r("Product completion")}
      >
        <article
          className="roadmap-overall roadmap-mvp"
          aria-label={`${r("MVP completion")}: ${MVP_PROGRESS}%`}
        >
          <div className="roadmap-completion-label">
            <Sparkles size={15} /> {r("Part 1 · Current delivery")}
          </div>
          <span className="roadmap-overall-value">{MVP_PROGRESS}%</span>
          <strong>{r("MVP completion")}</strong>
          <small>
            {r(
              "Foundation, Core HR, Leave, Time and reimbursements required for the internal pilot.",
            )}
          </small>
          <div className="roadmap-progress-track" aria-hidden="true">
            <span style={{ width: `${MVP_PROGRESS}%` }} />
          </div>
        </article>
        <article
          className="roadmap-overall roadmap-product"
          aria-label={`${r("Complete product scope")}: ${FULL_PRODUCT_PROGRESS}%`}
        >
          <div className="roadmap-completion-label">
            <Route size={15} /> {r("Part 2 · Full platform")}
          </div>
          <span className="roadmap-overall-value">
            {FULL_PRODUCT_PROGRESS}%
          </span>
          <strong>{r("Complete product scope")}</strong>
          <small>
            {r(
              "All researched modules: People, Time, Flow, Hire, Grow, Voice, Help, Insights and integrations.",
            )}
          </small>
          <div className="roadmap-progress-track" aria-hidden="true">
            <span style={{ width: `${FULL_PRODUCT_PROGRESS}%` }} />
          </div>
        </article>
        <article
          className="roadmap-overall roadmap-mvp2"
          aria-label={`${r("MVP 2 completion")}: ${MVP2_PROGRESS}%`}
        >
          <div className="roadmap-completion-label">
            <Target size={15} /> {r("Part 2 · MVP 2")}
          </div>
          <span className="roadmap-overall-value">{MVP2_PROGRESS}%</span>
          <strong>{r("MVP 2 completion")}</strong>
          <small>
            {r("Remaining workflows captured from the supplied screenshots.")}
          </small>
          <div className="roadmap-progress-track" aria-hidden="true">
            <span style={{ width: `${MVP2_PROGRESS}%` }} />
          </div>
        </article>
      </section>

      <section
        className="roadmap-summary-grid"
        aria-label={r("Roadmap summary")}
      >
        <Summary
          icon={CheckCircle2}
          value={`${MVP_PROGRESS}%`}
          label={r("MVP readiness")}
          note={r("Current internal product")}
        />
        <Summary
          icon={Layers3}
          value={`${FULL_PRODUCT_PROGRESS}%`}
          label={r("Full platform")}
          note={r("Complete researched scope")}
        />
        <Summary
          icon={FileStack}
          value="0"
          label={r("Major MVP gaps")}
          note={r("Definition of done fulfilled")}
        />
        <Summary
          icon={Route}
          value="9"
          label={r("Product modules")}
          note={r("From People to integrations")}
        />
      </section>

      <section className="roadmap-section roadmap-part">
        <div className="roadmap-section-heading">
          <div>
            <p className="eyebrow">
              {r("Part 1 · MVP")} · {MVP_PROGRESS}%
            </p>
            <h2>{r("Path to internal v1.0")}</h2>
          </div>
          <span>{r("Updated 24 July 2026")}</span>
        </div>
        <div className="roadmap-release-grid">
          {releases.map((release) => (
            <article className="panel roadmap-release-card" key={release.name}>
              <div className="roadmap-release-topline">
                <span className="roadmap-version">{release.code}</span>
                <span
                  className={`roadmap-status ${release.progress >= 80 ? "nearly" : release.progress < 50 ? "planned" : "active"}`}
                >
                  {r(release.status)}
                </span>
              </div>
              <h3>{r(release.name)}</h3>
              <p>{r(release.description)}</p>
              <div className="roadmap-release-progress">
                <div>
                  <span>{r("Progress")}</span>
                  <strong>{release.progress}%</strong>
                </div>
                <div className="roadmap-progress-track">
                  <span style={{ width: `${release.progress}%` }} />
                </div>
              </div>
              <div className="roadmap-release-lists">
                <div>
                  <strong>{r("Delivered")}</strong>
                  {release.completed.map((item) => (
                    <span key={item}>
                      <CheckCircle2 size={13} /> {r(item)}
                    </span>
                  ))}
                </div>
                <div>
                  <strong>
                    {release.remaining.length ? r("Remaining") : r("Status")}
                  </strong>
                  {release.remaining.length ? (
                    release.remaining.map((item) => (
                      <span key={item}>
                        <CircleDashed size={13} /> {r(item)}
                      </span>
                    ))
                  ) : (
                    <span>
                      <CheckCircle2 size={13} /> {r("MVP scope complete")}
                    </span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="roadmap-section roadmap-part">
        <div className="roadmap-section-heading">
          <div>
            <p className="eyebrow">
              {r("MVP 2 · Screenshot scope")} · {MVP2_PROGRESS}%
            </p>
            <h2>{r("Closing the remaining daily workflows")}</h2>
          </div>
          <span>{r("In development")}</span>
        </div>
        <div className="roadmap-release-grid">
          {mvp2Releases.map((release) => (
            <article className="panel roadmap-release-card" key={release.code}>
              <div className="roadmap-release-topline">
                <span className="roadmap-version">{release.code}</span>
                <span
                  className={`roadmap-status ${release.progress ? "active" : "planned"}`}
                >
                  {r(release.progress ? "In development" : "Planned")}
                </span>
              </div>
              <h3>{r(release.name)}</h3>
              <p>{r(release.description)}</p>
              <div className="roadmap-release-progress">
                <div>
                  <span>{r("Progress")}</span>
                  <strong>{release.progress}%</strong>
                </div>
                <div className="roadmap-progress-track">
                  <span style={{ width: `${release.progress}%` }} />
                </div>
              </div>
              <div className="roadmap-release-lists">
                <div>
                  <strong>{r("Delivered")}</strong>
                  {release.completed.map((item) => (
                    <span key={item}>
                      <CheckCircle2 size={13} /> {r(item)}
                    </span>
                  ))}
                  {!release.completed.length && (
                    <span>
                      <CircleDashed size={13} /> {r("Not started")}
                    </span>
                  )}
                </div>
                <div>
                  <strong>{r("Remaining")}</strong>
                  {release.remaining.map((item) => (
                    <span key={item}>
                      <CircleDashed size={13} /> {r(item)}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="roadmap-section">
        <div className="roadmap-section-heading">
          <div>
            <p className="eyebrow">{r("Scope view")}</p>
            <h2>{r("Completed, active and planned")}</h2>
          </div>
        </div>
        <div className="roadmap-delivery-grid">
          {deliveryColumns.map(({ title, tone, icon: Icon, items }) => (
            <article
              className={`panel roadmap-delivery-column ${tone}`}
              key={title}
            >
              <div className="roadmap-delivery-title">
                <span>
                  <Icon size={17} />
                </span>
                <div>
                  <h3>{r(title)}</h3>
                  <small>
                    {items.length} {r("items")}
                  </small>
                </div>
              </div>
              <div className="roadmap-delivery-list">
                {items.map((item) => (
                  <span key={item}>{r(item)}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="roadmap-section roadmap-part roadmap-full-scope">
        <div className="roadmap-section-heading">
          <div>
            <p className="eyebrow">
              {r("Part 2 · Complete platform")} · {FULL_PRODUCT_PROGRESS}%
            </p>
            <h2>{r("Full product scope")}</h2>
            <p className="roadmap-section-description">
              {r(
                "The long-term scope preserved from the PeopleForce module research. Progress here includes the MVP, but is measured against the complete platform.",
              )}
            </p>
          </div>
          <span>9 {r("product modules")}</span>
        </div>
        <div className="roadmap-module-grid">
          {productModules.map(
            ({ name, icon: Icon, progress, status, horizon, scope }) => (
              <article className="panel roadmap-module-card" key={name}>
                <div className="roadmap-module-heading">
                  <span>
                    <Icon size={18} />
                  </span>
                  <div>
                    <h3>{name}</h3>
                    <small>{r(horizon)}</small>
                  </div>
                  <strong>{progress}%</strong>
                </div>
                <p>{r(scope)}</p>
                <div className="roadmap-progress-track" aria-hidden="true">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <span
                  className={
                    progress === 0
                      ? "roadmap-module-status planned"
                      : "roadmap-module-status active"
                  }
                >
                  {r(status)}
                </span>
              </article>
            ),
          )}
        </div>
      </section>

      <section className="roadmap-section">
        <div className="roadmap-section-heading">
          <div>
            <p className="eyebrow">{r("Long-term release sequence")}</p>
            <h2>{r("What follows the MVP")}</h2>
          </div>
        </div>
        <div className="panel roadmap-future-list">
          {futureReleases.map((release) => (
            <article key={release.code}>
              <span className="roadmap-version">v{release.code}</span>
              <div>
                <h3>{r(release.name)}</h3>
                <p>{r(release.scope)}</p>
              </div>
              <CircleDashed size={17} />
            </article>
          ))}
        </div>
      </section>

      <aside className="roadmap-note">
        <HeartHandshake size={18} />
        <div>
          <strong>{r("How progress is interpreted")}</strong>
          <p>
            {MVP_PROGRESS}%{" "}
            {r(
              "means the agreed internal MVP definition of done is fulfilled.",
            )}{" "}
            {FULL_PRODUCT_PROGRESS}%{" "}
            {r(
              "is an estimated weighted completion of the entire researched product scope—not feature parity with PeopleForce yet.",
            )}
          </p>
        </div>
      </aside>
    </>
  );
}

function Summary({
  icon: Icon,
  value,
  label,
  note,
}: {
  icon: typeof CheckCircle2;
  value: string;
  label: string;
  note: string;
}) {
  return (
    <article className="panel roadmap-summary-card">
      <span>
        <Icon size={19} />
      </span>
      <div>
        <strong>{value}</strong>
        <p className="roadmap-summary-label">{label}</p>
        <small>{note}</small>
      </div>
    </article>
  );
}
