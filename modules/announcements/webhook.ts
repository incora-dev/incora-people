export async function postAnnouncementWebhook(
  endpoint: string,
  payload: unknown,
  input: { secret?: string; fetcher?: typeof fetch } = {},
) {
  const response = await (input.fetcher ?? fetch)(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(input.secret ? { "x-incora-webhook-secret": input.secret } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Webhook returned ${response.status}.`);
  return response;
}
