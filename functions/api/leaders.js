// Moyennes de la saison + meilleur marqueur de chaque match : calculés en additionnant les feuilles de match Highlightly.
// Nécessite un espace KV lié au projet sous le nom STATS (stockage permanent).
// Chaque appel répond tout de suite avec ce qui est stocké, puis met à jour en arrière-plan
// (rattrapage progressif, dans la limite d'un budget quotidien de requêtes).
const BASE = "https://nba.highlightly.net/";
const BATCH = 20;                  // feuilles traitées par mise à jour (reste sous la limite de 50 sous-requêtes du plan gratuit Cloudflare)
const DAILY_BUDGET = 70;           // requêtes Highlightly max par jour pour ce calcul (quota gratuit : 100/jour ; monte-le avec un plan payant)
const LIST_EVERY = 30 * 60 * 1000; // actualisation de la liste des matchs terminés (si plus rien en attente)
const MIN_RATIO = 0.5;             // un joueur apparaît s'il a joué au moins 50 % du nombre max de matchs

const STAT = { min: "Total Minutes Played", pts: "Total Points Scored", reb: "Total Rebounds", ast: "Total Assists", stl: "Total Steals", blk: "Total Blocks" };
const j = (o, status = 200, cc = "no-store") => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", "Cache-Control": cc } });
const hlSeason = () => { const d = new Date(); return d.getUTCMonth() >= 9 ? d.getUTCFullYear() + 1 : d.getUTCFullYear(); };

async function hl(env, p, params = {}) {
  const u = new URL(BASE + p);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { "x-rapidapi-key": env.HIGHLIGHTLY_KEY } });
  if (!r.ok) { const e = new Error("hl " + r.status); e.status = r.status; throw e; }
  return r.json();
}
// Réutilise une feuille déjà figée en KV par le site (aucune requête consommée), sinon l'API
async function boxRaw(env, kv, id) {
  try { const c = await kv.get("hl:box-score/" + id); if (c) return { raw: JSON.parse(c), fetched: false }; } catch (e) {}
  return { raw: await hl(env, "box-score/" + id), fetched: true };
}
const pstat = (p, name) => { const s = (p.statistics || []).find(x => x.name === name); return s ? Number(s.value) || 0 : 0; };

// m = [id, date, homeId, homeName, awayId, awayName, échecs, topsOnly]
function addBox(st, raw, m) {
  if (!Array.isArray(raw) || raw.length !== 2 || !raw.every(t => t.boxScores && t.boxScores.length)) return false;
  let played = 0, best = null;
  for (const t of raw) {
    const name = t.team && t.team.id === m[2] ? m[3] : t.team && t.team.id === m[4] ? m[5] : (t.team && t.team.name) || "";
    for (const p of t.boxScores) {
      if (!p.player || pstat(p, STAT.min) <= 0) continue;
      played++;
      const pts = pstat(p, STAT.pts);
      if (!best || pts > best.pts) best = { name: p.player.name || "", pts, team: name };
      if (m[7]) continue; // feuille déjà comptée dans les moyennes : on ne recalcule que le meilleur marqueur
      const rec = st.players[p.player.id] || (st.players[p.player.id] = { n: p.player.name, t: name, d: "", g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 });
      rec.g++;
      for (const k of ["pts", "reb", "ast", "stl", "blk"]) rec[k] += pstat(p, STAT[k]);
      if (m[1] >= rec.d) { rec.d = m[1]; rec.t = name; }
    }
  }
  if (best) st.tops[m[0]] = [m[1], m[3], m[5], best.name, best.pts, best.team];
  return played > 0;
}

