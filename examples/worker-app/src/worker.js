// Seeded Cloudflare Worker (P2-T09): throws on unknown routes' missing binding.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/kv") {
      // Seeded bug: env.KV is undefined locally without --binding; .get throws.
      const v = await env.KV.get("key");
      return new Response(`kv:${v}`);
    }
    return new Response("ok");
  },
};
