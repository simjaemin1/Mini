'use strict';
// === server/village-view.js — T1072: 마을 화면 자료 `villageView` — 서버가 보내는 한 덩어리 ===================
//
// ★[★재민 11-01 · PM 카드 T1072 · 짝 T1070(마을 화면 클라)] 모양 정본 `설계/설계_마을화면_villageView.md` · 고정 자료 `test/fixtures/village-view.json`.
//   칸 전수표(시안 네 장의 칸 하나하나 → 서버 정본 · 있음/파생/없음)는 `보고/T1072_2026-11-02.md`.
//
// ★제1 규약 — **읽기만.** 이 파일엔 게임 규칙 · 새 수가 없다. 칸마다 서버 정본 함수(게시판 · 거래소 · 연대기 · 곳간 스냅숏 ·
//   소속 · 촌장 · 달력)를 부르고, 그 결과를 칸으로 묶을 뿐이다(사본 0 — 값을 다시 계산하지 않는다).
// ★제2 규약 — **없는 칸은 키가 없다.** 서버에 그 값이 없으면 만들지 않는다(빈 문자열 · 0 으로 채우지 않는다) — 회부 `인계/회부.md` T1072.
// ★제3 규약 — **품목은 구체다**(캐논 `설계/설계_품목·동사·거래소_캐논.md` §1). 뭉뚱그린 econ 재화(아래 `LUMPED`)가 품목인 줄은
//   싣지 않고 칸마다 **센다**(`withheld`) — 곳간 구성 = 구체 작물(ECON 2-c)이 서면 그 줄이 저절로 구체 품목으로 들어온다.
// ★제4 규약 — **원격 시세 0.** 게이트는 게시판 · 브리핑 · 연대기 · 거래소와 같은 술어(`villages.js _villageNear` · 260px)이고,
//   열 때 그 게이트를 지나야 한다. 열린 채 멀어지면 시세 칸 = `{ none:'far' }` · 나머지 칸은 마지막 값에서 멈춘다(멀리서 다시 안 읽는다).
// ★제5 규약 — 가입 계량기는 하나(`onboarding.contrib` — `membership.publicState` 가 `contribOf` 로 읽는 그 값).
//
// 보내는 때: 열 때 칸 전부(`full:true`) · 열려 있는 동안 **JSON 이 바뀐 칸만**(`full:false`) — 존의 5초 박자(아래 `TICK_MS`) +
//   마을 장부 메시지(납품 · 교환 · 기부 · 꺼내기 …) 직후 한 번. 닫거나 끊기면 표지를 지운다.

const Events = require('./events');
const HutStages = require('./hut-stages');

// ── 뭉뚱그린 재화 — 캐논 §1 의 "카테고리"(food/ore/forage/cooked/fish/meat) + 연장 · 무장(연장 · 무기 · 갑옷 — 시안은 "돌도끼"처럼 그 물건을 쓴다).
//   ⚠목록 하나는 여기뿐이다(하네스도 이것을 읽는다). 정본 목록이 서버에 따로 없어 회부에 올렸다(T1072 ④).
const LUMPED = new Set(['food', 'fish', 'meat', 'cooked_food', 'fruit', 'vegetable', 'mushroom', 'herb', 'ore', 'tool', 'iron_tool', 'bronze_tool', 'weapon', 'armor']);
const isLumped = (r) => r != null && LUMPED.has(String(r));

// ★열려 있는 동안 다시 읽는 박자 — 존의 5초(`zone.js` 바닥 물건 정리 `setInterval(…, 5000)` · 잠든 존 유지보수와 같은 수 · 새 수 0).
const TICK_MS = Math.max(1000, parseInt(process.env.VILLAGE_VIEW_MS || '5000', 10) || 5000);
const SLOTS = ['head', 'me', 'dash', 'requests', 'news', 'projects', 'members', 'store', 'prices', 'gate'];

