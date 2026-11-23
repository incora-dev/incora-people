"use client";

import { useState } from "react";
import { Download, Eye, X } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";

export function FilePreviewDialog({
  fileId,
  name,
  contentType,
  compact = true,
}: {
  fileId: string;
  name: string;
  contentType: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const previewUrl = `/api/files/${fileId}?preview=1`;
  const canPreview =
    contentType.startsWith("image/") || contentType === "application/pdf";

  return (
    <>
      <button
        className={compact ? "icon-button" : "button ghost-button"}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${t("Preview")} ${name}`}
      >
        <Eye size={compact ? 17 : 15} />
        {!compact && t("Preview")}
      </button>
      {open && (
        <DialogBackdrop onClose={() => setOpen(false)}>
          <section
            className="file-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`${t("Preview")} ${name}`}
          >
            <header>
              <strong>{name}</strong>
              <span>
                <a
                  className="button ghost-button compact-button"
                  href={`/api/files/${fileId}`}
                >
                  <Download size={15} /> {t("Download")}
                </a>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t("Close")}
                >
                  <X size={18} />
                </button>
              </span>
            </header>
            <div className="file-preview-body">
              {contentType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt={name} />
              ) : contentType === "application/pdf" ? (
                <iframe src={previewUrl} title={name} />
              ) : (
                <div className="compact-empty">
                  {t("Preview is unavailable for this file type.")}
                </div>
              )}
            </div>
            {!canPreview && (
              <p className="muted">
                {t("Download the file to open it in a compatible app.")}
              </p>
            )}
          </section>
        </DialogBackdrop>
      )}
    </>
  );
}
