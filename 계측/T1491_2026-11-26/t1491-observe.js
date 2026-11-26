'use strict';
// === 계측/T1491_2026-11-26/t1491-observe.js — 서버 판 곁 관찰기(T1491 · 제품 코드 손 0) ===
//   쓰는 법: T1491_OBS=<폴더> T1491_ARM=<팔> T1491_SKIP=<0|gate|all> NODE_OPTIONS="--require <이 파일>" node scripts/server-baseline-check.js --make … --vclock
//   T1491_SKIP
//     0    = 아무 문도 안 건너뛴다(읽기만 · 기본 판과 지문이 같아야 한다 — 무변 판)
//     gate = 몸 틱 안 나무꾼의 몫 문(`_t374Done` 참)만 거짓으로 돌려준다(건너뜀을 센다)
//     all  = gate + 일괄 자물쇠: 하루 경계 일괄 벌목(`_lifeDailySteps`)의 `t325CutTreeAt` 을 부르지 않고 null 을 돌려준다
//            (일괄은 제 줄 `noloot++ ; break` 로 그날 멈춘다 · 건너뜀을 센다) — 그날 수요를 몸에게 남긴다
//   건너뛰는 것은 위 둘뿐이다. 나머지 껍질은 모두 "부른 뒤 읽기만"이다(인자 · 돌려주는 값 그대로).
//   ⓐ 소스 덧붙임(로드 시 합성 · 파일 무변): villages.js 끝에 `_t374Done` · `_lifeGoHome` · `_t561Standing` · `_t325Deliver` · `_lifeJobSites` 껍질,
//      zone 본 파일 끝에 `computeNpcPath` · `_t678Init`(문 그래프 route 답) · `_npcGatherResource` · `npcStep`(걸음 틱마다 자리 · 현장 거리) 껍질과 지형 술어 내보내기.
//   ★닿음은 걸음 틱(`npcStep`)으로 잰다 — 생활 틱(`npcLifeTick`)은 결정 거름(T1322~T1399) 뒤라 몸-날마다 한두 번뿐이다(T1487 의 닿음 · 길없음 자는 생활 틱 표본이었다).
//   ⓑ `server/pathfind` 의 findPath 를 존이 읽기 전에 껍질로 바꾼다(존 안 A* 부름만 센다 · 답 그대로).
//   ⓒ 길 없음 첫 번(몸-날마다)에만 곁 탐침: 직선 위 칸(바위 · 물 · 도랑 · 남의 땅) · 예산 없는 A*(`maxCells` 무한 · 같은 반경 · 같은 두 술어)
//      — 탐침이 지형 계수기(`_walk`)를 건드리므로 앞뒤로 숫자 칸을 되돌린다.
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const DIR = process.env.T1491_OBS; if (!DIR) return;
const ROOT = path.resolve(path.dirname(A1), '..');
const ARM = process.env.T1491_ARM || 'x', SEED = process.env.T577_SEED, SKIP = process.env.T1491_SKIP || '0';
const SKIP_GATE = SKIP === 'gate' || SKIP === 'all', SKIP_BATCH = SKIP === 'all';
const PROBE_CAP = +(process.env.T1491_PROBE_CAP || 60);   // 예산 없는 A* 탐침 하루 상한(판 시간 지킴)
const OUT = path.join(DIR, `obs-${ARM}-${SEED}.json`);
const Module = require('module');
const SNIP_V = `
;(function(){ var H = global.__T1491; if (!H) return; try {
  var o1 = _t374Done; _t374Done = function(vil, job){ var r = o1.apply(this, arguments); try { return H.gate(vil, job, r); } catch (e) { H.err(e); return r; } };
  var o2 = _lifeGoHome; _lifeGoHome = function(npc, act){ try { H.home(npc, act); } catch (e) { H.err(e); } return o2.apply(this, arguments); };
  var o3 = _t561Standing; _t561Standing = function(tr, npc, h, first){ var r = o3.apply(this, arguments); try { H.standing(npc, r); } catch (e) { H.err(e); } return r; };
  var o4 = _t325Deliver; _t325Deliver = function(vil, npc){ var u = (npc && npc.inventory && npc.inventory.wood) || 0, l = (npc && npc._t717L) || 0; H.inDel++; var r; try { r = o4.apply(this, arguments); } finally { H.inDel--; } try { H.deliver(vil, npc, u, l, r); } catch (e) { H.err(e); } return r; };
  var o5 = _lifeJobSites; _lifeJobSites = function(vil, day){ var r = o5.apply(this, arguments); try { H.sites(vil, r); } catch (e) { H.err(e); } return r; };
  H.vint = { state: state, SZ: SZ, R: T325_R, radius: _t1259WoodRadius,
    fv: function(npc, now){ var w = t1295Wp(npc, now), wpF = state.deps && state.deps.worldPhase; return w != null ? _t720Fv(w, npc.simLonOff || 0) : wpF ? _t720Fv(wpF(now), npc.simLonOff || 0) : 0.35; },
    dayR: function(){ return (state.deps && state.deps.dayPhaseRatio) || 0.7; } };
} catch (e) { H.err(e); } })();
`;
const SNIP_Z = `
;(function(){ var H = global.__T1491; if (!H) return; try {
  var c1 = computeNpcPath; computeNpcPath = function(npc, now){
    if (!H.pathWant(npc)) return c1.apply(this, arguments);
    var la = npc._lastAStarAt; H.pc = { route: null, pf: 0, pfNull: 0, cd: 0 }; H.inCNP = 1; var r;
    try { r = c1.apply(this, arguments); } finally { H.inCNP = 0; }
    try { H.path(npc, now, r, la); } catch (e) { H.err(e); } return r; };
  var c2 = _t678Init; _t678Init = function(){ var G = c2.apply(this, arguments); try { if (G && !G.__t1491) { G.__t1491 = 1; var gr = G.route; G.route = function(){ var r = gr.apply(this, arguments); try { if (H.inCNP && H.pc && r) H.pc.route = r.res; } catch (e) {} return r; }; } } catch (e) { H.err(e); } return G; };
  var c4 = npcStep; npcStep = function(npc, dt, now){ var r = c4.apply(this, arguments); try { if (npc && npc.simVillageId && (npc.simJob === 'lumberjack' || npc.simJob === 'fisher')) H.step(npc, dt, now); } catch (e) { H.err(e); } return r; };
  var c3 = _npcGatherResource; _npcGatherResource = function(npc, r){ var w = (npc && npc.inventory && npc.inventory.wood) || 0; var x = c3.apply(this, arguments); try { H.gather(npc, r, w); } catch (e) { H.err(e); } return x; };
  H.zint = { rock: isRockTileLocal, water: isWaterTileLocal, bridge: isBridgeTileLocal, ditch: isDitchTileLocal, terr: isTerrainBlockedLocal, wall: isBlockedByWall,
    walk: _walk, W: ZONE.zoneWidth, Hh: ZONE.zoneHeight, SZ: BUILDING_SIZE, R: _pfRadius(true) };
} catch (e) { H.err(e); } })();
`;
const _compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (typeof filename === 'string') {
    if (/server[\/\\]villages\.js$/.test(filename)) arguments[0] = content + '\n' + SNIP_V;
    else if (filename === path.resolve(A1)) arguments[0] = content + '\n' + SNIP_Z;
  }
  return _compile.apply(this, arguments);
};
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const CAL = require(path.join(ROOT, 'server', 'calendar'));
const PF = require(path.join(ROOT, 'server', 'pathfind'));
const pfOrig = PF.findPath;
const rec = { seed: +SEED, arm: ARM, skip: SKIP, lastDay: 0, err: null, maxRss: 0, hooked: {},
  agg: {}, bins: {}, vb: {}, glob: [], kind: {}, land: {}, skips: { gate: 0, gateBD: 0, batch: 0, batchVD: 0, gateTrueOther: 0 },
  cut: {}, gran: {}, dup: {}, rep: { n: 0, gapSum: 0 }, dbg: { cut: 0, stop: 0, noloot: 0, vd: 0, on: 0, walked: 0 }, batchHookCut: 0,
  path: {}, probe: {}, night: {}, gate: {}, gather: {}, univ: {}, samp: [], chk: { pfCalls: 0, probes: 0, probeCapHit: 0, walkFix: 0 } };
