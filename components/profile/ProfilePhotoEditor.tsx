"use client";

import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { calculateSquareCrop } from "@/modules/files/image-crop";

const OUTPUT_SIZE = 800;

export function ProfilePhotoEditor({
  file,
  busy,
  onCancel,
  onSave,
}: {
  file: File;
  busy: boolean;
  onCancel: () => void;
  onSave: (file: File) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    positionX: number;
    positionY: number;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [positionX, setPositionX] = useState(0);
  const [positionY, setPositionY] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    const nextImage = new window.Image();
    nextImage.onload = () => {
      image.current = nextImage;
      setReady(true);
    };
    nextImage.onerror = () => setError(t("Could not read this image."));
    nextImage.src = objectUrl;
    return () => {
      URL.revokeObjectURL(objectUrl);
      image.current = null;
    };
  }, [file, t]);

  useEffect(() => {
    drawPreview(canvas.current, image.current, zoom, positionX, positionY);
  }, [positionX, positionY, ready, zoom]);

  async function save() {
    if (!image.current) return;
    setError("");
    try {
      const output = document.createElement("canvas");
      output.width = OUTPUT_SIZE;
      output.height = OUTPUT_SIZE;
      drawPreview(output, image.current, zoom, positionX, positionY);
      const blob = await canvasBlob(output, "image/jpeg", 0.9);
      const baseName = file.name.replace(/\.[^.]+$/, "").slice(0, 120);
      const saved = await onSave(
        new File([blob], `${baseName || "profile-photo"}-square.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        }),
      );
      if (!saved) setError(t("Could not update profile image."));
    } catch {
      setError(t("Could not crop profile photo."));
    }
  }

  function reset() {
    setZoom(1);
    setPositionX(0);
    setPositionY(0);
  }

  return (
    <DialogBackdrop
      className="profile-photo-editor-backdrop"
      onClose={onCancel}
    >
      <section
        className="profile-photo-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-photo-editor-title"
      >
        <header>
          <div>
            <span className="eyebrow">{t("Profile photo")}</span>
            <h2 id="profile-photo-editor-title">{t("Crop profile photo")}</h2>
            <p>
              {t("Choose the square area that will be shown in your profile.")}
            </p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onCancel}
            aria-label={t("Close")}
          >
            <X size={18} />
          </button>
        </header>

        <div
          className="profile-photo-crop-stage"
          onPointerDown={(event) => {
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              positionX,
              positionY,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            const rect = event.currentTarget.getBoundingClientRect();
            setPositionX(
              clamp(
                drag.current.positionX -
                  ((event.clientX - drag.current.x) / rect.width) * 2,
                -1,
                1,
              ),
            );
            setPositionY(
              clamp(
                drag.current.positionY -
                  ((event.clientY - drag.current.y) / rect.height) * 2,
                -1,
                1,
              ),
            );
          }}
          onPointerUp={(event) => {
            drag.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <canvas ref={canvas} width={OUTPUT_SIZE} height={OUTPUT_SIZE} />
          {!ready && !error && <span>{t("Preparing image…")}</span>}
        </div>
        <p className="profile-photo-editor-hint">
          {t("Drag the photo to choose its position.")}
        </p>

        <label className="profile-photo-zoom">
          <span>{t("Zoom")}</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <output>{Math.round(zoom * 100)}%</output>
        </label>

        {error && <p className="form-error">{error}</p>}
        <footer>
          <button className="button ghost-button" type="button" onClick={reset}>
            <RotateCcw size={15} /> {t("Reset")}
          </button>
          <span />
          <button
            className="button ghost-button"
            type="button"
            onClick={onCancel}
          >
            {t("Cancel")}
          </button>
          <button
            className="button primary-button"
            type="button"
            disabled={!ready || busy}
            onClick={() => void save()}
          >
            <Check size={16} /> {busy ? t("Uploading…") : t("Save photo")}
          </button>
        </footer>
      </section>
    </DialogBackdrop>
  );
}

function drawPreview(
  canvas: HTMLCanvasElement | null,
  image: HTMLImageElement | null,
  zoom: number,
  positionX: number,
  positionY: number,
) {
  if (!canvas || !image) return;
  const crop = calculateSquareCrop(
    image.naturalWidth,
    image.naturalHeight,
    zoom,
    positionX,
    positionY,
  );
  if (!crop) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    image,
    crop.sourceX,
    crop.sourceY,
    crop.sourceSize,
    crop.sourceSize,
    0,
    0,
    canvas.width,
    canvas.height,
  );
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas is empty."))),
      type,
      quality,
    );
  });
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
