#!/usr/bin/env node
// === scripts/t672-walk-anatomy.js — 걸음 몫 해부(화살·걸음 커널 준비 · 이동 문) · 깎기 켬/끔 (T672 · 2026-10-06) ==========
//
// ⚠계측기다(러너 밖 · `@regress` 없음). **제품 무변** — 탐침은 `git worktree` 사본에만 박는다(T646 문법 · 그 판은 지운다).
//   틀·시계·창은 `t646-anatomy.js` 그대로다(T455 고정 원점 · 관측자 1 · 낮 창 phase 0.10~ · 밤 창 0.72~ · 30초 × 6조각).
//
// ★팔 셋:
//   시계(`--probe 1`, 기본) — T646 의 두 구간(화살·걸음 커널 준비 · 이동 문)을 더 잘게 자른다(구간 사슬 — 합 = 두 구간):
//     화살(`stepArrows`) · 유령 정리 · 이동 함수 클로저 · `_wwPre` · 이동 문 순회 · 견줌·서로 비키기(`sepNpcs`)
//     `_wwPre` 안: 몸 고르기 순회 · 계수 · `ensure` · 몸 → 열 복사 · 충돌체 채우기 · 색인 짓기(`ww_trees`) · 커널(`ww_step`) · 관측 계수
//     이동 문 안: `_wwPost`(부를 때마다) · JS 정본 걸음(`movePlayerStep` — 위층·계단·사람) — 나머지 = 순회 껍데기
//     셈(시계 밖 — 표식 사이에서 시계를 멈추고 센다): 갈래별 몸 수 · 커널 몸 중 속도 0 · 그중 깎기 거름(`_wwIsStill`)을 지나는 몸 ·
//       자원 목록 길이 · 충돌체 수 · 목록 재구축(새 배열) 틱 · 화살 · 유령
//   탐침 없음(`--probe 0`) — 틱 꼬리에 틱 시간 합 하나만(평균 = 합 ÷ 틱 · 분모 `npcs.size`) — 깎기 켬/끔 짝의 본값
//   손잡이: `--cut 0|1` = `T672_WALK_CUT`
//
// 실행: node scripts/t672-walk-anatomy.js run <tag> [--probe 0|1] [--cut 0|1]
//       node scripts/t672-walk-anatomy.js table
//   T672_DIR=/tmp/t672a · T672_TPL=/tmp/t646/tpl/tpl-t100.db · T672_SLICE_S=30 · T672_SLICES=6 · T672_LEAD_S=150
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const DIR = process.env.T672_DIR || '/tmp/t672a';
const TPL = process.env.T672_TPL || '/tmp/t646/tpl/tpl-t100.db';
const SLICE_S = parseInt(process.env.T672_SLICE_S || '30', 10), SLICES = parseInt(process.env.T672_SLICES || '6', 10);
const LEAD_S = parseInt(process.env.T672_LEAD_S || '150', 10);
const DAY = 1440000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
fs.mkdirSync(DIR, { recursive: true });

