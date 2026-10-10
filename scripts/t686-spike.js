#!/usr/bin/env node
// === scripts/t686-spike.js — "하루에 몰아서 하는 일" 전수: 틱 시간 분포 · 30ms 넘는 틱의 주인 (T686 · 2026-10-09) ==========
//
// ⚠계측기다(러너 밖 · `@regress` 없음). **제품 무변** — 탐침은 `git worktree` 사본에만 박는다(T646 문법 · 그 판은 지운다).
//
// ★무엇을 재나 — 정본 하루(24분) · 관측자 1 · 게임일 경계 셋(=두 게임일 통째)을 지나는 한 판.
//   ① 틱마다 본문 ms(구간 사슬 — T646 `t646-anatomy` 의 그 앵커에 날 훅을 다섯 갈래 더 끊었다 · 합 = 틱 본문).
//      30ms(한 프레임) 넘는 틱은 **통째로** 남긴다: 구간별 ms · 그 틱에 돈 마을 하루 조각(이름·ms) · 마을 onGameTick 속 갈래 ·
//      마감 중이었나 · 세계 위상 · 경계에서 몇 초.
//   ② 틱 **밖**: `setInterval`/`setTimeout`/`setImmediate` 콜백을 만든 자리(파일:줄)별로 횟수·합·최대·30ms 넘은 횟수
//      (`scripts/t686-timers.js` preload — 존 프로세스에만 싣는다) · 이벤트 루프 지연(`monitorEventLoopDelay`) · GC(`perf_hooks`).
//   ★틀: `t368-farm-day a` t100 팔(200일 × 4초 · 오늘 main) → 정본 하루로 다시 띄운다(T646 · T678 과 같은 틀) · T455 고정 원점.
//
// 실행: node scripts/t686-spike.js run <tag> [--ref <커밋>]      (T686_DIR=/tmp/t686 · T686_TPL=<DIR>/tpl-t100.db · T686_LEAD_S=240 · T686_BOUNDS=3)
//       node scripts/t686-spike.js table <tag>
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const DIR = process.env.T686_DIR || '/tmp/t686';
const TPL = process.env.T686_TPL || path.join(DIR, 'tpl-t100.db');
const LEAD_S = parseInt(process.env.T686_LEAD_S || '240', 10);
const BOUNDS = parseInt(process.env.T686_BOUNDS || '3', 10);
const DAY = 1440000;
const SPIKE = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
fs.mkdirSync(DIR, { recursive: true });

