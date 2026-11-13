#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · 착지 게이트 · 판 15~18분 · 제품 무변 · 판정 0 · 하네스는 scripts/test-t1043-gate-house.js)
// === scripts/gate-house.js — 판 자 결정론 착지 게이트 한 줄(T1043 · 2026-11-01 · `인계/공통.md` §2 ⑪) ===================================
//
// ★왜 [T1013 회부 · T1043 ③] 판 자 벽시계 자리 다섯(T969 쉼터 · T986 도적 하루 · T990/T1001 길의 날 · 광맥 시각 · T1013 사냥터 짓기)이 econ 날에
//   묶인 뒤로 집 행위 켬(`--house`) 판의 벽시계 판 = 가상 시계 판이다(800날 3시드 · 부하 판 포함). 착지 판에서 그것이 서 있는지를
//   명령 두 줄(굽기 · 견줌)로 봤는데, 그 두 줄을 PM 게이트가 그대로 부르도록 한 파일로 묶었다. 자는 하나도 안 바꾼다 — 같은 두 줄을 차례로 부른다.
//
// 쓰는 법:
//   node scripts/gate-house.js                          # --house 400날 3시드 벽시계 굽기 → 그 판 ↔ --vclock 견줌(2코어 ≈ 564 + 531초)
//   node scripts/gate-house.js --keep 계측/서버기준선_<날짜>_house.json   # 구운 판을 그 이름으로 남긴다(안 주면 임시 폴더 · 끝나면 지움)
//   node scripts/gate-house.js --load 2                 # 부하 판 — 굽는 동안 바쁜 고리 2(벽시계 몫이 바닥나는 자리를 드러낸다 · T1013)
//   node scripts/gate-house.js --days 20 --seeds 42     # 짧은 판(하네스 · 손 확인)
//   node scripts/gate-house.js --slow                   # ★[T1268] 느린 틱 판 — 벽시계 굽기 판을 코어 하나(`taskset -c 0`)에 바쁜 고리 1 과 같이 묶는다(아래 ④)
//   node scripts/gate-house.js --slow --slow-loops 2    # 같은 코어에 고리 둘 · `taskset` 이 없으면 고리 = 코어 수(묶지 않음)
//   node scripts/gate-house.js --slow --slow-stall 40   # 존 본 틱 머리마다 바쁜 40ms(기본 · 첫 econ 날 뒤 · 0 = 끔)
//   node scripts/gate-house.js --slow --slow-core 1     # 묶는 코어(기본 0 — 느린 판 둘을 같이 띄울 때 서로 다른 코어에)
//   끝 줄 하나: `GATE-HOUSE PASS · …` (나감 0) · `GATE-HOUSE FAIL · …` (나감 1 = 갈림 · 2 = 판 실패)
//
// ★지키는 것
//   ① 판 조건은 `server-baseline-check.js --house` 그대로(`VILLAGE_CARAVAN_MAX=0` · `T400_BUILD_ACT=1` · t577 아이 기본 — T941 · T990 · T1013 손잡이).
//      부르는 쪽 env 는 그대로 아이까지 간다(미끼 · 되돌림 판을 그대로 칠 수 있게) — 이 파일이 지우거나 더하는 손잡이는 0 이다. 걸린 `T…_` env 는 머리 줄에 적는다.
//   ② 부하 고리는 굽기 동안만 돈다. 고리마다 부모(이 파일)가 사라지거나 시한(2시간)이 지나면 스스로 멈춘다 — 판 뒤 남는 고리 0(T1013 사고 기록).
//   ③ 판 폴더(DB 1~2 GB)는 이 파일이 만든 임시 폴더 하나에 두고 끝에 지운다. 끊기면(SIGINT · SIGTERM · SIGHUP) 기준선 자를 아이 판까지(프로세스 묶음) 멈추고 지운다.
//   ④ ★[T1268 · T1258 회부 6] 느린 틱 판(`--slow`) — 시계 갈림은 틱이 넉넉한 판에선 안 보이고 틱이 느린 판(벽 판 둘을 한 코어에)에서만 섰다(T1253 §6 · T1258 §1 ㄱ).
//      굽기(벽시계) 판의 기준선 자를 `taskset -c 0` 으로 띄운다(아이 판 · 아이 존이 그 묶음을 물려받는다) · 같은 코어에 바쁜 고리(기본 1 · `--slow-loops N`)를
//      묶어 그 코어를 나눠 쓰게 한다. `taskset` 이 없으면 고리를 코어 수만큼(묶지 않고) 띄워 틱을 늦춘다. 견줌(가상 시계) 판은 그대로(묶지 않음 — V 는 틱 빠르기에 안 기댄다).
//      ⚠코어 묶음 + 고리만으로는 틱이 덜 늦는다(까닭은 짐작 — 존은 틱 사이에 자고 깨면 늘 뛰는 고리보다 먼저 코어를 받는다 · 실측 — 보고 T1268 §2 · 시드 42 · 20날: econ 날 벽시계 2,399 → 4,770ms ·
//      틱 간격 평균 36.8 → 40.7ms · p50 33ms 그대로 · 고치기 전 판(`T1258_ARTISAN_CLOCK=0`)이 고리 1 · 2 둘 다 초록). 그래서 틱 자가 존 본 틱 머리마다 바쁜 ms(`--slow-stall` · 기본 40 · 첫 econ 날 뒤부터 — 부팅은 안 늦춘다)를
//      더 쓴다(틱 안의 부하 고리 · 틱 본문 · 차례 · 값 무변 — *언제*만). 끝 줄의 틱 간격 · econ 날 길이가 "정말 느렸나"의 증인이다
//      (기본 `--slow` 실측: 틱 간격 평균 66ms · p50 60ms · econ 날 9.1초(하네스 안 판 6.3 ~ 6.5초) — 넉넉한 판의 ×1.8 · ×2.7 ~ 3.8 · 고치기 전 판 12날 어촌1 빨강 · 지금 판 초록).
//      ⚠느린 틱 판은 판이 길다(20날 시드 42 = 436 ~ 444초 실측 · 400날 3시드는 셈으로 econ 날 9초 × 400날 ≈ 1시간에 시드 셋이 코어 하나 — 안 돌려 봄) —
//      기본 판(400날 착지 게이트)은 종전 그대로 넉넉한 판이다(느린 틱은 갈래 · 짧은 판). 묶는 코어는 `--slow-core N`(기본 0).
//      굽기 판 아이 존엔 틱 자(`t1268-tick-meter.js` — 읽기만)를 늘 싣는다(느린 판 · 넉넉한 판 둘 다): 끝 줄에 그 판의 30Hz 틱 간격(p50 · 평균) · 본문 · econ 날 벽시계 길이를 적는다
//      — "틱이 정말 느렸나"를 끝 줄이 말한다(판정 아님 · 견줌은 종전 그대로 벽시계 = 가상 시계).
//   ⑤ ★[T1299 · T1289 회부 3] 틈 판(`--slow` 에 붙는다 · `--gap off` = 뗌 · `--gap-only` = 이것만) — 판 자 지문(`--house` · 캐러밴 0)은 마감 틈 갈래 미끼
//      (`gapK1` = T1282 앞 마감 중 시계 · `gapG1` = T1289 앞 틈 정렬)를 못 봤다(둘 다 PASS — 틈은 벽시계 판에서만 서고 지문이 틈 안 시계 값에 안 닿는다).
//      ⇒ 견줌 뒤 캐러밴 켬 · 벽시계 판 자 한 판(`t577-server-run` · `--gap-days` 기본 6날 · 시드 = `--seeds` 첫째 · 낮밤 0시 고정)에 틈 자(`t1299-gap-meter.js`)를 싣고
//         econ 날 시계의 정의 둘(T1282 머리 주석 · T1289 ①)을 본다: 단조(틈에서 시계가 거꾸로 안 간다) · 경계(틈에서 본 econ 날 경계 = 머리 뒤 값).
//         깨지면 나감 1(`GATE-HOUSE FAIL · 틈 갈래 ≠ econ 날 시계`) · 틈 틱 0 · 자 문 못 끼움이면 나감 2(자가 아무것도 안 봤다 — 자명 통과 금지).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SBC = path.join(__dirname, 'server-baseline-check.js');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const DAYS = parseInt(opt('--days', '400'), 10);
const SEEDS = String(opt('--seeds', '1020,7,42'));
const LOAD = Math.max(0, parseInt(opt('--load', '0'), 10) || 0);
const KEEP = opt('--keep', null);
const SLOW = A.includes('--slow');   // ★[T1268] 느린 틱 판(머리 주석 ④)
const HAS_TASKSET = (() => { try { return require('child_process').spawnSync('taskset', ['-c', '0', process.execPath, '-e', '0'], { stdio: 'ignore' }).status === 0; } catch (e) { return false; } })();
const SLOW_LOOPS = SLOW ? Math.max(1, parseInt(opt('--slow-loops', HAS_TASKSET ? '1' : String(os.cpus().length)), 10) || 1) : 0;
const PIN = SLOW && HAS_TASKSET;   // 묶음 = 코어 하나(굽기 판 · 고리)
const CORE = String(Math.max(0, Math.min(os.cpus().length - 1, parseInt(opt('--slow-core', '0'), 10) || 0)));   // 기본 코어 0 · 하네스가 느린 판 둘을 다른 코어에 같이 띄울 때 `--slow-core 1`
const STALL = SLOW ? Math.max(0, parseFloat(opt('--slow-stall', '40')) || 0) : 0;
//   ★[T1287 · T1280 회부 2] 머묾 멈춤 — 느린 틱 판은 장인 몸의 사다리 머묾마다 한 번 존 틱 머리에서 이 ms 를 바쁘게 쓴다(틱 자 `T1287_DWELL_STALL_MS`).
//     기본 6000 = 장인 머묾 가장 긴 것(`G_STOREW` 6초 · villages.js) — 벽시계로 머묾을 재면 다음 틱에 끝난다(상자 빠르기와 무관 · `--slow-dwell 0` = 종전).
const CLOSE = SLOW ? Math.max(0, parseFloat(opt('--slow-dwell', '6000')) || 0) : 0;   // ★[T1268] 느린 틱 판 — 존 본 틱 머리마다 바쁜 ms(첫 econ 날 뒤 · 틱 자 `T1268_TICK_STALL_MS`)
//   ★[T1287 · T1280 회부 2 — 미끼 ④ 가 판마다 뒤집힌 진짜 까닭] 낮밤 위상 고정 — 굽기(벽시계) 판 아이 존의 벽시계를 상수 하나만큼 당겨 게임 0시에서 출발시킨다
//     (가상 시계 판 V0 = 2026-01-01T00:00Z 와 같은 위상 · 틱 자 `T1287_PHASE0=1`). 종전엔 띄운 실제 시각의 게임 시각에서 출발해, 굽기가 게임 저녁 ~ 밤(16.8시 ~)에 걸리면
//     몸의 일과가 내내 취침이라 장인 머묾 0 → 미끼 ④ 같음(T1287 20판 중 6판 — 부하가 아니라 띄운 시각). `--phase real` = 종전(실제 시각 위상).
const PHASE_REAL = A.includes('--phase') && opt('--phase', '') === 'real';
const METER = path.join(__dirname, 't1268-tick-meter.js');
//   ★[T1299 · T1289 회부 3] 틈 판 — 느린 틱 판(`--slow`)에 캐러밴 몸 · 마감 틈이 서는 짧은 벽시계 판 하나를 붙인다(머리 주석 ⑤).
//     판 자(`t577-server-run` · 캐러밴 켬 · 집 행위 켬 · 시드 = `--seeds` 첫째)에 틈 자(`t1299-gap-meter.js` — 읽기만)를 싣고 econ 날 시계의 정의 둘을 본다:
//     단조(틈에서 시계가 거꾸로 안 간다) · 경계(틈에서 본 `econDayToMs(Dc)` = 머리 뒤 값). 틈 틱 0 이면 판 실패(자가 아무것도 안 봤다).
//     `--gap off` = 붙이지 않음 · `--gap-only` = 틈 판만(하네스 미끼 판) · `--gap-days N`(기본 6) · `--gap-slice N`(마감 조각 예산 ms · 기본 4).
const GAP_ON = SLOW && opt('--gap', 'on') !== 'off';
const GAP_ONLY = A.includes('--gap-only');
const GAP_DAYS = Math.max(2, parseInt(opt('--gap-days', '6'), 10) || 6);
const GAP_SLICE = opt('--gap-slice', '4');   // 마감 조각 예산 4ms(*언제*만 · 슬라이서 규약) — 마감마다 틈이 선다(실측 8날 마감 8/8 · 틈 틱 48 · 제품 기본 16ms 는 10날 7틱 — 0 인 판이 날 수 있다)
const GAPM = path.join(__dirname, 't1299-gap-meter.js');
if (!(DAYS > 0) || !/^\d+(,\d+)*$/.test(SEEDS)) { console.error('쓰는 법: [--days 400] [--seeds 1020,7,42] [--load N] [--keep <out.json>] [--slow [--slow-loops N] [--gap off|--gap-only] [--gap-days N]] [--phase real]'); process.exit(2); }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-house-'));
const BAKE = KEEP ? path.resolve(KEEP) : path.join(TMP, 'house.json');
const loops = [];
let cur = null;   // 지금 도는 기준선 자(제 프로세스 묶음 — 아이 판까지 한 번에 멈춘다)
function stopLoops() { for (const ch of loops) { try { ch.kill('SIGKILL'); } catch (e) {} } loops.length = 0; }
function cleanup() { stopLoops(); if (cur) { try { process.kill(-cur.pid, 'SIGKILL'); } catch (e) {} cur = null; } try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} }
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(2); });

