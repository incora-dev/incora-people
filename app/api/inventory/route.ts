import { getD1 } from "@/db";
import {
  getAccessPolicy,
  getCurrentUser,
  hasRecentAuthentication,
  recentAuthenticationResponse,
} from "@/lib/auth";
import { getOfficeInventory } from "@/modules/inventory/queries";
import { canManageInventory } from "@/modules/inventory/domain";
import {
  inventoryCommandSchema,
  type InventoryCommand,
} from "@/modules/inventory/contracts";
import { parseJsonRequest } from "@/modules/shared/http";

type ResultRow = Record<string, string | number | null>;

async function first<T extends ResultRow>(sql: string, ...values: unknown[]) {
  return getD1()
    .prepare(sql)
    .bind(...values)
    .first<T>();
}

function errorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Inventory operation failed.";
  if (/unique constraint failed/i.test(message)) {
    return Response.json(
      { error: "A record with this name or code already exists." },
      { status: 409 },
    );
  }
  if (
    /stale|insufficient|missing|finalized|draft|already exists|invalid/i.test(
      message,
    )
  ) {
    return Response.json(
      { error: message.replace(/^D1_ERROR: /, "") },
      { status: 409 },
    );
  }
  return Response.json(
    { error: "Could not complete the inventory operation." },
    { status: 400 },
  );
}

export async function GET(request: Request) {
  await getCurrentUser();
  const url = new URL(request.url);
  const type = url.searchParams.get("historyType");
  const rawId = url.searchParams.get("historyId");
  const rawLocationId = url.searchParams.get("historyLocationId");
  let historyScope:
    | { type: "category" | "group" | "item"; id: number; locationId?: number }
    | undefined;
  if (type !== null || rawId !== null || rawLocationId !== null) {
    const id = Number(rawId);
    const locationId =
      rawLocationId === null ? undefined : Number(rawLocationId);
    if (
      !(type === "category" || type === "group" || type === "item") ||
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      (locationId !== undefined &&
        (!Number.isSafeInteger(locationId) || locationId <= 0))
    )
      return Response.json(
        { error: "Invalid inventory history scope." },
        { status: 400 },
      );
    historyScope = { type, id, ...(locationId ? { locationId } : {}) };
  }
  return Response.json(await getOfficeInventory(true, historyScope), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!canManageInventory(user.role, access.manageInventory)) {
    return Response.json(
      { error: "Inventory is read-only for this account." },
      { status: 403 },
    );
  }
  const parsed = await parseJsonRequest(request, inventoryCommandSchema);
  if (!parsed.ok) return parsed.response;
  const command = parsed.data;
  if (command.action === "history.correct" && user.role !== "super_admin") {
    return Response.json(
      { error: "Only a Super Admin may correct inventory history." },
      { status: 403 },
    );
  }
  if (command.action === "history.correct" && !hasRecentAuthentication(user)) {
    return recentAuthenticationResponse("/inventory");
  }
  try {
    await executeCommand(command, user.email);
    return Response.json(
      { ok: true },
      { status: command.action.endsWith(".save") ? 200 : 201 },
    );
  } catch (error) {
    if (command.action === "stock.move") {
      const prior = await first<{
        operationType: string;
        itemId: number;
        sourceLocationId: number;
        destinationLocationId: number | null;
        quantityDelta: number;
      }>(
        "SELECT operation_type AS operationType, item_id AS itemId, source_location_id AS sourceLocationId, destination_location_id AS destinationLocationId, quantity_delta AS quantityDelta FROM inventory_operations WHERE request_id = ?",
        command.requestId,
      );
      const expectedDelta =
        command.operationType === "decrease"
          ? -command.quantity
          : command.quantity;
      if (
        prior &&
        prior.operationType === command.operationType &&
        prior.itemId === command.itemId &&
        prior.sourceLocationId === command.sourceLocationId &&
        prior.destinationLocationId ===
          (command.destinationLocationId ?? null) &&
        prior.quantityDelta === expectedDelta
      ) {
        return Response.json({ ok: true, replayed: true });
      }
    }
    if (command.action === "history.correct") {
      const prior = await first<{
        movementId: number | null;
        countLineId: number | null;
        correctedValue: number;
      }>(
        "SELECT movement_id AS movementId, count_line_id AS countLineId, corrected_value AS correctedValue FROM inventory_corrections WHERE request_id = ?",
        command.requestId,
      );
      const matchesTarget =
        command.targetType === "movement"
          ? prior?.movementId === command.targetId
          : prior?.countLineId === command.targetId;
      if (
        prior &&
        matchesTarget &&
        prior.correctedValue === command.correctedValue
      ) {
        return Response.json({ ok: true, replayed: true });
      }
    }
    if (command.action === "count.create") {
      const prior = await first<{
        locationId: number;
        countDate: string;
        scopeType: string;
        scopeId: number | null;
      }>(
        "SELECT location_id AS locationId,count_date AS countDate,scope_type AS scopeType,scope_id AS scopeId FROM inventory_counts WHERE id = ?",
        command.countId,
      );
      const priorItems = prior
        ? await getD1()
            .prepare(
              "SELECT item_id AS itemId FROM inventory_count_lines WHERE count_id=? AND included=1 ORDER BY item_id",
            )
            .bind(command.countId)
            .all<{ itemId: number }>()
        : { results: [] };
      const expectedItems = [...command.itemIds].sort((a, b) => a - b);
      const actualItems = (priorItems.results ?? []).map((row) =>
        Number(row.itemId),
      );
      if (
        prior &&
        prior.locationId === command.locationId &&
        prior.countDate === command.countDate &&
        prior.scopeType === command.scopeType &&
        prior.scopeId === command.scopeId &&
        JSON.stringify(actualItems) === JSON.stringify(expectedItems)
      ) {
        return Response.json({ ok: true, replayed: true });
      }
    }
    return errorResponse(error);
  }
}

