export type InventoryHistoryScope = {
  type: "category" | "group" | "item";
  id: number;
  locationId?: number;
};

function historyItemPredicate(scope: InventoryHistoryScope, alias = "item") {
  if (scope.type === "item") return `${alias}.id = ?`;
  if (scope.type === "group") return `${alias}.group_id = ?`;
  return `${alias}.group_id IN (SELECT id FROM inventory_groups WHERE category_id = ?)`;
}

/** Build the parameterized append-only correction history read for one scope. */
export function buildInventoryCorrectionHistoryQuery(
  scope: InventoryHistoryScope,
) {
  const locationMovement = scope.locationId
    ? " AND movement.location_id = ?"
    : "";
  const locationCount = scope.locationId
    ? " AND count_header.location_id = ?"
    : "";
  const values = [
    scope.id,
    ...(scope.locationId ? [scope.locationId] : []),
    scope.id,
    ...(scope.locationId ? [scope.locationId] : []),
  ];
  return {
    sql: `SELECT correction.id, correction.request_id AS requestId,
      correction.movement_id AS movementId, correction.count_line_id AS countLineId,
      correction.previous_value AS previousValue, correction.corrected_value AS correctedValue,
      correction.reason,
      CASE WHEN correction.actor_email = 'system:migration' THEN 'System'
        ELSE COALESCE(NULLIF(trim(actor_employee.first_name || ' ' || actor_employee.last_name), ''), 'Administrator') END AS actorName,
      correction.created_at AS createdAt FROM inventory_corrections correction
      LEFT JOIN users actor ON lower(actor.email) = lower(correction.actor_email)
      LEFT JOIN employees actor_employee ON actor_employee.id = actor.employee_id
      WHERE (correction.movement_id IS NOT NULL AND correction.movement_id IN (
        SELECT movement.id FROM inventory_stock_movements movement JOIN inventory_items item ON item.id = movement.item_id
        WHERE ${historyItemPredicate(scope)}${locationMovement}
      )) OR (correction.count_line_id IS NOT NULL AND correction.count_line_id IN (
        SELECT line.id FROM inventory_count_lines line JOIN inventory_items item ON item.id = line.item_id
        JOIN inventory_counts count_header ON count_header.id = line.count_id
        WHERE line.included = 1 AND ${historyItemPredicate(scope)}${locationCount}
      ))
      ORDER BY correction.created_at DESC, correction.id DESC LIMIT 100`,
    values,
  };
}

export function canManageInventory(role: string, hasExplicitGrant: boolean) {
  return role === "super_admin" || (role === "hr_admin" && hasExplicitGrant);
}

export function calculateStockDelta(
  operation: "initial_stock" | "receipt" | "decrease" | "transfer",
  quantity: number,
) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return null;
  return operation === "decrease" ? -quantity : quantity;
}

export function applyInventoryDelta(current: number, delta: number) {
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(delta))
    return null;
  const next = current + delta;
  return next < 0 ? null : next;
}

export function isBelowInventoryMinimum(quantity: number, minimum: number) {
  return quantity < minimum;
}

export function isValidInventoryCountSelection(
  scopeType: "location" | "group" | "item",
  scopeId: number,
  itemIds: number[],
) {
  if (
    !Number.isSafeInteger(scopeId) ||
    scopeId <= 0 ||
    itemIds.length === 0 ||
    itemIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
    new Set(itemIds).size !== itemIds.length
  ) {
    return false;
  }
  return (
    scopeType !== "item" || (itemIds.length === 1 && itemIds[0] === scopeId)
  );
}

export function isValidInventoryDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toISOString().slice(0, 10) === value;
}
