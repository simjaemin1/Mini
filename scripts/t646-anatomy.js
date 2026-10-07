#!/usr/bin/env node
// === scripts/t646-anatomy.js — 사람당 비용 다시 해부 · 헛물음 · 길 계수 (T646 · 2026-10-05) ===============================
//
// ⚠계측기다(러너 밖 · `@regress` 없음). **제품 무변** — 탐침은 `git worktree` 사본에만 박는다(T356 문법 · 그 판은 지운다).
//
// ★왜 새 자인가 — T356 자(`t356-tick-anatomy`)는 갈래 여섯 + "그 밖" 이었고 T461 이 그 표에서 **2.2µs 를 못 맞췄다**.
//   이 자는 틱 본문을 **구간 표식의 사슬**로 자른다: 틱 처음부터 끝까지 표식이 차례로 서고, 한 표식에서 다음 표식까지가
//   그 구간의 몫이다 ⇒ **구간 합 = 틱 본문**이 정의로 선다(빠진 몫이 없다 · 빈 몫 = 0). 구간 이름은 zone.js 의 절 머리
//   주석(`// === … ===`) 그대로다. 구간 안의 갈래(결정·생활층·A*·따라가기·걸음)는 함수 바인딩을 감싸 잰다(포함 값 · 겹침은 표에 적는다).
//   ⚠작은 술어는 안 감싼다(T356 §3-ⓓ — 감싸면 인라인이 풀린다). 감싸는 것은 한 사람 한 번짜리 큰 함수 다섯뿐이다.
//   GC 는 `perf_hooks` 로 따로 센다 — GC 는 **어느 구간 안에서든** 일어나므로 구간 몫에 이미 들어 있다(겹침 · 표에 적는다).
// ★헛물음(②): 결정·생활층·따라가기를 부를 때마다 **부르기 전/후 출력**(행동·목표·생활 동작 · 속도)을 견준다 — 같으면 헛물음.
//   같은 답이 끝난 순간의 까닭: ⓐ 도착(옛 목표 48px 안 — `computeNpcPath` 의 `d<48` 그 수) ⓑ 시계(결정 타이머·하루 국면 — 아래 가르기 규칙) ⓒ 바깥(도주·교전·남이 바꾼 경로).
// ★길(③): `computeNpcPath` 부름마다 결과 갈래(가까움·직선·쿨다운·막힘/실패·찾음) · 생활권 안/밖 · 목적지 칸(32px) · 경로를 버린 까닭.
//
// 실행: node scripts/t646-anatomy.js run <conf> <tag> [--probe 0|1]   (conf: cap40 | inf)
//       node scripts/t646-anatomy.js table
//   T646_DIR=/tmp/t646 · T646_TPL=/tmp/t646/tpl/tpl-t100.db · T646_SLICE_S=30 · T646_SLICES=6 · T646_LEAD_S=150
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const DIR = process.env.T646_DIR || '/tmp/t646';
const TPL = process.env.T646_TPL || '/tmp/t646/tpl/tpl-t100.db';
const SLICE_S = parseInt(process.env.T646_SLICE_S || '30', 10), SLICES = parseInt(process.env.T646_SLICES || '6', 10);
const LEAD_S = parseInt(process.env.T646_LEAD_S || '150', 10);
const DAY = 1440000;
const CONF = { cap40: { VILLAGE_NPC_CAP: '40' }, inf: {} };   // 종전 상한 기본(40 · T538 추신3 의 되돌림 값) ↔ 지금 기본(무제한)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
fs.mkdirSync(DIR, { recursive: true });

