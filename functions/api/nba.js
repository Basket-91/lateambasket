const ALLOWED = ["teams", "players", "games", "stats", "standings"];
const BASE = "https://api.balldontlie.io/v1/";

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  if (!ALLOWED.includes(path)) {
    return new Response(JSON.stringify({ error: "endpoint non autorisé" }), { status: 400 });
  }

  // Cache de 5 minutes partagé entre tous les visiteurs
  const cache = caches.default;
  const cacheKey = new Request(url.toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // On transmet tous les paramètres sauf "path"
  const target = new URL(BASE + path);
  for (const [k, v] of url.searchParams) if (k !== "path") target.searchParams.append(k, v);

  const upstream = await fetch(target, { headers: { Authorization: env.BALLDONTLIE_KEY } });
  const res = new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
  if (upstream.ok) waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
