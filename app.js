/* La Team Basket — app.js (V3 : refonte, diffuseurs FR, tableau des playoffs) */
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const TZ = "Europe/Paris";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const sleep = ms => new Promise(r => setTimeout(r, ms));

const FRENCH = ["Victor Wembanyama", "Zaccharie Risacher", "Alex Sarr", "Rudy Gobert", "Bilal Coulibaly", "Guerschon Yabusele", "Nicolas Batum", "Ousmane Dieng", "Tidjane Salaun", "Pacome Dadiet", "Noa Essengue", "Joan Beringer"].map(norm);
const CONF = { East: "Est", West: "Ouest" };
const news = [["ANALYSE", "Les nouvelles tendances tactiques à suivre cette saison", "Décryptage des ajustements qui changent le visage du jeu."], ["FOCUS JOUEUR", "Les jeunes talents qui prennent une nouvelle dimension", "Tour d'horizon des progressions à surveiller."], ["DANS LA LIGUE", "La course aux premières places est lancée", "Les premières tendances de la saison se dessinent."]];

// Couleurs des équipes (points colorés), légèrement éclaircies pour le fond sombre.
const TEAM_COLOR = { ATL:"#E03A3E", BOS:"#1B9A4F", BKN:"#9EA2A8", CHA:"#1D8FA6", CHI:"#CE1141", CLE:"#B0275B", DAL:"#0A6CC9", DEN:"#FEC524", DET:"#C8102E", GSW:"#FFC72C", HOU:"#CE1141", IND:"#FDBB30", LAC:"#4A7BD0", LAL:"#7B4FB8", MEM:"#5D76A9", MIA:"#C1233F", MIL:"#1F8F4E", MIN:"#3D8BCB", NOP:"#B59A5B", NYK:"#2E7DD1", OKC:"#007AC1", ORL:"#0077C0", PHI:"#1F7FD0", PHX:"#E56020", POR:"#E03A3E", SAC:"#8A5AC8", SAS:"#C4CED4", TOR:"#CE1141", UTA:"#F9A01B", WAS:"#E31837" };
const dot = a => `<i class="dot" style="--c:${TEAM_COLOR[a] || "#7a8699"}"></i>`;
const FLAG = '<span class="flag-fr" role="img" aria-label="France"></span>';
const shortName = n => { const p = String(n || "").trim().split(/\s+/); return p.length > 1 ? p[0][0] + ". " + p.slice(1).join(" ") : (p[0] || ""); };

// MVP des finales (1980 → 2026)
const FMVP = { 1980:"Magic Johnson", 1981:"Cedric Maxwell", 1982:"Magic Johnson", 1983:"Moses Malone", 1984:"Larry Bird", 1985:"Kareem Abdul-Jabbar", 1986:"Larry Bird", 1987:"Magic Johnson", 1988:"James Worthy", 1989:"Joe Dumars", 1990:"Isiah Thomas", 1991:"Michael Jordan", 1992:"Michael Jordan", 1993:"Michael Jordan", 1994:"Hakeem Olajuwon", 1995:"Hakeem Olajuwon", 1996:"Michael Jordan", 1997:"Michael Jordan", 1998:"Michael Jordan", 1999:"Tim Duncan", 2000:"Shaquille O'Neal", 2001:"Shaquille O'Neal", 2002:"Shaquille O'Neal", 2003:"Tim Duncan", 2004:"Chauncey Billups", 2005:"Tim Duncan", 2006:"Dwyane Wade", 2007:"Tony Parker", 2008:"Paul Pierce", 2009:"Kobe Bryant", 2010:"Kobe Bryant", 2011:"Dirk Nowitzki", 2012:"LeBron James", 2013:"LeBron James", 2014:"Kawhi Leonard", 2015:"Andre Iguodala", 2016:"LeBron James", 2017:"Kevin Durant", 2018:"Kevin Durant", 2019:"Kawhi Leonard", 2020:"LeBron James", 2021:"Giannis Antetokounmpo", 2022:"Stephen Curry", 2023:"Nikola Jokić", 2024:"Jaylen Brown", 2025:"Shai Gilgeous-Alexander", 2026:"Jalen Brunson" };

// Diffusions en France : fichier diffusions.json (à mettre à jour à la main ; beIN SPORTS annonce ~1 semaine à l'avance).
// Chaque entrée : [coup d'envoi UTC, équipe, équipe, chaîne]
const CH = { bein1: ["beIN SPORTS 1", "beIN 1", "bein"], bein2: ["beIN SPORTS 2", "beIN 2", "bein"], prime: ["Prime Video", "Prime Video", "prime"] };
const TV = { list: [], loaded: false, updated: "" };
async function loadDiffusions() {
  try {
    const r = await fetch("diffusions.json", { cache: "no-cache" });
    if (r.ok) { const d = await r.json(); TV.list = (d.games || []).map(([iso, a, b, c]) => ({ ts: Date.parse(iso), a, b, pair: [a, b].sort().join("|"), ch: c })).filter(x => x.ts && CH[x.ch]); TV.updated = d.updated || ""; }
  } catch (e) { /* sans fichier : « à confirmer » partout */ }
  TV.loaded = true;
}
// Programmations ponctuelles antérieures (sans heure) — conservées pour l'historique
const BROADCASTS = [
  { date: "2026-10-23", teams: ["NYK","BOS"], channel: "Prime Video" }, { date: "2026-10-24", teams: ["HOU","SAS"], channel: "Prime Video" },
  { date: "2026-10-31", teams: ["NYK","PHI"], channel: "Prime Video" }, { date: "2026-10-31", teams: ["LAL","GSW"], channel: "Prime Video" },
  { date: "2026-11-08", teams: ["CHI","PHI"], channel: "Prime Video" }, { date: "2026-11-09", teams: ["DET","LAL"], channel: "beIN SPORTS 2" },
  { date: "2026-11-09", teams: ["MIL","BOS"], channel: "beIN SPORTS 1" }, { date: "2026-11-15", teams: ["PHI","IND"], channel: "Prime Video" },
  { date: "2026-11-15", teams: ["PHX","LAL"], channel: "beIN SPORTS 1" }
];
const broadcastFor = g => {
  const pair = [g.away, g.home].sort().join("|"), win = g.hasTime ? 4 * 36e5 : 30 * 36e5;
  const t = TV.list.find(x => x.pair === pair && Math.abs(x.ts - g.ts) < win);
  if (t) { const c = CH[t.ch]; return { channel: c[0], short: c[1], cls: c[2] }; }
  const old = BROADCASTS.find(x => x.date === ymd(g.when) && x.teams.slice().sort().join("|") === pair);
  return old ? { channel: old.channel, short: old.channel.replace("beIN SPORTS", "beIN"), cls: /prime/i.test(old.channel) ? "prime" : "bein" } : null;
};
const tvChip = (b, full = true) => `<span class="tv ${b.cls}">${esc(full ? b.channel : b.short)}</span>`;
const broadcastMarkup = g => { const b = broadcastFor(g); return b ? `<span class="broadcast-chip ${b.cls}">${esc(b.channel)}</span>` : `<span class="broadcast-pending">${g.final ? "—" : "À confirmer"}</span>`; };
function showBroadcasts() {
  const el = $("#broadcast-tonight"); if (!el) return;
  const list = TV.list.filter(x => x.ts > Date.now() - 3 * 36e5).sort((a, b) => a.ts - b.ts).slice(0, 6);
  el.innerHTML = list.map(x => { const c = CH[x.ch], d = new Date(x.ts); return `<div class="broadcast-row"><div><b>${dot(x.a)} ${esc(x.a)} – ${dot(x.b)} ${esc(x.b)}</b><small>${x.ts < Date.now() ? '<span class="live-label">● EN DIRECT</span>' : fmtDay(d) + " · " + fmtTime(d)}</small></div><span class="broadcast-chip ${c[2]}">${esc(c[0])}</span></div>`; }).join("") || '<div class="empty-state">Aucune diffusion annoncée pour le moment.</div>';
}

const state = { tickerMode: "results", countdown: 300, windowGames: [], teams: null, season: null, noStats: false, nightStats: null, boxCache: new Map(), hlDays: new Map(), modalToken: 0, calLimit: 60, activeTeam: null, playoffToken: 0, gameIndex: new Map(), calMonths: new Map(), calGames: null, calToken: 0, sl: null, statsMode: "night", statsModeSet: false, tops: new Map(), topsLoaded: new Map() };

