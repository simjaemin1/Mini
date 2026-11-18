'use strict';
// T1352 판 사슬 — 두 존 가상 시계 판을 차례로(한 번에 하나 · 포트 고정) · 끝난 판은 건너뛴다(다시 띄워도 이어 간다)
// pause 파일이 있으면 다음 판 앞에서 기다린다 · stop 파일이 있으면 다음 판 앞에서 끝난다.
const fs = require('fs'), path = require('path'), { spawn, spawnSync } = require('child_process');
const D = __dirname, WT = path.join(D, 'wt'), OUT = path.join(D, 'runs');
fs.mkdirSync(OUT, { recursive: true });
const L = { T1352_NEWS_LOCAL: '1' }, S = { T1352_NEWS_SEAM: '1' }, B = { T1334_BUNDLE: '1' };
const PLAN = '30,10,3,3';
const RUNS = [];
const add = (tag, seed, days, env, plan) => RUNS.push({ tag, seed, days, env: Object.assign({ T1324_XZ_MIGRATE: '1' }, env), plan });
const four = (p, seed, days, plan, base) => { add(`${p}0_${seed}`, seed, days, Object.assign({}, base), plan); add(`${p}L_${seed}`, seed, days, Object.assign({}, base, L), plan); add(`${p}S_${seed}`, seed, days, Object.assign({}, base, S), plan); add(`${p}LS_${seed}`, seed, days, Object.assign({}, base, L, S), plan); };
four('N', 1020, 300, null, {});
four('S', 1020, 120, PLAN, {});
add('SLS_1020r', 1020, 120, Object.assign({}, L, S), PLAN);   // ★같은 씨 다시 — 꾸민 판 결정성(T1324 회부 13 — 꾸밈을 존 하루 경계로 옮긴 뒤)
four('N', 7, 300, null, {});
four('N', 42, 300, null, {});
four('S', 7, 120, PLAN, {});
four('S', 42, 120, PLAN, {});
for (const seed of [1020, 7, 42]) { add(`SB0_${seed}`, seed, 120, Object.assign({}, B), PLAN); add(`SBLS_${seed}`, seed, 120, Object.assign({}, B, L, S), PLAN); }
for (const seed of [1020]) { add(`NB0_${seed}`, seed, 300, Object.assign({}, B), null); add(`NBLS_${seed}`, seed, 300, Object.assign({}, B, L, S), null); }
//   e2e-xzone-caravan 가상 시계 판 스무 판(T1352 할 일 6) — 끔 기본 열 · `T1352_XZ_HOLD=1` 열(나무 wt2 = 커밋 ② — 하네스 고침 · 안전망 손잡이)
const E2E = [];
for (let i = 1; i <= 10; i++) E2E.push({ tag: `E0_${String(i).padStart(2, '0')}`, env: {} });
for (let i = 1; i <= 10; i++) E2E.push({ tag: `EH_${String(i).padStart(2, '0')}`, env: { T1352_XZ_HOLD: '1' } });
//   ★e2e 첫 두 판(끔 · 켬)을 짐승 판 앞에 — 사슬 안 e2e 가 손 판(r5 · r6)과 같은 글자인지 먼저 본다(나머지 열여덟은 끝에)
const E2E_FIRST = E2E.filter((e) => e.tag === 'E0_01' || e.tag === 'EH_01'), E2E_SECOND = E2E.filter((e) => e.tag === 'E0_02' || e.tag === 'EH_02'), E2E_REST = E2E.filter((e) => !E2E_FIRST.includes(e) && !E2E_SECOND.includes(e));
{ const at = RUNS.findIndex((r) => r.tag === 'S0_1020'); RUNS.splice(at, 0, ...E2E_FIRST.map((e) => ({ tag: e.tag, e2e: true, env: e.env }))); }
{ const at = RUNS.findIndex((r) => r.tag === 'NL_7'); RUNS.splice(at, 0, ...E2E_SECOND.map((e) => ({ tag: e.tag, e2e: true, env: e.env }))); }   // ★둘째 쌍도 앞으로 — 같은 묶음 두 판 글자 견줌을 일찍
for (const e of E2E_REST) RUNS.push({ tag: e.tag, e2e: true, env: e.env });
const STF = path.join(D, 'chain_status.json');
const st = fs.existsSync(STF) ? JSON.parse(fs.readFileSync(STF, 'utf8')) : { done: [] };
const save = () => fs.writeFileSync(STF, JSON.stringify(st, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const free = () => { try { const o = spawnSync('df', ['-B1', '--output=avail', '/tmp'], { encoding: 'utf8' }).stdout.trim().split('\n').pop(); return +o; } catch (e) { return null; } };
const dirBytes = () => { let n = 0; for (const f of fs.readdirSync(OUT)) { try { const s = fs.statSync(path.join(OUT, f)); if (s.isFile()) n += s.size; } catch (e) {} } return n; };
(async () => {
  st.pid = process.pid; st.list = RUNS.map((r) => r.tag); save();
  for (const r of RUNS) {
    if (st.done.some((x) => x.tag === r.tag && x.rc === 0)) continue;
    while (fs.existsSync(path.join(D, 'pause')) && !fs.existsSync(path.join(D, 'stop'))) { st.paused = new Date().toISOString(); save(); await sleep(10000); }
    if (fs.existsSync(path.join(D, 'stop'))) { st.stopped = new Date().toISOString(); save(); process.exit(0); }
    st.paused = null;
    if (r.e2e) {   // e2e 판 — 일하는 나무(/home/claude/mini) · 출력 e2e/<표지>.txt · 존 로그 e2e/<표지>/
      const ED = path.join(D, 'e2e'); fs.mkdirSync(ED, { recursive: true });
      st.cur = { tag: r.tag, start: new Date().toISOString(), e2e: true, env: r.env }; save();
      const t0 = Date.now();
      const o = fs.openSync(path.join(ED, `${r.tag}.txt`), 'w'), oe = fs.openSync(path.join(ED, `${r.tag}.err`), 'w');
      const p = spawn(process.execPath, ['scripts/e2e-xzone-caravan.js'], { cwd: path.join(D, 'wt2'), stdio: ['ignore', o, oe], env: Object.assign({}, process.env, { XZ_SHOTS: path.join(ED, r.tag) }, r.env) });
      const rc = await new Promise((res) => p.on('exit', (c) => res(c == null ? -1 : c)));
      st.done.push({ tag: r.tag, rc: rc === 1 ? 0 : rc, e2eRc: rc, wallS: Math.round((Date.now() - t0) / 1000), end: new Date().toISOString() });   // e2e 빨강(1)도 판은 끝난 것
      st.cur = null; save();
      continue;
    }
    const args = ['scripts/t1324-vclock-beast.js', 'run', OUT, r.tag, String(r.seed), String(r.days), '3000', '--nobeast', '--env', Object.entries(r.env).map(([k, v]) => `${k}=${v}`).join(','), '--limit', '9000'];
    if (r.plan) args.push('--stage-plan', r.plan);
    st.cur = { tag: r.tag, start: new Date().toISOString(), args: args.join(' ') }; save();
    const t0 = Date.now();
    const o = fs.openSync(path.join(OUT, `run_${r.tag}.txt`), 'w');
    const p = spawn(process.execPath, args, { cwd: WT, stdio: ['ignore', o, o] });
    let peak = 0;
    const iv = setInterval(() => { const b = dirBytes(); if (b > peak) peak = b; st.cur.bytes = b; st.cur.free = free(); st.cur.wallS = Math.round((Date.now() - t0) / 1000); save(); }, 60000);
    const rc = await new Promise((res) => p.on('exit', (c) => res(c == null ? -1 : c)));
    clearInterval(iv);
    //   분석(그 판 글자 그대로 — 사슬 나무) · DB 지움(분석은 로그 · 줄 · 표본만 읽는다)
    const an = spawnSync(process.execPath, ['scripts/t1292-xzone-live.js', 'analyze', OUT, r.tag], { cwd: WT, encoding: 'utf8', maxBuffer: 1 << 28 });
    fs.writeFileSync(path.join(OUT, `an1292_${r.tag}.json`), an.stdout || '');
    spawnSync(process.execPath, ['scripts/t1324-mig-analyze.js', OUT, r.tag, '--json', path.join(OUT, `mig_${r.tag}.json`)], { cwd: WT, encoding: 'utf8', maxBuffer: 1 << 28 });
    for (const f of fs.readdirSync(OUT)) if (f.startsWith(`z_${r.tag}_`) && /\.db(-wal|-shm)?$/.test(f) || f.startsWith(`c_${r.tag}.db`)) { try { fs.unlinkSync(path.join(OUT, f)); } catch (e) {} }
    try { if (r.tag !== RUNS[0].tag) fs.rmSync(path.join(OUT, `geo_${r.tag}`), { recursive: true, force: true }); } catch (e) {}
    st.done.push({ tag: r.tag, rc, wallS: Math.round((Date.now() - t0) / 1000), peakBytes: peak, end: new Date().toISOString() });
    st.cur = null; save();
  }
  st.finished = new Date().toISOString(); save();
})();
