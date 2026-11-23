"use client";

import { FormEvent, useMemo, useState } from "react";
import { Box, Plus, Wrench } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { SearchableEmployeeSelect } from "@/components/ui/SearchableEmployeeSelect";

type Asset = {
  id: number;
  name: string;
  assetTag: string;
  category: string;
  status: string;
  assignedEmployeeId: number | null;
  assigneeFirstName: string | null;
  assigneeLastName: string | null;
  serialNumber: string;
  note: string;
  latestEvent: { eventType: string; createdAt: string } | null;
};
type Person = { id: number; firstName: string; lastName: string };
const statuses = ["available", "assigned", "repair", "retired"];

export function AssetWorkspace({
  assets: initialAssets,
  people,
  canManage,
}: {
  assets: Asset[];
  people: Person[];
  canManage: boolean;
}) {
  const { t } = useI18n();
  const [assets, setAssets] = useState(initialAssets);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const visible = useMemo(
    () => assets.filter((asset) => filter === "all" || asset.status === filter),
    [assets, filter],
  );
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        Object.fromEntries(new FormData(event.currentTarget)),
      ),
    });
    const result = (await response.json()) as { asset?: Asset; error?: string };
    if (!response.ok || !result.asset)
      return setError(result.error ?? "Could not add asset.");
    setAssets((items) => [
      ...items,
      {
        ...result.asset!,
        latestEvent: null,
        assigneeFirstName: null,
        assigneeLastName: null,
      },
    ]);
    setOpen(false);
  }
  async function update(
    asset: Asset,
    status: string,
    assignedEmployeeId = asset.assignedEmployeeId ?? "",
  ) {
    const response = await fetch("/api/assets", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: asset.id,
        status,
        assignedEmployeeId,
      }),
    });
    const result = (await response.json()) as { asset?: Asset; error?: string };
    if (!response.ok || !result.asset) {
      setError(result.error ?? "Could not update asset.");
      return;
    }
    setError("");
    if (result.asset)
      setAssets((items) =>
        items.map((item) =>
          item.id === asset.id ? { ...item, ...result.asset } : item,
        ),
      );
  }
  return (
    <>
      <section className="page-heading-row">
        <div>
          <p className="eyebrow">{t("People operations")}</p>
          <h1>{t("Assets")}</h1>
          <p>{t("Company equipment, allocation and lifecycle status.")}</p>
        </div>
        {canManage && (
          <button
            className="button primary-button"
            onClick={() => setOpen(true)}
          >
            <Plus size={16} />
            {t("Add asset")}
          </button>
        )}
      </section>
      <nav className="section-tabs" aria-label={t("Asset filters")}>
        {["all", ...statuses].map((value) => (
          <button
            type="button"
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
            key={value}
          >
            {t(value === "all" ? "All" : value)}
          </button>
        ))}
      </nav>
      <section className="asset-grid">
        {visible.map((asset) => (
          <article className="panel asset-card" key={asset.id}>
            <span className={`asset-icon ${asset.status}`}>
              <Box size={20} />
            </span>
            <div>
              <span className="asset-tag">{asset.assetTag}</span>
              <h2>{asset.name}</h2>
              <p>
                {t(asset.category)} ·{" "}
                {asset.serialNumber || t("No serial number")}
              </p>
              <small>
                {asset.assigneeFirstName
                  ? `${asset.assigneeFirstName} ${asset.assigneeLastName}`
                  : t("Unassigned")}
              </small>
              {asset.latestEvent && (
                <small>
                  {t("Last movement")} · {t(asset.latestEvent.eventType)}
                </small>
              )}
            </div>
            <div className="asset-card-footer">
              <span className={`status-pill ${asset.status}`}>
                {t(asset.status)}
              </span>
              {canManage && (
                <span className="asset-controls">
                  <select
                    value={asset.status}
                    onChange={(event) =>
                      update(
                        asset,
                        event.target.value,
                        event.target.value === "assigned"
                          ? (asset.assignedEmployeeId ?? "")
                          : "",
                      )
                    }
                    aria-label={t("Asset status")}
                  >
                    {statuses.map((status) => (
                      <option value={status} key={status}>
                        {t(status)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={asset.assignedEmployeeId ?? ""}
                    onChange={(event) =>
                      update(
                        asset,
                        event.target.value ? "assigned" : "available",
                        event.target.value || "",
                      )
                    }
                    aria-label={t("Assigned to")}
                  >
                    <option value="">{t("Unassigned")}</option>
                    {people.map((person) => (
                      <option value={person.id} key={person.id}>
                        {person.firstName} {person.lastName}
                      </option>
                    ))}
                  </select>
                </span>
              )}
            </div>
          </article>
        ))}
        {visible.length === 0 && (
          <div className="compact-empty">
            <Wrench size={18} />
            {t("No assets in this view.")}
          </div>
        )}
      </section>
      {open && (
        <DialogBackdrop onClose={() => setOpen(false)}>
          <form className="dialog compact-dialog form-grid" onSubmit={create}>
            <h2>{t("Add asset")}</h2>
            <label>
              {t("Asset name")}
              <input name="name" required autoFocus />
            </label>
            <label>
              {t("Asset tag")}
              <input name="assetTag" placeholder="INC-001" required />
            </label>
            <label>
              {t("Category")}
              <select name="category">
                <option value="equipment">{t("equipment")}</option>
                <option value="accessory">{t("accessory")}</option>
                <option value="software">{t("software")}</option>
                <option value="other">{t("other")}</option>
              </select>
            </label>
            <label>
              {t("Assigned to")}
              <SearchableEmployeeSelect
                name="assignedEmployeeId"
                options={people}
                placeholder={t("Unassigned")}
                searchPlaceholder={t("Search by name or position")}
                emptyLabel={t("No employees found.")}
              />
            </label>
            <label className="span-two">
              {t("Serial number")}
              <input name="serialNumber" />
            </label>
            <label className="span-two">
              {t("Note")}
              <textarea name="note" rows={3} />
            </label>
            {error && <p className="form-error">{t(error)}</p>}
            <div className="dialog-actions">
              <button
                type="button"
                className="button ghost-button"
                onClick={() => setOpen(false)}
              >
                {t("Cancel")}
              </button>
              <button className="button primary-button">
                {t("Add asset")}
              </button>
            </div>
          </form>
        </DialogBackdrop>
      )}
    </>
  );
}
