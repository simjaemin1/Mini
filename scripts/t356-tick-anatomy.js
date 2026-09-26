#!/usr/bin/env node
// === scripts/t356-tick-anatomy.js — 사람당 5.48µs 를 **갈래 여섯**으로 가른다 (T356 ①) ==========
//
// ⚠계측기다(러너 밖 · `@regress` 없음). **제품 코드는 한 글자도 안 만진다** —
//   탐침은 `git worktree` 로 뜬 **사본**에만 박고, 그 사본을 돌린 뒤 지운다(카드 §1: 제품 손잡이 0).
//
// ★왜 이 꼴인가 — 카드는 "갈래를 하나씩 **끄거나 고정**해서 빼라" 고 했다. 그런데 끄면 **세계가 달라진다**:
//   결정을 끄면 아무도 안 걷고(걸음 갈래까지 사라진다), A* 를 끄면 막힌 주민이 벽을 비비고, 관측자를 끄면
//   활성 청크가 줄어 순회 자체가 짧아진다. 그러면 뺀 수가 그 갈래의 값인지 **달라진 세계의 값**인지 못 가른다
//   (T345 §3-ⓑ 가 실측으로 그 함정에 빠졌다 — 낮 조각 편차 ±8 % > 효과).
//   ⇒ **한 판 안에서 갈래마다 시계를 댄다**(관측자 규약 · T324 `_walk` 와 같은 자리). 같은 씨 · 같은 세계 ·
//     한 번에 여섯. 합이 틱과 안 맞으면 그 차가 곧 **"못 가른 나머지"** 다 — 지어낼 자리가 없다.
//   ⚠자의 값은 자기도 댄다: 탐침 없는 팔(`base`)을 나란히 돌려 **탐침 몫**을 뺀 표를 낸다.
//
// ★국면은 **밤**이다(카드 지정 · T345 §3-ⓑ). 밤은 할 일이 집 하나뿐이라 조각 편차가 작다.
//
// 실행: node scripts/t356-tick-anatomy.js [out.json]
//   ARMS=base,probe(기본) · SLICE_S=30 · SLICES=8 · PORT_BASE=3900 · TPL=/tmp/t316-tpl.db · DAY_MS=1440000
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/t356-anatomy.json';
const ARMS = (process.env.ARMS || 'base,probe').split(',').map((s) => s.trim()).filter(Boolean);
const PB = parseInt(process.env.PORT_BASE || '3900', 10);
const DAY_MS = parseInt(process.env.DAY_MS || '1440000', 10);
const SLICE_S = parseInt(process.env.SLICE_S || '30', 10);
const SLICES = parseInt(process.env.SLICES || '8', 10);
const TPL = process.env.TPL || '/tmp/t316-tpl.db';
// 창 — 카드는 **밤**을 지정했다(T345 §3-ⓑ 가 낮 조각 편차 ±8 % 라 했으므로).
//   ⚠그 ±8 % 는 **팔 사이 빼기**의 이야기다. 이 자는 한 판 안에서 갈래마다 시계를 대므로(빼기 0)
//     낮에도 값이 그 판의 정확한 수다. 그리고 **사람당 5.48µs 는 하루 평균**이라 밤만 재면 짝이 안 맞는다.
//   ⇒ 창을 둘 다 돈다: `WINDOW=night`(카드 지정) · `WINDOW=day`(5.48 과 견줄 창).
const WINDOW = (process.env.WINDOW || 'night').trim();
const W_LO = WINDOW === 'day' ? 0.10 : 0.72, W_HI = WINDOW === 'day' ? 0.62 : 0.97;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

