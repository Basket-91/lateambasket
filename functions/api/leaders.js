// Moyennes de la saison + meilleur marqueur de chaque match : calculés en additionnant les feuilles de match Highlightly.
// Nécessite un espace KV lié au projet sous le nom STATS (stockage permanent).
// Chaque appel répond tout de suite avec ce qui est stocké, puis met à jour en arrière-plan
// (rattrapage progressif, dans la limite d'un budget quotidien de requêtes).
const BASE = "https://nba.highlightly.net/";
const BATCH = 20;                  // feuilles traitées par mise à jour (reste sous la limite de 50 sous-requêtes du plan gratuit Cloudflare)
const DAILY_BUDGET = 70;           // requêtes Highlightly max par jour pour ce calcul (quota gratuit : 100/jour ; monte-le avec un plan payant)
const LIST_EVERY = 24 * 36e5;      // relistage complet de la saison (auto-réparation) une fois par jour
const RECENT_EVERY = 10 * 60 * 1000; // détection des matchs qui viennent de se terminer (via BallDontLie, gratuit)
const MIN_RATIO = 0.7;             // comme sur nba.com : un joueur est classé s'il a joué au moins 70 % des matchs

const STAT = { min: "Total Minutes Played", pts: "Total Points Scored", reb: "Total Rebounds", ast: "Total Assists", stl: "Total Steals", blk: "Total Blocks" };
const j = (o, status = 200, cc = "no-store") => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", "Cache-Control": cc } });
const FRENCH = ["victor wembanyama","zaccharie risacher","alex sarr","rudy gobert","bilal coulibaly","guerschon yabusele","nicolas batum","ousmane dieng","tidjane salaun","pacome dadiet","noa essengue","joan beringer","hugo besson","mohamed diawara","rayan rupert","killian hayes","theo maledon","sidy cissoko","moussa diabate","vincent poirier","frank ntilikina","evan fournier"];
const normName = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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

// Remet en attente les matchs abandonnés (feuille vide ou incohérente) pour une nouvelle tentative
function revive(st) {
  for (const [id, t] of Object.entries(st.tops || {})) if (t && !t[3]) { delete st.done[id]; delete st.tops[id]; }
  st.listedAt = 0;
}
// m = [id, date, homeId, homeName, awayId, awayName, échecs, topsOnly]
function addBox(st, raw, m) {
  const sign = m[10] === -1 ? -1 : 1; // -1 : on retire un match (présaison comptée par erreur)
  if (!Array.isArray(raw) || raw.length !== 2 || !raw.every(t => t.boxScores && t.boxScores.length)) return false;
  if (m[8] != null && m[9] != null) { // contrôle : la somme des points des joueurs doit égaler le score final de chaque équipe
    const tot = t => (t.boxScores || []).reduce((a, p) => a + pstat(p, STAT.pts), 0);
    const h = raw.find(t => t.team && t.team.id === m[2]), v = raw.find(t => t.team && t.team.id === m[4]);
    if (h && v && (tot(h) !== m[8] || tot(v) !== m[9])) return false;
  }
  let played = 0, best = null;
  for (const t of raw) {
    const name = t.team && t.team.id === m[2] ? m[3] : t.team && t.team.id === m[4] ? m[5] : (t.team && t.team.name) || "";
    for (const p of t.boxScores) {
      if (!p.player || pstat(p, STAT.min) <= 0) continue;
      played++;
      const pts = pstat(p, STAT.pts);
      if (sign < 0) {
        const pk0 = normName(p.player.name || p.player.id), r0 = st.players[pk0];
        if (r0) { r0.g--; for (const k of ["pts", "reb", "ast", "stl", "blk"]) r0[k] -= pstat(p, STAT[k]); if (r0.g <= 0) delete st.players[pk0]; }
        continue;
      }
      if (!best || pts > best.pts) best = { name: p.player.name || "", pts, team: name };
      if (m[7]) continue; // feuille déjà comptée dans les moyennes : on ne recalcule que le meilleur marqueur
      const pk = normName(p.player.name || p.player.id);
      const rec = st.players[pk] || (st.players[pk] = { n: p.player.name, t: name, d: "", g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 });
      rec.g++;
      for (const k of ["pts", "reb", "ast", "stl", "blk"]) rec[k] += pstat(p, STAT[k]);
      if (m[1] >= rec.d) { rec.d = m[1]; rec.t = name; }
    }
  }
  if (best && sign > 0) st.tops[m[0]] = [m[1], m[3], m[5], best.name, best.pts, best.team];
  return played > 0;
}

