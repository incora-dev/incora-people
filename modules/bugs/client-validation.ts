export const MAX_BUG_SCREENSHOT_SIZE = 10 * 1024 * 1024;

const acceptedScreenshotTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type BugScreenshotValidationError =
  | "Choose an image file."
  | "Upload a JPEG, PNG or WebP image."
  | "The maximum file size is 10 MB.";

export function validateBugScreenshot(
  file: Pick<File, "size" | "type"> | null,
): BugScreenshotValidationError | null {
  if (!file || file.size <= 0) return "Choose an image file.";
  if (!acceptedScreenshotTypes.has(file.type)) {
    return "Upload a JPEG, PNG or WebP image.";
  }
  if (file.size > MAX_BUG_SCREENSHOT_SIZE) {
    return "The maximum file size is 10 MB.";
  }
  return null;
}