function startLoops(n, pin) {
  //   스스로 멈추는 바쁜 고리 — 2^20 번마다 부모 pid 와 시한을 본다(부모가 죽으면 ppid 가 바뀐다)
  //   ★[T1268] `pin` = 코어 0 에 묶는다(`taskset` 은 exec 로 node 가 되므로 pid · 부모가 그대로다 — 남는 고리 0 규약 그대로)
  const src = `const P=${process.pid},T=Date.now()+7200000;for(let i=1;;i++){if((i&1048575)===0&&(process.ppid!==P||Date.now()>T))break;}`;
  for (let i = 0; i < n; i++) loops.push(pin ? spawn('taskset', ['-c', CORE, process.execPath, '-e', src], { stdio: 'ignore' }) : spawn(process.execPath, ['-e', src], { stdio: 'ignore' }));
  return loops.map((c) => c.pid);
}
function sbc(args, tag, how) {
  how = how || {};
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, { TMPDIR: TMP });
    if (how.meter) env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --require ${METER}`.trim();   // ★[T1268] 굽기 판 아이 존 틱 자(읽기만)
    if (how.stall) env.T1268_TICK_STALL_MS = String(how.stall); else delete env.T1268_TICK_STALL_MS;
    if (how.meter && !PHASE_REAL) env.T1287_PHASE0 = '1'; else delete env.T1287_PHASE0;   delete env.T1299_PHASE_OFF;   // ★[T1299] 부르는 쪽이 다른 시각으로 고정한 묶음 안에서 불려도 굽기 판은 제 0시(공용 `lib-phase` 상수를 아이 존이 새로 정한다)   // ★[T1287] 낮밤 위상 고정(굽기 판 · 틱 자가 아이 존에서 건다)
    if (how.close) env.T1287_DWELL_STALL_MS = String(how.close); else delete env.T1287_DWELL_STALL_MS;   // ★[T1287] 머묾 멈춤(느린 틱 판만)   // ★[T1268] 느린 틱 판만(틱 자가 틱 머리에서 쓴다)
    const t0 = Date.now();
    const ch = how.pin ? spawn('taskset', ['-c', CORE, process.execPath, SBC, ...args], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
      : spawn(process.execPath, [SBC, ...args], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    cur = ch;
    let last = '', all = '';
    const line = (out) => { let rest = ''; return { feed(b) { rest += b.toString(); const ls = rest.split('\n'); rest = ls.pop(); for (const l of ls) { all += l + '\n'; out.write(`  [${tag}] ${l}\n`); } }, end() { if (rest) { all += rest; out.write(`  [${tag}] ${rest}\n`); rest = ''; } } }; };
    const o = line(process.stdout), e = line(process.stderr);
    ch.stdout.on('data', (b) => o.feed(b));
    ch.stderr.on('data', (b) => e.feed(b));
    ch.on('close', (code) => { cur = null; o.end(); e.end(); const m = all.match(/=== [^\n]* ===/g); if (m) last = m[m.length - 1]; resolve({ code, last, sec: Math.round((Date.now() - t0) / 1000) }); });
  });
}
//   ★[T1299] 틈 판 — 판 자 하나(제 프로세스 묶음 · 끊기면 cleanup 이 아이까지 멈춘다) → `<판>.t1299gap.json`
function gapRun() {
  return new Promise((resolve) => {
    const dir = path.join(TMP, 'gap'); fs.mkdirSync(dir, { recursive: true });
    const env = Object.assign({}, process.env, { TMPDIR: TMP, T577_DIR: dir, T577_PAR: '1', T1299_GAP: '1', T1299_PHASE_HOUR: '0',
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${GAPM} --require ${path.join(__dirname, 'phase-pin.js')}`.trim() });
    delete env.T1299_PHASE_OFF; delete env.T745_VCLOCK; delete env.VILLAGE_CARAVAN_MAX;   // 벽시계 · 캐러밴 켬(제품 기본) · 0시(공용 `lib-phase` — 아이 존이 상수를 정한다)
    env.VILLAGE_TICK_SLICE_MS = String(GAP_SLICE);
    const seed = SEEDS.split(',')[0], t0 = Date.now();
    const ch = spawn(process.execPath, [path.join(__dirname, 't577-server-run.js'), String(GAP_DAYS), seed], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    cur = ch;
    let tail = '';
    const keep = (b) => { tail = (tail + b.toString()).slice(-4000); };
    ch.stdout.on('data', keep); ch.stderr.on('data', keep);
    ch.on('close', (code) => {
      cur = null;
      let G = null; try { const f = fs.readdirSync(dir).find((x) => x.endsWith('.t1299gap.json')); if (f) G = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) {}
      resolve({ code, G, seed, sec: Math.round((Date.now() - t0) / 1000), tail });
    });
  });
}
const gapTxt = (g) => !g.G ? `틈 판 자 파일 없음(나감 ${g.code})` : `틈 판 ${GAP_DAYS}날 · 시드 ${g.seed} · 캐러밴 켬 · 조각 예산 ${GAP_SLICE}ms · 틈 선 마감 ${g.G.gapCloses} · 틈 틱 ${g.G.gapTicks} · 틈 몸 틱 ${g.G.bodyGap} · 틈 장인 걸음 ${g.G.artGap} · 시계 잼 ${g.G.checks} · 단조 깨짐 ${g.G.dec}${g.G.dec ? `(틈 ${g.G.decGap} · 최대 ${g.G.decMax}ms)` : ''} · 경계 어긋남 ${g.G.drift}/${g.G.bound}${g.G.drift ? `(최대 ${g.G.driftMax}ms)` : ''} · ${g.sec}초`;
const gapVerdict = (g) => !g.G || g.code !== 0 || !(g.G.checks > 0) || !(g.G.gapTicks > 0) || !(g.G.inj >= 3) ? 'void' : (g.G.dec || g.G.drift) ? 'bad' : 'ok';
//   ★[T1268] 굽기 판 틱 자 읽기 — 임시 폴더 안 `<판>.t1268tick.json`(시드마다 하나) → 시드 평균(간격 · 본문 · econ 날)
function readMeters() {
  const out = [];
  const walk = (d) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.t1268tick\.json$/.test(e.name)) { try { out.push(JSON.parse(fs.readFileSync(p, 'utf8'))); } catch (x) {} } } };
  walk(TMP);
  const avg = (f) => { const v = out.map(f).filter((x) => Number.isFinite(x)); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null; };
  return { n: out.length, ticks: out.reduce((a, m) => a + ((m.gap && m.gap.n) || 0), 0), stalled: out.reduce((a, m) => a + (m.stalled || 0), 0), closed: out.reduce((a, m) => a + (m.dwellStalled || 0), 0), phase0: out.length > 0 && out.every((m) => m.phase0 && m.phaseOk), hour0: avg((m) => m.hour0), p50: avg((m) => m.gap.p50), mean: avg((m) => m.gap.mean), p95: avg((m) => m.gap.p95), body: avg((m) => m.body.mean), day: avg((m) => m.day.mean) };
}
(async () => {
  const knobs = Object.keys(process.env).filter((k) => /^T\d+_/.test(k)).sort().map((k) => `${k}=${process.env[k]}`);
  const slowTxt = SLOW ? (PIN ? `느린 틱(taskset -c ${CORE} · 같은 코어 고리 ${SLOW_LOOPS} · 틱마다 ${STALL}ms · 머묾마다 ${CLOSE}ms)` : `느린 틱(taskset 없음 · 고리 ${SLOW_LOOPS} · 틱마다 ${STALL}ms · 머묾마다 ${CLOSE}ms)`) : '넉넉한 틱';
  console.log(`=== 판 자 결정론 게이트(--house) — ${DAYS}날 · 시드 ${SEEDS} · 부하 고리 ${LOAD} · ${slowTxt} · 걸린 T…_ env ${knobs.length ? knobs.join(" ") : "없음(판 자 기본)"} ===`);
  const t0 = Date.now();
  if (GAP_ONLY) {   // ★[T1299] 틈 판만(하네스 미끼 판)
    const g = await gapRun(), v = gapVerdict(g), sec = Math.round((Date.now() - t0) / 1000);
    console.log(`  [틈 판] ${gapTxt(g)}`);
    if (v === 'ok') { console.log(`GATE-HOUSE PASS · 틈 판만 · econ 날 시계 정의대로 · ${gapTxt(g)} · ${sec}초`); process.exit(0); }
    if (v === 'bad') { console.log(`GATE-HOUSE FAIL · 틈 갈래 ≠ econ 날 시계 · ${gapTxt(g)} · ${sec}초`); process.exit(1); }
    console.log(`GATE-HOUSE FAIL · 틈 판 실패 · ${gapTxt(g)} · ${(g.tail || '').trim().split('\n').slice(-2).join(' / ')}`); process.exit(2);
  }
  // ① 벽시계 굽기(부하 판이면 그동안 고리 · ★[T1268] 느린 틱 판이면 코어 0 에 묶은 고리)
  const pids = LOAD ? startLoops(LOAD) : [];
  if (LOAD) console.log(`  부하 고리 pid ${pids.join(' ')}`);
  if (SLOW) { const sp = startLoops(SLOW_LOOPS, PIN).slice(pids.length); console.log(`  느린 틱 고리 pid ${sp.join(' ')}${PIN ? ` · 코어 ${CORE}` : ''}`); }
  const mk = await sbc(['--make', BAKE, '--days', String(DAYS), '--seeds', SEEDS, '--house'], '굽기', { pin: PIN, meter: true, stall: STALL, close: CLOSE });
  stopLoops();
  const M = readMeters();
  const tickTxt = M.n ? `틱 간격 p50 ${M.p50}ms · 평균 ${M.mean}ms · p95 ${M.p95}ms · 본문 평균 ${M.body}ms · econ 날 ${M.day}ms(${M.ticks}틱${M.stalled ? ` · 늦춘 틱 ${M.stalled}` : ''}${M.closed ? ` · 머묾 멈춤 ${M.closed}` : ''} · 판 ${M.n}) · 낮밤 ${M.phase0 ? '0시 고정' : '실제 시각'}(첫 날 게임 ${M.hour0}시)` : '틱 자 없음';
  console.log(`  [틱 자] ${slowTxt} · ${tickTxt}`);
  if (mk.code !== 0) { console.log(`GATE-HOUSE FAIL · 굽기 판 실패(나감 ${mk.code}) · ${mk.sec}초`); process.exit(2); }
  // ② 그 판 ↔ 가상 시계
  const vc = await sbc([BAKE, '--house', '--vclock'], '견줌');
  // ③ ★[T1299] 틈 판(느린 틱 판만 · 견줌 뒤 차례로 — 굽기 판 코어 묶음을 안 흔든다)
  const gp = GAP_ON ? await gapRun() : null, gv = gp ? gapVerdict(gp) : 'off';
  if (gp) console.log(`  [틈 판] ${gapTxt(gp)}`);
  const sec = Math.round((Date.now() - t0) / 1000);
  const what = (vc.last || '').replace(/^=== | ===$/g, '');
  const tail = `${DAYS}날 · 시드 ${SEEDS} · 부하 ${LOAD} · ${slowTxt} · ${tickTxt} · 굽기 ${mk.sec}초 + 견줌 ${vc.sec}초${gp ? ` + 틈 ${gp.sec}초` : ''} = ${sec}초${gp ? ` · ${gapTxt(gp)}` : ''}${KEEP ? ` · 남김 ${path.relative(ROOT, BAKE)}` : ''}`;
  if (vc.code === 0 && gv === 'bad') { console.log(`GATE-HOUSE FAIL · 틈 갈래 ≠ econ 날 시계 · 벽시계 = 가상 시계 ${what} · ${tail}`); process.exit(1); }
  if (vc.code === 0 && gv === 'void') { console.log(`GATE-HOUSE FAIL · 틈 판 실패 · 벽시계 = 가상 시계 ${what} · ${tail}`); process.exit(2); }
  if (vc.code === 0) { console.log(`GATE-HOUSE PASS · 벽시계 = 가상 시계 ${what} · ${tail}`); process.exit(0); }
  console.log(`GATE-HOUSE FAIL · ${vc.code === 1 ? '벽시계 ≠ 가상 시계' : `견줌 판 실패(나감 ${vc.code})`} ${what} · ${tail}`);
  process.exit(vc.code === 1 ? 1 : 2);
})();