// ── 탐침 — 사본에 박는 글자들 ────────────────────────────────────────────────
// 앵커는 전부 **한 번만** 나오는 줄이다(박기 전에 센다 · 둘이면 멈춘다).
const PROBE_HEAD = `
// ── [T356 탐침 · 계측기가 박았다 · 제품엔 없다] ────────────────────────────
//   ★시계는 **performance.now()** 다(double ms · 할당 0). 첫 판은 \`process.hrtime.bigint()\` 를 썼는데
//     호출마다 BigInt 를 **할당**해 밤 틱이 3.7 → 9.5ms 로 뛰었다(실측) — 자가 잰 것을 자가 만든 꼴이다.
//   ★자기 값을 자기도 잰다: 기동 때 시계 한 번 값(ns)을 재어 같이 찍는다. 갈래마다 호출 수를 세므로
//     보는 쪽이 \`2 × clockNs × 호출수\` 를 그대로 뺀다(빼기가 추정이 아니라 계수다).
const _ANA = { n: 0, tot: 0, loopDec: 0, loopMov: 0, aoi: 0, dec: 0, life: 0, astar: 0, step: 0, npcStepT: 0,
  stepN: 0, decN: 0, astarN: 0, lifeN: 0, pop: 0, t0: 0, clockNs: 0,
  every: parseInt(process.env.T356_EVERY || '900', 10),
  cal() {
    const P = 400000, a = _anaT();
    for (let i = 0; i < P; i++) { const x = _anaT(); if (x < 0) console.log(x); }
    this.clockNs = (_anaT() - a) * 1e6 / P;
  },
  rep() {
    this.n++;
    if (this.n < this.every) return;
    if (!this.clockNs) this.cal();
    try {
      console.log('[ANA] ' + JSON.stringify({ n: this.n, pop: this.pop, phase: +worldPhase(Date.now()).toFixed(4),
        clockNs: +this.clockNs.toFixed(1),
        tot: this.tot, loopDec: this.loopDec, loopMov: this.loopMov, aoi: this.aoi,
        dec: this.dec, life: this.life, astar: this.astar, step: this.step, npcStepT: this.npcStepT,
        stepN: this.stepN, decN: this.decN, astarN: this.astarN, lifeN: this.lifeN }));
    } catch (e) {}
    this.n = 0;
    this.tot = this.loopDec = this.loopMov = this.aoi = this.dec = this.life = this.astar = this.step = this.npcStepT = 0;
    this.stepN = this.decN = this.astarN = this.lifeN = 0;
  } };
const _anaPerf = require('perf_hooks').performance;
const _anaT = () => _anaPerf.now();   // ⚠performance.now 는 묶지 않으면 this 가 없다(실측)
`;

const PATCHES = [
  // 머리 — 누산기(요청 순서상 가장 먼저 박는다)
  { find: "const _SEED = require('./seed-rand');",
    repl: "const _SEED = require('./seed-rand');\n__PROBE_HEAD__" },
  // 틱 시작/끝
  { find: "  const _tickHr0 = process.hrtime();",
    repl: "  const _tickHr0 = process.hrtime();\n  _ANA.t0 = _anaT();" },
  { find: "}, TICK_MS);",
    repl: "  _ANA.tot += (_anaT() - _ANA.t0); _ANA.pop = npcs.size; _ANA.rep();\n}, TICK_MS);" },
  // ⓓ-1 결정 문 순회
  { find: "  let _curHit = (_npcCursor === null), _stopAt = null;",
    repl: "  const _anaL0 = _anaT();\n  let _curHit = (_npcCursor === null), _stopAt = null;" },
  { find: "  _npcCursor = _curHit ? _stopAt : null;   // 한 바퀴를 다 돌았거나(=null) 커서가 사라졌으면 처음부터",
    repl: "  _ANA.loopDec += (_anaT() - _anaL0);\n  _npcCursor = _curHit ? _stopAt : null;   // 한 바퀴를 다 돌았거나(=null) 커서가 사라졌으면 처음부터" },
  // npcStep 한 사람분
  { find: "    npcStep(npc, dt, now);",
    repl: "    { const _s = _anaT(); npcStep(npc, dt, now); _ANA.npcStepT += (_anaT() - _s); }" },
  // ⓐ+ⓕ 결정
  { find: "  decideNpcBehavior(npc, now);",
    repl: "  { const _s = _anaT(); decideNpcBehavior(npc, now); _ANA.dec += (_anaT() - _s); _ANA.decN++; }" },
  // ⓕ 생활층
  { find: "  if (npc.simVillageId && SimVillages.npcLifeTick && SimVillages.npcLifeTick(npc, now)) return;",
    repl: "  if (npc.simVillageId && SimVillages.npcLifeTick) { const _s = _anaT(); const _r = SimVillages.npcLifeTick(npc, now); _ANA.life += (_anaT() - _s); _ANA.lifeN++; if (_r) return; }" },
  // ⓒ A*
  { find: "    const p = computeNpcPath(npc, now);",
    repl: "    const _s = _anaT(); const p = computeNpcPath(npc, now); _ANA.astar += (_anaT() - _s); _ANA.astarN++;" },
  // ⓓ-2 이동 문 순회
  { find: "  for (const p of players.values()) {\n    if (p.handingOff) continue;\n    if (p.isNpc) {\n      if (p.simCaravan) continue;",
    repl: "  const _anaL1 = _anaT();\n  for (const p of players.values()) {\n    if (p.handingOff) continue;\n    if (p.isNpc) {\n      if (p.simCaravan) continue;" },
  { find: "  // === Phase 14.49-e: PZ식 다단 계단 — 3 cell 점유 + step별 z + walk-off로 floor 전환 ===",
    repl: "  _ANA.loopMov += (_anaT() - _anaL1);\n  // === Phase 14.49-e: PZ식 다단 계단 — 3 cell 점유 + step별 z + walk-off로 floor 전환 ===" },
  // ⓑ 걸음
  { find: "      movePlayerStep(p);",
    repl: "      { const _s = _anaT(); movePlayerStep(p); _ANA.step += (_anaT() - _s); _ANA.stepN++; }" },
  // ⓔ 델타 직렬화/방송
  { find: "  const allPlayers = Array.from(players.values());",
    repl: "  const _anaA0 = _anaT();\n  const allPlayers = Array.from(players.values());" },
  { find: "  _ANA.tot += (_anaT() - _ANA.t0); _ANA.pop = npcs.size; _ANA.rep();",
    repl: "  _ANA.aoi += (_anaT() - _anaA0);\n  _ANA.tot += (_anaT() - _ANA.t0); _ANA.pop = npcs.size; _ANA.rep();" },
];


