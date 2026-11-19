// Meilleur marqueur de chaque match terminé (lu dans le stockage KV rempli par leaders.js).
// GET /api/tops?m=2026-11  ->  { tops: [[date, domicile, extérieur, joueur, points, équipe], ...] }
const j = (o, status = 200, cc = "no-store") => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", "Cache-Control": cc } });
const hlSeason = () => { const d = new Date(); return d.getUTCMonth() >= 9 ? d.getUTCFullYear() + 1 : d.getUTCFullYear(); };

export async function onRequestGet({ env, request }) {
  const m = new URL(request.url).searchParams.get("m") || "";
  if (!/^\d{4}-\d{2}$/.test(m)) return j({ error: "mois invalide" }, 400);
  if (!env.STATS) return j({ tops: [] });
  const st = await env.STATS.get("season:" + hlSeason(), "json");
  if (!st || !st.tops) return j({ tops: [] }, 200, "public, max-age=60");
  const [y, mo] = m.split("-").map(Number);
  const from = new Date(Date.UTC(y, mo - 1, 1) - 864e5).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, mo, 1) + 2 * 864e5).toISOString().slice(0, 10);
  const tops = Object.values(st.tops).filter(x => x[0] >= from && x[0] <= to && x[3]);
  return j({ tops }, 200, "public, max-age=120");
}