export async function onRequestGet({ env, waitUntil }) {
  const kv = env.STATS;
  if (!kv) return j({ error: "kv_missing" }, 501);
  const season = hlSeason(), key = "season:" + season;
  const st = (await kv.get(key, "json")) || { season, done: {}, pending: [], players: {}, tops: {}, listedAt: 0, total: 0, budget: { day: "", used: 0 } };
  if (!st.tops) { st.tops = {}; st.listedAt = 0; } // ancienne version : on relistera pour retrouver les meilleurs marqueurs
  const today = new Date().toISOString().slice(0, 10);
  if (st.budget.day !== today) st.budget = { day: today, used: 0 };

  // 1. Réponse immédiate à partir de ce qui est déjà stocké (lecture KV uniquement : rapide pour tous les visiteurs)
  const ps = Object.values(st.players);
  const maxG = ps.reduce((a, p) => Math.max(a, p.g), 0);
  const minG = Math.max(1, Math.floor(maxG * MIN_RATIO));
  const leaders = {};
  for (const k of ["pts", "ast", "reb", "blk", "stl"]) {
    leaders[k] = ps.filter(p => p.g >= minG).map(p => ({ name: p.n, team: p.t, g: p.g, v: Math.round(p[k] / p.g * 10) / 10 })).sort((a, b) => b.v - a.v).slice(0, 5);
  }
  const res = j({ season, status: "ok", gamesCounted: Object.keys(st.done).length, gamesTotal: st.total, minGames: minG, budgetUsed: st.budget.used, budgetMax: DAILY_BUDGET, leaders }, 200, "public, max-age=60");

  // 2. Mise à jour en arrière-plan (le visiteur n'attend jamais les appels à Highlightly)
  const listStale = Date.now() - st.listedAt > (st.pending.length ? 12 * 36e5 : LIST_EVERY);
  const needsWork = env.HIGHLIGHTLY_KEY && st.budget.used < DAILY_BUDGET && (listStale || st.pending.length > 0);
  if (needsWork && !(await kv.get("lock:" + season))) {
    await kv.put("lock:" + season, "1", { expirationTtl: 60 });
    waitUntil(update(env, kv, key, season, st, listStale));
  }
  return res;
}

async function update(env, kv, key, season, st, listStale) {
  let changed = false;
  try {
    // liste des matchs terminés de la saison
    if (listStale) {
      const seen = new Set(st.pending.map(x => x[0]));
      let off = 0, finished = 0;
      for (let page = 0; page < 6 && st.budget.used < DAILY_BUDGET; page++) {
        const r = await hl(env, "matches", { league: "NBA", season, limit: 100, offset: off });
        st.budget.used++;
        const list = r.data || [];
        for (const m of list) {
          if (!(m.state && m.state.description === "Finished") || seen.has(m.id)) continue;
          finished++;
          const row = [m.id, String(m.date).slice(0, 10), m.homeTeam.id, m.homeTeam.displayName, m.awayTeam.id, m.awayTeam.displayName, 0, 0];
          if (!st.done[m.id]) { st.pending.push(row); seen.add(m.id); }
          else if (!st.tops[m.id]) { row[7] = 1; st.pending.push(row); seen.add(m.id); } // déjà compté, il manque juste le meilleur marqueur
        }
        if (list.length < 100) break;
        off += 100;
      }
      st.total = Object.keys(st.done).length + st.pending.filter(m => !m[7]).length;
      st.listedAt = Date.now(); changed = true;
    }
    // feuilles de match à traiter (les plus récentes d'abord : le calendrier du mois en cours se remplit en premier)
    st.pending.sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
    const batch = st.pending.slice(0, Math.max(0, Math.min(BATCH, DAILY_BUDGET - st.budget.used)));
    const doneNow = new Set();
    let stop = false;
    for (let i = 0; i < batch.length && !stop; i += 5) {
      const chunk = batch.slice(i, i + 5);
      const res = await Promise.allSettled(chunk.map(m => boxRaw(env, kv, m[0])));
      st.budget.used += res.filter(r => r.status === "rejected" || r.value.fetched).length;
      res.forEach((r, idx) => {
        const m = chunk[idx];
        if (r.status === "fulfilled" && addBox(st, r.value.raw, m)) { st.done[m[0]] = 1; doneNow.add(m[0]); return; }
        if (r.status === "rejected" && [401, 403, 429].includes(r.reason && r.reason.status)) { stop = true; return; }
        m[6] = (m[6] || 0) + 1;
        if (m[6] >= 3) { st.done[m[0]] = 1; st.tops[m[0]] = [m[1], m[3], m[5], "", 0, ""]; doneNow.add(m[0]); } // feuille toujours vide : on l'abandonne
      });
    }
    if (batch.length) { st.pending = st.pending.filter(m => !doneNow.has(m[0])); changed = true; }
  } catch (e) { /* on enregistre ce qui a été fait */ }
  finally {
    if (changed) await kv.put(key, JSON.stringify(st));
    await kv.delete("lock:" + season);
  }
}
