#!/usr/bin/env node
// === scripts/t371-tick-rest.js — T356 이 이름 없이 남긴 '그 밖' 2.11µs(25.7%) 를 **같은 자로** 가른다 (T371) ===
//
// ⚠계측기다(러너 밖 · `@regress` 없음). **제품 코드는 한 글자도 안 만진다** —
//   탐침은 `git worktree` 로 뜬 **사본**에만 박고, 그 사본을 돌린 뒤 지운다(카드: 제품 손잡이 0 · 동작 무접촉).
//
// ★자는 T356 과 같다(카드 지정): 한 판 안에서 갈래마다 시계 · `performance.now()`(할당 0) ·
//   자 값을 자가 재서 계수로 뺀다 · 같은 조각 길이(30초) · 같은 씨(같은 템플릿 DB) · 같은 창(낮/밤).
//
// ★T356 과 다른 점 하나: **사람마다 도는 시계를 안 단다.** T356 은 걸음·결정·A\*·생활층에 사람마다
//   시계를 댔다(틱당 5×1,464회). 이 카드가 재는 건 **틱당 한 번 도는 토막들**이라 시계도 틱당 한 번이면 된다.
//   ⇒ 자 값이 T356 의 1/300 로 떨어진다(틱당 0.39ms → 0.001ms · §자값).
//   그래서 틀(`tot`·`loopDec`·`loopMov`·`aoi`)은 그대로 두고, **그 사이의 빈 자리**를 이어붙인 사슬로 가른다:
//     그 밖 = tot − loopDec − loopMov − aoi   (T356 의 정의 그대로) = 아래 열넷의 합 + 못 가른 나머지
//
// 실행: node scripts/t371-tick-rest.js [out.json]
//   WINDOW=day|night · SLICE_S=30 · SLICES=8 · PORT_BASE=3960 · TPL=/tmp/t316-tpl.db · DAY_MS=1440000
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/t371-rest.json';
const PB = parseInt(process.env.PORT_BASE || '3960', 10);
const DAY_MS = parseInt(process.env.DAY_MS || '1440000', 10);
const SLICE_S = parseInt(process.env.SLICE_S || '30', 10);
const SLICES = parseInt(process.env.SLICES || '8', 10);
const TPL = process.env.TPL || '/tmp/t316-tpl.db';
const WINDOW = (process.env.WINDOW || 'day').trim();
// ★[T375 → T385] 팔 — `off`(종전) / `on`(`T385_ONE_SWEEP=1` · 순회 일곱 → 둘). 같은 틀 DB · 같은 창 · 같은 조각.
//   (T375 의 `T375_ACTIVE_FLAG` 는 T385 가 흡수했다 — 그 손잡이의 새로 고침 토막 둘도 같이 사라졌다)
const ARM = (process.env.ARM || 'off').trim();
// ★[T421] 팔 환경을 **글자로** 받는다 — T385 가 기본 켬이 된 뒤로 `off` 가 "손잡이 미설정" 이 아니다.
//   `ARM_ENV='T421_SPATIAL_INC=1,T385_ONE_SWEEP=0'` 처럼 준다(없으면 옛 규약: on ⇒ T385_ONE_SWEEP=1).
const ARM_ENV = {};
for (const kv of String(process.env.ARM_ENV || '').split(',').map((x) => x.trim()).filter(Boolean)) { const i = kv.indexOf('='); ARM_ENV[kv.slice(0, i)] = kv.slice(i + 1); }
if (!process.env.ARM_ENV && ARM === 'on') ARM_ENV.T385_ONE_SWEEP = '1';
// ★[T421] `SPATIAL_SUB=1` — `rebuildSpatialIndex` 안을 토막 넷으로 더 가른다(사슬 그대로 · 합은 spatial 칸과 같다)
const SPATIAL_SUB = process.env.SPATIAL_SUB === '1';
const TAG = ARM === 'off' ? WINDOW : `${WINDOW}-${ARM}`;
const W_LO = WINDOW === 'day' ? 0.10 : 0.72, W_HI = WINDOW === 'day' ? 0.62 : 0.97;
// ★[T375] **드는 자리를 좁힌다** — 팔 둘을 견주려면 두 판이 **같은 국면**에서 시작해야 한다.
//   T375 첫 판 실측: `off` 는 0.102 에 들었고 `on` 은 0.45 에 들어 비취침이 1,205 대 1,642 였다
//   (같은 세계인데 창이 달랐다 — T345 §3-ⓑ 가 빠진 그 함정). ⇒ 좁은 띠에 들 때까지 기다린다.
const E_LO = process.env.PH_LO ? parseFloat(process.env.PH_LO) : W_LO;
const E_HI = process.env.PH_HI ? parseFloat(process.env.PH_HI) : (W_HI - 0.001);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

