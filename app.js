/* La Team Basket — app.js (V2 : données réelles BallDontLie via /api/nba) */
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const TZ = "Europe/Paris";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const sleep = ms => new Promise(r => setTimeout(r, ms));

const FRENCH = ["Victor Wembanyama", "Zaccharie Risacher", "Alex Sarr", "Rudy Gobert", "Bilal Coulibaly", "Guerschon Yabusele", "Nicolas Batum", "Ousmane Dieng", "Tidjane Salaun", "Pacome Dadiet", "Noa Essengue", "Joan Beringer"].map(norm);
const CONF = { East: "Est", West: "Ouest" };
const news = [["ANALYSE", "Les nouvelles tendances tactiques à suivre cette saison", "Décryptage des ajustements qui changent le visage du jeu."], ["FOCUS JOUEUR", "Les jeunes talents qui prennent une nouvelle dimension", "Tour d'horizon des progressions à surveiller."], ["DANS LA LIGUE", "La course aux premières places est lancée", "Les premières tendances de la saison se dessinent."]];

const state = { tickerMode: "results", countdown: 300, windowGames: [], teams: null, season: null, noStats: false, nightStats: null, boxCache: new Map(), hlDays: new Map(), modalToken: 0, calLimit: 60, activeTeam: null, playoffToken: 0 };