/* ---------- Couche API ---------- */
class ApiError extends Error { constructor(status) { super("API " + status); this.status = status; } }
const memCache = new Map();

async function nba(path, params = {}, retries = 3) {
  const qs = new URLSearchParams({ path });
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach(x => qs.append(k, x)); else qs.append(k, v);
  }
  const key = qs.toString();
  const hit = memCache.get(key);
  if (hit && Date.now() - hit.t < 5 * 60 * 1000) return hit.d;
  for (let i = 0; i <= retries; i++) {
    const r = await fetch("/api/nba?" + key);
    if (r.status === 429 && i < retries) { await sleep(13000); continue; } // limite : 5 requêtes / minute
    if (!r.ok) throw new ApiError(r.status);
    const d = await r.json();
    memCache.set(key, { t: Date.now(), d });
    return d;
  }
}

async function fetchAll(path, params = {}, maxPages = 10, onPage) {
  let out = [], cursor = null, page = 0;
  do {
    const d = await nba(path, { ...params, per_page: 100, ...(cursor ? { cursor } : {}) });
    out = out.concat(d.data || []);
    cursor = d.meta && d.meta.next_cursor ? d.meta.next_cursor : null;
    page++;
    if (onPage) onPage(page, out.length);
  } while (cursor && page < maxPages);
  return out;
}

/* ---------- Dates ---------- */
const ymd = d => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const addDays = n => new Date(Date.now() + n * 864e5);
const fmtDay = d => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric", month: "short" }).format(d);
const fmtTime = d => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
const fmtLong = ds => new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(new Date(ds + "T12:00:00Z"));
const whenFr = g => g.hasTime ? `${fmtDay(g.when)} · ${fmtTime(g.when)}` : fmtDay(g.when);
function currentSeason() { const d = new Date(); return d.getMonth() >= 9 ? d.getFullYear() : d.getFullYear() - 1; }

/* ---------- Normalisation des matchs ---------- */
function normGame(r) {
  const status = String(r.status || "");
  const final = /final/i.test(status);
  const scheduled = /^\d{4}-\d{2}-\d{2}T/.test(status);
  const live = !final && !scheduled;
  const iso = r.datetime || (scheduled ? status : null);
  const when = iso ? new Date(iso) : new Date(String(r.date).slice(0, 10) + "T12:00:00Z");
  return {
    id: r.id, date: String(r.date).slice(0, 10), raw: r, final, live, hasTime: !!iso, when, ts: when.getTime(),
    away: r.visitor_team.abbreviation, home: r.home_team.abbreviation, awayId: r.visitor_team.id, homeId: r.home_team.id,
    a: r.visitor_team_score, h: r.home_team_score,
    liveLabel: live ? `${r.period ? r.period + "e QT" : "En cours"}${r.time ? " · " + r.time : ""}` : ""
  };
}
const findGame = id => state.windowGames.find(g => g.id === id) || state.gameIndex.get(id) || (state.season && state.season.games.find(g => g.id === id));
function lastNight() {
  const f = state.windowGames.filter(g => g.final);
  if (!f.length) return [];
  const d = f.map(g => g.date).sort().pop();
  return f.filter(g => g.date === d);
}

/* ---------- Chargement des données ---------- */
async function loadWindow() {
  const d = await nba("games", { start_date: ymd(addDays(-3)), end_date: ymd(addDays(4)), per_page: 100 });
  state.windowGames = (d.data || []).map(normGame).sort((a, b) => a.ts - b.ts);
}
/* ---------- Couche Highlightly (feuilles de match, via /api/hl) ---------- */
const OLD_MS = 4 * 36e5; // au-delà de 4 h après le coup d'envoi, un match est considéré comme définitivement terminé
async function hl(p, params = {}, final = false) {
  const qs = new URLSearchParams({ p });
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) qs.append(k, v);
  if (final) qs.set("final", "1");
  const key = "hl:" + qs.toString();
  const hit = memCache.get(key);
  if (hit && Date.now() - hit.t < 5 * 60 * 1000) return hit.d;
  const r = await fetch("/api/hl?" + qs.toString());
  if (!r.ok) throw new ApiError(r.status);
  const d = await r.json();
  memCache.set(key, { t: Date.now(), d });
  return d;
}
const sameTeam = (h, b) => norm(h.displayName || "") === norm(b.full_name || "") || (!!h.abbreviation && h.abbreviation === b.abbreviation);
async function hlMatches(d) {
  const c = state.hlDays.get(d);
  if (c && Date.now() - c.t < 10 * 60 * 1000) return c.list;
  const r = await hl("matches", { league: "NBA", date: d, timezone: TZ, limit: 100 });
  const list = r.data || [];
  state.hlDays.set(d, { t: Date.now(), list });
  return list;
}
async function hlMatch(g) {
  for (const d of [...new Set([ymd(g.when), ymd(new Date(g.ts + 864e5))])]) {
    const m = (await hlMatches(d)).find(x => sameTeam(x.homeTeam, g.raw.home_team) && sameTeam(x.awayTeam, g.raw.visitor_team));
    if (m) return m;
  }
  return null;
}
const STAT = { min: "Total Minutes Played", pts: "Total Points Scored", fgm: "Successful Field Goals", fga: "Total Field Goals", tpm: "Successful 3PT Field Goals", tpa: "Total 3PT Field Goals", ftm: "Successful Free Throws", fta: "Total Free Throws", reb: "Total Rebounds", ast: "Total Assists", tov: "Total Turnovers", stl: "Total Steals", blk: "Total Blocks", oreb: "Total Offensive Rebounds", dreb: "Total Defensive Rebounds", pf: "Total Fouls", pm: "Plus Minus" };
function parsePlayer(p) {
  const o = { id: p.player && p.player.id, name: (p.player && p.player.name) || "", jersey: p.player && p.player.jersey };
  const list = p.statistics || [];
  for (const [k, n] of Object.entries(STAT)) { const s = list.find(x => x.name === n); o[k] = s ? Number(s.value) || 0 : 0; }
  return o;
}
function parseBox(raw, m) {
  const teams = (Array.isArray(raw) ? raw : []).map(t => ({ id: t.team && t.team.id, players: (t.boxScores || []).map(parsePlayer) }));
  const home = teams.find(t => t.id === m.homeTeam.id) || teams[0];
  const away = teams.find(t => t.id === m.awayTeam.id) || teams[1];
  return { home: home || { players: [] }, away: away || { players: [] } };
}
async function getBox(g) {
  if (!g.final && !g.live) return null;
  const old = Date.now() - g.ts > OLD_MS, c = state.boxCache.get(g.id);
  if (c && ((old && c.ready) || Date.now() - c.t < 120000)) return c;
  const m = await hlMatch(g);
  if (!m) return null;
  const box = parseBox(await hl("box-score/" + m.id, {}, old), m);
  const ready = box.home.players.some(p => p.min > 0) && box.away.players.some(p => p.min > 0);
  const out = { t: Date.now(), match: m, box, ready, starters: c ? c.starters : null };
  state.boxCache.set(g.id, out);
  return out;
}
async function getStarters(g, c) {
  if (c.starters) return c.starters;
  const s = new Set();
  try {
    const l = await hl("lineups/" + c.match.id, {}, Date.now() - g.ts > OLD_MS);
    for (const side of [l.home, l.away]) for (const p of (side && side.lineup) || []) if (p.isStarter) { s.add(p.id); s.add(norm(p.player || "")); }
    c.starters = s;
  } catch (e) { /* titulaires indisponibles : on affiche sans séparation */ }
  return s;
}
function boxRows(g, c) {
  const rows = [];
  [[c.box.home, g.homeId, g.home], [c.box.away, g.awayId, g.away]].forEach(([side, id, ab]) => side.players.filter(p => p.min > 0).forEach(p => {
    const parts = p.name.trim().split(/\s+/);
    rows.push({ player: { first_name: parts[0] || "?", last_name: parts.slice(1).join(" ") || parts[0] || "?" }, team: { id, abbreviation: ab }, game: { id: g.id }, min: p.min, pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk });
  }));
  return rows;
}
async function loadNightStats() {
  if (state.noStats) return;
  const games = lastNight();
  if (!games.length) { state.nightStats = []; return; }
  const rows = [];
  for (const g of games) {
    try { const c = await getBox(g); if (c) rows.push(...boxRows(g, c)); }
    catch (e) { if (e.status === 401 || e.status === 403) { state.noStats = true; return; } if (e.status === 429) break; }
  }
  state.nightStats = rows;
}
async function loadTeams() {
  if (state.teams) return state.teams;
  const d = await nba("teams");
  state.teams = (d.data || []).filter(t => t.id <= 30).sort((a, b) => a.full_name.localeCompare(b.full_name));
  return state.teams;
}

