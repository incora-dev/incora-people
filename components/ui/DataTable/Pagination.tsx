"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { pageList, pageRange } from "./logic";

/** Page buttons with arrows and an "1 – 20 of N items" summary. */
export function Pagination({
  page,
  pageCount,
  pageSize,
  totalRows,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number | false;
  totalRows: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useI18n();
  const { from, to } = pageRange(page, pageSize, totalRows);
  return (
    <footer className="data-table-pagination">
      <nav aria-label={t("Pagination")}>
        <button
          type="button"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={t("Previous page")}
        >
          <ChevronLeft size={16} />
        </button>
        {pageList(page, pageCount).map((item, index) =>
          item === "gap" ? (
            <span key={`gap-${index}`}>…</span>
          ) : (
            <button
              type="button"
              key={item}
              className={item === page ? "active" : ""}
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={page === pageCount}
          onClick={() => onPageChange(page + 1)}
          aria-label={t("Next page")}
        >
          <ChevronRight size={16} />
        </button>
      </nav>
      <span>
        {totalRows === 0 ? 0 : `${from} – ${to}`} {t("of")} {totalRows}{" "}
        {t("items")}
      </span>
    </footer>
  );
}
