"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronRight, FolderPlus, Search } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";

export type KnowledgeArticle = {
  id: number;
  sectionId: number | null;
  title: string;
  category: string;
  body: string;
  published: boolean;
  minimumRole: string;
  authorEmail: string;
  updatedAt: string;
  sharedEmployeeIds: number[];
  attachments: {
    id: string;
    originalName: string;
    sizeBytes: number;
    contentType: string;
  }[];
};

export type KnowledgeSection = {
  id: number;
  parentId: number | null;
  title: string;
  description: string;
  minimumRole: string;
  sortOrder: number;
  articleCount: number;
  previewArticles: { id: number; title: string }[];
  previewSections?: { id: number; title: string }[];
};

export function KnowledgeWorkspace({
  sections,
  articles,
  canManage,
}: {
  sections: KnowledgeSection[];
  articles: KnowledgeArticle[];
  canManage: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("uk-UA");
  const results = useMemo(
    () =>
      normalizedQuery
        ? articles.filter((article) =>
            `${article.title} ${article.category} ${normalizeBody(article.body)}`
              .toLocaleLowerCase("uk-UA")
              .includes(normalizedQuery),
          )
        : [],
    [articles, normalizedQuery],
  );

  async function createSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/knowledge/sections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: form.get("description"),
        minimumRole: form.get("minimumRole"),
        sortOrder: form.get("sortOrder"),
      }),
    });
    const result = (await response.json()) as {
      section?: KnowledgeSection;
      error?: string;
    };
    if (!response.ok || !result.section) {
      setError(result.error ?? "Could not create section.");
      return;
    }
    router.push(`/knowledge/sections/${result.section.id}`);
    router.refresh();
  }

  return (
    <>
      <section className="page-heading-row knowledge-page-heading">
        <div>
          <p className="eyebrow">{t("INCORA People guide")}</p>
          <h1>{t("Knowledge base")}</h1>
          <p>{t("Choose a section and open the instruction you need.")}</p>
        </div>
        {canManage && (
          <button
            className="button primary-button"
            onClick={() => setOpen(true)}
          >
            <FolderPlus size={16} />
            {t("New section")}
          </button>
        )}
      </section>

      <section className="knowledge-search panel">
        <Search size={18} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("Search by function or problem…")}
          aria-label={t("Search knowledge base…")}
        />
      </section>

      {normalizedQuery ? (
        <section className="knowledge-search-results panel">
          <header>
            <h2>{t("Search results")}</h2>
            <span>{results.length}</span>
          </header>
          <div className="knowledge-topic-list">
            {results.map((article) => (
              <a
                className="knowledge-topic"
                href={`/knowledge/${article.id}`}
                key={article.id}
              >
                <div>
                  <strong>{article.title}</strong>
                  <p>{articleSummary(article.body)}</p>
                  <span className="knowledge-role">{article.category}</span>
                </div>
                <ChevronRight size={19} aria-hidden="true" />
              </a>
            ))}
            {results.length === 0 && (
              <div className="compact-empty knowledge-empty">
                <BookOpen size={22} />
                <strong>{t("Nothing found")}</strong>
                <span>{t("Try a different function or problem name.")}</span>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section
          className="knowledge-card-grid"
          aria-label={t("Guide contents")}
        >
          {sections.map((section, index) => (
            <a
              className="panel knowledge-section-card"
              href={`/knowledge/sections/${section.id}`}
              key={section.id}
            >
              <div className="knowledge-section-card-top">
                <span className="knowledge-section-number">
                  {sectionNumber(section.title, index)}
                </span>
                <ChevronRight size={20} aria-hidden="true" />
              </div>
              <p className="eyebrow">{t("Knowledge section")}</p>
              <h2>{section.title}</h2>
              <p className="knowledge-section-description">
                {section.description ||
                  t("Company instructions and useful materials.")}
              </p>
              <div className="knowledge-section-preview">
                {section.previewSections?.map((child) => (
                  <span key={child.id}>{child.title}</span>
                ))}
                {section.previewArticles.map((article) => (
                  <span key={article.id}>{article.title}</span>
                ))}
              </div>
              <footer>
                <strong>{section.articleCount}</strong> {t("articles")}
                <span>
                  {t("Available from role")} · {t(section.minimumRole)}
                </span>
              </footer>
            </a>
          ))}
          {sections.length === 0 && (
            <div className="panel compact-empty knowledge-empty">
              <BookOpen size={22} />
              <strong>{t("No knowledge sections yet.")}</strong>
            </div>
          )}
        </section>
      )}

      {open && (
        <DialogBackdrop onClose={() => setOpen(false)}>
          <form
            className="dialog compact-dialog form-grid"
            onSubmit={createSection}
          >
            <h2>{t("New section")}</h2>
            <label className="span-two">
              {t("Section title")}
              <input name="title" required autoFocus />
            </label>
            <label className="span-two">
              {t("Description")}
              <textarea name="description" rows={3} />
            </label>
            <label>
              {t("Minimum access")}
              <select name="minimumRole" defaultValue="employee">
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
                defaultValue="100"
              />
            </label>
            {error && <p className="form-error span-two">{t(error)}</p>}
            <div className="dialog-actions span-two">
              <button
                type="button"
                className="button ghost-button"
                onClick={() => setOpen(false)}
              >
                {t("Cancel")}
              </button>
              <button className="button primary-button">
                {t("Create section")}
              </button>
            </div>
          </form>
        </DialogBackdrop>
      )}
    </>
  );
}

export function normalizeBody(body: string) {
  return body.replaceAll("\\n", "\n");
}

export function articleSummary(body: string) {
  const lines = normalizeBody(body)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.find((line) => !/^\d+(?:\.\d+)+\s/.test(line)) ?? lines[0] ?? "";
}

function sectionNumber(title: string, index: number) {
  return title.match(/^\d+/)?.[0] ?? String(index + 1).padStart(2, "0");
}
