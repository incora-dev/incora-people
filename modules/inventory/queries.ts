import { getD1 } from "@/db";
import {
  buildInventoryCorrectionHistoryQuery,
  type InventoryHistoryScope,
} from "@/modules/inventory/domain";

export type { InventoryHistoryScope } from "@/modules/inventory/domain";

type Row = Record<string, string | number | null>;

export type InventoryStockDto = {
  locationId: number;
  locationName: string;
  quantity: number;
  minimumQuantity: number;
  version: number;
  updatedAt: string;
};
/** Asset details of an item; present only for inventory managers. */
export type InventoryItemAssetDto = {
  serialNumber: string;
  price: string;
  division: string;
  department: string;
  warrantyEnds: string | null;
  repairHistory: string;
  attributes: { label: string; value: string }[];
  assignedEmployeeId: number | null;
  assignedEmployeeName: string | null;
  assigneeName: string;
  assignedSince: string | null;
};
export type InventoryItemDto = {
  id: number;
  groupId: number;
  sku: string;
  name: string;
  description: string;
  unit: string;
  active: number;
  nextInventoryDate: string | null;
  stocks: InventoryStockDto[];
  totalQuantity: number;
  minimumTotal: number;
  lowStock: boolean;
  lastInventoryDate: string | null;
  lastInventoryDateByLocation: Record<number, string>;
  asset?: InventoryItemAssetDto;
};
export type InventoryGroupDto = {
  id: number;
  categoryId: number;
  name: string;
  accountingMode: string;
  defaultLocationId: number | null;
  notes: string;
  active: number;
  items: InventoryItemDto[];
};
export type InventoryCategoryDto = {
  id: number;
  name: string;
  description: string;
  sortOrder: number;
  active: number;
  groups: InventoryGroupDto[];
};
export type InventoryLocationDto = {
  id: number;
  name: string;
  description: string;
  active: number;
  inventoryVersion: number;
};
export type InventoryCountLineDto = {
  id: number;
  countId: string;
  itemId: number;
  itemName: string;
  sku: string;
  unit: string;
  expectedQuantity: number;
  countedQuantity: number | null;
  effectiveCountedQuantity: number | null;
  expectedStockVersion: number;
  included: boolean;
};
export type InventoryCountDto = {
  id: string;
  locationId: number;
  scopeType: "location" | "group" | "item";
  scopeId: number | null;
  countDate: string;
  status: "draft" | "finalized";
  notes: string;
  createdByName: string;
  finalizedByName: string | null;
  createdAt: string;
  finalizedAt: string | null;
  lines: InventoryCountLineDto[];
};
export type InventorySnapshot = {
  categories: InventoryCategoryDto[];
  groups: InventoryGroupDto[];
  locations: InventoryLocationDto[];
  items: InventoryItemDto[];
  counts: InventoryCountDto[];
  history: {
    scope: InventoryHistoryScope | null;
    movements: Row[];
    catalogEvents: Row[];
    countEvents: Row[];
    corrections: Row[];
  };
};

function itemScopePredicate(scope: InventoryHistoryScope, alias = "item") {
  if (scope.type === "item") return `${alias}.id = ?`;
  if (scope.type === "group") return `${alias}.group_id = ?`;
  return `${alias}.group_id IN (SELECT id FROM inventory_groups WHERE category_id = ?)`;
}

function movementScopeSql(scope: InventoryHistoryScope) {
  return `movement.item_id IN (SELECT item.id FROM inventory_items item WHERE ${itemScopePredicate(scope)})${scope.locationId ? " AND movement.location_id = ?" : ""}`;
}

function movementScopeValues(scope: InventoryHistoryScope) {
  return scope.locationId ? [scope.id, scope.locationId] : [scope.id];
}