let H = null;          // { SimVillages, Membership, VillageKin, send, players, jobKo, timer }
const OPEN = new Map();   // 사람 pid → { player, vid, numeraire, seq, last: {칸: JSON} }
const ST = { open: 0, full: 0, delta: 0, deltaSlots: 0, same: 0, far: 0, busySkip: 0, err: 0, buildUs: 0, builds: 0, maxUs: 0, priceReuse: 0 };

function init(h) {
  H = h || null;
  if (H && H.timer !== false) { const t = setInterval(tickAll, TICK_MS); if (t.unref) t.unref(); }
}

const ko = (r) => (Events.koRes ? Events.koRes(r) : r);
const _r = (x, n) => (Number.isFinite(+x) ? +(+x).toFixed(n) : null);

// 다음 겨울 첫날까지(겨울이면 0) — 달력 정본(`calendarOf` 의 철 첫날 · 철 길이)만 따라간다(365 · 90 같은 수 0).
function toWinter(day) {
  let c = Events.calendarOf(day);
  if (c.season === 'winter') return 0;
  let d = day;
  for (let i = 0; i < 4; i++) {
    d = d - c.dayOfSeason + 1 + c.seasonDays;
    c = Events.calendarOf(d);
    if (c.season === 'winter') return d - day;
  }
  return null;
}

