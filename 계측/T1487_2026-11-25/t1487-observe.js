'use strict';
// === 계측/T1487_2026-11-25/t1487-observe.js — 서버 판 곁 관찰기(읽기만 · 세계 무변 · T1483 관찰기 + 자리 고르기 깔때기) ===
//   쓰는 법: T1487_OBS=<폴더> T1487_ARM=<팔> NODE_OPTIONS="--require <이 파일>" node scripts/server-baseline-check.js --make … --vclock
//   T1483 몸 계측(sample · daily · vb · glob)을 그대로 두고 더한다(제품 코드 손 0 · 돌려주는 값 그대로):
//     ⓐ 제품 `server/villages.js` 가 적재될 때 소스 끝에 한 덩이를 덧붙여(로드 시 합성 · 파일 무변) 안쪽 함수 `_t561Standing`(서 있는 셀 고르기)
//        · `_t427Site`(현장 고르기) · `_t340Try`(낚시 던지기)를 **부른 뒤 결과를 읽기만 하는 껍질**로 바꾼다. 인자 · 결과 그대로.
//     ⓑ 영토 · 이웃 영토 · 고리(≤R) · 먼 고리(R~2R)의 나무 수를 바깥에서 센다(`t325TreesAtCell` 읽기만 · 제품 캐시 칸 안 씀) — 반사실은 그 수의 산수일 뿐이다.
//     ⓒ 마을 직업 바뀜을 `tickVillage` 앞뒤 직업표로 잡고 그 순간(앞)의 곳간 · 수요 · 땔감 값을 적는다.
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const DIR = process.env.T1487_OBS; if (!DIR) return;
const ROOT = path.resolve(path.dirname(A1), '..');
const ARM = process.env.T1487_ARM || 'x', SEED = process.env.T577_SEED;
const OUT = path.join(DIR, `obs-${ARM}-${SEED}.json`);

// ── ⓐ 소스 덧붙임 걸개 — villages.js 가 적재되기 **전에** 설치한다(--require 라 먼저다)
const Module = require('module');
const SNIP = `
;(function(){ var H = global.__T1487; if (!H) return; try {
  var o1 = _t561Standing; _t561Standing = function(tr, npc, h, first){ var r = o1.apply(this, arguments); try { H.standing(tr, npc, h, first, r); } catch (e) { H.err(e); } return r; };
  var o2 = _t427Site; _t427Site = function(vil, npc, sites, h, day){ var r = o2.apply(this, arguments); try { H.site(vil, npc, sites, h, day, r); } catch (e) { H.err(e); } return r; };
  var o3 = _t340Try; _t340Try = function(vil, npc, now, day, h, ws){ var r = o3.apply(this, arguments); try { H.fishTry(vil, npc, day, r); } catch (e) { H.err(e); } return r; };
  H.int = { radius: _t1259WoodRadius, R: T325_R, SZ: SZ, state: state };
} catch (e) { H.err(e); } })();
`;
const _compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (typeof filename === 'string' && /server[\/\\]villages\.js$/.test(filename)) { arguments[0] = content + '\n' + SNIP; global.__T1487_HOOKED = 1; }
  return _compile.apply(this, arguments);
};
global.__T1487 = {
  standing: (...a) => hStanding(...a), site: (...a) => hSite(...a), fishTry: (...a) => hFish(...a),
  err: (e) => { rec.err = rec.err || ('hook ' + String(e && e.stack || e).slice(0, 300)); }, int: null,
};
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const CAL = require(path.join(ROOT, 'server', 'calendar'));
const BIN = 10;
const F = ['vd', 'n', 'lj', 'fi', 'bL', 'oL', 'rL', 'cutL', 'delL', 'd0L', 'd0Ln', 'bF', 'oF', 'rF', 'catF', 'delF', 'd0F', 'd0Fn', 'hookF', 'missF',
  'L_nopath', 'L_far', 'L_nosite', 'L_rest', 'L_night', 'L_quota', 'L_other', 'L_idle', 'F_nopath', 'F_far', 'F_nosite', 'F_rest', 'F_night', 'F_quota', 'F_other', 'F_idle',
  'wood', 'fish', 'consWood', 'fuelShort', 'fuelCov', 'cold', 'dead', 'fdDead', 'happy', 'health', 'trees', 'noLJ', 'jc_noSlot', 'jc_noTree', 'jc_famine', 'jc_other', 'fuelShortNoLJ', 'woodZero', 'cutLR', 'delLR', 'tripLR', 'dtripLR', 'tripL', 'dtripL', 'L_none', 'L_empty', 'L_nopathN', 'oFR', 'scanV', 'scanC', 'scanN', 'scanK', 'cells0'];
