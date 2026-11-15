const ALLOWED = ["teams", "players", "games", "stats", "standings"];
const BASE = "https://api.balldontlie.io/v1/";

// Durée de cache (en secondes) selon le type de données
function ttlFor(path, params) {
  if (path === "teams" || path === "players") return 86400;      // change rarement
  if (params.get("postseason") === "true") return 3600;           // playoffs
  if (path === "games" && params.has("seasons[]")) return 900;    // saison complète
  return 300;                                                     // scores du jour : 5 minutes
}

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  if (!ALLOWED.includes(path)) {
    return new Response(JSON.stringify({ error: "endpoint non autorisé" }), { status: 400 });
  }

  // Cache partagé entre tous les visiteurs
  const cache = caches.default;
  const cacheKey = new Request(url.toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // On transmet tous les paramètres sauf "path"
  const target = new URL(BASE + path);
  for (const [k, v] of url.searchParams) if (k !== "path") target.searchParams.append(k, v);

  const upstream = await fetch(target, { headers: { Authorization: env.BALLDONTLIE_KEY } });
  const ttl = ttlFor(path, url.searchParams);
  const res = new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": upstream.ok ? `public, max-age=${ttl}` : "no-store",
    },
  });
  if (upstream.ok) waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