// ── 칸 만들기 ─────────────────────────────────────────────────────────────────────────
function _head(src, vil) {
  const day = src.day, c = Events.calendarOf(day);
  const out = { vid: vil.dbId | 0, name: vil.name, day,
    cal: { label: c.label, season: c.season, seasonKo: c.seasonKo, dayOfSeason: c.dayOfSeason, seasonDays: c.seasonDays, year: c.year } };
  if (Number.isFinite(vil.econ.foundedDay)) out.age = day - (vil.econ.foundedDay | 0);
  let ch = null; try { ch = H.VillageKin && H.VillageKin.chiefOf ? H.VillageKin.chiefOf(vil) : null; } catch (e) { ch = null; }
  out.chief = ch ? { name: ch.name || null, npc: !!ch.npc } : null;
  return { slot: out, chiefId: ch ? String(ch.id) : null };
}
function _me(player, vil) {
  let ps = null; try { ps = H.Membership && H.Membership.publicState ? H.Membership.publicState(player, vil) : null; } catch (e) { ps = null; }
  if (!ps) return null;
  return { member: ps.vid != null && (ps.vid | 0) === (vil.dbId | 0), memberVid: ps.vid, contrib: ps.contrib | 0, need: ps.need | 0, left: Math.max(0, (ps.need | 0) - (ps.contrib | 0)), chief: !!ps.chief, offer: ps.offer };
}
// 부탁 — 게시판 줄 그대로. 구하는 품목이 뭉뚱그린 것이면 줄째 빼고 센다(`withheld`).
//   갚는 품목만 뭉뚱그린 것이면(거의 `food` 곡식) 부탁은 싣고 **갚는 칸 · 문장**(`boardLine` = "나무 18 → 곡식 4")만 뺀다(`rewardWithheld`).
function _requests(board) {
  const rows = []; let withheld = 0, rewardWithheld = 0;
  for (const r of board.rows || []) {
    if (isLumped(r.item)) { withheld++; continue; }
    const o = { res: r.item, ko: ko(r.item), item: (r.give && r.give[0]) || null, qty: r.qty, filled: r.filled, remain: r.remain };
    if (r.rewItem && isLumped(r.rewItem)) rewardWithheld++;
    else Object.assign(o, { rewRes: r.rewItem || null, rewKo: r.rewItem ? ko(r.rewItem) : null, rewQty: r.rewQty, line: r.line });
    rows.push(o);
  }
  return { rows, withheld, rewardWithheld };
}
function _news(board, day) {
  const rows = []; let withheld = 0;
  for (const r of board.news || []) {
    if (isLumped(r.item)) { withheld++; continue; }
    rows.push({ line: r.line, type: r.type, day: r.day, heard: r.heard, ago: day - (r.heard | 0), from: r.from || null });
  }
  return { rows, withheld };
}
function _projects(src, vil, chron) {
  const now = [], E = src.E; let withheld = 0;
  const stages = (E && E.hutStageCount) ? E.hutStageCount() : HutStages.HUT_STAGES.length;
  const site = (s2, kind) => {
    const st = s2.stage | 0, o = { kind, stage: st, stages };
    const lab = (HutStages.HUT_STAGES[st] || {}).label; if (lab) o.stageLabel = lab;
    return o;
  };
  if (vil._site) {
    const o = site(vil._site, 'house');
    // 자재 — 집 행위가 켜진 판에서만 집터 장부(`_site.mat`)가 선다(`T400_BUILD_ACT` · econ `houseCrewDay`). 꺼진 판은 econ 이 추상 차감 — 칸 없음.
    if (E && E.T400_BUILD_ACT && E.hutEconStage) {
      const need = E.hutEconStage(vil._site.stage | 0) || {}, mat = vil._site.mat || {};
      o.need = [];
      for (const k of Object.keys(need)) { if (isLumped(k)) { withheld++; continue; } o.need.push({ res: k, ko: ko(k), need: _r(need[k], 2), have: _r(mat[k] || 0, 2) }); }
    }
    now.push(o);
  }
  if (vil._psite) { const o = site(vil._psite, 'phouse'); if (vil._psite.ownerName) o.ownerName = vil._psite.ownerName; now.push(o); }
  for (const c of (src.world && src.world.caravans) || []) {
    if (!c || c._done || c.from !== vil.econ) continue;
    const to = src.nameOfEcon ? src.nameOfEcon(c.to) : null;
    const back = c.state !== 'outbound';
    const o = { kind: 'caravan', state: c.state, to, toDays: Math.max(0, ((back ? c.returnArriveDay : c.arriveDay) | 0) - src.day) };
    const cargo = [];
    const add = (res, n) => { if (!res || !(+n > 0)) return; if (isLumped(res)) { withheld++; return; } cargo.push({ res, ko: ko(res), n: _r(n, 2) }); };
    if (back) { add(c._returningRes, c._returningAmt); add(c._returningRes2, c._returningAmt2); }
    else { add(c.giveRes, c.giveAmt); add(c.giveRes2, c.giveAmt2); }
    o.cargo = cargo;
    now.push(o);
  }
  // 끝낸 일 — 연대기(올해)의 완공(`BUILT`)만. 문장은 장부가 쓴 그대로.
  const done = [];
  if (chron && !chron.err) for (const b of chron.seasons || []) for (const x of b.items || []) if (x.type === 'BUILT') done.push({ line: x.line, day: x.day, ago: src.day - (x.day | 0) });
  done.sort((a, b) => b.day - a.day);
  return { now, done, withheld };
}
function _members(vil, chiefId) {
  const people = [], tally = new Map();
  for (const pid of vil.npcPids || []) {
    const p = H.players && H.players.get(pid);
    if (!p) continue;
    const job = p.simJob || null;
    people.push({ pid, name: p.name || null, job, jobKo: job ? ((H.jobKo && H.jobKo[job]) || null) : null, act: p._lifeAct || '', chief: chiefId != null && String(pid) === chiefId });
    if (job) tally.set(job, (tally.get(job) || 0) + 1);
  }
  const byJob = [...tally].map(([job, n]) => ({ job, ko: (H.jobKo && H.jobKo[job]) || null, n })).sort((a, b) => (b.n - a.n) || (a.job < b.job ? -1 : 1));
  return { n: people.length, byJob, people };
}
function _store(src, vil) {
  const inv = H.SimVillages.playerVillageInventory ? H.SimVillages.playerVillageInventory(vil) : null;
  const L = src.ledger, ema = vil.econ._consEMA || {};
  const rows = []; let withheld = 0;
  for (const g of (inv && inv.groups) || []) for (const it of g.items || []) {
    if (isLumped(it.r)) { withheld++; continue; }
    const det = (L && L.detOf) ? L.detOf(vil.dbId | 0, it.r) : null;
    const e = +ema[it.r] || 0;
    rows.push({ res: it.r, ko: ko(it.r), qty: it.q, daysOf: e > 0 ? _r(it.q / e, 1) : null, short: !!(det && det.short), glut: !!(det && det.glut) });
  }
  const cfg = (L && L.cfg) || Events.CFG;
  return { rows, shortDays: cfg.SHORT_DAYS, glutDays: cfg.GLUT_DAYS, withheld };
}
// ★시세표 입력의 지문 — 거래소 정본(`trade.board`)이 읽는 것: 그날 · 곳간(`v.storage`) · 내 짐(`mine`) · 기준 품목 · 걸린 의뢰의 보상(팔지 않는 품목).
//   열린 동안 다시 읽을 때 지문이 같으면 지난 시세 칸을 그대로 둔다 — 값은 언제나 정본이 낸 그것이다(하루 캐시가 아니다: 곳간이 한 톨만 움직여도 다시 부른다).
//   ⚠지문은 **열린 동안의 다시 읽기**에만 쓴다(열 때 · 기준을 바꿀 때는 늘 정본을 부른다). 정본 한 번이 ⑥ 값의 거의 전부다(`gluttedAt` 이 품목마다 시세를 두 번 낸다).
function pricesKey(src, vil, player, numeraire, board) {
  return src.day + '|' + JSON.stringify(vil.econ.storage || {}) + '|' + JSON.stringify(player.inventory || {}) + '|' + (numeraire || '') + '|'
    + (board.rows || []).map((r) => r.rewItem || '').join(',');
}
function _prices(player, vid, numeraire) {
  const tb = H.SimVillages.villageTradeBoard ? H.SimVillages.villageTradeBoard(vid | 0, player.x, player.y, player.inventory, numeraire) : { err: 'far' };
  if (!tb || tb.err) return { none: 'far' };
  const rows = [], basis = []; let withheld = 0;
  for (const r of tb.rows || []) {
    if (isLumped(r.res)) { withheld++; continue; }
    rows.push({ res: r.res, ko: r.ko, num: r.num, glut: !!r.glut, canGive: !!r.canGive, canTake: !!r.canTake, mine: r.mine | 0 });
    if ((r.mine | 0) > 0 && r.canGive) basis.push({ res: r.res, ko: r.ko, mine: r.mine | 0 });
  }
  // 거래소의 기본 기준은 `food`(뭉뚱그린 재화)다 — 그 기준의 수는 싣지 않고 고르게 한다(고르면 그 기준으로 다시 온다).
  if (isLumped(tb.numeraire)) return { pick: true, basis, withheld };
  return { numeraire: tb.numeraire, numeraireKo: tb.numeraireKo, spread: tb.spread, rows, basis, withheld };
}