// ── 탐침 ─────────────────────────────────────────────────────────────────────
const HEAD = '  const _tickHr0 = process.hrtime();';
const TAILA = '  { const _h = process.hrtime(_tickHr0); _tickMs.ring[';
// 구간 사슬(시계 팔) — [앵커, 앵커 **앞**에 끝나는 구간 이름, 뒤에 박나]
const SEGS = [
  ['  stepArrows(dt);\n', '앞(틱 머리~결정 문)', false],
  ['  stepArrows(dt);\n', '화살', true],
  ['  // 이동 1스텝 — 입력 1개 = 1스텝 (클라 predictStep과 1:1 일치). 호출측이 handingOff/dormant 판정.\n', '유령 정리', false],
  ['  // ★[T461] 걸음 커널(켬·견줌일 때만) — 이동 문 앞에서 한 번에\n', '이동 함수 클로저', false],
  ['  const _wwSteps0 = _walk.steps;', '_wwPre', false],
  ['  if (_wwVerify && _WW) _wwCheck(', '이동 문 순회', false],
  ['  // === Phase 14.49-e: PZ식 다단 계단', '견줌·서로 비키기', false],
];
const WSEGS = [   // `_wwPre` 안 — [앵커, 앞 구간]
  ['  const n = _wwList.length, S = cut ? _wwStill.length : 0;', '몸 고르기 순회'],
  ['  const res = qtResources ? (_wwRes || _wwNoRes) : _wwNoRes;', '계수'],
  ['  const X = _WW.X, Y = _WW.Y, VX = _WW.VX, VY = _WW.VY, RD = _WW.RD;', 'ensure'],
  ['  const RX = _WW.RX, RY = _WW.RY, RR = _WW.RR;\n', '몸 → 열 복사'],
  ['    _WW.trees(k);\n', '충돌체 채우기'],
  ['  _WW.step(n, moveDt);\n', '색인 짓기(ww_trees · 깎기 켬이면 열쇠 비교)'],
  ['  if (_wwOn) {\n    const C = _WW.CNT;', '커널(ww_step)'],
  ['  return n;\n}\n// 이동 문 **안**', '관측 계수'],
];
const TAIL = `
// ── [T672 탐침 · 계측기가 박았다 · 제품엔 없다] ──────────────────────────────
var _P7;
const _P7pf = require('perf_hooks').performance; const _p7t = () => _P7pf.now();
const _P7EVERY = parseInt(process.env.T672_EVERY || '900', 10);
function _P7reset() { _P7 = { n: 0, tot: 0, popN: 0, seg: {}, wseg: {}, sub: {}, subN: {}, cnt: { seq: 0, c0: 0, c1: 0, c2: 0, c3: 0, still: 0, stillOk: 0, res: 0, k: 0, resNew: 0, gen: 0, arrows: 0, ghostP: 0, ghostB: 0, pl: 0, dirty: 0 }, cal: 0 }; }
_P7reset();
let _P7prev = 0, _P7w = 0, _P7lastRes = null, _P7lastGen = -1;
function _P7m(k) { const t = _p7t(); _P7.seg[k] = (_P7.seg[k] || 0) + (t - _P7prev); _P7prev = t; }
function _P7wm(k) { const t = _p7t(); _P7.wseg[k] = (_P7.wseg[k] || 0) + (t - _P7w); _P7w = t; }
function _P7sub(k, ms) { _P7.sub[k] = (_P7.sub[k] || 0) + ms; _P7.subN[k] = (_P7.subN[k] || 0) + 1; }
function _P7count() {   // 시계 밖 — 앞문이 적은 갈래 · 커널 몸의 속도 0 · 깎기 거름
  const C = _P7.cnt; C.seq += _wwSeq.length; C.pl += players.size;
  for (let i = 0; i < _wwCode.length; i++) { const c = _wwCode[i]; C['c' + c]++;
    if (c === 1 || c === 3) { const p = _wwSeq[i]; if (p.vx === 0 && p.vy === 0) { C.still++; if (_WW && _wwIsStill(p)) C.stillOk++; } } }
  const res = _wwRes || []; C.res += res.length; C.k += _wwTC.k;
  if (res !== _P7lastRes) { C.resNew++; _P7lastRes = res; } if (_wwResGen !== _P7lastGen) { C.gen++; _P7lastGen = _wwResGen; }
  if (resourcesDirty) C.dirty++;
  C.arrows += arrows.size; C.ghostP += ghostPlayers.size; C.ghostB += ghostBuildings.size;
}
function _P7end(ms) {
  _P7.tot += ms; _P7.n++; _P7.popN += npcs.size;
  if (_P7.n >= _P7EVERY) {
    { const s = _p7t(); for (let i = 0; i < 1000; i++) { const a = _p7t(); _P7.cal += _p7t() - a; } _P7.cal /= 1000; }   // 시계 한 쌍 값(ms)
    try { console.log('[T672] ' + JSON.stringify(Object.assign({ phase: +worldPhase(Date.now()).toFixed(4), cut: T672_WALK_CUT, probe: ${'${PROBE}'} }, _P7))); } catch (e) {}
    _P7reset();
  }
}
`;

