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
//   [T719] --hbr(--hist 와 같이) — 갈래 다섯(결정·생활층·막힘·길·따라가기) 한 번 부름 분포도 · --hist — 한 사람 한 걸음(npcStep) 시간 분포(낮·밤 창마다 · 표에 step: 평균 · p50 · p99 · p99.9 · p99.99 · 최대 · 15 ms 넘음) · T646_PRELOAD=<파일>(존 덧 preload)
//   T646_DIR=/tmp/t646 · T646_TPL=/tmp/t646/tpl/tpl-t100.db · T646_SLICE_S=30 · T646_SLICES=6 · T646_LEAD_S=150
//   [T945] --inv — **밤 창 머리에 진짜 무효화 훅 한 번**(`/routedbg?invalidate=1` · 존에 `E2E_GIVE=1` · T933 §3 틀). 밤 창은 econ 하루가 닫힐 때(`econTick.days` 가 오른다)까지
//     + 한 조각 잰다(종전 조각 수 대신). ⚠econ 하루 경계는 phase 0 이 아니다 — T731(현지 자정 창)이 마을 날을 옮겨 이 틀에선 밤 창 안(phase ≈ 0.72 ~ 0.83)에서
//     닫히고, 캐러밴 도착은 그 창 꼬리(캐러밴 동기)에 온다 ⇒ 창 머리에서 비운 귀환 쌍이 빈 채로 도착한다(T929 귀환 고침을 다시 뜬 판에서 재는 자리 · 무효화 = 라이브의
//     벽 · 울타리와 같은 문). 조각마다 도착 · 귀환 출발 · 교역로 A* 줄 수와 `/perf` probe `t929`(누계) · `pathJobs` · `pathWait` · `routeCold` 를 같이 적는다.
//     없으면 종전 그대로(낮 · 밤 창 둘 · 존 env 무변).
//   [T968] --inv-day — 무효화를 **낮 창 머리**에 부른다(라이브의 흔한 꼴 — 마감 한참 앞의 벽 · 울타리). 밤 창은 --inv 와 같이 하루가 닫힐 때까지 잰다.
//   [T1011] --boot-win — 기동 직후 부팅 창(부팅부터 /perf 한 번 + 30초 조각 둘 · `t996` · `t1011` probe).
//   [T1027] T1027_ZFLAGS="--trace-gc --trace-deopt …" — 존 프로세스에 덧 깃발(공백으로 가름 · 존 로그로 나온다) · 없으면 종전 그대로.
//   [T977] --inv-after — 밤 창(하루가 닫힘) 뒤 무효화 한 번 더 · 조각 둘(`after` 창) — 부팅 행렬 다음이 아닌 **둘째 다시 세기**. 조각마다 존 `[T977]` 줄(`T977_PROBE=1`)도 적는다.
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
var _A6st = 0;   // ★[T780] 서 있는 몸의 걸음 안이면 1 — 갈래 칸을 "<칸>:서" 로도 센다(서 있는 몸이 걸음마다 무엇을 다시 묻나 · 자만)
function _A6sub(k, ms) { _A6.sub[k] = (_A6.sub[k] || 0) + ms; _A6.subN[k] = (_A6.subN[k] || 0) + 1; if (_A6st && k.charCodeAt(0) !== 110) { const k2 = k + ':서'; _A6.sub[k2] = (_A6.sub[k2] || 0) + ms; _A6.subN[k2] = (_A6.subN[k2] || 0) + 1; } }
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
    _A6arrT = 0; _A6st = _st ? 1 : 0; const s = _a6t(); try { f0(npc, dt, now); } finally { _A6st = 0; } const e = _a6t(); _A6sub('npcStep', e - s); _A6sub(_st ? 'npcStep:서' : 'npcStep:걷', e - s); if (_A6arrT) _A6sub('arrive', e - _A6arrT); }; }
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
const T675_TAIL = `
// ── [T675 ① 자 맞추기 · 계측기가 박았다 · 제품엔 없다] 셋째 자: 공유 메모리 표본기 ──────────────────────────────────────
//   주 스레드는 구간 표식마다 **지금 구간 번호**를 SharedArrayBuffer 한 칸에 쓴다(Atomics.store · ns 단위) · \`npcStep\` 안이면 둘째 칸 1.
//   워커 스레드가 50µs 마다 그 두 칸을 읽어 센다 — 신호·스택 걷기 0(CPU 프로파일러와 독립) · 시계 0(구간 시계와 독립).
//   같은 30 초 창마다 \`[T675S]\` 한 줄: 구간 시계 합 · 표본 수 · 프로세스 CPU(\`process.cpuUsage\` — 모든 스레드) · 페이지 폴트 · GC 멈춤(주 스레드).
;(function () {
  if (process.env.T675_SAB !== '1') return;
  const { Worker } = require('worker_threads');
  // [T677 ①] 갈래 칸(I[2]) — \`npcStep\` 안의 갈래 번호(0 = 갈래 밖 · 1 결정 · 2 생활층 · 3 머리 · 4 막힘 · 5 경로 셈 · 6 길(가까움) · 7 길(먼 갈래·A*) · 8 따라가기 · 9 도착 뒤).
  //   \`T677_BR=1\` 일 때만 갈래 칸을 쓴다(감싸기 + 글자 표식 · 시계 0). 끄면 종전 T675 표본기 그대로(갈래 0 · \`npcStep\` 시계 감싸기).
  const NSEG = 64, NBR = 40, BASE = 8, sab = new SharedArrayBuffer(4 * (BASE + (NSEG + 1) * 2 * NBR)), I = new Int32Array(sab);
  const BR = ['', '결정', '생활층', '머리', '막힘', '경로 셈', '길·가까움', '길·먼 갈래(A*)', '따라가기', '도착 뒤', '생활층·농사 칸', '생활층·일터 목록', '생활층·개간 후보', '생활층·닿는 일터', '생활층·곳간', '생활층·집터 크루', '', '생활층§스케줄 문', '생활층§진행 중 작업', '생활층§작업 배정(개간·건설)', '생활층§농부 실작업', '생활층§나무꾼(T325)', '생활층§벌목·채광·채집', '생활층§어부', '생활층§사냥꾼', '어부·자리·드리움', '어부·드리울 자리 고르기', '어부·끝(목표·라벨)', '어부·_t340Try(던짐·입질)', '닿는가(_t427Reach)', '막힘·서 있음 판정', '막힘·_stuckPos 쓰기', '막힘·처음', '막힘·움직임 판정', '막힘·타이머'];
  const BRON = process.env.T677_BR === '1';
  I[0] = -1; I[1] = 0; I[2] = 0;
  globalThis.__T677I = I;
  const names = ['(틱 밖)'], idx = new Map();
  const W = new Worker(\`
    const { workerData } = require('worker_threads'); const I = new Int32Array(workerData);
    for (;;) { Atomics.wait(I, 3, 0, 0.05); const s = Atomics.load(I, 0), st = Atomics.load(I, 1), br = Atomics.load(I, 2); Atomics.add(I, \${BASE} + ((s + 1) * 2 + st) * \${NBR} + (st ? br : 0), 1); }
  \`, { eval: true, workerData: sab });
  W.unref();
  let segSum = {}, tickMs = 0, ticks = 0, stepMs = 0;
  const m0 = _A6m, e0 = _A6end, s0 = _A6start;
  const seg = (k) => { let i = idx.get(k); if (i === undefined) { i = names.length; names.push(k); idx.set(k, i); } return i; };
  const order = []; let learned = false, pos = 0;
  _A6start = function () { s0(); pos = 0; Atomics.store(I, 0, learned ? seg(order[0]) - 1 : 0); };
  _A6m = function (k) { const t0 = _A6prev; m0(k); segSum[k] = (segSum[k] || 0) + (_A6prev - t0);
    if (!learned) order.push(k); pos++; Atomics.store(I, 0, learned && pos < order.length ? seg(order[pos]) - 1 : 0); };
  _A6end = function () { const t = _a6t(); tickMs += t - _A6t0; ticks++; e0(); if (!learned && order.length) { learned = true; for (const k of order) seg(k); } Atomics.store(I, 0, -1); };
  if (!BRON) { const f0 = npcStep; npcStep = function (a, b, c) { Atomics.store(I, 1, 1); const t = _a6t(); f0(a, b, c); stepMs += _a6t() - t; Atomics.store(I, 1, 0); }; }
  else {
    { const f0 = npcStep; npcStep = function (a, b, c) { Atomics.store(I, 2, 0); Atomics.store(I, 1, 1); f0(a, b, c); Atomics.store(I, 1, 0); Atomics.store(I, 2, 0); }; }
    const wrapB = (f0, id) => function () { const p = I[2]; Atomics.store(I, 2, id); const r = f0.apply(this, arguments); Atomics.store(I, 2, p); return r; };
    decideNpcBehavior = wrapB(decideNpcBehavior, 1);
    if (SimVillages && SimVillages.npcLifeTick) SimVillages.npcLifeTick = wrapB(SimVillages.npcLifeTick, 2);
    detectStuck = wrapB(detectStuck, 4); _t670Stuck = wrapB(_t670Stuck, 31); if (typeof _t700Set === 'function') _t700Set = wrapB(_t700Set, 31);
    computeNpcPath = wrapB(computeNpcPath, 6);
    followNpcPath = wrapB(followNpcPath, 8);
  }
  let gcMs = {}; try { const { PerformanceObserver } = require('perf_hooks'); new PerformanceObserver((l) => { for (const e of l.getEntries()) { const k = (e.detail && e.detail.kind) || e.kind || 0; gcMs[k] = (gcMs[k] || 0) + e.duration; } }).observe({ entryTypes: ['gc'] }); } catch (e) {}
  let cu = process.cpuUsage(), ru = process.resourceUsage(), w0 = Date.now(), c0 = new Int32Array(I.length);
  setInterval(() => {
    const cu2 = process.cpuUsage(cu), ru2 = process.resourceUsage(), w = Date.now();
    const cnt = {};
    for (let s = -1; s < names.length - 1; s++) for (let st = 0; st < 2; st++) for (let br = 0; br < NBR; br++) {
      const k = BASE + ((s + 1) * 2 + st) * NBR + br; const v = I[k] - c0[k];
      if (v) cnt[(s < 0 ? '(틱 밖)' : names[s + 1]) + (st ? '|step' : '') + (br ? '#' + (BR[br] || br) : '')] = v; }
    c0.set(I);
    try { console.log('[T675S] ' + JSON.stringify({ phase: +worldPhase(w).toFixed(4), wallMs: w - w0, ticks, tickMs, stepMs, pop: npcs.size, segMs: segSum, sab: cnt,
      cpuUserMs: cu2.user / 1000, cpuSysMs: cu2.system / 1000, minflt: ru2.minorPageFault - ru.minorPageFault, majflt: ru2.majorPageFault - ru.majorPageFault, gcMs })); } catch (e) {}
    cu = process.cpuUsage(); ru = ru2; w0 = w; segSum = {}; tickMs = 0; ticks = 0; stepMs = 0; gcMs = {};
  }, 30000).unref();
})();
`;
const T719_TAIL = `
// ── [T719 ① 최악 자 · 계측기가 박았다 · 제품엔 없다 · \`--hist\` 판에만] 한 사람 한 걸음(npcStep) 시간 분포 ──────────────────────────────
//   감싸기 하나(시계 둘) — 1/4 옥타브 칸(0.25 µs 부터) · 창마다 [T646] 줄에 stepH · stepN · stepMs · stepMax 를 싣는다.
;(function () {
  if (process.env.T719_HIST !== '1') return;
  const NB = 96, H = new Float64Array(NB); let n = 0, ms = 0, mx = 0, o15 = 0;
  { const f0 = npcStep; npcStep = function (a, b, c) { const t = _a6t(); f0(a, b, c); const d = _a6t() - t, us = d * 1000;
    H[us <= 0.25 ? 0 : Math.min(NB - 1, Math.floor(4 * Math.log2(us / 0.25)))]++; n++; ms += d; if (d > mx) mx = d; if (d > 15) o15++; }; }
  // [T719 ①] \`--hbr\` — 갈래(T677 \`--br\` 의 다섯 문)마다 한 번 부름 시간 분포도(감싸기 다섯 · 시계 둘씩 · 자 판과 따로 돈다)
  const BH = {};
  if (process.env.T719_HBR === '1') {
    const wrapH = (f0, k) => { const b = BH[k] = { h: new Float64Array(NB), n: 0, ms: 0, mx: 0, o15: 0 };
      return function () { const t = _a6t(); const r = f0.apply(this, arguments); const d = _a6t() - t, us = d * 1000;
        b.h[us <= 0.25 ? 0 : Math.min(NB - 1, Math.floor(4 * Math.log2(us / 0.25)))]++; b.n++; b.ms += d; if (d > b.mx) b.mx = d; if (d > 15) b.o15++; return r; }; };
    decideNpcBehavior = wrapH(decideNpcBehavior, '결정');
    if (SimVillages && SimVillages.npcLifeTick) SimVillages.npcLifeTick = wrapH(SimVillages.npcLifeTick, '생활층');
    detectStuck = wrapH(detectStuck, '막힘');
    computeNpcPath = wrapH(computeNpcPath, '길');
    followNpcPath = wrapH(followNpcPath, '따라가기');
  }
  const e0 = _A6end;
  _A6end = function () { if (_A6.n + 1 >= _A6EVERY) { _A6.stepH = Array.from(H); _A6.stepN = n; _A6.stepMs = ms; _A6.stepMax = mx; _A6.stepO15 = o15; H.fill(0); n = 0; ms = 0; mx = 0; o15 = 0;
    if (Object.keys(BH).length) { _A6.stepB = {}; for (const [k, b] of Object.entries(BH)) { _A6.stepB[k] = { h: Array.from(b.h), n: b.n, ms: b.ms, mx: b.mx, o15: b.o15 }; b.h.fill(0); b.n = 0; b.ms = 0; b.mx = 0; b.o15 = 0; } } } e0(); };
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
  if (seg && process.argv.includes('--br')) {   // [T677 ①] 생활층 안 갈래(villages.js 사본 꼬리 — 함수 바인딩을 감싼다 · 시계 0)
    const vp = path.join(dir, 'server', 'villages.js');
    { let V = fs.readFileSync(vp, 'utf8'); const vc = (a) => V.split(a).length - 1;   // npcLifeTick 안 절 표식(절 머리 줄 앞에 · 시계 0)
      for (const [a, id] of [['  // ══ 스케줄 게이트(', 17], ['  // ══ 진행 중 작업(', 18], ['  // ══ 작업 배정: ', 19], ['  // ══ 직업 실작업(', 20],
        ["  if (job === 'lumberjack' && vil.econ && _lifeEcon().woodActOn(vil.econ)) {", 21], ["  if (job === 'lumberjack' || job === 'miner' || job === 'forager') {", 22],
        ["  if (job === 'fisher') {", 23], ["  if (job === 'hunter') {", 24],
        ["    const ws = npc._workSite;\n    if (Math.hypot(npc.x - ws.x, npc.y - ws.y) > 130)", 25], ['    if (npc._fishSpotX == null || !npc._fishT || now >= npc._fishT) {', 26],
        ["    npc.behavior = 'wander'; npc.targetX = npc._fishSpotX; npc.targetY = npc._fishSpotY; npc.gatherTarget = null;", 27]]) {
        if (vc(a) !== 1) throw new Error('생활층 절 앵커 ' + vc(a) + ' ' + a);
        V = V.replace(a, () => `  globalThis.__T677I && Atomics.store(globalThis.__T677I, 2, ${id});\n` + a); }
      fs.writeFileSync(vp, V); }
    fs.appendFileSync(vp, `
