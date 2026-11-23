export default {
  async fetch(request, env) {
    if (!env.INCORA_PEOPLE) {
      return new Response("Gateway service binding is unavailable.", {
        status: 502,
        headers: {
          "cache-control": "private, no-store",
          "content-type": "text/plain; charset=utf-8",
        },
      });
    }

    const upstream = await env.INCORA_PEOPLE.fetch(request);

    // A WebSocket upgrade is not cacheable and must remain an untouched 101.
    if (upstream.status === 101 || upstream.webSocket) return upstream;

    const headers = new Headers(upstream.headers);
    const setCookies = upstream.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
      headers.delete("set-cookie");
      for (const cookie of setCookies) headers.append("set-cookie", cookie);
    }
    headers.set("cache-control", "private, no-store, max-age=0");
    headers.set("cdn-cache-control", "no-store");
    headers.set("cloudflare-cdn-cache-control", "no-store");

    // Keep the origin response body streaming; do not buffer it in the gateway.
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  },
};
