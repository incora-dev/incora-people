import { eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { companyAssets, employees } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import {
  createAssetSchema,
  updateAssetSchema,
} from "@/modules/assets/contracts";
import { parseJsonRequest } from "@/modules/shared/http";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.managePeople)
    return Response.json(
      { error: "People administration access required." },
      { status: 403 },
    );
  const parsed = await parseJsonRequest(request, createAssetSchema);
  if (!parsed.ok) return parsed.response;
  const assignedEmployeeId = parsed.data.assignedEmployeeId || null;
  if (assignedEmployeeId && !(await isActiveEmployee(assignedEmployeeId))) {
    return Response.json(
      { error: "Assets may be assigned to active employees only." },
      { status: 400 },
    );
  }
  const status = assignedEmployeeId ? "assigned" : "available";
  const now = new Date().toISOString();
  const d1 = getD1();
  await d1.batch([
    d1
      .prepare(
        "INSERT INTO company_assets (name, asset_tag, category, status, assigned_employee_id, serial_number, note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        parsed.data.name,
        parsed.data.assetTag,
        parsed.data.category,
        status,
        assignedEmployeeId,
        parsed.data.serialNumber,
        parsed.data.note,
        now,
      ),
    d1
      .prepare(
        "INSERT INTO asset_events (asset_id, event_type, next_employee_id, next_status, actor_email) SELECT id, 'created', ?, ?, ? FROM company_assets WHERE asset_tag = ?",
      )
      .bind(assignedEmployeeId, status, user.email, parsed.data.assetTag),
    d1
      .prepare(
        "INSERT INTO audit_events (actor_email, action, entity_type, entity_id, details) SELECT ?, 'asset.created', 'company_asset', CAST(id AS TEXT), ? FROM company_assets WHERE asset_tag = ?",
      )
      .bind(
        user.email,
        `${parsed.data.assetTag}: ${parsed.data.name}`,
        parsed.data.assetTag,
      ),
  ]);
  const [asset] = await getDb()
    .select()
    .from(companyAssets)
    .where(eq(companyAssets.assetTag, parsed.data.assetTag))
    .limit(1);
  if (!asset) throw new Error("Asset creation did not return a record.");
  return Response.json({ asset }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.managePeople)
    return Response.json(
      { error: "People administration access required." },
      { status: 403 },
    );
  const parsed = updateAssetSchema.safeParse(await request.json());
  if (!parsed.success)
    return Response.json(
      { error: "Check the submitted fields." },
      { status: 400 },
    );
  const body = parsed.data;
  const assignedEmployeeId = body.assignedEmployeeId || null;
  if ((body.status === "assigned") !== Boolean(assignedEmployeeId)) {
    return Response.json(
      {
        error:
          "An assigned asset must have an assignee; other statuses must be unassigned.",
      },
      { status: 400 },
    );
  }
  if (assignedEmployeeId && !(await isActiveEmployee(assignedEmployeeId))) {
    return Response.json(
      { error: "Assets may be assigned to active employees only." },
      { status: 400 },
    );
  }
  const [previous] = await getDb()
    .select()
    .from(companyAssets)
    .where(eq(companyAssets.id, body.id))
    .limit(1);
  if (!previous)
    return Response.json({ error: "Asset not found." }, { status: 404 });
  const eventType =
    previous.assignedEmployeeId !== assignedEmployeeId
      ? assignedEmployeeId
        ? "assigned"
        : "returned"
      : "status_changed";
  const now = new Date().toISOString();
  const d1 = getD1();
  const [updateResult] = await d1.batch([
    d1
      .prepare(
        "UPDATE company_assets SET status = ?, assigned_employee_id = ?, updated_at = ? WHERE id = ?",
      )
      .bind(body.status, assignedEmployeeId, now, body.id),
    d1
      .prepare(
        "INSERT INTO asset_events (asset_id, event_type, previous_employee_id, next_employee_id, previous_status, next_status, note, actor_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        body.id,
        eventType,
        previous.assignedEmployeeId,
        assignedEmployeeId,
        previous.status,
        body.status,
        body.note,
        user.email,
      ),
    d1
      .prepare(
        "INSERT INTO audit_events (actor_email, action, entity_type, entity_id, details) VALUES (?, 'asset.updated', 'company_asset', ?, ?)",
      )
      .bind(
        user.email,
        String(body.id),
        `${previous.assetTag}: ${body.status}`,
      ),
  ]);
  if (updateResult.meta.changes !== 1) {
    return Response.json({ error: "Asset not found." }, { status: 404 });
  }
  const [asset] = await getDb()
    .select()
    .from(companyAssets)
    .where(eq(companyAssets.id, body.id))
    .limit(1);
  if (!asset) throw new Error("Asset update did not return a record.");
  return Response.json({ asset });
}

async function isActiveEmployee(employeeId: number) {
  const [employee] = await getDb()
    .select({ status: employees.status })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  return employee?.status === "active";
}