// ── 탐침(zone.js) ─────────────────────────────────────────────────────────────
//   [앵커, 그 앞 구간 이름] — 앵커 **앞**에 표식 = 앞 구간이 끝난다. 머리 표식은 `_tickHr0` 바로 뒤.
const SEGS = [
  ['  Bandits.onGameTick(now);', 'econ(마을 onGameTick)'],
  ['  if (T678_ON || T678_VERIFY) _t678Tick();', '도적 onGameTick'],
  ['  Roads.onGameTick(now);', 'T678 문 표'],
  ['  if (_t566RelPend.length) _t566FlushRel();', '길 onGameTick'],
  ['  Soil.onGameTick(now);', '풀린 길 대기'],
  ['  _fruitSeasonSweep();', '흙 onGameTick'],
  ['  // ★[T487] 적설 결산', '열매 철'],
  ['  // === 14.49-e3-perf5: idle zone skip ===', '눈'],
  ['  // === 활성 청크 갱신 (player·observer 위치 기반) ===', 'idle 문'],
  ['  // === Spatial index 재구축 — 모든 nearest-search가 이걸 씀 ===', '청크'],
  ['  // === NPC 행동 결정 (사람 player는 input으로 vx/vy 받지만 NPC는 직접 결정) ===', '공간 색인·입력 시한'],
  ['  stepArrows(dt);', '결정 문(순회)'],
  ['  // === 입력 큐 구동 — 사람: 입력 1개=1스텝(밀린 만큼 따라잡기), NPC: 틱당 1스텝 ===', '화살·걸음 커널 준비'],
  ['  // === Phase 14.49-e: PZ식 다단 계단 — 3 cell 점유 + step별 z + walk-off로 floor 전환 ===', '이동 문(순회)'],
  ['  // === Mob AI ===', '계단·낙하·게이지·HP'],
  ['  // === AOI 필터링: per-viewer tick ===', '몹 AI'],
  ['  _fishPoll(now);', '델타·방송(AOI)'],
  ['  { const _t0 = Date.now(); _periodicSave(now);', '어로'],
  ['  tickDowned(now);', '사람 저장(1명/틱)'],
  ['  { const _h = process.hrtime(_tickHr0); _tickMs.ring[', '꼬리(쓰러짐·계측)'],
];
const HEAD_ANCHOR = '  const _tickHr0 = process.hrtime();';
// ── 탐침(villages.js) — onGameTick 속 갈래 · 하루 조각마다 ms · 마감 꼬리 ─────────────────────
const VSEGS = [
  ['  // ★[곳간② 클라 표시]', 'v:몸(캐러밴·떠나는 몸·전투)'],
  ['  // ★[T42 ①ⓑ] 교역로 선계산', 'v:곳간·장마당 방송'],
  ['  // ★자정 스파이크 분산', 'v:교역로 선계산·다시 파기'],
  ['  // ★★[2026-08-26 재민 확정 · 테스트 전용] **게임일 정지.**', 'v:마을 저장(1곳/틱)'],
];
const ZTAIL = `
// ── [T686 탐침 · 계측기가 박았다 · 제품엔 없다] ──────────────────────────────
;(function () {
  const OUT = process.env.T686_OUT; if (!OUT) return;
  const fs = require('fs'), pf = require('perf_hooks').performance, now = () => pf.now();
  const SPIKE = ${SPIKE};
  let t0 = 0, prev = 0, cur = null, vPrev = 0;
  const H = new Uint32Array(1001);   // 0.1ms 칸 · 100ms 넘으면 끝 칸
  let W = null;
  const resetW = () => { W = { t: Date.now(), ticks: 0, tot: 0, max: 0, over30: 0, over16: 0, seg: {}, segMax: {}, jobs: {}, jobMax: {}, spikes: [] }; };
  resetW();
  let all = { ticks: 0, tot: 0, over30: 0, over16: 0, max: 0 };
  const dayInfo = () => { let ph = null, gd = null, ed = null; try { ph = +worldPhase(Date.now()).toFixed(4); } catch (e) {} try { gd = zoneGameDay(); } catch (e) {} try { ed = gameDayNow(); } catch (e) {} return { ph, gd, ed }; };
  globalThis.__T686S = () => { t0 = prev = now(); cur = { seg: {}, v: {}, jobs: [], close: false }; };
  globalThis.__T686M = (k) => { const t = now(); if (cur) cur.seg[k] = (cur.seg[k] || 0) + (t - prev); prev = t; };
  globalThis.__T686VS = (inClose) => { vPrev = now(); if (cur) cur.close = cur.close || !!inClose; };
  globalThis.__T686VM = (k) => { const t = now(); if (cur) cur.v[k] = (cur.v[k] || 0) + (t - vPrev); vPrev = t; };
  globalThis.__T686J = (k, ms) => { if (cur) cur.jobs.push([k, ms]); W.jobs[k] = (W.jobs[k] || 0) + ms; if (ms > (W.jobMax[k] || 0)) W.jobMax[k] = ms; };
  globalThis.__T686E = () => {
    const tot = now() - t0; if (!cur) return;
    H[Math.min(1000, Math.floor(tot * 10))]++;
    W.ticks++; W.tot += tot; if (tot > W.max) W.max = tot; if (tot > SPIKE) W.over30++; if (tot > 16) W.over16++;
    all.ticks++; all.tot += tot; if (tot > SPIKE) all.over30++; if (tot > 16) all.over16++; if (tot > all.max) all.max = tot;
    for (const k in cur.seg) { W.seg[k] = (W.seg[k] || 0) + cur.seg[k]; if (cur.seg[k] > (W.segMax[k] || 0)) W.segMax[k] = cur.seg[k]; }
    if (tot > SPIKE) {
      const r = (o) => { const x = {}; for (const k in o) if (o[k] >= 0.05) x[k] = +o[k].toFixed(2); return x; };
      const J = {}; for (const [k, ms] of cur.jobs) J[k] = +(((J[k] || 0) + ms)).toFixed(2);
      W.spikes.push(Object.assign({ at: Date.now(), p0: +(t0).toFixed(1), ms: +tot.toFixed(2), close: cur.close, nJobs: cur.jobs.length, pop: npcs.size }, dayInfo(), { seg: r(cur.seg), v: r(cur.v), jobs: J }));
    }
    cur = null;
  };
  const flush = (fin) => {
    try { const row = Object.assign({ kind: fin ? 'fin' : 'win', pop: npcs.size }, dayInfo(), W, { seg: W.seg, all });
      if (fin) row.hist = Array.from(H);
      fs.appendFileSync(OUT, JSON.stringify(row) + '\\n'); } catch (e) { try { fs.appendFileSync(OUT, JSON.stringify({ err: String(e && e.stack) }) + '\\n'); } catch (e2) {} }
    resetW();
  };
  setInterval(() => flush(false), 60000).unref();
  process.on('SIGUSR2', () => flush(true));
  process.on('SIGHUP', () => { H.fill(0); all = { ticks: 0, tot: 0, over30: 0, over16: 0, max: 0 }; resetW(); fs.appendFileSync(OUT, JSON.stringify({ kind: 'reset', at: Date.now() }) + '\\n'); });   // 부팅 몫을 뺀다(관측자가 붙은 뒤부터)
})();
`;
function makeTree(dir, ref) {
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  execFileSync('git', ['worktree', 'add', '--detach', '-q', dir, ref || 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
  try { fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules')); } catch (e) {}
  const cnt = (s, a) => s.split(a).length - 1;
  { const zp = path.join(dir, 'server', 'zone.js'); let s = fs.readFileSync(zp, 'utf8');
    if (cnt(s, HEAD_ANCHOR) !== 1) throw new Error('머리 앵커 ' + cnt(s, HEAD_ANCHOR));
    s = s.replace(HEAD_ANCHOR, () => HEAD_ANCHOR + '\n  globalThis.__T686S && __T686S();');
    for (const [a, name] of SEGS) {
      if (cnt(s, a) !== 1) throw new Error(`구간 앵커 ${cnt(s, a)}개: ${a.slice(0, 50)}`);
      const end = a.startsWith('  { const _h = process.hrtime(_tickHr0)');
      s = s.replace(a, () => `  globalThis.__T686M && __T686M(${JSON.stringify(name)});${end ? ' globalThis.__T686E && __T686E();' : ''}\n` + a);
    }
    s += ZTAIL; fs.writeFileSync(zp, s); execFileSync(process.execPath, ['--check', zp]); }
  { const vp = path.join(dir, 'server', 'villages.js'); let s = fs.readFileSync(vp, 'utf8');
    const rep = (a, b) => { if (cnt(s, a) !== 1) throw new Error(`마을 앵커 ${cnt(s, a)}개: ${a.slice(0, 50)}`); s = s.replace(a, () => b); };
    rep('  if (!state.ready) return; // 플래그 off', '  if (!state.ready) return; globalThis.__T686VS && __T686VS(!!state.tickJobs); // 플래그 off');
    for (const [a, name] of VSEGS) rep(a, `  globalThis.__T686VM && __T686VM(${JSON.stringify(name)});\n` + a);
    rep('  if (state.tickJobs) { _drainTickJobs(now); return; }', "  globalThis.__T686VM && __T686VM('v:날 문 앞(얼림 검사)');\n  if (state.tickJobs) { _drainTickJobs(now); globalThis.__T686VM && __T686VM('v:하루 조각(이어서)'); return; }");
    rep('  _openDayJobs(now);\n  _drainTickJobs(now);\n}', "  _openDayJobs(now); globalThis.__T686VM && __T686VM('v:하루 열기(_openDayJobs)');\n  _drainTickJobs(now); globalThis.__T686VM && __T686VM('v:하루 조각(첫 프레임)');\n}");
    rep('      const rv = j.f();', "      const _t686a = process.hrtime.bigint(); const rv = j.f(); globalThis.__T686J && __T686J(j.s || j.n, Number(process.hrtime.bigint() - _t686a) / 1e6);");
    rep('  try { _closeDay(C); }', "  { const _t686c = process.hrtime.bigint(); try { _closeDay(C); } catch (e) { console.error(`[${state.zoneId}] 🏘️ 일틱 마감 로그 실패:`, e.message); } globalThis.__T686J && __T686J('(마감 꼬리 _closeDay)', Number(process.hrtime.bigint() - _t686c) / 1e6); }\n  if (0) try { _closeDay(C); }");
    fs.writeFileSync(vp, s); execFileSync(process.execPath, ['--check', vp]); }
}

async function run(tag) {
  const out = path.join(DIR, `${tag}.jsonl`), tout = path.join(DIR, `${tag}.timers.json`);
  rmdb(out); try { fs.unlinkSync(out); } catch (e) {}
  const dir = `/tmp/wt-t686-${tag}`;
  const _ri = process.argv.indexOf('--ref'), REF = _ri >= 0 ? process.argv[_ri + 1] : 'HEAD';
  makeTree(dir, REF);
  const CP = +(process.env.T686_PORT || 4110), ZP = CP + 1, SECRET = 't686';
  const DB = `/tmp/t686-z-${tag}.db`, CDB = `/tmp/t686-c-${tag}.db`;
  rmdb(DB); rmdb(CDB);
  for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, DB + s); } catch (e) {} }
  const at = (Math.floor(fs.statSync(TPL).mtimeMs / DAY) + 2) * DAY - LEAD_S * 1000;   // T455 고정 원점(하루 경계 LEAD 초 앞)
  const logp = path.join(DIR, `${tag}.log`), logf = fs.openSync(logp, 'w');
  const clk = `--require ${path.join(__dirname, 't455-clock.js')}`;
  const env0 = Object.assign({}, process.env, { T455_CLOCK_PRE: '1', T455_CLOCK_AT: String(at) });
  const c = spawn(process.execPath, [path.join(dir, 'server/central.js')], { cwd: dir, stdio: 'ignore',
    env: Object.assign({}, env0, { NODE_OPTIONS: clk, PORT: String(CP), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(dir, 'server/zone.js')], { cwd: dir, stdio: ['ignore', logf, logf],
    env: Object.assign({}, env0, { NODE_OPTIONS: `${clk} --require ${path.join(__dirname, 't686-timers.js')}`, T686_TIMERS_OUT: tout, T686_OUT: out,
      PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY), DB_PATH: DB, VILLAGE_WAR_LOG: '0', T312_FISH_ACT: '1' }) });
  const kill = () => { for (const p of [z, c]) { try { p.kill('SIGKILL'); } catch (e) {} } };
  process.on('exit', kill);
  const getj = async (p) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, { headers: { 'x-zone-secret': SECRET }, signal: AbortSignal.timeout(20000) }); return await r.json(); } catch (e) { return null; } };
  const say = (...a) => console.log(`[${tag}]`, ...a);
  const t0 = Date.now();
  for (let i = 0; i < 1200; i++) { try { const r = await fetch(`http://localhost:${ZP}/health`, { signal: AbortSignal.timeout(3000) }); if (r.ok) break; } catch (e) {} await sleep(1000); }
  say('기동', ((Date.now() - t0) / 1000).toFixed(0), '초');
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
  const ping = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);
  await sleep(10000); try { z.kill('SIGHUP'); } catch (e) {}   // 관측자가 붙고 10초 — 여기부터 센다(부팅·첫 따라잡기 틱 뺌)
  //   경계: 가짜 시계 기준 — 원점 at 이 프로세스 시작 순간이다(t455-clock). 경계 k = at + LEAD + (k-1)·DAY.
  const bootMs = Date.now() - t0;
  const endWall = t0 + LEAD_S * 1000 + (BOUNDS - 1) * DAY + 90000;
  say(`경계 ${BOUNDS}개 — 첫 경계 ${LEAD_S}초 · 끝 ${((endWall - t0) / 60000).toFixed(1)}분(벽) · 부팅 ${(bootMs / 1000).toFixed(0)}초`);
  let k = 0;
  while (Date.now() < endWall) {
    await sleep(60000);
    const p = await getj('/perf');
    k++; say(`${k}분 · 틱 p95 ${p && p.tick && p.tick.ms ? p.tick.ms.p95 : '?'} · econ day ${p && p.econTick && p.econTick.last ? p.econTick.last.day : '?'}`);
  }
  clearInterval(ping);
  try { z.kill('SIGUSR2'); } catch (e) {}
  await sleep(3000);
  try { process.kill(z.pid, 'SIGUSR1'); } catch (e) {}
  await sleep(2000);
  kill();
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  rmdb(DB); rmdb(CDB);
  say('끝', out);
}