function computeRecords(games) {
  const rec = new Map();
  const get = t => { if (!rec.has(t.id)) rec.set(t.id, { t, w: 0, l: 0, last: [] }); return rec.get(t.id); };
  games.filter(g => g.final).sort((a, b) => a.ts - b.ts).forEach(g => {
    const R = g.raw, hw = R.home_team_score > R.visitor_team_score;
    const H = get(R.home_team), V = get(R.visitor_team);
    (hw ? H : V).w++; (hw ? V : H).l++;
    H.last.push(hw ? "V" : "D"); V.last.push(hw ? "D" : "V");
  });
  rec.forEach(r => {
    const l = r.last[r.last.length - 1]; let n = 0;
    for (let i = r.last.length - 1; i >= 0 && r.last[i] === l; i--) n++;
    r.streak = r.last.length ? n + l : "—";
  });
  return rec;
}
function standingsFor(records, conf) {
  return [...records.values()].filter(r => r.t.conference === conf && r.t.id <= 30)
    .sort((a, b) => (b.w / Math.max(1, b.w + b.l)) - (a.w / Math.max(1, a.w + a.l)) || b.w - a.w);
}

let seasonPromise = null;
function ensureSeason() {
  if (state.season && Date.now() - state.season.t < 15 * 60 * 1000) return Promise.resolve(state.season);
  if (seasonPromise) return seasonPromise;
  seasonPromise = (async () => {
    try {
      let year = currentSeason();
      const prog = n => $$(".season-progress").forEach(e => e.textContent = ` (page ${n})`);
      let raw = await fetchAll("games", { "seasons[]": year, postseason: "false" }, 15, prog);
      if (!raw.length) { year--; raw = await fetchAll("games", { "seasons[]": year, postseason: "false" }, 15, prog); }
      const games = raw.map(normGame).sort((a, b) => a.ts - b.ts);
      state.season = { year, games, records: computeRecords(games), t: Date.now() };
      return state.season;
    } finally { seasonPromise = null; }
  })();
  return seasonPromise;
}

/* ---------- Bandeau de scores + accueil ---------- */
function bestScorer(g) {
  if (!g.final) return null;
  const rows = (state.nightStats || []).filter(r => r.game && r.game.id === g.id && playedMin(r));
  if (rows.length) { const r = rows.reduce((a, b) => b.pts > a.pts ? b : a); return { name: shortName(fullName(r.player)), pts: r.pts }; }
  const l = state.tops.get(norm(g.raw.home_team.full_name) + "|" + norm(g.raw.visitor_team.full_name)) || [];
  const t = l.find(x => Math.abs(Date.parse(x[0] + "T12:00:00Z") - g.ts) < 20 * 36e5);
  return t && t[3] ? { name: shortName(t[3]), pts: t[4] } : null;
}
function gameCard(g) {
  const scored = g.final || g.live, b = broadcastFor(g), recs = hlRecords();
  const stat = g.final ? '<span class="tc-state final">Final</span>' : g.live ? '<span class="tc-state live">In progress</span>' : `<span class="tc-state up">${esc(fmtDay(g.when))}</span>`;
  const time = g.hasTime ? `<span class="tc-time">${esc(fmtTime(g.when))}</span>` : "";
  const rec = id => { const r = recs.get(norm(id)); return r ? `${r.w}-${r.l}` : ""; };
  const row = (ab, sc, lose, full) => `<div class="tc-row${lose ? " lose" : ""}">${dot(ab)}<b>${esc(ab)}</b>${scored ? `<span class="sc">${sc ?? "—"}</span>` : `<span class="rec">${rec(full)}</span>`}</div>`;
  let foot;
  if (g.final) { const t = bestScorer(g); foot = t ? `<div class="tc-foot tc-best">★ ${esc(t.name)} : ${t.pts} pts</div>` : '<div class="tc-foot tc-pend">Voir la feuille de match</div>'; }
  else if (g.live) foot = `<div class="tc-foot tc-live-info">${esc(g.liveLabel)}</div>`;
  else foot = `<div class="tc-foot tc-when">${time}${b ? tvChip(b) : ""}</div>`;
  return `<button class="tcard" data-game="${g.id}"><div class="tc-head">${stat}${scored ? `<span class="tc-right">${time}${b ? tvChip(b, false) : ""}</span>` : ""}</div>${row(g.away, g.a, g.final && g.a < g.h, g.raw.visitor_team.full_name)}${row(g.home, g.h, g.final && g.h < g.a, g.raw.home_team.full_name)}${foot}</button>`;
}
function showTicker() {
  const games = state.tickerMode === "results" ? [...state.windowGames.filter(g => g.live), ...lastNight()] : state.windowGames.filter(g => !g.final).slice(0, 14);
  $("#ticker-track").innerHTML = games.map(gameCard).join("") || '<div class="empty-state">Aucune rencontre à afficher.</div>';
  $$(".ticker-tab").forEach(b => b.classList.toggle("active", b.dataset.ticker === state.tickerMode));
}
function showScores() {
  const g = lastNight();
  $("#home-scores").innerHTML = g.map(x => `<div class="score-row" data-game="${x.id}"><span class="score-team">${dot(x.away)} ${esc(x.away)}</span><span class="score-center">${x.a} – ${x.h}<small>FINAL</small></span><span class="score-team">${esc(x.home)} ${dot(x.home)}</span></div>`).join("") || '<div class="empty-state">Aucun résultat récent.</div>';
}
const PAY = "Statistiques individuelles momentanément indisponibles (clé Highlightly absente, refusée ou quota du jour atteint).";
const playedMin = r => r.min && r.min !== "00" && r.min !== "0" && r.min !== "00:00";
const fullName = p => `${p.first_name} ${p.last_name}`;

function showFrench() {
  const el = $("#french-performances");
  if (state.noStats) { el.innerHTML = `<div class="paywall">${PAY}</div>`; return; }
  if (!state.nightStats) { el.innerHTML = '<div class="loading">Chargement…</div>'; return; }
  const fr = state.nightStats.filter(r => playedMin(r) && FRENCH.includes(norm(fullName(r.player)))).sort((a, b) => b.pts - a.pts).slice(0, 6);
  el.innerHTML = fr.map(r => {
    const g = findGame(r.game && r.game.id); let sum = "";
    if (g) { const home = r.team.id === g.homeId, me = home ? g.h : g.a, op = home ? g.a : g.h; sum = `${me > op ? "Victoire" : "Défaite"} ${me}–${op} ${home ? "face à" : "à"} ${esc(home ? g.away : g.home)}`; }
    return `<article class="player-card"><div class="player-top"><span class="player-avatar">${esc(r.player.first_name[0] + r.player.last_name[0])}</span><b class="player-stat">${r.pts}</b></div><h3>${esc(fullName(r.player))} ${FLAG}</h3><p>${esc(r.team.abbreviation)} · ${r.pts} PTS · ${r.reb} REB · ${r.ast} PD</p><small>${sum}</small></article>`;
  }).join("") || '<div class="paywall">Aucun joueur français n\'a joué lors de la dernière nuit.</div>';
}
function showTop() {
  const el = $("#top-performances");
  if (state.noStats) { el.innerHTML = `<div class="paywall">${PAY}</div>`; return; }
  if (!state.nightStats) { el.innerHTML = '<div class="loading">Chargement…</div>'; return; }
  const top = [...state.nightStats].filter(playedMin).sort((a, b) => b.pts - a.pts).slice(0, 4);
  el.innerHTML = top.map((r, i) => { const g = findGame(r.game && r.game.id); return `<div class="top-item" data-game="${r.game ? r.game.id : ""}"><span class="top-rank">0${i + 1}</span><div><h3>${esc(fullName(r.player))}</h3><p>${g ? esc(g.away) + " · " + esc(g.home) : esc(r.team.abbreviation)}</p></div><b class="top-pts">${r.pts} PTS</b></div>`; }).join("") || '<div class="empty-state">Aucune donnée.</div>';
}
function showNews() { $("#news-grid").innerHTML = news.map((n, i) => `<article class="news-card" tabindex="0" data-news="${i}"><div class="news-art">${["NBA", "FOCUS", "24/7"][i]}</div><div class="news-copy"><small>${n[0]}</small><h3>${n[1]}</h3><p>${n[2]}</p></div></article>`).join(""); }

