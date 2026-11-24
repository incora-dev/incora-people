import type { Metadata } from "next";
import {
  getEmployeeDirectory,
  getOrgUnits,
  getReferenceValues,
} from "@/lib/data";
import { EmployeeDirectory } from "@/components/EmployeeDirectory";
import {
  getAccessPolicy,
  getCurrentUser,
  hasOrganizationScope,
} from "@/lib/auth";
import { getServerI18n } from "@/lib/i18n-server";
import { getEmployeeDefaults } from "@/modules/settings/system";
import { getDateContext } from "@/modules/shared/date";
import {
  canViewInactiveEmployees,
  canViewNotInvitedEmployees,
} from "@/modules/people/directory";

export const metadata: Metadata = { title: "People" };

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const { t } = await getServerI18n();
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  const canViewInactive = canViewInactiveEmployees(user.role);
  const canViewNotInvited = canViewNotInvitedEmployees(access);
  const employees = await getEmployeeDirectory({
    includeInactive: canViewInactive,
    includeNotInvited: canViewNotInvited,
  });
  const directoryEmployees = employees.map((employee) => ({
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    jobTitle: employee.jobTitle,
    employmentType: employee.employmentType,
    level: employee.level,
    department: employee.department,
    division: employee.division,
    team: employee.team,
    location: employee.location,
    managerName: employee.managerName,
    startDate: employee.startDate,
    workMode: employee.workMode,
    status: employee.status,
    probationEnd: employee.probationEnd,
    lifecycleStatus: employee.lifecycleStatus,
    managerId: employee.managerId,
    technologies: employee.technologies,
    lastWorkingDay: canViewInactive ? employee.lastWorkingDay : null,
    photoFileId: user.isPreview ? null : employee.photoFileId,
  }));
  const { today } = getDateContext();
  const [orgUnits, referenceValues, defaults] = access.managePeople
    ? await Promise.all([
        getOrgUnits(),
        getReferenceValues(),
        getEmployeeDefaults(),
      ])
    : [[], [], null];

  return (
    <>
      <section className="hero-row compact">
        <div>
          <p className="eyebrow">{t("Core HR")}</p>
          <h1>{t("People")}</h1>
          <p className="lede">
            {t("One reliable directory for every person at INCORA.")}
          </p>
        </div>
      </section>
      {user.role === "super_admin" &&
        !user.isPreview &&
        (await searchParams).notice === "employee-deleted" && (
          <p className="settings-toast" role="status">
            {t("Employee permanently deleted.")}
          </p>
        )}
      <EmployeeDirectory
        employees={directoryEmployees}
        canViewInactive={canViewInactive}
        canViewNotInvited={canViewNotInvited}
        canCreate={access.managePeople && !user.isPreview}
        canExport={hasOrganizationScope(user) && !user.isPreview}
        orgUnits={orgUnits}
        referenceValues={referenceValues}
        probationMonths={defaults?.probationMonths ?? 3}
        today={today}
      />
    </>
  );
}