async function validateCountSelection(
  locationId: number,
  scopeType: "location" | "group" | "item",
  scopeId: number | null,
  itemIds: number[],
) {
  if (!itemIds.length) return false;
  const d1 = getD1();
  const placeholders = itemIds.map(() => "?").join(",");
  const scopeSql =
    scopeType === "item"
      ? "item.id=?"
      : scopeType === "group"
        ? "item.group_id=?"
        : "1=1";
  const bindings = [
    locationId,
    ...itemIds,
    ...(scopeType === "location" ? [] : [scopeId]),
  ];
  const result = await d1
    .prepare(
      `SELECT COUNT(DISTINCT item.id) AS count
       FROM inventory_items item
       JOIN inventory_storage_locations location ON location.id=? AND location.active=1
      WHERE item.id IN (${placeholders}) AND item.active=1 AND ${scopeSql}`,
    )
    .bind(...bindings)
    .first<{ count: number }>();
  return (
    Number(result?.count ?? 0) === itemIds.length &&
    (scopeType !== "location" || scopeId === null || scopeId === locationId)
  );
}

async function executeCommand(command: InventoryCommand, actor: string) {
  const db = getD1();
  const now = new Date().toISOString();
  switch (command.action) {
    case "category.save": {
      const statements = command.id
        ? [
            db
              .prepare(
                "UPDATE inventory_categories SET name=?, description=?, sort_order=?, active=?, updated_by_email=?, updated_at=? WHERE id=?",
              )
              .bind(
                command.name,
                command.description,
                command.sortOrder,
                Number(command.active),
                actor,
                now,
                command.id,
              ),
          ]
        : [
            db
              .prepare(
                "INSERT INTO inventory_categories(name,description,sort_order,active,created_by_email,updated_by_email,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
              )
              .bind(
                command.name,
                command.description,
                command.sortOrder,
                Number(command.active),
                actor,
                actor,
                now,
                now,
              ),
          ];
      statements.push(
        db
          .prepare(
            "INSERT INTO inventory_catalog_events(entity_type,entity_id,action,details,actor_email,created_at) SELECT 'category',id,?,?,?,? FROM inventory_categories WHERE name=?",
          )
          .bind(
            command.id ? "updated" : "created",
            command.name,
            actor,
            now,
            command.name,
          ),
      );
      await db.batch(statements);
      return;
    }
    case "group.save": {
      const statements = command.id
        ? [
            db
              .prepare(
                "UPDATE inventory_groups SET category_id=?,name=?,default_location_id=?,notes=?,active=?,updated_by_email=?,updated_at=? WHERE id=?",
              )
              .bind(
                command.categoryId,
                command.name,
                command.defaultLocationId ?? null,
                command.notes,
                Number(command.active),
                actor,
                now,
                command.id,
              ),
          ]
        : [
            db
              .prepare(
                "INSERT INTO inventory_groups(category_id,name,accounting_mode,default_location_id,notes,active,created_by_email,updated_by_email,created_at,updated_at) VALUES(?,?,'quantity',?,?,?,?,?,?,?)",
              )
              .bind(
                command.categoryId,
                command.name,
                command.defaultLocationId ?? null,
                command.notes,
                Number(command.active),
                actor,
                actor,
                now,
                now,
              ),
          ];
      statements.push(
        db
          .prepare(
            "INSERT INTO inventory_catalog_events(entity_type,entity_id,action,details,actor_email,created_at) SELECT 'group',id,?,?,?,? FROM inventory_groups WHERE category_id=? AND name=?",
          )
          .bind(
            command.id ? "updated" : "created",
            command.name,
            actor,
            now,
            command.categoryId,
            command.name,
          ),
      );
      await db.batch(statements);
      return;
    }
    case "location.save": {
      const statements = command.id
        ? [
            db
              .prepare(
                "UPDATE inventory_storage_locations SET name=?,description=?,active=?,updated_by_email=?,updated_at=? WHERE id=?",
              )
              .bind(
                command.name,
                command.description,
                Number(command.active),
                actor,
                now,
                command.id,
              ),
          ]
        : [
            db
              .prepare(
                "INSERT INTO inventory_storage_locations(name,description,active,created_by_email,updated_by_email,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
              )
              .bind(
                command.name,
                command.description,
                Number(command.active),
                actor,
                actor,
                now,
                now,
              ),
          ];
      if (!command.id)
        statements.push(
          db
            .prepare(
              "INSERT OR IGNORE INTO inventory_item_stocks(item_id,location_id,quantity,minimum_quantity) SELECT id,(SELECT id FROM inventory_storage_locations WHERE name=?),0,0 FROM inventory_items WHERE active=1",
            )
            .bind(command.name),
        );
      statements.push(
        db
          .prepare(
            "INSERT INTO inventory_catalog_events(entity_type,entity_id,action,details,actor_email,created_at) SELECT 'location',id,?,?,?,? FROM inventory_storage_locations WHERE name=?",
          )
          .bind(
            command.id ? "updated" : "created",
            command.name,
            actor,
            now,
            command.name,
          ),
      );
      await db.batch(statements);
      return;
    }
    case "item.save": {
      const statements = command.id
        ? [
            db
              .prepare(
                "UPDATE inventory_items SET group_id=?,sku=?,name=?,description=?,unit=?,active=?,next_inventory_date=?,updated_by_email=?,updated_at=? WHERE id=?",
              )
              .bind(
                command.groupId,
                command.sku,
                command.name,
                command.description,
                command.unit,
                Number(command.active),
                command.nextInventoryDate ?? null,
                actor,
                now,
                command.id,
              ),
          ]
        : [
            db
              .prepare(
                "INSERT INTO inventory_items(group_id,sku,name,description,unit,active,next_inventory_date,created_by_email,updated_by_email,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
              )
              .bind(
                command.groupId,
                command.sku,
                command.name,
                command.description,
                command.unit,
                Number(command.active),
                command.nextInventoryDate ?? null,
                actor,
                actor,
                now,
                now,
              ),
          ];
      if (!command.id)
        statements.push(
          db
            .prepare(
              "INSERT INTO inventory_item_stocks(item_id,location_id,quantity,minimum_quantity) SELECT item.id,location.id,0,0 FROM inventory_items item CROSS JOIN inventory_storage_locations location WHERE item.sku=? AND location.active=1",
            )
            .bind(command.sku),
        );
      statements.push(
        db
          .prepare(
            "INSERT INTO inventory_catalog_events(entity_type,entity_id,action,details,actor_email,created_at) SELECT 'item',id,?,?,?,? FROM inventory_items WHERE sku=?",
          )
          .bind(
            command.id ? "updated" : "created",
            `${command.sku}: ${command.name}`,
            actor,
            now,
            command.sku,
          ),
      );
      await db.batch(statements);
      return;
    }
    case "stock.minimum": {
      const result = await db.batch([
        db
          .prepare(
            "INSERT OR IGNORE INTO inventory_item_stocks(item_id,location_id,quantity,minimum_quantity) VALUES(?,?,0,0)",
          )
          .bind(command.itemId, command.locationId),
        db
          .prepare(
            "UPDATE inventory_item_stocks SET minimum_quantity=?,version=version+1,updated_at=? WHERE item_id=? AND location_id=?",
          )
          .bind(
            command.minimumQuantity,
            now,
            command.itemId,
            command.locationId,
          ),
        db
          .prepare(
            "UPDATE inventory_storage_locations SET inventory_version=inventory_version+1,updated_at=? WHERE id=?",
          )
          .bind(now, command.locationId),
        db
          .prepare(
            "INSERT INTO inventory_catalog_events(entity_type,entity_id,action,details,actor_email,created_at) SELECT 'item', item.id, 'minimum_updated', location.name || ': minimum ' || ?, ?, ? FROM inventory_items item JOIN inventory_storage_locations location ON location.id=? WHERE item.id=?",
          )
          .bind(
            command.minimumQuantity,
            actor,
            now,
            command.locationId,
            command.itemId,
          ),
      ]);
      if (!result[1]?.meta?.changes)
        throw new Error("Inventory item or storage location was not found.");
      return;
    }
    case "stock.move": {
      const delta =
        command.operationType === "decrease"
          ? -command.quantity
          : command.quantity;
      await db.batch([
        db
          .prepare(
            "INSERT OR IGNORE INTO inventory_item_stocks(item_id,location_id,quantity,minimum_quantity) VALUES(?,?,0,0)",
          )
          .bind(command.itemId, command.sourceLocationId),
        ...(command.operationType === "transfer"
          ? [
              db
                .prepare(
                  "INSERT OR IGNORE INTO inventory_item_stocks(item_id,location_id,quantity,minimum_quantity) VALUES(?,?,0,0)",
                )
                .bind(command.itemId, command.destinationLocationId),
            ]
          : []),
        db
          .prepare(
            "INSERT INTO inventory_operations(request_id,operation_type,item_id,source_location_id,destination_location_id,quantity_delta,expected_source_version,expected_destination_version,reason,actor_email,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            command.requestId,
            command.operationType,
            command.itemId,
            command.sourceLocationId,
            command.destinationLocationId ?? null,
            delta,
            command.expectedSourceVersion,
            command.expectedDestinationVersion ?? null,
            command.reason,
            actor,
            now,
          ),
      ]);
      return;
    }
    case "count.create": {
      if (
        !(await validateCountSelection(
          command.locationId,
          command.scopeType,
          command.scopeId,
          command.itemIds,
        ))
      )
        throw new Error(
          "Selected items do not match the count scope or active location.",
        );
      const ids = command.itemIds;
      const placeholders = ids.map(() => "?").join(",");
      const scopeSql =
        command.scopeType === "item"
          ? "item.id=?"
          : command.scopeType === "group"
            ? "item.group_id=?"
            : "1=1";
      const itemBindings = [
        ...ids,
        ...(command.scopeType === "location" ? [] : [command.scopeId]),
      ];
      await db.batch([
        db
          .prepare(
            `INSERT OR IGNORE INTO inventory_item_stocks(item_id,location_id,quantity,minimum_quantity) SELECT item.id,?,0,0 FROM inventory_items item WHERE item.id IN (${placeholders}) AND ${scopeSql}`,
          )
          .bind(command.locationId, ...itemBindings),
        db
          .prepare(
            `INSERT INTO inventory_counts(id,location_id,count_date,location_version_snapshot,scope_type,scope_id,notes,created_by_email,created_at)
             SELECT ?,location.id,?,location.inventory_version,?,?,?,?,? FROM inventory_storage_locations location
              WHERE location.id=? AND location.active=1
                AND (SELECT COUNT(DISTINCT item.id) FROM inventory_items item WHERE item.id IN (${placeholders}) AND item.active=1 AND ${scopeSql})=?`,
          )
          .bind(
            command.countId,
            command.countDate,
            command.scopeType,
            command.scopeId,
            command.notes,
            actor,
            now,
            command.locationId,
            ...itemBindings,
            ids.length,
          ),
        db
          .prepare(
            `INSERT INTO inventory_count_lines(count_id,item_id,expected_quantity,expected_stock_version,included)
             SELECT ?,item.id,stock.quantity,stock.version,1 FROM inventory_items item
             JOIN inventory_item_stocks stock ON stock.item_id=item.id AND stock.location_id=?
             WHERE item.id IN (${placeholders}) AND ${scopeSql}`,
          )
          .bind(command.countId, command.locationId, ...itemBindings),
        db
          .prepare(
            "INSERT INTO inventory_count_events(count_id,action,details,actor_email,created_at) VALUES(?,'created',?,?,?)",
          )
          .bind(
            command.countId,
            `Scope ${command.scopeType}:${command.scopeId}; selected items ${ids.join(",")}`,
            actor,
            now,
          ),
      ]);
      const created = await first(
        "SELECT id FROM inventory_counts WHERE id=?",
        command.countId,
      );
      if (!created)
        throw new Error("Storage location was not found or is archived.");
      return;
    }
    case "count.update-selection": {
      const header = await first<{
        locationId: number;
        scopeType: "location" | "group" | "item";
        scopeId: number | null;
        status: string;
      }>(
        "SELECT location_id AS locationId,scope_type AS scopeType,scope_id AS scopeId,status FROM inventory_counts WHERE id=?",
        command.countId,
      );
      if (!header || header.status !== "draft")
        throw new Error(
          "Only a draft inventory count can change its selection.",
        );
      if (
        !(await validateCountSelection(
          header.locationId,
          header.scopeType,
          header.scopeId,
          command.itemIds,
        ))
      )
        throw new Error("Selected items do not match the draft count scope.");
      const prior = await db
        .prepare(
          "SELECT item_id AS itemId FROM inventory_count_lines WHERE count_id=? AND included=1 ORDER BY item_id",
        )
        .bind(command.countId)
        .all<{ itemId: number }>();
      const ids = command.itemIds;
      const placeholders = ids.map(() => "?").join(",");
      const scopeSql =
        header.scopeType === "item"
          ? "item.id=?"
          : header.scopeType === "group"
            ? "item.group_id=?"
            : "1=1";
      const itemBindings = [
        ...ids,
        ...(header.scopeType === "location" ? [] : [header.scopeId]),
      ];
      await db.batch([
        db
          .prepare(
            `INSERT OR IGNORE INTO inventory_item_stocks(item_id,location_id,quantity,minimum_quantity) SELECT item.id,?,0,0 FROM inventory_items item WHERE item.id IN (${placeholders}) AND ${scopeSql}`,
          )
          .bind(header.locationId, ...itemBindings),
        db
          .prepare(
            "UPDATE inventory_count_lines SET included=0 WHERE count_id=? AND included=1 AND EXISTS(SELECT 1 FROM inventory_counts WHERE id=? AND status='draft')",
          )
          .bind(command.countId, command.countId),
        db
          .prepare(
            `INSERT OR IGNORE INTO inventory_count_lines(count_id,item_id,expected_quantity,expected_stock_version,included) SELECT ?,item.id,stock.quantity,stock.version,1 FROM inventory_items item JOIN inventory_item_stocks stock ON stock.item_id=item.id AND stock.location_id=? WHERE item.id IN (${placeholders}) AND ${scopeSql}`,
          )
          .bind(command.countId, header.locationId, ...itemBindings),
        db
          .prepare(
            `UPDATE inventory_count_lines SET included=1,counted_quantity=NULL,expected_quantity=(SELECT stock.quantity FROM inventory_item_stocks stock JOIN inventory_counts count_header ON count_header.location_id=stock.location_id WHERE count_header.id=? AND stock.item_id=inventory_count_lines.item_id),expected_stock_version=(SELECT stock.version FROM inventory_item_stocks stock JOIN inventory_counts count_header ON count_header.location_id=stock.location_id WHERE count_header.id=? AND stock.item_id=inventory_count_lines.item_id) WHERE count_id=? AND item_id IN (${placeholders}) AND EXISTS(SELECT 1 FROM inventory_counts WHERE id=? AND status='draft')`,
          )
          .bind(
            command.countId,
            command.countId,
            command.countId,
            ...ids,
            command.countId,
          ),
        db
          .prepare(
            "UPDATE inventory_counts SET location_version_snapshot=(SELECT inventory_version FROM inventory_storage_locations WHERE id=location_id) WHERE id=? AND status='draft'",
          )
          .bind(command.countId),
        db
          .prepare(
            "INSERT INTO inventory_count_events(count_id,action,details,actor_email,created_at) VALUES(?,'refreshed',?,?,?)",
          )
          .bind(
            command.countId,
            `Selection updated: ${prior.results?.map((row) => row.itemId).join(",") ?? ""} → ${ids.join(",")}; expected quantities refreshed`,
            actor,
            now,
          ),
      ]);
      return;
    }
    case "count.set-line": {
      const result = await db
        .prepare(
          "UPDATE inventory_count_lines SET counted_quantity=? WHERE count_id=? AND item_id=? AND included=1 AND EXISTS(SELECT 1 FROM inventory_counts WHERE id=? AND status='draft')",
        )
        .bind(
          command.countedQuantity,
          command.countId,
          command.itemId,
          command.countId,
        )
        .run();
      if (!result.meta.changes)
        throw new Error("Draft count line was not found.");
      return;
    }
    case "count.save-lines": {
      const header = await first<{ status: string }>(
        "SELECT status FROM inventory_counts WHERE id=?",
        command.countId,
      );
      if (!header || header.status !== "draft")
        throw new Error("Only a draft inventory count can be edited.");
      const placeholders = command.lines.map(() => "?").join(",");
      const valid = await first<{ count: number }>(
        `SELECT COUNT(*) AS count FROM inventory_count_lines WHERE count_id=? AND included=1 AND item_id IN (${placeholders})`,
        command.countId,
        ...command.lines.map((line) => line.itemId),
      );
      if (Number(valid?.count ?? 0) !== command.lines.length)
        throw new Error(
          "One or more count lines do not belong to this inventory count.",
        );
      await db.batch(
        command.lines.map((line) =>
          db
            .prepare(
              "UPDATE inventory_count_lines SET counted_quantity=? WHERE count_id=? AND item_id=? AND included=1 AND EXISTS(SELECT 1 FROM inventory_counts WHERE id=? AND status='draft')",
            )
            .bind(
              line.countedQuantity,
              command.countId,
              line.itemId,
              command.countId,
            ),
        ),
      );
      return;
    }
    case "count.refresh": {
      const header = await first<{
        locationId: number;
        status: string;
        scopeType: "location" | "group" | "item";
        scopeId: number | null;
      }>(
        "SELECT location_id AS locationId,status,scope_type AS scopeType,scope_id AS scopeId FROM inventory_counts WHERE id=?",
        command.countId,
      );
      if (!header || header.status !== "draft")
        throw new Error("Only a draft inventory count can be refreshed.");
      const included = await db
        .prepare(
          "SELECT item_id AS itemId FROM inventory_count_lines WHERE count_id=? AND included=1 ORDER BY item_id",
        )
        .bind(command.countId)
        .all<{ itemId: number }>();
      const itemIds = (included.results ?? []).map((row) => Number(row.itemId));
      if (!itemIds.length)
        throw new Error(
          "Select at least one item before refreshing the inventory count.",
        );
      if (
        !(await validateCountSelection(
          header.locationId,
          header.scopeType,
          header.scopeId,
          itemIds,
        ))
      )
        throw new Error(
          "The draft count selection no longer matches its scope.",
        );
      const placeholders = itemIds.map(() => "?").join(",");
      await db.batch([
        db
          .prepare(
            `INSERT OR IGNORE INTO inventory_item_stocks(item_id,location_id,quantity,minimum_quantity) SELECT item.id,?,0,0 FROM inventory_items item WHERE item.id IN (${placeholders})`,
          )
          .bind(header.locationId, ...itemIds),
        db
          .prepare(
            "UPDATE inventory_counts SET location_version_snapshot=(SELECT inventory_version FROM inventory_storage_locations WHERE id=location_id) WHERE id=? AND status='draft'",
          )
          .bind(command.countId),
        db
          .prepare(
            `UPDATE inventory_count_lines SET expected_quantity=(SELECT stock.quantity FROM inventory_item_stocks stock WHERE stock.item_id=inventory_count_lines.item_id AND stock.location_id=?),expected_stock_version=(SELECT stock.version FROM inventory_item_stocks stock WHERE stock.item_id=inventory_count_lines.item_id AND stock.location_id=?),counted_quantity=NULL WHERE count_id=? AND included=1 AND item_id IN (${placeholders}) AND EXISTS(SELECT 1 FROM inventory_counts WHERE id=? AND status='draft')`,
          )
          .bind(
            header.locationId,
            header.locationId,
            command.countId,
            ...itemIds,
            command.countId,
          ),
        db
          .prepare(
            "INSERT INTO inventory_count_events(count_id,action,details,actor_email,created_at) VALUES(?,'refreshed','Expected quantities refreshed; physical entries cleared',?,?)",
          )
          .bind(command.countId, actor, now),
      ]);
      return;
    }
    case "count.finalize": {
      const result = await db
        .prepare(
          "UPDATE inventory_counts SET status='finalized',finalized_by_email=?,finalized_at=? WHERE id=? AND status='draft'",
        )
        .bind(actor, now, command.countId)
        .run();
      if (!result.meta.changes) {
        const existing = await first<{ status: string }>(
          "SELECT status FROM inventory_counts WHERE id=?",
          command.countId,
        );
        if (existing?.status === "finalized") return;
        throw new Error("Inventory count draft was not found.");
      }
      return;
    }
    case "history.correct": {
      const target =
        command.targetType === "movement"
          ? await first<{
              movementId?: number;
              countLineId?: number;
              itemId: number;
              locationId: number;
              previousValue: number;
              stockVersion: number;
              operationId: number | null;
              operationType: string | null;
              sourceLocationId: number | null;
            }>(
              "SELECT movement.id AS movementId,movement.item_id AS itemId,movement.location_id AS locationId,movement.quantity_after AS previousValue,stock.version AS stockVersion,movement.operation_id AS operationId,movement.operation_type AS operationType,operation.source_location_id AS sourceLocationId FROM inventory_stock_movements movement JOIN inventory_item_stocks stock ON stock.item_id=movement.item_id AND stock.location_id=movement.location_id LEFT JOIN inventory_operations operation ON operation.id=movement.operation_id WHERE movement.id=?",
              command.targetId,
            )
          : await first<{
              movementId?: number;
              countLineId?: number;
              itemId: number;
              locationId: number;
              previousValue: number;
              stockVersion: number;
              operationId: number | null;
              operationType: string | null;
              sourceLocationId: number | null;
            }>(
              "SELECT line.id AS countLineId,line.item_id AS itemId,count_header.location_id AS locationId,COALESCE((SELECT correction.corrected_value FROM inventory_corrections correction WHERE correction.count_line_id=line.id ORDER BY correction.id DESC LIMIT 1),line.counted_quantity) AS previousValue,stock.version AS stockVersion,NULL AS operationId,NULL AS operationType,NULL AS sourceLocationId FROM inventory_count_lines line JOIN inventory_counts count_header ON count_header.id=line.count_id JOIN inventory_item_stocks stock ON stock.item_id=line.item_id AND stock.location_id=count_header.location_id WHERE line.id=? AND count_header.status='finalized'",
              command.targetId,
            );
      if (!target || target.previousValue === null)
        throw new Error("Finalized inventory history record was not found.");
      const delta = command.correctedValue - Number(target.previousValue);
      if (delta === 0)
        throw new Error(
          "The corrected value must differ from the recorded value.",
        );
      const correctionInsert = db
        .prepare(
          "INSERT INTO inventory_corrections(request_id,movement_id,count_line_id,previous_value,corrected_value,reason,actor_email,created_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .bind(
          command.requestId,
          command.targetType === "movement" ? target.movementId : null,
          command.targetType === "count_line" ? target.countLineId : null,
          Number(target.previousValue),
          command.correctedValue,
          command.reason,
          actor,
          now,
        );
      const operations =
        command.targetType === "movement" &&
        "operationType" in target &&
        target.operationType === "transfer"
          ? await (async () => {
              if (!target.operationId)
                throw new Error(
                  "The transfer history is incomplete and cannot be corrected safely.",
                );
              const paired = await first<{
                itemId: number;
                locationId: number;
                stockVersion: number;
              }>(
                "SELECT movement.item_id AS itemId,movement.location_id AS locationId,stock.version AS stockVersion FROM inventory_stock_movements movement JOIN inventory_item_stocks stock ON stock.item_id=movement.item_id AND stock.location_id=movement.location_id WHERE movement.operation_id=? AND movement.id<>? LIMIT 1",
                target.operationId,
                command.targetId,
              );
              if (!paired || paired.itemId !== target.itemId)
                throw new Error(
                  "The paired transfer history is incomplete and cannot be corrected safely.",
                );
              return [
                db
                  .prepare(
                    "INSERT INTO inventory_operations(request_id,operation_type,item_id,source_location_id,quantity_delta,expected_source_version,correction_id,reason,actor_email,created_at) SELECT ?, 'historical_correction', ?, ?, ?, ?, id, ?, ?, ? FROM inventory_corrections WHERE request_id=?",
                  )
                  .bind(
                    `inventory-correction:${command.requestId}:selected`,
                    target.itemId,
                    target.locationId,
                    delta,
                    target.stockVersion,
                    `Transfer history correction: ${command.reason}`,
                    actor,
                    now,
                    command.requestId,
                  ),
                db
                  .prepare(
                    "INSERT INTO inventory_operations(request_id,operation_type,item_id,source_location_id,quantity_delta,expected_source_version,correction_id,reason,actor_email,created_at) SELECT ?, 'historical_correction', ?, ?, ?, ?, id, ?, ?, ? FROM inventory_corrections WHERE request_id=?",
                  )
                  .bind(
                    `inventory-correction:${command.requestId}:paired`,
                    paired.itemId,
                    paired.locationId,
                    -delta,
                    paired.stockVersion,
                    `Paired transfer history correction: ${command.reason}`,
                    actor,
                    now,
                    command.requestId,
                  ),
              ];
            })()
          : [
              db
                .prepare(
                  "INSERT INTO inventory_operations(request_id,operation_type,item_id,source_location_id,quantity_delta,expected_source_version,correction_id,reason,actor_email,created_at) SELECT ?, 'historical_correction', ?, ?, ?, ?, id, ?, ?, ? FROM inventory_corrections WHERE request_id=?",
                )
                .bind(
                  `inventory-correction:${command.requestId}`,
                  target.itemId,
                  target.locationId,
                  delta,
                  target.stockVersion,
                  `Historical correction: ${command.reason}`,
                  actor,
                  now,
                  command.requestId,
                ),
            ];
      await db.batch([correctionInsert, ...operations]);
      return;
    }
  }
}
