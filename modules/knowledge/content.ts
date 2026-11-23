import sanitizeHtml from "sanitize-html";

const ownFileUrl = /^\/api\/files\/[a-zA-Z0-9-]+\?preview=1$/;

export function sanitizeKnowledgeHtml(value: string) {
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
      "img",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt"],
    },
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
      img: (_tag, attributes) =>
        ownFileUrl.test(attributes.src ?? "")
          ? {
              tagName: "img",
              attribs: { src: attributes.src, alt: attributes.alt ?? "" },
            }
          : {
              tagName: "span",
              attribs: {} as Record<string, string>,
            },
    },
  }).trim();
}
