"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Eye, EyeOff, Plus, Pencil, Trash2, X } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import type { DataTableColumn } from "@/components/ui/DataTable/types";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { DateField } from "@/components/ui/DateField";
import { ProfileCardHeading } from "@/components/ProfileCardHeading";
import { useI18n } from "@/components/LocaleProvider";
import type { CompensationListItem } from "@/modules/compensation/contracts";

type RevealedAmount = { amountCents: number; currency: string };

export function EmployeeCompensation({
  employeeId,
  initialItems,
  canEdit,
  canReveal = true,
}: {
  employeeId: number;
  initialItems: CompensationListItem[];
  canEdit: boolean;
  canReveal?: boolean;
}) {
  const { t, locale } = useI18n();
  const [items, setItems] = useState(initialItems);
  const [kind, setKind] = useState<"base" | "additional">("base");
  const [revealed, setRevealed] = useState<Record<number, RevealedAmount>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CompensationListItem | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Calls this employee's reveal endpoint, so it is rebuilt with employeeId.
  const reveal = useCallback(
    async (id: number) => {
      if (revealed[id]) {
        setRevealed((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        return;
      }
      try {
        const response = await fetch(
          `/api/employees/${employeeId}/compensations/${id}/reveal`,
          { method: "POST" },
        );
        const result = (await response.json().catch(() => ({}))) as Partial<
          RevealedAmount & { error: string }
        >;
        if (response.ok && result.currency)
          setRevealed((current) => ({
            ...current,
            [id]: result as RevealedAmount,
          }));
        else setError(t(result.error ?? "Could not reveal compensation."));
      } catch {
        setError(t("Could not reveal compensation."));
      }
    },
    [employeeId, revealed, t],
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const dialogKind = editingItem?.kind ?? kind;
    form.set("kind", dialogKind);
    if (editingItem) {
      const removeIds = form.getAll("removeAttachmentIds").map(String);
      form.delete("removeAttachmentIds");
      form.set("removeAttachmentIds", JSON.stringify(removeIds));
    }
    let response: Response;
    let result: {
      items?: CompensationListItem[];
      error?: string;
      attachmentCleanupPending?: boolean;
    } = {};
    try {
      response = await fetch(
        editingItem
          ? `/api/employees/${employeeId}/compensations/${editingItem.id}`
          : `/api/employees/${employeeId}/compensations`,
        {
          method: editingItem ? "PATCH" : "POST",
          body: form,
        },
      );
      // An empty or non-JSON reply (e.g. a crash) becomes a generic error.
      result = (await response.json().catch(() => ({}))) as typeof result;
    } catch {
      setError(t("Could not save compensation."));
      return;
    }
    if (!response.ok || !result.items) {
      setError(t(result.error ?? "Could not save compensation."));
      return;
    }
    setItems(result.items);
    if (result.attachmentCleanupPending)
      setNotice(
        t("Private attachment cleanup is pending; access remains restricted."),
      );
    setRevealed({});
    setEditingItem(null);
    setDialogOpen(false);
  }

  // Runs after DataTable's danger confirmation.
  async function deleteItem(deletingItem: CompensationListItem) {
    setError("");
    setNotice("");
    let response: Response;
    let result: {
      items?: CompensationListItem[];
      error?: string;
      attachmentCleanupPending?: boolean;
    } = {};
    try {
      response = await fetch(
        `/api/employees/${employeeId}/compensations/${deletingItem.id}`,
        { method: "DELETE" },
      );
      result = (await response.json().catch(() => ({}))) as typeof result;
    } catch {
      // Network failure: show the error instead of failing silently.
      setError(t("Could not delete compensation."));
      return;
    }
    if (!response.ok || !result.items) {
      setError(t(result.error ?? "Could not delete compensation."));
      return;
    }
    setItems(result.items);
    if (result.attachmentCleanupPending)
      setNotice(
        t("Private attachment cleanup is pending; access remains restricted."),
      );
    setRevealed((current) => {
      const next = { ...current };
      delete next[deletingItem.id];
      return next;
    });
  }

  const visibleItems = items.filter((item) => item.kind === kind);
  // Amounts are not part of the list: they arrive only through reveal, so
  // the Amount column cannot sort. Each cell carries its caption for the
  // card layout on narrower screens.
  const columns = useMemo<DataTableColumn<CompensationListItem>[]>(() => {
    const captioned = (
      label: string,
      content: React.ReactNode,
      className = "",
    ) => (
      <span
        className={`compensation-cell ${className}`.trim()}
        data-label={t(label)}
      >
        {content}
      </span>
    );
    return [
      ...(kind === "additional"
        ? [
            {
              key: "name",
              header: "Name",
              minWidth: 110,
              // Sorts by what the cell shows, "Not provided" included.
              sortValue: (item: CompensationListItem) =>
                item.label || t("Not provided"),
              cell: (item: CompensationListItem) =>
                captioned("Name", item.label || t("Not provided")),
            },
          ]
        : []),
      {
        key: "effectiveFrom",
        header: "Effective from",
        minWidth: 120,
        sortValue: (item) => item.effectiveFrom,
        cell: (item) =>
          captioned(
            "Effective from",
            <>
              {formatDate(item.effectiveFrom, locale)}
              {item.isCurrent && (
                <span className="compensation-current-badge">
                  {t("Current")}
                </span>
              )}
            </>,
            "compensation-date",
          ),
      },
      {
        key: "amount",
        header: "Amount",
        minWidth: 120,
        cell: (item) => {
          const visibleAmount = revealed[item.id];
          const amount = visibleAmount
            ? new Intl.NumberFormat(locale === "uk" ? "uk-UA" : "en-US", {
                style: "currency",
                currency: visibleAmount.currency,
              }).format(visibleAmount.amountCents / 100)
            : "•••••";
          return captioned(
            "Amount",
            <>
              <strong>{amount}</strong>
              {canReveal && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t(
                    visibleAmount ? "Hide amount" : "Reveal amount",
                  )}
                  onClick={() => void reveal(item.id)}
                >
                  {visibleAmount ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              )}
            </>,
            "compensation-amount",
          );
        },
      },
      {
        key: "period",
        header: "Period",
        minWidth: 80,
        sortValue: (item) => t(item.period),
        cell: (item) => captioned("Period", t(item.period)),
      },
      {
        key: "schedule",
        header: "Payment schedule",
        minWidth: 120,
        sortValue: (item) => t(paymentLabel(item.paymentSchedule)),
        cell: (item) =>
          captioned("Payment schedule", t(paymentLabel(item.paymentSchedule))),
      },
      {
        key: "attachments",
        header: "Attachments",
        minWidth: 120,
        // File names wrap instead of widening the table.
        truncate: true,
        cell: (item) =>
          captioned(
            "Attachments",
            item.attachments.length ? (
              item.attachments.map((attachment) => (
                <span key={attachment.id}>{attachment.name}</span>
              ))
            ) : (
              <span className="muted">—</span>
            ),
            "compensation-attachments",
          ),
      },
    ];
  }, [canReveal, kind, locale, reveal, revealed, t]);
  return (
    <article className="panel profile-compensation-card">
      <ProfileCardHeading
        title={t("Compensation")}
        emoji="💰"
        actions={
          canEdit ? (
            <button
              className="button primary-button"
              type="button"
              onClick={() => {
                setEditingItem(null);
                setKind(kind);
                setError("");
                setDialogOpen(true);
              }}
            >
              <Plus size={16} /> {t("Add")}
            </button>
          ) : undefined
        }
      />
      <div
        className="compensation-switch"
        role="tablist"
        aria-label={t("Compensation type")}
      >
        {(["base", "additional"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={kind === value}
            className={kind === value ? "active" : ""}
            onClick={() => setKind(value)}
          >
            {t(
              value === "base"
                ? "Base compensation"
                : "Additional compensation",
            )}
          </button>
        ))}
      </div>
      {visibleItems.length ? (
        <DataTable
          className={`compensation-table ${kind === "additional" ? "additional" : "base"}`}
          rows={visibleItems}
          rowKey={(item) => item.id}
          columns={columns}
          ariaLabel={t(
            kind === "base" ? "Base compensation" : "Additional compensation",
          )}
          pageSize={false}
          rowActions={
            canEdit
              ? (item) => [
                  {
                    icon: Pencil,
                    label: t("Edit compensation"),
                    onClick: () => {
                      setKind(item.kind);
                      setEditingItem(item);
                      setError("");
                      setDialogOpen(true);
                    },
                  },
                  {
                    icon: Trash2,
                    label: t("Delete"),
                    confirmTitle: t("Delete compensation"),
                    danger: true,
                    confirmText: t(
                      "Delete this compensation record and its attachments?",
                    ),
                    onClick: () => void deleteItem(item),
                  },
                ]
              : undefined
          }
          rowDetails={(item) =>
            item.comment ? (
              <span className="compensation-comment-row">
                <strong>{t("Comment")}:</strong> {item.comment}
              </span>
            ) : null
          }
        />
      ) : (
        <p className="muted profile-empty-state">
          {t("No compensation records yet.")}
        </p>
      )}
      {error && <p className="form-error">{t(error)}</p>}
      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}
      {dialogOpen && (
        <DialogBackdrop
          onClose={() => {
            setDialogOpen(false);
            setEditingItem(null);
          }}
        >
          <div
            className="dialog compensation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="compensation-dialog-title"
          >
            <div className="dialog-header">
              <div>
                <p className="eyebrow">{t("Compensation")}</p>
                <h2 id="compensation-dialog-title">
                  {t(
                    editingItem
                      ? "Edit compensation"
                      : kind === "base"
                        ? "Add base compensation"
                        : "Add additional compensation",
                  )}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={t("Close")}
                onClick={() => {
                  setDialogOpen(false);
                  setEditingItem(null);
                }}
              >
                <X size={18} />
              </button>
            </div>
            <form className="form-grid" onSubmit={save}>
              {editingItem ? (
                <>
                  <input type="hidden" name="kind" value={editingItem.kind} />
                  <label className="span-two">
                    {t("Kind")}
                    <input
                      value={t(
                        editingItem.kind === "base"
                          ? "Base compensation"
                          : "Additional compensation",
                      )}
                      readOnly
                    />
                  </label>
                </>
              ) : (
                kind === "additional" && (
                  <label className="span-two">
                    {t("Name")}
                    <input name="label" maxLength={120} />
                  </label>
                )
              )}
              {editingItem?.kind === "additional" && (
                <label className="span-two">
                  {t("Name")}
                  <input
                    name="label"
                    maxLength={120}
                    defaultValue={editingItem.label ?? ""}
                  />
                </label>
              )}
              <DateField
                name="effectiveFrom"
                label={t("Effective from")}
                value={editingItem?.effectiveFrom ?? ""}
                required
              />
              <div className="compensation-amount-fields span-two">
                <label>
                  {t("Amount")}
                  <input
                    name="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    required={!editingItem}
                    placeholder={
                      editingItem ? t("Leave blank to keep current") : undefined
                    }
                  />
                </label>
                <label>
                  {t("Currency")}
                  <select
                    name="currency"
                    defaultValue={editingItem?.currency ?? "UAH"}
                  >
                    <option>USD</option>
                    <option>EUR</option>
                    <option>UAH</option>
                  </select>
                </label>
                <label>
                  {t("Period")}
                  <select
                    name="period"
                    defaultValue={editingItem?.period ?? "month"}
                  >
                    {["year", "month", "week", "day", "hour"].map((value) => (
                      <option key={value} value={value}>
                        {t(value)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {editingItem && (
                <p className="muted span-two">
                  {t("Leave blank to keep the current amount.")}
                </p>
              )}
              <label className="span-two">
                {t("Payment schedule")}
                <select
                  name="paymentSchedule"
                  defaultValue={editingItem?.paymentSchedule ?? "monthly"}
                >
                  <option value="weekly">{t("Weekly")}</option>
                  <option value="monthly">{t("Monthly")}</option>
                  <option value="quarterly">{t("Quarterly")}</option>
                </select>
              </label>
              <label className="span-two">
                {t("Comment")}
                <textarea
                  name="comment"
                  rows={3}
                  maxLength={2000}
                  defaultValue={editingItem?.comment ?? ""}
                />
              </label>
              {editingItem?.attachments.length ? (
                <fieldset className="span-two compensation-existing-files">
                  <legend>{t("Current attachments")}</legend>
                  {editingItem.attachments.map((attachment) => (
                    <label key={attachment.id}>
                      <input
                        type="checkbox"
                        name="removeAttachmentIds"
                        value={attachment.id}
                      />
                      <span>
                        {t("Remove")}: {attachment.name}
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              <label className="span-two profile-record-file-picker">
                {t("Attachments (optional)")}
                <input
                  name="files"
                  type="file"
                  multiple
                  accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"
                />
                <small>
                  {t("PDF, DOCX, JPEG, PNG or WebP · maximum 10 MB.")}
                </small>
              </label>
              {error && <p className="form-error span-two">{t(error)}</p>}
              <div className="dialog-actions span-two">
                <button
                  type="button"
                  className="button ghost-button"
                  onClick={() => {
                    setDialogOpen(false);
                    setEditingItem(null);
                  }}
                >
                  {t("Cancel")}
                </button>
                <button className="button primary-button">{t("Save")}</button>
              </div>
            </form>
          </div>
        </DialogBackdrop>
      )}
    </article>
  );
}

function formatDate(value: string, locale: "uk" | "en") {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function paymentLabel(schedule: string) {
  return schedule === "weekly"
    ? "Weekly"
    : schedule === "quarterly"
      ? "Quarterly"
      : "Monthly";
}
