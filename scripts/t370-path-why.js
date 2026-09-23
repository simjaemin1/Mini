#!/usr/bin/env node
// === scripts/t370-path-why.js — A* 를 **왜** 다시 묻나 (T370 ①) ==========
//
// ⚠계측기다(러너 밖 · `@regress` 없음). **제품 코드는 한 글자도 안 만진다** —
//   탐침은 `git worktree` 로 뜬 **사본**에만 박고, 그 사본을 돌린 뒤 지운다(카드 §1: 제품 손잡이 0).
//
// ★무엇을 세나 — T356 이 "낮에 A* 가 틱마다 899명(61 %)" 을 냈고, 카드는 **왜**를 묻는다.
//   재계산 조건은 넷이다(`zone.js` 그 줄): `!path` · `pathIndex >= length` · `_pathFor !== targetKey` ·
//   `now - _pathAt > 5000`. **추측하지 않는다 — 센다.** 이유별 수 · 같은 주민이 연속 몇 틱 묻는가 ·
//   그때 그 주민의 상태(행동 · 목표까지 거리 · 경로 끝인가) · 그리고 `computeNpcPath` 가 **어느 갈래로**
//   돌아왔나(d<48 · 도주/비주민 배회 · 직선 깨끗 · 진짜 A* · 못 찾음).
//   ⚠자는 T356 그대로다(관측자 규약 · 사본에만 박는다 · 제품 무접촉).
//
// 실행: node scripts/t356-tick-anatomy.js [out.json]
//   ARMS=why(기본) · WINDOW=day|night · SLICE_S=30 · SLICES=8 · PORT_BASE=4000 · TPL=/tmp/t316-tpl.db
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/t370-path-why.json';
const ARMS = (process.env.ARMS || 'why').split(',').map((s) => s.trim()).filter(Boolean);
const PB = parseInt(process.env.PORT_BASE || '4000', 10);
const DAY_MS = parseInt(process.env.DAY_MS || '1440000', 10);
const SLICE_S = parseInt(process.env.SLICE_S || '30', 10);
const SLICES = parseInt(process.env.SLICES || '8', 10);
const TPL = process.env.TPL || '/tmp/t316-tpl.db';
// 창 — 카드는 **밤**을 지정했다(T345 §3-ⓑ 가 낮 조각 편차 ±8 % 라 했으므로).
//   ⚠그 ±8 % 는 **팔 사이 빼기**의 이야기다. 이 자는 한 판 안에서 갈래마다 시계를 대므로(빼기 0)
//     낮에도 값이 그 판의 정확한 수다. 그리고 **사람당 5.48µs 는 하루 평균**이라 밤만 재면 짝이 안 맞는다.
//   ⇒ 창을 둘 다 돈다: `WINDOW=night`(카드 지정) · `WINDOW=day`(5.48 과 견줄 창).
const WINDOW = (process.env.WINDOW || 'day').trim();
const W_LO = WINDOW === 'day' ? 0.10 : 0.72, W_HI = WINDOW === 'day' ? 0.62 : 0.97;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };


// ── 탐침 — 사본에 박는 글자들 ────────────────────────────────────────────────
const PROBE_HEAD = `
// ── [T370 탐침 · 계측기가 박았다 · 제품엔 없다] ────────────────────────────
const _pwPerf = require('perf_hooks').performance;
const _pwT = () => _pwPerf.now();
const _PW = { n: 0, ask: 0, pop: 0,
  r: [0, 0, 0, 0],            // 첫 참 이유 — 0:!path 1:pathIndex>=len 2:targetKey 3:5초만료
  mask: {},                   // 비트마스크별(겹쳐 참인 꼴을 본다)
  br: [0, 0, 0, 0, 0],        // computeNpcPath 갈래 — 0:d<48 1:도주/비주민배회 2:직선깨끗 3:진짜A* 4:못찾음(쿨다운)
  s1: 0, s2: 0, s10: 0,       // 연속 틱 1 · 2~10 · >10
  dSum: 0, dN: 0, dFar: 0,    // 목표까지 거리
  beh: {},                    // 그때 행동
  atEnd: 0, arrived: 0,       // 경로 끝에서 물었나 · 그 틱에 도착 판정이 났나
  tAll: 0, tClear: 0, tStar: 0, nClear: 0, nStar: 0,   // ★값 — computeNpcPath 전체 · 직선 검사 · 진짜 A*
  arr: 0, unstuck: 0, stuck: 0, follow: 0, skip: 0,   // ★반례 — 도착 · 튀겨냄 · 따라가기 호출
  clockNs: 0,
  every: parseInt(process.env.T370_EVERY || '900', 10),
  cal() { const P = 300000, a = _pwT(); for (let i = 0; i < P; i++) { const x = _pwT(); if (x < 0) console.log(x); } this.clockNs = (_pwT() - a) * 1e6 / P; },
  rep() {
    this.n++;
    if (this.n < this.every) return;
    if (!this.clockNs) this.cal();
    try {
      console.log('[PW] ' + JSON.stringify({ n: this.n, pop: this.pop, phase: +worldPhase(Date.now()).toFixed(4),
        ask: this.ask, r: this.r, mask: this.mask, br: this.br,
        s1: this.s1, s2: this.s2, s10: this.s10,
        dAvg: this.dN ? +(this.dSum / this.dN).toFixed(1) : 0, dFar: this.dFar,
        beh: this.beh, atEnd: this.atEnd, arrived: this.arrived,
        tAll: this.tAll, tClear: this.tClear, tStar: this.tStar, nClear: this.nClear, nStar: this.nStar,
        arr: this.arr, unstuck: this.unstuck, follow: this.follow, skip: this.skip,
        clockNs: +this.clockNs.toFixed(1) }));
    } catch (e) {}
    this.n = 0; this.ask = 0; this.r = [0, 0, 0, 0]; this.mask = {}; this.br = [0, 0, 0, 0, 0];
    this.s1 = this.s2 = this.s10 = 0; this.dSum = this.dN = this.dFar = 0; this.beh = {}; this.atEnd = this.arrived = 0;
    this.tAll = this.tClear = this.tStar = this.nClear = this.nStar = 0;
    this.arr = this.unstuck = this.stuck = this.follow = this.skip = 0;
  },
  tally(npc, a, b, c, d, now) {
    this.ask++;
    const first = a ? 0 : b ? 1 : c ? 2 : 3;
    this.r[first]++;
    const m = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
    this.mask[m] = (this.mask[m] || 0) + 1;
    // 연속 틱 — 지난 틱에도 물었나
    if (npc._pwT === _tick.n - 1) npc._pwS = (npc._pwS || 1) + 1; else npc._pwS = 1;
    npc._pwT = _tick.n;
    if (npc._pwS === 1) this.s1++; else if (npc._pwS <= 10) this.s2++; else this.s10++;
    const dd = Math.hypot((npc.targetX || npc.x) - npc.x, (npc.targetY || npc.y) - npc.y);
    this.dSum += dd; this.dN++; if (dd > 48) this.dFar++;
    const bh = npc.behavior || '?'; this.beh[bh] = (this.beh[bh] || 0) + 1;
    if (b) this.atEnd++;
  } };
`;

const PATCHES = [
  { find: "const _SEED = require('./seed-rand');",
    repl: "const _SEED = require('./seed-rand');\n__PROBE_HEAD__" },
  { find: "}, TICK_MS);",
    repl: "  _PW.pop = npcs.size; _PW.rep();\n}, TICK_MS);" },
  // ★needPath 가 참인 순간을 센다 — 조건 넷은 그 자리의 상태에서 그대로 읽는다(식 무접촉).
  //   ⚠T370 ② 가 `_skip` 을 넣은 **뒤의** 글자에 맞춘다(자는 지금 고치는 그 글자를 재야 한다).
  { find: `  if (needPath && !_skip) {
    const p = computeNpcPath(npc, now);`,
    repl: `  if (_skip) _PW.skip++;
  if (needPath && !_skip) {
    _PW.tally(npc, !npc.path, !!(npc.path && npc.pathIndex >= npc.path.length), npc._pathFor !== targetKey, !!(npc._pathAt && now - npc._pathAt > 5000), now);
    const _pw0 = _pwT(); const p = computeNpcPath(npc, now); _PW.tAll += (_pwT() - _pw0);` },
  // `computeNpcPath` 의 **갈래**를 센다 — 어디서 돌아오나
  { find: "  const arrived = followNpcPath(npc, speedMult);",
    repl: "  const arrived = followNpcPath(npc, speedMult); _PW.follow++; if (arrived) _PW.arr++;" },
  { find: "function unstuckNpc(npc, now) {",
    repl: "function unstuckNpc(npc, now) {\n  _PW.unstuck++;" },
  { find: "  const d = Math.hypot(npc.targetX - npc.x, npc.targetY - npc.y);\n  if (d < 48) return [{ x: npc.targetX, y: npc.targetY }];",
    repl: "  const d = Math.hypot(npc.targetX - npc.x, npc.targetY - npc.y);\n  if (d < 48) { _PW.br[0]++; return [{ x: npc.targetX, y: npc.targetY }]; }" },
  { find: "  if (npc.behavior === 'flee' || (npc.behavior === 'wander' && !isVil)) {\n    return [{ x: npc.targetX, y: npc.targetY }];\n  }",
    repl: "  if (npc.behavior === 'flee' || (npc.behavior === 'wander' && !isVil)) {\n    _PW.br[1]++; return [{ x: npc.targetX, y: npc.targetY }];\n  }" },
  { find: "  if (straightPathClear(npc.x, npc.y, npc.targetX, npc.targetY, npc.floor || 0)) {\n    return [{ x: npc.targetX, y: npc.targetY }];\n  }",
    repl: "  { const _s = _pwT(); const _ok = straightPathClear(npc.x, npc.y, npc.targetX, npc.targetY, npc.floor || 0);\n    _PW.tClear += (_pwT() - _s); _PW.nClear++;\n    if (_ok) { _PW.br[2]++; return [{ x: npc.targetX, y: npc.targetY }]; } }" },
  { find: "  if (npc._lastAStarAt && now - npc._lastAStarAt < 2000) return null;\n  npc._lastAStarAt = now;",
    repl: "  if (npc._lastAStarAt && now - npc._lastAStarAt < 2000) { _PW.br[4]++; return null; }\n  _PW.br[3]++; npc._lastAStarAt = now;\n  const _sStar = _pwT();" },
  { find: "  if (!wp || wp.length < 3 || !isVil) return wp;",
    repl: "  _PW.tStar += (_pwT() - _sStar); _PW.nStar++;\n  if (!wp || wp.length < 3 || !isVil) return wp;" },
];