/* ---------- Feuille de match ---------- */
function sortRows(players, starters) {
  const st = p => starters.has(p.id) || starters.has(norm(p.name));
  const played = players.filter(p => p.min > 0);
  return [...played.filter(st), ...played.filter(p => !st(p)).sort((x, y) => y.min - x.min)].map(p => ({ ...p, starter: st(p) }));
}
const evalScore = p => (p.pts + p.reb + p.ast + p.stl + p.blk) - ((p.fga - p.fgm) + (p.fta - p.ftm) + p.tov);
function teamTable(title, score, players, starters) {
  const rows = sortRows(players, starters);
  const sum = k => rows.reduce((a, p) => a + p[k], 0);
  const lastStarter = rows.reduce((a, p, i) => p.starter ? i : a, -1);
  const body = rows.map((p, i) => `<tr class="${i === lastStarter && lastStarter < rows.length - 1 ? "starter-last" : ""}"><td>${esc(p.name)}</td><td>${Math.round(p.min)}</td><td>${p.fgm}/${p.fga}</td><td>${p.tpm}/${p.tpa}</td><td>${p.ftm}/${p.fta}</td><td>${p.oreb}</td><td>${p.dreb}</td><td>${p.reb}</td><td>${p.ast}</td><td>${p.pf}</td><td>${p.stl}</td><td>${p.tov}</td><td>${p.blk}</td><td>${p.pm > 0 ? "+" : ""}${p.pm}</td><td class="col-pts">${p.pts}</td><td>${evalScore(p)}</td></tr>`).join("");
  const foot = `<tr class="box-total"><td>Total</td><td></td><td>${sum("fgm")}/${sum("fga")}</td><td>${sum("tpm")}/${sum("tpa")}</td><td>${sum("ftm")}/${sum("fta")}</td><td>${sum("oreb")}</td><td>${sum("dreb")}</td><td>${sum("reb")}</td><td>${sum("ast")}</td><td>${sum("pf")}</td><td>${sum("stl")}</td><td>${sum("tov")}</td><td>${sum("blk")}</td><td></td><td class="col-pts">${sum("pts")}</td><td></td></tr>`;
  return `<h3 class="box-team">${esc(title)} · ${score ?? "—"}</h3><div class="table-wrap"><table class="box"><thead><tr><th>Joueurs</th><th>Min</th><th>Tirs</th><th>3pts</th><th>LF</th><th>O</th><th>D</th><th>T</th><th>Pd</th><th>Fte</th><th>Int</th><th>Bp</th><th>Ct</th><th>+/-</th><th>Pts</th><th>Éval</th></tr></thead><tbody>${body}${foot}</tbody></table></div>`;
}
function quarterTable(g, m) {
  const sc = (m.state && m.state.score) || {}, a = sc.awayTeam || [], h = sc.homeTeam || [];
  if (!a.length) return "";
  const head = a.map((_, i) => `<th>${i < 4 ? "Q" + (i + 1) : "PR" + (i > 4 ? i - 3 : "")}</th>`).join("");
  const row = (n, arr) => `<tr><td class="team-pair">${esc(n)}</td>${arr.map(v => `<td>${v}</td>`).join("")}<td class="col-pts">${arr.reduce((x, y) => x + (+y || 0), 0)}</td></tr>`;
  return `<div class="table-wrap"><table class="box"><thead><tr><th>Score</th>${head}<th>Total</th></tr></thead><tbody>${row(g.away, a)}${row(g.home, h)}</tbody></table></div>`;
}
async function openGame(id) {
  const g = findGame(id); if (!g) return;
  const note = $(".modal-note"), wrap = $("#match-modal .table-wrap"), token = ++state.modalToken;
  $("#modal-title").textContent = `${g.away} ${g.a ?? "—"} – ${g.h ?? "—"} ${g.home}`;
  wrap.innerHTML = ""; note.textContent = "Chargement de la feuille de match…";
  $("#match-modal").showModal();
  if (!g.final && !g.live) { note.textContent = "Match à venir : la feuille de match sera disponible après la rencontre."; return; }
  try {
    const c = await getBox(g);
    if (token !== state.modalToken) return;
    if (!c) { note.textContent = "Feuille de match introuvable pour cette rencontre."; return; }
    const starters = await getStarters(g, c);
    if (token !== state.modalToken) return;
    const m = c.match;
    wrap.innerHTML = quarterTable(g, m) + teamTable(m.awayTeam.displayName || g.away, g.a, c.box.away.players, starters) + teamTable(m.homeTeam.displayName || g.home, g.h, c.box.home.players, starters);
    note.textContent = c.ready ? "Statistiques officielles via Highlightly." : "Feuille de match pas encore complète : les chiffres peuvent évoluer.";
  } catch (e) {
    if (token !== state.modalToken) return;
    note.textContent = e.status === 429 ? "Quota quotidien de l'API atteint, réessaie plus tard." : (e.status === 401 || e.status === 403) ? "Accès à l'API refusé : vérifie la clé HIGHLIGHTLY_KEY dans Cloudflare." : "Impossible de charger la feuille de match pour le moment.";
  }
}