// ── 탐침 ─────────────────────────────────────────────────────────────────────
const SEGS = [   // [앵커, 그 앞 구간 이름] — 앵커 **앞**에 표식을 박는다 = 앞 구간이 끝난다
  ["  Bandits.onGameTick(now);", 'econ(마을 하루 조각·캐러밴 몸)'],
  ['  // === 14.49-e3-perf5: idle zone skip ===', '일 훅(도적·길·흙·눈)'],
  ['  // === 활성 청크 갱신 (player·observer 위치 기반) ===', 'idle 문'],
  ['  // === Spatial index 재구축 — 모든 nearest-search가 이걸 씀 ===', '청크'],
  ['  // === NPC 행동 결정 (사람 player는 input으로 vx/vy 받지만 NPC는 직접 결정) ===', '공간 색인·입력 시한'],
  ['  stepArrows(dt);', '결정 문(순회)'],
  ['  // === 입력 큐 구동 — 사람: 입력 1개=1스텝(밀린 만큼 따라잡기), NPC: 틱당 1스텝 ===', '화살·걸음 커널 준비'],
  ['  // === Phase 14.49-e: PZ식 다단 계단 — 3 cell 점유 + step별 z + walk-off로 floor 전환 ===', '이동 문(순회)'],
  ['  // === Mob AI ===', '계단·낙하·게이지·HP'],
  ['  // === AOI 필터링: per-viewer tick ===', '몹 AI'],
  ['  _fishPoll(now);', '델타·방송(AOI)'],
  ["  { const _h = process.hrtime(_tickHr0); _tickMs.ring[", '꼬리(어로·저장·쓰러짐·계측)'],
];
const HEAD_ANCHOR = '  const _tickHr0 = process.hrtime();';
const TAIL = `
// ── [T646 탐침 · 계측기가 박았다 · 제품엔 없다] ──────────────────────────────
var _A6;
function _A6reset() {
  _A6 = Object.assign(_A6 || {}, { probe: 0, n: 0, tot: 0, seg: {}, sub: {}, subN: {}, popN: 0,
    hq: { dec: { n: 0, same: 0, gated: 0, msSame: 0, msDiff: 0, cause: { a: 0, b: 0, c: 0 } }, life: { n: 0, same: 0, msSame: 0, msDiff: 0, cause: { a: 0, b: 0, c: 0 } }, follow: { n: 0, same: 0, msSame: 0, msDiff: 0, cause: { a: 0, b: 0, c: 0 } } },
    runs: { dec: {}, life: {}, follow: {} },
    ast: { near: [0, 0], beeline: [0, 0], straight: [0, 0], cooldown: [0, 0], fail: [0, 0], found: [0, 0], inside: 0, outside: 0, outLab: {}, why: {}, walked: {} } });
}
_A6reset();
const _A6pf = require('perf_hooks').performance; const _a6t = () => _A6pf.now();
let _A6cur = 0, _A6prev = 0, _A6t0 = 0;
const _A6EVERY = parseInt(process.env.T646_EVERY || '900', 10);
const _A6CNT = process.env.T646_COUNT !== '0';   // 끔 = 시계만(헛물음·길 장부 0 — ① 해부 팔 · 장부가 npcStep 안에 얹히는 몫을 뺀다)
const _A6OUT = process.env.T646_PATH_OUT || '';
const _A6dest = new Map();   // '마을|날' → Map(칸 → Set(pid))
let _A6vil = null, _A6vilAt = 0;
function _A6start() { _A6t0 = _A6prev = _a6t(); }
function _A6m(k) { const t = _a6t(); _A6.seg[k] = (_A6.seg[k] || 0) + (t - _A6prev); _A6prev = t; }
function _A6end() {
  const t = _a6t(); _A6.tot += t - _A6t0; _A6.n++; _A6.popN += npcs.size;
  if (_A6.n >= _A6EVERY) {
    try { console.log('[T646] ' + JSON.stringify(Object.assign({ phase: +worldPhase(Date.now()).toFixed(4) }, _A6))); } catch (e) {}
    if (_A6OUT) { try { const o = {}; for (const [k, m] of _A6dest) { const a = []; for (const [c, s] of m) a.push(s.size); o[k] = a; } require('fs').writeFileSync(_A6OUT, JSON.stringify(o)); } catch (e) {} }
    _A6reset();
  }
}
function _A6sub(k, ms) { _A6.sub[k] = (_A6.sub[k] || 0) + ms; _A6.subN[k] = (_A6.subN[k] || 0) + 1; }
function _A6run(br, npc, same, cause) {
  const f = '_a6r_' + br;
  if (same) { npc[f] = (npc[f] || 0) + 1; return; }
  const L = npc[f] || 0; npc[f] = 0;
  if (L > 0) { const R = _A6.runs[br]; R[L] = (R[L] || 0) + 1; }
  _A6.hq[br].cause[cause]++;
}
const _A6near = (npc, tx, ty) => typeof tx === 'number' && Math.hypot(npc.x - tx, npc.y - ty) < 48;   // computeNpcPath 의 d<48 그 수
if (process.env.T646_SEGONLY !== '1') {   // [T670] 구간 팔은 갈래를 안 감싼다
// 결정 — 문자열을 짓지 않는다(필드 넷을 그대로 견준다 · 탐침 몫을 줄이고 그 몫을 따로 잰다 \`probe\`)
{ const f0 = decideNpcBehavior;
  decideNpcBehavior = function (npc, now) {
    if (!_A6CNT) { const s = _a6t(); f0(npc, now); _A6sub('dec', _a6t() - s); return; }
    const so = _a6t();
    const gated = !npc.canadiaVillage && now < npc.nextDecisionAt;
    const b0 = npc.behavior, tx = npc.targetX, ty = npc.targetY, g0 = npc.gatherTarget;
    const s = _a6t(); f0(npc, now); const e = _a6t(); const d = e - s;
    _A6sub('dec', d);
    const same = b0 === npc.behavior && tx === npc.targetX && ty === npc.targetY && g0 === npc.gatherTarget, H = _A6.hq.dec;
    H.n++; if (gated) H.gated++; if (same) { H.same++; H.msSame += d; } else H.msDiff += d;
    _A6run('dec', npc, same, (npc.behavior === 'flee' || npc.behavior === 'fight') ? 'c' : (_A6near(npc, tx, ty) ? 'a' : 'b'));
    const eo = _a6t(); _A6.probe = (_A6.probe || 0) + (s - so) + (eo - e);
  }; }
// 생활층(결정 안에서 불린다 — 포함 관계는 표에 적는다)
if (SimVillages.npcLifeTick) { const f0 = SimVillages.npcLifeTick;
  SimVillages.npcLifeTick = function (npc, now) {
    if (!_A6CNT) { const s = _a6t(); const r = f0.apply(this, arguments); _A6sub('life', _a6t() - s); return r; }
    const so = _a6t();
    const tx = npc.targetX, ty = npc.targetY, r0 = npc._a6lr, b0 = npc.behavior, a0 = npc._lifeAct;
    const s = _a6t(); const r = f0.apply(this, arguments); const e = _a6t(); const d = e - s;
    _A6sub('life', d);
    npc._a6lr = !!r;
    const same = r0 === npc._a6lr && b0 === npc.behavior && tx === npc.targetX && ty === npc.targetY && a0 === npc._lifeAct, H = _A6.hq.life;
    H.n++; if (same) { H.same++; H.msSame += d; } else H.msDiff += d;
    _A6run('life', npc, same, (npc.behavior === 'flee' || npc.behavior === 'fight') ? 'c' : (_A6near(npc, tx, ty) ? 'a' : 'b'));
    const eo = _a6t(); _A6.probe = (_A6.probe || 0) + (s - so) + (eo - e);
    return r;
  }; }
// npcStep 전체 · 따라가기 · 걸음
var _A6arrT = 0, _A6ps = 0, _A6pb = 0;
{ const f0 = npcStep; npcStep = function (npc, dt, now) { const _st = !npc.path || npc.pathIndex >= npc.path.length;   // [T670] 서 있는 사람(길을 다 걸었다) / 걷는 사람
    _A6arrT = 0; const s = _a6t(); f0(npc, dt, now); const e = _a6t(); _A6sub('npcStep', e - s); _A6sub(_st ? 'npcStep:서' : 'npcStep:걷', e - s); if (_A6arrT) _A6sub('arrive', e - _A6arrT); }; }
{ const f0 = detectStuck; detectStuck = function (npc, now) { const s = _a6t(); const r = f0(npc, now); _A6sub('stuck', _a6t() - s); return r; }; }
{ const f0 = unstuckNpc; unstuckNpc = function (npc, now) { const s = _a6t(); const r = f0(npc, now); _A6sub('unstuck', _a6t() - s); return r; }; }
{ const f0 = followNpcPath;
  followNpcPath = function (npc, sm) {
    if (!_A6CNT) { const s = _a6t(); const r = f0(npc, sm); _A6sub('follow', _a6t() - s); return r; }
    const so = _a6t();
    const vx = npc.vx, vy = npc.vy, pi = npc.pathIndex, P = npc.path;
    const s = _a6t(); const r = f0(npc, sm); const e = _a6t(); const d = e - s;
    _A6sub('follow', d);
    const same = vx === npc.vx && vy === npc.vy, H = _A6.hq.follow;
    H.n++; if (same) { H.same++; H.msSame += d; } else H.msDiff += d;
    _A6run('follow', npc, same, (r || pi !== npc.pathIndex) ? 'a' : (npc._a6P !== P ? 'c' : 'b'));
    npc._a6P = P;
    const eo = _a6t(); _A6.probe = (_A6.probe || 0) + (s - so) + (eo - e);
    return r;
  }; }
// A* — 결과 갈래 · 생활권 · 목적지 · 버린 까닭
{ const f0 = computeNpcPath;
  computeNpcPath = function (npc, now) {
    if (!_A6CNT) { const s = _a6t(); const r = f0(npc, now); _A6sub('astar', _a6t() - s); return r; }
    const tk = (npc.targetX | 0) + '_' + (npc.targetY | 0);
    const why = !npc.path ? 'none' : (npc._pathFor !== tk ? 'target' : ((npc._pathAt && now - npc._pathAt > 5000) ? 'expire' : (npc.pathIndex >= npc.path.length ? 'end' : 'other')));
    const walked = npc.path ? Math.min(npc.pathIndex | 0, npc.path.length) : 0;
    const d0 = (typeof npc.targetX === 'number') ? Math.hypot(npc.targetX - npc.x, npc.targetY - npc.y) : 0;
    const la = npc._lastAStarAt;
    const s = _a6t(); const r = f0(npc, now); const d = _a6t() - s;
    _A6sub('astar', d);
    const A = _A6.ast;
    A.why[why] = (A.why[why] || 0) + 1; { const w = walked >= 16 ? '16+' : (walked >= 4 ? '4-15' : String(walked)); A.walked[w] = (A.walked[w] || 0) + 1; }
    const tried = npc._lastAStarAt !== la;
    const cat = d0 < 48 ? 'near' : (!tried ? (r ? (npc.behavior === 'flee' || (npc.behavior === 'wander' && !npc.simVillageId) ? 'beeline' : 'straight') : 'cooldown') : (r ? 'found' : 'fail'));
    A[cat][0]++; A[cat][1] += d;
    if (npc.simVillageId && typeof npc.targetX === 'number') {
      if (!_A6vil || now - _A6vilAt > 10000) { _A6vil = new Map(); _A6vilAt = now; try { for (const v of (SimVillages.clientVillages() || [])) _A6vil.set(String(v.id), v); } catch (e) {} }
      const v = _A6vil.get(String(npc.simVillageId));
      if (v) {
        const R = Math.max(v.r || 0, _pfRadius(true) * BUILDING_SIZE), cx = v.cx * BUILDING_SIZE, cy = v.cy * BUILDING_SIZE;
        const ins = Math.hypot(npc.x - cx, npc.y - cy) <= R && Math.hypot(npc.targetX - cx, npc.targetY - cy) <= R;
        if (ins) A.inside++; else { A.outside++; const lb = String(npc._lifeAct || npc.behavior || npc.simJob || '?'); A.outLab[lb] = (A.outLab[lb] || 0) + 1; }
      }
      const key = npc.simVillageId + '|' + zoneGameDay(), cell = Math.floor(npc.targetX / BUILDING_SIZE) + ',' + Math.floor(npc.targetY / BUILDING_SIZE);
      let m = _A6dest.get(key); if (!m) _A6dest.set(key, m = new Map());
      let st = m.get(cell); if (!st) m.set(cell, st = new Set()); st.add(npc.pid);
    }
    return r;
  }; }
}
// GC — 구간 안에 이미 들어 있다(겹침) · 따로 센다
try { new (require('perf_hooks').PerformanceObserver)((l) => { for (const e of l.getEntries()) { if (_A6) _A6sub('gc', e.duration); } }).observe({ entryTypes: ['gc'] }); } catch (e) {}
`;

