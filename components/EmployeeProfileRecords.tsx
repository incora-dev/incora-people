"use client";

import { FormEvent, useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DateField } from "@/components/ui/DateField";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { ProfileCardHeading } from "@/components/ProfileCardHeading";
import type { ReferenceValueDto } from "@/modules/admin/types";

export type ProfileRecord = {
  id: number;
  kind: string;
  title: string;
  subtitle: string;
  startedOn: string | null;
  endedOn: string | null;
  notes: string;
  attachmentFileId?: string | null;
  attachmentName?: string | null;
};

const sections = [
  ["skill", "Skills"],
  ["education", "Education"],
  ["certification", "Licenses & certificates"],
  ["experience", "Experience"],
  ["emergency_contact", "Emergency contacts"],
  ["dependent", "Dependants"],
] as const;

const sectionEmoji: Record<string, string> = {
  emergency_contact: "📞",
  skill: "🧩",
  education: "🎓",
  certification: "🏅",
};

export function EmployeeProfileRecords({
  employeeId,
  initialRecords,
  canEdit,
  technologyOptions,
  visibleKinds,
  cardTitle,
  intro,
  personalLayout = false,
  readOnlyPreview = false,
}: {
  employeeId: number;
  initialRecords: ProfileRecord[];
  canEdit: boolean;
  technologyOptions: ReferenceValueDto[];
  visibleKinds?: readonly string[];
  cardTitle?: string;
  intro?: ReactNode;
  personalLayout?: boolean;
  readOnlyPreview?: boolean;
}) {
  const { t } = useI18n();
  const [records, setRecords] = useState(initialRecords);
  const [kind, setKind] = useState<(typeof sections)[number][0] | null>(null);
  const [editingRecord, setEditingRecord] = useState<ProfileRecord | null>(
    null,
  );

  async function remove(id: number) {
    const response = await fetch(
      `/api/employees/${employeeId}/profile-records?recordId=${id}`,
      { method: "DELETE" },
    );
    if (response.ok)
      setRecords((items) => items.filter((item) => item.id !== id));
  }

  return (
    <section
      className={`profile-record-grid span-profile-grid${personalLayout ? " profile-record-grid-personal" : ""}`}
    >
      {sections
        .filter(([sectionKind]) =>
          visibleKinds ? visibleKinds.includes(sectionKind) : true,
        )
        .map(([sectionKind, label]) => {
          const items = records.filter((record) => record.kind === sectionKind);
          return (
            <article className="panel profile-record-card" key={sectionKind}>
              <ProfileCardHeading
                title={t(cardTitle ?? label)}
                emoji={sectionEmoji[sectionKind]}
                actions={
                  canEdit ? (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setKind(sectionKind)}
                      aria-label={`${t("Add")} ${t(label)}`}
                    >
                      <Plus size={16} />
                    </button>
                  ) : undefined
                }
              />
              {intro}
              <div className="profile-record-list">
                {items.map((record) => (
                  <div key={record.id}>
                    <div className="profile-record-content">
                      {sectionKind === "emergency_contact" ? (
                        <dl className="profile-emergency-contact">
                          <div>
                            <dt>{t("Contact name")}</dt>
                            <dd>{record.title || t("Not provided")}</dd>
                          </div>
                          <div>
                            <dt>{t("Relationship")}</dt>
                            <dd>{record.subtitle || t("Not provided")}</dd>
                          </div>
                          <div>
                            <dt>{t("Phone number")}</dt>
                            <dd>{record.notes || t("Not provided")}</dd>
                          </div>
                        </dl>
                      ) : (
                        <>
                          <strong>{record.title}</strong>
                          <small>
                            {[record.subtitle, formatPeriod(record)]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                          {record.notes && <em>{record.notes}</em>}
                        </>
                      )}
                      {record.attachmentFileId && !readOnlyPreview && (
                        <a
                          className="profile-record-attachment"
                          href={`/api/files/${record.attachmentFileId}`}
                        >
                          {t("Open attachment")}: {record.attachmentName}
                        </a>
                      )}
                      {record.attachmentFileId && readOnlyPreview && (
                        <small className="muted">
                          {t("File access is unavailable in employee preview.")}
                        </small>
                      )}
                    </div>
                    {canEdit && (
                      <span className="profile-record-actions">
                        <button
                          onClick={() => setEditingRecord(record)}
                          aria-label={t("Edit")}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => void remove(record.id)}
                          aria-label={t("Delete")}
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                    )}
                  </div>
                ))}
                {!items.length && (
                  <p className="muted profile-empty-state">
                    {t("No records yet.")}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      {kind && (
        <RecordDialog
          employeeId={employeeId}
          kind={kind}
          technologyOptions={technologyOptions}
          onClose={() => setKind(null)}
          onCreated={(record) => {
            setRecords((items) => [record, ...items]);
            setKind(null);
          }}
        />
      )}
      {editingRecord && (
        <RecordDialog
          employeeId={employeeId}
          kind={editingRecord.kind}
          record={editingRecord}
          technologyOptions={technologyOptions}
          onClose={() => setEditingRecord(null)}
          onCreated={(record) => {
            setRecords((items) =>
              items.map((item) =>
                item.id === record.id ? { ...item, ...record } : item,
              ),
            );
            setEditingRecord(null);
          }}
        />
      )}
    </section>
  );
}

function RecordDialog({
  employeeId,
  kind,
  record,
  technologyOptions,
  onClose,
  onCreated,
}: {
  employeeId: number;
  kind: string;
  record?: ProfileRecord;
  technologyOptions: ReferenceValueDto[];
  onClose: () => void;
  onCreated: (record: ProfileRecord) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("kind", kind);
    const payload = Object.fromEntries(data.entries());
    const isMultipart = ["skill", "education", "certification"].includes(kind);
    if (record) data.set("recordId", String(record.id));
    const response = await fetch(
      `/api/employees/${employeeId}/profile-records`,
      {
        method: record ? "PATCH" : "POST",
        ...(isMultipart
          ? { body: data }
          : {
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ...payload, kind, recordId: record?.id }),
            }),
      },
    );
    const result = (await response.json()) as {
      record?: ProfileRecord;
      error?: string;
    };
    if (response.ok && result.record) onCreated(result.record);
    else setError(t(result.error ?? "Could not save this record."));
  }

  return (
    <DialogBackdrop onClose={onClose}>
      <div className="dialog compact-dialog" role="dialog" aria-modal="true">
        <div className="dialog-header">
          <h2>{t(record ? "Edit profile record" : "Add profile record")}</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t("Close")}
          >
            <X size={18} />
          </button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label className="span-two">
            {t(
              kind === "skill"
                ? "Technology"
                : kind === "emergency_contact"
                  ? "Contact name"
                  : "Name",
            )}
            {kind === "skill" ? (
              <select
                name="title"
                required
                autoFocus
                defaultValue={record?.title ?? ""}
              >
                <option value="" disabled>
                  {t("Select a technology")}
                </option>
                {technologyOptions
                  .filter((item) => item.kind === "technology" && item.active)
                  .map((item) => (
                    <option value={item.label} key={item.id}>
                      {item.label}
                    </option>
                  ))}
              </select>
            ) : (
              <input
                name="title"
                required
                autoFocus
                defaultValue={record?.title ?? ""}
              />
            )}
          </label>
          <label className="span-two">
            {t(kind === "emergency_contact" ? "Relationship" : "Details")}
            <input name="subtitle" defaultValue={record?.subtitle ?? ""} />
          </label>
          {["education", "certification", "experience"].includes(kind) && (
            <>
              <DateField
                name="startedOn"
                label={t("From")}
                value={record?.startedOn ?? ""}
              />
              <DateField
                name="endedOn"
                label={t("To")}
                value={record?.endedOn ?? ""}
                min={record?.startedOn ?? undefined}
              />
            </>
          )}
          {kind === "emergency_contact" && (
            <label className="span-two">
              {t("Phone number")}
              <input
                name="notes"
                type="tel"
                defaultValue={record?.notes ?? ""}
                required
              />
            </label>
          )}
          {["skill", "education", "certification"].includes(kind) && (
            <label className="span-two profile-record-file-picker">
              {t(
                record?.attachmentName
                  ? "Replace attachment (optional)"
                  : "Attachment (optional)",
              )}
              <input
                name="file"
                type="file"
                accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"
              />
              {record?.attachmentName && (
                <small>
                  {t("Current attachment")}: {record.attachmentName}
                </small>
              )}
              <small>
                {t("PDF, DOCX, JPEG, PNG or WebP · maximum 10 MB.")}
              </small>
            </label>
          )}
          {kind !== "emergency_contact" && (
            <label className="span-two">
              {t("Notes")}
              <textarea
                name="notes"
                rows={3}
                defaultValue={record?.notes ?? ""}
              />
            </label>
          )}
          {error && <p className="form-error span-two">{error}</p>}
          <div className="dialog-actions span-two">
            <button
              type="button"
              className="button ghost-button"
              onClick={onClose}
            >
              {t("Cancel")}
            </button>
            <button className="button primary-button">{t("Save")}</button>
          </div>
        </form>
      </div>
    </DialogBackdrop>
  );
}

function formatPeriod(record: ProfileRecord) {
  if (!record.startedOn && !record.endedOn) return "";
  return `${record.startedOn ?? "…"} — ${record.endedOn ?? "present"}`;
}