// ── 갈래 이름 — 틱 본문을 자른 **사슬**(순서 그대로) ────────────────────────
//   ★사슬이라 틈이 없다: 한 토막이 끝나는 자리가 다음 토막이 시작하는 자리다.
//     그래서 "빠뜨린 갈래" 가 원리상 없다 — 남는 건 T356 이 이미 이름 붙인 넷(loopDec·loopMov·aoi)뿐이다.
const SEGS = [
  ['head',     '틱 머리 — dt·빚 누산·`_diceTick.seed`·`_tick` 계수'],
  ['econDay',  'econ 하루 틱 — `SimVillages.onGameTick`'],
  ['worldDay', '세계 하루 훅 — `Bandits`·`Roads`·`Soil`·`_fruitSeasonSweep`'],
  ['idleScan', 'idle 존 판정 — 사람 하나 찾는 순회 + `observers.size`'],
  ['chunks',   '활성 청크 갱신 — `updateActiveChunks`'],
  ['spatial',  '공간 인덱스 재구축 — `rebuildSpatialIndex` + `roomsFlush`'],
  ['inputTO',  '입력 타임아웃 순회 — 전 주민 훑고 사람만 본다'],
  ['decPre',   '결정 문 앞 — 주석뿐(사슬을 닫는 자리)'],
  ['farm',     '밭 단계 — 게임일 경계에만 활성 청크 밭 순회(평시 정수 비교 1)'],
  ['arrows',   '화살 물리 + ghost TTL 청소 — `stepArrows` + 맵 둘 순회'],
  ['stairs',   '계단 — `stepStairFor` × (주민 + 몹)'],
  ['fall',     '낙하 — `processFalling` × (주민 + 몹)'],
  ['gauge',    '생존 게이지 — 배고픔·목마름·vp 감쇠 순회'],
  ['hpRegen',  'HP 회복 순회 — 전투 밖 1초'],
  ['gaugeNet', '게이지 방송 순회 — 1초 간격 self 전송'],
  ['sweep',    '★[T385] 한 바퀴 — 뒤 묶음 다섯(계단·낙하·게이지·HP·방송) · 끔이면 즉시 지나간다'],
  ['mobs',     '몹 AI — `for (const m of mobs.values())` 한 바퀴'],
  ['wildlife', '야생 5종 — `Wildlife.tick`'],
];

