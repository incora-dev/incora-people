import { asc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { assetEvents, companyAssets, employees } from "@/db/schema";
import type { AccessPolicy, CurrentUser } from "@/lib/auth";

export async function getAssetsWorkspaceData(
  user: CurrentUser,
  access: AccessPolicy,
) {
  const db = getDb();
  const canManage = access.managePeople;
  const scope = canManage
    ? undefined
    : user.role === "manager"
      ? or(
          eq(companyAssets.assignedEmployeeId, user.employeeId ?? -1),
          eq(employees.managerId, user.employeeId ?? -1),
        )
      : eq(companyAssets.assignedEmployeeId, user.employeeId ?? -1);
  const [assets, people] = await Promise.all([
    db
      .select({
        id: companyAssets.id,
        name: companyAssets.name,
        assetTag: companyAssets.assetTag,
        category: companyAssets.category,
        status: companyAssets.status,
        assignedEmployeeId: companyAssets.assignedEmployeeId,
        assigneeFirstName: employees.firstName,
        assigneeLastName: employees.lastName,
        serialNumber: companyAssets.serialNumber,
        note: companyAssets.note,
      })
      .from(companyAssets)
      .leftJoin(employees, eq(companyAssets.assignedEmployeeId, employees.id))
      .where(scope)
      .orderBy(asc(companyAssets.status), asc(companyAssets.name)),
    canManage
      ? db
          .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
          })
          .from(employees)
          // Newcomers can receive equipment before their invitation is sent;
          // see isActiveEmployee in app/api/assets/route.ts.
          .where(eq(employees.status, "active"))
          .orderBy(asc(employees.firstName), asc(employees.lastName))
      : Promise.resolve([]),
  ]);
  const assetIds = assets.map((asset) => asset.id);
  const events = assetIds.length
    ? await db
        .select({
          assetId: assetEvents.assetId,
          eventType: assetEvents.eventType,
          createdAt: assetEvents.createdAt,
        })
        .from(assetEvents)
        .where(inArray(assetEvents.assetId, assetIds))
        .orderBy(asc(assetEvents.assetId), asc(assetEvents.createdAt))
    : [];
  return {
    assets: assets.map((asset) => ({
      ...asset,
      serialNumber: canManage ? asset.serialNumber : "",
      note: canManage ? asset.note : "",
      latestEvent:
        events.filter((event) => event.assetId === asset.id).at(-1) ?? null,
    })),
    people,
  };
}

export async function getEmployeeAssets(
  employeeId: number,
  includePrivateDetails: boolean,
) {
  const db = getDb();
  const assets = await db
    .select({
      id: companyAssets.id,
      name: companyAssets.name,
      assetTag: companyAssets.assetTag,
      category: companyAssets.category,
      status: companyAssets.status,
      serialNumber: companyAssets.serialNumber,
      note: companyAssets.note,
      updatedAt: companyAssets.updatedAt,
    })
    .from(companyAssets)
    .where(eq(companyAssets.assignedEmployeeId, employeeId))
    .orderBy(asc(companyAssets.name));
  const ids = assets.map((asset) => asset.id);
  const events = ids.length
    ? await db
        .select({
          assetId: assetEvents.assetId,
          eventType: assetEvents.eventType,
          createdAt: assetEvents.createdAt,
        })
        .from(assetEvents)
        .where(inArray(assetEvents.assetId, ids))
        .orderBy(asc(assetEvents.assetId), asc(assetEvents.createdAt))
    : [];
  return assets.map((asset) => ({
    ...asset,
    serialNumber: includePrivateDetails ? asset.serialNumber : "",
    note: includePrivateDetails ? asset.note : "",
    latestEvent:
      events.filter((event) => event.assetId === asset.id).at(-1) ?? null,
  }));
}