/* ---------- Calendrier (par mois : charge uniquement le mois affiché) ---------- */
function seasonMonths() {
  const y = currentSeason(), out = [];
  for (let i = 0; i < 9; i++) { const d = new Date(Date.UTC(y, 9 + i, 1)); out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`); }
  return out;
}
const monthLabel = m => { const t = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(m + "-01T12:00:00Z")); return t.charAt(0).toUpperCase() + t.slice(1); };
function ensureCalendarControls() {
  if ($("#calendar-month")) return;
  const f = $("#calendar-filter"); if (!f) return;
  const months = seasonMonths(), now = ymd(new Date()).slice(0, 7), def = months.includes(now) ? now : months[0];
  f.insertAdjacentHTML("beforebegin", `<select id="calendar-month" class="select-control" aria-label="Choisir le mois">${months.map(m => `<option value="${m}"${m === def ? " selected" : ""}>${monthLabel(m)}</option>`).join("")}</select>`);
  $("#calendar-month").onchange = showCalendar;
}
async function monthGames(m) {
  const c = state.calMonths.get(m), cur = m === ymd(new Date()).slice(0, 7);
  if (c && Date.now() - c.t < (cur ? 5 : 60) * 60 * 1000) return c.games;
  const [y, mo] = m.split("-").map(Number), last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const raw = await fetchAll("games", { start_date: `${m}-01`, end_date: `${m}-${String(last).padStart(2, "0")}` }, 6);
  const games = raw.map(normGame).sort((a, b) => a.ts - b.ts);
  games.forEach(g => state.gameIndex.set(g.id, g));
  state.calMonths.set(m, { t: Date.now(), games });
  return games;
}
async function showCalendar() {
  ensureCalendarControls();
  const body = $("#calendar-body"), token = ++state.calToken;
  body.innerHTML = '<tr><td colspan="5" class="loading">Chargement du calendrier…</td></tr>';
  try {
    const games = await monthGames($("#calendar-month").value);
    if (token !== state.calToken) return;
    state.calGames = games; renderCalendar(); loadTops($("#calendar-month").value);
  } catch (e) { if (token === state.calToken) body.innerHTML = '<tr><td colspan="5" class="empty-state">Calendrier indisponible pour le moment.</td></tr>'; }
}
function topCell(g) {
  if (!g.final) return "—";
  const l = state.tops.get(norm(g.raw.home_team.full_name) + "|" + norm(g.raw.visitor_team.full_name)) || [];
  const t = l.find(x => Math.abs(Date.parse(x[0] + "T12:00:00Z") - g.ts) < 20 * 36e5);
  if (!t || !t[3]) return "—";
  const parts = String(t[3]).trim().split(/\s+/);
  return `${esc(parts[0][0])}. ${esc(parts.slice(1).join(" ") || parts[0])} <span class="muted">· ${t[4]} pts</span>`;
}
async function loadTops(m) {
  const c = state.topsLoaded.get(m);
  if (c && Date.now() - c < 5 * 60 * 1000) return;
  try {
    const r = await fetch("/api/tops?m=" + m); if (!r.ok) return;
    const d = await r.json();
    for (const x of d.tops || []) { const k = norm(x[1]) + "|" + norm(x[2]); const l = state.tops.get(k) || []; if (!l.some(y => y[0] === x[0])) l.push(x); state.tops.set(k, l); }
    state.topsLoaded.set(m, Date.now());
    const sel = $("#calendar-month"); if (sel && sel.value === m) renderCalendar();
    showTicker();
  } catch (e) { /* le meilleur marqueur reste affiché « — » */ }
}
function renderCalendar() {
  const filter = $("#calendar-filter").value; let games = state.calGames || [];
  if (filter === "played") games = games.filter(g => g.final);
  else if (filter === "upcoming") games = games.filter(g => !g.final);
  const rows = games.map(g => `<tr><td>${whenFr(g)}</td><td class="team-pair">${dot(g.away)}${esc(g.away)} <span class="muted">@</span> ${dot(g.home)}${esc(g.home)}</td><td>${g.final ? `${g.a} – ${g.h}` : g.live ? `${g.a} – ${g.h} <span class="live-label">${esc(g.liveLabel)}</span>` : '<span class="muted">À venir</span>'}</td><td>${topCell(g)}</td><td>${broadcastMarkup(g)}</td><td>${g.final ? `<button class="table-action" data-game="${g.id}">Feuille de match</button>` : "—"}</td></tr>`).join("");
  $("#calendar-body").innerHTML = rows || '<tr><td colspan="6" class="empty-state">Aucun match dans ce filtre pour ce mois.</td></tr>';
}

/* ---------- Équipes ---------- */
async function showTeams() {
  const grid = $("#team-grid");
  if (!state.teams) {
    grid.innerHTML = '<div class="loading">Chargement des équipes…</div>';
    try { await loadTeams(); } catch (e) { grid.innerHTML = '<div class="empty-state">Équipes indisponibles pour le moment.</div>'; return; }
  }
  renderTeams();
  hlStandings().then(renderTeams).catch(() => {});
  loadSeasonLeaders().then(renderTeams).catch(() => {});
}
function hlRecords() {
  const m = new Map();
  if (hlStandCache) for (const conf of ["East", "West"]) (hlStandCache.d[conf] || []).forEach((r, i) => m.set(norm(r.t.displayName || ""), { w: r.w, l: r.l, streak: r.streak, rank: i + 1 }));
  return m;
}
function frenchByTeam() {
  const m = new Map(), f = (state.sl && state.sl.d && state.sl.d.french) || [];
  f.forEach(p => { const k = norm(p.team || ""); if (!m.has(k)) m.set(k, []); const l = m.get(k); if (!l.some(n => norm(n) === norm(p.name))) l.push(p.name); });
  return m;
}
function renderTeams() {
  if (!state.teams) return;
  const q = norm($("#team-search").value), recs = hlRecords(), fr = frenchByTeam();
  $("#team-grid").innerHTML = state.teams.filter(t => norm([t.full_name, t.abbreviation, t.city, t.name, CONF[t.conference]].join(" ")).includes(q)).map(t => {
    const r = recs.get(norm(t.full_name)), k = r && r.rank, f = fr.get(norm(t.full_name)) || [];
    return `<article class="team-card" data-team="${t.id}" style="--tc:${TEAM_COLOR[t.abbreviation] || "#7a8699"}"><div class="tm-top"><div class="team-monogram">${esc(t.abbreviation)}</div><div class="tm-id"><h3>${esc(t.full_name)}</h3><p>Conférence ${CONF[t.conference] || ""}${k ? " · " + (k === 1 ? "1er" : k + "e") : ""}</p></div></div><div class="team-record"><span>${r ? `${r.w} V / ${r.l} D` : "— V / — D"}</span><span class="muted">Voir →</span></div>${f.length ? `<div class="tm-fr">${f.map(n => `<span>${esc(n)} ${FLAG}</span>`).join("")}</div>` : ""}</article>`;
  }).join("") || '<div class="empty-state">Aucune équipe trouvée.</div>';
}
const POS = { G: "Arrière", F: "Ailier", C: "Pivot" };
const posFr = p => p ? p.split("-").map(x => POS[x] || x).join(" / ") : "—";
const heightFr = h => { const m = /^(\d+)-(\d+)$/.exec(h || ""); if (!m) return "—"; return (Math.round((+m[1] * 12 + +m[2]) * 2.54) / 100).toFixed(2).replace(".", ",") + " m"; };
async function teamStarters(t) {
  const out = new Set();
  if (state.noStats) return out;
  try {
    let g = [...state.windowGames].reverse().find(x => x.final && (x.homeId === t.id || x.awayId === t.id));
    if (!g) {
      const r = await nba("games", { "team_ids[]": t.id, start_date: ymd(addDays(-14)), end_date: ymd(new Date()), per_page: 20 });
      g = (r.data || []).map(normGame).filter(x => x.final).sort((a, b) => b.ts - a.ts)[0];
      if (g) state.gameIndex.set(g.id, g);
    }
    if (!g) return out;
    const m = await hlMatch(g); if (!m) return out;
    const l = await hl("lineups/" + m.id, {}, Date.now() - g.ts > OLD_MS);
    const side = g.homeId === t.id ? l.home : l.away;
    for (const p of (side && side.lineup) || []) if (p.isStarter) out.add(norm(p.player || ""));
  } catch (e) { /* cinq majeur indisponible : l'effectif s'affiche sans */ }
  return out;
}
async function openTeam(id) {
  const t = state.teams && state.teams.find(x => x.id === +id); if (!t) return;
  state.activeTeam = t.id;
  $("#team-grid").hidden = true;
  const det = $("#team-detail"); det.hidden = false;
  const r = hlRecords().get(norm(t.full_name));
  det.innerHTML = `<div class="team-detail-head"><button class="back-button" id="team-back">← Toutes les équipes</button><div><p class="eyebrow">FRANCHISE NBA · ${(CONF[t.conference] || "").toUpperCase()}</p><h2>${esc(t.full_name)}</h2>${r ? `<p class="section-subtitle">Bilan : ${r.w} V – ${r.l} D · Série en cours : ${esc(r.streak)}</p>` : ""}</div></div><div id="roster" class="loading">Chargement de l'effectif…</div>`;
  try {
    const [raw, starters] = await Promise.all([fetchAll("players", { "team_ids[]": t.id }, 3), teamStarters(t)]);
    if (state.activeTeam !== t.id) return;
    const rank = p => { const c = String(p.position || "").charAt(0); return c === "G" ? 0 : c === "F" ? 1 : c === "C" ? 2 : 3; };
    const hasData = p => !!(p.jersey_number || p.position || p.height);
    const isSt = p => starters.has(norm(fullName(p)));
    const players = raw.filter(p => p.first_name || p.last_name).sort((x, y) => (isSt(y) - isSt(x)) || (hasData(y) - hasData(x)) || (rank(x) - rank(y)) || x.last_name.localeCompare(y.last_name));
    const lastSt = players.reduce((acc, p, i) => isSt(p) ? i : acc, -1);
    const rows = players.map((p, i) => `<tr class="${isSt(p) ? "starter" : ""}${i === lastSt && lastSt < players.length - 1 ? " starter-last" : ""}"><td>${esc(fullName(p))}${p.country === "France" ? FLAG : ""}</td><td>${esc(p.jersey_number || "—")}</td><td>${esc(posFr(p.position))}</td><td>${heightFr(p.height)}</td><td>${esc(p.country || "—")}</td></tr>`).join("");
    $("#roster").outerHTML = `<div class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>Joueur</th><th>N°</th><th>Poste</th><th>Taille</th><th>Pays</th></tr></thead><tbody>${rows}</tbody></table></div></div><p class="section-subtitle">${starters.size ? "Les cinq premiers joueurs sont le cinq majeur du dernier match. " : ""}Moyennes par match (PTS, REB, PDS, INT, CTR) : bientôt disponibles.</p>`;
  } catch (e) { if (state.activeTeam === t.id) $("#roster").textContent = "Effectif indisponible pour le moment."; }
}