// ── 탐침 ─────────────────────────────────────────────────────────────────
const PROBE_HEAD = `
// ── [T371 탐침 · 계측기가 박았다 · 제품엔 없다] ────────────────────────────
//   ★시계는 performance.now() 다(double ms · 할당 0). T356 과 같은 자.
//   ★자 값을 자가 잰다: \`cut()\` 한 번 값(ns)을 기동 때 재어 같이 찍는다 — 보는 쪽이 계수로 뺀다.
const _ANA = {
  n: 0, t0: 0, m: 0, tot: 0, pop: 0, mobN: 0, clockNs: 0, cutNs: 0,
  loopDec: 0, loopMov: 0, aoi: 0, x: {},
__SEGFIELDS__
  every: parseInt(process.env.T371_EVERY || '900', 10),
  cut(k) { const t = _anaT(); this[k] += t - this.m; this.m = t; },
  cal() {
    const P = 400000; let a = _anaT();
    for (let i = 0; i < P; i++) { const x = _anaT(); if (x < 0) console.log(x); }
    this.clockNs = (_anaT() - a) * 1e6 / P;
    this.__cal = 0; this.m = _anaT(); a = _anaT();
    for (let i = 0; i < P; i++) this.cut('__cal');
    this.cutNs = (_anaT() - a) * 1e6 / P;
  },
  rep() {
    this.n++;
    if (this.n < this.every) return;
    if (!this.clockNs) this.cal();
    const o = { n: this.n, pop: this.pop, mobN: this.mobN, phase: +worldPhase(Date.now()).toFixed(4),
      clockNs: +this.clockNs.toFixed(1), cutNs: +this.cutNs.toFixed(1),
      tot: this.tot, loopDec: this.loopDec, loopMov: this.loopMov, aoi: this.aoi, x: this.x };
__SEGREP__
    if (_anaOwn) { const c = process.cpuUsage(_anaOwn.cpu); o.own = { gcN: _anaOwn.gcN, gcMs: +_anaOwn.gcMs.toFixed(2), gcMaj: _anaOwn.gcMaj, cpuU: +(c.user / 1000).toFixed(1), cpuS: +(c.system / 1000).toFixed(1), heapMB: +(process.memoryUsage().heapUsed / 1048576).toFixed(1) };
      _anaOwn.gcN = 0; _anaOwn.gcMs = 0; _anaOwn.gcMaj = 0; _anaOwn.cpu = process.cpuUsage(); }
    try { console.log('[REST] ' + JSON.stringify(o)); } catch (e) {}
    this.n = 0; this.tot = this.loopDec = this.loopMov = this.aoi = 0; this.x = {};
__SEGZERO__
  } };
const _anaPerf = require('perf_hooks').performance;
// ★[T455] \`T455_OWN=1\` 일 때만 — 흔들림의 주인 후보 값: GC 횟수·ms(perf_hooks 'gc' 항목) · 존 프로세스 CPU(ms · user/sys)
const _anaOwn = process.env.T455_OWN === '1' ? { gcN: 0, gcMs: 0, gcMaj: 0, cpu: process.cpuUsage() } : null;
if (_anaOwn) { try { new (require('perf_hooks').PerformanceObserver)((l) => { for (const e of l.getEntries()) { _anaOwn.gcN++; _anaOwn.gcMs += e.duration; const k = (e.detail && e.detail.kind) || e.kind; if (k === 4) _anaOwn.gcMaj++; } }).observe({ entryTypes: ['gc'] }); } catch (e) {} }
const _anaT = () => _anaPerf.now();   // ⚠performance.now 는 묶지 않으면 this 가 없다(T356 실측)
`;