function catalogScopeSql(scope: InventoryHistoryScope) {
  const items = `(event.entity_type = 'item' AND event.entity_id IN (SELECT item.id FROM inventory_items item WHERE ${itemScopePredicate(scope)}))`;
  if (scope.type === "item") return items;
  if (scope.type === "group")
    return `(event.entity_type = 'group' AND event.entity_id = ?) OR ${items}`;
  return `(event.entity_type = 'category' AND event.entity_id = ?) OR (event.entity_type = 'group' AND event.entity_id IN (SELECT id FROM inventory_groups WHERE category_id = ?)) OR ${items}`;
}

function catalogScopeValues(scope: InventoryHistoryScope) {
  if (scope.type === "category") return [scope.id, scope.id, scope.id];
  if (scope.type === "group") return [scope.id, scope.id];
  return [scope.id];
}

function countScopeSql(scope: InventoryHistoryScope) {
  return `EXISTS (SELECT 1 FROM inventory_count_lines line JOIN inventory_items item ON item.id = line.item_id WHERE line.count_id = count_header.id AND line.included = 1 AND ${itemScopePredicate(scope)}${scope.locationId ? " AND count_header.location_id = ?" : ""})`;
}

function countScopeValues(scope: InventoryHistoryScope) {
  return scope.locationId ? [scope.id, scope.locationId] : [scope.id];
}

async function all<T extends Row>(sql: string, ...values: unknown[]) {
  const result = await getD1()
    .prepare(sql)
    .bind(...values)
    .all<T>();
  return result.results ?? [];
}

export function parseInventoryAttributes(
  json: unknown,
): { label: string; value: string }[] {
  try {
    const value: unknown = JSON.parse(String(json ?? "[]"));
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is { label: string; value: string } =>
        typeof item?.label === "string" && typeof item?.value === "string",
    );
  } catch {
    return [];
  }
}

/**
 * @param includeAssetDetails serial numbers, prices, repair history and
 *   holders; pass true only for accounts that manage inventory.
 */
