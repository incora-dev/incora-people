"use client";
import { FormEvent, useState } from "react";
import { Download, FileText, Folder, Plus, Upload } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { FilePreviewDialog } from "@/components/ui/FilePreviewDialog";
type FolderRow = { id: number; name: string; description: string };
type DocumentRow = {
  id: number;
  folderId: number;
  title: string;
  fileId: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
};
export function DocumentWorkspace({
  folders: initialFolders,
  documents: initialDocuments,
  canManage,
  readOnlyPreview = false,
}: {
  folders: FolderRow[];
  documents: DocumentRow[];
  canManage: boolean;
  readOnlyPreview?: boolean;
}) {
  const { t } = useI18n();
  const [folders, setFolders] = useState(initialFolders);
  const [documents, setDocuments] = useState(initialDocuments);
  const [open, setOpen] = useState<"folder" | "upload" | null>(null);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch(
      "/api/documents",
      open === "upload"
        ? { method: "POST", body: data }
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(Object.fromEntries(data)),
          },
    );
    const result = (await response.json()) as {
      folder?: FolderRow;
      document?: DocumentRow;
      error?: string;
    };
    if (!response.ok)
      return setError(result.error ?? "Could not save document.");
    if (result.folder) setFolders((items) => [...items, result.folder!]);
    if (result.document) setDocuments((items) => [...items, result.document!]);
    setOpen(null);
    form.reset();
  }
  return (
    <>
      <section className="page-heading-row">
        <div>
          <p className="eyebrow">{t("Company resources")}</p>
          <h1>{t("Documents")}</h1>
          <p>{t("Shared policies, templates and company files.")}</p>
        </div>
        {canManage && !readOnlyPreview && (
          <div className="button-row">
            <button
              className="button ghost-button"
              onClick={() => setOpen("folder")}
            >
              <Plus size={16} />
              {t("New folder")}
            </button>
            <button
              className="button primary-button"
              onClick={() => setOpen("upload")}
            >
              <Upload size={16} />
              {t("Upload document")}
            </button>
          </div>
        )}
      </section>
      <section className="document-folder-grid">
        {folders.map((folder) => (
          <article className="panel document-folder" key={folder.id}>
            <div className="document-folder-title">
              <Folder size={21} />
              <div>
                <h2>{folder.name}</h2>
                <p>{folder.description}</p>
              </div>
            </div>
            {documents
              .filter((document) => document.folderId === folder.id)
              .map((document) => (
                <div key={document.id} className="company-document">
                  <FileText size={16} />
                  <span>
                    <strong>{document.title}</strong>
                    <small>{document.originalName}</small>
                  </span>
                  {!readOnlyPreview ? (
                    <>
                      <FilePreviewDialog
                        fileId={document.fileId}
                        name={document.originalName}
                        contentType={document.contentType}
                      />
                      <a
                        className="icon-button"
                        href={`/api/files/${document.fileId}`}
                        aria-label={`${t("Download")} ${document.originalName}`}
                      >
                        <Download size={15} />
                      </a>
                    </>
                  ) : (
                    <span className="muted document-preview-restricted">
                      {t("File access is unavailable in employee preview.")}
                    </span>
                  )}
                </div>
              ))}
            {!documents.some((document) => document.folderId === folder.id) && (
              <div className="compact-empty">
                {t("No documents in this folder.")}
              </div>
            )}
          </article>
        ))}
        {folders.length === 0 && (
          <div className="compact-empty">
            <Folder size={18} />
            {t("No document folders yet.")}
          </div>
        )}
      </section>
      {open && (
        <DialogBackdrop onClose={() => setOpen(null)}>
          <form className="dialog compact-dialog form-grid" onSubmit={submit}>
            <h2>{t(open === "folder" ? "New folder" : "Upload document")}</h2>
            {open === "folder" ? (
              <>
                <label className="span-two">
                  {t("Name")}
                  <input name="name" autoFocus required />
                </label>
                <label className="span-two">
                  {t("Description")}
                  <textarea name="description" rows={3} />
                </label>
              </>
            ) : (
              <>
                <label>
                  {t("Folder")}
                  <select name="folderId" required>
                    {folders.map((folder) => (
                      <option value={folder.id} key={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Title")}
                  <input name="title" />
                </label>
                <label className="span-two">
                  {t("File")}
                  <input
                    name="file"
                    type="file"
                    accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"
                    required
                  />
                </label>
              </>
            )}
            {error && <p className="form-error">{t(error)}</p>}
            <div className="dialog-actions">
              <button
                type="button"
                className="button ghost-button"
                onClick={() => setOpen(null)}
              >
                {t("Cancel")}
              </button>
              <button className="button primary-button">{t("Save")}</button>
            </div>
          </form>
        </DialogBackdrop>
      )}
    </>
  );
}
