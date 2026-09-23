#!/usr/bin/env node
// === scripts/t381-path-cost.js — `pfFindPath` 한 번이 **왜** 1.55ms 인가 (T381 ①) =====
//
// ⚠계측기다(러너 밖 · `@regress` 없음). **제품 코드는 한 글자도 안 만진다** —
//   탐침은 `git worktree` 로 뜬 **사본**에만 박고(zone.js · sim/path-core.js 둘 다 사본),
//   그 사본을 돌린 뒤 지운다(카드 §1: 제품 손잡이 0 · `sim/` 무접촉 · `path-core.js` 무접촉).
//
// ★무엇을 세나 — T370 이 "A* 갈래의 90.9%는 `pfFindPath` 한 번 1.55ms · 틱마다 1.2회" 를 냈고,
//   이 카드는 **왜 1.55ms 인가**를 묻는다. 추측하지 않는다 — 호출마다 센다:
//     · 탐색한 셀 수(`_search` 의 `pops`) — 히스토그램
//     · 나간 문 넷: `found`(찾음) · `capped`(`maxCells` 1500 에 닿음) · `exhaust`(힙이 비었다 = 반경
//       상자 안을 다 훑고 못 찾음) · `radius`(`cellDist > searchRadiusCells` 로 **탐색도 안 하고** null)
//     · 문마다 ms 합 — 1.55ms 의 **주인**이 어느 문인가
//     · 결과(null 비율) · 경로 웨이포인트 수 · 출발→목표 직선 거리
//     · ★**목표가 출발과 같은 뭍 덩어리인가**(= 강 건너인가) — T360 `t360-border --labels` 가 떨군
//       그 자를 **그대로** 읽는다(자를 두 번 적지 않는다 · T333 규율)
//     · 주민 행동(`behavior`) · 목표가 집(침대/집터 48px 안)인가 · 마을
//     · ★**몸 비비기**(재민 실기 09-23 "강에 대고 몸 비비느라 집으로 못 간다"): `computeNpcPath` 가
//       null 이라 beeline 이 들어간 뒤 **5초 동안** 그 주민이 32px 도 못 움직이고 물가(1셀)에 서 있나.
//
// 자는 T356/T370 그대로다(관측자 규약 · `performance.now()` · 시계값 자가 보정 · 사본에만 박는다).
//
// 실행: node scripts/t381-path-cost.js [out.json]
//   ARMS=why(기본) · WINDOW=day|night · SLICE_S=30 · SLICES=8 · PORT_BASE=4000 · TPL=/tmp/t316-tpl.db
//   T381_LAB=/tmp/t381-lab-hanbando.bin  ← `node scripts/t360-border.js --zone hanbando --labels <그 파일>`
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/t381-path-cost.json';
const ARMS = (process.env.ARMS || 'why').split(',').map((s) => s.trim()).filter(Boolean);
const PB = parseInt(process.env.PORT_BASE || '4000', 10);
const DAY_MS = parseInt(process.env.DAY_MS || '1440000', 10);
const SLICE_S = parseInt(process.env.SLICE_S || '30', 10);
const SLICES = parseInt(process.env.SLICES || '8', 10);
const TPL = process.env.TPL || '/tmp/t316-tpl.db';
const LAB = process.env.T381_LAB || '/tmp/t381-lab-hanbando.bin';
const WINDOW = (process.env.WINDOW || 'day').trim();
const W_LO = WINDOW === 'day' ? 0.10 : 0.72, W_HI = WINDOW === 'day' ? 0.62 : 0.97;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

// ── 탐침 ① — `sim/path-core.js` 사본: 탐색 커널이 **몇 칸을 꺼냈나**를 내놓는다 ──────────
const CORE_PATCHES = [
  { find: `function _search(sx, sy, gx, gy, o) {
  return _searchStep(_searchBegin(sx, sy, gx, gy, o), 0).path;
}`,
    repl: `const _PCSTAT = { pops: 0, found: false, open: 0, max: 0 };
function _search(sx, sy, gx, gy, o) {
  const S = _searchBegin(sx, sy, gx, gy, o);
  const r = _searchStep(S, 0);
  _PCSTAT.pops = S.pops; _PCSTAT.found = S.found; _PCSTAT.open = S.open.size; _PCSTAT.max = o.maxPops;
  return r.path;
}` },
  { find: "const PathCore = { localPath, routePath, smoothPath, routePathBegin, pathStep, ORTHO, DIAG };",
    repl: "const PathCore = { localPath, routePath, smoothPath, routePathBegin, pathStep, ORTHO, DIAG, _pcstat: _PCSTAT };" },
];

