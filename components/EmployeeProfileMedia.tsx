"use client";

import Image from "next/image";
import { Camera, ImagePlus, Trash2, X } from "lucide-react";
import { ChangeEvent, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { ProfilePhotoEditor } from "@/components/profile/ProfilePhotoEditor";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";

type MediaFile = { id: string; originalName: string } | null;

export function EmployeeProfileMedia({
  employeeId,
  firstName,
  lastName,
  photo,
  cover,
  canEdit,
  children,
}: {
  employeeId: number;
  firstName: string;
  lastName: string;
  photo: MediaFile;
  cover: MediaFile;
  canEdit: boolean;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [photoDraft, setPhotoDraft] = useState<File | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);

  async function uploadFile(
    kind: "profile_photo" | "profile_cover",
    file: File,
  ) {
    setBusy(kind);
    setError("");
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    const response = await fetch(`/api/employees/${employeeId}/media`, {
      method: "POST",
      body: form,
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(t(result.error ?? "Could not update profile image."));
      setBusy(null);
      return false;
    }
    window.location.reload();
    return true;
  }

  function chooseCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void uploadFile("profile_cover", file);
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError(t("Upload a JPEG, PNG or WebP image."));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(t("The maximum file size is 10 MB."));
      return;
    }
    setPhotoDraft(file);
  }

  async function remove(kind: "profile_photo" | "profile_cover") {
    setBusy(kind);
    setError("");
    const response = await fetch(
      `/api/employees/${employeeId}/media?kind=${kind}`,
      { method: "DELETE" },
    );
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(t(result.error ?? "Could not remove profile image."));
      setBusy(null);
      return;
    }
    window.location.reload();
  }

  return (
    <section className="profile-hero panel">
      <div className="profile-cover">
        {cover ? (
          <Image
            src={`/api/files/${cover.id}`}
            alt={t("Profile cover")}
            fill
            sizes="(max-width: 720px) 100vw, 1200px"
            priority
            unoptimized
          />
        ) : (
          <span className="profile-cover-placeholder" aria-hidden="true" />
        )}
        {canEdit && (
          <div className="profile-cover-actions">
            <label className="button ghost-button compact-control">
              <ImagePlus size={15} />
              {busy === "profile_cover"
                ? t("Uploading…")
                : cover
                  ? t("Change cover")
                  : t("Add cover")}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={Boolean(busy)}
                onChange={chooseCover}
              />
            </label>
            {cover && (
              <button
                type="button"
                className="icon-button"
                disabled={Boolean(busy)}
                onClick={() => remove("profile_cover")}
                aria-label={t("Remove cover")}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="profile-hero-main">
        <div className="profile-avatar-wrap">
          <button
            className="avatar profile-avatar profile-photo-view-button"
            type="button"
            disabled={!photo}
            onClick={() => photo && setPhotoOpen(true)}
            aria-label={photo ? t("Open profile photo") : undefined}
          >
            {photo ? (
              <Image
                src={`/api/files/${photo.id}`}
                alt={`${firstName} ${lastName}`}
                fill
                sizes="78px"
                priority
                unoptimized
              />
            ) : (
              <>
                {firstName[0]}
                {lastName[0]}
              </>
            )}
          </button>
          {canEdit && (
            <label
              className="profile-photo-action"
              aria-label={t("Change profile photo")}
            >
              <Camera size={14} />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={Boolean(busy)}
                onChange={choosePhoto}
              />
            </label>
          )}
        </div>
        {children}
      </div>
      {error && <p className="profile-media-error">{error}</p>}
      {photoDraft && (
        <ProfilePhotoEditor
          file={photoDraft}
          busy={busy === "profile_photo"}
          onCancel={() => setPhotoDraft(null)}
          onSave={(file) => uploadFile("profile_photo", file)}
        />
      )}
      {photo && photoOpen && (
        <DialogBackdrop
          className="profile-photo-lightbox-backdrop"
          onClose={() => setPhotoOpen(false)}
          confirmWhenDirty={false}
        >
          <section
            className="profile-photo-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={`${firstName} ${lastName}`}
          >
            <button
              className="profile-photo-lightbox-close"
              type="button"
              onClick={() => setPhotoOpen(false)}
              aria-label={t("Close")}
            >
              <X size={20} />
            </button>
            <Image
              src={`/api/files/${photo.id}`}
              alt={`${firstName} ${lastName}`}
              width={1000}
              height={1000}
              sizes="(max-width: 720px) 92vw, 720px"
              unoptimized
            />
            <strong>
              {firstName} {lastName}
            </strong>
          </section>
        </DialogBackdrop>
      )}
    </section>
  );
}