/* ---------- Statistiques ---------- */
function ensureStatsToggle() {
  if ($("#stats-toggle")) return;
  const pill = $("#page-stats .edition-pill"); if (!pill) return;
  pill.insertAdjacentHTML("afterend", '<div id="stats-toggle" class="seg"><button data-mode="season">Saison</button><button data-mode="night">La nuit</button></div>');
  $("#stats-toggle").addEventListener("click", e => { const b = e.target.closest("button[data-mode]"); if (!b) return; state.statsMode = b.dataset.mode; state.statsModeSet = true; showLeaders(); });
}
async function loadSeasonLeaders() {
  if (state.sl && Date.now() - state.sl.t < 5 * 60 * 1000) return state.sl.d;
  let d = null;
  try { const r = await fetch("/api/leaders"); if (r.ok) d = await r.json(); } catch (e) { d = null; }
  state.sl = { t: Date.now(), d };
  return d;
}
const LEAD_CATS = [["Scoreurs", "PTS", "pts"], ["Passeurs", "PDS", "ast"], ["Rebondeurs", "REB", "reb"], ["Contreurs", "CTR", "blk"], ["Interceptions", "INT", "stl"]];
async function showLeaders() {
  ensureStatsToggle();
  const el = $("#leaders-grid"), sub = $("#page-stats .section-subtitle");
  if (!state.sl) el.innerHTML = '<div class="loading">Chargement…</div>';
  const sl = await loadSeasonLeaders();
  const seasonOk = !!(sl && sl.leaders && sl.gamesCounted > 0);
  if (!seasonOk) state.statsMode = "night"; else if (!state.statsModeSet) state.statsMode = "season";
  const tg = $("#stats-toggle");
  if (tg) { $$("button", tg).forEach(b => b.classList.toggle("active", b.dataset.mode === state.statsMode)); tg.hidden = !seasonOk; }
  if (state.statsMode === "season") {
    const abbrOf = n => { const t = state.teams && state.teams.find(x => norm(x.full_name) === norm(n || "")); return t ? t.abbreviation : (n || ""); };
    if (sub) sub.textContent = `Moyennes par match · saison ${sl.season - 1}-${String(sl.season).slice(2)} · minimum ${sl.minGames} matchs joués` + (sl.through ? ` · à jour jusqu'au ${fmtLong(sl.through)}` : "") + (sl.cleanup ? ` · correction en cours (${sl.cleanup} match(s) de présaison à retirer)` : "") + (sl.abandoned ? ` · ${sl.abandoned} match(s) en attente d'une feuille complète` : "") + (sl.gamesCounted < sl.gamesTotal ? ` · calcul en cours (${sl.gamesCounted} matchs sur ${sl.gamesTotal})` : "");
    el.innerHTML = LEAD_CATS.map(([name, abbr, k]) => `<article class="leader-card"><h2>${name} <span class="muted">(${abbr})</span></h2>${(sl.leaders[k] || []).map((r, i) => `<div class="leader-row"><span class="muted">${i + 1}</span><span>${esc(r.name)} <span class="muted">${esc(abbrOf(r.team))}</span></span><b>${r.v.toFixed(1)}</b></div>`).join("")}</article>`).join("");
    return;
  }
  if (state.noStats) { el.innerHTML = `<div class="paywall">Statistiques momentanément indisponibles (clé Highlightly absente, refusée ou quota du jour atteint).</div>`; return; }
  if (!state.nightStats) { el.innerHTML = '<div class="loading">Chargement…</div>'; return; }
  if (sub) sub.textContent = "Les cinq meilleurs de la dernière nuit dans chaque catégorie.";
  const rows = state.nightStats.filter(playedMin);
  el.innerHTML = LEAD_CATS.map(([name, abbr, k]) => `<article class="leader-card"><h2>${name} <span class="muted">(${abbr})</span></h2>${[...rows].sort((a, b) => b[k] - a[k]).slice(0, 5).map((r, i) => `<div class="leader-row"><span class="muted">${i + 1}</span><span>${esc(fullName(r.player))} <span class="muted">${esc(r.team.abbreviation)}</span></span><b>${r[k]}</b></div>`).join("")}</article>`).join("");
}

/* ---------- Classement (Highlightly, avec repli sur le calcul BallDontLie) ---------- */
const stv = (row, name) => { const s = (row.statistics || []).find(x => x.displayName === name); return s ? s.value : undefined; };
const streakFr = v => { const m = /^([WL])(\d+)$/i.exec(String(v || "")); return m ? m[2] + (m[1].toUpperCase() === "W" ? "V" : "D") : "—"; };
let hlStandCache = null;
async function hlStandings() {
  if (hlStandCache && Date.now() - hlStandCache.t < 10 * 60 * 1000) return hlStandCache.d;
  const r = await hl("standings", { leagueType: "NBA", year: currentSeason() + 1, limit: 20 });
  const out = {};
  for (const [conf, abbr] of [["East", "EAST"], ["West", "WEST"]]) {
    const cands = (r.data || []).filter(x => String(x.abbreviation).toUpperCase() === abbr);
    const item = cands.find(x => /regular/i.test(x.seasonType || "")) || cands[0];
    if (!item || !(item.data || []).length) return null;
    out[conf] = item.data.map(row => {
      const l = Number(stv(row, "Losses")) || 0, pct = parseFloat(stv(row, "Win Percentage")) || 0;
      let w = stv(row, "Wins");
      w = w !== undefined ? Number(w) : (pct > 0 && pct < 1 ? Math.round(pct * l / (1 - pct)) : 0);
      return { t: row.team, w, l, pct, pos: Number(stv(row, "Position")) || 99, streak: streakFr(stv(row, "Streak")) };
    }).sort((a, b) => a.pos - b.pos || b.pct - a.pct);
  }
  hlStandCache = { t: Date.now(), d: out };
  return out;
}
/* Données de classement unifiées : Highlightly, avec repli sur le calcul BallDontLie */
async function standingsData(allowHeavy) {
  let hs = null;
  try { hs = await hlStandings(); } catch (e) { hs = null; }
  try { await loadTeams(); } catch (e) {}
  const byName = n => state.teams && state.teams.find(x => norm(x.full_name) === norm(n || ""));
  if (hs) {
    const out = {};
    for (const conf of ["East", "West"]) out[conf] = hs[conf].map(r => { const b = byName(r.t.displayName); return { abbr: b ? b.abbreviation : r.t.abbreviation, name: (b && b.name) || r.t.name || r.t.displayName, w: r.w, l: r.l, pct: r.pct, streak: r.streak }; });
    return out;
  }
  if (!allowHeavy && !state.season) return null;
  await ensureSeason();
  const out = {};
  for (const conf of ["East", "West"]) out[conf] = standingsFor(state.season.records, conf).map(r => ({ abbr: r.t.abbreviation, name: r.t.name, w: r.w, l: r.l, pct: r.w / Math.max(1, r.w + r.l), streak: r.streak }));
  return out;
}
const rkClass = n => n <= 6 ? "g" : n <= 10 ? "o" : "n";
const pctFr = p => (p * 100).toFixed(1).replace(".", ",") + "%";
let homeConf = "West";
async function showHomeStandings() {
  const el = $("#home-standings"); if (!el) return;
  let d = null; try { d = await standingsData(false); } catch (e) { d = null; }
  if (!d) { el.innerHTML = '<div class="empty-state">Classement indisponible pour le moment.</div>'; return; }
  el.innerHTML = (d[homeConf] || []).map((r, i) => `<div class="st-row${i === 5 || i === 9 ? " cut" : ""}"><span class="rk ${rkClass(i + 1)}">${i + 1}</span><span class="st-team">${dot(r.abbr)}<b>${esc(r.abbr)}</b><em>${esc(r.name)}</em></span><span class="st-rec">${r.w}-${r.l}</span><span class="st-pct">${pctFr(r.pct)}</span></div>`).join("");
}
async function showStandings() {
  const loading = '<tr><td colspan="6" class="loading">Chargement du classement…<span class="season-progress"></span></td></tr>';
  if (!hlStandCache && !state.season) { $("#east-body").innerHTML = loading; $("#west-body").innerHTML = loading; }
  let d = null; try { d = await standingsData(true); } catch (e) { d = null; }
  if (!d) { const m = '<tr><td colspan="6" class="empty-state">Classement indisponible pour le moment.</td></tr>'; $("#east-body").innerHTML = m; $("#west-body").innerHTML = m; return; }
  for (const [conf, id] of [["East", "#east-body"], ["West", "#west-body"]]) {
    $(id).innerHTML = d[conf].map((r, i) => `<tr class="${i === 5 || i === 9 ? "cut" : ""}"><td class="rk-cell"><span class="rk ${rkClass(i + 1)}">${i + 1}</span></td><td class="team-pair">${dot(r.abbr)}${esc(r.abbr)} <span class="muted">${esc(r.name)}</span></td><td>${r.w}</td><td>${r.l}</td><td>${pctFr(r.pct)}</td><td class="${/V$/.test(r.streak) ? "streak-win" : /D$/.test(r.streak) ? "streak-loss" : ""}">${r.streak}</td></tr>`).join("") || '<tr><td colspan="6" class="empty-state">Aucun match joué pour le moment.</td></tr>';
  }
}