const PATCHES = [
  { find: "const _SEED = require('./seed-rand');",
    repl: "const _SEED = require('./seed-rand');\n__PROBE_HEAD__" },
  // 틱 시작 — 사슬의 영점
  { find: "  const _tickHr0 = process.hrtime();",
    repl: "  const _tickHr0 = process.hrtime();\n  _ANA.t0 = _ANA.m = _anaT();" },
  // ── 사슬(머리 → 결정 문) ──
  { find: "  { const _t0 = Date.now(); SimVillages.onGameTick(now);",
    repl: "  _ANA.cut('head');\n  { const _t0 = Date.now(); SimVillages.onGameTick(now);" },
  { find: "  Bandits.onGameTick(now);",
    repl: "  _ANA.cut('econDay');\n  Bandits.onGameTick(now);" },
  { find: "  // === 14.49-e3-perf5: idle zone skip ===",
    repl: "  _ANA.cut('worldDay');\n  // === 14.49-e3-perf5: idle zone skip ===" },
  { find: "  // === 활성 청크 갱신 (player·observer 위치 기반) ===",
    repl: "  _ANA.cut('idleScan');\n  // === 활성 청크 갱신 (player·observer 위치 기반) ===" },
  { find: "  // === Spatial index 재구축 — 모든 nearest-search가 이걸 씀 ===",
    repl: "  _ANA.cut('chunks');\n  // === Spatial index 재구축 — 모든 nearest-search가 이걸 씀 ===" },
  { find: "  // 입력 타임아웃 — 2.5초 동안 입력 없으면 정지",
    repl: "  _ANA.cut('spatial');\n  // 입력 타임아웃 — 2.5초 동안 입력 없으면 정지" },
  { find: "  // === NPC 행동 결정 (사람 player는 input으로 vx/vy 받지만 NPC는 직접 결정) ===",
    repl: "  _ANA.cut('inputTO');\n  // === NPC 행동 결정 (사람 player는 input으로 vx/vy 받지만 NPC는 직접 결정) ===" },
  // ── T356 의 틀 셋(그대로) ──
  { find: "  let _curHit = (_npcCursor === null), _stopAt = null;",
    repl: "  _ANA.cut('decPre');\n  let _curHit = (_npcCursor === null), _stopAt = null;" },
  { find: "  _npcCursor = _curHit ? _stopAt : null;   // 한 바퀴를 다 돌았거나(=null) 커서가 사라졌으면 처음부터",
    repl: "  _ANA.cut('loopDec');\n  _npcCursor = _curHit ? _stopAt : null;   // 한 바퀴를 다 돌았거나(=null) 커서가 사라졌으면 처음부터" },
  { find: "  // Phase 5-I: 화살 물리/히트 + 만료된 ghost 정리",
    repl: "  _ANA.cut('farm');\n  // Phase 5-I: 화살 물리/히트 + 만료된 ghost 정리" },
  { find: "  for (const p of players.values()) {\n    if (p.handingOff) continue;\n    if (p.isNpc) {\n      if (p.simCaravan) continue;",
    repl: "  _ANA.cut('arrows');\n  for (const p of players.values()) {\n    if (p.handingOff) continue;\n    if (p.isNpc) {\n      if (p.simCaravan) continue;" },
  { find: "  // === Phase 14.49-e: PZ식 다단 계단 — 3 cell 점유 + step별 z + walk-off로 floor 전환 ===",
    repl: "  _ANA.cut('loopMov');\n  // === Phase 14.49-e: PZ식 다단 계단 — 3 cell 점유 + step별 z + walk-off로 floor 전환 ===" },
  // ── 사슬(이동 문 뒤 → 델타) ──
  { find: "  // === 14.49-e2: 낙하 (falling) — 위층에서 받침 floor 없는 곳으로 walk-off ===",
    repl: "  _ANA.cut('stairs');\n  // === 14.49-e2: 낙하 (falling) — 위층에서 받침 floor 없는 곳으로 walk-off ===" },
  { find: "  // === 생존 게이지: hunger/thirst 감소 + 0이면 HP 페널티 + vp decay ===",
    repl: "  _ANA.cut('fall');\n  // === 생존 게이지: hunger/thirst 감소 + 0이면 HP 페널티 + vp decay ===" },
  { find: "  // === HP 회복 (out-of-combat 1초 후) — 단 hunger/thirst 모두 0이상일 때만 ===",
    repl: "  _ANA.cut('gauge');\n  // === HP 회복 (out-of-combat 1초 후) — 단 hunger/thirst 모두 0이상일 때만 ===" },
  { find: "  // === 게이지 변화 주기 broadcast (1초 간격, self에만) ===",
    repl: "  _ANA.cut('hpRegen');\n  // === 게이지 변화 주기 broadcast (1초 간격, self에만) ===" },
  { find: "  // === [T385] 한 바퀴 — 뒤 묶음 다섯(계단·낙하·게이지·HP·방송) ===",
    repl: "  _ANA.cut('gaugeNet');\n  // === [T385] 한 바퀴 — 뒤 묶음 다섯(계단·낙하·게이지·HP·방송) ===" },
  { find: "  // === Mob AI ===",
    repl: "  _ANA.cut('sweep');\n  // === Mob AI ===" },
  { find: "  // §4-4 동물 AI 블록(마을실험실 이식) — 활성 청크 뷰의 야생 5종.",
    repl: "  _ANA.cut('mobs');\n  // §4-4 동물 AI 블록(마을실험실 이식) — 활성 청크 뷰의 야생 5종." },
  { find: "  const allPlayers = Array.from(players.values());",
    repl: "  _ANA.cut('wildlife');\n  const allPlayers = Array.from(players.values());" },
  // 틱 끝 — 델타 창을 닫고 한 줄 찍는다
  { find: "}, TICK_MS);",
    repl: "  _ANA.cut('aoi');\n  _ANA.tot += (_anaT() - _ANA.t0); _ANA.pop = npcs.size; _ANA.mobN = mobs.size; _ANA.rep();\n}, TICK_MS);" },
];