// ── 탐침 ② — `server/zone.js` 사본: 머리 ────────────────────────────────────────────
const PROBE_HEAD = `
// ── [T381 탐침 · 계측기가 박았다 · 제품엔 없다] ────────────────────────────
const _pcPerf = require('perf_hooks').performance;
const _pcT = () => _pcPerf.now();
// 뭍 덩어리 딱지 — T360 t360-border 가 --labels 로 떨군 **그 자** 그대로(사본 0).
const _PCLAB = (() => {
  const f = process.env.T381_LAB || '';
  if (!f) { console.log('[PC] 딱지 없음(T381_LAB 미지정)'); return null; }
  try {
    const fs2 = require('fs');
    const buf = fs2.readFileSync(f);
    const nl = buf.indexOf(10);
    const head = JSON.parse(buf.slice(0, nl).toString('utf8'));
    const o = nl + 1, n = head.NX * head.NY;
    const lab = new Int32Array(n); Buffer.from(lab.buffer).set(buf.subarray(o, o + n * 4));
    const kind = new Uint8Array(n); kind.set(buf.subarray(o + n * 4, o + n * 5));
    let main = 0, best = 0; const cnt = new Map();
    for (let i = 0; i < n; i += 97) { const v = lab[i]; if (v) cnt.set(v, (cnt.get(v) || 0) + 1); }
    for (const [k, v] of cnt) if (v > best) { best = v; main = k; }
    console.log('[PC] 딱지 ' + head.zone + ' ' + head.NX + 'x' + head.NY + ' · 본토 #' + main);
    return { NX: head.NX, NY: head.NY, SZ: head.SZ, lab, kind, main };
  } catch (e) { console.log('[PC] 딱지 못 읽음 ' + e.message); return null; }
})();
function _pcIdx(px, py) {
  if (!_PCLAB) return -1;
  const cx = Math.floor(px / _PCLAB.SZ), cy = Math.floor(py / _PCLAB.SZ);
  if (cx < 0 || cy < 0 || cx >= _PCLAB.NX || cy >= _PCLAB.NY) return -1;
  return cy * _PCLAB.NX + cx;
}
function _pcLab(px, py) { const i = _pcIdx(px, py); return i < 0 ? -1 : _PCLAB.lab[i]; }
function _pcKind(px, py) { const i = _pcIdx(px, py); return i < 0 ? 0 : _PCLAB.kind[i]; }
function _pcNearWater(px, py) {    // 1셀 안에 물칸이 있나 — "물가"
  if (!_PCLAB) return false;
  const cx = Math.floor(px / _PCLAB.SZ), cy = Math.floor(py / _PCLAB.SZ);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x >= _PCLAB.NX || y >= _PCLAB.NY) continue;
    if (_PCLAB.kind[y * _PCLAB.NX + x] === 2) return true;
  }
  return false;
}
function _pcSegWater(x0, y0, x1, y1) {   // 직선이 물칸을 지나나 — "강에 대고 비빈다"의 직접 증인
  if (!_PCLAB) return false;
  const d = Math.hypot(x1 - x0, y1 - y0), st = Math.min(200, Math.ceil(d / 32));
  for (let i = 1; i <= st; i++) { if (_pcKind(x0 + (x1 - x0) * i / st, y0 + (y1 - y0) * i / st) === 2) return true; }
  return false;
}
const _PCB = [1, 2, 5, 17, 65, 257, 1025, 1500, 1e9];   // pops 버킷 경계(있는 수 1500 을 칸으로 쓴다)
function _pcBucket(v) { let k = 0; while (k < _PCB.length && v >= _PCB[k]) k++; return k; }
const _PC = {
  n: 0, pop: 0, every: parseInt(process.env.T381_EVERY || '900', 10), clockNs: 0,
  call: 0, ms: 0, popsSum: 0, popsMax: 0,
  ex: { found: 0, capped: 0, exhaust: 0, radius: 0, same: 0 },
  msEx: { found: 0, capped: 0, exhaust: 0, radius: 0, same: 0 },
  popsEx: { found: 0, capped: 0, exhaust: 0 },
  // ★교차표 — 나간 문 × 목표 칸 종류(land/wet/rock). 고칠 자리를 정하는 칸이 여기다.
  xN: {}, xMs: {}, xPops: {},
  srcWet: 0, srcRock: 0, afterUnstuck: 0, jobWet: {},
  // ★손잡이 후보를 **그 손잡이의 술어로** 잰다 — 딱지(t360 자)가 아니라 제품의 정본으로.
  gDead: 0, gDeadMs: 0, xGD: {}, xGDms: {},        // 목표 셀 중심이 isTerrainBlockedLocal 인가(후보 '도달불능 거르기')
  sDead: 0,                                         // 출발 셀 중심도 그런가
  dup: 0, dupMs: 0, dupSelf: 0, dupOther: 0,        // 2초 안에 같은 (출발 셀,목표 셀) 쌍이 또 왔나(후보 ⓑ)
  dCell: {}, dCellN: {},                            // 문별 출발→목표 격자 거리 평균(searchRadiusCells 64 가 닿나)
  _seen: new Map(),
  hist: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  nullN: 0, wpSum: 0, wpN: 0, dSum: 0, dN: 0, dMax: 0,
  cross: 0, crossNull: 0, crossMs: 0, sameIsl: 0, tgtWet: 0, tgtRock: 0, labUnk: 0,
  beh: {}, behCross: {}, homeTgt: 0, homeCross: 0, vilCross: {},
  beeline: 0, beelineWet: 0, watchOn: 0, wetStop: 0, dryStop: 0, moved: 0,
  unstuck: 0,
  cal() { const P = 300000, a = _pcT(); for (let i = 0; i < P; i++) { const x = _pcT(); if (x < 0) console.log(x); } this.clockNs = (_pcT() - a) * 1e6 / P; },
  rep() {
    this.n++;
    if (this.n < this.every) return;
    if (!this.clockNs) this.cal();
    try {
      console.log('[PC] ' + JSON.stringify({ n: this.n, pop: this.pop, phase: +worldPhase(Date.now()).toFixed(4),
        call: this.call, ms: +this.ms.toFixed(2), popsSum: this.popsSum, popsMax: this.popsMax,
        ex: this.ex, msEx: { found: +this.msEx.found.toFixed(2), capped: +this.msEx.capped.toFixed(2),
          exhaust: +this.msEx.exhaust.toFixed(2), radius: +this.msEx.radius.toFixed(3), same: +this.msEx.same.toFixed(3) },
        popsEx: this.popsEx, hist: this.hist,
        xN: this.xN, xMs: Object.fromEntries(Object.entries(this.xMs).map(([k, v]) => [k, +v.toFixed(2)])), xPops: this.xPops,
        srcWet: this.srcWet, srcRock: this.srcRock, afterUnstuck: this.afterUnstuck, jobWet: this.jobWet,
        gDead: this.gDead, gDeadMs: +this.gDeadMs.toFixed(2), xGD: this.xGD,
        xGDms: Object.fromEntries(Object.entries(this.xGDms).map(([k, v]) => [k, +v.toFixed(2)])), sDead: this.sDead,
        dup: this.dup, dupMs: +this.dupMs.toFixed(2), dupSelf: this.dupSelf, dupOther: this.dupOther,
        dCell: Object.fromEntries(Object.entries(this.dCell).map(([k, v]) => [k, +(v / this.dCellN[k]).toFixed(1)])),
        nullN: this.nullN, wpAvg: this.wpN ? +(this.wpSum / this.wpN).toFixed(1) : 0,
        dAvg: this.dN ? +(this.dSum / this.dN).toFixed(0) : 0, dMax: +this.dMax.toFixed(0),
        cross: this.cross, crossNull: this.crossNull, crossMs: +this.crossMs.toFixed(2),
        sameIsl: this.sameIsl, tgtWet: this.tgtWet, tgtRock: this.tgtRock, labUnk: this.labUnk,
        beh: this.beh, behCross: this.behCross, homeTgt: this.homeTgt, homeCross: this.homeCross, vilCross: this.vilCross,
        beeline: this.beeline, beelineWet: this.beelineWet,
        watchOn: this.watchOn, wetStop: this.wetStop, dryStop: this.dryStop, moved: this.moved,
        unstuck: this.unstuck, clockNs: +this.clockNs.toFixed(1) }));
    } catch (e) {}
    this.n = 0; this.call = 0; this.ms = 0; this.popsSum = 0; this.popsMax = 0;
    this.ex = { found: 0, capped: 0, exhaust: 0, radius: 0, same: 0 };
    this.msEx = { found: 0, capped: 0, exhaust: 0, radius: 0, same: 0 };
    this.popsEx = { found: 0, capped: 0, exhaust: 0 };
    this.xN = {}; this.xMs = {}; this.xPops = {};
    this.srcWet = 0; this.srcRock = 0; this.afterUnstuck = 0; this.jobWet = {};
    this.gDead = 0; this.gDeadMs = 0; this.xGD = {}; this.xGDms = {}; this.sDead = 0;
    this.dup = 0; this.dupMs = 0; this.dupSelf = 0; this.dupOther = 0;
    this.dCell = {}; this.dCellN = {};
    this.hist = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    this.nullN = 0; this.wpSum = 0; this.wpN = 0; this.dSum = 0; this.dN = 0; this.dMax = 0;
    this.cross = 0; this.crossNull = 0; this.crossMs = 0; this.sameIsl = 0; this.tgtWet = 0; this.tgtRock = 0; this.labUnk = 0;
    this.beh = {}; this.behCross = {}; this.homeTgt = 0; this.homeCross = 0; this.vilCross = {};
    this.beeline = 0; this.beelineWet = 0; this.watchOn = 0; this.wetStop = 0; this.dryStop = 0; this.moved = 0;
    this.unstuck = 0;
  },
  tally(npc, wp, ms, st, d) {
    this.call++; this.ms += ms;
    const ran = st.pops >= 0;
    let door;
    if (!ran) door = wp ? 'same' : 'radius';
    else if (st.found) door = 'found';
    else if (st.pops > st.max) door = 'capped';
    else door = 'exhaust';
    this.ex[door]++; this.msEx[door] += ms;
    if (ran) {
      this.popsSum += st.pops; if (st.pops > this.popsMax) this.popsMax = st.pops;
      this.hist[_pcBucket(st.pops)]++;
      if (this.popsEx[door] !== undefined) this.popsEx[door] += st.pops;
    }
    if (!wp) this.nullN++; else { this.wpSum += wp.length; this.wpN++; }
    this.dSum += d; this.dN++; if (d > this.dMax) this.dMax = d;
    // 강 건너 — T360 자
    const la = _pcLab(npc.x, npc.y), lb = _pcLab(npc.targetX, npc.targetY);
    const kb = _pcKind(npc.targetX, npc.targetY);
    if (kb === 2) this.tgtWet++; else if (kb === 3) this.tgtRock++;
    const kn = kb === 2 ? 'wet' : kb === 3 ? 'rock' : 'land';
    const key = door + ':' + kn;
    this.xN[key] = (this.xN[key] || 0) + 1;
    this.xMs[key] = (this.xMs[key] || 0) + ms;
    if (ran) this.xPops[key] = (this.xPops[key] || 0) + st.pops;
    const ka = _pcKind(npc.x, npc.y);
    if (ka === 2) this.srcWet++; else if (ka === 3) this.srcRock++;
    if (npc._pcUn && Date.now() - npc._pcUn < 2000) this.afterUnstuck++;
    if (kb === 2) { const j = npc.npcJob || '?'; this.jobWet[j] = (this.jobWet[j] || 0) + 1; }
    // ★후보 '도달불능 거르기' — A* 의 간선 술어(isWaterFn = isTerrainBlockedLocal)를 **목표 셀 중심**에 그대로 댄다
    const B = BUILDING_SIZE, H = B / 2;
    const gcx = Math.floor(npc.targetX / B), gcy = Math.floor(npc.targetY / B);
    const scx = Math.floor(npc.x / B), scy = Math.floor(npc.y / B);
    const gd = isTerrainBlockedLocal(gcx * B + H, gcy * B + H);
    if (gd) { this.gDead++; this.gDeadMs += ms; this.xGD[door] = (this.xGD[door] || 0) + 1; this.xGDms[door] = (this.xGDms[door] || 0) + ms; }
    if (isTerrainBlockedLocal(scx * B + H, scy * B + H)) this.sDead++;
    // ★후보 ⓑ — 2초 안에 같은 (출발 셀, 목표 셀) 쌍이 또 오나
    const pk = scx + '_' + scy + '_' + gcx + '_' + gcy, nw = Date.now();
    const prev = this._seen.get(pk);
    if (prev && nw - prev.t < 2000) { this.dup++; this.dupMs += ms; if (prev.id === npc.playerId) this.dupSelf++; else this.dupOther++; }
    this._seen.set(pk, { t: nw, id: npc.playerId });
    if (this._seen.size > 40000) { for (const [k, v] of this._seen) { if (nw - v.t >= 2000) this._seen.delete(k); } }
    const dc = Math.abs(gcx - scx) + Math.abs(gcy - scy);
    this.dCell[door] = (this.dCell[door] || 0) + dc; this.dCellN[door] = (this.dCellN[door] || 0) + 1;
    let crossed = false;
    if (la <= 0 || lb < 0) this.labUnk++;
    else if (lb === 0) { /* 목표가 뭍이 아니다 — 위에서 셌다 */ }
    else if (la === lb) this.sameIsl++;
    else { crossed = true; this.cross++; this.crossMs += ms; if (!wp) this.crossNull++; }
    const bh = npc.behavior || '?';
    this.beh[bh] = (this.beh[bh] || 0) + 1;
    if (crossed) this.behCross[bh] = (this.behCross[bh] || 0) + 1;
    const hx = npc.npcBedX != null ? npc.npcBedX : npc.npcHomeX, hy = npc.npcBedY != null ? npc.npcBedY : npc.npcHomeY;
    if (hx != null && Math.hypot(npc.targetX - hx, npc.targetY - hy) < 48) { this.homeTgt++; if (crossed) this.homeCross++; }
    if (crossed && npc.simVillageId) this.vilCross[npc.simVillageId] = (this.vilCross[npc.simVillageId] || 0) + 1;
    // 몸 비비기 감시 시작 — 못 찾았으면 5초 뒤에 이 주민이 어디 서 있나 본다
    if (!wp && !npc._pcW) { npc._pcW = Date.now(); npc._pcWx = npc.x; npc._pcWy = npc.y; this.watchOn++; }
  },
  watchDone(npc) {
    const mv = Math.hypot(npc.x - npc._pcWx, npc.y - npc._pcWy);
    if (mv >= 32) this.moved++;
    else if (_pcNearWater(npc.x, npc.y)) this.wetStop++;
    else this.dryStop++;
    npc._pcW = 0;
  },
};
`;

