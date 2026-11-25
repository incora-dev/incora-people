"use client";

import {
  Coffee,
  Download,
  Laptop,
  Microwave,
  Monitor,
  MonitorSmartphone,
  PlugZap,
  Smartphone,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { csvCell } from "@/lib/csv";

export type AssetDetails = {
  name: string;
  assetTag: string;
  category: string;
  status: string;
  serialNumber: string;
  price: string;
  location: string;
  division: string;
  department: string;
  warrantyEnds: string | null;
  description: string;
  repairHistory: string;
  /** Category-specific characteristics such as model, year or memory. */
  attributes: { label: string; value: string }[];
  /** False when the source (office inventory) does not record holders. */
  assignmentTracked: boolean;
  assignee: {
    firstName: string;
    lastName: string;
    jobTitle: string;
    /** ISO date the asset was handed over. */
    assignedSince: string | null;
  } | null;
};

const categoryIcons: Record<string, LucideIcon> = {
  laptop: Laptop,
  phone: Smartphone,
  monitor: Monitor,
  coffee_machine: Coffee,
  microwave: Microwave,
  charger: PlugZap,
};

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

export function AssetDetailsDialog({
  asset,
  onClose,
}: {
  asset: AssetDetails;
  onClose: () => void;
}) {
  const { locale, t } = useI18n();
  const Icon = categoryIcons[asset.category] ?? MonitorSmartphone;
  const assignment = asset.assignee
    ? t("Assigned")
    : asset.status === "repair"
      ? t("In repair")
      : t("Not assigned");
  const details: { label: string; value: string }[] = [
    { label: t("Code"), value: asset.assetTag },
    { label: t("Category"), value: t(asset.category) },
    { label: t("Serial number"), value: asset.serialNumber },
    { label: t("Price"), value: asset.price },
    { label: t("Location"), value: asset.location },
    { label: t("Division"), value: asset.division },
    { label: t("Department"), value: asset.department },
    {
      label: t("Warranty ends"),
      value: asset.warrantyEnds ? formatDate(asset.warrantyEnds, locale) : "",
    },
    ...asset.attributes.map((item) => ({
      label: t(item.label),
      value: item.value,
    })),
  ];

  function download() {
    const rows = [
      [t("Name"), asset.name],
      ...details.map((item) => [item.label, item.value]),
      [
        t("Assigned to"),
        asset.assignee
          ? `${asset.assignee.firstName} ${asset.assignee.lastName}`
          : assignment,
      ],
      [t("Description"), asset.description],
      [t("Repair history"), asset.repairHistory],
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `asset-${asset.assetTag}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DialogBackdrop onClose={onClose}>
      <div
        className="dialog asset-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-dialog-title"
      >
        <div className="asset-dialog-bar">
          <span>
            {t("Assets")} · {asset.assetTag}
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={download}
            aria-label={t("Download")}
            title={t("Download")}
          >
            <Download size={18} />
          </button>
          <span className="asset-dialog-bar-divider" />
          <kbd>Esc</kbd>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t("Close")}
          >
            <X size={18} />
          </button>
        </div>

        <header className="asset-dialog-header">
          <span className="asset-dialog-icon">
            <Icon size={22} />
          </span>
          <div>
            <h2 id="asset-dialog-title">
              {asset.name}
              {asset.assignmentTracked && (
                <span
                  className={`asset-unassigned${asset.assignee ? " asset-assigned" : ""}`}
                >
                  {assignment}
                </span>
              )}
            </h2>
            <p>
              {[t(asset.category), asset.serialNumber]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </header>

        <div className="asset-dialog-body">
          <section className="asset-dialog-main">
            <h3>{t("Details")}</h3>
            <dl className="asset-dialog-details">
              {details
                .filter(
                  (item, index) =>
                    asset.assignmentTracked || index < 2 || item.value,
                )
                .map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value || "—"}</dd>
                  </div>
                ))}
            </dl>
            <h3>{t("Description")}</h3>
            <p className="asset-dialog-description">
              {asset.description || "—"}
            </p>
            {(asset.assignmentTracked || asset.repairHistory) && (
              <>
                <h3>{t("Repair history")}</h3>
                <p className="asset-dialog-description">
                  {asset.repairHistory || "—"}
                </p>
              </>
            )}
          </section>

          <aside className="asset-dialog-side">
            <h3>{t("Current assignment")}</h3>
            {asset.assignee ? (
              <div className="asset-dialog-assignee">
                <span className="avatar">
                  {asset.assignee.firstName[0]}
                  {asset.assignee.lastName[0]}
                </span>
                <div>
                  <strong>
                    {asset.assignee.firstName} {asset.assignee.lastName}
                  </strong>
                  {asset.assignee.jobTitle && (
                    <span>{asset.assignee.jobTitle}</span>
                  )}
                  {asset.assignee.assignedSince && (
                    <small>
                      {t("Since")}{" "}
                      {formatShortDate(asset.assignee.assignedSince)}
                    </small>
                  )}
                </div>
              </div>
            ) : (
              <div className="asset-dialog-assignment">
                {
                  <>
                    <span className="asset-dialog-assignment-icon">
                      <UserPlus size={20} />
                    </span>
                    <strong>
                      {asset.assignmentTracked ? assignment : t("No data")}
                    </strong>
                    <p>
                      {!asset.assignmentTracked
                        ? t(
                            "Only inventory managers can see who holds this asset.",
                          )
                        : asset.status === "repair"
                          ? t("This asset is being repaired.")
                          : t(
                              "This asset is available and not used by anyone.",
                            )}
                    </p>
                  </>
                }
              </div>
            )}
          </aside>
        </div>
      </div>
    </DialogBackdrop>
  );
}
