// Moyennes de la saison : calculées en additionnant les feuilles de match Highlightly.
// Nécessite un espace KV lié au projet sous le nom STATS (stockage permanent).
// Chaque appel traite quelques feuilles de match non encore comptées (rattrapage progressif),
// dans la limite d'un budget quotidien de requêtes pour ne pas épuiser le quota gratuit (100/jour).
const BASE = "https://nba.highlightly.net/";
const BATCH = 30;                 // feuilles de match traitées par appel
const DAILY_BUDGET = 60;          // requêtes Highlightly maximum par jour pour ce calcul (monte-le avec un plan payant)
const LIST_EVERY = 30 * 60 * 1000; // actualisation de la liste des matchs terminés toutes les 30 min
const MIN_RATIO = 0.5;            // un joueur apparaît s'il a joué au moins 50 % du nombre max de matchs

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
const pstat = (p, name) => { const s = (p.statistics || []).find(x => x.name === name); return s ? Number(s.value) || 0 : 0; };

// m = [id, date, homeId, homeName, awayId, awayName, échecs]
function addBox(st, raw, m) {
  if (!Array.isArray(raw) || raw.length !== 2 || !raw.every(t => t.boxScores && t.boxScores.length)) return false;
  let played = 0;
  for (const t of raw) {
    const name = t.team && t.team.id === m[2] ? m[3] : t.team && t.team.id === m[4] ? m[5] : (t.team && t.team.name) || "";
    for (const p of t.boxScores) {
      if (!p.player || pstat(p, STAT.min) <= 0) continue;
      played++;
      const rec = st.players[p.player.id] || (st.players[p.player.id] = { n: p.player.name, t: name, d: "", g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 });
      rec.g++;
      for (const k of ["pts", "reb", "ast", "stl", "blk"]) rec[k] += pstat(p, STAT[k]);
      if (m[1] >= rec.d) { rec.d = m[1]; rec.t = name; }
    }
  }
  return played > 0;
}

export async function onRequestGet({ env }) {
  const kv = env.STATS;
  if (!kv) return j({ error: "kv_missing" }, 501);
  const season = hlSeason(), key = "season:" + season;
  const st = (await kv.get(key, "json")) || { season, done: {}, pending: [], players: {}, listedAt: 0, total: 0, budget: { day: "", used: 0 } };
  const today = new Date().toISOString().slice(0, 10);
  if (st.budget.day !== today) st.budget = { day: today, used: 0 };

  const needsWork = env.HIGHLIGHTLY_KEY && st.budget.used < DAILY_BUDGET && (Date.now() - st.listedAt > LIST_EVERY || st.pending.length > 0);
  let changed = false, status = "ok";
  if (needsWork && !(await kv.get("lock:" + season))) {
    await kv.put("lock:" + season, "1", { expirationTtl: 60 });
    try {
      // 1. liste des matchs terminés de la saison
      if (Date.now() - st.listedAt > LIST_EVERY) {
        const seen = new Set(st.pending.map(x => x[0]));
        let off = 0, finished = 0;
        for (let page = 0; page < 6 && st.budget.used < DAILY_BUDGET; page++) {
          const r = await hl(env, "matches", { league: "NBA", season, limit: 100, offset: off });
          st.budget.used++;
          const list = r.data || [];
          for (const m of list) {
            if (m.state && m.state.description === "Finished") {
              finished++;
              if (!st.done[m.id] && !seen.has(m.id)) { st.pending.push([m.id, String(m.date).slice(0, 10), m.homeTeam.id, m.homeTeam.displayName, m.awayTeam.id, m.awayTeam.displayName, 0]); seen.add(m.id); }
            }
          }
          if (list.length < 100) break;
          off += 100;
        }
        st.total = finished; st.listedAt = Date.now(); changed = true;
      }
      // 2. feuilles de match à comptabiliser (les plus anciennes d'abord)
      st.pending.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
      const batch = st.pending.slice(0, Math.max(0, Math.min(BATCH, DAILY_BUDGET - st.budget.used)));
      const doneNow = new Set();
      let stop = false;
      for (let i = 0; i < batch.length && !stop; i += 5) {
        const chunk = batch.slice(i, i + 5);
        const res = await Promise.allSettled(chunk.map(m => hl(env, "box-score/" + m[0])));
        st.budget.used += chunk.length;
        res.forEach((r, idx) => {
          const m = chunk[idx];
          if (r.status === "fulfilled" && addBox(st, r.value, m)) { st.done[m[0]] = 1; doneNow.add(m[0]); return; }
          if (r.status === "rejected" && [401, 403, 429].includes(r.reason && r.reason.status)) { stop = true; status = "api_" + r.reason.status; return; }
          m[6] = (m[6] || 0) + 1;
          if (m[6] >= 3) { st.done[m[0]] = 1; doneNow.add(m[0]); } // feuille toujours vide : on l'abandonne
        });
      }
      if (batch.length) { st.pending = st.pending.filter(m => !doneNow.has(m[0])); changed = true; }
      if (changed) await kv.put(key, JSON.stringify(st));
    } catch (e) { status = "error"; if (changed) await kv.put(key, JSON.stringify(st)); }
    finally { await kv.delete("lock:" + season); }
  }

  const ps = Object.values(st.players);
  const maxG = ps.reduce((a, p) => Math.max(a, p.g), 0);
  const minG = Math.max(1, Math.floor(maxG * MIN_RATIO));
  const leaders = {};
  for (const k of ["pts", "ast", "reb", "blk", "stl"]) {
    leaders[k] = ps.filter(p => p.g >= minG).map(p => ({ name: p.n, team: p.t, g: p.g, v: Math.round(p[k] / p.g * 10) / 10 })).sort((a, b) => b.v - a.v).slice(0, 5);
  }
  return j({ season, status, gamesCounted: Object.keys(st.done).length, gamesTotal: st.total, minGames: minG, leaders }, 200, "public, max-age=300");
}
