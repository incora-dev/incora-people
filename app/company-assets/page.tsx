import type { Metadata } from "next";
import { CompanyAssetsWorkspace } from "@/components/assets/CompanyAssetsWorkspace";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getEmployeeDirectory, getOrgUnits } from "@/lib/data";
import {
  buildAssetFilterOptions,
  withAssetPlaces,
} from "@/modules/assets/filter-options";
import { getAssetRegister } from "@/modules/assets/register";
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
  const [assets, units, people] = await Promise.all([
    getAssetRegister(user, access),
    getOrgUnits(),
    getEmployeeDirectory({
      includeInactive: canViewInactiveEmployees(user.role),
      includeNotInvited: canViewNotInvitedEmployees(access),
    }),
  ]);
  const filterOptions = withAssetPlaces(
    buildAssetFilterOptions(
      units,
      people.map((person) => ({
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        jobTitle: person.jobTitle,
        location: person.location,
        photoFileId: user.isPreview ? null : (person.photoFileId ?? null),
      })),
    ),
    assets,
  );
  return (
    <CompanyAssetsWorkspace
      assets={assets}
      currentEmployeeId={user.employeeId ?? null}
      filterOptions={filterOptions}
    />
  );
}