;(function () {   // [T677 탐침 · 계측기가 박았다 · 제품엔 없다] — 표본기 칸(\`__T677I\`)은 존 끝에서 생긴다 ⇒ 부를 때 찾는다
  const W = (f0, id) => function () { const I = globalThis.__T677I; if (!I) return f0.apply(this, arguments); const p = I[2]; Atomics.store(I, 2, id); const r = f0.apply(this, arguments); Atomics.store(I, 2, p); return r; };
  _lifeNextFarmCell = W(_lifeNextFarmCell, 10); _lifeDoTask = W(_lifeDoTask, 10); _lifeJobSites = W(_lifeJobSites, 11);
  _lifeFrontier = W(_lifeFrontier, 12); _lifeNeedClear = W(_lifeNeedClear, 12); _t427Site = W(_t427Site, 13);
  _lifeGranStep = W(_lifeGranStep, 14); _granGo = W(_granGo, 14); _t400BodyStep = W(_t400BodyStep, 15); _t340Try = W(_t340Try, 28); _t427Reach = W(_t427Reach, 29);
})();
`);
  }
  if (seg && process.argv.includes('--br')) {   // [T677 ①] 갈래 표식(표본기 갈래 칸 · 시계 0) — 감싸지 못하는 토막 넷(머리 · 경로 셈 · 길 먼 갈래 · 도착 뒤)
    const S = (id) => `Atomics.store(__T677I, 2, ${id}); `;
    for (const [a, ins, after] of [
      ['  // ★[§15 2파·비전투원 대피]', S(3), false], ['  // stuck 감지 — 모든 모드 공통', S(0), false],
      ["  let speedMult = npc.behavior === 'flee'", S(5), false], ['  if (needPath && !_skip) {', S(0), false],
      ['  const isVil = !!npc.simVillageId;   // 마을 주민', S(7), false], ['  if (!arrived) return;\n', S(9), true],
      // [T700] 막힘 안 한 겹 — 서 있음 판정 · 처음 · 움직임 판정 · 타이머(쓰기 `_t670Stuck` 은 감싸서 31)
      ['  if (npc.targetX != null && npc.targetY != null\n      && (!npc.path || npc.pathIndex >= ', S(30), false],   // [T791] 길 거울 뒤 글자도 받는다(앞머리만)
      ['  if (!npc._stuckPos) {\n    npc._stuckPos = { x: npc.x, y: npc.y, at: now };', S(32), false],
      ['  if (_t671Gt(npc.x - npc._stuckPos.x, npc.y - npc._stuckPos.y, 5)) {', S(33), false],
      ['  if (now - npc._stuckPos.at > 1500) {', S(34), false]]) {
      if (cnt(a) !== 1) throw new Error('갈래 앵커 ' + cnt(a) + ' ' + a);
      s = s.replace(a, () => after ? a + '  ' + ins + '\n' : '  ' + ins + '\n' + a);
    }
  }
  if (seg) { s += TAIL; if (process.argv.includes('--sab')) s += T675_TAIL; if (process.argv.includes('--hist')) s += T719_TAIL; fs.writeFileSync(zp, s); execFileSync(process.execPath, ['--check', zp]); return SEGS.length; }   // [T670] 구간 팔 — 구간 표식만(틱당 시계 13번 · 사람당 ≈0) · 갈래 시계·장부 0
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

// ★[T791] 걸음 몸통 줄 묶음 — 사본 zone.js 의 `function npcStep` 몸통을 닻 줄로 자른다(묶음 이름 · 첫 줄 · 끝 줄 · 1부터)
function _t791Groups(dir) {
  const L = fs.readFileSync(path.join(dir, 'server', 'zone.js'), 'utf8').split('\n');
  const start = L.findIndex((x) => x.startsWith('function npcStep(')) + 1;
  let end = start; while (end < L.length && L[end - 1] !== '}') end++;
  const at = (pre) => { for (let i = start; i <= end; i++) if (L[i - 1].startsWith(pre)) return i; return -1; };
  const marks = [['머리(결정 문 · 생활 손잡이 · 타이머)', start], ['대피 · 밤 귀가', at('  if (npc.simEvacUntil')], ['캐나디아 · 막힘', at("  if (npc.canadiaTask === 'traveling')")],
    ['싸움', at("  if (npc.behavior === 'fight') {")], ['길 판정(배속 · 목표 키 · 되묻기)', at("  let speedMult = npc.behavior === 'flee'")], ['길 묻기 · 길 넣기', at('  if (needPath && !_skip) {')],
    ['따라가기 · 도착 뒤 행동', at('  const arrived = followNpcPath(npc, speedMult);')]];
  if (marks.some((m) => m[1] < 0)) throw new Error('T791 몸통 닻 ' + JSON.stringify(marks));
  return { start, end, groups: marks.map((m, i) => [m[0], m[1], i + 1 < marks.length ? marks[i + 1][1] - 1 : end]) };
}
async function run(conf, tag, probe) {
  const INV = process.argv.includes('--inv') || process.argv.includes('--inv-day');   // ★[T945] 경계 창 + 무효화 한 번(머리 주석)
  const INV_W = process.argv.includes('--inv-day') ? 'day' : 'night';   // ★[T968] `--inv-day` = 무효화를 낮 창 머리에(밤 창은 그대로 하루가 닫힐 때까지)
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
  //   ★[T791] --lines — 걸음 몸통 표본 해부(scripts/t791-lines.js · 감싸기 없이 V8 표본) · 몸통 줄 묶음 경계는 사본 글자에서 센다
  const LINES = process.argv.includes('--lines') ? path.join(DIR, `lines-${tag}.jsonl`) : null, LG = LINES ? _t791Groups(dir) : null;
  if (LINES) { try { fs.unlinkSync(LINES); } catch (e) {} }
  const env0 = Object.assign({}, process.env, LINES ? { T791_LINES: LINES, T791_NPCSTEP_LINE: String(LG.start) } : {}, { NODE_OPTIONS: `--require ${path.join(__dirname, 't455-clock.js')}` + (process.env.T646_PRELOAD ? ` --require ${process.env.T646_PRELOAD}` : '') + (LINES ? ` --require ${path.join(__dirname, 't791-lines.js')}` : ''), T455_CLOCK_PRE: '1', T455_CLOCK_AT: String(at) });   // ★[T719] 덧 preload(계측 · 없으면 종전)
  const c = spawn(process.execPath, [path.join(dir, 'server/central.js')], { cwd: dir, stdio: 'ignore',
    env: Object.assign({}, env0, { PORT: String(CP), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const PROF = process.argv.includes('--prof') ? path.join(DIR, `prof-${tag}`) : null;   // 기본 끔 — 켜면 존에 V8 CPU 프로파일(10ms 표본 · 자기 시간으로 빈 몫을 찾는다)
  const ZF = (process.env.T1027_ZFLAGS || '').split(' ').filter(Boolean);   // ★[T1027] 존에 덧 V8 · node 깃발(`--trace-gc` · `--trace-deopt` · `--single-threaded-gc` …) — 없으면 종전 그대로
  const z = spawn(process.execPath, [...ZF, ...(process.argv.includes('--shape') ? ['--allow-natives-syntax'] : []), ...(PROF ? ['--cpu-prof', '--cpu-prof-interval', '10000', '--cpu-prof-dir', PROF] : []), path.join(dir, 'server/zone.js')], { cwd: dir, stdio: ['ignore', logf, logf],
    env: Object.assign({}, env0, CONF[conf], { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP),
      CENTRAL_SECRET: SECRET, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY), DB_PATH: DB, VILLAGE_WAR_LOG: '0', T312_FISH_ACT: '1', ...(INV ? { E2E_GIVE: '1' } : {}),   // ★[T945] `/routedbg` 문(테스트 전용 게이트)
      T646_EVERY: String(SLICE_S * 30), T646_SEGONLY: SEG ? '1' : '', T675_SAB: process.argv.includes('--sab') ? '1' : '', T677_BR: process.argv.includes('--br') ? '1' : '', T719_HIST: process.argv.includes('--hist') ? '1' : '', T719_HBR: process.argv.includes('--hbr') ? '1' : '', T670_AFAIL_OUT: path.join(DIR, `${tag}.afail.json`), T646_PATH_OUT: path.join(DIR, `${tag}.dest.json`), T671_TRAP_OUT: process.argv.includes('--trap') ? path.join(DIR, `${tag}.trap.json`) : '', T671_SHAPE_OUT: process.argv.includes('--shape') ? path.join(DIR, `${tag}.shape.jsonl`) : '' }) });
  const getj = async (p) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, { headers: { 'x-zone-secret': SECRET }, signal: AbortSignal.timeout(20000) }); return await r.json(); } catch (e) { return null; } };
  const say = (...a) => console.log(`[${tag}]`, ...a);
  const t0 = Date.now();
  for (let i = 0; i < 900; i++) { try { const r = await fetch(`http://localhost:${ZP}/health`, { signal: AbortSignal.timeout(3000) }); if (r.ok) break; } catch (e) {} await sleep(1000); }
  say('기동', Date.now() - t0, 'ms · 탐침 구간', n);
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const NOOBS = process.argv.includes('--noobs');   // [T675 ①] 관측자 없는 팔(방송 몫 빼기 — 자 맞추기의 대조)
  const ws = NOOBS ? { send() {}, close() {} } : new WS(`ws://localhost:${ZP}/?observer=1`); if (!NOOBS) { ws.on('error', () => {}); ws.on('message', () => {}); }
  const ping = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);
  const phaseNow = async () => { const L = await getj('/lifedbg'); return L && L.phase; };
  const windows = [];
  if (process.argv.includes('--boot-win')) {   // ★[T1011] 부팅 창 — 기동 직후 /perf(되돌림 없이 = 부팅부터 지금까지) 한 번 + 30초 조각 둘(부팅 뒤 바탕 다시 세움 · 확인이 도는 자리)
    const slices = [];
    const p0 = await getj('/perf'), t0b = p0 && p0.tick && p0.tick.ms, pr0 = (p0 && p0.econTick && p0.econTick.probe) || {};
    slices.push({ k: -1, sinceBoot: true, p50: t0b && t0b.p50, p95: t0b && t0b.p95, max: t0b && t0b.max, ticks: p0 && p0.tick && p0.tick.n, t996: pr0.t996 || null, t1011: pr0.t1011 || null });
    say(`boot 부팅부터 · p95 ${t0b ? t0b.p95 : '?'} · max ${t0b ? t0b.max : '?'}`);
    for (let k = 0; k < 2; k++) {
      await getj('/perf?reset=1');
      await sleep(SLICE_S * 1000);
      const p = await getj('/perf'), t = p && p.tick && p.tick.ms, pr = (p && p.econTick && p.econTick.probe) || {};
      slices.push({ k, p50: t && t.p50, p95: t && t.p95, max: t && t.max, ticks: p && p.tick && p.tick.n, t996: pr.t996 || null, t1011: pr.t1011 || null });
      say(`boot 조각 ${k} · p95 ${t ? t.p95 : '?'} · max ${t ? t.max : '?'}`);
    }
    windows.push({ W: 'boot', slices });
  }
  const WINS = [['day', 0.10, 0.62], ['night', 0.72, 0.97]];
  let days0 = null;   // ★[T945] 밤 창 머리(무효화 순간)의 `econTick.days`
  for (const [W, lo, hi] of WINS) {
    let ph = null, inv = null;
    const edge = INV && W === 'night';   // ★[T945] 하루가 닫힐 때까지 재는 창
    const invHere = INV && W === INV_W;   // ★[T968] 무효화를 부르는 창(기본 밤 · `--inv-day` 낮)
    {
    for (let i = 0; i < 1000; i++) { ph = await phaseNow(); if (ph != null && ph >= lo && ph <= hi - (SLICES * SLICE_S) / (DAY / 1000)) break; await sleep(5000); }
    if (edge) { const P0 = await getj('/perf'); days0 = P0 && P0.econTick ? P0.econTick.days | 0 : 0; }
    if (invHere) inv = await getj('/routedbg?invalidate=1');
    say(W, '창 · phase', ph, ...(edge ? ['· econ days', days0] : []), ...(invHere ? ['· 무효화', inv && inv.invalidated] : []));
    }
    const slices = [];
    let closed = 0;   // ★[T945] econ 창 — 그 하루가 닫힌 뒤 잰 조각 수(하나 더 재고 끝)
    for (let k = 0; edge ? (k < 1000 && closed < 2) : k < SLICES; k++) {
      await getj('/perf?reset=1');
      const mt0 = Number(process.hrtime.bigint() / 1000n);   // [T791] 단조 µs(존 표본 토막과 같은 시계)
      const mark = fs.statSync(logp).size;
      await sleep(SLICE_S * 1000);
      const p = await getj('/perf'), L = await getj('/lifedbg');
      const buf = fs.readFileSync(logp).subarray(mark).toString('utf8');
      const ana = buf.split('\n').filter((x) => x.startsWith('[T646] ')).map((x) => { try { return JSON.parse(x.slice(7)); } catch (e) { return null; } }).filter(Boolean);
      const t = p && p.tick && p.tick.ms;
      slices.push({ k, mt0, mt1: Number(process.hrtime.bigint() / 1000n), phase: L && L.phase, p50: t && t.p50, p95: t && t.p95, max: t && t.max, ticks: p && p.tick && p.tick.n, npcs: null, ana, t678: (p && p.walk && p.walk.t678) || null });   // [T678] 문 그래프 관측(켬·견줌 판만)
      if (INV) { const pr = (p && p.econTick && p.econTick.probe) || {}, S = slices[slices.length - 1];   // ★[T945] 캐러밴 셈(줄 수 · probe 누계)
        S.arr = (buf.match(/캐러밴#\d+ 도착:/g) || []).length; S.ret = (buf.match(/귀환 출발/g) || []).length; S.astar = (buf.match(/교역로 A\*:/g) || []).length;
        S.t929 = pr.t929 || null; S.pathJobs = pr.pathJobs | 0; S.pathWait = pr.pathWait | 0; S.routeCold = pr.routeCold | 0;
        S.t957 = pr.t957 || null; S.t968 = pr.t968 || null;   // ★[T968] 거리행렬 조각 · 마감 밖 셈 · 몸 틱 쉰 틱 · 줄 선 장부 요청(누계)
        S.t977 = _t977Lines(buf); S.t996 = pr.t996 || null; S.t1011 = pr.t1011 || null;   // ★[T996] 바탕 다시 세움(누계)   // ★[T977] 거리행렬 일 쪼개 보기 줄(존 `T977_PROBE=1` 일 때만 · 없으면 빈 목록)
        if (edge && p && p.econTick && (p.econTick.days | 0) > days0) closed++;
        if (edge && L && L.phase != null && (L.phase > hi || L.phase < lo)) closed = 2; }   // 밤 창 밖으로 나가면 끝(하루가 창 앞에서 이미 닫혔던 판 — 표에 적는다)
      say(`${W} 조각 ${k} · p50 ${t ? t.p50 : '?'} · p95 ${t ? t.p95 : '?'} · 줄 ${ana.length}`);
    }
    windows.push(Object.assign({ W, slices }, invHere ? { inv: !!(inv && inv.invalidated) } : {}));
  }
  if (process.argv.includes('--inv-after')) {   // ★[T977] 하루가 닫힌 뒤 무효화 한 번 더 — 첫 무효화(부팅 행렬 다음)가 아닌 **둘째 다시 세기**를 잰다 · 조각 둘
    const inv = await getj('/routedbg?invalidate=1');
    say('after 창 · 무효화', inv && inv.invalidated);
    const slices = [];
    for (let k = 0; k < 2; k++) {
      await getj('/perf?reset=1');
      const mt0 = Number(process.hrtime.bigint() / 1000n), mark = fs.statSync(logp).size;
      await sleep(SLICE_S * 1000);
      const p = await getj('/perf'), L = await getj('/lifedbg'), buf = fs.readFileSync(logp).subarray(mark).toString('utf8');
      const t = p && p.tick && p.tick.ms, pr = (p && p.econTick && p.econTick.probe) || {};
      slices.push({ k, mt0, mt1: Number(process.hrtime.bigint() / 1000n), phase: L && L.phase, p50: t && t.p50, p95: t && t.p95, max: t && t.max, ticks: p && p.tick && p.tick.n,
        pathJobs: pr.pathJobs | 0, t957: pr.t957 || null, t968: pr.t968 || null, t977: _t977Lines(buf), t996: pr.t996 || null });
      say(`after 조각 ${k} · p50 ${t ? t.p50 : '?'} · p95 ${t ? t.p95 : '?'}`);
    }
    windows.push({ W: 'after', inv: !!(inv && inv.invalidated), slices });
  }
  clearInterval(ping); try { ws.close(); } catch (e) {}
  if (PROF) { try { z.kill('SIGINT'); } catch (e) {} for (let i = 0; i < 60 && z.exitCode === null; i++) await sleep(1000); }   // 정상 종료라야 프로파일이 써진다
  try { z.kill('SIGKILL'); } catch (e) {} try { c.kill('SIGKILL'); } catch (e) {}
  await sleep(1500); rmdb(DB); rmdb(CDB);
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  fs.writeFileSync(out, JSON.stringify({ conf, tag, probe, ref: REF, seg: SEG, lines: LINES ? { file: LINES, groups: LG } : null, at: new Date().toISOString(), wallS: Math.round((Date.now() - t0) / 1000), windows }));
  say('끝', Math.round((Date.now() - t0) / 1000), 's');
}

function _t977Lines(buf) { return buf.split('\n').filter((x) => x.includes('[T977] ')).map((x) => { try { return JSON.parse(x.slice(x.indexOf('{'))); } catch (e) { return null; } }).filter(Boolean); }   // ★[T977]

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
    { let N = 0, MS = 0, MX = 0, O15 = 0; const HH = new Array(96).fill(0); for (const sl of w.slices) for (const x of sl.ana) if (x.stepH) { N += x.stepN; MS += x.stepMs; if (x.stepMax > MX) MX = x.stepMax; O15 += x.stepO15 || 0; x.stepH.forEach((v, i) => { HH[i] += v; }); }
      if (N) { const q = (p) => { let c = 0; for (let i = 0; i < 96; i++) { c += HH[i]; if (c >= N * p) return +(0.25 * Math.pow(2, (i + 1) / 4)).toFixed(2); } return null; };   // 칸 위 끝(µs)
        A.step = { n: N, avgUs: +(MS / N * 1000).toFixed(3), p50Us: q(0.5), p99Us: q(0.99), p999Us: q(0.999), p9999Us: q(0.9999), maxMs: +MX.toFixed(2), over15: O15 }; } }   // ★[T719] 한 걸음 분포
    { const BB = {}; for (const sl of w.slices) for (const x of sl.ana) if (x.stepB) for (const [k, b] of Object.entries(x.stepB)) { const a = BB[k] || (BB[k] = { h: new Array(96).fill(0), n: 0, ms: 0, mx: 0, o15: 0 }); a.n += b.n; a.ms += b.ms; if (b.mx > a.mx) a.mx = b.mx; a.o15 += b.o15; b.h.forEach((v, i) => { a.h[i] += v; }); }
      for (const [k, a] of Object.entries(BB)) { if (!a.n) continue; const q = (p) => { let c = 0; for (let i = 0; i < 96; i++) { c += a.h[i]; if (c >= a.n * p) return +(0.25 * Math.pow(2, (i + 1) / 4)).toFixed(2); } return null; };
        (A.stepBr || (A.stepBr = {}))[k] = { n: a.n, avgUs: +(a.ms / a.n * 1000).toFixed(3), p50Us: q(0.5), p99Us: q(0.99), p999Us: q(0.999), maxMs: +a.mx.toFixed(2), over15: a.o15 }; } }   // ★[T719 ①] 갈래마다
    if (!A.n) continue;
    const pop = A.popN / A.n, us = (ms) => +(ms / A.n * 1000 / pop).toFixed(3);
    const p50s = w.slices.map((s) => s.p50).filter((x) => x != null), p95s = w.slices.map((s) => s.p95).filter((x) => x != null);
    const r = { conf: j.conf, tag: j.tag, probe: j.probe, W: w.W, pop: Math.round(pop), ticks: A.n, step: A.step || null, stepBr: A.stepBr || null, tickP50: R.median(p50s), tickP95: R.median(p95s), totUs: us(A.tot),
      segUs: Object.fromEntries(Object.entries(A.seg).map(([k, v]) => [k, us(v)])), segSumUs: us(Object.values(A.seg).reduce((s, v) => s + v, 0)),
      subUs: Object.fromEntries(Object.entries(A.sub).map(([k, v]) => [k, us(v)])), subN: Object.fromEntries(Object.entries(A.subN).map(([k, v]) => [k, +(v / A.n).toFixed(1)])),
      hq: Object.fromEntries(Object.entries(A.hq).map(([k, h]) => [k, { n: h.n, sameRate: +(h.same / Math.max(1, h.n)).toFixed(3), gatedRate: +(h.gated / Math.max(1, h.n)).toFixed(3), sameUs: us(h.msSame), diffUs: us(h.msDiff),
        changes: h.cause, runP50: pct(A.runs[k], 0.5), runP95: pct(A.runs[k], 0.95) }])),
      ast: A.ast ? Object.assign({}, A.ast, { insideRate: +(A.ast.inside / Math.max(1, A.ast.inside + A.ast.outside)).toFixed(3), cats: Object.fromEntries(['near', 'beeline', 'straight', 'cooldown', 'fail', 'found'].map((k) => [k, { n: A.ast[k][0], us: us(A.ast[k][1]), perCallUs: A.ast[k][0] ? +(A.ast[k][1] * 1000 / A.ast[k][0]).toFixed(1) : 0 }])) }) : null };
    //   ★[T791] 걸음 몸통 표본(--lines) — 창 안 토막만 모아 몸통 줄 묶음 · 부른 함수 몫을 µs 로(결정 문 µs/사람 × npcStep 몫 × 그 칸 몫)
    if (j.lines && j.lines.file && fs.existsSync(j.lines.file)) {
      const lo = Math.min(...w.slices.map((x) => x.mt0 || Infinity)), hi = Math.max(...w.slices.map((x) => x.mt1 || 0));
      const C = fs.readFileSync(j.lines.file, 'utf8').trim().split('\n').map((x) => { try { return JSON.parse(x); } catch (e) { return null; } }).filter((x) => x && x.t0 >= lo && x.t1 <= hi);
      const T = { chunks: C.length, tot: 0, dec: 0, ns: 0, nsSelf: 0, self: {}, call: {}, dF: {}, dL: {}, c2: {} };
      for (const c of C) { T.tot += c.tot; T.dec += c.dec; T.ns += c.ns; T.nsSelf += c.nsSelf; for (const [k, v] of Object.entries(c.self)) T.self[k] = (T.self[k] || 0) + v; for (const [k, v] of Object.entries(c.call)) T.call[k] = (T.call[k] || 0) + v;
        //   [T791 ①-b] 부른 함수 안쪽(자기 줄 · 두 층 사슬) — 표본기 판에 있을 때만
        for (const [f, o] of Object.entries(c.deep || {})) for (const [ln, v] of Object.entries(o)) { T.dF[f] = (T.dF[f] || 0) + v; T.dL[f + ' #' + ln] = (T.dL[f + ' #' + ln] || 0) + v; }
        for (const [k, v] of Object.entries(c.call2 || {})) T.c2[k] = (T.c2[k] || 0) + v; }
      const decUs = r.segUs['결정 문(순회)'] || 0, stepUs = T.dec ? decUs * T.ns / T.dec : 0, u = (n) => +(T.ns ? stepUs * n / T.ns : 0).toFixed(3);
      const G = j.lines.groups.groups.map(([nm, a0, a1]) => { let n = 0; for (const [ln, v] of Object.entries(T.self)) if (+ln >= a0 && +ln <= a1) n += v; return [nm + ' (' + a0 + '~' + a1 + ')', n, u(n)]; });
      const calls = Object.entries(T.call).sort((x, y) => y[1] - x[1]).map(([k, n]) => [k, n, u(n)]);
      { const inG = G.reduce((t, g) => t + g[1], 0); G.push(['몸통 밖 줄(인라인된 함수 · 다른 파일)', T.nsSelf - inG, u(T.nsSelf - inG)]); }
      const selfTop = Object.entries(T.self).sort((x, y) => y[1] - x[1]).slice(0, 15).map(([ln, n]) => [+ln, n, u(n)]);
      const top = (o, n) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, v]) => [k, v, u(v)]);
      r.lines = { chunks: T.chunks, samples: T.tot, decSamples: T.dec, stepSamples: T.ns, decUs, stepUs: +stepUs.toFixed(3), selfUs: u(T.nsSelf), groups: G, calls: calls.slice(0, 20), selfTop,
        deepFn: top(T.dF, 20), deepTop: top(T.dL, 25), call2: top(T.c2, 15) };
    }
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
