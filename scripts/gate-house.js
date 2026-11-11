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
const STALL = SLOW ? Math.max(0, parseFloat(opt('--slow-stall', '40')) || 0) : 0;   // ★[T1268] 느린 틱 판 — 존 본 틱 머리마다 바쁜 ms(첫 econ 날 뒤 · 틱 자 `T1268_TICK_STALL_MS`)
const METER = path.join(__dirname, 't1268-tick-meter.js');
if (!(DAYS > 0) || !/^\d+(,\d+)*$/.test(SEEDS)) { console.error('쓰는 법: [--days 400] [--seeds 1020,7,42] [--load N] [--keep <out.json>] [--slow [--slow-loops N]]'); process.exit(2); }

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
    if (how.stall) env.T1268_TICK_STALL_MS = String(how.stall); else delete env.T1268_TICK_STALL_MS;   // ★[T1268] 느린 틱 판만(틱 자가 틱 머리에서 쓴다)
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
//   ★[T1268] 굽기 판 틱 자 읽기 — 임시 폴더 안 `<판>.t1268tick.json`(시드마다 하나) → 시드 평균(간격 · 본문 · econ 날)
function readMeters() {
  const out = [];
  const walk = (d) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.t1268tick\.json$/.test(e.name)) { try { out.push(JSON.parse(fs.readFileSync(p, 'utf8'))); } catch (x) {} } } };
  walk(TMP);
  const avg = (f) => { const v = out.map(f).filter((x) => Number.isFinite(x)); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null; };
  return { n: out.length, ticks: out.reduce((a, m) => a + ((m.gap && m.gap.n) || 0), 0), stalled: out.reduce((a, m) => a + (m.stalled || 0), 0), p50: avg((m) => m.gap.p50), mean: avg((m) => m.gap.mean), p95: avg((m) => m.gap.p95), body: avg((m) => m.body.mean), day: avg((m) => m.day.mean) };
}
(async () => {
  const knobs = Object.keys(process.env).filter((k) => /^T\d+_/.test(k)).sort().map((k) => `${k}=${process.env[k]}`);
  const slowTxt = SLOW ? (PIN ? `느린 틱(taskset -c ${CORE} · 같은 코어 고리 ${SLOW_LOOPS} · 틱마다 ${STALL}ms)` : `느린 틱(taskset 없음 · 고리 ${SLOW_LOOPS} · 틱마다 ${STALL}ms)`) : '넉넉한 틱';
  console.log(`=== 판 자 결정론 게이트(--house) — ${DAYS}날 · 시드 ${SEEDS} · 부하 고리 ${LOAD} · ${slowTxt} · 걸린 T…_ env ${knobs.length ? knobs.join(" ") : "없음(판 자 기본)"} ===`);
  const t0 = Date.now();
  // ① 벽시계 굽기(부하 판이면 그동안 고리 · ★[T1268] 느린 틱 판이면 코어 0 에 묶은 고리)
  const pids = LOAD ? startLoops(LOAD) : [];
  if (LOAD) console.log(`  부하 고리 pid ${pids.join(' ')}`);
  if (SLOW) { const sp = startLoops(SLOW_LOOPS, PIN).slice(pids.length); console.log(`  느린 틱 고리 pid ${sp.join(' ')}${PIN ? ` · 코어 ${CORE}` : ''}`); }
  const mk = await sbc(['--make', BAKE, '--days', String(DAYS), '--seeds', SEEDS, '--house'], '굽기', { pin: PIN, meter: true, stall: STALL });
  stopLoops();
  const M = readMeters();
  const tickTxt = M.n ? `틱 간격 p50 ${M.p50}ms · 평균 ${M.mean}ms · p95 ${M.p95}ms · 본문 평균 ${M.body}ms · econ 날 ${M.day}ms(${M.ticks}틱${M.stalled ? ` · 늦춘 틱 ${M.stalled}` : ''} · 판 ${M.n})` : '틱 자 없음';
  console.log(`  [틱 자] ${slowTxt} · ${tickTxt}`);
  if (mk.code !== 0) { console.log(`GATE-HOUSE FAIL · 굽기 판 실패(나감 ${mk.code}) · ${mk.sec}초`); process.exit(2); }
  // ② 그 판 ↔ 가상 시계
  const vc = await sbc([BAKE, '--house', '--vclock'], '견줌');
  const sec = Math.round((Date.now() - t0) / 1000);
  const what = (vc.last || '').replace(/^=== | ===$/g, '');
  const tail = `${DAYS}날 · 시드 ${SEEDS} · 부하 ${LOAD} · ${slowTxt} · ${tickTxt} · 굽기 ${mk.sec}초 + 견줌 ${vc.sec}초 = ${sec}초${KEEP ? ` · 남김 ${path.relative(ROOT, BAKE)}` : ''}`;
  if (vc.code === 0) { console.log(`GATE-HOUSE PASS · 벽시계 = 가상 시계 ${what} · ${tail}`); process.exit(0); }
  console.log(`GATE-HOUSE FAIL · ${vc.code === 1 ? '벽시계 ≠ 가상 시계' : `견줌 판 실패(나감 ${vc.code})`} ${what} · ${tail}`);
  process.exit(vc.code === 1 ? 1 : 2);
})();