function makeTree(dir, probe) {
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  execFileSync('git', ['worktree', 'add', '--detach', '-q', dir, 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
  try { fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules')); } catch (e) {}
  const zp = path.join(dir, 'server', 'zone.js');
  let s = fs.readFileSync(zp, 'utf8');
  const cnt = (a) => s.split(a).length - 1;
  const need1 = (a, what) => { if (cnt(a) !== 1) throw new Error(`${what} 앵커 ${cnt(a)}개: ${a.slice(0, 60)}`); };
  need1(HEAD, '머리'); need1(TAILA, '꼬리');
  // 꼬리 — 두 팔 다: 틱 시간(제품이 이미 잰 `_h` 그대로)을 합에 더한다
  s = s.replace(TAILA, () => '  { const _h7 = process.hrtime(_tickHr0); _P7end(_h7[0] * 1e3 + _h7[1] / 1e6); }\n' + TAILA);
  if (probe) {
    s = s.replace(HEAD, () => HEAD + '\n  _P7prev = _p7t();');
    for (const [a, name, after] of SEGS) {
      if (a === '  stepArrows(dt);\n') {
        if (!after) { need1(a, '화살'); s = s.replace(a, () => `  _P7m(${JSON.stringify(name)});\n` + a + `  _P7m("화살");\n`); }
        continue;
      }
      need1(a, name);
      s = s.replace(a, () => `  _P7m(${JSON.stringify(name)});${name === '_wwPre' ? ' _P7count(); _P7prev = _p7t();' : ''}\n` + a);
    }
    // `_wwPre` 안
    { const a = 'function _wwPre(moveDt) {\n'; need1(a, '_wwPre 머리'); s = s.replace(a, () => a + '  _P7w = _p7t();\n'); }
    for (const [a, name] of WSEGS) { need1(a, name); s = s.replace(a, () => `  _P7wm(${JSON.stringify(name)});\n` + a); }
    // 이동 문 안 — `_wwPost` · 서 있는 몸 뒷일 · JS 정본 걸음
    { const a = '        if (_c === 1) { _wwPost(p, _wwK++); continue; }\n'; need1(a, '_wwPost');
      s = s.replace(a, () => "        if (_c === 1) { const _s7 = _p7t(); _wwPost(p, _wwK++); _P7sub('post', _p7t() - _s7); continue; }\n"); }
    { const a = '        if (_c === 3) { _wwStillPost(p); continue; }'; need1(a, '서 있는 몸');
      s = s.replace(a, () => "        if (_c === 3) { const _s7 = _p7t(); _wwStillPost(p); _P7sub('stillPost', _p7t() - _s7); continue; }"); }
    { const a = '      movePlayerStep(p);\n    } else {'; need1(a, 'JS 걸음');
      s = s.replace(a, () => "      { const _s7 = _p7t(); movePlayerStep(p); _P7sub('jsStep', _p7t() - _s7); }\n    } else {"); }
    if (process.env.T674_POSTSPLIT === '1') {   // ★[T674] `_wwPost` 안 답압 스탬프만 따로(부를 때마다 시계 한 쌍 더 — 쓰기 몫 = post − stamp − 쌍)
      const a = '  else if (st === 2) Roads.stampEntityPx(p, p.x, p.y);\n'; need1(a, '_wwPost 스탬프');
      s = s.replace(a, () => "  else if (st === 2) { const _s8 = _p7t(); Roads.stampEntityPx(p, p.x, p.y); _P7sub('stamp', _p7t() - _s8); }\n");
    }
    { const a = '  sepNpcs(dt);'; need1(a, 'sepNpcs');
      s = s.replace(a, () => "  { const _s7 = _p7t(); sepNpcs(dt); _P7sub('sep', _p7t() - _s7); }"); }
  }
  s += TAIL.replace('${PROBE}', probe ? '1' : '0');
  fs.writeFileSync(zp, s);
  execFileSync(process.execPath, ['--check', zp]);
  return probe ? SEGS.length + WSEGS.length : 0;
}

async function run(tag, probe, cut) {
  const out = path.join(DIR, `${tag}.json`);
  if (fs.existsSync(out)) { console.log('있음', out); return; }
  const dir = `/tmp/wt-t672-${tag}`;
  const n = makeTree(dir, probe);
  const CP = 4030, ZP = 4031, SECRET = 't672';
  const DB = `/tmp/t672-z-${tag}.db`, CDB = `/tmp/t672-c-${tag}.db`;
  rmdb(DB); rmdb(CDB);
  for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, DB + s); } catch (e) {} }
  const at = (Math.floor(fs.statSync(TPL).mtimeMs / DAY) + 2) * DAY - LEAD_S * 1000;   // T455 고정 원점(하루 경계 LEAD 초 앞)
  const logp = path.join(DIR, `${tag}.log`), logf = fs.openSync(logp, 'w');
  const env0 = Object.assign({}, process.env, { NODE_OPTIONS: `--require ${path.join(__dirname, 't455-clock.js')}`, T455_CLOCK_PRE: '1', T455_CLOCK_AT: String(at) });
  const c = spawn(process.execPath, [path.join(dir, 'server/central.js')], { cwd: dir, stdio: 'ignore',
    env: Object.assign({}, env0, { PORT: String(CP), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(dir, 'server/zone.js')], { cwd: dir, stdio: ['ignore', logf, logf],
    env: Object.assign({}, env0, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP),
      CENTRAL_SECRET: SECRET, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY), DB_PATH: DB, VILLAGE_WAR_LOG: '0', T312_FISH_ACT: '1',
      T672_WALK_CUT: cut ? '1' : '0', T672_EVERY: String(SLICE_S * 30) }) });
  const getj = async (p) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, { headers: { 'x-zone-secret': SECRET }, signal: AbortSignal.timeout(20000) }); return await r.json(); } catch (e) { return null; } };
  const say = (...a) => console.log(`[${tag}]`, ...a);
  const t0 = Date.now();
  for (let i = 0; i < 900; i++) { try { const r = await fetch(`http://localhost:${ZP}/health`, { signal: AbortSignal.timeout(3000) }); if (r.ok) break; } catch (e) {} await sleep(1000); }
  say('기동', Date.now() - t0, 'ms · 탐침 구간', n, '· 깎기', cut ? '켬' : '끔');
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
  const ping = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);
  const phaseNow = async () => { const L = await getj('/lifedbg'); return L && L.phase; };
  const windows = [];
  const QUICK = parseInt(process.env.T672_QUICK || '0', 10);   // 빠른 판 — 창을 안 기다리고 기동 직후(원점 = 하루 경계 LEAD 초 앞 · 밤 끝) 조각 QUICK 개
  for (const [W, lo, hi] of (QUICK ? [['quick', 0, 1]] : [['day', 0.10, 0.62], ['night', 0.72, 0.97]])) {
    let ph = null;
    for (let i = 0; i < 1000 && !QUICK; i++) { ph = await phaseNow(); if (ph != null && ph >= lo && ph <= hi - (SLICES * SLICE_S) / (DAY / 1000)) break; await sleep(5000); }
    say(W, '창 · phase', ph);
    const slices = [];
    for (let k = 0; k < (QUICK || SLICES); k++) {
      await getj('/perf?reset=1');
      const mark = fs.statSync(logp).size;
      await sleep(SLICE_S * 1000);
      const p = await getj('/perf');
      const buf = fs.readFileSync(logp).subarray(mark).toString('utf8');
      const ana = buf.split('\n').filter((x) => x.startsWith('[T672] ')).map((x) => { try { return JSON.parse(x.slice(7)); } catch (e) { return null; } }).filter(Boolean);
      const t = p && p.tick && p.tick.ms;
      slices.push({ k, p50: t && t.p50, p95: t && t.p95, ticks: p && p.tick && p.tick.n, walk: p && p.walk, ana });
      say(`${W} 조각 ${k} · p50 ${t ? t.p50 : '?'} · p95 ${t ? t.p95 : '?'} · 줄 ${ana.length}`);
    }
    windows.push({ W, slices });
  }
  clearInterval(ping); try { ws.close(); } catch (e) {}
  try { z.kill('SIGKILL'); } catch (e) {} try { c.kill('SIGKILL'); } catch (e) {}
  await sleep(1500); rmdb(DB); rmdb(CDB);
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  fs.writeFileSync(out, JSON.stringify({ tag, probe, cut, at: new Date().toISOString(), wallS: Math.round((Date.now() - t0) / 1000), windows }));
  say('끝', Math.round((Date.now() - t0) / 1000), 's');
}

