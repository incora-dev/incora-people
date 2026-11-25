"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Boxes,
  CalendarCheck2,
  ClipboardCheck,
  Clock3,
  FolderPlus,
  History,
  MapPin,
  PackagePlus,
  Pencil,
  Plus,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { DateField } from "@/components/ui/DateField";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { useI18n } from "@/components/LocaleProvider";
import type {
  InventoryCategoryDto,
  InventoryCountDto,
  InventoryItemDto,
  InventoryHistoryScope,
  InventorySnapshot,
} from "@/modules/inventory/queries";
import { getDateContext } from "@/modules/shared/date";
import { addCalendarDays } from "@/modules/people/dates";

type ModalKind =
  | "category"
  | "group"
  | "location"
  | "item"
  | "receipt"
  | "decrease"
  | "transfer"
  | "count"
  | "correction"
  | null;
type CorrectionTarget = {
  type: "movement" | "count_line";
  id: number;
  value: number;
};
type CountScope = { type: "item" | "group"; id: number };

const ukDate = (value: string | null) => {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
};

function operationLabel(value: unknown, t: (key: string) => string) {
  const labels: Record<string, string> = {
    initial_stock: "Initial stock",
    receipt: "Stock receipt",
    decrease: "Stock decrease",
    transfer: "Stock transfer",
    count_adjustment: "Inventory count adjustment",
    historical_correction: "Historical correction",
  };
  return t(labels[String(value)] ?? "Inventory update");
}

