"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  ImagePlus,
  Link2,
  List,
  ListOrdered,
  Quote,
  Underline,
} from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";

export function RichTextEditor({
  name,
  initialValue = "",
  placeholder,
  onUploadImage,
}: {
  name: string;
  initialValue?: string;
  placeholder?: string;
  onUploadImage?: (file: File) => Promise<string>;
}) {
  const { t } = useI18n();
  const editor = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (editor.current) editor.current.innerHTML = initialValue;
    if (hidden.current) hidden.current.value = initialValue;
  }, [initialValue]);
  function run(command: string, value?: string) {
    editor.current?.focus();
    document.execCommand(command, false, value);
    sync();
  }
  function sync() {
    if (editor.current && hidden.current)
      hidden.current.value = editor.current.innerHTML;
  }
  async function uploadImage(file: File) {
    if (!onUploadImage) return;
    setUploading(true);
    setError("");
    try {
      const url = await onUploadImage(file);
      run("insertImage", url);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : t("Could not upload this image."),
      );
    } finally {
      setUploading(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  }
  return (
    <div className="rich-editor">
      <div className="rich-editor-toolbar" aria-label={t("Text formatting")}>
        <button
          type="button"
          onClick={() => run("bold")}
          aria-label={t("Bold")}
        >
          <Bold size={16} />
        </button>
        <button
          type="button"
          onClick={() => run("italic")}
          aria-label={t("Italic")}
        >
          <Italic size={16} />
        </button>
        <button
          type="button"
          onClick={() => run("underline")}
          aria-label={t("Underline")}
        >
          <Underline size={16} />
        </button>
        <button type="button" onClick={() => run("formatBlock", "h2")}>
          H2
        </button>
        <button type="button" onClick={() => run("formatBlock", "h3")}>
          H3
        </button>
        <button
          type="button"
          onClick={() => run("insertUnorderedList")}
          aria-label={t("Bulleted list")}
        >
          <List size={16} />
        </button>
        <button
          type="button"
          onClick={() => run("insertOrderedList")}
          aria-label={t("Numbered list")}
        >
          <ListOrdered size={16} />
        </button>
        <button
          type="button"
          onClick={() => run("formatBlock", "blockquote")}
          aria-label={t("Quote")}
        >
          <Quote size={16} />
        </button>
        <button
          type="button"
          onClick={() => {
            const url = window.prompt(t("Link URL"));
            if (url) run("createLink", url);
          }}
          aria-label={t("Link")}
        >
          <Link2 size={16} />
        </button>
        {onUploadImage && (
          <>
            <button
              type="button"
              onClick={() => imageInput.current?.click()}
              aria-label={t("Insert image")}
              disabled={uploading}
            >
              <ImagePlus size={16} />
            </button>
            <input
              ref={imageInput}
              className="visually-hidden"
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadImage(file);
              }}
            />
          </>
        )}
      </div>
      <div
        ref={editor}
        className="rich-editor-field"
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder ?? t("Announcement text")}
        onInput={sync}
      />
      <input ref={hidden} name={name} type="hidden" required />
      {error && <p className="form-error rich-editor-error">{error}</p>}
    </div>
  );
}
