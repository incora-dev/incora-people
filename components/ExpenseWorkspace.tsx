"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Check,
  ExternalLink,
  Plus,
  ReceiptText,
  WalletCards,
  X,
} from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { DateField } from "@/components/ui/DateField";
import { formatCount } from "@/lib/i18n";

type Policy = {
  id: number;
  name: string;
  currency: string;
  perRequestLimit: number;
  annualLimit: number;
  maxRequestsPerYear: number;
  requiresReceipt: boolean;
  requiresApproval: boolean;
};
type RequestRow = {
  id: number;
  category: string;
  amountCents: number;
  currency: string;
  expenseDate: string;
  description: string;
  receiptUrl: string | null;
  status: string;
};
type PendingRow = RequestRow & {
  employeeId: number;
  employeeFirstName: string;
  employeeLastName: string;
};

export function ExpenseWorkspace({
  policy,
  requests: initialRequests,
  pending: initialPending,
  year,
  canApprove,
  quarterlyStats,
  readOnlyPreview = false,
}: {
  policy: Policy | undefined;
  requests: RequestRow[];
  pending: PendingRow[];
  approvedTotal: number;
  requestCount: number;
  year: number;
  canApprove: boolean;
  quarterlyStats: { quarter: number; totalCents: number; rows: PendingRow[] }[];
  readOnlyPreview?: boolean;
}) {
  const { locale, t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [requests, setRequests] = useState(initialRequests);
  const [pending, setPending] = useState(initialPending);
  const [rejecting, setRejecting] = useState<PendingRow | null>(null);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [quarterRows, setQuarterRows] = useState(() =>
    Array.from(
      new Map(
        quarterlyStats
          .flatMap((quarter) => quarter.rows)
          .map((row) => [row.id, row]),
      ).values(),
    ),
  );
  const [quarterlyOpen, setQuarterlyOpen] = useState(false);
  const canViewQuarterly = quarterlyStats.length > 0;

  useEffect(() => {
    let active = true;
    fetch("/api/reimbursements", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          requests?: RequestRow[];
          pending?: PendingRow[];
          quarterlyStats?: {
            quarter: number;
            totalCents: number;
            rows: PendingRow[];
          }[];
        };
      })
      .then((data) => {
        if (!active || !data) return;
        setRequests(data.requests ?? []);
        setPending(data.pending ?? []);
        const rows = data.quarterlyStats ?? [];
        setQuarterRows(
          Array.from(
            new Map(
              rows
                .flatMap((quarter) => quarter.rows)
                .map((row) => [row.id, row]),
            ).values(),
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [year]);
  const liveApprovedTotal = useMemo(
    () =>
      requests
        .filter(
          (item) =>
            item.status === "approved" &&
            item.expenseDate.startsWith(`${year}-`),
        )
        .reduce((sum, item) => sum + item.amountCents, 0),
    [requests, year],
  );
  const liveRequestCount = useMemo(
    () =>
      requests.filter(
        (item) =>
          item.expenseDate.startsWith(`${year}-`) &&
          item.status !== "rejected" &&
          item.status !== "withdrawn",
      ).length,
    [requests, year],
  );
  const liveQuarterlyStats = useMemo(
    () =>
      [1, 2, 3, 4].map((quarter) => {
        const rows = quarterRows.filter((item) => {
          const month = Number(item.expenseDate.slice(5, 7));
          return (
            item.expenseDate.startsWith(`${year}-`) &&
            Math.ceil(month / 3) === quarter
          );
        });
        const countedRows = rows.filter(
          (item) => item.status !== "rejected" && item.status !== "withdrawn",
        );
        return {
          quarter,
          rows: countedRows,
          requestCount: countedRows.length,
          totalCents: countedRows.reduce(
            (sum, item) => sum + item.amountCents,
            0,
          ),
        };
      }),
    [quarterRows, year],
  );

  async function review(
    id: number,
    action: "approved" | "rejected",
    note = "",
  ) {
    setReviewMessage("");
    setReviewError("");
    const response = await fetch(`/api/reimbursements/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    if (response.ok) {
      setPending((items) => items.filter((item) => item.id !== id));
      setRequests((items) =>
        items.map((item) =>
          item.id === id ? { ...item, status: action } : item,
        ),
      );
      setQuarterRows((items) =>
        items.map((item) =>
          item.id === id ? { ...item, status: action } : item,
        ),
      );
      setRejecting(null);
      setReviewMessage(
        action === "approved"
          ? t("Reimbursement approved.")
          : t("Reimbursement rejected."),
      );
      return;
    }
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setReviewError(result.error ?? t("Could not update reimbursement."));
  }

  async function withdraw(id: number) {
    const response = await fetch(`/api/reimbursements/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "withdrawn" }),
    });
    if (response.ok) {
      setPending((items) => items.filter((item) => item.id !== id));
      setRequests((items) =>
        items.map((item) =>
          item.id === id ? { ...item, status: "withdrawn" } : item,
        ),
      );
      setQuarterRows((items) =>
        items.map((item) =>
          item.id === id ? { ...item, status: "withdrawn" } : item,
        ),
      );
    }
  }

  const currency = policy?.currency ?? "UAH";
  return (
    <div className="expense-workspace">
      <section className="page-heading-row">
        <div>
          <h1>{t("Reimbursements")}</h1>
          <p>{t("Submit work expenses and track repayment decisions.")}</p>
        </div>
        <div className="page-actions">
          {canViewQuarterly && (
            <button
              className="button ghost-button"
              type="button"
              onClick={() => setQuarterlyOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={quarterlyOpen}
            >
              <BarChart3 size={16} /> {t("Statistics")}
            </button>
          )}
          {!readOnlyPreview && (
            <button
              className="button primary-button"
              onClick={() => setDialogOpen(true)}
              disabled={!policy}
            >
              <Plus size={16} /> {t("New expense")}
            </button>
          )}
        </div>
      </section>
      <section className="expense-summary-grid">
        <Summary
          icon={<WalletCards />}
          label={`${t("Approved in")} ${year}`}
          value={money(liveApprovedTotal, currency)}
          note={`${t("Annual limit")} ${money(policy?.annualLimit ?? 0, currency)}`}
        />
        <Summary
          icon={<ReceiptText />}
          label={t("Requests used")}
          value={`${liveRequestCount} / ${policy?.maxRequestsPerYear ?? 0}`}
          note={`${t("Per request up to")} ${money(policy?.perRequestLimit ?? 0, currency)}`}
        />
      </section>
      <section className="panel data-panel expense-section">
        <div className="data-panel-heading">
          <div>
            <h2>{t("My reimbursements")}</h2>
            <span>
              {formatCount(
                locale,
                requests.length,
                { one: "запит", few: "запити", many: "запитів" },
                { one: "request", many: "requests" },
              )}
            </span>
          </div>
        </div>
        <div className="expense-table">
          <div className="expense-table-head">
            <span>{t("Expense")}</span>
            <span>{t("Date")}</span>
            <span>{t("Amount")}</span>
            <span>{t("Status")}</span>
            <span />
          </div>
          {requests.map((item) => (
            <div className="expense-table-row" key={item.id}>
              <span>
                <strong>{t(item.category)}</strong>
                <small>{item.description}</small>
              </span>
              <span>{item.expenseDate}</span>
              <strong>{money(item.amountCents, item.currency)}</strong>
              <span className={`status-badge ${item.status}`}>
                {t(item.status)}
              </span>
              <span className="expense-row-actions">
                {!readOnlyPreview && item.receiptUrl && (
                  <a
                    href={item.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t("Open receipt")}
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
                {!readOnlyPreview && item.status === "pending" && (
                  <button onClick={() => withdraw(item.id)}>
                    {t("Withdraw")}
                  </button>
                )}
              </span>
            </div>
          ))}
          {requests.length === 0 && (
            <div className="compact-empty">
              {t("No reimbursements submitted yet.")}
            </div>
          )}
        </div>
      </section>
      {quarterlyOpen && canViewQuarterly && (
        <DialogBackdrop onClose={() => setQuarterlyOpen(false)}>
          <section
            className="dialog quarterly-stats-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quarterly-reimbursement-title"
          >
            <div className="dialog-header">
              <div>
                <p className="eyebrow">{t("Reimbursements")}</p>
                <h2 id="quarterly-reimbursement-title">
                  {t("Quarterly reimbursement overview")}
                </h2>
                <span className="muted">{year}</span>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setQuarterlyOpen(false)}
                aria-label={t("Close")}
              >
                <X size={18} />
              </button>
            </div>
            <div className="reimbursement-quarter-grid">
              {liveQuarterlyStats.map((quarter) => (
                <article key={quarter.quarter}>
                  <span>Q{quarter.quarter}</span>
                  <strong>{money(quarter.totalCents, currency)}</strong>
                  <small>
                    {formatCount(
                      locale,
                      quarter.requestCount,
                      { one: "запит", few: "запити", many: "запитів" },
                      { one: "request", many: "requests" },
                    )}
                  </small>
                  <details>
                    <summary>{t("View employees")}</summary>
                    {quarter.rows.map((row) => (
                      <p key={row.id}>
                        {row.employeeFirstName} {row.employeeLastName} ·{" "}
                        {money(row.amountCents, row.currency)} · {t(row.status)}
                      </p>
                    ))}
                  </details>
                </article>
              ))}
            </div>
          </section>
        </DialogBackdrop>
      )}
      {canApprove && (
        <section className="panel data-panel expense-section">
          <div className="data-panel-heading">
            <div>
              <h2>{t("Needs approval")}</h2>
              <span>
                {pending.length} {t("pending")}
              </span>
            </div>
          </div>
          {reviewMessage && (
            <p className="form-message success" role="status">
              {reviewMessage}
            </p>
          )}
          {reviewError && (
            <p className="form-message error" role="alert">
              {reviewError}
            </p>
          )}
          {pending.map((item) => (
            <div className="expense-approval-row" key={item.id}>
              <span className="employee-person-cell">
                <span className="avatar small">
                  {item.employeeFirstName[0]}
                  {item.employeeLastName[0]}
                </span>
                <span>
                  <strong>
                    {item.employeeFirstName} {item.employeeLastName}
                  </strong>
                  <small>
                    {t(item.category)} · {item.description}
                  </small>
                </span>
              </span>
              <strong>{money(item.amountCents, item.currency)}</strong>
              <span className="approval-actions">
                <button
                  type="button"
                  onClick={() => setRejecting(item)}
                  aria-label={`${t("Reject reimbursement")} ${item.employeeFirstName} ${item.employeeLastName}`}
                  title={t("Reject reimbursement")}
                >
                  <X size={15} />
                </button>
                <button
                  type="button"
                  className="approve"
                  onClick={() => review(item.id, "approved")}
                  aria-label={`${t("Approve reimbursement")} ${item.employeeFirstName} ${item.employeeLastName}`}
                  title={t("Approve reimbursement")}
                >
                  <Check size={15} />
                </button>
              </span>
            </div>
          ))}
          {pending.length === 0 && (
            <div className="compact-empty">
              <Check size={16} /> {t("All expense requests are reviewed.")}
            </div>
          )}
        </section>
      )}
      {rejecting && (
        <RejectReimbursementDialog
          employee={`${rejecting.employeeFirstName} ${rejecting.employeeLastName}`}
          onClose={() => setRejecting(null)}
          onSubmit={(note) => review(rejecting.id, "rejected", note)}
        />
      )}
      {dialogOpen && policy && (
        <ExpenseDialog policy={policy} onClose={() => setDialogOpen(false)} />
      )}
    </div>
  );
}

function Summary({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="panel expense-summary-card">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{note}</p>
      </div>
    </article>
  );
}

function ExpenseDialog({
  policy,
  onClose,
}: {
  policy: Policy;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploadNote, setUploadNote] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setUploadNote(t("Preparing receipt…"));
    try {
      const form = new FormData(event.currentTarget);
      const receipt = form.get("receipt");
      if (receipt instanceof File && receipt.size > 0) {
        if (receipt.size > 10 * 1024 * 1024) {
          throw new Error(t("The maximum file size is 10 MB."));
        }
        form.set("receipt", await optimizeReceiptImage(receipt));
      }
      setUploadNote(t("Uploading securely…"));
      const response = await fetch("/api/reimbursements", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as { error?: string };
      if (response.ok) {
        window.location.reload();
        return;
      }
      throw new Error(result.error ?? t("Could not submit the expense."));
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : t("Could not submit the expense."),
      );
      setUploadNote("");
      setBusy(false);
    }
  }
  return (
    <DialogBackdrop onClose={onClose}>
      <div className="dialog small-dialog">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{t("Reimbursement")}</p>
            <h2>{t("New expense")}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>
            {t("Category")}
            <select name="category">
              <option value="Sport">{t("Sport")}</option>
              <option value="Health">{t("Health")}</option>
              <option value="Education">{t("Education")}</option>
              <option value="Other">{t("Other")}</option>
            </select>
          </label>
          <label>
            {t("Amount")}, {policy.currency}
            <input
              name="amount"
              type="number"
              min="0.01"
              max={policy.perRequestLimit / 100}
              step="0.01"
              required
            />
          </label>
          <div className="span-two">
            <DateField name="expenseDate" label={t("Expense date")} required />
          </div>
          <label className="span-two">
            {t("Description")}
            <textarea name="description" rows={3} required />
          </label>
          <label className="span-two">
            {t("Receipt file")} {policy.requiresReceipt && `(${t("required")})`}
            <input
              name="receipt"
              type="file"
              accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"
              required={policy.requiresReceipt}
            />
            <small>
              {t(
                "PDF, DOCX, JPEG, PNG or WebP · maximum 10 MB. Stored privately.",
              )}
            </small>
          </label>
          <p className="muted span-two">
            {t("Policy")}: {money(policy.perRequestLimit, policy.currency)}{" "}
            {t("per request")}, {policy.maxRequestsPerYear}{" "}
            {t("requests per year")}.
          </p>
          {error && <p className="form-error span-two">{error}</p>}
          {busy && uploadNote && (
            <p className="upload-progress-note span-two">{uploadNote}</p>
          )}
          <div className="dialog-actions span-two">
            <button
              type="button"
              className="button ghost-button"
              onClick={onClose}
            >
              {t("Cancel")}
            </button>
            <button className="button primary-button" disabled={busy}>
              {busy ? t("Submitting…") : t("Submit expense")}
            </button>
          </div>
        </form>
      </div>
    </DialogBackdrop>
  );
}

function RejectReimbursementDialog({
  employee,
  onClose,
  onSubmit,
}: {
  employee: string;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const { t } = useI18n();
  const [note, setNote] = useState("");
  return (
    <DialogBackdrop onClose={onClose}>
      <section
        className="dialog small-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-reimbursement-title"
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{t("Reimbursements")}</p>
            <h2 id="reject-reimbursement-title">{t("Reject reimbursement")}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={t("Close")}
          >
            <X size={18} />
          </button>
        </div>
        <p>{employee}</p>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(note.trim());
          }}
        >
          <label className="span-two">
            {t("Reason for rejection")}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              rows={4}
              required
            />
          </label>
          <div className="dialog-actions span-two">
            <button
              type="button"
              className="button ghost-button"
              onClick={onClose}
            >
              {t("Cancel")}
            </button>
            <button type="submit" className="button danger-button">
              {t("Reject reimbursement")}
            </button>
          </div>
        </form>
      </section>
    </DialogBackdrop>
  );
}

async function optimizeReceiptImage(file: File) {
  if (!file.type.startsWith("image/") || file.size < 1_200_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 2200;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.84),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], replaceExtension(file.name, ".jpg"), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

function replaceExtension(name: string, extension: string) {
  const stem = name.replace(/\.[^.]+$/, "") || "receipt";
  return `${stem}${extension}`;
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
