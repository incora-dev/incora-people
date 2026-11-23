import sanitizeHtml from "sanitize-html";
import { decodeHTMLStrict } from "entities";

// Legacy titles can contain escaped text. Only use this at plain-text
// boundaries, never as markup or as the value persisted by the editor.
export function announcementTitleText(value: string) {
  return decodeHTMLStrict(value).trim();
}

export function sanitizeAnnouncementHtml(value: string) {
  return sanitizeHtml(value, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "h2",
      "h3",
      "ul",
      "ol",
      "li",
      "blockquote",
      "a",
    ],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (_tag, attributes) => ({
        tagName: "a",
        attribs: {
          ...attributes,
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    },
  }).trim();
}

export function plainAnnouncementText(value: string) {
  const withBlockSpacing = value.replace(
    /<\/\s*(?:p|h[1-6]|li|blockquote)\s*>|<br\s*\/?>/gi,
    " ",
  );
  // sanitize-html outputs HTML-escaped text even when every tag is stripped.
  // Decode that output once; callers must still escape it for their context.
  return decodeHTMLStrict(
    sanitizeHtml(withBlockSpacing, { allowedTags: [], allowedAttributes: {} }),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function announcementChatText(title: string, body: string, url: string) {
  return `📣 *${announcementTitleText(title)}*\n${plainAnnouncementText(body)}\n${url}`;
}