/* ---------- Playoffs ---------- */
function buildSeries(games, year) {
  const map = new Map();
  games.filter(g => g.final).forEach(g => {
    const key = [g.homeId, g.awayId].sort((a, b) => a - b).join("-");
    if (!map.has(key)) map.set(key, { key, teams: { [g.homeId]: g.raw.home_team, [g.awayId]: g.raw.visitor_team }, wins: { [g.homeId]: 0, [g.awayId]: 0 }, games: [] });
    const s = map.get(key); s.wins[g.h > g.a ? g.homeId : g.awayId]++; s.games.push(g);
  });
  let list = [...map.values()].map(s => {
    s.games.sort((a, b) => a.ts - b.ts); s.start = s.games[0].ts;
    s.ids = Object.keys(s.wins).map(Number); s.max = Math.max(...s.ids.map(i => s.wins[i]));
    return s;
  }).filter(s => s.max >= (year <= 1983 ? 2 : 3)).sort((a, b) => a.start - b.start); // écarte les matchs de play-in isolés
  const last = new Map();
  list.forEach(s => {
    s.round = Math.min(4, 1 + Math.max(0, ...s.ids.map(i => last.get(i) || 0)));
    s.ids.forEach(i => last.set(i, s.round));
  });
  list.forEach(s => {
    const needed = s.round === 1 && year <= 1983 ? 2 : (s.round === 1 && year <= 2002) ? 3 : 4;
    s.ids.sort((a, b) => s.wins[b] - s.wins[a]);
    s.winnerId = s.wins[s.ids[0]] >= needed && s.wins[s.ids[0]] > s.wins[s.ids[1]] ? s.ids[0] : null;
  });
  return list;
}
const ROUNDS = ["1er Tour", "Demi-finales de Conférence", "Finales de Conférence", "Finales NBA"];
const bkTeam = (s, id) => `<div class="bk-t${s.winnerId === id ? " win" : ""}">${dot(s.teams[id].abbreviation)}<span>${esc(s.teams[id].name)}</span><b>${s.wins[id]}</b></div>`;
function bkNode(s, byRT) {
  const kids = s.round > 1 ? s.ids.map(id => byRT.get((s.round - 1) + ":" + id)).filter(Boolean) : [];
  return `<div class="bk-node">${kids.length ? `<div class="bk-kids">${kids.map(k => `<div class="bk-kid">${bkNode(k, byRT)}</div>`).join("")}</div>` : ""}<div class="bk-card" data-series="${s.key}" title="Voir les matchs de la série">${bkTeam(s, s.ids[0])}${bkTeam(s, s.ids[1])}</div></div>`;
}
function bracketTree(series, y) {
  const fin = series.filter(s => s.round === 4).sort((a, b) => b.start - a.start)[0];
  if (!fin) return null;
  const byRT = new Map(); series.forEach(s => s.ids.forEach(id => byRT.set(s.round + ":" + id, s)));
  const [x, z] = fin.ids; let L = x, R = z;
  if (fin.teams[z].conference === "West" && fin.teams[x].conference !== "West") { L = z; R = x; }
  const lr = byRT.get("3:" + L), rr = byRT.get("3:" + R);
  if (!lr && !rr) return null;
  const done = fin.winnerId != null, champ = done ? fin.teams[fin.winnerId] : null, mvp = done ? FMVP[y] : null;
  const confL = CONF[fin.teams[L].conference] || "", confR = CONF[fin.teams[R].conference] || "";
  return `<div class="bk-fit"><div class="bk-titles"><span>Conférence ${confL}</span><span>Conférence ${confR}</span></div><div class="bk-wrap"><div class="bk-side">${lr ? bkNode(lr, byRT) : ""}</div><div class="bk-link"></div><div class="bk-final"><div class="bk-champ">${done ? "Champions NBA " + y : "Finales NBA " + y}</div>${champ ? `<div class="bk-cn">${esc(champ.full_name)}</div>` : ""}<div class="bk-gold" data-series="${fin.key}" title="Voir les matchs de la finale"><small>FINALES NBA</small>${bkTeam(fin, fin.ids[0])}${bkTeam(fin, fin.ids[1])}</div>${mvp ? `<div class="bk-mvp">MVP des finales : <span>${esc(mvp)}</span></div>` : ""}</div><div class="bk-link"></div><div class="bk-side rev">${rr ? bkNode(rr, byRT) : ""}</div></div></div>`;
}
/* Adapte le tableau à la largeur disponible (réduction jusqu'à 60 %, défilement horizontal en dessous) */
function fitBracket() {
  const box = $("#bracket"), fit = box && box.querySelector(".bk-fit"); if (!fit) return;
  const wrap = fit.querySelector(".bk-wrap"), avail = box.clientWidth; if (!wrap || !avail) return;
  fit.style.transform = ""; fit.style.width = ""; fit.style.marginLeft = ""; box.style.height = "";
  const w = wrap.offsetWidth, k = Math.max(0.6, Math.min(1, avail / w));
  fit.style.width = w + "px"; fit.style.transformOrigin = "0 0"; fit.style.transform = `scale(${k})`;
  fit.style.marginLeft = Math.max(0, (avail - w * k) / 2) + "px"; box.style.height = Math.ceil(fit.offsetHeight * k) + "px";
}
function openSeries(key) {
  const s = state.series && state.series.get(key); if (!s) return;
  const [a, b] = s.ids, A = s.teams[a], B = s.teams[b];
  $("#series-title").textContent = `${ROUNDS[s.round - 1]} · ${A.full_name} ${s.wins[a]}–${s.wins[b]} ${B.full_name}`;
  $("#series-note").textContent = (s.winnerId ? `${s.teams[s.winnerId].full_name} remporte la série. ` : "Série en cours. ") + "Clique sur un match pour voir la feuille de match.";
  $("#series-body").innerHTML = s.games.map((g, i) => {
    const wn = g.h > g.a ? g.home : g.away;
    return `<button class="ser-game" data-game="${g.id}"><span class="sg-n">Match ${i + 1}</span><span class="sg-d">${esc(fmtLong(g.date))}</span><span class="sg-m"><span class="${g.a > g.h ? "w" : ""}">${dot(g.away)}${esc(g.away)} <b>${g.a}</b></span><span class="at">@</span><span class="${g.h > g.a ? "w" : ""}"><b>${g.h}</b> ${esc(g.home)}${dot(g.home)}</span></span><span class="sg-go">Feuille de match →</span></button>`;
  }).join("");
  $("#series-modal").showModal();
}
async function showPlayoffs() {
  const y = +$("#playoff-year").value, token = ++state.playoffToken;
  $("#bracket").innerHTML = '<div class="loading">Chargement des playoffs…</div>';
  $("#series-detail").innerHTML = "";
  let games;
  try { games = (await fetchAll("games", { "seasons[]": y - 1, postseason: "true" }, 6)).map(normGame); }
  catch (e) { if (token === state.playoffToken) $("#bracket").innerHTML = '<div class="empty-state">Playoffs indisponibles pour le moment.</div>'; return; }
  if (token !== state.playoffToken) return;
  const series = buildSeries(games, y);
  games.forEach(g => state.gameIndex.set(g.id, g)); state.series = new Map(series.map(x => [x.key, x]));
  if (!series.length) { $("#bracket").innerHTML = '<div class="empty-state">Aucune série disponible pour cette édition.</div>'; return; }
  $("#bracket").innerHTML = bracketTree(series, y) || `<div class="bracket">${ROUNDS.map((n, i) => `<div class="bracket-col"><h3>${n}</h3>${series.filter(s => s.round === i + 1).map(s => { const [a, b] = s.ids; return `<div class="bracket-match"><div class="${s.winnerId === a ? "champ" : ""}"><span>${esc(s.teams[a].name)}</span><b>${s.wins[a]}</b></div><div><span>${esc(s.teams[b].name)}</span><b>${s.wins[b]}</b></div></div>`; }).join("") || '<div class="empty-state">—</div>'}</div>`).join("")}</div>`;
  fitBracket();
  $("#series-detail").innerHTML = [...series].sort((a, b) => b.round - a.round || a.start - b.start).map(s => {
    const [a, b] = s.ids;
    return `<article class="series-card"><h3>${ROUNDS[s.round - 1]} · ${esc(s.teams[a].full_name)} ${s.wins[a]}–${s.wins[b]} ${esc(s.teams[b].full_name)}</h3><p>${s.winnerId ? esc(s.teams[a].full_name) + " remporte la série " + s.wins[a] + "–" + s.wins[b] : "Série en cours"}</p><details><summary>Voir les matchs</summary><ul>${s.games.map((g, i) => `<li>Match ${i + 1} · ${fmtLong(g.date)} · ${esc(g.away)} ${g.a} – ${g.h} ${esc(g.home)}</li>`).join("")}</ul></details></article>`;
  }).join("");
}