// ── [T670 ③] A* 실패 표 — 사본에만 · 실패한 부름만 같은 입력으로 두 번 더 판다(셈 팔 · 예산 없는 팔) ──────────────
const Z7_TAIL = `
;(function () {   // [T670 탐침] computeNpcPath 문맥 — 지금 묻는 사람(pathfind 꼬리가 읽는다) · T381 막힌 목표(pathfind 를 안 부르고 null)
  const f0 = computeNpcPath;
  computeNpcPath = function (npc, now) {
    globalThis.__t670ctx = npc; globalThis.__t670pf = 0;
    const la = npc._lastAStarAt; const r = f0(npc, now);
    if (!r && npc._lastAStarAt !== la && !globalThis.__t670pf && globalThis.__t670rec) globalThis.__t670rec({ kind: 'dead', npc, sx: npc.x, sy: npc.y, ex: npc.targetX, ey: npc.targetY, ms: 0, exp: 0 });
    globalThis.__t670ctx = null; return r;
  };
  const rows = [], rep = new Map();
  globalThis.__t670rec = (o) => {
    const n = o.npc || {}, cs = 32, ck = 16;   // 청크 = 16칸(존 청크 512px)
    const scx = Math.floor(o.sx / cs), scy = Math.floor(o.sy / cs), ecx = Math.floor(o.ex / cs), ecy = Math.floor(o.ey / cs);
    const key = Math.floor(scx / ck) + ',' + Math.floor(scy / ck) + '>' + ecx + ',' + ecy + '@' + zoneGameDay();
    rep.set(key, (rep.get(key) || 0) + 1);
    if (rows.length < 20000) rows.push({ kind: o.kind, day: zoneGameDay(), vil: n.simVillageId || null, act: n._lifeAct || n.behavior || null, job: n.simJob || null,
      s: [scx, scy], e: [ecx, ecy], dist: Math.abs(ecx - scx) + Math.abs(ecy - scy), ms: +o.ms.toFixed(3), exp: o.exp, edges: o.edges || 0,
      unl: o.unl || null, key, wet: o.wet || 0 });
    if ((rows.length % 20) === 1 && process.env.T670_AFAIL_OUT) { try { require('fs').writeFileSync(process.env.T670_AFAIL_OUT, JSON.stringify({ rows, rep: [...rep] })); } catch (e) {} }
  };
  setInterval(() => { if (process.env.T670_AFAIL_OUT) { try { require('fs').writeFileSync(process.env.T670_AFAIL_OUT, JSON.stringify({ rows, rep: [...rep] })); } catch (e) {} } }, 30000).unref();
})();
`;
const PF_TAIL = `
;(function () {   // [T670 탐침] 실패만 다시 판다 — ① 원래 부름(시간만 · 감싸지 않는다) ② 같은 예산 셈 팔(펼친 칸·간선) ③ 예산 없는 팔(같은 반경 — 닿나 · 필요 칸)
  const f0 = module.exports.findPath, perf = require('perf_hooks').performance;
  const counted = (opts, maxCells) => { const seen = new Set(); let edges = 0, wet = 0; const ib = opts.isBlockedFn, iw = opts.isWaterFn;
    const o = Object.assign({}, opts, { maxCells, isBlockedFn: function (a, b, c, d) { edges++; seen.add(a * 65536 + b); return ib ? ib.apply(this, arguments) : false; },
      isWaterFn: function () { wet++; return iw ? iw.apply(this, arguments) : false; } });
    return { o, get exp() { return seen.size; }, get edges() { return edges; }, get wet() { return wet; } };
  };
  module.exports.findPath = function (sx, sy, ex, ey, opts) {
    globalThis.__t670pf = 1;
    const t = perf.now(); const r = f0(sx, sy, ex, ey, opts); const ms = perf.now() - t;
    if (r || !globalThis.__t670rec || !globalThis.__t670ctx) return r;
    const R = (opts && opts.searchRadiusCells) || 64, cd = Math.abs(Math.floor(ex / 32) - Math.floor(sx / 32)) + Math.abs(Math.floor(ey / 32) - Math.floor(sy / 32));
    if (cd > R) { globalThis.__t670rec({ kind: 'far', npc: globalThis.__t670ctx, sx, sy, ex, ey, ms, exp: 0 }); return r; }
    const A = counted(opts || {}, (opts && opts.maxCells) || 4096); f0(sx, sy, ex, ey, A.o);
    const B = counted(opts || {}, Infinity); const rb = f0(sx, sy, ex, ey, B.o);
    globalThis.__t670rec({ kind: A.exp === 0 ? 'goalBlocked' : (rb ? 'budget' : 'unreach'), npc: globalThis.__t670ctx, sx, sy, ex, ey, ms, exp: A.exp, edges: A.edges, wet: A.wet,
      unl: { found: !!rb, exp: B.exp } });
    return r;
  };
})();
`;
const SHAPE_TAIL = `
// ── [T671 ① 몸 재기 · 계측기가 박았다 · 제품엔 없다 · \`--allow-natives-syntax\` 판에만] ─────────────────────
;(function () {
  if (!process.env.T671_SHAPE_OUT) return;
  const fs = require('fs'), OUT = process.env.T671_SHAPE_OUT, EVERY = +(process.env.T671_SHAPE_EVERY || 30000);
  const HF = new Function('o', 'return %HasFastProperties(o)'), SM = new Function('a', 'b', 'return %HaveSameMap(a, b)'), DP = new Function('f', '%DebugPrint(f)');
  const prevKeys = new Map(), wasSlow = new Set();
  let k = 0;
  setInterval(() => {
    try {
      const bodies = []; for (const pid of npcs) { const b = players.get(pid); if (b) bodies.push([pid, b]); }
      const reps = [], repN = [], repJob = [], nk = [], slowKeys = {}, fastKeys = {}, byJob = {}, newSlow = { removed: {}, added: {}, n: 0 };
      let slow = 0;
      for (const [pid, b] of bodies) {
        const keys = Object.keys(b); nk.push(keys.length);
        const f = HF(b); const job = b.simJob || b.npcJob || '(없음)';
        const J = byJob[job] || (byJob[job] = { n: 0, slow: 0, maps: new Set() });
        J.n++;
        if (!f) { slow++; J.slow++; for (const x of keys) slowKeys[x] = (slowKeys[x] || 0) + 1;
          if (!wasSlow.has(pid)) { wasSlow.add(pid); newSlow.n++; const pk = prevKeys.get(pid);
            if (pk) { const now = new Set(keys); for (const x of pk) if (!now.has(x)) newSlow.removed[x] = (newSlow.removed[x] || 0) + 1; for (const x of keys) if (!pk.has(x)) newSlow.added[x] = (newSlow.added[x] || 0) + 1; }
            else newSlow.added['(첫 표본에 이미)'] = (newSlow.added['(첫 표본에 이미)'] || 0) + 1; } }
        else { for (const x of keys) fastKeys[x] = (fastKeys[x] || 0) + 1;
          let g = -1; for (let i = 0; i < reps.length; i++) if (SM(reps[i], b)) { g = i; break; }
          if (g < 0) { reps.push(b); repN.push(0); repJob.push({}); g = reps.length - 1; }
          repN[g]++; repJob[g][job] = (repJob[g][job] || 0) + 1; J.maps.add(g); }
        prevKeys.set(pid, new Set(keys));
      }
      nk.sort((a, b) => a - b);
      const q = (p) => nk.length ? nk[Math.min(nk.length - 1, Math.floor(nk.length * p))] : 0;
      const groups = repN.map((n, i) => ({ n, keys: Object.keys(reps[i]).length, jobs: repJob[i] })).sort((a, b) => b.n - a.n);
      const row = { k: k++, t: Date.now(), n: bodies.length, keysP50: q(0.5), keysP95: q(0.95), keysMax: nk[nk.length - 1] || 0, keysMin: nk[0] || 0,
        slow, maps: reps.length, top: groups.slice(0, 8), byJob: Object.fromEntries(Object.entries(byJob).map(([j, v]) => [j, { n: v.n, slow: v.slow, maps: v.maps.size }])),
        slowKeys, fastKeys, newSlow };
      fs.appendFileSync(OUT, JSON.stringify(row) + '\\n');
      if (process.env.T671_IC === '1' && k % 6 === 0) {
        for (const [nm, fn] of [['npcStep', npcStep], ['detectStuck', detectStuck], ['followNpcPath', followNpcPath], ['computeNpcPath', computeNpcPath], ['decideNpcBehavior', decideNpcBehavior]]) {
          fs.writeSync(1, \`@@T671IC \${k} \${nm}\\n\`); DP(fn); }
        fs.writeSync(1, \`@@T671IC_END \${k}\\n\`);
      }
    } catch (e) { try { fs.appendFileSync(OUT, JSON.stringify({ err: String(e && e.stack) }) + '\\n'); } catch (e2) {} }
  }, EVERY).unref();
})();
`;
const TRAP_TAIL = `
// ── [T671 ② 전수 표 증인 · 계측기가 박았다 · 제품엔 없다] 몸을 Proxy 로 싸서 "몸 전체를 읽는 자리" 를 동적으로 센다 ──
;(function () {
  if (!process.env.T671_TRAP_OUT) return;
  const fs = require('fs'), OUT = process.env.T671_TRAP_OUT;
  const sites = new Map(), addN = new Map();
  const site = () => { const L = String(new Error().stack).split(String.fromCharCode(10)).slice(1), o = []; for (const x of L) { const i = x.indexOf('zone.js:'); if (i >= 0 && parseInt(x.slice(i + 8), 10) <= 40) continue; if (x.includes('<anonymous>') || x.includes('node:')) continue; const j = x.lastIndexOf('server'), w = x.indexOf('(') >= 0 ? x.slice(x.indexOf('at ') + 3, x.indexOf('(')).trim() : ''; o.push(w + ' @' + (j >= 0 ? x.slice(j).replace(')', '') : x.trim())); if (o.length >= 2) break; } return o.join(' <- '); };
  const rec = (kind, key) => { const k = kind + ' | ' + (key === undefined ? '' : String(key)) + ' | ' + site(); sites.set(k, (sites.get(k) || 0) + 1); };
  const H = {
    ownKeys(t) { rec('ownKeys'); return Reflect.ownKeys(t); },
    has(t, k) { rec(Object.prototype.hasOwnProperty.call(t, k) ? 'in:있음' : 'in:없음', k); return k in t; },
    getOwnPropertyDescriptor(t, k) { rec('gopd', k); return Reflect.getOwnPropertyDescriptor(t, k); },
    deleteProperty(t, k) { rec(Object.prototype.hasOwnProperty.call(t, k) ? 'delete:있음' : 'delete:없음', k); return delete t[k]; },
    defineProperty(t, k, d) { rec('define', k); return Reflect.defineProperty(t, k, d); },
    set(t, k, v) { if (!Object.prototype.hasOwnProperty.call(t, k)) { rec('add', k); addN.set(k, (addN.get(k) || 0) + 1); } t[k] = v; return true; },
  };
  Object.defineProperty(H.ownKeys, 'name', { value: 't671trap' });
  globalThis.__T671P = (o) => new Proxy(o, H);
  setInterval(() => { try { fs.writeFileSync(OUT, JSON.stringify({ sites: [...sites].sort((a, b) => b[1] - a[1]), adds: [...addN].sort((a, b) => b[1] - a[1]) })); } catch (e) {} }, 30000).unref();
})();
`;
function makeTree(dir, probe, ref, seg) {
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  execFileSync('git', ['worktree', 'add', '--detach', '-q', dir, ref || 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
  try { fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules')); } catch (e) {}
  if (!probe) return 0;
  const zp = path.join(dir, 'server', 'zone.js');
  let s = fs.readFileSync(zp, 'utf8');
  const cnt = (a) => s.split(a).length - 1;
  if (cnt(HEAD_ANCHOR) !== 1) throw new Error('머리 앵커 ' + cnt(HEAD_ANCHOR));
  s = s.replace(HEAD_ANCHOR, () => HEAD_ANCHOR + '\n  _A6start();');
  for (const [a, name] of SEGS) {
    if (cnt(a) !== 1) throw new Error(`구간 앵커 ${cnt(a)}개: ${a.slice(0, 50)}`);
    const tailEnd = a.startsWith('  { const _h = process.hrtime(_tickHr0)');
    s = s.replace(a, () => `  _A6m(${JSON.stringify(name)});${tailEnd ? ' _A6end();' : ''}\n` + a);
  }
  if (process.argv.includes('--astar')) {   // [T670 ③] A* 실패 한 방 표 — pathfind 꼬리(실패 부름만 다시 판다) + computeNpcPath 앞 문맥(사람·행동)
    const pf = path.join(dir, 'server', 'pathfind.js');
    fs.appendFileSync(pf, PF_TAIL);
    s += Z7_TAIL;
  }
  if (process.argv.includes('--shape')) s += SHAPE_TAIL;
  if (process.argv.includes('--trap')) {   // [T671 ②] 몸을 Proxy 로 — 몸 전체를 읽는 자리(키 목록·in·delete·정의) 동적 전수
    const a1 = '  const player = {\n    pid, playerId: npcId, ws: null,', a2 = '  player.myClaim = null;\n';
    if (cnt(a1) !== 1 || cnt(a2) !== 1) throw new Error('trap 앵커 ' + cnt(a1) + ' ' + cnt(a2));
    s = s.replace(a1, () => a1.replace('const player', 'let player')).replace(a2, () => '  player = globalThis.__T671P(player);\n' + a2);
    s = TRAP_TAIL + s.replace(/^'use strict';?/, '');
  }   // [T671 ①] 몸 재기(사본에만 · 존을 `--allow-natives-syntax` 로 띄운다)
  if (seg) { s += TAIL; fs.writeFileSync(zp, s); execFileSync(process.execPath, ['--check', zp]); return SEGS.length; }   // [T670] 구간 팔 — 구간 표식만(틱당 시계 13번 · 사람당 ≈0) · 갈래 시계·장부 0
  { const a = '      movePlayerStep(p);';   // 걸음(NPC) — 틱 함수 안의 함수라 바인딩을 못 감싼다 ⇒ 부르는 자리(T356 의 그 앵커)
    if (cnt(a) !== 1) throw new Error('걸음 앵커 ' + cnt(a));
    s = s.replace(a, () => "      { const _s6 = _a6t(); movePlayerStep(p); _A6sub('step', _a6t() - _s6); }"); }
  { const a = '  if (!arrived) return;\n';   // 도착한 뒤 행동(채집·심기·수확 …) — npcStep 의 꼬리
    if (cnt(a) !== 1) throw new Error('도착 앵커 ' + cnt(a));
    s = s.replace(a, () => a + '  _A6arrT = _a6t();\n'); }
  for (const [a, ins] of [   // npcStep 안의 두 토막 — 결정 뒤 머리(대피·밤 귀가) · 경로 셈(목표 키 문자열 · 되묻기 판정)
    ['  // ★[§15 2파·비전투원 대피]', '  _A6ps = _a6t();\n'],
    ['  // stuck 감지 — 모든 모드 공통', "  _A6sub('stepHead', _a6t() - _A6ps);\n"],
    ["  let speedMult = npc.behavior === 'flee'", '  _A6pb = _a6t();\n'],
    ['  if (needPath && !_skip) {', "  _A6sub('pathChk', _a6t() - _A6pb);\n"]]) {
    if (cnt(a) !== 1) throw new Error('npcStep 앵커 ' + cnt(a) + ' ' + a);
    s = s.replace(a, () => ins + a);
  }
  s += TAIL;
  fs.writeFileSync(zp, s);
  execFileSync(process.execPath, ['--check', zp]);
  return SEGS.length;
}

async function run(conf, tag, probe) {
  const out = path.join(DIR, `${tag}.json`);
  if (fs.existsSync(out)) { console.log('있음', out); return; }
  const dir = `/tmp/wt-t646-${tag}`;
  const _ri = process.argv.indexOf('--ref'), REF = _ri >= 0 ? process.argv[_ri + 1] : 'HEAD', SEG = process.argv.includes('--seg');
  const n = makeTree(dir, probe, REF, SEG);
  const CP = +(process.env.T646_PORT || 4010), ZP = CP + 1, SECRET = 't646';   // [T671] 판 둘을 나란히 돌릴 때 T646_PORT
  const DB = `/tmp/t646-z-${tag}.db`, CDB = `/tmp/t646-c-${tag}.db`;
  rmdb(DB); rmdb(CDB);
  for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, DB + s); } catch (e) {} }
  const at = (Math.floor(fs.statSync(TPL).mtimeMs / DAY) + 2) * DAY - LEAD_S * 1000;   // T455 고정 원점(하루 경계 LEAD 초 앞)
  const logp = path.join(DIR, `${tag}.log`), logf = fs.openSync(logp, 'w');
  const env0 = Object.assign({}, process.env, { NODE_OPTIONS: `--require ${path.join(__dirname, 't455-clock.js')}`, T455_CLOCK_PRE: '1', T455_CLOCK_AT: String(at) });
  const c = spawn(process.execPath, [path.join(dir, 'server/central.js')], { cwd: dir, stdio: 'ignore',
    env: Object.assign({}, env0, { PORT: String(CP), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const PROF = process.argv.includes('--prof') ? path.join(DIR, `prof-${tag}`) : null;   // 기본 끔 — 켜면 존에 V8 CPU 프로파일(10ms 표본 · 자기 시간으로 빈 몫을 찾는다)
  const z = spawn(process.execPath, [...(process.argv.includes('--shape') ? ['--allow-natives-syntax'] : []), ...(PROF ? ['--cpu-prof', '--cpu-prof-interval', '10000', '--cpu-prof-dir', PROF] : []), path.join(dir, 'server/zone.js')], { cwd: dir, stdio: ['ignore', logf, logf],
    env: Object.assign({}, env0, CONF[conf], { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP),
      CENTRAL_SECRET: SECRET, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY), DB_PATH: DB, VILLAGE_WAR_LOG: '0', T312_FISH_ACT: '1',
      T646_EVERY: String(SLICE_S * 30), T646_SEGONLY: SEG ? '1' : '', T670_AFAIL_OUT: path.join(DIR, `${tag}.afail.json`), T646_PATH_OUT: path.join(DIR, `${tag}.dest.json`), T671_TRAP_OUT: process.argv.includes('--trap') ? path.join(DIR, `${tag}.trap.json`) : '', T671_SHAPE_OUT: process.argv.includes('--shape') ? path.join(DIR, `${tag}.shape.jsonl`) : '' }) });
  const getj = async (p) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, { headers: { 'x-zone-secret': SECRET }, signal: AbortSignal.timeout(20000) }); return await r.json(); } catch (e) { return null; } };
  const say = (...a) => console.log(`[${tag}]`, ...a);
  const t0 = Date.now();
  for (let i = 0; i < 900; i++) { try { const r = await fetch(`http://localhost:${ZP}/health`, { signal: AbortSignal.timeout(3000) }); if (r.ok) break; } catch (e) {} await sleep(1000); }
  say('기동', Date.now() - t0, 'ms · 탐침 구간', n);
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
  const ping = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);
  const phaseNow = async () => { const L = await getj('/lifedbg'); return L && L.phase; };
  const windows = [];
  for (const [W, lo, hi] of [['day', 0.10, 0.62], ['night', 0.72, 0.97]]) {
    let ph = null;
    for (let i = 0; i < 1000; i++) { ph = await phaseNow(); if (ph != null && ph >= lo && ph <= hi - (SLICES * SLICE_S) / (DAY / 1000)) break; await sleep(5000); }
    say(W, '창 · phase', ph);
    const slices = [];
    for (let k = 0; k < SLICES; k++) {
      await getj('/perf?reset=1');
      const mark = fs.statSync(logp).size;
      await sleep(SLICE_S * 1000);
      const p = await getj('/perf'), L = await getj('/lifedbg');
      const buf = fs.readFileSync(logp).subarray(mark).toString('utf8');
      const ana = buf.split('\n').filter((x) => x.startsWith('[T646] ')).map((x) => { try { return JSON.parse(x.slice(7)); } catch (e) { return null; } }).filter(Boolean);
      const t = p && p.tick && p.tick.ms;
      slices.push({ k, phase: L && L.phase, p50: t && t.p50, p95: t && t.p95, max: t && t.max, ticks: p && p.tick && p.tick.n, npcs: null, ana });
      say(`${W} 조각 ${k} · p50 ${t ? t.p50 : '?'} · p95 ${t ? t.p95 : '?'} · 줄 ${ana.length}`);
    }
    windows.push({ W, slices });
  }
  clearInterval(ping); try { ws.close(); } catch (e) {}
  if (PROF) { try { z.kill('SIGINT'); } catch (e) {} for (let i = 0; i < 60 && z.exitCode === null; i++) await sleep(1000); }   // 정상 종료라야 프로파일이 써진다
  try { z.kill('SIGKILL'); } catch (e) {} try { c.kill('SIGKILL'); } catch (e) {}
  await sleep(1500); rmdb(DB); rmdb(CDB);
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  fs.writeFileSync(out, JSON.stringify({ conf, tag, probe, ref: REF, seg: SEG, at: new Date().toISOString(), wallS: Math.round((Date.now() - t0) / 1000), windows }));
  say('끝', Math.round((Date.now() - t0) / 1000), 's');
}