// ★[T444] `T444_SUB=1` 일 때만 — T394 의 값 해부(되짚기 갈래 둘 · 되짚기 안 술어 · 배회 결정 · A* · 되짚기 반복률)
//   계수는 보고줄 `x` 에 실린다(ms 합 · 호출 수). 되짚기 반복 = 같은 몸의 **바로 앞 되짚기와 입력(목표 x·y · 닻 x·y)이 글자 그대로 같은가**.
if (process.env.T444_SUB === '1') {
  const X = (k) => `(_ANA.x.${k} = (_ANA.x.${k} || 0) + 1)`;
  PATCHES.push(
    { find: "    if (T394_WORK_TERRAIN) _t394OpenTarget(npc, npc.npcWorkX, npc.npcWorkY);",
      repl: "    if (T394_WORK_TERRAIN) { const _k = npc.targetX + ',' + npc.targetY + ',' + npc.npcWorkX + ',' + npc.npcWorkY; const _m = (global._t444k || (global._t444k = new Map())); if (_m.get(npc.pid) === _k) " + X('owRep') + "; _m.set(npc.pid, _k);\n      const _s = _anaT(); const _r = _t394OpenTarget(npc, npc.npcWorkX, npc.npcWorkY); _ANA.x.owT = (_ANA.x.owT || 0) + (_anaT() - _s); " + X('ow') + "; if (_r) " + X('owMoved') + "; }" },
    { find: "  if (T394_WORK_TERRAIN) _t394OpenTarget(npc, npc.x, npc.y);",
      repl: "  if (T394_WORK_TERRAIN) { const _s = _anaT(); const _r = _t394OpenTarget(npc, npc.x, npc.y); _ANA.x.ojT = (_ANA.x.ojT || 0) + (_anaT() - _s); " + X('oj') + "; if (_r) " + X('ojMoved') + "; }" },
    { find: "  const blk = (x, y) => isTerrainBlockedLocal(Math.floor(x / B) * B + H, Math.floor(y / B) * B + H);",
      repl: "  const blk = (x, y) => (" + X('oq') + ", isTerrainBlockedLocal(Math.floor(x / B) * B + H, Math.floor(y / B) * B + H));" },
    { find: "  npc.behavior = 'wander';\n  if (npc.npcWorkX != null && npc.npcWorkY != null) {",
      repl: "  npc.behavior = 'wander';\n  if (npc.npcWorkX != null && npc.npcWorkY != null) " + X('wander') + ";\n  if (npc.npcWorkX != null && npc.npcWorkY != null) {" },
    { find: "    const p = computeNpcPath(npc, now);",
      repl: "    const _ps = _anaT(); const p = computeNpcPath(npc, now); _ANA.x.pathT = (_ANA.x.pathT || 0) + (_anaT() - _ps); " + X('path') + ";" });
}
// ★[T421] `SPATIAL_SUB=1` 일 때만 — `rebuildSpatialIndex` 안 토막 넷(주민 바퀴 · 몹 · 건물 · 자원)
if (SPATIAL_SUB) {
  const i = SEGS.findIndex((x) => x[0] === 'spatial');
  SEGS.splice(i, 0, ['spPl', '[T421] 격자 — 주민 바퀴(+격자 셋 할당)'], ['spMob', '[T421] 격자 — 몹 삽입'],
    ['spBld', '[T421] 격자 — 활성 청크 건물 삽입'], ['spRes', '[T421] 격자 — 자원(5Hz 조절)']);
  PATCHES.push(
    { find: "  for (const m of mobs.values())       qtMobs.insert({ x: m.x, y: m.y, ref: m });",
      repl: "  _ANA.cut('spPl');\n  for (const m of mobs.values())       qtMobs.insert({ x: m.x, y: m.y, ref: m });" },
    { find: "  // qtBuildings — 활성청크 건물만 인덱싱.",
      repl: "  _ANA.cut('spMob');\n  // qtBuildings — 활성청크 건물만 인덱싱." },
    { find: "  // 자원은 안 움직임 — 매 tick 재삽입하면",
      repl: "  _ANA.cut('spBld');\n  // 자원은 안 움직임 — 매 tick 재삽입하면" },
    { find: "    _lastResRebuild = Date.now();\n  }\n}\n",
      repl: "    _lastResRebuild = Date.now();\n  }\n  _ANA.cut('spRes');\n}\n" });
}
// ★[T455] `T455_CLOCK_AT=<ms>` 일 때만(자의 손잡이 · 사본에만) — T427 시계 블록의 원점을 **고정 시각**으로 바꾼다.
//   T427 `ZONE_CLOCK_ANCHOR=boot` 는 원점을 "기동 시각(벽시계)"에 묶는다 → 판마다 게임일이 다르다(씨 해시의 게임일 · 템플릿 뒤 흐른 시간).
//   이 손잡이는 그 원점을 **판마다 같은 한 시각**에 묶는다 ⇒ 판 다섯이 같은 게임일 · 같은 phase 에서 첫 틱을 돈다(씨·국면·기동 뒤 시간 셋이 한꺼번에 같아진다).
//   ⚠`ZONE_CLOCK_ANCHOR=boot` 와 같이 줘야 돈다(그 블록 안의 한 글자다).
if (process.env.T455_CLOCK_AT) {
  PATCHES.push({ find: "  const real = Date.now, t0 = real();",
    repl: "  const real = Date.now, t0 = (process.env.T455_CLOCK_AT ? +process.env.T455_CLOCK_AT : real());   // [T455 자 · 사본에만]" });
}
function probeHead() {
  const names = SEGS.map((s) => s[0]);
  return PROBE_HEAD
    .replace('__SEGFIELDS__', '  ' + names.map((k) => `${k}: 0`).join(', ') + ', __cal: 0,')
    .replace('__SEGREP__', names.map((k) => `    o.${k} = this.${k};`).join('\n'))
    .replace('__SEGZERO__', '    ' + names.map((k) => `this.${k} = 0`).join('; ') + ';');
}