const PATCHES = [
  { find: "const _SEED = require('./seed-rand');",
    repl: "const _SEED = require('./seed-rand');\n__PROBE_HEAD__" },
  { find: "}, TICK_MS);",
    repl: "  _PC.pop = npcs.size; _PC.rep();\n}, TICK_MS);" },
  // ★A* 한 번 — 시계와 커널 셈을 양쪽에서 집는다(식 무접촉 · 반환 무변)
  // ⚠T381 ② 가 `_lastAStarAt` 과 `pfFindPath` 사이에 손잡이를 넣었다 —
  //   자는 **지금 고치는 그 글자**를 재야 하므로 앵커를 호출 줄 하나로 좁힌다(T370 에서 배운 것).
  { find: "  const wp = pfFindPath(npc.x, npc.y, npc.targetX, npc.targetY, {",
    repl: "  const _pcS = _pcT(); PathCore._pcstat.pops = -1;\n  const wp = pfFindPath(npc.x, npc.y, npc.targetX, npc.targetY, {" },
  { find: "  if (!wp || wp.length < 3 || !isVil) return wp;",
    repl: "  _PC.tally(npc, wp, _pcT() - _pcS, PathCore._pcstat, d);\n  if (!wp || wp.length < 3 || !isVil) return wp;" },
  // ★beeline 이 들어가는 자리 — 못 찾으면 목표로 직선을 꽂는다(재민 실기의 자리)
  { find: `  if (needPath && !_skip) {
    const p = computeNpcPath(npc, now);
    npc.path = p || [{ x: npc.targetX, y: npc.targetY }]; // 못 찾으면 beeline`,
    repl: `  if (npc._pcW && now - npc._pcW >= 5000) _PC.watchDone(npc);
  if (needPath && !_skip) {
    const p = computeNpcPath(npc, now);
    if (!p) { _PC.beeline++; if (_pcSegWater(npc.x, npc.y, npc.targetX, npc.targetY)) _PC.beelineWet++; }
    npc.path = p || [{ x: npc.targetX, y: npc.targetY }]; // 못 찾으면 beeline` },
  { find: "function unstuckNpc(npc, now) {",
    repl: "function unstuckNpc(npc, now) {\n  _PC.unstuck++; npc._pcUn = now;" },
];