const FI = {}; F.forEach((k, i) => { FI[k] = i; });
const zero = () => new Array(F.length).fill(0);
const rec = { seed: +SEED, arm: ARM, F, bin: BIN, lastDay: 0, err: null, maxRss: 0, vb: {}, glob: [], land: {}, kind: {}, jc: { ENV: { T717_FUEL_GATE: process.env.T717_FUEL_GATE || null, T1283: process.env.T1283_WOOD_DEMAND || null, T1148: process.env.T1148_FUEL_JOB || null } }, w5: {}, nobody: 0, pk: {}, st: {}, stv: {}, fz: {}, univ: {}, cf: {}, sw: [], chk: { ok: 0, bad: 0 }, hooked: 0 };
let last = -1, fishKeys = null, VIL = null, ST = null;
const bodies = new Map(), inv0 = new Map(), vname = new Map();
const hookPrev = new Map();
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fishOf = (st) => { if (!fishKeys) fishKeys = Object.keys(st).filter((k) => k === 'fish' || /^dried_|^pickled_/.test(k)); let t = 0; for (const k of fishKeys) t += +st[k] || 0; return t; };
function vils() { if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages')); return VIL.__labProbe._t569Probe.setup().villages || []; }
const WORKL = { '출근': 1, '벌목': 1, '낚시': 1, '낚음': 1, '드리움': 1, '놓침': 1 };
const OTHERL = { '경작': 1, '개간': 1, '제작': 1, '채광': 1, '수색': 1, '수확': 1, '장마당': 1, '식사': 1, '운반': 1, '저장': 1, '고기 나르는 중': 1, '고기 가지러': 1 };
// ── ⓑ 몸 한 번 읽기(부른 뒤 · 읽기만)
function sample(npc, job) {
  const pid = npc.pid, vil = ST && ST.byDbId && ST.byDbId.get(npc.simVillageId); if (!vil) return;
  let b = bodies.get(pid);
  if (!b) { b = { job, v: vil.name, lab: {}, out: 0, reach: 0, d0: null, dmin: 1e9, none: 0, site: 0, cut: 0, del: 0, cn: 0, dn: 0, empty: 0 }; bodies.set(pid, b); }
  const L = npc._lifeAct || ''; b.lab[L] = (b.lab[L] || 0) + 1;
  if (npc._rest) b.lab['요양'] = (b.lab['요양'] || 0) + 1;
  if (WORKL[L]) b.out = 1;
  let tx = null, ty = null, tol = 0;
  if (job === 'lumberjack') {
    const s = npc._t325Site;
    try { const T = vil._t325Trees; if (T && T.day === last && T.list && T.list.length === 0 && !(s && s.x != null)) b.empty = 1; } catch (e) {}
    if (s && s.none) b.none = 1;
    else if (s && s.x != null) { tx = s.x; ty = s.y; tol = 44; }
    else if (npc._workSite && npc._workSite.x != null) { tx = npc._workSite.x; ty = npc._workSite.y; tol = 240; }
  } else if (npc._workSite && npc._workSite.x != null) { tx = npc._workSite.x; ty = npc._workSite.y; tol = 130; }
  if (tx != null) {
    b.site = 1;
    const d = Math.hypot(npc.x - tx, npc.y - ty);
    if (b.d0 === null) b.d0 = d; if (d < b.dmin) b.dmin = d; if (d <= tol) b.reach = 1;
  }
  // 손 — 통나무(손 수) · 생선(`_t312U` 장부값)
  const cur = job === 'lumberjack' ? ((npc.inventory && npc.inventory.wood) || 0) : (npc._t312U || 0);
  const pv = inv0.get(pid); inv0.set(pid, cur);
  if (pv !== undefined) { const dl = cur - pv; if (dl > 1e-9) { b.cut += dl; b.cn++; } else if (dl < -1e-9) { b.del += -dl; b.dn++; } }
}
function classify(b) {
  if (b.reach) return null;
  if (b.out || (b.site && b.d0 !== null && b.dmin < b.d0 - 1)) { const pr = b.d0 > 0 ? (b.d0 - b.dmin) / b.d0 : 0; return pr < 0.1 ? 'nopath' : 'far'; }
  if (b.none) return 'nosite';
  if (b.lab['요양']) return 'rest';
  for (const k in b.lab) if (OTHERL[k]) return 'other';
  if (b.lab['휴식']) return b.site ? 'quota' : 'nosite';
  if (b.lab['취침'] || b.lab['귀가']) return 'night';
  return 'idle';
}
// ── ⓐ 마을 하루 · 전체 하루
function acc(name, day) { const key = name; const m = rec.vb[key] || (rec.vb[key] = {}); const bi = Math.floor((day - 1) / BIN); return m[bi] || (m[bi] = zero()); }
function daily(day) {
  let win = false; try { win = CAL.seasonOf(day) === 'winter'; } catch (e) {}
  const bv = new Map();   // 마을별 몸 모음
  for (const b of bodies.values()) { let a = bv.get(b.v); if (!a) bv.set(b.v, a = []); a.push(b); }
  bodies.clear();
  const G = { day, win: win ? 1 : 0, pop: 0, vills: 0, empty: 0, lj: 0, fi: 0, bL: 0, oL: 0, rL: 0, cutL: 0, delL: 0, bF: 0, oF: 0, rF: 0, catF: 0, delF: 0, noLJ: 0, fuelShort: 0, woodZero: 0, dead: 0, trees: 0,
    consWood: 0, d0L: 0, d0Ln: 0, d0F: 0, d0Fn: 0, why: {}, woodMed: null, fishMed: null, cold: 0, happy: 0, health: 0 };
  const wpp = [], fpp = [], vl = vils();
  for (const vil of vl) {
    const e = vil.econ; if (!e) continue;
    const n = (e.npcs || []).length, c = e.counts || {}, st = e.storage || {};
    if (!rec.land[vil.name]) { const l = e.land || {}; rec.land[vil.name] = { wood: l.wood, water: l.water, fertility: l.fertility, game: l.game, coastal: !!l.coastal }; rec.kind[vil.name] = vil._kindKo || '?'; }
    G.vills++; if (n <= 0) { G.empty++; continue; }
    if (day % 100 === 1) { try { const u = getUniv(vil, day, true); if (u) { (rec.univ[vil.name] || (rec.univ[vil.name] = {}))[day] = u; } } catch (er) { rec.err = rec.err || ('univ ' + String(er && er.stack || er).slice(0, 200)); } }
    const a = acc(vil.name, day), lj = c.lumberjack || 0, fi = c.fisher || 0;
    const fuelS = (e._fuelCov !== undefined && e._fuelCov < 0.999) ? 1 : 0, wood = +st.wood || 0, fish = fishOf(st);
    const dead = e._deadTot || 0, dprev = vname.get(vil.name + '#d') || 0; vname.set(vil.name + '#d', dead);
    const fdead = e._fdDeadTot || 0, fprev = vname.get(vil.name + '#f') || 0; vname.set(vil.name + '#f', fdead);
    const ls = e.lastStats || {};
    a[FI.vd]++; a[FI.n] += n; a[FI.lj] += lj; a[FI.fi] += fi;
    a[FI.wood] += wood; a[FI.fish] += fish; a[FI.fuelShort] += fuelS; a[FI.fuelCov] += (e._fuelCov === undefined ? 1 : e._fuelCov);
    const cd = e._consDay || {}; a[FI.consWood] += +cd.wood || 0; G.consWood += +cd.wood || 0;
    a[FI.cold] += e._coldStress || 0; a[FI.dead] += Math.max(0, dead - dprev); a[FI.fdDead] += Math.max(0, fdead - fprev);
    a[FI.happy] += +ls.happiness || 0; a[FI.health] += +ls.health || 0; G.cold += e._coldStress || 0; G.happy += +ls.happiness || 0; G.health += +ls.health || 0;
    if (wood < 1) { a[FI.woodZero]++; G.woodZero++; }
    G.pop += n; G.lj += lj; G.fi += fi; G.dead += Math.max(0, dead - dprev); G.fuelShort += fuelS; wpp.push(wood / n); fpp.push(fish / n);
    // 숲 남은 그루(켠 팔만 칸이 있다)
    try { const S = vil._t325Trees; if (S && S.list) { a[FI.scanV]++; a[FI.scanC] += S.list.length; a[FI.scanN] += S.N || 0; a[FI.scanK] += S.K || 0; } if (e._t325Cells === 0) a[FI.cells0]++; } catch (er) {}
    let tr = 0; const T = vil._t325Trees && vil._t325Trees.list; if (T) for (const t of T) tr += (t.n | 0); a[FI.trees] += tr; G.trees += tr;
    // 낚시 입질 · 놓침(마을 누계 → 하루 몫)
    const hk = vil._t340Hook || 0, ms = vil._t340Miss || 0, hp = hookPrev.get(vil.name) || [0, 0]; hookPrev.set(vil.name, [hk, ms]);
    a[FI.hookF] += Math.max(0, hk - hp[0]); a[FI.missF] += Math.max(0, ms - hp[1]);
    // 몸
    for (const b of (bv.get(vil.name) || [])) {
      const J = b.job === 'lumberjack' ? 'L' : 'F', cls = classify(b);
      a[FI['b' + J]]++; if (b.out) a[FI['o' + J]]++; if (b.reach) a[FI['r' + J]]++;
      if (J === 'L') { a[FI.cutL] += b.cut; a[FI.delL] += b.del; a[FI.tripL] += b.cn; a[FI.dtripL] += b.dn; if (b.reach) { a[FI.cutLR] += b.cut; a[FI.delLR] += b.del; a[FI.tripLR] += b.cn; a[FI.dtripLR] += b.dn; } if (b.none) a[FI.L_none]++; if (b.empty) a[FI.L_empty]++; if (!b.reach && (b.none || b.empty)) cfBody(vil, day); } else { a[FI.catF] += b.cut; a[FI.delF] += b.del; }
      if (b.d0 !== null) { a[FI['d0' + J]] += b.d0; a[FI['d0' + J + 'n']]++; }
      if (cls) { a[FI[J + '_' + cls]]++; }
      if (J === 'L') { G.bL++; if (b.out) G.oL++; if (b.reach) G.rL++; G.cutL += b.cut; G.delL += b.del; if (b.d0 !== null) { G.d0L += b.d0; G.d0Ln++; } if (cls) G.why['L_' + cls] = (G.why['L_' + cls] || 0) + 1; }
      else { G.bF++; if (b.out) G.oF++; if (b.reach) G.rF++; G.catF += b.cut; G.delF += b.del; if (b.d0 !== null) { G.d0F += b.d0; G.d0Fn++; } if (cls) G.why['F_' + cls] = (G.why['F_' + cls] || 0) + 1; }
    }
    // 땔감 모자란 날 + 나무꾼 0 날 — 직업 고르기 표(바깥 재계산 근사)
    if (lj === 0) {
      a[FI.noLJ]++; G.noLJ++; if (fuelS) a[FI.fuelShortNoLJ]++;
      let cap = null; try { cap = V1.jobCapacity(e); } catch (er) {}
      const slot = cap ? (cap.lumberjack || 0) : null, cells = e._t325Cells;
      let fe = null; try { fe = V1.totalFoodEquivalent(e); } catch (er) {}
      let why;
      if (slot !== null && !(slot > 0)) why = 'noSlot';
      else if (cells === 0) why = 'noTree';
      else if (fe !== null && fe < n * 30) why = 'famine';
      else why = 'other';
      a[FI['jc_' + why]]++; G.why['jc_' + why] = (G.why['jc_' + why] || 0) + 1;
    }
  }
  G.woodMed = med(wpp); G.fishMed = med(fpp);
  G.woodLow = wpp.filter((x) => x < 0.1).length; G.fishLow = fpp.filter((x) => x < 0.1).length; G.nv = wpp.length;
  rec.glob.push(G);
  try { rec.maxRss = Math.max(rec.maxRss, process.memoryUsage().rss); } catch (e) {}
}

// ── ⓐ 껍질이 부르는 읽기 함수들(제품 값 무변 · 제 맵 · 제 합계만 쓴다)
const inc = (o, k, n) => { o[k] = (o[k] || 0) + (n === undefined ? 1 : n); };
const PB = 50;   // 깔때기 구간(날)
function pkAcc(tbl, name, day) { const m = tbl[name] || (tbl[name] = {}); const bi = Math.floor((day - 1) / PB); return m[bi] || (m[bi] = {}); }
const lastPick = new Map(), crowd = new Map(), fzSeen = new Set(); let crowdDay = -1, fzDay = -1, RAD = null;
function vilOf(npc) { return ST && ST.byDbId && ST.byDbId.get(npc.simVillageId); }
function hStanding(tr, npc, h, first, r) {
  rec.hooked = 1; const vil = vilOf(npc); if (!vil || last < 1) return; const day = last, a = pkAcc(rec.pk, vil.name, day);
  inc(a, 'calls'); inc(a, 'trL', tr.length); let tt = 0; for (const t of tr) tt += t.n | 0; inc(a, 'trTrees', tt);
  const lp = lastPick.get(npc.pid); if (lp === day) inc(a, 'repick'); lastPick.set(npc.pid, day);
  if (!r) { inc(a, 'none'); inc(a, 'skC', tr.length); inc(a, 'skT', tt); return; }
  const dd = (t) => (t.x - npc.x) * (t.x - npc.x) + (t.y - npc.y) * (t.y - npc.y), dr = dd(r);
  let sc = 0, stt = 0; for (const t of tr) if (t !== r && dd(t) < dr) { sc++; stt += t.n | 0; }
  if (r !== first) inc(a, 'firstEmpty'); inc(a, 'skC', sc); inc(a, 'skT', stt);
  const d = Math.sqrt(dr); inc(a, 'dist' + (d < 500 ? 0 : d < 1000 ? 1 : d < 2000 ? 2 : d < 4000 ? 3 : 4)); inc(a, 'distSum', d);
  if (RAD === null) { try { RAD = global.__T1487.int.radius(); } catch (e) { RAD = -1; } rec.radius = RAD; }
  if (RAD > 0 && d > RAD) inc(a, 'beyondR');
  if (crowdDay !== day) { crowd.clear(); crowdDay = day; }
  const k = vil.name + '|' + r.cx + ',' + r.cy, c = (crowd.get(k) || 0) + 1; crowd.set(k, c); if (c === 1) inc(a, 'cells'); else inc(a, 'joined'); if (c > (a.crowdMax || 0)) a.crowdMax = c;
}
function hSite(vil, npc, sites, h, day, r) {
  rec.hooked = 1; const job = npc.simJob || '?'; if (last < 1) return; const a = pkAcc(rec.st, job, last), n = sites.length;
  inc(a, 'calls'); inc(a, 'ns', n); if (n === 0) inc(a, 'n0');
  if (r === null) { inc(a, 'pend'); return; }
  let idx = -1; for (let i = 0; i < n; i++) { const s = sites[(h + i) % n]; if (s.x === r.x && s.y === r.y) { idx = i; break; } }
  if (idx < 0) { inc(a, 'home'); if (n > 0) inc(a, 'homeWithSites'); } else { inc(a, 'skip', idx); if (idx > 0) inc(a, 'skipped'); const d = Math.hypot(npc.x - r.x, npc.y - r.y); inc(a, 'dSum', d); inc(a, 'dN'); }
  const v = vil || vilOf(npc); if (v) { const m = (rec.stv[job] || (rec.stv[job] = {})); const z = m[v.name] || (m[v.name] = {}); inc(z, 'calls'); if (n === 0) inc(z, 'n0'); if (idx < 0) inc(z, 'home'); }
}
function hFish(vil, npc, day, r) {
  rec.hooked = 1; if (last < 1) return; const res = r === 'none' ? 'none' : r === 'wait' ? 'wait' : r === 'miss' ? 'miss' : r && typeof r === 'object' ? 'hook' : 'other';
  const a = pkAcc(rec.fz, 'ALL', last); inc(a, 'c_' + res);
  const v = vil || vilOf(npc); if (v) { const z = pkAcc(rec.fz, v.name, last); inc(z, 'c_' + res); }
  if (fzDay !== last) { fzSeen.clear(); fzDay = last; }
  const k = npc.pid + '|' + res; if (!fzSeen.has(k)) { fzSeen.add(k); inc(a, 'bd_' + res); }
}
// ── ⓑ 나무 우주(영토 · 이웃 · 고리 · 먼 고리) — 바깥에서 센다(제품 캐시 칸 안 씀)
const ucache = new Map(), nbox = new Map();
function boxOf(v) { const own = v._terrSet, n = own ? own.size : 0, c = nbox.get(v.name); if (c && c.n === n) return c; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; if (own) for (const k of own) { const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } const b = { n, x0, y0, x1, y1 }; nbox.set(v.name, b); return b; }
function dil(g, W, H, R) {
  const h = new Uint8Array(W * H), d = new Uint8Array(W * H), rp = new Int32Array(W + 1), cp = new Int32Array(H + 1);
  for (let y = 0; y < H; y++) { const row = y * W; for (let x = 0; x < W; x++) rp[x + 1] = rp[x] + g[row + x]; for (let x = 0; x < W; x++) h[row + x] = (rp[Math.min(W, x + R + 1)] - rp[Math.max(0, x - R)]) > 0 ? 1 : 0; }
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) cp[y + 1] = cp[y] + h[y * W + x]; for (let y = 0; y < H; y++) d[y * W + x] = (cp[Math.min(H, y + R + 1)] - cp[Math.max(0, y - R)]) > 0 ? 1 : 0; }
  return d;
}
function getUniv(vil, day, force) {
  const c = ucache.get(vil.name); if (c && !force && day - c.day < 30) return c.u;
  if (!ST || !ST.deps || typeof ST.deps.t325TreesAtCell !== 'function') return null;
  const R = 16, own = vil._terrSet, noTerr = !own || !own.size, b = noTerr ? { x0: vil.ccx, y0: vil.ccy, x1: vil.ccx, y1: vil.ccy } : boxOf(vil);
  const bx0 = b.x0 - 2 * R, by0 = b.y0 - 2 * R, W = b.x1 - b.x0 + 1 + 4 * R, H = b.y1 - b.y0 + 1 + 4 * R, g = new Uint8Array(W * H), src = new Uint8Array(W * H);
  if (noTerr) src[(vil.ccy - by0) * W + (vil.ccx - bx0)] = 1; else for (const k of own) { const ci = k.indexOf(','), i = (+k.slice(ci + 1) - by0) * W + (+k.slice(0, ci) - bx0); g[i] = 1; src[i] = 1; }
  const d1 = dil(src, W, H, R), d2 = dil(src, W, H, 2 * R), nbs = [];
  for (const v of (ST.villages || [])) { if (v === vil || !v._terrSet || !v._terrSet.size) continue; const o = boxOf(v); if (o.x1 < bx0 || o.x0 > bx0 + W - 1 || o.y1 < by0 || o.y0 > by0 + H - 1) continue; nbs.push(v._terrSet); }
  const u = { own: { c: 0, t: 0, n: 0 }, nbR: { c: 0, t: 0, n: 0 }, nb2: { c: 0, t: 0, n: 0 }, ring: { c: 0, t: 0, n: 0 }, far: { c: 0, t: 0, n: 0 }, noTerr: noTerr ? 1 : 0, day };
  const dp = ST.deps;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, cx = bx0 + x, cy = by0 + y; if (!d2[i] && !g[i]) continue; if (cx < 0 || cy < 0) continue;
    let cls;
    if (g[i]) cls = u.own; else { let nb = false; if (nbs.length) { const k = cx + ',' + cy; for (const sset of nbs) if (sset.has(k)) { nb = true; break; } } cls = nb ? (d1[i] ? u.nbR : u.nb2) : (d1[i] ? u.ring : u.far); }
    cls.n++; let a = null; try { a = dp.t325TreesAtCell(cx, cy); } catch (e) { a = null; } if (a && a.length) { cls.c++; cls.t += a.length; }
  }
  ucache.set(vil.name, { day, u });
  try { const T = vil._t325Trees; if (T && T.day === day && T.list) { if (T.list.length === u.ring.c) rec.chk.ok++; else rec.chk.bad++; } } catch (e) {}
  return u;
}
function cfBody(vil, day) {
  const u = getUniv(vil, day); if (!u) return; const a = pkAcc(rec.cf, vil.name, day);
  inc(a, 'ev'); const o = u.own.c > 0, nb = u.nbR.c > 0, fr = u.far.c > 0, nb2 = u.nb2.c > 0;
  if (o) inc(a, 'own'); if (nb) inc(a, 'nb'); if (fr) inc(a, 'far'); if (nb2) inc(a, 'nb2'); if (o || nb) inc(a, 'terr'); if (o || nb || fr) inc(a, 'any'); if (u.ring.c > 0) inc(a, 'ringHas');
  if (u.own.c + u.nbR.c + u.far.c + u.ring.c === 0) inc(a, 'noTreeAll');
}
// ── ⓒ 직업 바뀜 — tickVillage 앞 직업표 · 앞 값
function jobSnap(v) {
  const m = new Map(); for (const n of v.npcs || []) m.set(n.id, n.currentJob);
  const N = (v.npcs || []).length, st = v.storage || {}; let w = null, c = null, fe = null, cap = null;
  try { w = V1.t1283Wood(v); } catch (e) {} try { c = V1.t1148Cold(v); } catch (e) {} try { fe = V1.totalFoodEquivalent(v); } catch (e) {} try { cap = V1.jobCapacity(v); } catch (e) {}
  return { m, ctx: { N, wood: +st.wood || 0, cov: v._fuelCov === undefined ? null : v._fuelCov, short: w ? w.short : null, need: w ? w.need : null, perLJ: w ? w.perLJ : null, cold: c && typeof c === 'object' ? (c.debt != null ? c.debt : null) : c, fe, famine: fe != null ? (fe < N * 30 ? 1 : 0) : null, slot: cap ? cap.lumberjack : null, cells: v._t325Cells === undefined ? null : v._t325Cells, lj: (v.counts && v.counts.lumberjack) || 0, fe6: fe != null ? (fe > N * 6 ? 1 : 0) : null } };
}
function jobDiff(v, day, pre) {
  for (const n of v.npcs || []) { const p = pre.m.get(n.id); if (p === undefined || p === n.currentJob) continue; if (p !== 'lumberjack' && n.currentJob !== 'lumberjack' && p !== 'fisher' && n.currentJob !== 'fisher') continue; if (rec.sw.length < 20000) rec.sw.push(Object.assign({ d: day, v: v.name, f: p, t: n.currentJob }, pre.ctx)); }
}
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
let wrapped = false;
function wrapLife() {
  if (wrapped) return; wrapped = true;
  try {
    VIL = require(path.join(ROOT, 'server', 'villages')); ST = VIL.__t1461 && VIL.__t1461.st();
    const orig = VIL.npcLifeTick; if (typeof orig !== 'function') { rec.err = 'npcLifeTick 없음'; return; }
    VIL.npcLifeTick = function (npc, now) {
      const r = orig.apply(this, arguments);
      try { const j = npc && npc.simJob; if (j === 'lumberjack' || j === 'fisher') sample(npc, j); } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 300); }
      return r;
    };
  } catch (e) { rec.err = rec.err || ('wrapLife ' + String(e && e.stack || e).slice(0, 300)); }
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  wrapLife();
  if (day !== last) {
    if (last > 0) { try { daily(last); } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); } if (last % 100 === 0 || last === 365) write(); }
    last = day; rec.lastDay = day;
  }
  let pre = null; try { pre = jobSnap(v); } catch (e) {}
  const rr = _t.apply(this, arguments);
  try { if (pre) jobDiff(v, day, pre); } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 300); }
  return rr;
};
process.on('exit', () => { if (last > 0) { try { daily(last); } catch (e) {} } write(); });