// 한 마을 열기 값 — 칸 전부. 게이트 밖이면 `{ far:true, err }`. `memo` = 열린 사람의 지난 시세(`{ key, slot }` · 없으면 늘 정본).
function build(player, vid, numeraire, memo) {
  const V = H && H.SimVillages;
  if (!V || !V.villageViewSrc || !V.villageBoard) return { err: '마을 화면을 열 수 없다' };
  const src = V.villageViewSrc(vid | 0);
  if (!src) return { err: '그런 마을이 없다' };
  const board = V.villageBoard(vid | 0, player.x, player.y);   // ★게이트 = 게시판과 같은 술어(260px)
  if (board.err) return { far: true, err: board.err };
  const vil = src.vil;
  const hd = _head(src, vil);
  const projects = _projects(src, vil, V.villageChronicle ? V.villageChronicle(vid | 0, player.x, player.y) : null);
  const view = {
    head: hd.slot,
    me: _me(player, vil),
    dash: { pop: vil.econ.npcs.length, toWinter: toWinter(src.day), projectsN: projects.now.length },
    requests: _requests(board),
    news: _news(board, src.day),
    projects,
    members: _members(vil, hd.chiefId),
    store: _store(src, vil),
    prices: null,
    gate: { near: true },
  };
  const key = memo ? pricesKey(src, vil, player, numeraire, board) : null;
  if (memo && memo.key === key && memo.slot) { view.prices = memo.slot; ST.priceReuse++; }
  else { view.prices = _prices(player, vid, numeraire); if (memo) { memo.key = key; memo.slot = view.prices; } }
  return { view };
}
function _timed(player, vid, numeraire, memo) {
  const t0 = process.hrtime.bigint();
  let r;
  try { r = build(player, vid, numeraire, memo); } catch (e) { ST.err++; r = { err: '마을 화면을 읽지 못했다' }; }
  const us = Number(process.hrtime.bigint() - t0) / 1e3;
  ST.builds++; ST.buildUs += us; if (us > ST.maxUs) ST.maxUs = us;
  return r;
}
const _pidOf = (p) => String(p.pid != null ? p.pid : p.playerId);