// ── probe2 전용 — 이동 문 **안**을 술어 셋으로 더 가른다 ──────────────────
//   왜 따로 팔인가: 술어는 걸음마다 11.8회 불린다(T324 계수) ⇒ 시계 값이 본 자보다 커진다.
//   그래서 이 셋은 **별도 팔**에서만 켠다(주 해부 표를 안 흐린다 · 자 값은 호출 수로 그대로 뺀다).
const PATCHES2 = [
  { find: "const _ANA = { n: 0, tot: 0, loopDec: 0,",
    repl: "const _ANA2 = { wall: 0, terr: 0, tree: 0, wallN: 0, terrN: 0, treeN: 0 };\nconst _ANA = { n: 0, tot: 0, loopDec: 0," },
  { find: "        tot: this.tot, loopDec: this.loopDec, loopMov: this.loopMov, aoi: this.aoi,",
    repl: "        wall: _ANA2.wall, terr: _ANA2.terr, tree: _ANA2.tree, wallN: _ANA2.wallN, terrN: _ANA2.terrN, treeN: _ANA2.treeN,\n        tot: this.tot, loopDec: this.loopDec, loopMov: this.loopMov, aoi: this.aoi," },
  { find: "    this.stepN = this.decN = this.astarN = this.lifeN = 0;",
    repl: "    this.stepN = this.decN = this.astarN = this.lifeN = 0;\n    _ANA2.wall = _ANA2.terr = _ANA2.tree = _ANA2.wallN = _ANA2.terrN = _ANA2.treeN = 0;" },
  // 술어 셋 — 함수 머리에서 통째로 잰다(호출 자리가 많아 자리마다 못 박는다)
  { find: "function isBlockedByWall(newX, newY, oldX, oldY, playerFloor = 0, traceName = null) {\n  _walk.wallQ++;",
    repl: "function isBlockedByWall(newX, newY, oldX, oldY, playerFloor = 0, traceName = null) {\n  _walk.wallQ++;\n  { const _s = _anaT(); const _r = _isBlockedByWall0(newX, newY, oldX, oldY, playerFloor, traceName); _ANA2.wall += (_anaT() - _s); _ANA2.wallN++; return _r; }\n}\nfunction _isBlockedByWall0(newX, newY, oldX, oldY, playerFloor = 0, traceName = null) {" },
  { find: "function isTerrainBlockedLocal(x, y) {",
    repl: "function isTerrainBlockedLocal(x, y) {\n  { const _s = _anaT(); const _r = _isTerrainBlockedLocal0(x, y); _ANA2.terr += (_anaT() - _s); _ANA2.terrN++; return _r; }\n}\nfunction _isTerrainBlockedLocal0(x, y) {" },
  { find: "function treeBlockerAt(x, y) {",
    repl: "function treeBlockerAt(x, y) {\n  { const _s = _anaT(); const _r = _treeBlockerAt0(x, y); _ANA2.tree += (_anaT() - _s); _ANA2.treeN++; return _r; }\n}\nfunction _treeBlockerAt0(x, y) {" },
];

