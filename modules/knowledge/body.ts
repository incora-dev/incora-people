export function isRichKnowledgeBody(value: string) {
  return /<(?:p|br|strong|b|em|i|u|h2|h3|ul|ol|li|blockquote|a|img)\b/i.test(
    value,
  );
}