// ── 열기 · 닫기 · 바뀐 칸 ─────────────────────────────────────────────────────────────
function open(player, vid, numeraire) {
  if (!H || !player) return null;
  const memo = {};   // 열 때는 늘 정본을 부른다(빈 지문) — 그 결과가 열린 동안의 첫 지문이 된다
  const r = _timed(player, vid, numeraire, memo);
  if (r.err) { H.send(player.ws, { type: 'notice', text: r.err }); return r; }   // 게시판과 같은 말(마을 화면 이모지 0)
  const prev = OPEN.get(_pidOf(player));
  const o = { player, vid: vid | 0, numeraire: numeraire || undefined, seq: (prev && prev.vid === (vid | 0)) ? prev.seq : 0, last: {}, memo };
  for (const k of SLOTS) o.last[k] = JSON.stringify(r.view[k]);
  o.seq++;
  OPEN.set(_pidOf(player), o);
  ST.open++; ST.full++;
  H.send(player.ws, { type: 'village_view', vid: o.vid, seq: o.seq, full: true, view: r.view });
  return r;
}
function close(player) { if (player) OPEN.delete(_pidOf(player)); }
function isOpen(player) { return !!(player && OPEN.has(_pidOf(player))); }
// 다시 읽어 바뀐 칸만. 반환 = 보낸 칸 이름들(없으면 []).
function refresh(player) {
  const o = player && OPEN.get(_pidOf(player));
  if (!o) return [];
  if (H.players && H.players.get(player.pid) !== player) { OPEN.delete(_pidOf(player)); return []; }   // 끊겼다
  const r = _timed(player, o.vid, o.numeraire, o.memo);
  let next;
  if (r.err && r.far) { ST.far++; o.memo = {}; next = { gate: { near: false }, prices: { none: 'far' } }; }   // 멀리서는 시세 · 문만(나머지는 멈춘다)
  else if (r.err) return [];
  else next = r.view;
  const slots = {}, keys = [];
  for (const k of Object.keys(next)) { const s = JSON.stringify(next[k]); if (o.last[k] !== s) { o.last[k] = s; slots[k] = next[k]; keys.push(k); } }
  if (!keys.length) { ST.same++; return []; }
  o.seq++; ST.delta++; ST.deltaSlots += keys.length;
  H.send(player.ws, { type: 'village_view', vid: o.vid, seq: o.seq, full: false, slots });
  return keys;
}
function poke(player) { if (isOpen(player)) { try { return refresh(player); } catch (e) { ST.err++; } } return []; }
function tickAll() {
  if (!H || !OPEN.size) return;
  if (H.SimVillages && H.SimVillages.villagesBusy && H.SimVillages.villagesBusy()) { ST.busySkip++; return; }   // 장부 마감 중 — 다음 박자에
  for (const o of [...OPEN.values()]) { try { refresh(o.player); } catch (e) { ST.err++; } }
}
function stats() { return Object.assign({ openNow: OPEN.size, avgUs: ST.builds ? +(ST.buildUs / ST.builds).toFixed(1) : 0, tickMs: TICK_MS }, ST); }

module.exports = { init, build, pricesKey, open, close, isOpen, refresh, poke, tickAll, stats, toWinter, LUMPED, isLumped, SLOTS, TICK_MS };