export async function getOfficeInventory(
  includeHistory = true,
  historyScope?: InventoryHistoryScope,
  includeAssetDetails = false,
): Promise<InventorySnapshot> {
  const [
    categories,
    groups,
    locations,
    stockRows,
    counts,
    countLines,
    latestCounts,
    movements,
    catalogEvents,
    countEvents,
    corrections,
  ] = await Promise.all([
    all(
      "SELECT id, name, description, sort_order AS sortOrder, active FROM inventory_categories ORDER BY sort_order, name",
    ),
    all(
      "SELECT id, category_id AS categoryId, name, accounting_mode AS accountingMode, default_location_id AS defaultLocationId, notes, active FROM inventory_groups ORDER BY name",
    ),
    all(
      "SELECT id, name, description, active, inventory_version AS inventoryVersion FROM inventory_storage_locations ORDER BY name",
    ),
    all(`SELECT item.id, item.group_id AS groupId, item.sku, item.name, item.description, item.unit, item.active,
      item.next_inventory_date AS nextInventoryDate, stock.location_id AS locationId,
      location.name AS locationName, stock.quantity, stock.minimum_quantity AS minimumQuantity,
      stock.version, stock.updated_at AS updatedAt
      FROM inventory_items item
      LEFT JOIN inventory_item_stocks stock ON stock.item_id = item.id
      LEFT JOIN inventory_storage_locations location ON location.id = stock.location_id
      ORDER BY item.name, location.name`),
    all(`SELECT count_header.id, count_header.location_id AS locationId, count_header.scope_type AS scopeType, count_header.scope_id AS scopeId, count_header.count_date AS countDate, count_header.status, count_header.notes,
      CASE WHEN count_header.created_by_email = 'system:migration' THEN 'System'
        ELSE COALESCE(NULLIF(trim(created_employee.first_name || ' ' || created_employee.last_name), ''), 'Administrator') END AS createdByName,
      CASE WHEN count_header.finalized_by_email IS NULL THEN NULL
        WHEN count_header.finalized_by_email = 'system:migration' THEN 'System'
        ELSE COALESCE(NULLIF(trim(finalized_employee.first_name || ' ' || finalized_employee.last_name), ''), 'Administrator') END AS finalizedByName,
      count_header.created_at AS createdAt, count_header.finalized_at AS finalizedAt
      FROM inventory_counts count_header
      LEFT JOIN users created_user ON lower(created_user.email) = lower(count_header.created_by_email)
      LEFT JOIN employees created_employee ON created_employee.id = created_user.employee_id
      LEFT JOIN users finalized_user ON lower(finalized_user.email) = lower(count_header.finalized_by_email)
      LEFT JOIN employees finalized_employee ON finalized_employee.id = finalized_user.employee_id
      ORDER BY count_header.count_date DESC, count_header.id DESC LIMIT 100`),
    all(`SELECT line.id, line.count_id AS countId, line.item_id AS itemId, item.name AS itemName,
      item.sku, item.unit, line.expected_quantity AS expectedQuantity,
      line.counted_quantity AS countedQuantity,
      COALESCE((SELECT correction.corrected_value FROM inventory_corrections correction
        WHERE correction.count_line_id = line.id ORDER BY correction.id DESC LIMIT 1), line.counted_quantity) AS effectiveCountedQuantity,
      line.expected_stock_version AS expectedStockVersion, line.included AS included, count_header.count_date AS countDate,
      count_header.status AS countStatus
      FROM inventory_count_lines line JOIN inventory_items item ON item.id = line.item_id
      JOIN inventory_counts count_header ON count_header.id = line.count_id
      WHERE line.included = 1 AND count_header.id IN (SELECT id FROM inventory_counts ORDER BY count_date DESC, id DESC LIMIT 100)
      ORDER BY count_header.count_date DESC, item.name`),
    all(`SELECT line.item_id AS itemId, count_header.location_id AS locationId, MAX(count_header.count_date) AS countDate
      FROM inventory_count_lines line JOIN inventory_counts count_header ON count_header.id=line.count_id
      WHERE line.included=1 AND line.counted_quantity IS NOT NULL AND count_header.status='finalized'
      GROUP BY line.item_id,count_header.location_id`),
    includeHistory && historyScope
      ? all(
          `SELECT movement.id, movement.item_id AS itemId, item.name AS itemName, item.sku, item.unit,
      movement.location_id AS locationId, location.name AS locationName,
      movement.quantity_before AS quantityBefore, movement.quantity_after AS quantityAfter,
      movement.quantity_delta AS quantityDelta, movement.operation_type AS operationType,
      movement.reason, movement.created_at AS createdAt,
      operation.correction_id AS correctionId,
      CASE WHEN movement.actor_email = 'system:migration' THEN 'System'
        ELSE COALESCE(NULLIF(trim(actor_employee.first_name || ' ' || actor_employee.last_name), ''), 'Administrator') END AS actorName
      FROM inventory_stock_movements movement JOIN inventory_items item ON item.id = movement.item_id
      JOIN inventory_storage_locations location ON location.id = movement.location_id
      LEFT JOIN inventory_operations operation ON operation.id = movement.operation_id
      LEFT JOIN users actor ON lower(actor.email) = lower(movement.actor_email)
      LEFT JOIN employees actor_employee ON actor_employee.id = actor.employee_id
      WHERE ${movementScopeSql(historyScope)}
      ORDER BY movement.created_at DESC, movement.id DESC LIMIT 200`,
          ...movementScopeValues(historyScope),
        )
      : Promise.resolve([]),
    includeHistory && historyScope
      ? all(
          `SELECT event.id, event.entity_type AS entityType, event.entity_id AS entityId, event.action, event.details,
      CASE WHEN event.actor_email = 'system:migration' THEN 'System'
        ELSE COALESCE(NULLIF(trim(actor_employee.first_name || ' ' || actor_employee.last_name), ''), 'Administrator') END AS actorName,
      event.created_at AS createdAt FROM inventory_catalog_events event
      LEFT JOIN users actor ON lower(actor.email) = lower(event.actor_email)
      LEFT JOIN employees actor_employee ON actor_employee.id = actor.employee_id
      WHERE ${catalogScopeSql(historyScope)}
      ORDER BY event.created_at DESC, event.id DESC LIMIT 100`,
          ...catalogScopeValues(historyScope),
        )
      : Promise.resolve([]),
    includeHistory && historyScope
      ? all(
          `SELECT event.id, event.count_id AS countId, event.action, event.details,
      CASE WHEN event.actor_email = 'system:migration' THEN 'System'
        ELSE COALESCE(NULLIF(trim(actor_employee.first_name || ' ' || actor_employee.last_name), ''), 'Administrator') END AS actorName,
      event.created_at AS createdAt FROM inventory_count_events event
      JOIN inventory_counts count_header ON count_header.id = event.count_id
      LEFT JOIN users actor ON lower(actor.email) = lower(event.actor_email)
      LEFT JOIN employees actor_employee ON actor_employee.id = actor.employee_id
      WHERE ${countScopeSql(historyScope)}
      ORDER BY event.created_at DESC, event.id DESC LIMIT 100`,
          ...countScopeValues(historyScope),
        )
      : Promise.resolve([]),
    includeHistory && historyScope
      ? (() => {
          const query = buildInventoryCorrectionHistoryQuery(historyScope);
          return all(query.sql, ...query.values);
        })()
      : Promise.resolve([]),
  ]);

  const items = new Map<number, InventoryItemDto>();
  for (const row of stockRows) {
    const id = Number(row.id);
    let item = items.get(id);
    if (!item) {
      item = {
        id,
        groupId: Number(row.groupId),
        sku: String(row.sku),
        name: String(row.name),
        description: String(row.description ?? ""),
        unit: String(row.unit ?? "шт."),
        active: Number(row.active),
        nextInventoryDate:
          row.nextInventoryDate === null ? null : String(row.nextInventoryDate),
        stocks: [],
        totalQuantity: 0,
        minimumTotal: 0,
        lowStock: false,
        lastInventoryDate: null,
        lastInventoryDateByLocation: {},
      };
      items.set(id, item);
    }
    if (row.locationId !== null) {
      item.stocks.push({
        locationId: Number(row.locationId),
        locationName: String(row.locationName),
        quantity: Number(row.quantity),
        minimumQuantity: Number(row.minimumQuantity),
        version: Number(row.version),
        updatedAt: String(row.updatedAt),
      });
      item.totalQuantity += Number(row.quantity ?? 0);
      item.minimumTotal += Number(row.minimumQuantity ?? 0);
      item.lowStock ||=
        Number(row.quantity ?? 0) < Number(row.minimumQuantity ?? 0);
    }
  }
  if (includeAssetDetails) {
    const assetRows =
      await all(`SELECT item.id, item.serial_number AS serialNumber, item.price,
      item.division, item.department, item.warranty_ends AS warrantyEnds,
      item.repair_history AS repairHistory, item.attributes_json AS attributesJson,
      item.assigned_employee_id AS assignedEmployeeId,
      CASE WHEN employee.id IS NULL THEN NULL
        ELSE trim(employee.first_name || ' ' || employee.last_name) END AS assignedEmployeeName,
      item.assignee_name AS assigneeName, item.assigned_since AS assignedSince
      FROM inventory_items item
      LEFT JOIN employees employee ON employee.id = item.assigned_employee_id`);
    for (const row of assetRows) {
      const item = items.get(Number(row.id));
      if (!item) continue;
      item.asset = {
        serialNumber: String(row.serialNumber ?? ""),
        price: String(row.price ?? ""),
        division: String(row.division ?? ""),
        department: String(row.department ?? ""),
        warrantyEnds:
          row.warrantyEnds === null ? null : String(row.warrantyEnds),
        repairHistory: String(row.repairHistory ?? ""),
        attributes: parseInventoryAttributes(row.attributesJson),
        assignedEmployeeId:
          row.assignedEmployeeId === null
            ? null
            : Number(row.assignedEmployeeId),
        assignedEmployeeName:
          row.assignedEmployeeName === null
            ? null
            : String(row.assignedEmployeeName),
        assigneeName: String(row.assigneeName ?? ""),
        assignedSince:
          row.assignedSince === null ? null : String(row.assignedSince),
      };
    }
  }

  const latestCountByItem = new Map<number, string>();
  for (const row of latestCounts) {
    const item = items.get(Number(row.itemId));
    if (!item) continue;
    const date = String(row.countDate);
    item.lastInventoryDateByLocation[Number(row.locationId)] = date;
    const previous = latestCountByItem.get(Number(row.itemId));
    if (!previous || date > previous)
      latestCountByItem.set(Number(row.itemId), date);
  }
  for (const [id, item] of items)
    item.lastInventoryDate = latestCountByItem.get(id) ?? null;

  const typedGroups: InventoryGroupDto[] = groups.map((group) => ({
    id: Number(group.id),
    categoryId: Number(group.categoryId),
    name: String(group.name),
    accountingMode: String(group.accountingMode),
    defaultLocationId:
      group.defaultLocationId === null ? null : Number(group.defaultLocationId),
    notes: String(group.notes ?? ""),
    active: Number(group.active),
    items: [...items.values()].filter(
      (item) => item.groupId === Number(group.id),
    ),
  }));
  const typedCategories: InventoryCategoryDto[] = categories.map(
    (category) => ({
      id: Number(category.id),
      name: String(category.name),
      description: String(category.description ?? ""),
      sortOrder: Number(category.sortOrder),
      active: Number(category.active),
      groups: typedGroups
        .filter((group) => group.categoryId === Number(category.id))
        .map((group) => ({
          ...group,
        })),
    }),
  );
  const linesByCount = new Map<string, Row[]>();
  for (const line of countLines) {
    const key = String(line.countId);
    linesByCount.set(key, [...(linesByCount.get(key) ?? []), line]);
  }
  const enrichedCounts: InventoryCountDto[] = counts.map((count) => ({
    id: String(count.id),
    locationId: Number(count.locationId),
    scopeType: String(count.scopeType) as "location" | "group" | "item",
    scopeId: count.scopeId === null ? null : Number(count.scopeId),
    countDate: String(count.countDate),
    status: String(count.status) as "draft" | "finalized",
    notes: String(count.notes ?? ""),
    createdByName: String(count.createdByName ?? "Administrator"),
    finalizedByName:
      count.finalizedByName === null || count.finalizedByName === undefined
        ? null
        : String(count.finalizedByName),
    createdAt: String(count.createdAt),
    finalizedAt: count.finalizedAt === null ? null : String(count.finalizedAt),
    lines: (linesByCount.get(String(count.id)) ?? []).map((line) => ({
      id: Number(line.id),
      countId: String(line.countId),
      itemId: Number(line.itemId),
      itemName: String(line.itemName),
      sku: String(line.sku),
      unit: String(line.unit),
      expectedQuantity: Number(line.expectedQuantity),
      countedQuantity:
        line.countedQuantity === null ? null : Number(line.countedQuantity),
      effectiveCountedQuantity:
        line.effectiveCountedQuantity === null
          ? null
          : Number(line.effectiveCountedQuantity),
      expectedStockVersion: Number(line.expectedStockVersion),
      included: Number(line.included) === 1,
    })),
  }));
  const typedLocations: InventoryLocationDto[] = locations.map((location) => ({
    id: Number(location.id),
    name: String(location.name),
    description: String(location.description ?? ""),
    active: Number(location.active),
    inventoryVersion: Number(location.inventoryVersion),
  }));
  return {
    categories: typedCategories,
    groups: typedGroups,
    locations: typedLocations,
    items: [...items.values()],
    counts: enrichedCounts,
    history: {
      scope: includeHistory ? (historyScope ?? null) : null,
      movements,
      catalogEvents,
      countEvents,
      corrections,
    },
  };
}
