import type { Metadata } from "next";
import { CompanyAssetsWorkspace } from "@/components/assets/CompanyAssetsWorkspace";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getEmployeeDirectory, getOrgUnits } from "@/lib/data";
import { buildAssetFilterOptions } from "@/modules/assets/filter-options";
import {
  canViewInactiveEmployees,
  canViewNotInvitedEmployees,
} from "@/modules/people/directory";

export const metadata: Metadata = { title: "Assets" };
export const dynamic = "force-dynamic";

export default async function CompanyAssetsPage() {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  // Same visibility rules as the people directory: filter choices never list
  // anyone the viewer could not already find on /employees.
  const [units, people] = await Promise.all([
    getOrgUnits(),
    getEmployeeDirectory({
      includeInactive: canViewInactiveEmployees(user.role),
      includeNotInvited: canViewNotInvitedEmployees(access),
    }),
  ]);
  const filterOptions = buildAssetFilterOptions(
    units,
    people.map((person) => ({
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      jobTitle: person.jobTitle,
      location: person.location,
      photoFileId: user.isPreview ? null : (person.photoFileId ?? null),
    })),
  );
  return (
    <CompanyAssetsWorkspace
      currentEmployeeId={user.employeeId ?? null}
      filterOptions={filterOptions}
    />
  );
}