const H = global.__T1491 = { inDel: 0, inCNP: 0, pc: null, vint: null, zint: null,
  err: (e) => { rec.err = rec.err || ('hook ' + String(e && e.stack || e).slice(0, 300)); } };
PF.findPath = function (sx, sy, ex, ey, opts) {
  const r = pfOrig.apply(this, arguments);
  if (H.inCNP && H.pc) { H.pc.pf++; if (!r) H.pc.pfNull++; const o = opts || {}; H.pc.R = o.searchRadiusCells || 64; H.pc.opt = o; H.pc.sx = sx; H.pc.sy = sy; H.pc.ex = ex; H.pc.ey = ey; }
  return r;
};
const inc = (o, k, n) => { o[k] = (o[k] || 0) + (n === undefined ? 1 : n); };
const WORKL = { '출근': 1, '벌목': 1, '낚시': 1, '낚음': 1, '드리움': 1, '놓침': 1 };
const OTHERL = { '경작': 1, '개간': 1, '제작': 1, '채광': 1, '수색': 1, '수확': 1, '장마당': 1, '식사': 1, '운반': 1, '저장': 1, '고기 나르는 중': 1, '고기 가지러': 1 };
let last = -1, VIL = null, ST = null, CUR = null, winNow = 0;
const bodies = new Map(), inv0 = new Map();
const econCut = new Map();   // econ → { body, batch, … } 그날 곳간 듦(woodToGranary 껍질)
function vils() { if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages')); return VIL.__labProbe._t569Probe.setup().villages || []; }
function vilOf(npc) { return ST && ST.byDbId && ST.byDbId.get(npc.simVillageId); }
function B(npc) {
  let b = bodies.get(npc.pid);
  if (!b) {
    const vil = vilOf(npc); if (!vil) return null;
    b = { pid: npc.pid, J: npc.simJob === 'lumberjack' ? 'L' : 'F', v: vil.name, kind: vil._kindKo || '?', noTerr: (vil._terrSet && vil._terrSet.size) ? 0 : 1,
      tk: 0, dk: 0, nk: 0, fh: new Array(24).fill(0), f0: null, lon: npc.simLonOff || 0, dOff: null, lab: {}, gh: {}, out: 0, outN: 0, site: 0, reach: 0, arr: 0, inR: 0,
      d0: null, dmin: 1e9, none: 0, rf: 0, gate: 0, skip: 0, stN: 0, stNull: 0, trSeen: 0, trMax: -1, cutN: 0, cutU: 0, hup: 0, hdn: 0, hand0: null,
      dlvN: 0, dlvU: 0, dU: 0, dG: 0, dB: 0, dBU: 0, dBG: 0, st: 0, stD: 0, mv: 0, dtS: 0, sd0: null, sdmin: 1e9, reachS: 0, arrS: 0, inRS: 0, outS: 0, outSN: 0, siteS: 0, pn: 0, pok: 0, pbee: 0, pr: {}, pr0: null, probe: null, gH: 0, gL: 0, rest: 0 };
    bodies.set(npc.pid, b);
  }
  return b;
}
// ── 몫 문 껍질(유일한 바꿈 자리 ①)
H.gate = (vil, job, r) => {
  rec.hooked.gate = 1;
  if (!r || job !== 'lumberjack') return r;
  if (!(CUR && CUR.simJob === 'lumberjack')) { rec.skips.gateTrueOther++; return r; }
  const b = B(CUR); if (b) b.gate++;
  if (SKIP_GATE) { rec.skips.gate++; if (b) { if (!b.skip) rec.skips.gateBD++; b.skip++; } return false; }
  return r;
};
H.home = (npc, act) => { rec.hooked.home = 1; if (!(CUR && CUR === npc)) return; const b = B(npc); if (b) inc(b.gh, act || '?'); };
H.standing = (npc, r) => { rec.hooked.standing = 1; if (!(CUR && CUR === npc)) return; const b = B(npc); if (b) { b.stN++; if (!r) b.stNull++; } };
H.sites = (vil, r) => {
  rec.hooked.sites = 1; if (!(CUR && CUR.simJob === 'lumberjack')) return; const b = B(CUR); if (!b) return;
  const n = (r && r.t325Trees && r.t325Trees.length) || 0; b.trSeen++; if (n > b.trMax) b.trMax = n;
};
H.deliver = (vil, npc, u, l, got) => {
  rec.hooked.deliver = 1; if (!npc) return; const g = +got || 0;
  const inT = CUR === npc, b = (npc.simJob === 'lumberjack') ? B(npc) : null;
  const a = rec.gran.deliver || (rec.gran.deliver = {});
  inc(a, inT ? 'nT' : 'nB'); inc(a, inT ? 'uT' : 'uB', u); inc(a, inT ? 'gT' : 'gB', g); if (u > 1e-9 && g < u - 1e-9) { inc(a, 'overN'); inc(a, 'overU', u - g); }
  if (!b) return;
  if (inT) { if (u > 1e-9) { b.dlvN++; b.dU += u; b.dlvU += Math.max(0, u - l); } b.dG += g; }
  else { if (u > 1e-9) { b.dB++; b.dBU += u; } b.dBG += g; }
};
// ── 벌목 · 곳간 껍질(t325CutTreeAt · woodToGranary)
function ctxOf() {
  const L = Error.stackTraceLimit; Error.stackTraceLimit = 60; const s = String(new Error().stack || ''); Error.stackTraceLimit = L;
  if (s.indexOf('_t1207FellCell') >= 0) return 'clear';
  if (s.indexOf('_t1283Haul') >= 0) return 'haul';
  if (s.indexOf('_t1181Step') >= 0) return 't1181';
  if (s.indexOf('_lifeDailySteps') >= 0) return 'batch';   // 발생기 틀 이름 — 몸 틱보다 먼저(일괄이 몸 틱 안에서 돌 수도 있으니)
  if (CUR && s.indexOf('npcLifeTick') >= 0) return 'body';
  return 'other';
}
function granCtx() {
  if (H.inDel) return 'deliver';
  const L = Error.stackTraceLimit; Error.stackTraceLimit = 60; const s = String(new Error().stack || ''); Error.stackTraceLimit = L;
  for (const k of ['_t717PackIn', '_t733PackIn', '_t1207Fell', '_t1283Haul', '_t1181Step', '_lifeDailySteps']) if (s.indexOf(k) >= 0) return k;
  return 'other';
}
const cutSeen = new Map();   // seedKey → [날, 자리]
let cutDay = -1; const daySeen = new Map();
let depsRef = null;
function wrapDeps() {
  const dp = ST && ST.deps; if (!dp || dp === depsRef && dp.t325CutTreeAt && dp.t325CutTreeAt.__t1491) return;
  depsRef = dp;
  const f = dp.t325CutTreeAt; if (typeof f !== 'function' || f.__t1491) return;
  const g = function (cx, cy) {
    let ctx = 'other'; try { ctx = ctxOf(); } catch (e) {}
    if (SKIP_BATCH && ctx === 'batch') { rec.skips.batch++; return null; }   // 일괄 자물쇠 건너뜀(유일한 바꿈 자리 ②)
    let sk = null; try { const pk = dp.t325TreesAtCell ? dp.t325TreesAtCell(cx, cy) : null; sk = pk && pk[0] && pk[0].seedKey || null; } catch (e) {}
    const r = f.apply(this, arguments);
    try {
      const u = (r && +r.wood) || 0, a = rec.cut[ctx] || (rec.cut[ctx] = { n: 0, u: 0, nul: 0 });
      if (!r) { a.nul++; return r; }
      a.n++; a.u += u;
      if (ctx === 'batch') rec.batchHookCut++;
      if (ctx === 'body' && CUR) { const b = B(CUR); if (b) { b.cutN++; b.cutU += u; } }
      if (sk) {
        if (cutDay !== last) { daySeen.clear(); cutDay = last; }
        const p = daySeen.get(sk); if (p) inc(rec.dup, p + '>' + ctx); daySeen.set(sk, ctx);
        const q = cutSeen.get(sk); if (q !== undefined && q !== last) { rec.rep.n++; rec.rep.gapSum += last - q; } cutSeen.set(sk, last);
      }
    } catch (e) { H.err(e); }
    return r;
  };
  g.__t1491 = 1; dp.t325CutTreeAt = g; rec.hooked.cut = 1;
}
const w2g = V1.woodToGranary;
V1.woodToGranary = function (v, units) {
  const r = w2g.apply(this, arguments);
  try {
    const c = granCtx(), a = rec.gran[c] || (rec.gran[c] = { n: 0, u: 0, g: 0 }), u = +units || 0, g = +r || 0;
    a.n++; a.u += u; a.g += g;
    let m = econCut.get(v); if (!m) econCut.set(v, m = {}); inc(m, c + 'U', u); inc(m, c + 'G', g);
  } catch (e) { H.err(e); }
  return r;
};
// ── 줍기(끈 세계 레거시 채집 · 존 `_npcGatherResource`)
H.gather = (npc, r, w0) => {
  rec.hooked.gather = 1; const j = npc && npc.simJob; if (j !== 'lumberjack' && j !== 'fisher') return;
  const a = rec.gather[j] || (rec.gather[j] = {}); inc(a, 'hit'); inc(a, 't_' + (r && r.type || '?'));
  const dw = ((npc.inventory && npc.inventory.wood) || 0) - w0; if (dw > 0) inc(a, 'woodU', dw);
  const b = B(npc); if (b) { b.gH++; if (dw > 0) b.gL += dw; }
};
// ── 길 껍질(computeNpcPath)
H.pathWant = (npc) => !!(npc && npc.simVillageId && (npc.simJob === 'lumberjack' || npc.simJob === 'fisher') && CUR !== undefined && last > 0);
let probeDay = -1, probeN = 0, terrMap = null, terrDay = -1;
function walkSnap() { const w = H.zint.walk, o = {}; for (const k in w) if (typeof w[k] === 'number') o[k] = w[k]; return o; }
function walkRestore(o) { const w = H.zint.walk; for (const k in o) if (w[k] !== o[k]) { w[k] = o[k]; rec.chk.walkFix++; } }
function otherTerr() {
  if (terrMap && terrDay === last) return terrMap;
  terrMap = new Map(); terrDay = last;
  for (const v of (ST && ST.villages) || []) if (v._terrSet) for (const k of v._terrSet) terrMap.set(k, v.name);
  return terrMap;
}
function lineProbe(npc, x0, y0, x1, y1) {
  const Z = H.zint, SZ = Z.SZ, d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / 16)), seen = new Set(), tm = otherTerr(), vil = vilOf(npc);
  const c = { cells: 0, rock: 0, water: 0, ditch: 0, out: 0, bridge: 0, other: 0, own: 0, first: 'none', tgt: 'open' };
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n, cx = Math.floor(x / SZ), cy = Math.floor(y / SZ), k = cx + ',' + cy;
    if (seen.has(k)) continue; seen.add(k); c.cells++;
    const X = cx * SZ + SZ / 2, Y = cy * SZ + SZ / 2; let t = null;
    if (X < 0 || Y < 0 || X >= Z.W || Y >= Z.Hh) t = 'out';
    else if (Z.rock(X, Y)) t = 'rock';
    else if (Z.water(X, Y)) { if (Z.bridge(X, Y)) c.bridge++; else t = 'water'; }
    else if (Z.ditch(X, Y)) t = 'ditch';
    if (t) { c[t]++; if (c.first === 'none') c.first = t; if (i === n) c.tgt = t; }
    const o = tm.get(k); if (o !== undefined) { if (vil && o === vil.name) c.own++; else c.other++; }
  }
  return c;
}
H.path = (npc, now, r, la) => {
  const b = B(npc); if (!b) return;
  if (r) { b.pok++; if (r.length === 1) b.pbee++; return; }
  b.pn++;
  const P = H.pc || {}; let why;
  if (la && npc._lastAStarAt === la) why = 'cool';
  else if (P.route === 'far' || P.route === 'blocked' || P.route === 'unreach') why = 'g_' + P.route;
  else if (P.route === null && !P.pf) why = 'tgt';
  else if (P.route === 'unknown' && !P.pf) why = 'wait';
  else if (P.pf && P.pfNull) {
    const SZ = H.zint.SZ, cd = Math.abs(Math.floor(P.ex / SZ) - Math.floor(P.sx / SZ)) + Math.abs(Math.floor(P.ey / SZ) - Math.floor(P.sy / SZ));
    why = cd > (P.R || 64) ? 'rad' : 'exh';
  } else why = 'other';
  inc(b.pr, why); if (!b.pr0) b.pr0 = why;
  if (b.probe) return;
  // 몸-날 첫 길 없음 — 곁 탐침(읽기만 · 계수기 되돌림)
  const ws = walkSnap();
  try {
    const p = { why, d: Math.hypot(npc.targetX - npc.x, npc.targetY - npc.y), md: 0, line: null, unl: null };
    const SZ = H.zint.SZ; p.md = Math.abs(Math.floor(npc.targetX / SZ) - Math.floor(npc.x / SZ)) + Math.abs(Math.floor(npc.targetY / SZ) - Math.floor(npc.y / SZ));
    p.line = lineProbe(npc, npc.x, npc.y, npc.targetX, npc.targetY);
    if (why === 'exh' || why === 'g_unreach' || why === 'g_blocked' || why === 'wait') {
      if (probeDay !== last) { probeDay = last; probeN = 0; }
      if (probeN < PROBE_CAP && p.md <= H.zint.R) {
        probeN++; rec.chk.probes++;
        const Z = H.zint, q = pfOrig(npc.x, npc.y, npc.targetX, npc.targetY, { floor: npc.floor || 0, isBlockedFn: Z.wall, isWaterFn: Z.terr, maxCells: Infinity, searchRadiusCells: Z.R });
        p.unl = q ? 'found' : 'null';
      } else { p.unl = p.md > H.zint.R ? 'far' : 'cap'; if (p.md <= H.zint.R) rec.chk.probeCapHit++; }
    }
    b.probe = p;
  } catch (e) { H.err(e); } finally { walkRestore(ws); }
};
// ── 걸음 틱 껍질(npcStep) — 자리 · 현장 거리 · 닿음 · 오간 수
const lastPos = new Map();
function siteOf(npc, J) {
  if (J === 'L') { const s = npc._t325Site; if (s && s.x != null && !s.none) return [s.x, s.y, 44]; if (npc._workSite && npc._workSite.x != null) return [npc._workSite.x, npc._workSite.y, 240]; return null; }
  return (npc._workSite && npc._workSite.x != null) ? [npc._workSite.x, npc._workSite.y, 130] : null;
}
H.step = (npc, dt, now) => {
  if (last < 1) return; const b = B(npc); if (!b) return;
  rec.hooked.step = 1; b.st++; b.dtS += +dt || 0;
  let night = false; try { if (H.vint) { const fv = H.vint.fv(npc, now), dOff = npc._dOff === undefined ? 0 : npc._dOff; night = fv >= H.vint.dayR() || fv < dOff; } } catch (e) {}
  if (!night) b.stD++;
  const lp = lastPos.get(npc.pid); if (lp) { const m = Math.hypot(npc.x - lp[0], npc.y - lp[1]); if (m < 400) b.mv += m; } lastPos.set(npc.pid, [npc.x, npc.y]);
  if (WORKL[npc._lifeAct || '']) { b.outS++; if (night) b.outSN++; }
  const st = siteOf(npc, b.J); if (!st) return;
  b.siteS = 1; const d = Math.hypot(npc.x - st[0], npc.y - st[1]);
  if (b.sd0 === null) b.sd0 = d; if (d < b.sdmin) b.sdmin = d;
  if (d <= st[2]) { b.reachS = 1; if (!b.inRS) { b.arrS++; b.inRS = 1; } } else b.inRS = 0;
};
// ── 몸 틱 껍질(npcLifeTick)
function sample(npc, b, fv, dayR) {
  const vil = vilOf(npc); if (!vil) return;
  const L = npc._lifeAct || ''; b.lab[L] = (b.lab[L] || 0) + 1;
  if (npc._rest) b.rest++;
  const dOff = npc._dOff === undefined ? 0 : npc._dOff; if (b.dOff === null && npc._dOff !== undefined) b.dOff = npc._dOff;
  const night = (fv >= dayR || fv < dOff);
  if (night) b.nk++; else b.dk++;
  if (WORKL[L]) { b.out = 1; b.outN++; if (night) b.outNt = (b.outNt || 0) + 1; }
  let tx = null, ty = null, tol = 0;
  if (b.J === 'L') {
    const s = npc._t325Site;
    if (s && s.none) b.none = 1;
    else if (s && s.x != null) { tx = s.x; ty = s.y; tol = 44; }
    else if (npc._workSite && npc._workSite.x != null) { tx = npc._workSite.x; ty = npc._workSite.y; tol = 240; }
  } else if (npc._workSite && npc._workSite.x != null) { tx = npc._workSite.x; ty = npc._workSite.y; tol = 130; }
  if (tx != null) {
    b.site = 1; const d = Math.hypot(npc.x - tx, npc.y - ty);
    if (b.d0 === null) b.d0 = d; if (d < b.dmin) b.dmin = d;
    if (d <= tol) { b.reach = 1; if (!b.inR) { b.arr++; b.inR = 1; } } else b.inR = 0;
  }
  const cur = b.J === 'L' ? ((npc.inventory && npc.inventory.wood) || 0) : (npc._t312U || 0);
  if (b.hand0 === null) b.hand0 = cur;
  const pv = inv0.get(npc.pid); inv0.set(npc.pid, cur);
  if (pv !== undefined) { const dl = cur - pv; if (dl > 1e-9) b.hup += dl; else if (dl < -1e-9) b.hdn += -dl; }
}
let wrapped = false;
function wrapLife() {
  if (wrapped) return; wrapped = true;
  try {
    VIL = require(path.join(ROOT, 'server', 'villages')); ST = VIL.__t1461 && VIL.__t1461.st();
    const orig = VIL.npcLifeTick; if (typeof orig !== 'function') { rec.err = 'npcLifeTick 없음'; return; }
    VIL.npcLifeTick = function (npc, now) {
      const j = npc && npc.simJob;
      if (!(j === 'lumberjack' || j === 'fisher') || last < 1) return orig.apply(this, arguments);
      let fv = null, dayR = 0.7, b = null;
      try { b = B(npc); if (H.vint) { fv = H.vint.fv(npc, now); dayR = H.vint.dayR(); } } catch (e) { H.err(e); }
      const prev = CUR; CUR = npc; let r;
      try { r = orig.apply(this, arguments); } finally { CUR = prev; }
      try {
        if (b) {
          b.tk++; if (r === false) b.rf++;
          if (fv !== null) { b.fh[Math.min(23, Math.max(0, Math.floor(fv * 24)))]++; if (b.f0 === null) b.f0 = fv; }
          sample(npc, b, fv === null ? 0.35 : fv, dayR);
        }
      } catch (e) { H.err(e); }
      return r;
    };
  } catch (e) { rec.err = rec.err || ('wrapLife ' + String(e && e.stack || e).slice(0, 300)); }
}
// ── 나무 우주(T1487 그 셈 · 읽기만) — 숲 없음 갈래를 영토 안 / 이웃 / 먼 고리 / 전무로 나눈다
const ucache = new Map(), nbox = new Map();
function boxOf(v) { const own = v._terrSet, n = own ? own.size : 0, c = nbox.get(v.name); if (c && c.n === n) return c; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; if (own) for (const k of own) { const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } const b = { n, x0, y0, x1, y1 }; nbox.set(v.name, b); return b; }
function dil(g, W, Hh, R) {
  const h = new Uint8Array(W * Hh), d = new Uint8Array(W * Hh), rp = new Int32Array(W + 1), cp = new Int32Array(Hh + 1);
  for (let y = 0; y < Hh; y++) { const row = y * W; for (let x = 0; x < W; x++) rp[x + 1] = rp[x] + g[row + x]; for (let x = 0; x < W; x++) h[row + x] = (rp[Math.min(W, x + R + 1)] - rp[Math.max(0, x - R)]) > 0 ? 1 : 0; }
  for (let x = 0; x < W; x++) { for (let y = 0; y < Hh; y++) cp[y + 1] = cp[y] + h[y * W + x]; for (let y = 0; y < Hh; y++) d[y * W + x] = (cp[Math.min(Hh, y + R + 1)] - cp[Math.max(0, y - R)]) > 0 ? 1 : 0; }
  return d;
}
function getUniv(vil, day) {
  const c = ucache.get(vil.name); if (c && day - c.day < 30) return c.u;
  if (!ST || !ST.deps || typeof ST.deps.t325TreesAtCell !== 'function') return null;
  const R = 16, own = vil._terrSet, noTerr = !own || !own.size, b = noTerr ? { x0: vil.ccx, y0: vil.ccy, x1: vil.ccx, y1: vil.ccy } : boxOf(vil);
  const bx0 = b.x0 - 2 * R, by0 = b.y0 - 2 * R, W = b.x1 - b.x0 + 1 + 4 * R, Hh = b.y1 - b.y0 + 1 + 4 * R, g = new Uint8Array(W * Hh), src = new Uint8Array(W * Hh);
  if (noTerr) src[(vil.ccy - by0) * W + (vil.ccx - bx0)] = 1; else for (const k of own) { const ci = k.indexOf(','), i = (+k.slice(ci + 1) - by0) * W + (+k.slice(0, ci) - bx0); g[i] = 1; src[i] = 1; }
  const d1 = dil(src, W, Hh, R), d2 = dil(src, W, Hh, 2 * R), nbs = [];
  for (const v of (ST.villages || [])) { if (v === vil || !v._terrSet || !v._terrSet.size) continue; const o = boxOf(v); if (o.x1 < bx0 || o.x0 > bx0 + W - 1 || o.y1 < by0 || o.y0 > by0 + Hh - 1) continue; nbs.push(v._terrSet); }
  const u = { own: 0, nbR: 0, nb2: 0, ring: 0, far: 0, noTerr: noTerr ? 1 : 0, day };
  const dp = ST.deps;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, cx = bx0 + x, cy = by0 + y; if (!d2[i] && !g[i]) continue; if (cx < 0 || cy < 0) continue;
    let cls;
    if (g[i]) cls = 'own'; else { let nb = false; if (nbs.length) { const k = cx + ',' + cy; for (const sset of nbs) if (sset.has(k)) { nb = true; break; } } cls = nb ? (d1[i] ? 'nbR' : 'nb2') : (d1[i] ? 'ring' : 'far'); }
    let a = null; try { a = dp.t325TreesAtCell(cx, cy); } catch (e) { a = null; } if (a && a.length) u[cls]++;
  }
  ucache.set(vil.name, { day, u });
  return u;
}
// ── 분류
function cls1487(b) {   // T1487 그 자(견줌용)
  if (b.reach) return null;
  if (b.out || (b.site && b.d0 !== null && b.dmin < b.d0 - 1)) { const pr = b.d0 > 0 ? (b.d0 - b.dmin) / b.d0 : 0; return pr < 0.1 ? 'nopath' : 'far'; }
  if (b.none) return 'nosite';
  if (b.lab['요양']) return 'rest';
  for (const k in b.lab) if (OTHERL[k]) return 'other';
  if (b.lab['휴식']) return b.site ? 'quota' : 'nosite';
  if (b.lab['취침'] || b.lab['귀가']) return 'night';
  return 'idle';
}
function prog(b) { return (b.sd0 !== null && b.sd0 > 0) ? (b.sd0 - b.sdmin) / b.sd0 : 0; }
function cls1491(b) {   // 걸음 틱 자(닿음 = 현장 반경 안 걸음 틱이 하나라도)
  if (b.reach || b.reachS) return null;
  if (b.out || b.outS) return prog(b) < 0.1 ? 'nopath' : 'far';
  if (b.none) return 'nosite';
  if (b.lab['요양']) return 'rest';
  for (const k in b.lab) if (OTHERL[k]) return 'other';
  if (b.lab['휴식']) return (b.site || b.siteS) ? 'quota' : 'nosite';
  if (b.lab['취침'] || b.lab['귀가']) return 'night';
  return 'idle';
}
const PR_ORDER = ['tgt', 'g_unreach', 'g_blocked', 'g_far', 'rad', 'exh', 'wait', 'cool', 'other'];
function topWhy(pr) { let k = null, n = 0; for (const w of PR_ORDER) if ((pr[w] || 0) > n) { n = pr[w]; k = w; } return k; }
function nextGate(b, vil, day) {   // 못 닿은 몸-날의 첫 문(차례가 곧 우선순위)
  if (b.noTerr) return 'noTerr';
  if (b.rest || b.lab['요양'] || b.gh['요양']) return 'rest';
  if (b.dk === 0 && b.stD === 0) return 'nightOnly';
  if (b.gate > 0 && !b.skip) return 'gate';
  if (b.J === 'L' && b.trSeen && b.trMax === 0) {
    let u = null; try { u = vil ? getUniv(vil, day) : null; } catch (e) {}
    if (!u) return 'noForest';
    return u.own > 0 ? 'noForest_own' : (u.nbR > 0 ? 'noForest_nb' : (u.ring > 0 ? 'noForest_ring' : (u.far > 0 || u.nb2 > 0 ? 'noForest_far' : 'noForest_none')));
  }
  if (b.none || b.stNull) return 'none';
  for (const k in b.lab) if (OTHERL[k]) return 'other';
  if (b.out || b.outS || b.site || b.siteS) {
    if (b.pn > 0) return 'path_' + topWhy(b.pr);
    if (b.out || b.outS) return prog(b) >= 0.1 ? 'slow' : 'stuck';
  }
  if (b.gh['휴식']) return 'restHome';
  if (b.rf) return 'legacy';
  return 'idle';
}
function nightSplit(b) {   // T1487 '밤' 칸 몸-날 가르기
  const gh = b.gh;
  if (b.dk === 0) return 'onlyNightTicks';
  if (gh['휴식']) return 'quotaHome';
  if (gh['취침'] && !b.outN) return 'sleepCall';
  return 'other';
}
function aggKey(o, k) { return o[k] || (o[k] = {}); }
function flushBodies(day) {
  const win = winNow ? 1 : 0, bi = Math.floor((day - 1) / 50);
  const bv = new Map(); for (const b of bodies.values()) { let a = bv.get(b.v); if (!a) bv.set(b.v, a = []); a.push(b); }
  bodies.clear();
  const vmap = new Map(); for (const v of vils()) vmap.set(v.name, v);
  for (const [vn, arr] of bv) {
    const vil = vmap.get(vn);
    for (const b of arr) {
      const keys = [b.J + '|' + b.kind + '|' + win, b.J + '|*|*'];
      const A = keys.map((k) => aggKey(rec.agg, k)), Bn = aggKey(rec.bins, b.J + '|' + bi), VV = aggKey(aggKey(rec.vb, vn), b.J + '|' + bi);
      const put = (k, n) => { for (const a of A) inc(a, k, n); inc(Bn, k, n); inc(VV, k, n); };
      put('bd'); if (b.out) put('out'); if (b.site) put('site'); if (b.reach) put('reach');
      const RA = b.reach || b.reachS, OA = b.out || b.outS, SA = b.site || b.siteS;
      if (OA) put('outA'); if (SA) put('siteA'); if (RA) put('reachA'); if (b.outS) put('outS'); if (b.siteS) put('siteS'); if (b.reachS) put('reachS');
      put('st', b.st); put('stD', b.stD); put('mv', b.mv); put('dtS', b.dtS); put('arrS', b.arrS); put('outSt', b.outS); put('outStN', b.outSN);
      if (b.st) put('stBDn'); if (b.sd0 !== null) { put('sd0n'); put('sd0', b.sd0); put('sdmin', b.sdmin); }
      if (OA && !RA) { const pg = prog(b); put('pg_' + (pg < 0.1 ? 0 : pg < 0.5 ? 1 : 2)); }
      if (RA) { put('cutUA', b.cutU); put('cutNA', b.cutN); put('dGA', b.dG); put('arrA', b.arrS); }
      const c2 = cls1491(b); if (c2) put('k_' + c2);
      if (b.cutN > 0) put('cut'); put('cutU', b.cutU); put('cutN', b.cutN);
      if (b.reach) { put('cutUR', b.cutU); put('cutNR', b.cutN); }
      if (b.dlvN > 0) put('carry'); put('dlvN', b.dlvN); put('dU', b.dU); put('dlvU', b.dlvU);
      if (b.dG > 1e-9) put('gran'); put('dG', b.dG); put('dB', b.dB); put('dBU', b.dBU); put('dBG', b.dBG); if (b.dBG > 1e-9) put('granB');
      if (b.dG + b.dBG > 1e-9) put('granAny');
      put('arr', b.arr); put('hup', b.hup); put('hdn', b.hdn); put('gH', b.gH); put('gL', b.gL); if (b.gH) put('gHit'); if (b.gL > 0) put('gLoot');
      put('tk', b.tk); put('dk', b.dk); put('nk', b.nk);
      if (b.gate) put('gateBD'); put('gateN', b.gate); if (b.skip) put('skipBD'); put('skipN', b.skip);
      if (b.stN) put('stBD'); if (b.stNull) put('stNullBD'); if (b.trSeen) put('trSeen'); if (b.trSeen && b.trMax === 0) put('tr0');
      if (b.rf) put('rfBD'); if (b.noTerr) put('noTerr');
      if (b.pn) put('pnBD'); put('pn', b.pn); put('pok', b.pok); put('pbee', b.pbee);
      if (b.d0 !== null) { put('d0n'); put('d0', b.d0); }
      const c = cls1487(b); if (c) put('c_' + c);
      if (!RA) { const g = nextGate(b, vil, day); put('g_' + g); }
      if (c === 'nopath') put('np87_' + (b.reachS ? 'reachS' : prog(b) >= 0.1 ? 'moved' : (b.st ? 'still' : 'noStep')));
      if (c === 'nopath') { put('np_' + (b.pn ? topWhy(b.pr) : (b.pok ? 'pathOk' : 'noAsk'))); if (b.probe) put('npP_' + b.probe.line.first); }
      for (const w in b.pr) put('pr_' + w, b.pr[w]);
      if (b.pr0) put('pr0_' + b.pr0);
      // 길 탐침 모음(직선 거리 · 막은 것)
      if (b.probe) {
        const p = b.probe, P = aggKey(rec.probe, b.J + '|' + (c || 'reach'));
        inc(P, 'n'); inc(P, 'd', p.d); inc(P, 'md', p.md); inc(P, 'why_' + p.why); inc(P, 'first_' + p.line.first); inc(P, 'tgt_' + p.line.tgt);
        inc(P, 'dbin_' + (p.d < 256 ? 0 : p.d < 512 ? 1 : p.d < 1024 ? 2 : p.d < 2048 ? 3 : 4));
        if (p.line.rock) inc(P, 'hasRock'); if (p.line.water) inc(P, 'hasWater'); if (p.line.other) inc(P, 'hasOther'); if (p.line.ditch) inc(P, 'hasDitch'); if (p.line.out) inc(P, 'hasOut'); if (p.line.bridge) inc(P, 'hasBridge');
        if (p.unl) inc(P, 'unl_' + p.why + '_' + p.unl);
        if (p.md > 64) inc(P, 'mdOver');
      }
      // 밤 칸
      if (c === 'night') {
        const N = aggKey(rec.night, b.J + '|' + b.kind), ns = nightSplit(b);
        inc(N, 'n'); inc(N, 's_' + ns); for (let i = 0; i < 24; i++) if (b.fh[i]) inc(N, 'fh' + i, b.fh[i]);
        inc(N, 'st', b.st); inc(N, 'stD', b.stD); if (b.outS) inc(N, 'outS'); if (b.reachS) inc(N, 'reachS'); if (b.stD === 0) inc(N, 'noDayStep');
        if (b.f0 !== null) inc(N, 'f0_' + Math.floor(b.f0 * 24)); inc(N, 'lon_' + Math.round((b.lon || 0) * 24)); inc(N, 'tk', b.tk); inc(N, 'nk', b.nk); inc(N, 'dk', b.dk);
        if (b.outNt) inc(N, 'outNight'); for (const a in b.gh) inc(N, 'gh_' + a, b.gh[a]); for (const l in b.lab) inc(N, 'lab_' + l, b.lab[l]);
      }
      if (b.outNt) put('outNightBD');
      // 결정론 표본(pid 해시)
      if (rec.samp.length < 600 && (day % 7 === 3)) {
        let h = 0; const s = String(b.pid); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        if ((h & 15) === 0) rec.samp.push({ day, J: b.J, v: b.v, kind: b.kind, out: b.out, site: b.site, reach: b.reach, reachS: b.reachS, st: b.st, stD: b.stD, mv: Math.round(b.mv), sd0: b.sd0 === null ? null : Math.round(b.sd0), sdmin: Math.round(b.sdmin), arrS: b.arrS, outS: b.outS, c2: cls1491(b), cutU: +b.cutU.toFixed(3), dU: +b.dU.toFixed(3), dG: +b.dG.toFixed(3), dlvN: b.dlvN, arr: b.arr, gate: b.gate, skip: b.skip, pn: b.pn, pr: b.pr, tk: b.tk, dk: b.dk, d0: b.d0 === null ? null : Math.round(b.d0), dmin: Math.round(b.dmin), c, g: (b.reach || b.reachS) ? null : nextGate(b, vil, day), gh: b.gh, lab: b.lab });
      }
    }
  }
}
const dbgSeen = new WeakSet();
function daily(day) {
  let win = false; try { win = CAL.seasonOf(day) === 'winter'; } catch (e) {} winNow = win;
  flushBodies(day);
  const G = { day, win: win ? 1 : 0, pop: 0, consWood: 0, D: 0, lj: 0, fi: 0, woodSt: 0, fuelShort: 0, vd: 0, gran: {}, dbgCut: 0, dbgStop: 0, dbgNoloot: 0, dbgOn: 0 };
  for (const vil of vils()) {
    const e = vil.econ; if (!e) continue; const n = (e.npcs || []).length; if (n <= 0) continue;
    if (!rec.kind[vil.name]) { rec.kind[vil.name] = vil._kindKo || '?'; const l = e.land || {}; rec.land[vil.name] = { wood: l.wood, water: l.water, coastal: !!l.coastal }; }
    G.vd++; G.pop += n; const cd = e._consDay || {}; G.consWood += +cd.wood || 0;
    let D = 0; try { D = V1.woodShareD(e) || 0; } catch (er) {} G.D += D;
    G.lj += (e.counts && e.counts.lumberjack) || 0; G.fi += (e.counts && e.counts.fisher) || 0; G.woodSt += +(e.storage && e.storage.wood) || 0;
    if (e._fuelCov !== undefined && e._fuelCov < 0.999) G.fuelShort++;
    const m = econCut.get(e); if (m) { for (const k in m) inc(G.gran, k, m[k]); econCut.delete(e); }
    const db = vil._t325Dbg; if (db && !dbgSeen.has(db)) { dbgSeen.add(db); G.dbgCut += db.cut | 0; if (db.stop) G.dbgStop++; G.dbgNoloot += db.noloot | 0; if (db.on) G.dbgOn++; rec.dbg.cut += db.cut | 0; rec.dbg.stop += db.stop ? 1 : 0; rec.dbg.noloot += db.noloot | 0; rec.dbg.vd++; if (db.on) rec.dbg.on++; rec.dbg.walked += db.walked | 0; }
  }
  for (const k in G.gran) G.gran[k] = +G.gran[k].toFixed(4);
  G.consWood = +G.consWood.toFixed(4); G.D = +G.D.toFixed(4); G.woodSt = +G.woodSt.toFixed(2);
  rec.glob.push(G);
  try { rec.maxRss = Math.max(rec.maxRss, process.memoryUsage().rss); } catch (e) {}
}
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  wrapLife();
  try { wrapDeps(); } catch (e) { H.err(e); }
  if (day !== last) {
    if (last > 0) { try { daily(last); } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); } if (last % 100 === 0 || last === 365) write(); }
    last = day; rec.lastDay = day;
  }
  return _t.apply(this, arguments);
};
process.on('exit', () => { if (last > 0) { try { daily(last); } catch (e) {} } write(); });
