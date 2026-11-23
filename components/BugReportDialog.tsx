"use client";

import { FormEvent, useRef, useState } from "react";
import { Bug, Camera, Check, X } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { validateBugScreenshot } from "@/modules/bugs/client-validation";

export function BugReportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const submissionRef = useRef(false);
  const [description, setDescription] = useState("");
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionRef.current) return;
    setMessage("");
    if (description.trim().length < 10) {
      setMessage(t("Describe the issue in at least 10 characters."));
      return;
    }
    const file = fileRef.current?.files?.[0];
    const fileError = validateBugScreenshot(file ?? null);
    if (fileError) {
      setMessage(t(fileError));
      return;
    }
    if (!file) return;

    submissionRef.current = true;
    setSubmitting(true);
    const form = new FormData();
    form.set("description", description);
    form.set("screenshot", file);
    try {
      const response = await fetch("/api/bug-reports", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(t(result.error ?? "Could not send the report."));
        return;
      }
      setSent(true);
      setMessage(t("Thank you. The report was sent to administrators."));
    } catch {
      setMessage(t("Could not send the report."));
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  }

  function selectScreenshot(file: File | undefined) {
    setMessage("");
    const fileError = validateBugScreenshot(file ?? null);
    if (fileError) {
      if (fileRef.current) fileRef.current.value = "";
      setFileName("");
      setMessage(t(fileError));
      return;
    }
    setFileName(file?.name ?? "");
  }

  function removeScreenshot() {
    if (fileRef.current) fileRef.current.value = "";
    setFileName("");
    setMessage("");
  }

  return (
    <DialogBackdrop onClose={onClose}>
      <section
        className="dialog bug-report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-title"
      >
        <div className="dialog-header">
          <div>
            <span className="dialog-icon">
              <Bug size={18} aria-hidden="true" />
            </span>
            <h2 id="bug-report-title">{t("Bug report")}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t("Close")}
          >
            <X size={17} />
          </button>
        </div>
        {sent ? (
          <div className="bug-report-success">
            <Check size={24} />
            <p>{message}</p>
            <button className="button primary-button" onClick={onClose}>
              OK
            </button>
          </div>
        ) : (
          <form noValidate onSubmit={submit}>
            <label>
              <span>{t("Describe what happened")}</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                maxLength={3000}
                required
              />
            </label>
            <div className="bug-upload-row">
              <label className="bug-upload">
                <Camera size={18} aria-hidden="true" />
                <span>
                  <strong>{t("Add a screenshot")}</strong>
                  <small>
                    {fileName || t("PNG, JPEG or WebP, up to 10 MB")}
                  </small>
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label={t("Add a screenshot")}
                  onChange={(event) =>
                    selectScreenshot(event.target.files?.[0])
                  }
                  required
                />
              </label>
              {fileName && (
                <button
                  type="button"
                  className="icon-button bug-upload-remove"
                  onClick={removeScreenshot}
                  aria-label={t("Remove screenshot")}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            {message && <p className="form-message error">{message}</p>}
            <div className="dialog-actions">
              <button
                type="button"
                className="button ghost-button"
                onClick={onClose}
              >
                {t("Cancel")}
              </button>
              <button className="button primary-button" disabled={submitting}>
                {submitting ? t("Sending…") : t("Send report")}
              </button>
            </div>
          </form>
        )}
      </section>
    </DialogBackdrop>
  );
}