export async function onRequestGet({ request, env, waitUntil }) {
  const kv = env.STATS;
  if (!kv) return j({ error: "kv_missing" }, 501);
  const season = hlSeason(), key = "season:" + season;
  const st = (await kv.get(key, "json")) || { season, done: {}, pending: [], players: {}, tops: {}, listedAt: 0, total: 0, budget: { day: "", used: 0 } };
  if (!st.tops) { st.tops = {}; st.listedAt = 0; } // ancienne version : on relistera pour retrouver les meilleurs marqueurs
  if (!st.v || st.v < 2) { // migration : un même joueur pouvait avoir plusieurs identifiants -> on regroupe par nom (somme exacte)
    const by = {};
    for (const p of Object.values(st.players)) {
      const k = normName(p.n), r = by[k];
      if (!r) { by[k] = { ...p }; continue; }
      r.g += p.g; for (const f of ["pts", "reb", "ast", "stl", "blk"]) r[f] += p[f];
      if (p.d >= r.d) { r.d = p.d; r.t = p.t; }
    }
    st.players = by; st.v = 2;
  }
  if (st.v < 3) { revive(st); st.v = 3; waitUntil(kv.put(key, JSON.stringify(st))); }
  if (st.v < 4) { st.cleaned = 0; st.v = 4; waitUntil(kv.put(key, JSON.stringify(st))); }
  const today = new Date().toISOString().slice(0, 10);
  if (st.budget.day !== today) st.budget = { day: today, used: 0 };

  const dbg = new URL(request.url).searchParams.get("debug");
  if (dbg && env.HIGHLIGHTLY_KEY) { // diagnostic : matchs comptés pour un joueur (ex. /api/leaders?debug=doncic), à comparer avec nba.com
    const q = normName(dbg), lines = []; let calls = 0;
    const rec0 = Object.entries(st.players).find(([k]) => k.includes(q)), team0 = rec0 ? rec0[1].t : "";
    const ids = Object.entries(st.tops).filter(([id, t]) => st.done[id] && (!team0 || t[1] === team0 || t[2] === team0)).sort((a, b) => (a[1][0] < b[1][0] ? -1 : 1)); // seulement les matchs de son équipe
    for (const [id, t] of ids) {
      let raw; try { const c = await kv.get("hl:box-score/" + id); if (c) raw = JSON.parse(c); else if (calls < 30) { calls++; raw = await hl(env, "box-score/" + id); } } catch (e) { continue; }
      if (!Array.isArray(raw)) continue;
      for (const tm of raw) for (const p of tm.boxScores || []) if (p.player && normName(p.player.name).includes(q)) lines.push({ match: id, hlDate: t[0], date: t[0], home: t[1], away: t[2], min: pstat(p, STAT.min), pts: pstat(p, STAT.pts), teamTotal: (tm.boxScores || []).reduce((a, x) => a + pstat(x, STAT.pts), 0) });
    }
    const played = lines.filter(l => l.min > 0);
    return j({ query: dbg, requests: calls, gamesListed: lines.length, gamesPlayed: played.length, totalPts: played.reduce((a, l) => a + l.pts, 0), avg: played.length ? Math.round(played.reduce((a, l) => a + l.pts, 0) / played.length * 10) / 10 : null, stored: st.players[q] || Object.entries(st.players).filter(([k]) => k.includes(q)).map(([, v]) => v), lines });
  }

  // 1. Réponse immédiate à partir de ce qui est déjà stocké (lecture KV uniquement : rapide pour tous les visiteurs)
  const ps = Object.values(st.players);
  const maxG = ps.reduce((a, p) => Math.max(a, p.g), 0);
  const minG = Math.max(1, Math.ceil(maxG * MIN_RATIO));
  const leaders = {};
  for (const k of ["pts", "ast", "reb", "blk", "stl"]) {
    leaders[k] = ps.filter(p => p.g >= minG).map(p => ({ name: p.n, team: p.t, g: p.g, v: Math.round(p[k] / p.g * 10) / 10 })).sort((a, b) => b.v - a.v).slice(0, 5);
  }
  const french = ps.filter(p => FRENCH.includes(normName(p.n))).map(p => ({ name: p.n, team: p.t, g: p.g }));
  const cleanup = st.pending.filter(x => x[10] === -1).length;
  const abandoned = Object.values(st.tops || {}).filter(t => t && !t[3]).length;
  const through = ps.reduce((a, p) => (p.d > a ? p.d : a), "");
  const res = j({ season, status: "ok", gamesCounted: Object.keys(st.done).length, gamesTotal: st.total, minGames: minG, budgetUsed: st.budget.used, budgetMax: DAILY_BUDGET, leaders, french, through, abandoned, cleanup }, 200, "public, max-age=60");

  // 2. Mise à jour en arrière-plan (le visiteur n'attend jamais les appels à Highlightly)
  const listStale = Date.now() - st.listedAt > LIST_EVERY, recentDue = Date.now() - (st.recentAt || 0) > RECENT_EVERY;
  const needsWork = env.HIGHLIGHTLY_KEY && st.budget.used < DAILY_BUDGET && (listStale || recentDue || st.pending.length > 0 || !st.cleaned);
  if (needsWork && !(await kv.get("lock:" + season))) {
    await kv.put("lock:" + season, "1", { expirationTtl: 60 });
    waitUntil(update(env, kv, key, season, st, listStale, recentDue));
  }
  return res;
}

