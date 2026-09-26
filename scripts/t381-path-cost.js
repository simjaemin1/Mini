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
    repl: `const _PCSTAT = { pops: 0, found: false, open: 0, max: 0, bx0: 0, bx1: 0, by0: 0, by1: 0, rmax: 0, sx: 0, sy: 0 };
function _search(sx, sy, gx, gy, o) {
  const S = _searchBegin(sx, sy, gx, gy, o);
  _PCSTAT.bx0 = S.sx; _PCSTAT.bx1 = S.sx; _PCSTAT.by0 = S.sy; _PCSTAT.by1 = S.sy; _PCSTAT.rmax = 0; _PCSTAT.sx = S.sx; _PCSTAT.sy = S.sy;
  const r = _searchStep(S, 0);
  _PCSTAT.pops = S.pops; _PCSTAT.found = S.found; _PCSTAT.open = S.open.size; _PCSTAT.max = o.maxPops;
  return r.path;
}` },
  // ★[T399 ①] 꺼낸 칸이 **어디까지** 퍼졌나 — 테두리 상자와 출발에서 가장 먼 맨해튼 거리(탐색 한 번에 네 비교)
  { find: "    if (++S.pops > maxPops) break;   // 예산 가드",
    repl: "    if (++S.pops > maxPops) break;   // 예산 가드\n    if (cur.x < _PCSTAT.bx0) _PCSTAT.bx0 = cur.x; else if (cur.x > _PCSTAT.bx1) _PCSTAT.bx1 = cur.x;\n    if (cur.y < _PCSTAT.by0) _PCSTAT.by0 = cur.y; else if (cur.y > _PCSTAT.by1) _PCSTAT.by1 = cur.y;\n    { const _r = Math.abs(cur.x - _PCSTAT.sx) + Math.abs(cur.y - _PCSTAT.sy); if (_r > _PCSTAT.rmax) _PCSTAT.rmax = _r; }" },
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
  ex: { found: 0, capped: 0, exhaust: 0, radius: 0, same: 0, endpoint: 0 },
  msEx: { found: 0, capped: 0, exhaust: 0, radius: 0, same: 0, endpoint: 0 },
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
  // ★"그 주민이 어디로 가려 했나"(카드 ①) — 막힌 목표(gd)의 **생활 라벨**·**직업**·**튕김 무작위 도약에서 왔나**
  gdAct: {}, gdJob: {}, gdHop: 0, gdHopMs: 0, lvAct: {},
  // ★목표를 **누가** 줬나 — 생활 층이 그 결정을 안 잡아(npcLifeTick 거짓) zone ⑤ 배회로 떨어졌나 · 목표가 일터 상자(±80) 안인가
  gdFall: 0, gdWork: 0, gdWorkDead: 0, lvFall: 0,
  workN: 0, workDead: 0, workCensus: 0,               // 전수: 주민의 npcWorkX/Y 가 막힌 칸인가(보고 한 번마다 한 번 센다)
  hist: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  nullN: 0, wpSum: 0, wpN: 0, dSum: 0, dN: 0, dMax: 0,
  cross: 0, crossNull: 0, crossMs: 0, sameIsl: 0, tgtWet: 0, tgtRock: 0, labUnk: 0,
  beh: {}, behCross: {}, homeTgt: 0, homeCross: 0, vilCross: {},
  beeline: 0, beelineWet: 0, watchOn: 0, wetStop: 0, dryStop: 0, moved: 0,
  unstuck: 0,
  // ★반례 자(T370 자 + 카드 ③) — **부르는 자리와 무관하게** 사람 쪽에서 잰다(손잡이가 호출을 없애도 자가 안 흔들린다)
  //   여행 = 주민이 새 목표(48px 넘게 먼 곳)를 받은 순간부터 그 목표에 '도착'(followNpcPath 참)까지.
  //   목표 셀이 막힌 여행(dead)과 열린 여행(live)을 가른다 — 손잡이가 건드리는 건 dead 뿐이어야 한다.
  trSt: [0, 0], trDone: [0, 0], trAb: [0, 0], trH: {},    // [live, dead] · trH = live 도착 시간 250ms 칸
  // ★[T394] 막힌 여행(dead)이 **어디서** 왔나 — 결정 때 잰다(손잡이가 A* 를 안 불러도 자가 안 흔들린다)
  trDeadFall: 0, trDeadWork: 0, trDeadHop: 0, t394Moves: 0,
  // ★[T399 ①] 1500 × 뭍 — 열린 목표인데 칸을 다 태운 호출의 해부
  cl: 0, clMs: 0, clD: [0, 0, 0, 0, 0, 0], clDsum: 0, clEsum: 0,       // 거리 칸(맨해튼) 분포: <8 · 8~16 · 16~32 · 32~48 · 48~64 · >64
  clBoxSum: 0, clRmaxSum: 0, clRmaxHist: [0, 0, 0, 0, 0],             // 1500 칸이 덮은 테두리 넓이 · 가장 먼 맨해튼(<8·8~16·16~24·24~32·>32)
  clSrc: {}, clAct: {}, clFall: 0, clHop: 0, clHome: 0, clWork: 0, clTask: {},
  rr: 0, rrMs: 0, rrNeed: [0, 0, 0, 0, 0], rrNever: 0, rrNeedSum: 0, rrLenSum: 0, rrDSum: 0, rrSkip: 0, rrLast: -1,   // 풀어서 다시: 1.5~3k·3~6k·6~12k·12~24k·24k+ · 못 닿음
  rrBoxSum: 0,
  hop: 0, hopDead: 0,                                                 // ② 튕겨냄 무작위 도약 · 그 목표 셀이 막혔나
  rq: 0, rqMs: 0, rqNo: 0, rqMax: 0, rqT: { n: 0, ms: 0, no: 0, max: 0, slow: 0 },   // rqT = 기동부터 누계(안 지운다 · slow = 한 번이 틱 하나(TICK_MS) 넘음)                                  // ★[T427 ①] 현장 도달 술어(npcCanReach) — 부른 수·시간·못 닿음·가장 긴 한 번
  rrRaw: [],                                                          // ★[T399 ①] 풀어서 다시의 필요 칸 원값(분포를 칸 단위로)
  clSrc2: {}, clSrcD: {}, clPairs: new Map(), clPairN: 0, clPairD: new Map(),             // 출처(목표 = 도약 점인가로 가른다) · 출처별 거리 합 · 같은 (사람, 목표) 쌍
  snapN: 0, stopWet: 0, stopDry: 0, going: 0,             // 5초 표본 — 목표가 12px 넘게 먼 주민이 5초에 32px 도 못 갔나
  // ⚠첫 판은 목표 글자가 바뀌면 표본을 새로 떴다 — 그런데 몸 비비는 주민은 **튕김이 1.5초마다** 오고 셋째에
  //   무작위 도약(새 목표)이 붙어 목표가 4.5초마다 바뀐다 ⇒ 5초 창에 한 번도 못 닿아 표본 0 이었다(자가 틀렸다).
  //   ⇒ 목표 글자와 **무관하게** 잰다: 5초 동안 줄곧 먼 목표(12px 초과)를 가진 주민이 32px 도 못 갔나.
  // ⚠둘째 판도 0 이었다 — npcs 는 **pid 의 Set** 이다(zone.js 정의: "pid 모음"). npcs.values() 는 문자열을
  //   내주므로 npc.simVillageId 가 늘 undefined 였다(자가 아무것도 안 봤다). 몸은 players 에 있다.
  snap() {
    const now = Date.now();
    for (const pid of npcs) {
      const npc = players.get(pid);
      if (!npc || !npc.simVillageId) continue;
      if (npc.targetX == null || Math.hypot(npc.x - npc.targetX, npc.y - npc.targetY) <= 12) { npc._snT = 0; continue; }
      if (!npc._snT) { npc._snT = now; npc._snX = npc.x; npc._snY = npc.y; continue; }
      if (now - npc._snT < 5000) continue;
      this.snapN++;
      if (Math.hypot(npc.x - npc._snX, npc.y - npc._snY) < 32) { if (_pcNearWater(npc.x, npc.y)) this.stopWet++; else this.stopDry++; }
      else this.going++;
      npc._snT = now; npc._snX = npc.x; npc._snY = npc.y;
    }
  },
  trip(npc, targetKey, now) {
    if (!npc.simVillageId || npc._trK === targetKey) return;
    if (npc._trT) this.trAb[npc._trD]++;
    npc._trK = targetKey; npc._trT = 0;
    if (Math.hypot(npc.targetX - npc.x, npc.targetY - npc.y) < 48) return;
    const B = BUILDING_SIZE;
    npc._trD = isTerrainBlockedLocal(Math.floor(npc.targetX / B) * B + B / 2, Math.floor(npc.targetY / B) * B + B / 2) ? 1 : 0;
    npc._trT = now; this.trSt[npc._trD]++;
    if (npc._trD) {
      if (npc._pcFall) this.trDeadFall++;
      if (npc.npcWorkX != null && Math.abs(npc.targetX - npc.npcWorkX) <= 80 && Math.abs(npc.targetY - npc.npcWorkY) <= 80) this.trDeadWork++;
      if (npc._pcHop && now - npc._pcHop < 3000) this.trDeadHop++;
    }
  },
  arrive(npc, targetKey, now) {
    if (!npc._trT || npc._trK !== targetKey) return;
    this.trDone[npc._trD]++;
    if (!npc._trD) { const b = Math.min(480, Math.floor((now - npc._trT) / 250)); this.trH[b] = (this.trH[b] || 0) + 1; }
    npc._trT = 0;
  },
  cal() { const P = 300000, a = _pcT(); for (let i = 0; i < P; i++) { const x = _pcT(); if (x < 0) console.log(x); } this.clockNs = (_pcT() - a) * 1e6 / P; },
  rep() {
    this.n++;
    if (this.n < this.every) return;
    if (!this.clockNs) this.cal();
    { const B = BUILDING_SIZE; this.workN = 0; this.workDead = 0;
      for (const pid of npcs) { const q = players.get(pid); if (!q || !q.simVillageId || q.npcWorkX == null) continue; this.workN++;
        if (isTerrainBlockedLocal(Math.floor(q.npcWorkX / B) * B + B / 2, Math.floor(q.npcWorkY / B) * B + B / 2)) this.workDead++; } }
    // ★[T427] 되묻는 쌍(조각 안 3번 넘게)이 반경 안에서 닿나 — 조각 끝에 한 번씩만(틱 중간 흔들기 최소 · 시간은 따로 잰다)
    this._clsN = 0; this._clsMs = 0;
    if (typeof npcCanReach === 'function') { const _c0 = _pcT();
      for (const [k, n] of this.clPairs) { if (n < 3) continue; const pd = this.clPairD.get(k); if (!pd || pd.reach !== undefined) continue; pd.reach = npcCanReach(pd.x, pd.y, pd.tx, pd.ty); this._clsN++; }
      this._clsMs = _pcT() - _c0; }
    try {
      console.log('[PC] ' + JSON.stringify({ n: this.n, pop: this.pop, phase: +worldPhase(Date.now()).toFixed(4),
        call: this.call, ms: +this.ms.toFixed(2), popsSum: this.popsSum, popsMax: this.popsMax,
        ex: this.ex, msEx: { found: +this.msEx.found.toFixed(2), capped: +this.msEx.capped.toFixed(2),
          exhaust: +this.msEx.exhaust.toFixed(2), radius: +this.msEx.radius.toFixed(3), same: +this.msEx.same.toFixed(3), endpoint: +this.msEx.endpoint.toFixed(3) },
        popsEx: this.popsEx, hist: this.hist,
        xN: this.xN, xMs: Object.fromEntries(Object.entries(this.xMs).map(([k, v]) => [k, +v.toFixed(2)])), xPops: this.xPops,
        srcWet: this.srcWet, srcRock: this.srcRock, afterUnstuck: this.afterUnstuck, jobWet: this.jobWet,
        gDead: this.gDead, gDeadMs: +this.gDeadMs.toFixed(2), xGD: this.xGD,
        xGDms: Object.fromEntries(Object.entries(this.xGDms).map(([k, v]) => [k, +v.toFixed(2)])), sDead: this.sDead,
        dup: this.dup, dupMs: +this.dupMs.toFixed(2), dupSelf: this.dupSelf, dupOther: this.dupOther,
        gdAct: this.gdAct, gdJob: this.gdJob, gdHop: this.gdHop, gdHopMs: +this.gdHopMs.toFixed(2), lvAct: this.lvAct,
        gdFall: this.gdFall, gdWork: this.gdWork, gdWorkDead: this.gdWorkDead, lvFall: this.lvFall,
        workN: this.workN, workDead: this.workDead,
        dCell: Object.fromEntries(Object.entries(this.dCell).map(([k, v]) => [k, +(v / this.dCellN[k]).toFixed(1)])),
        nullN: this.nullN, wpAvg: this.wpN ? +(this.wpSum / this.wpN).toFixed(1) : 0,
        dAvg: this.dN ? +(this.dSum / this.dN).toFixed(0) : 0, dMax: +this.dMax.toFixed(0),
        cross: this.cross, crossNull: this.crossNull, crossMs: +this.crossMs.toFixed(2),
        sameIsl: this.sameIsl, tgtWet: this.tgtWet, tgtRock: this.tgtRock, labUnk: this.labUnk,
        beh: this.beh, behCross: this.behCross, homeTgt: this.homeTgt, homeCross: this.homeCross, vilCross: this.vilCross,
        beeline: this.beeline, beelineWet: this.beelineWet,
        watchOn: this.watchOn, wetStop: this.wetStop, dryStop: this.dryStop, moved: this.moved,
        unstuck: this.unstuck, clockNs: +this.clockNs.toFixed(1),
        trSt: this.trSt, trDone: this.trDone, trAb: this.trAb, trH: this.trH,
        snapN: this.snapN, stopWet: this.stopWet, stopDry: this.stopDry, going: this.going,
        trDeadFall: this.trDeadFall, trDeadWork: this.trDeadWork, trDeadHop: this.trDeadHop, t394Moves: this.t394Moves,
        cl: this.cl, clMs: +this.clMs.toFixed(2), clD: this.clD, clDsum: this.clDsum, clEsum: +this.clEsum.toFixed(1),
        clBoxSum: this.clBoxSum, clRmaxSum: this.clRmaxSum, clRmaxHist: this.clRmaxHist,
        clSrc: this.clSrc, clAct: this.clAct, clFall: this.clFall, clHop: this.clHop, clHome: this.clHome, clWork: this.clWork, clTask: this.clTask,
        rr: this.rr, rrMs: +this.rrMs.toFixed(2), rrNeed: this.rrNeed, rrNever: this.rrNever, rrNeedSum: this.rrNeedSum,
        rrLenSum: this.rrLenSum, rrDSum: this.rrDSum, rrSkip: this.rrSkip, rrBoxSum: this.rrBoxSum,
        hop: this.hop, hopDead: this.hopDead, rrRaw: this.rrRaw, clSrc2: this.clSrc2, clSrcD: this.clSrcD,
        clPairN: this.clPairs.size, clPairMax: Math.max(0, ...this.clPairs.values()),
        clPairTop: [...this.clPairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, n]) => Object.assign({ n }, this.clPairD.get(k) || {})),
        clsN: this._clsN, clsMs: +(this._clsMs || 0).toFixed(1),
        wl: global.__wl ? Object.assign({}, global.__wl) : null,
        band: global.__band ? JSON.parse(JSON.stringify(global.__band)) : null,   // ★[T427 ③] 사냥 밴드 다 지은 마을(셀 수) · 예산에 끊긴 날 수   // ★[T427 ③] 서식지 스캔 누계(줄·청크·부른 수·남은 큐)
        mobN: (() => { const o = {}; try { for (const m of mobs.values()) if (m && m.hp > 0) o[m.type] = (o[m.type] || 0) + 1; } catch (e) {} return o; })(),   // ★[T427 ③] 몹 마릿수(종별) — 서식지 스캔이 얼마나 갔나의 그림자
        rq: this.rq, rqMs: +this.rqMs.toFixed(2), rqNo: this.rqNo, rqMax: +this.rqMax.toFixed(2), rqT: { n: this.rqT.n, ms: +this.rqT.ms.toFixed(1), no: this.rqT.no, max: +this.rqT.max.toFixed(2), slow: this.rqT.slow },
        t427: global.__t427 ? JSON.parse(JSON.stringify(global.__t427)) : null,
        t394Spawn: global.__t394Stat ? Object.assign({}, global.__t394Stat) : null }));
    } catch (e) {}
    this.n = 0; this.call = 0; this.ms = 0; this.popsSum = 0; this.popsMax = 0;
    this.ex = { found: 0, capped: 0, exhaust: 0, radius: 0, same: 0, endpoint: 0 };
    this.msEx = { found: 0, capped: 0, exhaust: 0, radius: 0, same: 0, endpoint: 0 };
    this.popsEx = { found: 0, capped: 0, exhaust: 0 };
    this.xN = {}; this.xMs = {}; this.xPops = {};
    this.srcWet = 0; this.srcRock = 0; this.afterUnstuck = 0; this.jobWet = {};
    this.gDead = 0; this.gDeadMs = 0; this.xGD = {}; this.xGDms = {}; this.sDead = 0;
    this.dup = 0; this.dupMs = 0; this.dupSelf = 0; this.dupOther = 0;
    this.gdAct = {}; this.gdJob = {}; this.gdHop = 0; this.gdHopMs = 0; this.lvAct = {};
    this.gdFall = 0; this.gdWork = 0; this.gdWorkDead = 0; this.lvFall = 0; this.workN = 0; this.workDead = 0;
    this.dCell = {}; this.dCellN = {};
    this.hist = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    this.nullN = 0; this.wpSum = 0; this.wpN = 0; this.dSum = 0; this.dN = 0; this.dMax = 0;
    this.cross = 0; this.crossNull = 0; this.crossMs = 0; this.sameIsl = 0; this.tgtWet = 0; this.tgtRock = 0; this.labUnk = 0;
    this.beh = {}; this.behCross = {}; this.homeTgt = 0; this.homeCross = 0; this.vilCross = {};
    this.beeline = 0; this.beelineWet = 0; this.watchOn = 0; this.wetStop = 0; this.dryStop = 0; this.moved = 0;
    this.unstuck = 0;
    this.trSt = [0, 0]; this.trDone = [0, 0]; this.trAb = [0, 0]; this.trH = {};
    this.snapN = 0; this.stopWet = 0; this.stopDry = 0; this.going = 0;
    this.trDeadFall = 0; this.trDeadWork = 0; this.trDeadHop = 0; this.t394Moves = 0;
    this.cl = 0; this.clMs = 0; this.clD = [0, 0, 0, 0, 0, 0]; this.clDsum = 0; this.clEsum = 0;
    this.clBoxSum = 0; this.clRmaxSum = 0; this.clRmaxHist = [0, 0, 0, 0, 0];
    this.clSrc = {}; this.clAct = {}; this.clFall = 0; this.clHop = 0; this.clHome = 0; this.clWork = 0; this.clTask = {};
    this.rr = 0; this.rrMs = 0; this.rrNeed = [0, 0, 0, 0, 0]; this.rrNever = 0; this.rrNeedSum = 0; this.rrLenSum = 0; this.rrDSum = 0; this.rrSkip = 0; this.rrBoxSum = 0;
    this.hop = 0; this.hopDead = 0; this.rrRaw = []; this.clSrc2 = {}; this.clSrcD = {}; this.clPairs = new Map(); this.clPairD = new Map();
    this.rq = 0; this.rqMs = 0; this.rqNo = 0; this.rqMax = 0;
  },
  tally(npc, wp, ms, st, d) {
    this.call++; this.ms += ms;
    const ran = st.pops >= 0;
    let door;
    if (!ran) {
      if (wp) door = 'same';
      else {   // ★[T394 ③] 탐색 전 null 은 둘 — 반경(64) 을 넘었나 · 끝점이 막혔나(localPath 첫 줄)
        const B0 = BUILDING_SIZE, cd = Math.abs(Math.floor(npc.targetX / B0) - Math.floor(npc.x / B0)) + Math.abs(Math.floor(npc.targetY / B0) - Math.floor(npc.y / B0));
        door = cd > 64 ? 'radius' : 'endpoint';
      }
    }
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
    if (gd) { this.gDead++; this.gDeadMs += ms; this.xGD[door] = (this.xGD[door] || 0) + 1; this.xGDms[door] = (this.xGDms[door] || 0) + ms;
      const la = npc._lifeAct || '(없음)', jb = npc.simJob || npc.npcJob || '(없음)';
      this.gdAct[la] = (this.gdAct[la] || 0) + 1; this.gdJob[jb] = (this.gdJob[jb] || 0) + 1;
      if (npc._pcHop && Date.now() - npc._pcHop < 3000) { this.gdHop++; this.gdHopMs += ms; }
      if (npc._pcFall) this.gdFall++;
      if (npc.npcWorkX != null && Math.abs(npc.targetX - npc.npcWorkX) <= 80 && Math.abs(npc.targetY - npc.npcWorkY) <= 80) {
        this.gdWork++;
        if (isTerrainBlockedLocal(Math.floor(npc.npcWorkX / B) * B + H, Math.floor(npc.npcWorkY / B) * B + H)) this.gdWorkDead++; } }
    else { const la = npc._lifeAct || '(없음)'; this.lvAct[la] = (this.lvAct[la] || 0) + 1; if (npc._pcFall) this.lvFall++; }
    if (isTerrainBlockedLocal(scx * B + H, scy * B + H)) this.sDead++;
    // ★후보 ⓑ — 2초 안에 같은 (출발 셀, 목표 셀) 쌍이 또 오나
    const pk = scx + '_' + scy + '_' + gcx + '_' + gcy, nw = Date.now();
    const prev = this._seen.get(pk);
    if (prev && nw - prev.t < 2000) { this.dup++; this.dupMs += ms; if (prev.id === npc.playerId) this.dupSelf++; else this.dupOther++; }
    this._seen.set(pk, { t: nw, id: npc.playerId });
    if (this._seen.size > 40000) { for (const [k, v] of this._seen) { if (nw - v.t >= 2000) this._seen.delete(k); } }
    const dc = Math.abs(gcx - scx) + Math.abs(gcy - scy);
    this.dCell[door] = (this.dCell[door] || 0) + dc; this.dCellN[door] = (this.dCellN[door] || 0) + 1;
    // ★[T399 ①] 1500 × 뭍 — 칸을 다 태웠는데 목표 셀은 열려 있다
    if (door === 'capped' && !gd) {
      this.cl++; this.clMs += ms;
      const de = Math.hypot(gcx - scx, gcy - scy);
      this.clDsum += dc; this.clEsum += de;
      this.clD[dc < 8 ? 0 : dc < 16 ? 1 : dc < 32 ? 2 : dc < 48 ? 3 : dc <= 64 ? 4 : 5]++;
      const bw = st.bx1 - st.bx0 + 1, bh = st.by1 - st.by0 + 1;
      this.clBoxSum += bw * bh; this.clRmaxSum += st.rmax;
      this.clRmaxHist[st.rmax < 8 ? 0 : st.rmax < 16 ? 1 : st.rmax < 24 ? 2 : st.rmax < 32 ? 3 : 4]++;
      // 누가 그 목표를 줬나 — 생활 라벨 · ⑤ 로 떨어진 결정 · 튕김 도약 · 집(침대)·일터 · 생활 과업 종류
      const la = npc._lifeAct || '(없음)'; this.clAct[la] = (this.clAct[la] || 0) + 1;
      const src = npc._pcHop && Date.now() - npc._pcHop < 3000 ? '튕김도약' : npc._pcFall ? '⑤배회' : (npc._lifeAct ? '생활층' : '(없음)');
      this.clSrc[src] = (this.clSrc[src] || 0) + 1;
      if (npc._pcFall) this.clFall++;
      if (npc._pcHop && Date.now() - npc._pcHop < 3000) this.clHop++;
      const hx2 = npc.npcBedX != null ? npc.npcBedX : npc.npcHomeX, hy2 = npc.npcBedY != null ? npc.npcBedY : npc.npcHomeY;
      if (hx2 != null && Math.hypot(npc.targetX - hx2, npc.targetY - hy2) < 48) this.clHome++;
      if (npc.npcWorkX != null && Math.abs(npc.targetX - npc.npcWorkX) <= 80 && Math.abs(npc.targetY - npc.npcWorkY) <= 80) this.clWork++;
      const tk = npc._lifeTask ? (npc._lifeTask.k || '?') : (npc._workSite ? 'workSite' : '-');
      this.clTask[tk] = (this.clTask[tk] || 0) + 1;
      // ★출처 2판 — **목표가 그 도약 점인가**로 가른다(시간 창이 아니라 좌표로) · 생활층은 라벨로 · 일터(_workSite)·침대·집
      const isHop = npc._pcHopX !== undefined && npc.targetX === npc._pcHopX && npc.targetY === npc._pcHopY;
      const bedT = npc.npcBedX != null && npc.targetX === npc.npcBedX && npc.targetY === npc.npcBedY;
      const homeT = npc.npcHomeX != null && npc.targetX === npc.npcHomeX && npc.targetY === npc.npcHomeY;
      const wsT = npc._workSite && npc.targetX === npc._workSite.x && npc.targetY === npc._workSite.y;
      const src2 = isHop ? '튕김도약' : bedT ? '침대(취침·요양)' : homeT ? '집 마당' : wsT ? '일터(_workSite)' : npc._pcFall ? '⑤배회' : ('생활층:' + (npc._lifeAct || '?'));
      this.clSrc2[src2] = (this.clSrc2[src2] || 0) + 1; this.clSrcD[src2] = (this.clSrcD[src2] || 0) + dc;
      const pk2 = (npc.playerId || npc.pid) + '|' + (npc.targetX | 0) + '_' + (npc.targetY | 0);
      this.clPairs.set(pk2, (this.clPairs.get(pk2) || 0) + 1);
      if (!this.clPairD.has(pk2)) this.clPairD.set(pk2, { pid: npc.pid || npc.playerId, job: npc.simJob || npc.npcJob || null, vil: npc.simVillageId || null, act: npc._lifeAct || null, x: Math.round(npc.x), y: Math.round(npc.y), tx: Math.round(npc.targetX), ty: Math.round(npc.targetY) });   // ★[T399 · 베이스 갈래] 되묻는 쌍의 얼굴
      // 풀어서 다시 — 같은 질문을 maxCells 없이(반경 64 그대로). 계측 팔에서만 · 틱마다 한 번까지(세계를 덜 흔든다)
      if (process.env.T399_RERUN === '1' && npc.simVillageId) {
        if (this.rrLast === _tick.n) { this.rrSkip++; }
        else {
          this.rrLast = _tick.n;
          const t0 = _pcT(); PathCore._pcstat.pops = -1;
          const wp2 = pfFindPath(npc.x, npc.y, npc.targetX, npc.targetY, { floor: npc.floor || 0, isBlockedFn: isBlockedByWall,
            isWaterFn: isTerrainBlockedLocal, maxCells: 1e9, searchRadiusCells: 64, preferFn: _roadPrefer });
          this.rrMs += _pcT() - t0; this.rr++;
          const s2 = PathCore._pcstat;
          if (s2.found && wp2) {
            const nd = s2.pops; this.rrNeedSum += nd; this.rrLenSum += wp2.length; this.rrDSum += dc; this.rrRaw.push(nd);
            this.rrNeed[nd < 3000 ? 0 : nd < 6000 ? 1 : nd < 12000 ? 2 : nd < 24000 ? 3 : 4]++;
          } else { this.rrNever++; this.rrBoxSum += (s2.bx1 - s2.bx0 + 1) * (s2.by1 - s2.by0 + 1); }
        }
      }
    }
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
// ★[T427 ①] 현장 도달 술어를 감싼다 — 부른 수·시간·못 닿음(생활층이 deps 로 부르는 그 함수 · 답 무변)
function _pcReachWrap(ax, ay, bx, by) { const t0 = _pcT(); PathCore._pcstat.pops = -1; const r = npcCanReach(ax, ay, bx, by); const ms = _pcT() - t0; global.__pcLastPops = PathCore._pcstat.pops; _PC.rq++; _PC.rqMs += ms; if (!r) _PC.rqNo++; if (ms > _PC.rqMax) _PC.rqMax = ms;
  const T = _PC.rqT; T.n++; T.ms += ms; if (!r) T.no++; if (ms > T.max) T.max = ms; if (ms >= TICK_MS) T.slow++; return r; }
`;

const PATCHES = [
  { find: "const _SEED = require('./seed-rand');",
    repl: "const _SEED = require('./seed-rand');\n__PROBE_HEAD__" },
  { find: "}, TICK_MS);",
    repl: "  _PC.pop = npcs.size; if (_tick.n % 30 === 0) _PC.snap(); _PC.rep();\n}, TICK_MS);" },
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
  { find: "  const arrived = followNpcPath(npc, speedMult);",
    repl: "  _PC.trip(npc, targetKey, now);\n  const arrived = followNpcPath(npc, speedMult);\n  if (arrived) _PC.arrive(npc, targetKey, now);" },
  // ★결정이 생활 층을 지나쳤나(npcLifeTick 거짓 → zone 옛 갈래 ③~⑤) — 마지막 결정의 출처만 적는다
  { find: "  if (npc.simVillageId && SimVillages.npcLifeTick && SimVillages.npcLifeTick(npc, now)) return;",
    repl: "  if (npc.simVillageId && SimVillages.npcLifeTick && SimVillages.npcLifeTick(npc, now)) { npc._pcFall = 0; return; }\n  if (npc.simVillageId) npc._pcFall = now;" },
  { find: "  // 작은 회피 — 랜덤 방향으로 짧게 비킨다",
    repl: "  npc._pcHop = now;   // [T381 탐침] 무작위 도약 갈래(3연속 막힘)\n  // 작은 회피 — 랜덤 방향으로 짧게 비킨다" },
  // ★[T399 ②] 도약 목표가 막힌 칸인가 — 목표를 다 정한 **뒤**(② 가 들어가면 그 뒤) 잰다
  { find: "  npc.nextDecisionAt = now + 800; // 잠깐 wander 후 다시 결정",
    repl: "  _PC.hop++; npc._pcHopX = npc.targetX; npc._pcHopY = npc.targetY; { const B = BUILDING_SIZE; if (isTerrainBlockedLocal(Math.floor(npc.targetX / B) * B + B / 2, Math.floor(npc.targetY / B) * B + B / 2)) _PC.hopDead++; }\n  npc.nextDecisionAt = now + 800; // 잠깐 wander 후 다시 결정" },
  { find: "function unstuckNpc(npc, now) {",
    repl: "function unstuckNpc(npc, now) {\n  _PC.unstuck++; npc._pcUn = now;" },
  // ★[T427 ①] 현장 도달 술어 — deps 로 넘기는 자리를 감싼 것으로(T427 판에만 · 없는 팔은 건너뛴다)
  { optional: true, find: "  npcCanReach,   // ★★[T427 ①] 현장 배정이 부르는 도달 술어",
    repl: "  npcCanReach: _pcReachWrap,   // [T427 탐침] 감싼 것 — 답 무변 ·" },
  // ★[T394 ②] 되짚기가 선 수 — T394 판에만 있는 글자(없는 팔은 건너뛴다)
  { optional: true, find: "    if (T394_WORK_TERRAIN) _t394OpenTarget(npc, npc.npcWorkX, npc.npcWorkY);",
    repl: "    if (T394_WORK_TERRAIN && _t394OpenTarget(npc, npc.npcWorkX, npc.npcWorkY)) _PC.t394Moves++;" },
];
// villages.js 사본 — 태어나기 셈을 전역에 걸어 둔다(T394 판에만 · 관측 전용)
const VIL_PATCHES = [
  // ★[T427 ③] 사냥 밴드 짓기 — 하루 시간 예산(T146_BUILD_MS)으로 끊어 짓는다 · 어느 마을이 다 지었나 · 며칠 끊겼나(관측 전용)
  { optional: true, find: "  vil._gameRich = st.m;",
    repl: "  vil._gameRich = st.m; { const _b = global.__band || (global.__band = { done: {}, cut: {} }); _b.done[vil.name] = st.m.size; }" },
  { optional: true, find: "    if (Date.now() - t0 >= budget) { st.dy += 2; return null; }   // 오늘치 끝",
    repl: "    if (Date.now() - t0 >= budget) { st.dy += 2; { const _b = global.__band || (global.__band = { done: {}, cut: {} }); _b.cut[vil.name] = (_b.cut[vil.name] || 0) + 1; } return null; }   // 오늘치 끝" },
  // ★[T427 ①] 현장 배정 — 몇 번 골랐나 · 첫 후보가 못 닿아 옮겼나 · 전부 못 닿아 집이 됐나(마을·직업별) · 사냥꾼 하루 옮기기도
  { optional: true, find: "  for (let i = 0; i < n; i++) { const s = sites[(h + i) % n]; if (_t427Reach(vil, npc, s.x, s.y, day)) return { x: s.x, y: s.y, day }; }",
    repl: "  const _g = global.__t427 || (global.__t427 = { site: 0, moved: 0, home: {}, hunt: 0, huntMoved: 0, huntHome: {} }); _g.site++;\n  for (let i = 0; i < n; i++) { const s = sites[(h + i) % n]; if (_t427Reach(vil, npc, s.x, s.y, day)) { if (i) _g.moved++; return { x: s.x, y: s.y, day }; } }\n  { const _k = vil.name + '|' + (npc.simJob || '?'); _g.home[_k] = (_g.home[_k] || 0) + 1; const _o = _t427HomeOf(vil, npc); (_g.homeS || (_g.homeS = [])).length < 40 && _g.homeS.push({ v: vil.name, j: npc.simJob || '?', hx: Math.round(_o.x), hy: Math.round(_o.y), n, pops: global.__pcLastPops, s0: n ? [Math.round(sites[h % n].x), Math.round(sites[h % n].y)] : null }); }" },
  { optional: true, find: "        if (_ok) b = _ok; else _home = _t427HomeOf(vil, p);",
    repl: "        { const _g = global.__t427 || (global.__t427 = { site: 0, moved: 0, home: {}, hunt: 0, huntMoved: 0, huntHome: {} }); _g.hunt++; if (_ok && _ok !== b) _g.huntMoved++; if (!_ok) { const _k = vil.name + '|hunter'; _g.huntHome[_k] = (_g.huntHome[_k] || 0) + 1; } }\n        if (_ok) b = _ok; else _home = _t427HomeOf(vil, p);" },
  { optional: true, find: "const _t394Stat = { spawn: 0, first: 0, redraw: 0, yard: 0 };",
    repl: "const _t394Stat = { spawn: 0, first: 0, redraw: 0, yard: 0 }; global.__t394Stat = _t394Stat;" },
];

// ★[T427 ③] wildlife.js 사본 — 서식지 스캔이 **시간 예산(4ms)** 안에서 몇 줄·몇 청크를 했나(관측 전용 · 답 무변)
const WL_PATCHES = [
  { optional: true, find: "    if (++j.row >= cc) {",
    repl: "    { const _w = global.__wl || (global.__wl = { rows: 0, chunks: 0, calls: 0 }); _w.rows++; }\n    if (++j.row >= cc) {" },
  { optional: true, find: "  if (!_scanQ.length) return false;",
    repl: "  if (!_scanQ.length) return false;\n  { const _w = global.__wl || (global.__wl = { rows: 0, chunks: 0, calls: 0 }); _w.calls++; _w.q = _scanQ.length; }" },
];
const BASE_REF = process.env.BASE_REF || 'origin/main';
function makeArm(arm, dir) {
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  // ★[T394] `pre*` 팔은 **이 카드 전의 main** 에서 뜬다(작업트리 덮어쓰기 0) — 카드 전/후를 같은 벽시계에 세운다.
  const isPre = /^pre/.test(arm);
  execFileSync('git', ['worktree', 'add', '--detach', '-q', dir, isPre ? BASE_REF : 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
  if (isPre) console.log(`  [${arm}] ${BASE_REF} 에서 떴다(${execFileSync('git', ['rev-parse', '--short', BASE_REF], { cwd: ROOT }).toString().trim()}) · 작업트리 덮어쓰기 0`);
  try { fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules')); } catch (e) {}
  // ★워크트리는 **커밋된 HEAD** 를 떠 온다 — 아직 커밋 안 한 수술은 안 따라온다(T370 에서 한 번 빠졌다).
  //   ⇒ 작업트리에서 **바뀐 파일만** 덮어쓴다. 자가 재는 것이 지금 고치고 있는 그 글자여야 한다.
  if (!isPre) try {
    // ⚠한글 경로는 git 이 "\354…" 로 따옴표 쳐 내준다 — 그 글자로는 파일이 없어 **조용히 건너뛴다**(찍힌 수와 실제가 갈린다).
    //   ⇒ `core.quotepath=off` 로 날 글자를 받고, **실제로 덮은 것만** 센다.
    const dirty = execFileSync('git', ['-c', 'core.quotepath=off', 'diff', '--name-only', 'HEAD'], { cwd: ROOT }).toString().split('\n').filter(Boolean);
    const done = [];
    for (const f of dirty) { const src = path.join(ROOT, f), dst = path.join(dir, f);
      if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); done.push(f); } }
    if (dirty.length) console.log(`  [${arm}] 작업트리에서 덮어쓴 파일 ${done.length}/${dirty.length}개: ${done.join(' · ')}`);
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
    if (p.optional && cnt === 0) { console.log(`  [${arm}] 선택 앵커 없음(건너뜀): ${p.find.trim().slice(0, 50)}`); continue; }
    if (cnt !== 1) throw new Error(`탐침 앵커가 ${cnt}개다(1이어야 한다): ${p.find.slice(0, 60)}`);
    s = s.replace(p.find, () => p.repl.replace('__PROBE_HEAD__', () => PROBE_HEAD));   // ★함수 치환 — `$` 가 든 글자를 문자열로 넘기면 `$&` 로 먹힌다
    n++;
  }
  fs.writeFileSync(zp, s);
  execFileSync(process.execPath, ['--check', zp]);
  const vp = path.join(dir, 'server', 'villages.js');
  let vs = fs.readFileSync(vp, 'utf8');
  for (const p of VIL_PATCHES) {
    const cnt = vs.split(p.find).length - 1;
    if (p.optional && cnt === 0) continue;
    if (cnt !== 1) throw new Error(`villages 앵커가 ${cnt}개다: ${p.find.slice(0, 60)}`);
    vs = vs.replace(p.find, () => p.repl); n++;
  }
  fs.writeFileSync(vp, vs);
  execFileSync(process.execPath, ['--check', vp]);
  const wp = path.join(dir, 'server', 'wildlife.js');
  let ws = fs.readFileSync(wp, 'utf8');
  for (const p of WL_PATCHES) { const cnt = ws.split(p.find).length - 1; if (p.optional && cnt === 0) continue; if (cnt !== 1) throw new Error(`wildlife 앵커가 ${cnt}개다: ${p.find.slice(0, 60)}`); ws = ws.replace(p.find, () => p.repl); n++; }
  fs.writeFileSync(wp, ws);
  execFileSync(process.execPath, ['--check', wp]);
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
      T381_PATH_DEAD: /Off$/.test(arm) ? '0' : /(^on$|Dead$|^fix$)/.test(arm) ? '1' : (process.env.T381_PATH_DEAD || ''),
      T399_RERUN: /Rr$/.test(arm) ? '1' : '',                                   // ★[T399 ①] 계측 팔만 — 1500 × 뭍을 풀어서 다시
      T399_CELL_CAP: /Cap$/.test(arm) ? '1' : (process.env.T399_CELL_CAP || ''),
      TERRAIN_SEG_INDEX: /Seg0$/.test(arm) ? '0' : (process.env.TERRAIN_SEG_INDEX || ''),
      T427_SITE_REACH: /Reach/.test(arm) ? '1' : (process.env.T427_SITE_REACH || ''),     // ★[T427 ①] 닿는 현장만 팔
      ZONE_CLOCK_ANCHOR: /Clk/.test(arm) ? 'boot' : (process.env.ZONE_CLOCK_ANCHOR || '') }) });   // ★[T427 ②] 시계를 기동에 묶은 팔   // ★[T399 · 베이스 갈래] T406 선분 색인 끈 팔(되돌림 글자 그대로)
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
    const vacts = ((L && L.villages) || []).map((v) => [v.id != null ? v.id : (v.name || '?'), v.acts || {}, v.jobs || {}]);   // ★[T399 · 베이스 갈래] 마을별 라벨(어느 마을이 안 자나)
    slices.push({ k, vacts, phase: L && L.phase, p50: t && t.p50, p95: t && t.p95, ticks: p.tick.n,
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
  if (process.env.PARALLEL === '1') {
    // ★두 팔을 **같은 벽시계**에 띄운다 — 위상이 같아진다(T345 §3-ⓑ 의 함정을 피하는 길 하나).
    //   ⚠2코어라 서로 CPU 를 먹는다 ⇒ 이 판의 **수**(호출·null·여행·정지)만 쓰고 **ms 는 순차 팔에서** 읽는다.
    const all = await Promise.all(ARMS.map((a, i) => runArm(a, i)));
    res.push(...all);
    fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), WINDOW, DAY_MS, SLICE_S, SLICES, TPL, LAB, PARALLEL: 1, arms: res }, null, 1));
  } else for (let i = 0; i < ARMS.length; i++) {
    res.push(await runArm(ARMS[i], i));
    fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), WINDOW, DAY_MS, SLICE_S, SLICES, TPL, LAB, arms: res }, null, 1));
  }
  console.log('끝 →', OUT);
  process.exit(0);
})();
