"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  ImageIcon,
  Paperclip,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { FilePreviewDialog } from "@/components/ui/FilePreviewDialog";
import { SearchableEmployeeMultiSelect } from "@/components/ui/SearchableEmployeeMultiSelect";
import {
  KnowledgeArticle,
  normalizeBody,
} from "@/components/knowledge/KnowledgeWorkspace";
import { isRichKnowledgeBody } from "@/modules/knowledge/body";

export function KnowledgeArticleView({
  article: initialArticle,
  canManage,
  employeeOptions,
}: {
  article: KnowledgeArticle;
  canManage: boolean;
  employeeOptions: {
    id: number;
    firstName: string;
    lastName: string;
    jobTitle: string;
  }[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [article, setArticle] = useState(initialArticle);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/knowledge/articles", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: article.id,
        sectionId: article.sectionId,
        title: form.get("title"),
        category: article.category,
        body: form.get("body"),
        published: form.get("published") === "on",
        minimumRole: form.get("minimumRole"),
        sharedEmployeeIds: parseSharedEmployeeIds(
          form.get("sharedEmployeeIds"),
        ),
      }),
    });
    const result = (await response.json()) as {
      article?: KnowledgeArticle;
      error?: string;
    };
    if (!response.ok || !result.article) {
      setError(result.error ?? "Could not publish article.");
      return;
    }
    setArticle({ ...result.article, attachments: article.attachments });
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(t("Delete this article permanently?"))) return;
    const response = await fetch(`/api/knowledge/articles?id=${article.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      setError(result.error ?? "Could not delete article.");
      return;
    }
    router.push("/knowledge");
    router.refresh();
  }

  async function uploadAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const file = new FormData(form).get("file");
    if (!(file instanceof File) || file.size === 0) return;
    try {
      await uploadFile(file);
      form.reset();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload attachment.",
      );
    }
  }

  async function uploadFile(file: File) {
    const payload = new FormData();
    payload.set("file", file);
    const response = await fetch(
      `/api/knowledge/articles/${article.id}/attachments`,
      { method: "POST", body: payload },
    );
    const result = (await response.json()) as {
      attachment?: KnowledgeArticle["attachments"][number];
      error?: string;
    };
    if (!response.ok || !result.attachment) {
      throw new Error(result.error ?? "Could not upload attachment.");
    }
    setArticle((current) => ({
      ...current,
      attachments: [...current.attachments, result.attachment!],
    }));
    return result.attachment;
  }

  async function uploadInlineImage(file: File) {
    const attachment = await uploadFile(file);
    return `/api/files/${attachment.id}?preview=1`;
  }

  return (
    <>
      <a
        className="back-link knowledge-back"
        href={
          article.sectionId
            ? `/knowledge/sections/${article.sectionId}`
            : "/knowledge"
        }
      >
        <ArrowLeft size={17} />
        {t("Back to section")}
      </a>

      <article className="panel knowledge-detail">
        <header className="knowledge-detail-header">
          <div>
            <span className="asset-tag">{article.category}</span>
            <h1>{article.title}</h1>
            <p>
              {t("Available from role")} · {t(article.minimumRole)}
              <span aria-hidden="true"> · </span>
              {t("Updated")}{" "}
              {new Date(article.updatedAt).toLocaleDateString("uk-UA")}
            </p>
          </div>
          {canManage && (
            <div className="button-row">
              <button
                className="button ghost-button"
                onClick={() => setEditing(true)}
              >
                <Pencil size={16} />
                {t("Edit")}
              </button>
              <button
                className="icon-button document-delete"
                onClick={remove}
                aria-label={t("Delete article")}
              >
                <Trash2 size={17} />
              </button>
            </div>
          )}
        </header>

        {isRichKnowledgeBody(article.body) ? (
          <div
            className="knowledge-article-body rich-knowledge-body"
            dangerouslySetInnerHTML={{ __html: article.body }}
          />
        ) : (
          <div className="knowledge-article-body">
            {normalizeBody(article.body)
              .split("\n")
              .map((line, index) => renderGuideLine(line, index))}
          </div>
        )}

        {article.attachments.length > 0 && (
          <section className="knowledge-screenshots">
            <h2>
              <ImageIcon size={19} />
              {t("Screenshots and examples")}
            </h2>
            <div className="knowledge-screenshot-grid">
              {article.attachments
                .filter((file) => !article.body.includes(file.id))
                .map((file) =>
                  file.contentType.startsWith("image/") ? (
                    <figure key={file.id}>
                      <a
                        href={`/api/files/${file.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/files/${file.id}?preview=1`}
                          alt={file.originalName}
                        />
                      </a>
                      <figcaption>{file.originalName}</figcaption>
                    </figure>
                  ) : (
                    <div className="knowledge-file" key={file.id}>
                      <FilePreviewDialog
                        fileId={file.id}
                        name={file.originalName}
                        contentType={file.contentType}
                      />
                      <span>{file.originalName}</span>
                      <a
                        className="icon-button"
                        href={`/api/files/${file.id}`}
                        aria-label={`${t("Download")} ${file.originalName}`}
                      >
                        <Download size={16} />
                      </a>
                    </div>
                  ),
                )}
            </div>
          </section>
        )}

        {canManage && (
          <section className="knowledge-attachments">
            <strong>
              <Paperclip size={16} />
              {t("Add a screenshot or file")}
            </strong>
            <form onSubmit={uploadAttachment}>
              <input
                name="file"
                type="file"
                accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"
                required
              />
              <button className="button ghost-button">
                <Upload size={15} />
                {t("Attach file")}
              </button>
            </form>
          </section>
        )}
        {error && <p className="form-error">{t(error)}</p>}
      </article>

      {editing && (
        <DialogBackdrop onClose={() => setEditing(false)}>
          <form className="dialog compact-dialog form-grid" onSubmit={save}>
            <h2>{t("Edit article")}</h2>
            <label className="span-two">
              {t("Title")}
              <input name="title" defaultValue={article.title} required />
            </label>
            <label>
              {t("Minimum access")}
              <select name="minimumRole" defaultValue={article.minimumRole}>
                <option value="employee">{t("employee")}</option>
                <option value="manager">{t("manager")}</option>
                <option value="hr_admin">{t("hr_admin")}</option>
                <option value="super_admin">{t("super_admin")}</option>
              </select>
            </label>
            <label className="checkbox-field">
              <input
                name="published"
                type="checkbox"
                defaultChecked={article.published}
              />
              {t("Publish now")}
            </label>
            <div className="span-two">
              <SearchableEmployeeMultiSelect
                name="sharedEmployeeIds"
                options={employeeOptions}
                defaultValue={article.sharedEmployeeIds}
                label={t("Share with specific people")}
                placeholder={t("Everyone with the selected role")}
                searchPlaceholder={t("Search employees")}
                emptyLabel={t("No employees found")}
                selectedLabel={(count) =>
                  `${t("Selected employees")}: ${count}`
                }
              />
              <small className="form-help">
                {t(
                  "People shared here can read the published article in addition to its role access.",
                )}
              </small>
            </div>
            <div className="span-two knowledge-editor-field">
              <span>{t("Content")}</span>
              <RichTextEditor
                name="body"
                initialValue={editorBody(article.body)}
                placeholder={t("Write the article content…")}
                onUploadImage={uploadInlineImage}
              />
            </div>
            {error && <p className="form-error span-two">{t(error)}</p>}
            <div className="dialog-actions span-two">
              <button
                type="button"
                className="button ghost-button"
                onClick={() => setEditing(false)}
              >
                {t("Cancel")}
              </button>
              <button className="button primary-button">
                {t("Save changes")}
              </button>
            </div>
          </form>
        </DialogBackdrop>
      )}
    </>
  );
}

function parseSharedEmployeeIds(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is number =>
            typeof item === "number" && Number.isInteger(item) && item > 0,
        )
      : [];
  } catch {
    return [];
  }
}

function editorBody(value: string) {
  if (isRichKnowledgeBody(value)) return value;
  return normalizeBody(value)
    .split("\n")
    .map((line) =>
      line.trim() ? `<p>${escapeHtml(line.trim())}</p>` : "<p><br></p>",
    )
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderGuideLine(line: string, index: number) {
  const trimmed = line.trim();
  if (!trimmed) return <div className="knowledge-spacer" key={index} />;

  const heading = trimmed.match(/^(\d+(?:\.\d+){2,})\s+(.+)$/);
  if (heading) {
    return (
      <h2 className="knowledge-step-heading" key={index}>
        <span>{heading[1]}</span>
        {heading[2]}
      </h2>
    );
  }

  if (trimmed.startsWith("• ") || trimmed.startsWith("- ")) {
    return (
      <p className="knowledge-bullet" key={index}>
        <span aria-hidden="true">•</span>
        {trimmed.slice(2)}
      </p>
    );
  }

  const label = trimmed.match(
    /^(Що робить|Як користуватися|Типові проблеми|Важливо|Хто має доступ):\s*(.*)$/,
  );
  if (label) {
    return (
      <div className="knowledge-callout" key={index}>
        <strong>{label[1]}</strong>
        {label[2] && <p>{label[2]}</p>}
      </div>
    );
  }

  return <p key={index}>{trimmed}</p>;
}