/* ---------- Styles additionnels (états de chargement, lignes cliquables, détails de séries) ---------- */
document.head.insertAdjacentHTML("beforeend", `<style>
.score-row[data-game],.top-item[data-game]{cursor:pointer}.score-row[data-game]:hover,.top-item[data-game]:hover{background:var(--card2)}
.loading{padding:22px;text-align:center;color:var(--muted);font-size:11px}
.paywall{padding:14px;border:1px dashed var(--line);border-radius:9px;color:var(--muted);font-size:10px;line-height:1.6;grid-column:1/-1}
.live-label{color:var(--green)!important;font-weight:800}
.series-card ul{margin:8px 0 0;padding:0;list-style:none;font-size:9px;color:var(--muted)}
.series-card li{padding:5px 0;border-top:1px solid var(--line)}
.series-card summary{cursor:pointer;color:var(--orange);font-size:10px;font-weight:800;margin-top:9px}
.match-modal{width:min(1080px,calc(100% - 24px));max-height:92vh}
.box-team{font:800 13px Montserrat,sans-serif;margin:18px 0 8px}
table.box{margin-bottom:6px}table.box td,table.box th{text-align:center}table.box td:first-child,table.box th:first-child{text-align:left}
table.box tbody tr:nth-child(even){background:var(--card2)}
table.box tr.starter-last td{border-bottom:2px solid var(--muted)}
table.box tfoot td,table.box tr.box-total td{font-weight:800;border-top:2px solid var(--line);background:transparent}
td.col-pts{font-weight:900;color:var(--orange)}
</style>`);

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
const findGame = id => state.windowGames.find(g => g.id === id) || (state.season && state.season.games.find(g => g.id === id));
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
function gameCard(g) {
  const scored = g.final || g.live;
  return `<button class="ticker-game" data-game="${g.id}"><span class="teams"><b class="${g.final && g.a > g.h ? "winner" : ""}">${esc(g.away)}</b><b class="${g.final && g.h > g.a ? "winner" : ""}">${esc(g.home)}</b></span><span class="score">${scored ? `${g.a}<br>${g.h}` : "—<br>—"}</span><small class="${g.live ? "live-label" : ""}">${g.final ? "Terminé" : g.live ? esc(g.liveLabel) : whenFr(g)}</small></button>`;
}
function showTicker() {
  const games = state.tickerMode === "results" ? lastNight() : state.windowGames.filter(g => !g.final).slice(0, 12);
  $("#ticker-track").innerHTML = games.map(gameCard).join("") || '<div class="empty-state">Aucune rencontre à afficher.</div>';
  $$(".ticker-tab").forEach(b => b.classList.toggle("active", b.dataset.ticker === state.tickerMode));
}
function showScores() {
  const g = lastNight();
  $("#home-scores").innerHTML = g.map(x => `<div class="score-row" data-game="${x.id}"><span class="score-team">${esc(x.away)}</span><span class="score-center">${x.a} – ${x.h}<small>TERMINÉ</small></span><span class="score-team">${esc(x.home)}</span></div>`).join("") || '<div class="empty-state">Aucun résultat récent.</div>';
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
    return `<article class="player-card"><div class="player-top"><span class="player-avatar">${esc(r.player.first_name[0] + r.player.last_name[0])}</span><b class="player-stat">${r.pts}</b></div><h3>${esc(fullName(r.player))}</h3><p>${esc(r.team.abbreviation)} · ${r.pts} PTS · ${r.reb} REB · ${r.ast} PD</p><small>${sum}</small></article>`;
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

/* ---------- Calendrier ---------- */
async function showCalendar() {
  const body = $("#calendar-body");
  if (!state.season) {
    body.innerHTML = '<tr><td colspan="5" class="loading">Chargement du calendrier…<span class="season-progress"></span></td></tr>';
    try { await ensureSeason(); } catch (e) { body.innerHTML = '<tr><td colspan="5" class="empty-state">Calendrier indisponible pour le moment.</td></tr>'; return; }
  }
  renderCalendar();
}
function renderCalendar() {
  const filter = $("#calendar-filter").value; let games = state.season.games;
  if (filter === "played") games = games.filter(g => g.final).reverse();
  else if (filter === "upcoming") games = games.filter(g => !g.final);
  else { const i = games.findIndex(g => g.ts >= Date.now() - 3 * 864e5); games = i < 0 ? games.slice(-60) : games.slice(i); }
  const shown = games.slice(0, state.calLimit);
  let rows = shown.map(g => `<tr><td>${whenFr(g)}</td><td class="team-pair">${esc(g.away)} <span class="muted">@</span> ${esc(g.home)}</td><td>${g.final ? `${g.a} – ${g.h}` : g.live ? `${g.a} – ${g.h} <span class="live-label">${esc(g.liveLabel)}</span>` : '<span class="muted">À venir</span>'}</td><td>—</td><td>${g.final ? `<button class="table-action" data-game="${g.id}">Feuille de match</button>` : "—"}</td></tr>`).join("");
  if (games.length > shown.length) rows += `<tr><td colspan="5" style="text-align:center"><button class="table-action" data-more="1">Afficher plus de matchs (${games.length - shown.length} restants)</button></td></tr>`;
  $("#calendar-body").innerHTML = rows || '<tr><td colspan="5" class="empty-state">Aucun match dans ce filtre.</td></tr>';
}

/* ---------- Équipes ---------- */
async function showTeams() {
  const grid = $("#team-grid");
  if (!state.teams) {
    grid.innerHTML = '<div class="loading">Chargement des équipes…</div>';
    try { await loadTeams(); } catch (e) { grid.innerHTML = '<div class="empty-state">Équipes indisponibles pour le moment.</div>'; return; }
  }
  renderTeams();
  ensureSeason().then(renderTeams).catch(() => {});
}
function renderTeams() {
  if (!state.teams) return;
  const q = norm($("#team-search").value), s = state.season;
  const ranks = new Map();
  if (s) ["East", "West"].forEach(c => standingsFor(s.records, c).forEach((r, i) => ranks.set(r.t.id, i + 1)));
  $("#team-grid").innerHTML = state.teams.filter(t => norm([t.full_name, t.abbreviation, t.city, t.name, CONF[t.conference]].join(" ")).includes(q)).map(t => {
    const r = s && s.records.get(t.id), k = ranks.get(t.id);
    return `<article class="team-card" data-team="${t.id}"><div class="team-monogram">${esc(t.abbreviation)}</div><h3>${esc(t.full_name)}</h3><p>Conférence ${CONF[t.conference] || ""}${k ? " · " + (k === 1 ? "1er" : k + "e") : ""}</p><div class="team-record"><span>${r ? `${r.w} V / ${r.l} D` : "— V / — D"}</span><span class="muted">Voir →</span></div></article>`;
  }).join("") || '<div class="empty-state">Aucune équipe trouvée.</div>';
}
const POS = { G: "Arrière", F: "Ailier", C: "Pivot" };
const posFr = p => p ? p.split("-").map(x => POS[x] || x).join(" / ") : "—";
const heightFr = h => { const m = /^(\d+)-(\d+)$/.exec(h || ""); if (!m) return "—"; return (Math.round((+m[1] * 12 + +m[2]) * 2.54) / 100).toFixed(2).replace(".", ",") + " m"; };
async function openTeam(id) {
  const t = state.teams && state.teams.find(x => x.id === +id); if (!t) return;
  state.activeTeam = t.id;
  $("#team-grid").hidden = true;
  const det = $("#team-detail"); det.hidden = false;
  const r = state.season && state.season.records.get(t.id);
  det.innerHTML = `<div class="team-detail-head"><button class="back-button" id="team-back">← Toutes les équipes</button><div><p class="eyebrow">FRANCHISE NBA · ${(CONF[t.conference] || "").toUpperCase()}</p><h2>${esc(t.full_name)}</h2>${r ? `<p class="section-subtitle">Bilan : ${r.w} V – ${r.l} D · Série en cours : ${esc(r.streak)}</p>` : ""}</div></div><div id="roster" class="loading">Chargement de l'effectif…</div>`;
  try {
    const players = (await fetchAll("players", { "team_ids[]": t.id }, 3)).sort((a, b) => a.last_name.localeCompare(b.last_name));
    if (state.activeTeam !== t.id) return;
    $("#roster").outerHTML = `<div class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>Joueur</th><th>N°</th><th>Poste</th><th>Taille</th><th>Pays</th></tr></thead><tbody>${players.map(p => `<tr><td>${esc(fullName(p))}</td><td>${esc(p.jersey_number || "—")}</td><td>${esc(posFr(p.position))}</td><td>${heightFr(p.height)}</td><td>${esc(p.country || "—")}</td></tr>`).join("")}</tbody></table></div></div><p class="section-subtitle">Moyennes par match (PTS, REB, PDS, INT, CTR) : disponibles avec l'offre payante de BallDontLie.</p>`;
  } catch (e) { if (state.activeTeam === t.id) $("#roster").textContent = "Effectif indisponible pour le moment."; }
}

/* ---------- Statistiques ---------- */
function showLeaders() {
  const el = $("#leaders-grid"), sub = $("#page-stats .section-subtitle");
  if (state.noStats) { el.innerHTML = `<div class="paywall">Statistiques momentanément indisponibles (clé Highlightly absente, refusée ou quota du jour atteint).</div>`; return; }
  if (!state.nightStats) { el.innerHTML = '<div class="loading">Chargement…</div>'; return; }
  if (sub) sub.textContent = "Les cinq meilleurs de la dernière nuit dans chaque catégorie.";
  const cats = [["Scoreurs", "PTS", "pts"], ["Passeurs", "PDS", "ast"], ["Rebondeurs", "REB", "reb"], ["Contreurs", "CTR", "blk"], ["Interceptions", "INT", "stl"]];
  const rows = state.nightStats.filter(playedMin);
  el.innerHTML = cats.map(([name, abbr, k]) => `<article class="leader-card"><h2>${name} <span class="muted">(${abbr})</span></h2>${[...rows].sort((a, b) => b[k] - a[k]).slice(0, 5).map((r, i) => `<div class="leader-row"><span class="muted">${i + 1}</span><span>${esc(fullName(r.player))} <span class="muted">${esc(r.team.abbreviation)}</span></span><b>${r[k]}</b></div>`).join("")}</article>`).join("");
}

/* ---------- Classement ---------- */
async function showStandings() {
  const loading = '<tr><td colspan="6" class="loading">Calcul du classement…<span class="season-progress"></span></td></tr>';
  if (!state.season) { $("#east-body").innerHTML = loading; $("#west-body").innerHTML = loading; }
  try { await ensureSeason(); } catch (e) { const m = '<tr><td colspan="6" class="empty-state">Classement indisponible pour le moment.</td></tr>'; $("#east-body").innerHTML = m; $("#west-body").innerHTML = m; return; }
  for (const [conf, id] of [["East", "#east-body"], ["West", "#west-body"]]) {
    $(id).innerHTML = standingsFor(state.season.records, conf).map((r, i) => `<tr><td>${i + 1}</td><td class="team-pair">${esc(r.t.abbreviation)} <span class="muted">${esc(r.t.name)}</span></td><td>${r.w}</td><td>${r.l}</td><td>${(r.w / Math.max(1, r.w + r.l) * 100).toFixed(1)}%</td><td class="${/V$/.test(r.streak) ? "streak-win" : /D$/.test(r.streak) ? "streak-loss" : ""}">${r.streak}</td></tr>`).join("") || '<tr><td colspan="6" class="empty-state">Aucun match joué pour le moment.</td></tr>';
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
  }).filter(s => s.max >= 3).sort((a, b) => a.start - b.start); // écarte les matchs de play-in isolés
  const last = new Map(), shift = year <= 1983 ? 1 : 0;
  list.forEach(s => {
    s.round = Math.min(4, 1 + Math.max(0, ...s.ids.map(i => last.get(i) || 0)));
    s.ids.forEach(i => last.set(i, s.round));
  });
  list.forEach(s => {
    s.round = Math.min(4, s.round + shift);
    const needed = (s.round === 1 && year >= 1984 && year <= 2002) ? 3 : 4;
    s.ids.sort((a, b) => s.wins[b] - s.wins[a]);
    s.winnerId = s.wins[s.ids[0]] >= needed && s.wins[s.ids[0]] > s.wins[s.ids[1]] ? s.ids[0] : null;
  });
  return list;
}
const ROUNDS = ["1er Tour", "Demi-finales de Conférence", "Finales de Conférence", "Finales NBA"];
async function showPlayoffs() {
  const y = +$("#playoff-year").value, token = ++state.playoffToken;
  $("#bracket").innerHTML = '<div class="loading" style="grid-column:1/-1">Chargement des playoffs…</div>';
  $("#series-detail").innerHTML = "";
  const intro = $(".bracket-intro p"); if (intro) intro.textContent = "Tableau reconstitué automatiquement à partir des résultats de chaque match (source BallDontLie).";
  let games;
  try { games = (await fetchAll("games", { "seasons[]": y - 1, postseason: "true" }, 6)).map(normGame); }
  catch (e) { if (token === state.playoffToken) $("#bracket").innerHTML = '<div class="empty-state" style="grid-column:1/-1">Playoffs indisponibles pour le moment.</div>'; return; }
  if (token !== state.playoffToken) return;
  const series = buildSeries(games, y);
  if (!series.length) { $("#bracket").innerHTML = '<div class="empty-state" style="grid-column:1/-1">Aucune série disponible pour cette édition.</div>'; return; }
  $("#bracket").innerHTML = ROUNDS.map((n, i) => `<div class="bracket-col"><h3>${n}</h3>${series.filter(s => s.round === i + 1).map(s => { const [a, b] = s.ids; return `<div class="bracket-match"><div class="${s.winnerId === a ? "champ" : ""}"><span>${esc(s.teams[a].name)}</span><b>${s.wins[a]}</b></div><div><span>${esc(s.teams[b].name)}</span><b>${s.wins[b]}</b></div></div>`; }).join("") || '<div class="empty-state">—</div>'}</div>`).join("");
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
  n.innerHTML = ok ? `<span>BÊTA</span> Scores, calendrier et classement via BallDontLie, feuilles de match via Highlightly.${state.noStats ? " Statistiques individuelles momentanément indisponibles." : ""} Les articles de la rubrique actualités sont des exemples.` : "<span>HORS LIGNE</span> Les données NBA sont momentanément indisponibles. Réessaie dans quelques instants.";
}
function setHeadline() {
  const el = $("#page-home .section-heading .eyebrow");
  if (el) el.textContent = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()).toUpperCase() + " · ÉDITION DU JOUR";
}
async function refreshData() {
  memCache.clear(); state.countdown = 300;
  try {
    await loadWindow(); showTicker(); showScores();
    await loadNightStats(); showFrench(); showTop();
    if ($("#page-stats").classList.contains("active")) showLeaders();
    setNotice(true);
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
  $("#ticker-prev").onclick = () => $("#ticker-track").scrollBy({ left: -250, behavior: "smooth" });
  $("#ticker-next").onclick = () => $("#ticker-track").scrollBy({ left: 250, behavior: "smooth" });
  $("#refresh-btn").onclick = () => { $("#refresh-label").textContent = "Actualisation…"; refreshData(); };
  $("#calendar-filter").onchange = () => { state.calLimit = 60; if (state.season) renderCalendar(); };
  $("#calendar-body").addEventListener("click", e => { if (e.target.closest("[data-more]")) { state.calLimit += 60; renderCalendar(); return; } openFrom(e); });
  $("#team-search").oninput = () => { if (state.teams) renderTeams(); };
  $("#team-grid").addEventListener("click", e => { const c = e.target.closest("[data-team]"); if (c) openTeam(c.dataset.team); });
  $("#team-detail").addEventListener("click", e => { if (e.target.id === "team-back") { $("#team-grid").hidden = false; $("#team-detail").hidden = true; state.activeTeam = null; } });
  $("#playoff-year").onchange = showPlayoffs;
  $("#theme-toggle").onclick = () => { document.body.dataset.theme = document.body.dataset.theme === "dark" ? "light" : "dark"; localStorage.setItem("ltb-theme", document.body.dataset.theme); updateThemeButton(); };
  $("#mobile-menu").onclick = () => $(".main-nav").classList.toggle("open");
  $("#modal-close").onclick = () => $("#match-modal").close();
  $("#read-feature").onclick = () => alert("Le contenu éditorial sera administrable dans une prochaine version.");
  $("#all-news").onclick = () => alert("La rubrique actualités sera enrichie lors de la prochaine étape.");
  $("#news-grid").addEventListener("click", e => { if (e.target.closest("[data-news]")) alert("Article de démonstration : le système de publication sera ajouté ultérieurement."); });
}
document.addEventListener("DOMContentLoaded", init);