const sumArr = a => Array.isArray(a) && a.length ? a.reduce((x, y) => x + (Number(y) || 0), 0) : null;
const expected = m => { const sc = (m.state && m.state.score) || {}, h = sumArr(sc.homeTeam), a = sumArr(sc.awayTeam); return h != null && a != null && h > 0 && a > 0 ? [h, a] : []; };
const pushPending = (st, seen, m) => {
  if (seen.has(m.id) || (st.start && String(m.date).slice(0, 10) < st.start)) return; // présaison ignorée
  const row = [m.id, String(m.date).slice(0, 10), m.homeTeam.id, m.homeTeam.displayName, m.awayTeam.id, m.awayTeam.displayName, 0, 0, ...expected(m)];
  if (row.length < 10) row.push(null, null);
  if (!st.done[m.id]) { st.pending.push(row); seen.add(m.id); }
  else if (!st.tops[m.id]) { row[7] = 1; st.pending.push(row); seen.add(m.id); }
};
// Détecte les matchs qui viennent de se terminer : BallDontLie (gratuit) les repère, Highlightly n'est interrogé que si besoin
async function recent(env, st) {
  const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const u = new URL("https://api.balldontlie.io/v1/games");
  u.searchParams.set("start_date", day(-2)); u.searchParams.set("end_date", day(0)); u.searchParams.set("per_page", "100");
  const r = await fetch(u, { headers: { Authorization: env.BALLDONTLIE_KEY } });
  if (!r.ok) return;
  const fin = ((await r.json()).data || []).filter(g => /final/i.test(String(g.status)));
  st.bdlSeen = st.bdlSeen || {};
  const fresh = fin.filter(g => !st.bdlSeen[g.id]);
  const seen = new Set(st.pending.map(x => x[0]));
  for (const d of [...new Set(fresh.map(g => String(g.date).slice(0, 10)))].slice(0, 3)) {
    if (st.budget.used >= DAILY_BUDGET) break;
    const list = (await hl(env, "matches", { league: "NBA", date: d, timezone: "America/New_York", limit: 100 })).data || [];
    st.budget.used++;
    const nm = x => normName(x || "");
    for (const m of list) {
      if (!(m.state && m.state.description === "Finished")) continue;
      pushPending(st, seen, m);
      for (const g of fresh) if (nm(g.home_team.full_name) === nm(m.homeTeam.displayName) && nm(g.visitor_team.full_name) === nm(m.awayTeam.displayName) && Math.abs(Date.parse(String(g.date).slice(0, 10)) - Date.parse(d)) < 2 * 864e5) st.bdlSeen[g.id] = 1;
    }
  }
}

