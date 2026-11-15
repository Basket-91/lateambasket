const BASE = "https://nba.highlightly.net/";
const OK = /^(matches|box-score|standings|lineups|highlights|teams|players)(\/\d+)?$/;

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const p = url.searchParams.get("p") || "";
  if (!OK.test(p)) {
    return new Response(JSON.stringify({ error: "endpoint non autorisé" }), { status: 400 });
  }

  const cache = caches.default;
  const cacheKey = new Request(url.toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const target = new URL(BASE + p);
  for (const [k, v] of url.searchParams) if (k !== "p") target.searchParams.append(k, v);

  const upstream = await fetch(target, { headers: { "x-rapidapi-key": env.HIGHLIGHTLY_KEY } });
  const res = new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": upstream.ok ? "public, max-age=300" : "no-store",
    },
  });
  if (upstream.ok) waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