// ── 표 ──────────────────────────────────────────────────────────────────────
function table() {
  const files = fs.readdirSync(DIR).filter((f) => /\.json$/.test(f) && f !== 'table.json').map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))).filter((j) => j.windows);
  const out = { runs: [] };
  for (const j of files) for (const w of j.windows) {
    const A = { n: 0, tot: 0, popN: 0, seg: {}, wseg: {}, sub: {}, subN: {}, cnt: {}, cal: [] };
    for (const sl of w.slices) for (const x of sl.ana) {
      A.n += x.n; A.tot += x.tot; A.popN += x.popN; if (x.cal) A.cal.push(x.cal);
      for (const g of ['seg', 'wseg', 'sub', 'subN', 'cnt']) for (const [k, v] of Object.entries(x[g] || {})) A[g][k] = (A[g][k] || 0) + v;
    }
    if (!A.n) continue;
    const pop = A.popN / A.n, us = (ms) => +(ms / A.n * 1000 / pop).toFixed(3), per = (v) => +(v / A.n).toFixed(1);
    out.runs.push({ tag: j.tag, probe: j.probe, cut: j.cut, W: w.W, pop: Math.round(pop), ticks: A.n, tickMeanMs: +(A.tot / A.n).toFixed(3), totUs: us(A.tot),
      tickP50: w.slices.map((s) => s.p50), segUs: Object.fromEntries(Object.entries(A.seg).map(([k, v]) => [k, us(v)])),
      wsegUs: Object.fromEntries(Object.entries(A.wseg).map(([k, v]) => [k, us(v)])), subUs: Object.fromEntries(Object.entries(A.sub).map(([k, v]) => [k, us(v)])),
      subN: Object.fromEntries(Object.entries(A.subN).map(([k, v]) => [k, per(v)])), cntPerTick: Object.fromEntries(Object.entries(A.cnt).map(([k, v]) => [k, per(v)])),
      clockPairUs: A.cal.length ? +(A.cal.reduce((a, b) => a + b, 0) / A.cal.length * 1000).toFixed(4) : null,
      ww: (w.slices[w.slices.length - 1].walk || {}).ww || null });
  }
  fs.writeFileSync(path.join(DIR, 'table.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}

const [cmd, a1] = process.argv.slice(2);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1] !== '0'; };
if (cmd === 'run') run(a1, arg('--probe', true), arg('--cut', false)).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
else if (cmd === 'patch') { for (const pr of [true, false]) { console.log('구간', makeTree('/tmp/wt-t672-dry', pr)); execFileSync('git', ['worktree', 'remove', '--force', '/tmp/wt-t672-dry'], { cwd: ROOT }); } }
else if (cmd === 'table') table();
else console.log('사용: run <tag> [--probe 0|1] [--cut 0|1] · table · patch');
