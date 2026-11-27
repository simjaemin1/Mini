'use strict';
// === 계측/T1483_2026-11-25/t1483-observe.js — 서버 판 곁 관찰기(읽기만 · 세계 무변 · T1477 관찰기 꼴 + 몸 단위 계측) ===
//   쓰는 법: T1483_OBS=<폴더> T1483_ARM=<팔> NODE_OPTIONS="--require <이 파일>" node scripts/server-baseline-check.js --make … --vclock
//   두 곳을 감싼다(인자 · 돌려주는 값 그대로 — 세계 무변 · 제품 코드 손 0):
//     ⓐ econ `tickVillage` — 날이 바뀌는 순간 앞 날을 마을마다 센다(T1477 과 같은 문).
//     ⓑ `villages.npcLifeTick`(주민 결정 한 번) — 직업이 lumberjack · fisher 인 몸이면 **부른 뒤** 몸 칸을 읽는다(읽기만 · 몸에 아무것도 안 쓴다 · 몸 키는 pid 로 제 맵에).
//   몸의 하루(body-day) = 일터로 나섰나(`출근` · 일 낱말) · 일터에 닿았나(나무꾼 44px / 어부 130px = 제품 문턱 그대로 · 낡은 길은 240px) · 벤(낚은) 양(손 통나무 · 어부 `_t312U` 증가) · 곳간에 낸 양(손 감소).
//   못 닿은 까닭(제품엔 까닭 칸이 없다 — 관찰기가 라벨 · 거리 진행으로 가른다. 직접 칸이 없는 것은 "계측 없음"):
//     nopath  나섰으나 처음 거리의 10% 도 못 줄였다(길 없음 · 막힘의 대리)   far  다가갔으나 해 지기 전 못 닿았다(너무 멂의 대리)
//     nosite  그날 현장이 없다(선 그루 없음 · 목록 빔 · 현장 목록 없음)        rest  요양(몸 상함 — 추위 · 굶주림의 결과일 수 있으나 직접 칸 없음)
//     night   취침 · 귀가 라벨뿐(밤)                                          quota 휴식 라벨(그날 몫 채워 퇴근 · 쉼)       other 딴 일 라벨(경작 · 개간 · 제작 …)    idle 라벨 없음 · 기타
//   마을 칸: econ 칸(곳간 · `_consDay` · 땔감충당률 · 추위 · 죽음 · 행복 · 건강) · 나무꾼 0 날의 직업 고르기 표(바깥에서 같은 문을 다시 재는 근사 — `jc_*`).
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const DIR = process.env.T1483_OBS; if (!DIR) return;
const ROOT = path.resolve(path.dirname(A1), '..');
const ARM = process.env.T1483_ARM || 'x', SEED = process.env.T577_SEED;
const OUT = path.join(DIR, `obs-${ARM}-${SEED}.json`);
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const CAL = require(path.join(ROOT, 'server', 'calendar'));
const BIN = 10;
const F = ['vd', 'n', 'lj', 'fi', 'bL', 'oL', 'rL', 'cutL', 'delL', 'd0L', 'd0Ln', 'bF', 'oF', 'rF', 'catF', 'delF', 'd0F', 'd0Fn', 'hookF', 'missF',
  'L_nopath', 'L_far', 'L_nosite', 'L_rest', 'L_night', 'L_quota', 'L_other', 'L_idle', 'F_nopath', 'F_far', 'F_nosite', 'F_rest', 'F_night', 'F_quota', 'F_other', 'F_idle',
  'wood', 'fish', 'consWood', 'fuelShort', 'fuelCov', 'cold', 'dead', 'fdDead', 'happy', 'health', 'trees', 'noLJ', 'jc_noSlot', 'jc_noTree', 'jc_famine', 'jc_other', 'fuelShortNoLJ', 'woodZero'];
const FI = {}; F.forEach((k, i) => { FI[k] = i; });
const zero = () => new Array(F.length).fill(0);
const rec = { seed: +SEED, arm: ARM, F, bin: BIN, lastDay: 0, err: null, maxRss: 0, vb: {}, glob: [], land: {}, kind: {}, jc: { ENV: { T717_FUEL_GATE: process.env.T717_FUEL_GATE || null, T1283: process.env.T1283_WOOD_DEMAND || null, T1148: process.env.T1148_FUEL_JOB || null } }, w5: {}, nobody: 0 };
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
  if (!b) { b = { job, v: vil.name, lab: {}, out: 0, reach: 0, d0: null, dmin: 1e9, none: 0, site: 0, cut: 0, del: 0 }; bodies.set(pid, b); }
  const L = npc._lifeAct || ''; b.lab[L] = (b.lab[L] || 0) + 1;
  if (npc._rest) b.lab['요양'] = (b.lab['요양'] || 0) + 1;
  if (WORKL[L]) b.out = 1;
  let tx = null, ty = null, tol = 0;
  if (job === 'lumberjack') {
    const s = npc._t325Site;
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
  if (pv !== undefined) { const dl = cur - pv; if (dl > 1e-9) b.cut += dl; else if (dl < -1e-9) b.del += -dl; }
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
    let tr = 0; const T = vil._t325Trees && vil._t325Trees.list; if (T) for (const t of T) tr += (t.n | 0); a[FI.trees] += tr; G.trees += tr;
    // 낚시 입질 · 놓침(마을 누계 → 하루 몫)
    const hk = vil._t340Hook || 0, ms = vil._t340Miss || 0, hp = hookPrev.get(vil.name) || [0, 0]; hookPrev.set(vil.name, [hk, ms]);
    a[FI.hookF] += Math.max(0, hk - hp[0]); a[FI.missF] += Math.max(0, ms - hp[1]);
    // 몸
    for (const b of (bv.get(vil.name) || [])) {
      const J = b.job === 'lumberjack' ? 'L' : 'F', cls = classify(b);
      a[FI['b' + J]]++; if (b.out) a[FI['o' + J]]++; if (b.reach) a[FI['r' + J]]++;
      if (J === 'L') { a[FI.cutL] += b.cut; a[FI.delL] += b.del; } else { a[FI.catF] += b.cut; a[FI.delF] += b.del; }
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
  return _t.apply(this, arguments);
};
process.on('exit', () => { if (last > 0) { try { daily(last); } catch (e) {} } write(); });
