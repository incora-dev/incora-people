function senderAddress(value: string) {
  const from = value.trim();
  if (!from || from.length > 254 || /[\r\n]/.test(from)) return null;
  const match = from.match(/^(?:[A-Za-z0-9 ._'’-]+\s+)?<([^<>]+)>$/);
  const address = match?.[1] ?? from;
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) ? address : null;
}

export function isValidInvitationSender(value: string) {
  return senderAddress(value) !== null;
}

export function formatIncoraEmailSender(value: string) {
  const address = senderAddress(value);
  if (!address) throw new Error("Invalid INCORA People sender address.");
  return `INCORA People <${address}>`;
}