function makeArm(dir) {
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  execFileSync('git', ['worktree', 'add', '--detach', '-q', dir, process.env.SRC_REF || 'HEAD'], { cwd: ROOT, stdio: 'ignore' });   // ★[T444] `SRC_REF` — 재는 나무(기본 HEAD)
  try { fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules')); } catch (e) {}
  const zp = path.join(dir, 'server', 'zone.js');
  let s = fs.readFileSync(zp, 'utf8');
  let n = 0;
  const head = probeHead();
  for (const p of PATCHES) {
    const cnt = s.split(p.find).length - 1;
    if (cnt !== 1) throw new Error(`탐침 앵커가 ${cnt}개다(1이어야 한다): ${p.find.slice(0, 70)}`);
    s = s.replace(p.find, () => p.repl.replace('__PROBE_HEAD__', () => head));
    n++;
  }
  fs.writeFileSync(zp, s);
  execFileSync(process.execPath, ['--check', zp]);
  return n;
}

async function run() {
  const arm = 'rest-' + TAG;
  const dir = `/tmp/wt-t371-${TAG}`;
  const probes = makeArm(dir);
  const CP = PB + (WINDOW === 'day' ? 0 : 4) + (ARM === 'off' ? 0 : 8), ZP = CP + 1;
  const SECRET = 't371-' + TAG;
  const DB = `/tmp/t371-z-${TAG}.db`, CDB = `/tmp/t371-c-${TAG}.db`;
  rmdb(DB); rmdb(CDB);
  for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, DB + s); } catch (e) {} }
  const LOG = `/tmp/t371-${TAG}.log`;
  const logf = fs.openSync(LOG, 'w');
  const c = spawn(process.execPath, [path.join(dir, 'server/central.js')], { cwd: dir, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(dir, 'server/zone.js')], { cwd: dir, stdio: ['ignore', logf, logf],
    env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP),
      CENTRAL_SECRET: SECRET, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS), DB_PATH: DB, VILLAGE_WAR_LOG: '0',
      T312_FISH_ACT: '1', T371_EVERY: String(SLICE_S * 30),
      }, ARM_ENV) });   // ★[T421] 팔 환경(`ARM_ENV`)
  const getj = async (p, h) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, h ? { headers: h } : undefined); return await r.json(); } catch (e) { return null; } };
  const perf = (reset) => getj(`/perf${reset ? '?reset=1' : ''}`, { 'x-zone-secret': SECRET });
  const life = () => getj('/lifedbg', { 'x-zone-secret': SECRET });
  const health = async () => { try { const r = await fetch(`http://localhost:${ZP}/health`); return r.ok; } catch (e) { return false; } };
  const say = (...a) => console.log(`[${arm}]`, ...a);

  const t0 = Date.now();
  for (let i = 0; i < 900 && !(await health()); i++) await sleep(1000);
  const bootMs0 = Date.now() - t0;
  say('기동', bootMs0, 'ms · 탐침', probes);
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
  const ping = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);
  await sleep(25000);
  // ★[T433 ② 규약 ⓐ] `WAITDAY=1` — 부팅 뒤 **첫 하루 경계**를 넘긴 뒤에야 창을 찾는다(틀 존은 그 경계에서 한 칸 오른다 · T410 §2-⓪).
  //   기본 끔(종전 값 무변). 켜면 팔 둘이 **같은 조건**(경계 뒤)에서 든다 — 부팅 국면이 달라도.
  let dayWait = null;
  if (process.env.WAITDAY === '1') { dayWait = await require('./lib-tick-rule').waitDayBoundary(async () => { const L = await life(); return L && L.phase; }); say('첫 하루 경계', dayWait.crossed ? '넘김' : '못 넘김', '· phase', dayWait.phase); }
  let ph = null;
  for (let i = 0; i < 2000; i++) {
    const L = await life(); ph = L && L.phase;
    if (ph != null && ph >= E_LO && ph <= Math.min(E_HI, W_HI - (SLICES * SLICE_S) / (DAY_MS / 1000))) break;
    await sleep(5000);
  }
  say(WINDOW + ' 창 진입 · phase', ph, '· 드는 띠', E_LO, '~', E_HI);
  const slices = [];
  // ★[T455] 호스트 경합 — 조각마다 `/proc/stat` 전체 CPU(코어 합) 차 · steal · `os.loadavg()` 1분(자 자신도 이 호스트에 있다)
  const cpuStat = () => { try { const f = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number); return { tot: f.reduce((a, b) => a + b, 0), idle: f[3] + (f[4] || 0), steal: f[7] || 0 }; } catch (e) { return null; } };
  const winAt = Date.now();
  for (let k = 0; k < SLICES; k++) {
    await perf(true);
    const mark = fs.statSync(LOG).size;
    const h0 = cpuStat();
    await sleep(SLICE_S * 1000);
    const h1 = cpuStat();
    const host = (h0 && h1) ? { busy: +(100 * (1 - (h1.idle - h0.idle) / (h1.tot - h0.tot))).toFixed(1), steal: +(100 * (h1.steal - h0.steal) / (h1.tot - h0.tot)).toFixed(2), load1: +require('os').loadavg()[0].toFixed(2) } : null;
    const p = await perf(false), L = await life();
    const t = p && p.tick && p.tick.ms;
    // ⚠바이트 자리다 — `readFileSync(...,'utf8').slice(mark)` 로 자르면 **글자 자리**로 잘려
    //   한글이 섞인 로그에선 창 전체를 지나쳐 0줄이 된다(T371 첫 판 실측: 조각 8개 모두 0줄).
    const buf = fs.readFileSync(LOG).subarray(mark).toString('utf8');
    const rest = buf.split('\n').filter((x) => x.startsWith('[REST] ')).map((x) => { try { return JSON.parse(x.slice(7)); } catch (e) { return null; } }).filter(Boolean);
    let nonSleep = 0;
    for (const v of ((L && L.villages) || [])) for (const [kk, n] of Object.entries(v.acts || {})) if (kk !== '취침') nonSleep += n;
    slices.push({ k, phase: L && L.phase, p50: t && t.p50, p95: t && t.p95, ticks: p.tick.n,
      pop: (L && L.totals && L.totals.pop) || 0, nonSleep, drop: p.tick.dropN, lag: p.tick.lagPct, rest, walk: p.walk || null, host });
    say(`조각 ${k} phase ${L && L.phase != null ? L.phase.toFixed(3) : '?'} · p50 ${t ? t.p50 : '?'}ms · 비취침 ${nonSleep} · REST줄 ${rest.length}`);
  }
  clearInterval(ping); try { ws.close(); } catch (e) {}
  try { z.kill(); } catch (e) {} try { c.kill(); } catch (e) {}
  await sleep(1500); rmdb(DB); rmdb(CDB);
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  return { arm, WINDOW, ARM, probes, segs: SEGS, slices, dayWait, bootMs: bootMs0, bootAt: t0, winAt, armEnv: ARM_ENV };
}

(async () => {
  if (process.env.PATCH_ONLY === '1') {
    const d = '/tmp/wt-t371-dry';
    const n = makeArm(d);
    const z = fs.readFileSync(path.join(d, 'server', 'zone.js'), 'utf8');
    console.log('박은 탐침', n, '· _ANA.cut 자리', (z.match(/_ANA\.cut\(/g) || []).length);
    console.log('머리 온전:', z.includes('const _ANA = {'), '· 보고줄 온전:', z.includes("console.log('[REST] '"));
    for (const [k] of SEGS) if (!z.includes(`_ANA.cut('${k}')`)) console.log('⚠사슬 빠짐:', k);
    try { execFileSync('git', ['worktree', 'remove', '--force', d], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
    process.exit(0);
  }
  const r = await run();
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), WINDOW, ARM, DAY_MS, SLICE_S, SLICES, TPL, run: r }, null, 1));
  console.log('끝 →', OUT);
  process.exit(0);
})();