function makeArm(arm, dir) {
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  execFileSync('git', ['worktree', 'add', '--detach', '-q', dir, 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
  try { fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules')); } catch (e) {}
  // ★워크트리는 **커밋된 HEAD** 를 떠 온다 — 아직 커밋 안 한 수술은 안 따라온다(T370 에서 한 번 빠졌다).
  //   ⇒ 작업트리에서 **바뀐 파일만** 덮어쓴다. 자가 재는 것이 지금 고치고 있는 그 글자여야 한다.
  try {
    const dirty = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: ROOT }).toString().split('\n').filter(Boolean);
    for (const f of dirty) { const src = path.join(ROOT, f), dst = path.join(dir, f);
      if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); } }
    if (dirty.length) console.log(`  [${arm}] 작업트리에서 덮어쓴 파일 ${dirty.length}개: ${dirty.join(' · ')}`);
  } catch (e) {}
  if (/^(base|fix|off|on)$/.test(arm)) return 0;   // 탐침 0 인 팔 — 값을 재는 짝(켬/끔 · 관측자 규약)
  let n = 0;
  const cp = path.join(dir, 'sim', 'path-core.js');
  let cs = fs.readFileSync(cp, 'utf8');
  for (const p of CORE_PATCHES) {
    const cnt = cs.split(p.find).length - 1;
    if (cnt !== 1) throw new Error(`core 앵커가 ${cnt}개다(1이어야 한다): ${p.find.slice(0, 50)}`);
    cs = cs.replace(p.find, () => p.repl); n++;
  }
  fs.writeFileSync(cp, cs);
  execFileSync(process.execPath, ['--check', cp]);
  const zp = path.join(dir, 'server', 'zone.js');
  let s = fs.readFileSync(zp, 'utf8');
  for (const p of PATCHES) {
    const cnt = s.split(p.find).length - 1;
    if (cnt !== 1) throw new Error(`탐침 앵커가 ${cnt}개다(1이어야 한다): ${p.find.slice(0, 60)}`);
    s = s.replace(p.find, () => p.repl.replace('__PROBE_HEAD__', () => PROBE_HEAD));   // ★함수 치환 — `$` 가 든 글자를 문자열로 넘기면 `$&` 로 먹힌다
    n++;
  }
  fs.writeFileSync(zp, s);
  execFileSync(process.execPath, ['--check', zp]);
  return n;
}

