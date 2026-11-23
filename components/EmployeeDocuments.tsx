"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import {
  Download,
  FileText,
  Folder,
  FolderPlus,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { ProfileCardHeading } from "@/components/ProfileCardHeading";
import { FilePreviewDialog } from "@/components/ui/FilePreviewDialog";

type DocumentRow = {
  id: string;
  category: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  uploadedByEmail: string;
  folderId: number | null;
  visibility: string;
  createdAt: string;
};

type FolderRow = {
  id: number;
  employeeId: number;
  name: string;
  visibility: string;
  createdByEmail: string;
  createdAt: string;
};

const categoryLabels: Record<string, string> = {
  contract: "Contract",
  identity: "Identity",
  tax: "Tax",
  policy: "Policy",
  other: "Other",
};

export function EmployeeDocuments({
  employeeId,
  initialDocuments,
  initialFolders,
  canUpload,
  canDelete,
  canManageFolders,
  readOnlyPreview = false,
}: {
  employeeId: number;
  initialDocuments: DocumentRow[];
  initialFolders: FolderRow[];
  canUpload: boolean;
  canDelete: boolean;
  canManageFolders: boolean;
  readOnlyPreview?: boolean;
}) {
  const { locale, t } = useI18n();
  const [documents, setDocuments] = useState(initialDocuments);
  const [folders, setFolders] = useState(initialFolders);
  const [busy, setBusy] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [error, setError] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");

  function folderDisplayName(
    folder: Pick<FolderRow, "name" | "createdByEmail">,
  ) {
    if (folder.createdByEmail !== "system@incora.local") return folder.name;
    if (folder.name === "Employee documents") return t("Employee documents");
    if (folder.name === "HR private") return t("HR private");
    return folder.name;
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const response = await fetch(`/api/employees/${employeeId}/documents`, {
      method: "POST",
      body: new FormData(form),
    });
    const result = (await response.json()) as {
      error?: string;
      file?: DocumentRow;
    };
    if (!response.ok || !result.file) {
      setError(result.error ?? t("Could not upload this document."));
      setBusy(false);
      return;
    }
    setDocuments((items) => [result.file!, ...items]);
    form.reset();
    setSelectedFileName("");
    setBusy(false);
  }

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const response = await fetch(`/api/employees/${employeeId}/documents`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const result = (await response.json()) as {
      error?: string;
      folder?: FolderRow;
    };
    if (!response.ok || !result.folder) {
      setError(result.error ?? t("Could not create the folder."));
    } else {
      setFolders((items) => [...items, result.folder!]);
      setFolderOpen(false);
      form.reset();
    }
    setBusy(false);
  }

  async function move(fileId: string, folderId: number) {
    setError("");
    const response = await fetch(`/api/employees/${employeeId}/documents`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId, folderId }),
    });
    const result = (await response.json()) as {
      error?: string;
      file?: DocumentRow;
    };
    if (!response.ok || !result.file) {
      setError(result.error ?? t("Could not move this document."));
      return;
    }
    setDocuments((items) =>
      items.map((item) => (item.id === fileId ? result.file! : item)),
    );
  }

  async function remove(id: string) {
    const response = await fetch(`/api/files/${id}`, { method: "DELETE" });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? t("Could not delete this document."));
      return;
    }
    setDocuments((items) => items.filter((item) => item.id !== id));
  }

  const groups = [
    ...folders.map((folder) => ({
      ...folder,
      documents: documents.filter(
        (document) => document.folderId === folder.id,
      ),
    })),
    ...(documents.some((document) => document.folderId === null)
      ? [
          {
            id: 0,
            employeeId,
            name: t("Unfiled"),
            visibility: "employee_hr",
            createdByEmail: "",
            createdAt: "",
            documents: documents.filter(
              (document) => document.folderId === null,
            ),
          },
        ]
      : []),
  ];

  return (
    <article
      className="panel employee-documents span-profile-grid"
      id="documents"
    >
      <div className="employee-documents-heading">
        <ProfileCardHeading
          title={t("Documents")}
          emoji="📄"
          actions={
            canManageFolders ? (
              <button
                className="button ghost-button"
                type="button"
                onClick={() => setFolderOpen((open) => !open)}
              >
                <FolderPlus size={16} /> {t("New folder")}
              </button>
            ) : undefined
          }
        />
        <p className="employee-documents-description">
          {t("Files are grouped into folders with explicit access levels.")}
        </p>
      </div>

      {folderOpen && (
        <form className="document-folder-create" onSubmit={createFolder}>
          <label>
            {t("Folder name")}
            <input name="name" maxLength={80} autoFocus required />
          </label>
          <label>
            {t("Access")}
            <select name="visibility" defaultValue="employee_hr">
              <option value="employee_hr">{t("Employee and HR")}</option>
              <option value="hr_only">{t("HR only")}</option>
            </select>
          </label>
          <button className="button primary-button" disabled={busy}>
            {t("Create folder")}
          </button>
        </form>
      )}

      {canUpload && folders.length > 0 && (
        <form className="document-upload-form" onSubmit={upload}>
          <label>
            {t("Folder")}
            <select name="folderId" defaultValue={folders[0]?.id} required>
              {folders.map((folder) => (
                <option value={folder.id} key={folder.id}>
                  {folderDisplayName(folder)} ·{" "}
                  {t(
                    folder.visibility === "hr_only"
                      ? "HR only"
                      : "Employee and HR",
                  )}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Category")}
            <select name="category" defaultValue="other">
              <option value="contract">{t("Contract")}</option>
              <option value="identity">{t("Identity")}</option>
              <option value="tax">{t("Tax")}</option>
              <option value="policy">{t("Policy")}</option>
              <option value="other">{t("Other")}</option>
            </select>
          </label>
          <label className="document-file-picker">
            <span>{t("File")}</span>
            <input
              name="file"
              type="file"
              accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setSelectedFileName(event.target.files?.[0]?.name ?? "")
              }
              required
            />
            <span className="document-file-picker-control">
              <span className="button ghost-button" aria-hidden="true">
                <FileText size={15} /> {t("Choose file")}
              </span>
              <small>{selectedFileName || t("No file selected")}</small>
            </span>
          </label>
          <button className="button primary-button" disabled={busy}>
            <Upload size={16} /> {busy ? t("Uploading…") : t("Upload")}
          </button>
        </form>
      )}
      {canUpload && folders.length === 0 && (
        <p className="document-upload-help">
          {canManageFolders
            ? t("Create a folder before uploading the first document.")
            : t("Ask HR to create a document folder for your profile.")}
        </p>
      )}
      <p className="document-upload-help">
        {t("PDF, DOCX, JPEG, PNG or WebP · maximum 10 MB.")}
      </p>
      {error && <p className="form-error">{error}</p>}

      <div className="employee-document-folders">
        {groups.map((folder) => (
          <section className="employee-document-folder" key={folder.id}>
            <header>
              <span>
                <Folder size={18} />
              </span>
              <div>
                <strong>{folderDisplayName(folder)}</strong>
                <small>
                  <ShieldCheck size={13} />
                  {t(
                    folder.visibility === "hr_only"
                      ? "HR only"
                      : "Employee and HR",
                  )}
                </small>
              </div>
              <b>{folder.documents.length}</b>
            </header>
            <div className="document-list">
              {folder.documents.map((document) => (
                <div className="document-row" key={document.id}>
                  <span className="document-icon">
                    <FileText size={18} />
                  </span>
                  <span className="document-name">
                    <strong>{document.originalName}</strong>
                    <small>
                      {t(
                        categoryLabels[document.category] ?? document.category,
                      )}{" "}
                      · {formatBytes(document.sizeBytes)} ·{" "}
                      {formatDate(document.createdAt, locale)}
                    </small>
                  </span>
                  <div className="document-row-actions">
                    {canManageFolders &&
                      !readOnlyPreview &&
                      folders.length > 1 && (
                        <select
                          className="document-move-select"
                          value={document.folderId ?? ""}
                          onChange={(event) =>
                            move(document.id, Number(event.target.value))
                          }
                          aria-label={t("Move to folder")}
                        >
                          {folders.map((option) => (
                            <option value={option.id} key={option.id}>
                              {folderDisplayName(option)}
                            </option>
                          ))}
                        </select>
                      )}
                    {!readOnlyPreview && (
                      <>
                        <FilePreviewDialog
                          fileId={document.id}
                          name={document.originalName}
                          contentType={document.contentType}
                        />
                        <a
                          className="icon-button"
                          href={`/api/files/${document.id}`}
                          aria-label={`${t("Download")} ${document.originalName}`}
                        >
                          <Download size={17} />
                        </a>
                      </>
                    )}
                    {readOnlyPreview && (
                      <span className="muted document-preview-restricted">
                        {t("File access is unavailable in employee preview.")}
                      </span>
                    )}
                    {canDelete && !readOnlyPreview && (
                      <button
                        className="icon-button document-delete"
                        onClick={() => remove(document.id)}
                        aria-label={`${t("Delete")} ${document.originalName}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {folder.documents.length === 0 && (
                <div className="compact-empty profile-empty-state">
                  <FileText size={17} /> {t("No documents in this folder.")}
                </div>
              )}
            </div>
          </section>
        ))}
        {groups.length === 0 && (
          <div className="compact-empty profile-empty-state">
            <Folder size={17} /> {t("No document folders yet.")}
          </div>
        )}
      </div>
    </article>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string, locale: "uk" | "en") {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