function makeArm(arm, dir) {
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  execFileSync('git', ['worktree', 'add', '--detach', '-q', dir, 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
  try { fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules')); } catch (e) {}
  // ★워크트리는 **커밋된 HEAD** 를 떠 온다 — 아직 커밋 안 한 수술은 안 따라온다(한 번 그 함정에 빠졌다).
  //   ⇒ 작업트리에서 **바뀐 파일만** 덮어쓴다. 자가 재는 것이 지금 고치고 있는 그 글자여야 한다.
  try {
    const dirty = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: ROOT }).toString().split('\n').filter(Boolean);
    for (const f of dirty) { const src = path.join(ROOT, f), dst = path.join(dir, f);
      if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); } }
    if (dirty.length) console.log(`  [${arm}] 작업트리에서 덮어쓴 파일 ${dirty.length}개: ${dirty.join(' · ')}`);
  } catch (e) {}
  if (arm === 'base' || arm === 'reuse') return 0;   // 탐침 0 인 팔 둘(끔/켬) — 값을 재는 짝
  const zp = path.join(dir, 'server', 'zone.js');
  let s = fs.readFileSync(zp, 'utf8');
  let n = 0;
  for (const p of PATCHES) {
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
  const dir = `/tmp/wt-t370-${arm}`;
  const probes = makeArm(arm, dir);
  const CP = PB + idx * 4, ZP = CP + 1;
  const SECRET = 't370-' + arm;
  const DB = `/tmp/t370-z-${arm}.db`, CDB = `/tmp/t370-c-${arm}.db`;
  rmdb(DB); rmdb(CDB);
  for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, DB + s); } catch (e) {} }
  const logf = fs.openSync(`/tmp/t370-${arm}.log`, 'w');
  const c = spawn(process.execPath, [path.join(dir, 'server/central.js')], { cwd: dir, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(dir, 'server/zone.js')], { cwd: dir, stdio: ['ignore', logf, logf],
    env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP),
      CENTRAL_SECRET: SECRET, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS), DB_PATH: DB, VILLAGE_WAR_LOG: '0',
      T312_FISH_ACT: '1', T370_EVERY: String(SLICE_S * 30),
      T370_PATH_REUSE: (arm === 'reuse' || arm === 'whyReuse') ? '1' : '' }) });   // ★[T370 ②] 손잡이 팔
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
    const mark = fs.statSync(`/tmp/t370-${arm}.log`).size;
    await sleep(SLICE_S * 1000);
    const p = await perf(false), L = await life();
    const t = p && p.tick && p.tick.ms;
    // 그 조각 동안 찍힌 [ANA] 줄들
    const buf = fs.readFileSync(`/tmp/t370-${arm}.log`, 'utf8').slice(mark);
    const ana = buf.split('\n').filter((x) => x.startsWith('[PW] ')).map((x) => { try { return JSON.parse(x.slice(5)); } catch (e) { return null; } }).filter(Boolean);
    let nonSleep = 0;
    for (const v of ((L && L.villages) || [])) for (const [kk, n] of Object.entries(v.acts || {})) if (kk !== '취침') nonSleep += n;
    slices.push({ k, phase: L && L.phase, p50: t && t.p50, p95: t && t.p95, ticks: p.tick.n,
      stepsPerTick: p.walk && p.walk.steps != null ? null : null,
      pop: (L && L.totals && L.totals.pop) || 0, nonSleep, drop: p.tick.dropN, lag: p.tick.lagPct, ana });
    say(`조각 ${k} phase ${L && L.phase != null ? L.phase.toFixed(3) : '?'} · p50 ${t ? t.p50 : '?'}ms · 비취침 ${nonSleep} · PW줄 ${ana.length}`);
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
    const d = '/tmp/wt-t370-dry';
    const n = makeArm(process.env.ARMS || 'probe', d);
    const z = fs.readFileSync(path.join(d, 'server', 'zone.js'), 'utf8');
    console.log('박은 탐침', n, '· _PW 자리', (z.match(/_PW\./g) || []).length);
    console.log('머리 온전:', z.includes('const _PW = { n: 0, ask: 0'), '· 보고줄 온전:', z.includes("console.log('[PW] '"), '· tally:', (z.match(/_PW\.tally\(/g) || []).length);
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
