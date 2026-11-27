"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Eye,
  EyeOff,
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
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
  const [deletingItem, setDeletingItem] = useState<CompensationListItem | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function reveal(id: number) {
    if (revealed[id]) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      return;
    }
    const response = await fetch(
      `/api/employees/${employeeId}/compensations/${id}/reveal`,
      { method: "POST" },
    );
    const result = (await response.json()) as RevealedAmount & {
      error?: string;
    };
    if (response.ok) setRevealed((current) => ({ ...current, [id]: result }));
    else setError(t(result.error ?? "Could not reveal compensation."));
  }

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

  async function confirmDelete() {
    if (!deletingItem) return;
    setError("");
    setNotice("");
    const response = await fetch(
      `/api/employees/${employeeId}/compensations/${deletingItem.id}`,
      { method: "DELETE" },
    );
    const result = (await response.json()) as {
      items?: CompensationListItem[];
      error?: string;
      attachmentCleanupPending?: boolean;
    };
    if (!response.ok || !result.items) {
      setError(t(result.error ?? "Could not delete compensation."));
      setDeletingItem(null);
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
    setDeletingItem(null);
  }

  const visibleItems = items.filter((item) => item.kind === kind);
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
        <div
          className={`compensation-table ${kind === "additional" ? "additional" : "base"}${canEdit ? " editable" : ""}`}
          role="table"
          aria-label={t(
            kind === "base" ? "Base compensation" : "Additional compensation",
          )}
        >
          <div className="compensation-header" role="row">
            {kind === "additional" && (
              <span role="columnheader">{t("Name")}</span>
            )}
            <span role="columnheader">{t("Effective from")}</span>
            <span role="columnheader">{t("Amount")}</span>
            <span role="columnheader">{t("Period")}</span>
            <span role="columnheader">{t("Payment schedule")}</span>
            <span role="columnheader">{t("Attachments")}</span>
            {canEdit && (
              <span role="columnheader" aria-label={t("Actions")}>
                <span className="sr-only">{t("Actions")}</span>
              </span>
            )}
          </div>
          {visibleItems.map((item) => {
            const visibleAmount = revealed[item.id];
            const amount = visibleAmount
              ? new Intl.NumberFormat(locale === "uk" ? "uk-UA" : "en-US", {
                  style: "currency",
                  currency: visibleAmount.currency,
                }).format(visibleAmount.amountCents / 100)
              : "•••••";
            return (
              <div className="compensation-row" role="row" key={item.id}>
                {kind === "additional" && (
                  <span
                    className="compensation-cell"
                    role="cell"
                    data-label={t("Name")}
                  >
                    {item.label || t("Not provided")}
                  </span>
                )}
                <span
                  className="compensation-cell compensation-date"
                  role="cell"
                  data-label={t("Effective from")}
                >
                  {formatDate(item.effectiveFrom, locale)}
                  {item.isCurrent && (
                    <span className="compensation-current-badge">
                      {t("Current")}
                    </span>
                  )}
                </span>
                <span
                  className="compensation-cell compensation-amount"
                  role="cell"
                  data-label={t("Amount")}
                >
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
                </span>
                <span
                  className="compensation-cell"
                  role="cell"
                  data-label={t("Period")}
                >
                  {t(item.period)}
                </span>
                <span
                  className="compensation-cell"
                  role="cell"
                  data-label={t("Payment schedule")}
                >
                  {t(paymentLabel(item.paymentSchedule))}
                </span>
                <span
                  className="compensation-cell compensation-attachments"
                  role="cell"
                  data-label={t("Attachments")}
                >
                  {item.attachments.length ? (
                    item.attachments.map((attachment) => (
                      <span key={attachment.id}>{attachment.name}</span>
                    ))
                  ) : (
                    <span className="muted">—</span>
                  )}
                </span>
                {canEdit && (
                  <div className="compensation-row-actions" role="cell">
                    <CompensationRowMenu
                      onEdit={() => {
                        setKind(item.kind);
                        setEditingItem(item);
                        setError("");
                        setDialogOpen(true);
                      }}
                      onDelete={() => setDeletingItem(item)}
                    />
                  </div>
                )}
                {item.comment && (
                  <div className="compensation-comment-row" role="cell">
                    <strong>{t("Comment")}:</strong> {item.comment}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
      {deletingItem && (
        <DialogBackdrop onClose={() => setDeletingItem(null)}>
          <div
            className="dialog compact-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-compensation-title"
            aria-describedby="delete-compensation-description"
          >
            <div className="dialog-header">
              <h2 id="delete-compensation-title">{t("Delete compensation")}</h2>
              <button
                type="button"
                className="icon-button"
                aria-label={t("Close")}
                onClick={() => setDeletingItem(null)}
              >
                <X size={18} />
              </button>
            </div>
            <p id="delete-compensation-description">
              {t("Delete this compensation record and its attachments?")}
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="button ghost-button"
                onClick={() => setDeletingItem(null)}
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                className="button danger-button"
                onClick={() => void confirmDelete()}
              >
                <Trash2 size={15} /> {t("Delete")}
              </button>
            </div>
          </div>
        </DialogBackdrop>
      )}
    </article>
  );
}

function CompensationRowMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function toggleMenu() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    setOpensUp(Boolean(rect && window.innerHeight - rect.bottom < 110));
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="compensation-row-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="icon-button"
        aria-label={t("More compensation actions")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggleMenu}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div
          className={`compensation-row-menu-list${opensUp ? " opens-up" : ""}`}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            <Pencil size={14} /> {t("Edit compensation")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <Trash2 size={14} /> {t("Delete")}
          </button>
        </div>
      )}
    </div>
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