export function InventoryWorkspace({
  initialData,
  canManage,
  isSuperAdmin,
  readOnlyPreview = false,
  people = [],
  orgUnits = { divisions: [], departments: [] },
}: {
  initialData: InventorySnapshot;
  canManage: boolean;
  isSuperAdmin: boolean;
  readOnlyPreview?: boolean;
  /** Current employees an item can be handed to (managers only). */
  people?: { id: number; firstName: string; lastName: string }[];
  /** Division and department choices for the item form (managers only). */
  orgUnits?: { divisions: string[]; departments: string[] };
}) {
  const { t } = useI18n();
  const [data, setData] = useState(initialData);
  const [categoryId, setCategoryId] = useState<number | null>(
    initialData.categories.find((entry) => entry.active)?.id ?? null,
  );
  const [groupId, setGroupId] = useState<number | null>(null);
  const [itemId, setItemId] = useState<number | null>(null);
  const [selectedCountId, setSelectedCountId] = useState<string | null>(null);
  const [countInputs, setCountInputs] = useState<Record<number, string>>({});
  const [countScope, setCountScope] = useState<CountScope | null>(null);
  const [countItemIds, setCountItemIds] = useState<number[]>([]);
  const [draftSelectionIds, setDraftSelectionIds] = useState<number[]>([]);
  const [confirmCountFinalize, setConfirmCountFinalize] = useState(false);
  const [countLocationId, setCountLocationId] = useState<number | null>(null);
  const [historyScope, setHistoryScope] =
    useState<InventoryHistoryScope | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [commandRequestId, setCommandRequestId] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [itemGroupId, setItemGroupId] = useState<number | null>(null);
  const [correctionTarget, setCorrectionTarget] =
    useState<CorrectionTarget | null>(null);
  const [dateValue, setDateValue] = useState(getDateContext().today);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [locationsDialogOpen, setLocationsDialogOpen] = useState(false);
  const [countsDialogOpen, setCountsDialogOpen] = useState(false);

  const activeCategories = data.categories.filter((entry) => entry.active);
  const visibleCategories = showArchived ? data.categories : activeCategories;
  const selectedCategory =
    visibleCategories.find((entry) => entry.id === categoryId) ??
    visibleCategories[0];
  const activeGroups = (selectedCategory?.groups ?? []).filter(
    (entry) => showArchived || entry.active,
  );
  const selectedGroup = activeGroups.find((entry) => entry.id === groupId);
  const activeItems = (selectedGroup?.items ?? []).filter(
    (entry) => showArchived || entry.active,
  );
  const visibleItems = activeItems.filter((item) =>
    `${item.name} ${item.sku} ${item.description}`
      .toLocaleLowerCase()
      .includes(inventorySearch.trim().toLocaleLowerCase()),
  );
  const selectedItem = visibleItems.find((entry) => entry.id === itemId);
  const countCandidates =
    countScope?.type === "item"
      ? data.items.filter((item) => item.id === countScope.id)
      : countScope?.type === "group"
        ? (data.groups
            .find((group) => group.id === countScope.id)
            ?.items.filter((item) => showArchived || item.active) ?? [])
        : [];
  const countGroup =
    countScope?.type === "group"
      ? (data.groups.find((group) => group.id === countScope.id) ?? null)
      : (data.groups.find(
          (group) => group.id === countCandidates[0]?.groupId,
        ) ?? null);
  const countCategory = countGroup
    ? (data.categories.find(
        (category) => category.id === countGroup.categoryId,
      ) ?? null)
    : null;
  const activeLocations = data.locations.filter((entry) => entry.active);
  const visibleLocations = showArchived ? data.locations : activeLocations;
  const selectedCount =
    data.counts.find((entry) => entry.id === selectedCountId) ?? null;
  const draftCountCandidates = selectedCount
    ? selectedCount.scopeType === "group" && selectedCount.scopeId !== null
      ? (data.groups.find((group) => group.id === selectedCount.scopeId)
          ?.items ?? [])
      : selectedCount.scopeType === "item" && selectedCount.scopeId !== null
        ? data.items.filter((item) => item.id === selectedCount.scopeId)
        : data.items.filter((item) =>
            item.stocks.some(
              (stock) => stock.locationId === selectedCount.locationId,
            ),
          )
    : [];
  const allItems = data.items.filter((entry) => entry.active);
  const stockPositions = allItems.reduce(
    (sum, item) => sum + item.stocks.length,
    0,
  );
  const lowStockItems = allItems.filter((item) => item.lowStock);
  const today = getDateContext().today;
  const plannedCounts = allItems.filter((item) => item.nextInventoryDate);
  const overdueCount = plannedCounts.filter(
    (item) => String(item.nextInventoryDate) < today,
  ).length;
  const upcomingLimit = addCalendarDays(today, 30);
  const upcomingCount = plannedCounts.filter(
    (item) =>
      String(item.nextInventoryDate) >= today &&
      String(item.nextInventoryDate) <= upcomingLimit,
  ).length;

  const currentEdit = useMemo(() => {
    if (modal === "category")
      return data.categories.find((entry) => entry.id === editId) ?? null;
    if (modal === "group")
      return data.groups.find((entry) => entry.id === editId) ?? null;
    if (modal === "location")
      return data.locations.find((entry) => entry.id === editId) ?? null;
    if (modal === "item")
      return data.items.find((entry) => entry.id === editId) ?? null;
    return null;
  }, [data, editId, modal]);

  async function reload() {
    const suffix = historyScope
      ? `?historyType=${historyScope.type}&historyId=${historyScope.id}${historyScope.locationId ? `&historyLocationId=${historyScope.locationId}` : ""}`
      : "";
    const response = await fetch(`/api/inventory${suffix}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(t("Could not load inventory."));
    const fresh = (await response.json()) as InventorySnapshot;
    setData(fresh);
  }

  async function loadHistory(scope: InventoryHistoryScope | null) {
    setHistoryScope(scope);
    const suffix = scope
      ? `?historyType=${scope.type}&historyId=${scope.id}${scope.locationId ? `&historyLocationId=${scope.locationId}` : ""}`
      : "";
    try {
      const response = await fetch(`/api/inventory${suffix}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(t("Could not load inventory history."));
      setData((await response.json()) as InventorySnapshot);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("Could not load inventory history."),
      );
    }
  }

  async function send(payload: Record<string, unknown>) {
    if (readOnlyPreview) return false;
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? t("Inventory operation failed."));
      await reload();
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("Inventory operation failed."),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openModal(
    kind: Exclude<ModalKind, null>,
    id?: number,
    scope?: CountScope,
  ) {
    if (readOnlyPreview) return;
    setError("");
    setEditId(id ?? null);
    if (kind === "item")
      setItemGroupId(
        (id ? data.items.find((entry) => entry.id === id)?.groupId : null) ??
          selectedGroup?.id ??
          null,
      );
    if (kind === "count") {
      setCountScope(scope ?? null);
      setCountItemIds(scope?.type === "item" ? [scope.id] : []);
      setCountLocationId(null);
    }
    setCommandRequestId(
      ["receipt", "decrease", "transfer", "count", "correction"].includes(kind)
        ? crypto.randomUUID()
        : "",
    );
    const editItem =
      kind === "item" && id
        ? data.items.find((entry) => entry.id === id)
        : null;
    setDateValue(
      kind === "count"
        ? getDateContext().today
        : (editItem?.nextInventoryDate ?? ""),
    );
    setModal(kind);
  }

  async function submitModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnlyPreview) return;
    if (
      modal === "count" &&
      (!countScope || !countLocationId || countItemIds.length === 0)
    ) {
      setError(t("Choose a count scope, location, and at least one item."));
      return;
    }
    const form = new FormData(event.currentTarget);
    const val = (key: string) => String(form.get(key) ?? "").trim();
    const num = (key: string) => Number(form.get(key));
    const nullableNum = (key: string) =>
      val(key) ? Number(form.get(key)) : null;
    let payload: Record<string, unknown> | null = null;
    if (modal === "category")
      payload = {
        action: "category.save",
        ...(editId ? { id: editId } : {}),
        name: val("name"),
        description: val("description"),
        sortOrder: num("sortOrder"),
        active: form.get("active") === "on",
      };
    if (modal === "group")
      payload = {
        action: "group.save",
        ...(editId ? { id: editId } : {}),
        categoryId: num("categoryId"),
        name: val("name"),
        defaultLocationId: nullableNum("defaultLocationId"),
        notes: val("notes"),
        active: form.get("active") === "on",
      };
    if (modal === "location")
      payload = {
        action: "location.save",
        ...(editId ? { id: editId } : {}),
        name: val("name"),
        description: val("description"),
        active: form.get("active") === "on",
      };
    if (modal === "item")
      payload = {
        action: "item.save",
        ...(editId ? { id: editId } : {}),
        groupId: num("groupId"),
        sku: val("sku"),
        name: val("name"),
        description: val("description"),
        // The unit is not editable here: keep the stored one (it cannot change
        // once the item has stock history) and default new items to "шт.".
        unit:
          (editId
            ? data.items.find((entry) => entry.id === editId)?.unit
            : null) ?? "шт.",
        active: form.get("active") === "on",
        nextInventoryDate: dateValue || null,
        ...(canManage
          ? {
              assetDetails: {
                serialNumber: val("serialNumber"),
                price: val("price"),
                division: val("division"),
                department: val("department"),
                warrantyEnds: val("warrantyEnds") || null,
                repairHistory: val("repairHistory"),
                attributes: mergeAttributes(
                  ASSET_SPEC_FIELDS.filter(
                    (spec) => form.get(spec.name) !== null,
                  ).map((spec) => ({
                    label: spec.label,
                    value: val(spec.name),
                  })),
                  parseAttributeLines(val("attributes")),
                ),
                ...parseHolder(val("holder")),
                assignedSince: val("assignedSince") || null,
              },
            }
          : {}),
      };
    if (modal === "receipt" || modal === "decrease" || modal === "transfer") {
      const item = selectedItem;
      const sourceId = num("sourceLocationId");
      const destinationId =
        modal === "transfer" ? num("destinationLocationId") : undefined;
      const source = item?.stocks.find(
        (stock) => stock.locationId === sourceId,
      );
      const destination = item?.stocks.find(
        (stock) => stock.locationId === destinationId,
      );
      payload = {
        action: "stock.move",
        requestId: commandRequestId,
        operationType: modal,
        itemId: item?.id,
        sourceLocationId: sourceId,
        ...(destinationId
          ? {
              destinationLocationId: destinationId,
              expectedDestinationVersion: destination?.version ?? 0,
            }
          : {}),
        quantity: num("quantity"),
        expectedSourceVersion: source?.version ?? 0,
        reason: val("reason"),
      };
    }
    if (modal === "count")
      payload = {
        action: "count.create",
        countId: commandRequestId,
        locationId: countLocationId,
        countDate: dateValue,
        notes: val("notes"),
        scopeType: countScope?.type,
        scopeId: countScope?.id,
        itemIds: countItemIds,
      };
    if (modal === "correction" && correctionTarget)
      payload = {
        action: "history.correct",
        requestId: commandRequestId,
        targetType: correctionTarget.type,
        targetId: correctionTarget.id,
        correctedValue: num("correctedValue"),
        reason: val("reason"),
      };
    if (!payload) return;
    if (await send(payload)) {
      setModal(null);
      if (modal === "count") {
        setSelectedCountId(commandRequestId);
        setDraftSelectionIds(countItemIds);
        setCountInputs(Object.fromEntries(countItemIds.map((id) => [id, ""])));
        setCountsDialogOpen(true);
      }
    }
  }

  async function saveMinimum(
    event: FormEvent<HTMLFormElement>,
    item: InventoryItemDto,
    locationId: number,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (
      await send({
        action: "stock.minimum",
        itemId: item.id,
        locationId,
        minimumQuantity: form.get("minimumQuantity"),
      })
    ) {
      formElement.reset();
    }
  }

  function getCurrentCountLines(count: InventoryCountDto) {
    return count.lines.map((line) => {
      const value = countInputs[line.itemId] ?? "";
      return {
        itemId: line.itemId,
        countedQuantity: value === "" ? null : Number(value),
      };
    });
  }

  async function persistCountLines(
    count: InventoryCountDto,
    lines: ReturnType<typeof getCurrentCountLines>,
  ) {
    if (!lines.length) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "count.save-lines",
          countId: count.id,
          lines,
        }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? t("Could not save inventory count."));
      }
      await reload();
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("Could not save inventory count."),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveCountLines(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnlyPreview) return;
    if (!selectedCount) return;
    await persistCountLines(selectedCount, getCurrentCountLines(selectedCount));
  }

  async function saveDraftSelection() {
    if (readOnlyPreview || !selectedCount || !draftSelectionIds.length) return;
    if (
      await send({
        action: "count.update-selection",
        countId: selectedCount.id,
        itemIds: draftSelectionIds,
      })
    ) {
      setCountInputs(
        Object.fromEntries(draftSelectionIds.map((id) => [id, ""])),
      );
    }
  }

  async function finalizeCount() {
    if (readOnlyPreview) return;
    if (!selectedCount) return;
    const count = selectedCount;
    const lines = getCurrentCountLines(count);
    if (lines.some((line) => line.countedQuantity === null)) {
      setError(t("Enter a counted quantity for every item before finalizing."));
      return;
    }
    setError("");
    if (lines.length && !(await persistCountLines(count, lines))) return;
    if (await send({ action: "count.finalize", countId: count.id })) {
      setSelectedCountId(count.id);
      setConfirmCountFinalize(false);
    }
  }

  const modalTitle: Record<Exclude<ModalKind, null>, string> = {
    category: editId ? "Edit inventory category" : "Add inventory category",
    group: editId ? "Edit inventory group" : "Add inventory group",
    location: editId ? "Edit storage location" : "Add storage location",
    item: editId ? "Edit inventory item" : "Add inventory item",
    receipt: "Receipt",
    decrease: "Write-off",
    transfer: "Transfer stock",
    count: "Start inventory count",
    correction: "Correct historical inventory record",
  };

  function field(
    label: string,
    name: string,
    value = "",
    type = "text",
    required = false,
  ) {
    return (
      <label key={name}>
        <span>
          {t(label)}
          {required && <RequiredMark />}
        </span>
        <input
          name={name}
          type={type}
          defaultValue={value}
          required={required}
        />
      </label>
    );
  }

  const editingCategory = currentEdit as InventoryCategoryDto | null;
  const editingItem = currentEdit as InventoryItemDto | null;
  const historyContextTitle = historyScope
    ? historyScope.type === "item"
      ? (data.items.find((item) => item.id === historyScope.id)?.name ??
        t("Inventory item"))
      : historyScope.type === "group"
        ? (data.groups.find((group) => group.id === historyScope.id)?.name ??
          t("Inventory group"))
        : (data.categories.find((category) => category.id === historyScope.id)
            ?.name ?? t("Inventory category"))
    : "";
  const historyRows = historyScope
    ? [
        ...data.history.movements.map((entry) => ({
          key: `movement-${entry.id}`,
          createdAt: String(entry.createdAt),
          title: `${String(entry.itemName)} · ${String(entry.locationName)}`,
          details: `${operationLabel(entry.operationType, t)} · ${String(entry.reason)}`,
          actor: String(entry.actorName),
          amount: `${Number(entry.quantityDelta) > 0 ? "+" : ""}${entry.quantityDelta} · ${entry.quantityBefore} → ${entry.quantityAfter}`,
          correctionType: "movement" as const,
          correctionId: Number(entry.id),
          correctionValue: Number(entry.quantityAfter),
        })),
        ...data.history.catalogEvents.map((entry) => ({
          key: `catalog-${entry.id}`,
          createdAt: String(entry.createdAt),
          title: `${t(String(entry.entityType))}: ${String(entry.details)}`,
          details: t(String(entry.action)),
          actor: String(entry.actorName),
          amount: "",
          correctionType: null,
          correctionId: 0,
          correctionValue: 0,
        })),
        ...data.history.countEvents.map((entry) => {
          const count = data.counts.find(
            (candidate) => candidate.id === String(entry.countId),
          );
          return {
            key: `count-event-${entry.id}`,
            createdAt: String(entry.createdAt),
            title: `${t("Inventory count")} · ${data.locations.find((location) => location.id === count?.locationId)?.name ?? String(entry.countId)}`,
            details: `${t(String(entry.action))}${count?.lines.length ? ` · ${count.lines.map((line) => line.itemName).join(", ")}` : ""}`,
            actor: String(entry.actorName),
            amount: "",
            correctionType: null,
            correctionId: 0,
            correctionValue: 0,
          };
        }),
        ...data.history.corrections.map((entry) => ({
          key: `correction-${entry.id}`,
          createdAt: String(entry.createdAt),
          title: `${t("Historical correction")}: ${entry.previousValue} → ${entry.correctedValue}`,
          details: String(entry.reason),
          actor: String(entry.actorName),
          amount: "",
          correctionType:
            entry.movementId !== null
              ? ("movement" as const)
              : ("count_line" as const),
          correctionId: Number(entry.movementId ?? entry.countLineId),
          correctionValue: Number(entry.correctedValue),
        })),
      ].sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          right.key.localeCompare(left.key),
      )
    : [];

  return (
    <div className="inventory-workspace">
      <section className="page-heading-row">
        <div>
          <h1>{t("Inventory management")}</h1>
        </div>
        <div className="inventory-heading-actions">
          <button
            className="button ghost-button"
            onClick={() => setLocationsDialogOpen(true)}
          >
            <MapPin size={14} /> {t("Storage locations")}
          </button>
          <button
            className="button ghost-button"
            onClick={() => setCountsDialogOpen(true)}
          >
            <ClipboardCheck size={14} /> {t("Inventory counts")}
          </button>
          {canManage && (
            <button
              className="button secondary-button"
              onClick={() => openModal("category")}
            >
              <FolderPlus size={15} /> {t("Add category")}
            </button>
          )}
        </div>
      </section>

      <section className="inventory-kpi-grid">
        <article className="panel inventory-kpi">
          <Boxes size={19} />
          <div>
            <strong>{allItems.length}</strong>
            <span>{t("Active items")}</span>
          </div>
        </article>
        <article className="panel inventory-kpi">
          <Archive size={19} />
          <div>
            <strong>{stockPositions}</strong>
            <span>{t("Stock positions")}</span>
          </div>
        </article>
        <article
          className={`panel inventory-kpi ${lowStockItems.length ? "warning" : ""}`}
        >
          <TriangleAlert size={19} />
          <div>
            <strong>{lowStockItems.length}</strong>
            <span>{t("Low-stock items")}</span>
          </div>
        </article>
        <article
          className={`panel inventory-kpi ${upcomingCount ? "warning" : ""}`}
        >
          <CalendarCheck2 size={19} />
          <div>
            <strong>{upcomingCount}</strong>
            <span>{t("Upcoming inventory counts")}</span>
          </div>
        </article>
        <article
          className={`panel inventory-kpi ${overdueCount ? "warning" : ""}`}
        >
          <TriangleAlert size={19} />
          <div>
            <strong>{overdueCount}</strong>
            <span>{t("Overdue inventory counts")}</span>
          </div>
        </article>
      </section>

      {error && (
        <div className="form-error inventory-error" role="alert">
          {t(error)}
        </div>
      )}

      <div className="inventory-browser-grid">
        <aside className="panel inventory-tree-panel">
          <header>
            <h2>{t("Categories")}</h2>
            <div>
              <button
                className="button ghost-button inventory-archive-toggle"
                aria-label={t(showArchived ? "Hide archived" : "Show archived")}
                aria-pressed={showArchived}
                title={t(showArchived ? "Hide archived" : "Show archived")}
                onClick={() => setShowArchived((value) => !value)}
              >
                {t("Archived categories")}
              </button>
            </div>
          </header>
          <div className="inventory-category-list" role="list">
            {visibleCategories.map((category) => (
              <div
                className={`inventory-category-choice ${category.id === selectedCategory?.id ? "selected" : ""} ${!category.active ? "archived" : ""}`}
                key={category.id}
                role="listitem"
              >
                <button
                  aria-current={
                    category.id === selectedCategory?.id ? "true" : undefined
                  }
                  onClick={() => {
                    setCategoryId(category.id);
                    setGroupId(null);
                    setItemId(null);
                    void loadHistory(null);
                  }}
                >
                  {category.name}
                  <span>
                    {category.groups.reduce(
                      (sum, group) =>
                        sum + group.items.filter((item) => item.active).length,
                      0,
                    )}
                  </span>
                </button>
                {canManage && (
                  <button
                    className="icon-button"
                    aria-label={`${t("Edit")} ${category.name}`}
                    onClick={() => openModal("category", category.id)}
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </div>
            ))}
            {visibleCategories.length === 0 && (
              <p className="compact-empty" role="listitem">
                {t("No inventory categories yet.")}
              </p>
            )}
          </div>
        </aside>

        <main className="inventory-main-column">
          <section className="panel inventory-groups-panel">
            <header>
              <div>
                <p className="eyebrow">
                  {selectedCategory?.name ?? t("Inventory")}
                </p>
                <h2>{t("Groups")}</h2>
              </div>
              <div className="inventory-panel-actions">
                <button
                  className="button ghost-button"
                  disabled={!selectedCategory}
                  onClick={() =>
                    selectedCategory &&
                    loadHistory({ type: "category", id: selectedCategory.id })
                  }
                >
                  <History size={14} /> {t("Category history")}
                </button>
                {canManage && selectedCategory?.active === 1 && (
                  <button
                    className="button secondary-button"
                    onClick={() => openModal("group")}
                  >
                    <Plus size={14} /> {t("Add group")}
                  </button>
                )}
              </div>
            </header>
            <div className="inventory-group-list">
              {activeGroups.map((group) => (
                <button
                  key={group.id}
                  className={`inventory-group-card ${selectedGroup?.id === group.id ? "selected" : ""} ${!group.active ? "archived" : ""}`}
                  onClick={() => {
                    setGroupId(group.id);
                    setItemId(null);
                    void loadHistory(null);
                  }}
                >
                  <span>
                    <strong>
                      {group.name}
                      {!group.active && ` · ${t("Archived")}`}
                    </strong>
                    <small>
                      {
                        group.items.filter(
                          (item) => showArchived || item.active,
                        ).length
                      }{" "}
                      {t("items")}
                    </small>
                  </span>
                  <span className="inventory-group-actions">
                    {canManage && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`${t("Edit")} ${group.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openModal("group", group.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.stopPropagation();
                            openModal("group", group.id);
                          }
                        }}
                      >
                        <Pencil size={13} />
                      </span>
                    )}
                    <span>›</span>
                  </span>
                </button>
              ))}
              {activeGroups.length === 0 && (
                <p className="compact-empty">
                  {t("No groups in this category yet.")}
                </p>
              )}
            </div>
          </section>

          {selectedGroup && (
            <section className="panel inventory-items-panel">
              <header>
                <div className="inventory-group-title-block">
                  <p className="eyebrow">{selectedCategory?.name}</p>
                  <h2
                    className="inventory-group-title"
                    title={selectedGroup.name}
                  >
                    {selectedGroup.name}
                  </h2>
                  {selectedGroup.defaultLocationId && (
                    <small>
                      {t("Default location")}:{" "}
                      {data.locations.find(
                        (location) =>
                          location.id === selectedGroup.defaultLocationId,
                      )?.name ?? "—"}
                    </small>
                  )}
                  {selectedGroup.notes && (
                    <p className="inventory-group-notes">
                      <strong>{t("Notes")}:</strong> {selectedGroup.notes}
                    </p>
                  )}
                </div>
                <div className="inventory-item-toolbar">
                  <input
                    type="search"
                    value={inventorySearch}
                    onChange={(event) => {
                      setInventorySearch(event.target.value);
                      setItemId(null);
                      void loadHistory(null);
                    }}
                    placeholder={t("Search inventory")}
                    aria-label={t("Search inventory")}
                  />
                  {canManage && selectedGroup.active === 1 && (
                    <button
                      className="button secondary-button"
                      onClick={() => openModal("item")}
                    >
                      <PackagePlus size={14} /> {t("Add item")}
                    </button>
                  )}
                  <button
                    className="button secondary-button"
                    disabled={
                      !canManage ||
                      !activeLocations.length ||
                      !selectedGroup.items.some((item) => item.active)
                    }
                    onClick={() =>
                      openModal("count", undefined, {
                        type: "group",
                        id: selectedGroup.id,
                      })
                    }
                  >
                    <ClipboardCheck size={14} />{" "}
                    {t("Start group inventory count")}
                  </button>
                  <button
                    className="button ghost-button"
                    onClick={() =>
                      loadHistory({ type: "group", id: selectedGroup.id })
                    }
                  >
                    <History size={14} /> {t("Group history")}
                  </button>
                </div>
              </header>
              <div className="inventory-item-list-heading" aria-hidden="true">
                <span>{t("Inventory item")}</span>
                <span>{t("Availability")}</span>
                <span>{t("Minimum")}</span>
                <span>{t("Storage locations")}</span>
                {canManage && <span>{t("Actions")}</span>}
              </div>
              <div className="inventory-item-list">
                {visibleItems.map((item) => (
                  <div
                    key={item.id}
                    className={`inventory-item-row ${item.lowStock ? "low-stock" : ""} ${selectedItem?.id === item.id ? "selected" : ""} ${!item.active ? "archived" : ""}`}
                  >
                    <span className="inventory-item-name-cell">
                      <button
                        type="button"
                        className="inventory-item-name-button"
                        aria-pressed={selectedItem?.id === item.id}
                        onClick={() => {
                          setItemId(item.id);
                          void loadHistory({ type: "item", id: item.id });
                        }}
                      >
                        <strong>
                          {item.name}
                          {!item.active && ` · ${t("Archived")}`}
                        </strong>
                        <small>{item.unit}</small>
                      </button>
                    </span>
                    <span className="inventory-item-quantity">
                      <small>{t("Availability")}</small>
                      <strong>
                        {item.totalQuantity} {item.unit}
                      </strong>
                    </span>
                    <span className="inventory-item-quantity">
                      <small>{t("Minimum")}</small>
                      <strong>
                        {item.minimumTotal} {item.unit}
                      </strong>
                    </span>
                    <span className="inventory-item-location-count">
                      <small>{t("Storage locations")}</small>
                      <strong>{item.stocks.length}</strong>
                    </span>
                    <span className="inventory-item-actions-cell">
                      {item.lowStock && (
                        <span className="inventory-low-label">
                          {t("Below minimum")}
                        </span>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`${t("Edit")} ${item.name}`}
                          onClick={() => openModal("item", item.id)}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </span>
                  </div>
                ))}
                {visibleItems.length === 0 && (
                  <p className="compact-empty">
                    {activeItems.length
                      ? t("No inventory items match the search.")
                      : t("No inventory items in this group yet.")}
                  </p>
                )}
              </div>
            </section>
          )}

          {selectedItem && (
            <section className="panel inventory-detail-panel">
              <header>
                <div>
                  <p className="eyebrow">
                    {selectedItem.sku} · {selectedItem.unit}
                  </p>
                  <h2>{selectedItem.name}</h2>
                  <p>
                    <strong>{t("Notes")}:</strong>{" "}
                    {selectedItem.description || t("No notes added.")}
                  </p>
                </div>
                {canManage && (
                  <button
                    className="button secondary-button"
                    onClick={() => openModal("item", selectedItem.id)}
                  >
                    <Pencil size={14} /> {t("Edit item")}
                  </button>
                )}
              </header>
              <div className="inventory-item-facts">
                <span>
                  <small>{t("Total availability")}</small>
                  <strong>
                    {selectedItem.totalQuantity} {selectedItem.unit}
                  </strong>
                </span>
                <span>
                  <small>{t("Latest inventory count (any location)")}</small>
                  <strong>
                    {ukDate(selectedItem.lastInventoryDate) ||
                      t("Not counted yet.")}
                  </strong>
                </span>
                <span>
                  <small>{t("Next planned count")}</small>
                  <strong>
                    {ukDate(selectedItem.nextInventoryDate) ||
                      t("Not planned.")}
                  </strong>
                </span>
              </div>
              <div className="inventory-detail-actions">
                {canManage && selectedItem.active === 1 && (
                  <>
                    <button
                      className="button secondary-button"
                      disabled={!activeLocations.length}
                      onClick={() =>
                        openModal("count", undefined, {
                          type: "item",
                          id: selectedItem.id,
                        })
                      }
                    >
                      <ClipboardCheck size={14} /> {t("Start inventory count")}
                    </button>
                    <button
                      className="button secondary-button"
                      onClick={() => openModal("receipt")}
                    >
                      <ArrowDownToLine size={14} /> {t("Receipt")}
                    </button>
                    <button
                      className="button secondary-button"
                      onClick={() => openModal("decrease")}
                    >
                      <ArrowUpFromLine size={14} /> {t("Write-off")}
                    </button>
                    <button
                      className="button secondary-button"
                      onClick={() => openModal("transfer")}
                    >
                      <ArrowLeftRight size={14} /> {t("Transfer")}
                    </button>
                  </>
                )}
              </div>
              <h3>{t("Stock by location")}</h3>
              <label className="inventory-history-location-filter">
                {t("History location")}
                <select
                  value={
                    historyScope?.type === "item" &&
                    historyScope.id === selectedItem.id
                      ? (historyScope.locationId ?? "")
                      : ""
                  }
                  onChange={(event) => {
                    const locationId = event.target.value
                      ? Number(event.target.value)
                      : undefined;
                    void loadHistory({
                      type: "item",
                      id: selectedItem.id,
                      ...(locationId ? { locationId } : {}),
                    });
                  }}
                >
                  <option value="">{t("All locations")}</option>
                  {visibleLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="inventory-location-stock-list">
                {visibleLocations.map((location) => {
                  const stock = selectedItem.stocks.find(
                    (entry) => entry.locationId === location.id,
                  ) ?? {
                    locationId: location.id,
                    locationName: location.name,
                    quantity: 0,
                    minimumQuantity: 0,
                    version: 0,
                    updatedAt: "",
                  };
                  return (
                    <div className="inventory-location-stock" key={location.id}>
                      <span>
                        <MapPin size={14} />
                        <strong>{location.name}</strong>
                      </span>
                      <strong>
                        {stock.quantity} {selectedItem.unit}
                      </strong>
                      <small>
                        {t("Last count at this location")}:{" "}
                        {ukDate(
                          selectedItem.lastInventoryDateByLocation[
                            location.id
                          ] ?? null,
                        ) || t("Not counted yet.")}
                      </small>
                      {canManage && location.active ? (
                        <form
                          key={`${selectedItem.id}-${location.id}-${stock.minimumQuantity}`}
                          onSubmit={(event) =>
                            saveMinimum(event, selectedItem, location.id)
                          }
                        >
                          <label>{t("Minimum")}</label>
                          <input
                            name="minimumQuantity"
                            type="number"
                            min="0"
                            defaultValue={stock.minimumQuantity}
                            aria-label={`${t("Minimum quantity")} · ${location.name}`}
                          />
                          <button className="button ghost-button">
                            {t("Save")}
                          </button>
                        </form>
                      ) : (
                        <span>
                          {t("Minimum")}: {stock.minimumQuantity}
                        </span>
                      )}
                      {stock.quantity < stock.minimumQuantity && (
                        <em>{t("Below minimum")}</em>
                      )}
                    </div>
                  );
                })}
                {activeLocations.length === 0 && (
                  <p className="compact-empty">
                    {t("No storage locations configured.")}
                  </p>
                )}
              </div>
            </section>
          )}

          {countsDialogOpen && (
            <DialogBackdrop onClose={() => setCountsDialogOpen(false)}>
              <section
                className="dialog inventory-counts-dialog inventory-counts-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="inventory-counts-title"
              >
                <header>
                  <div>
                    <h2 id="inventory-counts-title">{t("Inventory counts")}</h2>
                    <p className="inventory-dialog-hint">
                      {t("Review open drafts and completed physical counts.")}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t("Close inventory counts")}
                    onClick={() => setCountsDialogOpen(false)}
                  >
                    ×
                  </button>
                </header>
                <div className="inventory-count-list">
                  {data.counts.map((count) => (
                    <button
                      key={count.id}
                      className={`inventory-count-choice ${selectedCount?.id === count.id ? "selected" : ""}`}
                      aria-pressed={selectedCount?.id === count.id}
                      onClick={() => {
                        setSelectedCountId(count.id);
                        setDraftSelectionIds(
                          count.lines.map((line) => line.itemId),
                        );
                        setCountInputs(
                          Object.fromEntries(
                            count.lines.map((line) => [
                              line.itemId,
                              line.countedQuantity === null
                                ? ""
                                : String(line.countedQuantity),
                            ]),
                          ),
                        );
                      }}
                    >
                      <span>
                        <strong>
                          {data.locations.find(
                            (location) => location.id === count.locationId,
                          )?.name ?? t("Unknown location")}
                        </strong>
                        <small>
                          {ukDate(count.countDate)} · {count.lines.length}{" "}
                          {t("items")}
                        </small>
                      </span>
                      <span
                        className={`status-pill ${count.status === "finalized" ? "success" : "pending"}`}
                      >
                        {count.status === "finalized"
                          ? t("Finalized")
                          : t("Draft")}
                      </span>
                    </button>
                  ))}
                  {data.counts.length === 0 && (
                    <p className="compact-empty">
                      {t("No inventory counts yet.")}
                    </p>
                  )}
                </div>
                {selectedCount && (
                  <div className="inventory-count-detail">
                    <div className="inventory-count-heading">
                      <div>
                        <h3>
                          {t("Inventory count")} ·{" "}
                          {ukDate(selectedCount.countDate)}
                        </h3>
                        <p>
                          {
                            data.locations.find(
                              (location) =>
                                location.id === selectedCount.locationId,
                            )?.name
                          }
                        </p>
                        <small>
                          {t("Count scope")}:{" "}
                          {selectedCount.scopeType === "item"
                            ? `${t("One item")}: ${selectedCount.lines[0]?.itemName ?? "—"}`
                            : selectedCount.scopeType === "group"
                              ? `${t("Group")}: ${data.groups.find((group) => group.id === selectedCount.scopeId)?.name ?? "—"}`
                              : t("Legacy location-wide draft")}
                        </small>
                      </div>
                      <span
                        className={`status-pill ${selectedCount.status === "finalized" ? "success" : "pending"}`}
                      >
                        {selectedCount.status === "finalized"
                          ? t("Finalized")
                          : t("Draft")}
                      </span>
                    </div>
                    {selectedCount.status === "draft" && !readOnlyPreview ? (
                      <>
                        <div className="inventory-count-selection">
                          <div className="inventory-count-selection-heading">
                            <strong>
                              {t("Selected items")}: {draftSelectionIds.length}
                            </strong>
                            {selectedCount.scopeType !== "item" && (
                              <button
                                type="button"
                                className="button ghost-button"
                                onClick={() =>
                                  setDraftSelectionIds(
                                    draftCountCandidates.map((item) => item.id),
                                  )
                                }
                              >
                                {t("Select all")}
                              </button>
                            )}
                          </div>
                          {draftCountCandidates.map((item) => (
                            <label
                              className="inventory-count-select-option"
                              key={item.id}
                            >
                              <input
                                type="checkbox"
                                checked={draftSelectionIds.includes(item.id)}
                                disabled={selectedCount.scopeType === "item"}
                                onChange={(event) =>
                                  setDraftSelectionIds((current) =>
                                    event.target.checked
                                      ? [...current, item.id]
                                      : current.filter((id) => id !== item.id),
                                  )
                                }
                              />
                              <span>
                                {item.name} ·{" "}
                                {item.stocks.find(
                                  (stock) =>
                                    stock.locationId ===
                                    selectedCount.locationId,
                                )?.quantity ?? 0}{" "}
                                {item.unit}
                              </span>
                            </label>
                          ))}
                          {selectedCount.scopeType !== "item" && (
                            <button
                              type="button"
                              className="button secondary-button"
                              disabled={busy || !draftSelectionIds.length}
                              onClick={saveDraftSelection}
                            >
                              {t(
                                "Save item selection and refresh expected quantities",
                              )}
                            </button>
                          )}
                        </div>
                        <form onSubmit={saveCountLines}>
                          <div className="inventory-count-table">
                            {selectedCount.lines.map((line) => (
                              <label
                                className="inventory-count-line"
                                key={line.id}
                              >
                                <span>
                                  <strong>{line.itemName}</strong>
                                  <small>
                                    {line.sku} · {t("Book quantity")}:{" "}
                                    {line.expectedQuantity} {line.unit}
                                  </small>
                                </span>
                                <span>{t("Counted quantity")}</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={countInputs[line.itemId] ?? ""}
                                  onChange={(event) =>
                                    setCountInputs((current) => ({
                                      ...current,
                                      [line.itemId]: event.target.value,
                                    }))
                                  }
                                  aria-label={`${t("Counted quantity")} · ${line.itemName}`}
                                />
                                <small className="inventory-count-difference">
                                  {countInputs[line.itemId] !== undefined &&
                                  countInputs[line.itemId] !== ""
                                    ? `${t("Difference")}: ${Number(countInputs[line.itemId]) - line.expectedQuantity} ${line.unit}`
                                    : t("Not counted")}
                                </small>
                              </label>
                            ))}
                          </div>
                          <div className="inventory-count-actions">
                            <button
                              className="button secondary-button"
                              disabled={busy}
                            >
                              {t("Save count draft")}
                            </button>
                            <button
                              type="button"
                              className="button ghost-button"
                              disabled={busy}
                              onClick={async () => {
                                if (
                                  await send({
                                    action: "count.refresh",
                                    countId: selectedCount.id,
                                  })
                                )
                                  setCountInputs({});
                              }}
                            >
                              {t("Refresh expected quantities")}
                            </button>
                            <button
                              type="button"
                              className="button primary-button"
                              disabled={busy}
                              onClick={() => setConfirmCountFinalize(true)}
                            >
                              {t("Finalize count")}
                            </button>
                          </div>
                        </form>
                      </>
                    ) : (
                      <div className="inventory-count-table">
                        {selectedCount.lines.map((line) => (
                          <div className="inventory-count-line" key={line.id}>
                            <span>
                              <strong>{line.itemName}</strong>
                              <small>
                                {t("Book quantity")}: {line.expectedQuantity}{" "}
                                {line.unit}
                              </small>
                            </span>
                            <strong>
                              {t("Counted")}:{" "}
                              {line.effectiveCountedQuantity ??
                                line.countedQuantity}{" "}
                              {line.unit}
                            </strong>
                            {isSuperAdmin && (
                              <button
                                className="button ghost-button"
                                onClick={() => {
                                  setCorrectionTarget({
                                    type: "count_line",
                                    id: line.id,
                                    value:
                                      line.effectiveCountedQuantity ??
                                      line.countedQuantity ??
                                      0,
                                  });
                                  openModal("correction");
                                }}
                              >
                                {" "}
                                {t("Correct history")}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </DialogBackdrop>
          )}

          {historyScope && (
            <section className="panel inventory-history-panel">
              <header>
                <div>
                  <p className="eyebrow">{t("History is always enabled")}</p>
                  <h2>
                    {t("History for")}: {historyContextTitle}
                  </h2>
                  {historyScope.locationId && (
                    <small>
                      {t("Location")}:{" "}
                      {
                        data.locations.find(
                          (location) => location.id === historyScope.locationId,
                        )?.name
                      }
                    </small>
                  )}
                </div>
                <button
                  className="icon-button"
                  aria-label={t("Close history")}
                  onClick={() => void loadHistory(null)}
                >
                  ×
                </button>
              </header>
              {historyRows.map((entry) => (
                <div className="inventory-history-row" key={entry.key}>
                  <span>
                    <Clock3 size={14} />
                    <strong>{entry.title}</strong>
                    <small>
                      {entry.details} · {entry.actor}
                    </small>
                  </span>
                  {entry.amount && <strong>{entry.amount}</strong>}
                  <time>
                    {new Date(entry.createdAt).toLocaleString("uk-UA")}
                  </time>
                  {isSuperAdmin && entry.correctionType && (
                    <button
                      className="button ghost-button"
                      onClick={() => {
                        setCorrectionTarget({
                          type: entry.correctionType!,
                          id: entry.correctionId,
                          value: entry.correctionValue,
                        });
                        openModal("correction");
                      }}
                    >
                      {t("Correct history")}
                    </button>
                  )}
                </div>
              ))}
              {historyRows.length === 0 && (
                <p className="compact-empty">
                  {t("No history for this context yet.")}
                </p>
              )}
            </section>
          )}
        </main>
      </div>

      {locationsDialogOpen && (
        <DialogBackdrop onClose={() => setLocationsDialogOpen(false)}>
          <section
            className="dialog inventory-locations-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-locations-title"
          >
            <header>
              <div>
                <h2 id="inventory-locations-title">{t("Storage locations")}</h2>
                <p>{t("Manage the places where stock is kept.")}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={t("Close storage locations")}
                onClick={() => setLocationsDialogOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="inventory-location-admin-toolbar">
              <button
                type="button"
                className="button ghost-button inventory-archive-toggle"
                aria-pressed={showArchived}
                onClick={() => setShowArchived((value) => !value)}
              >
                {showArchived ? t("Hide archived") : t("Show archived")}
              </button>
              {canManage && (
                <button
                  type="button"
                  className="button secondary-button"
                  onClick={() => openModal("location")}
                >
                  <Plus size={14} /> {t("Add location")}
                </button>
              )}
            </div>
            <div className="inventory-location-admin-list" role="list">
              {visibleLocations.map((location) => (
                <div
                  className={`inventory-location-admin-row ${!location.active ? "archived" : ""}`}
                  key={location.id}
                  role="listitem"
                >
                  <span className="inventory-location-icon">
                    <MapPin size={14} />
                  </span>
                  <span className="inventory-location-admin-copy">
                    <strong>{location.name}</strong>
                    {location.description && (
                      <small>
                        {location.description ===
                        "Migrated from office inventory"
                          ? t("Migrated from office inventory")
                          : location.description}
                      </small>
                    )}
                  </span>
                  {!location.active && (
                    <span className="status-pill pending">{t("Archived")}</span>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      className="icon-button inventory-location-edit"
                      aria-label={`${t("Edit")} ${location.name}`}
                      onClick={() => openModal("location", location.id)}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              ))}
              {visibleLocations.length === 0 && (
                <p className="compact-empty" role="listitem">
                  {t("Add a storage location to start tracking stock.")}
                </p>
              )}
            </div>
          </section>
        </DialogBackdrop>
      )}

      {(!canManage || readOnlyPreview) && (
        <p className="inventory-readonly-note">
          <ShieldCheck size={14} />
          {t("You have read-only inventory access.")}
        </p>
      )}

      {modal && !readOnlyPreview && (
        <DialogBackdrop onClose={() => setModal(null)}>
          <form
            className="dialog compact-dialog form-grid inventory-dialog"
            onSubmit={submitModal}
          >
            <h2 className="span-two">{t(modalTitle[modal])}</h2>
            {(modal === "category" ||
              modal === "group" ||
              modal === "location" ||
              modal === "item") && (
              <>
                {modal === "group" && (
                  <label>
                    <span>
                      {t("Category")}
                      <RequiredMark />
                    </span>
                    <select
                      name="categoryId"
                      defaultValue={String(selectedCategory?.id ?? "")}
                      required
                    >
                      {data.categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {modal === "item" && (
                  <label>
                    <span>
                      {t("Group")}
                      <RequiredMark />
                    </span>
                    <select
                      name="groupId"
                      defaultValue={String(
                        itemGroupId ?? selectedGroup?.id ?? "",
                      )}
                      onChange={(event) =>
                        setItemGroupId(Number(event.target.value))
                      }
                      required
                    >
                      {data.groups
                        .filter((group) => group.active)
                        .map((group) => (
                          <option key={group.id} value={group.id}>
                            {
                              data.categories.find(
                                (category) => category.id === group.categoryId,
                              )?.name
                            }{" "}
                            · {group.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {field(
                  "Name",
                  "name",
                  String(currentEdit?.name ?? ""),
                  "text",
                  true,
                )}
                {(modal === "category" || modal === "location") &&
                  field(
                    "Description",
                    "description",
                    String(
                      (currentEdit as { description?: string } | null)
                        ?.description ?? "",
                    ),
                  )}
                {modal === "category" &&
                  field(
                    "Order",
                    "sortOrder",
                    String(editingCategory?.sortOrder ?? 0),
                    "number",
                  )}
                {modal === "group" && (
                  <>
                    <label>
                      {t("Default storage location")}
                      <select
                        name="defaultLocationId"
                        defaultValue={String(
                          (
                            currentEdit as {
                              defaultLocationId?: number | null;
                            } | null
                          )?.defaultLocationId ?? "",
                        )}
                      >
                        <option value="">{t("None")}</option>
                        {activeLocations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {field(
                      "Notes",
                      "notes",
                      String(
                        (currentEdit as { notes?: string } | null)?.notes ?? "",
                      ),
                    )}
                  </>
                )}
                {modal === "item" && (
                  <>
                    {field(
                      "Inventory code",
                      "sku",
                      editingItem?.sku ?? "",
                      "text",
                      true,
                    )}
                    {field(
                      "Notes",
                      "description",
                      editingItem?.description ?? "",
                    )}
                    <div className="inventory-date-field">
                      <DateField
                        name="next-inventory-date"
                        label={t("Next planned count")}
                        value={
                          editingItem
                            ? (editingItem.nextInventoryDate ?? "")
                            : ""
                        }
                        onValueChange={setDateValue}
                      />
                    </div>
                    {canManage && (
                      <InventoryAssetFields
                        key={editingItem?.id ?? "new"}
                        asset={editingItem?.asset}
                        people={people}
                        orgUnits={orgUnits}
                        groupName={
                          data.groups.find((group) => group.id === itemGroupId)
                            ?.name ?? ""
                        }
                      />
                    )}
                  </>
                )}
                <label
                  className={`inventory-active-field ${modal === "category" ? "inventory-category-active-field span-two" : ""}`}
                >
                  {modal !== "category" && <span>{t("Active status")}</span>}
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={
                      Number(
                        (currentEdit as { active?: number } | null)?.active ??
                          1,
                      ) === 1
                    }
                  />
                  {modal === "category" && <span>{t("Active status")}</span>}
                </label>
              </>
            )}
            {(modal === "receipt" ||
              modal === "decrease" ||
              modal === "transfer") &&
              selectedItem && (
                <>
                  <p className="inventory-dialog-hint span-two">
                    {selectedItem.name} · {selectedItem.unit} ·{" "}
                    {t("Current total")}: {selectedItem.totalQuantity}{" "}
                    {selectedItem.unit}
                  </p>
                  <label>
                    <span>
                      {t(
                        modal === "transfer"
                          ? "From storage location"
                          : "Storage location",
                      )}
                      <RequiredMark />
                    </span>
                    <select name="sourceLocationId" defaultValue="" required>
                      <option value="" disabled>
                        {t("Select location")}
                      </option>
                      {activeLocations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name} (
                          {selectedItem.stocks.find(
                            (stock) => stock.locationId === location.id,
                          )?.quantity ?? 0}{" "}
                          {selectedItem.unit})
                        </option>
                      ))}
                    </select>
                  </label>
                  {modal === "transfer" && (
                    <label>
                      <span>
                        {t("To storage location")}
                        <RequiredMark />
                      </span>
                      <select
                        name="destinationLocationId"
                        defaultValue=""
                        required
                      >
                        <option value="" disabled>
                          {t("Select location")}
                        </option>
                        {activeLocations
                          .filter(
                            (location) =>
                              location.id !==
                              selectedItem.stocks[0]?.locationId,
                          )
                          .map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {field("Quantity", "quantity", "1", "number", true)}
                  {field("Reason", "reason", "", "text", true)}
                </>
              )}
            {modal === "count" && (
              <>
                <p className="inventory-dialog-hint span-two">
                  {countScope?.type === "item"
                    ? `${t("Inventory count for item")}: ${countCandidates[0]?.name ?? "—"}`
                    : `${t("Inventory count for group")}: ${countGroup?.name ?? "—"}`}
                  {countCategory ? ` · ${countCategory.name}` : ""}
                </p>
                <label>
                  <span>
                    {t("Storage location")}
                    <RequiredMark />
                  </span>
                  <select
                    name="locationId"
                    value={countLocationId ?? ""}
                    onChange={(event) =>
                      setCountLocationId(
                        event.target.value ? Number(event.target.value) : null,
                      )
                    }
                    required
                  >
                    <option value="" disabled>
                      {t("Select location")}
                    </option>
                    {activeLocations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </label>
                {countScope?.type === "group" && (
                  <fieldset className="inventory-count-candidates span-two">
                    <legend>{t("Choose exactly which items to count")}</legend>
                    {!countLocationId ? (
                      <p className="inventory-count-location-prompt">
                        {t(
                          "First choose a storage location to see its quantities and select items.",
                        )}
                      </p>
                    ) : (
                      <>
                        <div className="inventory-count-selection-heading">
                          <span>
                            {t("Selected items")}: {countItemIds.length}
                          </span>
                          <button
                            type="button"
                            className="button ghost-button"
                            onClick={() =>
                              setCountItemIds(
                                countCandidates
                                  .filter((item) => item.active)
                                  .map((item) => item.id),
                              )
                            }
                          >
                            {t("Select all")}
                          </button>
                        </div>
                        {countCandidates.map((item) => {
                          const stock = item.stocks.find(
                            (entry) => entry.locationId === countLocationId,
                          );
                          return (
                            <div
                              className="inventory-count-candidate"
                              key={item.id}
                            >
                              <label className="inventory-count-select-option">
                                <input
                                  type="checkbox"
                                  checked={countItemIds.includes(item.id)}
                                  disabled={!item.active}
                                  onChange={(event) =>
                                    setCountItemIds((current) =>
                                      event.target.checked
                                        ? [...current, item.id]
                                        : current.filter(
                                            (id) => id !== item.id,
                                          ),
                                    )
                                  }
                                />
                                <span>
                                  <strong>{item.name}</strong>
                                  <small>
                                    {t("Book quantity")}: {stock?.quantity ?? 0}{" "}
                                    {item.unit}
                                    {" · "}
                                    {t("Minimum")}:{" "}
                                    {stock?.minimumQuantity ?? 0} {item.unit}
                                  </small>
                                </span>
                              </label>
                              <details>
                                <summary>{t("Item details")}</summary>
                                <p>
                                  {t("Last inventory count (any location)")}:{" "}
                                  {ukDate(item.lastInventoryDate) ||
                                    t("Not counted yet.")}
                                </p>
                                <p>
                                  {t("Next planned count")}:{" "}
                                  {ukDate(item.nextInventoryDate) ||
                                    t("Not planned.")}
                                </p>
                                <p>
                                  {t("Notes")}:{" "}
                                  {item.description || t("No notes added.")}
                                </p>
                              </details>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </fieldset>
                )}
                {countScope?.type === "item" &&
                  countCandidates.map((item) => (
                    <div
                      className="inventory-count-review span-two"
                      key={item.id}
                    >
                      <strong>
                        {t("Only this item will be included")}: {item.name}
                      </strong>
                      <span>
                        {countLocationId
                          ? `${t("Storage location")}: ${data.locations.find((location) => location.id === countLocationId)?.name ?? "—"} · ${t("Book quantity")}: ${item.stocks.find((stock) => stock.locationId === countLocationId)?.quantity ?? 0} ${item.unit} · ${t("Minimum")}: ${item.stocks.find((stock) => stock.locationId === countLocationId)?.minimumQuantity ?? 0} ${item.unit}`
                          : t("Choose a location first")}
                      </span>
                      {countLocationId && (
                        <small>
                          {t("Last inventory count (any location)")}:{" "}
                          {ukDate(item.lastInventoryDate) ||
                            t("Not counted yet.")}{" "}
                          · {t("Next planned count")}:{" "}
                          {ukDate(item.nextInventoryDate) || t("Not planned.")}{" "}
                          · {t("Notes")}:{" "}
                          {item.description || t("No notes added.")}
                        </small>
                      )}
                    </div>
                  ))}
                {countScope?.type === "group" &&
                  countLocationId &&
                  countItemIds.length > 0 && (
                    <div className="inventory-count-review span-two">
                      <strong>
                        {t("Review selected scope")}: {countItemIds.length}{" "}
                        {t("items")}
                      </strong>
                      <span>
                        {countCandidates
                          .filter((item) => countItemIds.includes(item.id))
                          .map(
                            (item) =>
                              `${item.name}: ${item.stocks.find((stock) => stock.locationId === countLocationId)?.quantity ?? 0} ${item.unit}`,
                          )
                          .join(" · ")}
                      </span>
                    </div>
                  )}
                <div className="inventory-date-field">
                  <DateField
                    name="count-date"
                    label={t("Count date")}
                    value={dateValue}
                    required
                    requiredMark
                    onValueChange={setDateValue}
                  />
                </div>
                <label className="span-two">
                  {t("Notes")}
                  <textarea name="notes" rows={2} />
                </label>
              </>
            )}
            {modal === "correction" && correctionTarget && (
              <>
                <p className="inventory-dialog-hint span-two">
                  {t("Original value")}: {correctionTarget.value}
                </p>
                {field(
                  "Corrected quantity",
                  "correctedValue",
                  String(correctionTarget.value),
                  "number",
                  true,
                )}
                <label className="span-two">
                  <span>
                    {t("Correction reason")}
                    <RequiredMark />
                  </span>
                  <textarea name="reason" rows={3} required minLength={5} />
                </label>
                <p className="inventory-dialog-hint span-two">
                  {t(
                    "The original history record stays unchanged; a compensating event is added.",
                  )}
                </p>
              </>
            )}
            {error && <p className="form-error span-two">{t(error)}</p>}
            <div className="dialog-actions span-two">
              <button
                type="button"
                className="button ghost-button"
                onClick={() => setModal(null)}
              >
                {t("Cancel")}
              </button>
              <button
                className="button primary-button"
                disabled={
                  busy ||
                  (modal === "count" &&
                    (!countLocationId || countItemIds.length === 0))
                }
              >
                {busy
                  ? t("Saving…")
                  : modal === "count"
                    ? t("Create count draft")
                    : t("Save")}
              </button>
            </div>
          </form>
        </DialogBackdrop>
      )}
      {confirmCountFinalize && selectedCount && !readOnlyPreview && (
        <DialogBackdrop onClose={() => setConfirmCountFinalize(false)}>
          <section
            className="dialog compact-dialog inventory-finalize-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-finalize-title"
          >
            <h2 id="inventory-finalize-title">
              {t("Confirm inventory count")}
            </h2>
            <p>
              {
                data.locations.find(
                  (location) => location.id === selectedCount.locationId,
                )?.name
              }{" "}
              · {ukDate(selectedCount.countDate)}
            </p>
            <div className="inventory-finalize-lines">
              {selectedCount.lines.map((line) => {
                const value = countInputs[line.itemId];
                return (
                  <div key={line.id}>
                    <strong>{line.itemName}</strong>
                    <span>
                      {t("Expected stock")}: {line.expectedQuantity} {line.unit}
                    </span>
                    <span>
                      {t("Counted")}: {value || t("Not counted")}
                      {value ? ` ${line.unit}` : ""}
                    </span>
                    <span>
                      {value === undefined || value === ""
                        ? t("Difference unavailable until counted")
                        : `${t("Difference")}: ${Number(value) - line.expectedQuantity} ${line.unit}`}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                className="button ghost-button"
                onClick={() => setConfirmCountFinalize(false)}
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                className="button primary-button"
                disabled={
                  busy ||
                  getCurrentCountLines(selectedCount).some(
                    (line) => line.countedQuantity === null,
                  )
                }
                onClick={finalizeCount}
              >
                {t("Confirm and reconcile stock")}
              </button>
            </div>
          </section>
        </DialogBackdrop>
      )}
    </div>
  );
}

/**
 * Characteristics with their own field, by inventory group. Values are stored
 * as item attributes under these labels; anything else goes to the optional
 * "additional characteristics" text.
 */
const ASSET_SPEC_FIELDS = [
  { name: "specDiagonal", label: "Діагональ", groups: ["Ноутбук", "Монітор"] },
  { name: "specProcessor", label: "Процесор", groups: ["Ноутбук"] },
  { name: "specMemory", label: "Пам’ять", groups: ["Ноутбук"] },
  { name: "specYear", label: "Рік", groups: ["Ноутбук"] },
  { name: "specSsd", label: "SSD", groups: ["Ноутбук"] },
] as const;

/** Parses "Label: value" lines into item characteristics. */
function parseAttributeLines(text: string) {
  return text
    .split("\n")
    .map((line) => {
      const separator = line.indexOf(":");
      return separator < 0
        ? null
        : {
            label: line.slice(0, separator).trim(),
            value: line.slice(separator + 1).trim(),
          };
    })
    .filter((item): item is { label: string; value: string } =>
      Boolean(item?.label && item.value),
    );
}

/** Dedicated fields win over the same label typed in the free text. */
function mergeAttributes(
  fields: { label: string; value: string }[],
  extra: { label: string; value: string }[],
) {
  const labels = new Set(fields.map((item) => item.label));
  return [
    ...fields.filter((item) => item.value),
    ...extra.filter((item) => !labels.has(item.label)),
  ];
}

/** "employee:<id>" or "name:<text>" from the holder dropdown. */
function parseHolder(value: string) {
  if (value.startsWith("employee:"))
    return {
      assignedEmployeeId: Number(value.slice("employee:".length)),
      assigneeName: "",
    };
  if (value.startsWith("name:"))
    return { assignedEmployeeId: null, assigneeName: value.slice(5) };
  return { assignedEmployeeId: null, assigneeName: "" };
}

/** Choices plus the current value when it is not among them. */
function withCurrent(options: string[], current?: string) {
  return current && !options.includes(current)
    ? [...options, current]
    : options;
}

function InventoryAssetFields({
  asset,
  people,
  orgUnits,
  groupName,
}: {
  asset?: InventoryItemDto["asset"];
  people: { id: number; firstName: string; lastName: string }[];
  orgUnits: { divisions: string[]; departments: string[] };
  groupName: string;
}) {
  const { t } = useI18n();
  const attributes = asset?.attributes ?? [];
  const specs = ASSET_SPEC_FIELDS.filter((spec) =>
    (spec.groups as readonly string[]).includes(groupName),
  );
  const specLabels = new Set<string>(
    ASSET_SPEC_FIELDS.map((spec) => spec.label),
  );
  const holder = asset?.assignedEmployeeId
    ? `employee:${asset.assignedEmployeeId}`
    : asset?.assigneeName
      ? `name:${asset.assigneeName}`
      : "";
  const holderPeople =
    asset?.assignedEmployeeId &&
    !people.some((person) => person.id === asset.assignedEmployeeId)
      ? [
          ...people,
          {
            id: asset.assignedEmployeeId,
            firstName: asset.assignedEmployeeName ?? "",
            lastName: "",
          },
        ]
      : people;
  return (
    <fieldset className="inventory-asset-fields span-two">
      <legend>{t("Asset details")}</legend>
      <label>
        {t("Serial number")}
        <input name="serialNumber" defaultValue={asset?.serialNumber ?? ""} />
      </label>
      <label>
        {t("Price")}
        <input name="price" defaultValue={asset?.price ?? ""} />
      </label>
      {specs.map((spec) => (
        <label key={spec.name}>
          {spec.label}
          <input
            name={spec.name}
            defaultValue={
              attributes.find((item) => item.label === spec.label)?.value ?? ""
            }
          />
        </label>
      ))}
      <label>
        {t("Division")}
        <select name="division" defaultValue={asset?.division ?? ""}>
          <option value="">{t("Not specified")}</option>
          {withCurrent(orgUnits.divisions, asset?.division).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("Department")}
        <select name="department" defaultValue={asset?.department ?? ""}>
          <option value="">{t("Not specified")}</option>
          {withCurrent(orgUnits.departments, asset?.department).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("Assigned to")}
        <select name="holder" defaultValue={holder}>
          <option value="">{t("Not assigned")}</option>
          {holderPeople.map((person) => (
            <option key={person.id} value={`employee:${person.id}`}>
              {`${person.firstName} ${person.lastName}`.trim()}
            </option>
          ))}
          {asset?.assigneeName && (
            <option value={`name:${asset.assigneeName}`}>
              {asset.assigneeName} ({t("not in the system")})
            </option>
          )}
        </select>
      </label>
      <label>
        {t("Assigned since")}
        <input
          name="assignedSince"
          type="date"
          defaultValue={asset?.assignedSince ?? ""}
        />
      </label>
      <label>
        {t("Warranty ends")}
        <input
          name="warrantyEnds"
          type="date"
          defaultValue={asset?.warrantyEnds ?? ""}
        />
      </label>
      <label className="span-two">
        {t("Additional characteristics")}
        <textarea
          name="attributes"
          rows={3}
          defaultValue={attributes
            .filter(
              (item) =>
                !specLabels.has(item.label) ||
                !specs.some((spec) => spec.label === item.label),
            )
            .map((item) => `${item.label}: ${item.value}`)
            .join("\n")}
        />
      </label>
      <label className="span-two">
        {t("Repair history")}
        <textarea
          name="repairHistory"
          rows={3}
          defaultValue={asset?.repairHistory ?? ""}
        />
      </label>
    </fieldset>
  );
}

/** Red asterisk after the label of a required field. */
function RequiredMark() {
  return (
    <span className="required-mark" aria-hidden="true">
      *
    </span>
  );
}