async function update(env, kv, key, season, st, listStale, recentDue) {
  let changed = false;
  try {
    if (!st.start && env.BALLDONTLIE_KEY) { // date du premier match de saison régulière (via BallDontLie) : tout ce qui est avant est de la présaison
      try {
        const y = season - 1, u = new URL("https://api.balldontlie.io/v1/games");
        u.searchParams.set("seasons[]", y); u.searchParams.set("start_date", y + "-10-01"); u.searchParams.set("end_date", y + "-11-10"); u.searchParams.set("per_page", "100");
        const r = await fetch(u, { headers: { Authorization: env.BALLDONTLIE_KEY } });
        const ds = r.ok ? ((await r.json()).data || []).map(g => String(g.date).slice(0, 10)).sort() : [];
        if (ds.length) { st.start = ds[0]; changed = true; }
      } catch (e) { /* on retentera */ }
    }
    if (st.start && !st.cleaned) { // retire des moyennes les matchs de présaison déjà comptés
      const queued = new Set(st.pending.map(x => x[0]));
      st.pending = st.pending.filter(x => !(x[1] < st.start && x[10] !== -1));
      for (const [id, t] of Object.entries(st.tops || {})) if (st.done[id] && t[0] < st.start && !queued.has(+id) && !queued.has(id)) st.pending.push([+id, t[0], 0, t[1], 0, t[2], 0, 0, null, null, -1]);
      st.cleaned = 1; changed = true;
    }
    if (recentDue && env.BALLDONTLIE_KEY) { st.recentAt = Date.now(); changed = true; try { await recent(env, st); } catch (e) { /* on retentera */ } }
    // liste des matchs terminés de la saison
    if (listStale) {
      revive(st);
      const seen = new Set(st.pending.map(x => x[0]));
      let off = 0, finished = 0;
      for (let page = 0; page < 6 && st.budget.used < DAILY_BUDGET; page++) {
        const r = await hl(env, "matches", { league: "NBA", season, limit: 100, offset: off });
        st.budget.used++;
        const list = r.data || [];
        for (const m of list) {
          if (!(m.state && m.state.description === "Finished") || seen.has(m.id)) continue;
          finished++;
          pushPending(st, seen, m);
        }
        if (list.length < 100) break;
        off += 100;
      }
      st.total = Object.keys(st.done).length + st.pending.filter(m => !m[7] && m[10] !== -1).length;
      st.listedAt = Date.now(); changed = true;
    }
    // feuilles de match à traiter (les plus récentes d'abord : le calendrier du mois en cours se remplit en premier)
    st.pending.sort((a, b) => ((b[10] === -1) - (a[10] === -1)) || (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
    const batch = st.pending.slice(0, Math.max(0, Math.min(BATCH, DAILY_BUDGET - st.budget.used)));
    const doneNow = new Set();
    let stop = false;
    for (let i = 0; i < batch.length && !stop; i += 5) {
      const chunk = batch.slice(i, i + 5);
      const res = await Promise.allSettled(chunk.map(m => boxRaw(env, kv, m[0])));
      st.budget.used += res.filter(r => r.status === "rejected" || r.value.fetched).length;
      res.forEach((r, idx) => {
        const m = chunk[idx];
        if (r.status === "fulfilled" && addBox(st, r.value.raw, m)) { if (m[10] === -1) { delete st.done[m[0]]; delete st.tops[m[0]]; } else st.done[m[0]] = 1; doneNow.add(m[0]); return; }
        if (r.status === "rejected" && [401, 403, 429].includes(r.reason && r.reason.status)) { stop = true; return; }
        m[6] = (m[6] || 0) + 1;
        if (m[6] >= 6 && m[10] === -1) doneNow.add(m[0]);
        else if (m[6] >= 6) { st.done[m[0]] = 1; st.tops[m[0]] = [m[1], m[3], m[5], "", 0, ""]; doneNow.add(m[0]); } // feuille toujours vide : on l'abandonne
      });
    }
    if (batch.length) { st.pending = st.pending.filter(m => !doneNow.has(m[0])); changed = true; }
  } catch (e) { /* on enregistre ce qui a été fait */ }
  finally {
    if (changed) await kv.put(key, JSON.stringify(st));
    await kv.delete("lock:" + season);
  }
}