function makeArm(arm, dir) {
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  execFileSync('git', ['worktree', 'add', '--detach', '-q', dir, 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
  try { fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules')); } catch (e) {}
  if (arm === 'base' || arm === 'soa') return 0;   // 탐침 0 인 팔 둘(끔/켬) — 값을 재는 짝
  const zp = path.join(dir, 'server', 'zone.js');
  let s = fs.readFileSync(zp, 'utf8');
  let n = 0;
  for (const p of (arm === 'probe2' ? PATCHES.concat(PATCHES2) : PATCHES)) {
    const cnt = s.split(p.find).length - 1;
    if (cnt !== 1) throw new Error(`탐침 앵커가 ${cnt}개다(1이어야 한다): ${p.find.slice(0, 60)}`);
    s = s.replace(p.find, () => p.repl.replace('__PROBE_HEAD__', () => PROBE_HEAD));   // ★함수 치환 — `$` 가 든 글자를 문자열로 넘기면 `$&` 로 먹힌다
    n++;
  }
  fs.writeFileSync(zp, s);
  execFileSync(process.execPath, ['--check', zp]);   // 박고 나서 문법을 확인한다(깨진 사본을 안 돌린다)
  return n;
}

async function runArm(arm, idx) {
  const dir = `/tmp/wt-t356-${arm}`;
  const probes = makeArm(arm, dir);
  const CP = PB + idx * 4, ZP = CP + 1;
  const SECRET = 't356-' + arm;
  const DB = `/tmp/t356-z-${arm}.db`, CDB = `/tmp/t356-c-${arm}.db`;
  rmdb(DB); rmdb(CDB);
  for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, DB + s); } catch (e) {} }
  const logf = fs.openSync(`/tmp/t356-${arm}.log`, 'w');
  const c = spawn(process.execPath, [path.join(dir, 'server/central.js')], { cwd: dir, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(dir, 'server/zone.js')], { cwd: dir, stdio: ['ignore', logf, logf],
    env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP),
      CENTRAL_SECRET: SECRET, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS), DB_PATH: DB, VILLAGE_WAR_LOG: '0',
      T312_FISH_ACT: '1', T356_EVERY: String(SLICE_S * 30),
      T356_SOA: (arm === 'soa' || arm === 'probeSoa') ? '1' : '' }) });   // ★[T356 ②] 손잡이 팔
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
  await sleep(25000);                                   // 마을이 깨어나 걷는다 + 미리 굽기가 끝난다
  // ★[T433 ② 규약 ⓐ] `WAITDAY=1` — 부팅 뒤 첫 하루 경계를 넘긴 뒤에야 창을 찾는다(기본 끔 = 종전 값 무변)
  if (process.env.WAITDAY === '1') { const w = await require('./lib-tick-rule').waitDayBoundary(async () => { const L = await life(); return L && L.phase; }); say('첫 하루 경계', w.crossed ? '넘김' : '못 넘김', '· phase', w.phase); }
  // ── 밤 창을 기다린다 ──
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
    const mark = fs.statSync(`/tmp/t356-${arm}.log`).size;
    await sleep(SLICE_S * 1000);
    const p = await perf(false), L = await life();
    const t = p && p.tick && p.tick.ms;
    // 그 조각 동안 찍힌 [ANA] 줄들
    const buf = fs.readFileSync(`/tmp/t356-${arm}.log`, 'utf8').slice(mark);
    const ana = buf.split('\n').filter((x) => x.startsWith('[ANA] ')).map((x) => { try { return JSON.parse(x.slice(6)); } catch (e) { return null; } }).filter(Boolean);
    let nonSleep = 0;
    for (const v of ((L && L.villages) || [])) for (const [kk, n] of Object.entries(v.acts || {})) if (kk !== '취침') nonSleep += n;
    slices.push({ k, phase: L && L.phase, p50: t && t.p50, p95: t && t.p95, ticks: p.tick.n,
      stepsPerTick: p.walk && p.walk.steps != null ? null : null,
      pop: (L && L.totals && L.totals.pop) || 0, nonSleep, drop: p.tick.dropN, lag: p.tick.lagPct, ana });
    say(`조각 ${k} phase ${L && L.phase != null ? L.phase.toFixed(3) : '?'} · p50 ${t ? t.p50 : '?'}ms · 비취침 ${nonSleep} · ANA줄 ${ana.length}`);
  }
  clearInterval(ping); try { ws.close(); } catch (e) {}
  try { z.kill(); } catch (e) {} try { c.kill(); } catch (e) {}
  await sleep(1500); rmdb(DB); rmdb(CDB);
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  return { arm, probes, slices };
}

(async () => {
  // 탐침만 박아 보고 끝낸다(문법·앵커 확인 · 기동 0) — `PATCH_ONLY=1`
  if (process.env.PATCH_ONLY === '1') {
    const d = '/tmp/wt-t356-dry';
    const n = makeArm(process.env.ARMS || 'probe', d);
    const z = fs.readFileSync(path.join(d, 'server', 'zone.js'), 'utf8');
    console.log('박은 탐침', n, '· _ANA 자리', (z.match(/_ANA\./g) || []).length, '· _anaT()', (z.match(/_anaT\(\)/g) || []).length);
    console.log('머리 온전:', z.includes('const _ANA = { n: 0, tot: 0'), '· 보고줄 온전:', z.includes("console.log('[ANA] '"));
    try { execFileSync('git', ['worktree', 'remove', '--force', d], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
    process.exit(0);
  }
  const res = [];
  for (let i = 0; i < ARMS.length; i++) {
    res.push(await runArm(ARMS[i], i));
    fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), WINDOW, DAY_MS, SLICE_S, SLICES, TPL, arms: res }, null, 1));
  }
  console.log('끝 →', OUT);
  process.exit(0);
})();
