import type { Metadata } from "next";
import { Network, Users } from "lucide-react";
import { OrgChart } from "@/components/OrgChart";
import { getOrgPeople, getOrgUnits } from "@/lib/data";
import { getServerI18n } from "@/lib/i18n-server";
import { formatCount } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Org chart" };

export default async function OrgPage() {
  const { locale, t } = await getServerI18n();
  const [user, people, units] = await Promise.all([
    getCurrentUser(),
    getOrgPeople(),
    getOrgUnits(),
  ]);
  const visiblePeople = user.isPreview
    ? people.map((person) => ({ ...person, photoFileId: null }))
    : people;

  return (
    <>
      <section className="hero-row compact">
        <div>
          <p className="eyebrow">{t("Organization")}</p>
          <h1>{t("Org chart")}</h1>
          <p className="lede">
            {t("Reporting lines and team structure across INCORA.")}
          </p>
        </div>
        <span className="org-count">
          <Users size={16} />{" "}
          {formatCount(
            locale,
            visiblePeople.length,
            { one: "людина", few: "людини", many: "людей" },
            { one: "person", many: "people" },
          )}
        </span>
      </section>

      <section className="panel org-units-overview">
        <div>
          <p className="eyebrow">{t("Organization units")}</p>
          <h2>{t("Company structure")}</h2>
        </div>
        <div className="org-unit-chips">
          {units
            .filter((unit) => unit.type !== "company")
            .map((unit) => (
              <span className={`org-unit-chip ${unit.type}`} key={unit.id}>
                <small>{t(unit.type)}</small>
                <strong>{unit.name}</strong>
              </span>
            ))}
        </div>
      </section>

      <section className="panel org-panel">
        <div className="org-legend">
          <span>
            <Network size={16} /> {t("Manager relationships")}
          </span>
          <span>{t("Click any person to open their profile")}</span>
        </div>
        <OrgChart people={visiblePeople} />
      </section>
    </>
  );
}
