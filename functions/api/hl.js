// Relais Highlightly (feuilles de match, compositions, matchs par date).
// La clé HIGHLIGHTLY_KEY reste secrète côté serveur.
// Optionnel : un espace KV lié sous le nom STATS permet de conserver les feuilles
// de match terminées pour toujours (une seule requête API par match, tous visiteurs confondus).
const BASE = "https://nba.highlightly.net/";
const OK = /^(matches|box-score|standings|lineups|highlights|teams|players)(\/\d+)?$/;
const PARAMS = new Set(["league", "date", "timezone", "limit", "offset", "season", "leagueType", "year", "abbreviation", "leagueName"]);

function ttlFor(p, stored) {
  if (/^(box-score|lineups)\//.test(p)) return stored ? 86400 : 120;
  if (p === "matches") return 600;
  return 3600;
}

// Vérifie qu'une réponse de feuille de match / compositions est complète avant de la figer
function complete(p, body) {
  try {
    const j = JSON.parse(body);
    if (p.startsWith("box-score/")) return Array.isArray(j) && j.length === 2 && j.every(t => t.boxScores && t.boxScores.length > 0);
    if (p.startsWith("lineups/")) return !!(j.home && j.home.lineup && j.home.lineup.length && j.away && j.away.lineup && j.away.lineup.length);
  } catch (e) {}
  return false;
}

const json = (body, status, cc) => new Response(body, { status, headers: { "Content-Type": "application/json", "Cache-Control": cc } });

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const p = url.searchParams.get("p") || "";
  if (!OK.test(p)) return json(JSON.stringify({ error: "endpoint non autorisé" }), 400, "no-store");

  const final = url.searchParams.get("final") === "1";
  const frozen = final && /^(box-score|lineups)\/\d+$/.test(p);
  const kv = env.STATS;

  // 1. Stockage permanent (si KV configuré)
  if (frozen && kv) {
    const stored = await kv.get("hl:" + p);
    if (stored) return json(stored, 200, "public, max-age=86400");
  }

  // 2. Cache Cloudflare
  const cache = caches.default;
  const cacheKey = new Request(url.toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // 3. Appel Highlightly (seuls les paramètres connus sont transmis)
  const target = new URL(BASE + p);
  for (const [k, v] of url.searchParams) if (PARAMS.has(k)) target.searchParams.append(k, v);
  const upstream = await fetch(target, { headers: { "x-rapidapi-key": env.HIGHLIGHTLY_KEY } });
  const body = await upstream.text();

  if (!upstream.ok) return json(body, upstream.status, "no-store");

  const keep = frozen && complete(p, body);
  const res = json(body, 200, `public, max-age=${ttlFor(p, keep)}`);
  waitUntil(cache.put(cacheKey, res.clone()));
  if (keep && kv) waitUntil(kv.put("hl:" + p, body, { expirationTtl: 60 * 60 * 24 * 90 }));
  return res;
}
