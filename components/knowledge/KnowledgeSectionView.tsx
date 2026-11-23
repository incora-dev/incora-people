"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { SearchableEmployeeMultiSelect } from "@/components/ui/SearchableEmployeeMultiSelect";
import {
  articleSummary,
  type KnowledgeArticle,
  type KnowledgeSection,
} from "@/components/knowledge/KnowledgeWorkspace";

type SectionDetail = Omit<
  KnowledgeSection,
  "articleCount" | "previewArticles"
> & {
  articles: KnowledgeArticle[];
  childSections: KnowledgeSection[];
};

export function KnowledgeSectionView({
  section: initialSection,
  canManage,
  employeeOptions,
}: {
  section: SectionDetail;
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
  const [section, setSection] = useState(initialSection);
  const [articleDialog, setArticleDialog] = useState(false);
  const [sectionDialog, setSectionDialog] = useState(false);
  const [error, setError] = useState("");

  async function createArticle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/knowledge/articles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sectionId: section.id,
        category: section.title,
        title: form.get("title"),
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
    router.push(`/knowledge/${result.article.id}`);
    router.refresh();
  }

  async function saveSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/knowledge/sections", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: section.id,
        title: form.get("title"),
        description: form.get("description"),
        minimumRole: form.get("minimumRole"),
        sortOrder: form.get("sortOrder"),
      }),
    });
    const result = (await response.json()) as {
      section?: SectionDetail;
      error?: string;
    };
    if (!response.ok || !result.section) {
      setError(result.error ?? "Could not update section.");
      return;
    }
    setSection({ ...section, ...result.section });
    setSectionDialog(false);
    router.refresh();
  }

  async function removeSection() {
    if (!window.confirm(t("Delete this empty section?"))) return;
    setError("");
    const response = await fetch(`/api/knowledge/sections?id=${section.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      setError(result.error ?? "Could not delete section.");
      return;
    }
    router.push("/knowledge");
    router.refresh();
  }

  return (
    <>
      <Link
        className="back-link knowledge-back"
        href="/knowledge"
        prefetch={false}
      >
        <ArrowLeft size={17} />
        {t("Back to knowledge sections")}
      </Link>
      <section className="page-heading-row knowledge-section-heading">
        <div>
          <p className="eyebrow">{t("Knowledge section")}</p>
          <h1>{section.title}</h1>
          <p>
            {section.description ||
              t("Company instructions and useful materials.")}
          </p>
        </div>
        {canManage && (
          <div className="button-row">
            <button
              className="button ghost-button"
              onClick={() => setSectionDialog(true)}
            >
              <Pencil size={16} /> {t("Edit section")}
            </button>
            <button
              className="button primary-button"
              onClick={() => setArticleDialog(true)}
            >
              <Plus size={16} /> {t("New article")}
            </button>
          </div>
        )}
      </section>

      {section.childSections.length > 0 && (
        <section
          className="knowledge-card-grid knowledge-subsection-grid"
          aria-label={t("Guide contents")}
        >
          {section.childSections.map((child, index) => (
            <a
              className="panel knowledge-section-card"
              href={`/knowledge/sections/${child.id}`}
              key={child.id}
            >
              <div className="knowledge-section-card-top">
                <span className="knowledge-section-number">{index + 1}</span>
                <ChevronRight size={20} />
              </div>
              <h2>{child.title}</h2>
              <p>{child.description}</p>
              <div className="knowledge-section-preview">
                {child.previewArticles.map((article) => (
                  <span key={article.id}>{article.title}</span>
                ))}
              </div>
              <footer>
                <strong>{child.articleCount}</strong> {t("articles")}
              </footer>
            </a>
          ))}
        </section>
      )}
      <section className="panel knowledge-section-articles">
        <header>
          <h2>{t("Articles and instructions")}</h2>
          <span>{section.articles.length}</span>
        </header>
        <div className="knowledge-topic-list">
          {section.articles.map((article) => (
            <a
              className="knowledge-topic"
              href={`/knowledge/${article.id}`}
              key={article.id}
            >
              <div>
                <strong>{article.title}</strong>
                <p>{articleSummary(article.body)}</p>
                <span className="knowledge-role">
                  {t("Available from role")} · {t(article.minimumRole)}
                </span>
              </div>
              <ChevronRight size={19} aria-hidden="true" />
            </a>
          ))}
          {section.articles.length === 0 && (
            <div className="compact-empty knowledge-empty">
              <strong>{t("No articles in this section yet.")}</strong>
              {canManage && (
                <span>{t("Create the first instruction for your team.")}</span>
              )}
            </div>
          )}
        </div>
      </section>
      {error && <p className="form-error">{t(error)}</p>}

      {articleDialog && (
        <DialogBackdrop onClose={() => setArticleDialog(false)}>
          <form
            className="dialog compact-dialog form-grid"
            onSubmit={createArticle}
          >
            <h2>{t("New article")}</h2>
            <label className="span-two">
              {t("Title")}
              <input name="title" required autoFocus />
            </label>
            <label>
              {t("Minimum access")}
              <select name="minimumRole" defaultValue={section.minimumRole}>
                <option value="employee">{t("employee")}</option>
                <option value="manager">{t("manager")}</option>
                <option value="hr_admin">{t("hr_admin")}</option>
                <option value="super_admin">{t("super_admin")}</option>
              </select>
            </label>
            <label className="checkbox-field">
              <input name="published" type="checkbox" defaultChecked />
              {t("Publish now")}
            </label>
            <div className="span-two">
              <SearchableEmployeeMultiSelect
                name="sharedEmployeeIds"
                options={employeeOptions}
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
                placeholder={t("Write the article content…")}
              />
            </div>
            {error && <p className="form-error span-two">{t(error)}</p>}
            <div className="dialog-actions span-two">
              <button
                type="button"
                className="button ghost-button"
                onClick={() => setArticleDialog(false)}
              >
                {t("Cancel")}
              </button>
              <button className="button primary-button">
                {t("Publish article")}
              </button>
            </div>
          </form>
        </DialogBackdrop>
      )}

      {sectionDialog && (
        <DialogBackdrop onClose={() => setSectionDialog(false)}>
          <form
            className="dialog compact-dialog form-grid"
            onSubmit={saveSection}
          >
            <h2>{t("Edit section")}</h2>
            <label className="span-two">
              {t("Section title")}
              <input
                name="title"
                defaultValue={section.title}
                required
                autoFocus
              />
            </label>
            <label className="span-two">
              {t("Description")}
              <textarea
                name="description"
                rows={3}
                defaultValue={section.description}
              />
            </label>
            <label>
              {t("Minimum access")}
              <select name="minimumRole" defaultValue={section.minimumRole}>
                <option value="employee">{t("employee")}</option>
                <option value="manager">{t("manager")}</option>
                <option value="hr_admin">{t("hr_admin")}</option>
                <option value="super_admin">{t("super_admin")}</option>
              </select>
            </label>
            <label>
              {t("Order")}
              <input
                name="sortOrder"
                type="number"
                min="0"
                defaultValue={section.sortOrder}
              />
            </label>
            {error && <p className="form-error span-two">{t(error)}</p>}
            <div className="dialog-actions span-two knowledge-section-dialog-actions">
              <button
                type="button"
                className="button danger-button"
                onClick={removeSection}
              >
                <Trash2 size={15} /> {t("Delete section")}
              </button>
              <span />
              <button
                type="button"
                className="button ghost-button"
                onClick={() => setSectionDialog(false)}
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