// ── 표 ──────────────────────────────────────────────────────────────────────
function table() {
  const R = require('./lib-tick-rule');
  const files = fs.readdirSync(DIR).filter((f) => /\.json$/.test(f) && !/dest/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))).filter((j) => j.windows);
  const pct = (H, q) => { const xs = Object.entries(H).map(([k, v]) => [+k, v]).sort((a, b) => a[0] - b[0]); const N = xs.reduce((s, x) => s + x[1], 0); let c = 0; for (const [k, v] of xs) { c += v; if (c >= N * q) return k; } return 0; };
  const out = { runs: [] };
  for (const j of files) for (const w of j.windows) {
    const A = { n: 0, tot: 0, popN: 0, seg: {}, sub: {}, subN: {}, hq: {}, runs: { dec: {}, life: {}, follow: {} }, ast: null };
    for (const sl of w.slices) for (const x of sl.ana) {
      A.n += x.n; A.tot += x.tot; A.popN += x.popN;
      for (const [k, v] of Object.entries(x.seg)) A.seg[k] = (A.seg[k] || 0) + v;
      for (const [k, v] of Object.entries(x.sub)) A.sub[k] = (A.sub[k] || 0) + v;
      for (const [k, v] of Object.entries(x.subN)) A.subN[k] = (A.subN[k] || 0) + v;
      for (const br of ['dec', 'life', 'follow']) { const h = x.hq[br], a = A.hq[br] || (A.hq[br] = { n: 0, same: 0, gated: 0, msSame: 0, msDiff: 0, cause: { a: 0, b: 0, c: 0 } });
        a.n += h.n; a.same += h.same; a.gated += h.gated || 0; a.msSame += h.msSame; a.msDiff += h.msDiff; for (const c of ['a', 'b', 'c']) a.cause[c] += h.cause[c];
        for (const [L, v] of Object.entries(x.runs[br])) A.runs[br][L] = (A.runs[br][L] || 0) + v; }
      if (!A.ast) A.ast = JSON.parse(JSON.stringify(x.ast)); else { for (const k of ['near', 'beeline', 'straight', 'cooldown', 'fail', 'found']) { A.ast[k][0] += x.ast[k][0]; A.ast[k][1] += x.ast[k][1]; }
        A.ast.inside += x.ast.inside; A.ast.outside += x.ast.outside; for (const g of ['outLab', 'why', 'walked']) for (const [k, v] of Object.entries(x.ast[g])) A.ast[g][k] = (A.ast[g][k] || 0) + v; }
    }
    if (!A.n) continue;
    const pop = A.popN / A.n, us = (ms) => +(ms / A.n * 1000 / pop).toFixed(3);
    const p50s = w.slices.map((s) => s.p50).filter((x) => x != null), p95s = w.slices.map((s) => s.p95).filter((x) => x != null);
    const r = { conf: j.conf, tag: j.tag, probe: j.probe, W: w.W, pop: Math.round(pop), ticks: A.n, tickP50: R.median(p50s), tickP95: R.median(p95s), totUs: us(A.tot),
      segUs: Object.fromEntries(Object.entries(A.seg).map(([k, v]) => [k, us(v)])), segSumUs: us(Object.values(A.seg).reduce((s, v) => s + v, 0)),
      subUs: Object.fromEntries(Object.entries(A.sub).map(([k, v]) => [k, us(v)])), subN: Object.fromEntries(Object.entries(A.subN).map(([k, v]) => [k, +(v / A.n).toFixed(1)])),
      hq: Object.fromEntries(Object.entries(A.hq).map(([k, h]) => [k, { n: h.n, sameRate: +(h.same / Math.max(1, h.n)).toFixed(3), gatedRate: +(h.gated / Math.max(1, h.n)).toFixed(3), sameUs: us(h.msSame), diffUs: us(h.msDiff),
        changes: h.cause, runP50: pct(A.runs[k], 0.5), runP95: pct(A.runs[k], 0.95) }])),
      ast: A.ast ? Object.assign({}, A.ast, { insideRate: +(A.ast.inside / Math.max(1, A.ast.inside + A.ast.outside)).toFixed(3), cats: Object.fromEntries(['near', 'beeline', 'straight', 'cooldown', 'fail', 'found'].map((k) => [k, { n: A.ast[k][0], us: us(A.ast[k][1]), perCallUs: A.ast[k][0] ? +(A.ast[k][1] * 1000 / A.ast[k][0]).toFixed(1) : 0 }])) }) : null };
    out.runs.push(r);
  }
  // 목적지
  out.dest = {};
  for (const f of fs.readdirSync(DIR).filter((f) => /\.dest\.json$/.test(f))) {
    const o = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const cells = [], users = [];
    for (const [k, a] of Object.entries(o)) { cells.push(a.length); for (const u of a) users.push(u); }
    const q = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
    out.dest[f] = { villageDays: cells.length, cellsP50: q(cells, 0.5), cellsP95: q(cells, 0.95), cellsMax: Math.max(0, ...cells), usersP50: q(users, 0.5), usersP95: q(users, 0.95), usersMax: Math.max(0, ...users), top10: users.slice().sort((a, b) => b - a).slice(0, 10) };
  }
  fs.writeFileSync(path.join(DIR, 'table.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}

const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === 'run') { const pi = process.argv.indexOf('--probe'); run(a1, a2, pi < 0 ? true : process.argv[pi + 1] !== '0').then(() => process.exit(0), (e) => { console.error(e); process.exit(1); }); }
else if (cmd === 'patch') { console.log('구간', makeTree('/tmp/wt-t646-dry', true)); execFileSync('git', ['worktree', 'remove', '--force', '/tmp/wt-t646-dry'], { cwd: ROOT }); }
else if (cmd === 'table') table();
else console.log('사용: run <cap40|inf> <tag> [--probe 0|1] · table · patch');