function table(tag) {
  //   관측자가 붙은 뒤(reset 줄 뒤)만 센다 · GC(타이머 preload 의 시작 시각)가 틱 안에 들었으면 그 몫을 견준다
  const L = fs.readFileSync(path.join(DIR, `${tag}.jsonl`), 'utf8').trim().split('\n').map((x) => JSON.parse(x));
  let T = { gcBig: [], sites: [], loop: null, gc: null }; try { T = JSON.parse(fs.readFileSync(path.join(DIR, `${tag}.timers.json`), 'utf8')); } catch (e) {}
  const W = L.slice(L.findIndex((x) => x.kind === 'reset') + 1);
  const fin = W.find((x) => x.kind === 'fin') || {};
  const H = fin.hist || []; let n = 0; for (const v of H) n += v;
  const q = (p) => { let c = 0; for (let i = 0; i < H.length; i++) { c += H[i]; if (c >= n * p) return i / 10; } return null; };
  const spikes = W.flatMap((x) => x.spikes || []);
  const owner = (s) => {
    const g = T.gcBig.filter((x) => x[3] >= s.p0 - 2 && x[3] <= s.p0 + s.ms + 2).reduce((a, x) => a + x[2], 0); s.gc = +g.toFixed(1);
    const segs = Object.entries(s.seg).sort((a, b) => b[1] - a[1]); const [top, topv] = segs[0] || ['?', 0];
    if (g > topv * 0.6) return 'GC';
    if (top.startsWith('econ')) { const v = Object.entries(s.v || {}).sort((a, b) => b[1] - a[1])[0]; const j = Object.entries(s.jobs || {}).sort((a, b) => b[1] - a[1])[0];
      return (v && /하루/.test(v[0]) && j) ? `마을 하루 조각 · ${j[0]}` : `econ · ${v ? v[0] : '?'}`; }
    return top; };
  const by = {}; for (const s of spikes) { const o = owner(s); const B = by[o] || (by[o] = { n: 0, max: 0, close: 0 }); B.n++; if (s.ms > B.max) B.max = +s.ms.toFixed(1); if (s.close) B.close++; }
  const sum = (key, mx) => { const t = {}, m = {}; for (const x of W) { for (const k in x[key] || {}) t[k] = (t[k] || 0) + x[key][k]; for (const k in x[mx] || {}) m[k] = Math.max(m[k] || 0, x[mx][k]); } return [t, m]; };
  const [jobs, jobMax] = sum('jobs', 'jobMax'), [seg, segMax] = sum('seg', 'segMax');
  const res = { ticks: n, p50: q(0.5), p90: q(0.9), p99: q(0.99), p999: q(0.999), max: fin.all && +fin.all.max.toFixed(1), over30: fin.all && fin.all.over30, over16: fin.all && fin.all.over16,
    nearBoundary: spikes.filter((s) => s.ph != null && s.ph < 0.01).length,
    owners: Object.entries(by).sort((a, b) => b[1].n - a[1].n),
    spikes: spikes.map((s) => ({ ms: s.ms, ph: s.ph, close: s.close, gc: s.gc, owner: owner(s) })),
    segUsPerTick: Object.entries(seg).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / n * 1000).toFixed(1), +(segMax[k] || 0).toFixed(1)]),
    jobsMsMax: Object.entries(jobs).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +v.toFixed(1), +(jobMax[k] || 0).toFixed(1)]),
    loop: T.loop, gc: T.gc, timers: T.sites.slice(0, 20).map((x) => [x.k, x.n, x.tot, x.max, x.o30]) };
  console.log(JSON.stringify(res, null, 1));
  return res;
}

const [cmd, tag] = process.argv.slice(2);
if (cmd === 'run') run(tag || 'main').catch((e) => { console.error(e); process.exit(1); });
else if (cmd === 'table') table(tag || 'main');
else if (cmd === 'tree') { makeTree(`/tmp/wt-t686-${tag || 'chk'}`, 'HEAD'); console.log('사본 탐침 OK'); }
else console.log('node scripts/t686-spike.js run|table <tag>');