/* ---------- Navigation, thème, rafraîchissement ---------- */
const LOADERS = { calendar: () => showCalendar(), teams: () => showTeams(), stats: () => showLeaders(), standings: () => showStandings(), playoffs: () => showPlayoffs() };
function navigate(page) {
  $$(".page").forEach(p => p.classList.toggle("active", p.id === `page-${page}`));
  $$(".nav-link").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  window.scrollTo({ top: 0, behavior: "smooth" });
  $(".main-nav").classList.remove("open");
  if (LOADERS[page]) LOADERS[page]();
}
function initTheme() { const saved = localStorage.getItem("ltb-theme"); if (saved === "light") document.body.dataset.theme = "light"; updateThemeButton(); }
function updateThemeButton() { const light = document.body.dataset.theme === "light"; $(".theme-icon").textContent = light ? "☾" : "☼"; $(".theme-label").textContent = light ? "Mode sombre" : "Mode clair"; $("#theme-toggle").setAttribute("aria-label", light ? "Passer en mode sombre" : "Passer en mode clair"); }
function setNotice(ok) {
  const n = $(".demo-notice"); if (!n) return;
  n.innerHTML = ok ? `<span>BÊTA</span> Scores, calendrier et classement via BallDontLie, feuilles de match via Highlightly. Diffuseurs : programmation française vérifiée.${state.noStats ? " Statistiques individuelles momentanément indisponibles." : ""} Les articles de la rubrique actualités sont des exemples.` : "<span>HORS LIGNE</span> Les données NBA sont momentanément indisponibles. Réessaie dans quelques instants.";
}
function setHeadline() {
  const el = $("#page-home .section-heading .eyebrow");
  if (el) el.textContent = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()).toUpperCase() + " · ÉDITION DU JOUR";
}
async function refreshData() {
  memCache.clear(); state.countdown = 300;
  try {
    if (!TV.loaded) await loadDiffusions();
    await loadWindow(); showTicker(); showScores(); showBroadcasts();
    standingsData(false).then(() => { showHomeStandings(); showTicker(); }).catch(showHomeStandings);
    { const ln = lastNight(); loadTops((ln[0] ? ln[0].date : ymd(new Date())).slice(0, 7)); }
    await loadNightStats(); showTicker(); showFrench(); showTop();
    if ($("#page-stats").classList.contains("active")) showLeaders();
    setNotice(true);
    loadSeasonLeaders(); // fait avancer le calcul des statistiques de saison à chaque visite (réponse ignorée ici)
  } catch (e) {
    setNotice(false);
    $("#ticker-track").innerHTML = '<div class="empty-state">Scores indisponibles pour le moment.</div>';
    $("#home-scores").innerHTML = '<div class="empty-state">Scores indisponibles pour le moment.</div>';
  }
}
function tick() {
  state.countdown--;
  if (state.countdown <= 0) { refreshData(); }
  const m = String(Math.floor(Math.max(0, state.countdown) / 60)).padStart(2, "0"), s = String(Math.max(0, state.countdown) % 60).padStart(2, "0");
  $("#refresh-label").textContent = `Actualisation dans ${m}:${s}`;
}
function init() {
  initTheme(); setHeadline(); showNews();
  $("#ticker-track").innerHTML = '<div class="empty-state">Chargement des scores…</div>';
  $("#home-scores").innerHTML = '<div class="loading">Chargement des scores…</div>';
  showFrench(); showTop();
  $("#year").textContent = new Date().getFullYear();
  for (let y = 2026; y >= 1980; y--) $("#playoff-year").insertAdjacentHTML("beforeend", `<option value="${y}">${y} · Playoffs</option>`);
  $("#bracket").innerHTML = ""; $("#series-detail").innerHTML = "";
  refreshData(); setInterval(tick, 1000);

  $$(".nav-link").forEach(b => b.addEventListener("click", () => navigate(b.dataset.page)));
  $$("[data-goto]").forEach(b => b.addEventListener("click", () => navigate(b.dataset.goto)));
  $$(".ticker-tab").forEach(b => b.addEventListener("click", () => { state.tickerMode = b.dataset.ticker; showTicker(); }));
  const openFrom = e => { const b = e.target.closest("[data-game]"); if (b && b.dataset.game) openGame(+b.dataset.game); };
  ["#ticker-track", "#home-scores", "#top-performances"].forEach(s => $(s).addEventListener("click", openFrom));
  $("#ticker-prev").onclick = () => $("#ticker-track").scrollBy({ left: -480, behavior: "smooth" });
  $("#ticker-next").onclick = () => $("#ticker-track").scrollBy({ left: 480, behavior: "smooth" });
  $("#refresh-btn").onclick = () => { $("#refresh-label").textContent = "Actualisation…"; refreshData(); };
  $("#calendar-filter").onchange = () => { if (state.calGames) renderCalendar(); };
  $("#calendar-body").addEventListener("click", e => { if (e.target.closest("[data-more]")) { state.calLimit += 60; renderCalendar(); return; } openFrom(e); });
  $("#team-search").oninput = () => { if (state.teams) renderTeams(); };
  $("#team-grid").addEventListener("click", e => { const c = e.target.closest("[data-team]"); if (c) openTeam(c.dataset.team); });
  $("#team-detail").addEventListener("click", e => { if (e.target.id === "team-back") { $("#team-grid").hidden = false; $("#team-detail").hidden = true; state.activeTeam = null; } });
  $("#playoff-year").onchange = showPlayoffs;
  $("#home-conf").addEventListener("click", e => { const b = e.target.closest("button[data-conf]"); if (!b) return; homeConf = b.dataset.conf; $$("#home-conf button").forEach(x => x.classList.toggle("active", x === b)); showHomeStandings(); });
  $("#theme-toggle").onclick = () => { document.body.dataset.theme = document.body.dataset.theme === "dark" ? "light" : "dark"; localStorage.setItem("ltb-theme", document.body.dataset.theme); updateThemeButton(); };
  $("#mobile-menu").onclick = () => $(".main-nav").classList.toggle("open");
  $("#modal-close").onclick = () => $("#match-modal").close();
  $("#series-close").onclick = () => $("#series-modal").close();
  $("#series-body").addEventListener("click", openFrom);
  $("#bracket").addEventListener("click", e => { const c = e.target.closest("[data-series]"); if (c) openSeries(c.dataset.series); });
  window.addEventListener("resize", () => { clearTimeout(state.fitT); state.fitT = setTimeout(fitBracket, 120); });
  $("#all-news").onclick = () => alert("La rubrique actualités sera enrichie lors de la prochaine étape.");
  $("#news-grid").addEventListener("click", e => { if (e.target.closest("[data-news]")) alert("Article de démonstration : le système de publication sera ajouté ultérieurement."); });
}
document.addEventListener("DOMContentLoaded", init);