async function runArm(arm, idx) {
  const dir = `/tmp/wt-t381-${arm}`;
  const probes = makeArm(arm, dir);
  const CP = PB + idx * 4, ZP = CP + 1;
  const SECRET = 't381-' + arm;
  const DB = `/tmp/t381-z-${arm}.db`, CDB = `/tmp/t381-c-${arm}.db`;
  rmdb(DB); rmdb(CDB);
  for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, DB + s); } catch (e) {} }
  const logf = fs.openSync(`/tmp/t381-${arm}.log`, 'w');
  const c = spawn(process.execPath, [path.join(dir, 'server/central.js')], { cwd: dir, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(dir, 'server/zone.js')], { cwd: dir, stdio: ['ignore', logf, logf],
    env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP),
      CENTRAL_SECRET: SECRET, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS), DB_PATH: DB, VILLAGE_WAR_LOG: '0',
      T312_FISH_ACT: '1', T381_EVERY: String(SLICE_S * 30), T381_LAB: LAB,
      T381_PATH_DEAD: /(^on$|^whyDead$|^fix$)/.test(arm) ? '1' : (process.env.T381_PATH_DEAD || '') }) });
  const getj = async (p, h) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, h ? { headers: h } : undefined); return await r.json(); } catch (e) { return null; } };
  const perf = (reset) => getj(`/perf${reset ? '?reset=1' : ''}`, { 'x-zone-secret': SECRET });
  const life = () => getj('/lifedbg', { 'x-zone-secret': SECRET });
  const health = async () => { try { const r = await fetch(`http://localhost:${ZP}/health`); return r.ok; } catch (e) { return false; } };
  const say = (...a) => console.log(`[${arm}]`, ...a);

  const t0 = Date.now();
  for (let i = 0; i < 900 && !(await health()); i++) await sleep(1000);
  say('기동', Date.now() - t0, 'ms · 탐침', probes);
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
  const ping = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);
  await sleep(25000);
  let ph = null;
  for (let i = 0; i < 2000; i++) {
    const L = await life(); ph = L && L.phase;
    if (ph != null && ph >= W_LO && ph <= W_HI - (SLICES * SLICE_S) / (DAY_MS / 1000)) break;
    await sleep(5000);
  }
  say(WINDOW + ' 창 진입 · phase', ph);
  const slices = [];
  for (let k = 0; k < SLICES; k++) {
    await perf(true);
    const mark = fs.statSync(`/tmp/t381-${arm}.log`).size;
    await sleep(SLICE_S * 1000);
    const p = await perf(false), L = await life();
    const t = p && p.tick && p.tick.ms;
    const buf = fs.readFileSync(`/tmp/t381-${arm}.log`).subarray(mark).toString('utf8');   // ★바이트로 자른다(한글 로그에서 문자 자리로 자르면 줄을 잃는다)
    const ana = buf.split('\n').filter((x) => x.startsWith('[PC] ')).map((x) => { try { return JSON.parse(x.slice(5)); } catch (e) { return null; } }).filter(Boolean);
    let nonSleep = 0;
    for (const v of ((L && L.villages) || [])) for (const [kk, n] of Object.entries(v.acts || {})) if (kk !== '취침') nonSleep += n;
    slices.push({ k, phase: L && L.phase, p50: t && t.p50, p95: t && t.p95, ticks: p.tick.n,
      pop: (L && L.totals && L.totals.pop) || 0, nonSleep, drop: p.tick.dropN, lag: p.tick.lagPct,
      walk: p.walk || null, ana });
    say(`조각 ${k} phase ${L && L.phase != null ? L.phase.toFixed(3) : '?'} · p50 ${t ? t.p50 : '?'}ms · 비취침 ${nonSleep} · PC줄 ${ana.length}`);
  }
  clearInterval(ping); try { ws.close(); } catch (e) {}
  try { z.kill(); } catch (e) {} try { c.kill(); } catch (e) {}
  await sleep(1500); rmdb(DB); rmdb(CDB);
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  return { arm, probes, slices };
}

(async () => {
  if (process.env.PATCH_ONLY === '1') {
    const d = '/tmp/wt-t381-dry';
    const n = makeArm(process.env.ARMS || 'why', d);
    const z = fs.readFileSync(path.join(d, 'server', 'zone.js'), 'utf8');
    const c = fs.readFileSync(path.join(d, 'sim', 'path-core.js'), 'utf8');
    console.log('박은 탐침', n, '· _PC 자리', (z.match(/_PC\./g) || []).length, '· _pcstat', (c.match(/_PCSTAT/g) || []).length);
    console.log('머리 온전:', z.includes('const _PC = {\n  n: 0, pop: 0'), '· 보고줄:', z.includes("console.log('[PC] '"), '· tally:', (z.match(/_PC\.tally\(/g) || []).length);
    try { execFileSync('git', ['worktree', 'remove', '--force', d], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
    process.exit(0);
  }
  const res = [];
  for (let i = 0; i < ARMS.length; i++) {
    res.push(await runArm(ARMS[i], i));
    fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), WINDOW, DAY_MS, SLICE_S, SLICES, TPL, LAB, arms: res }, null, 1));
  }
  console.log('끝 →', OUT);
  process.exit(0);
})();
