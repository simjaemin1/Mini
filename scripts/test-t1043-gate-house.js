#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly C   ← 야간 분할(T238) — 게이트 짧은 판 둘(판당 2~4분 · 굽기 + 견줌 · 둘 같이) + ★[T1268] 느린 틱 판 둘(코어 0 · 1 · 같이 · 판당 약 7분 반)
// === scripts/test-t1043-gate-house.js — 판 자 결정론 착지 게이트 한 줄(`scripts/gate-house.js` · T1043 · 2026-11-01) ==========================
//
// 판정 사본 0: 게이트 파일 그대로를 짧은 판(시드 42 · 20날)으로 부른다. 게이트가 부르는 자(`server-baseline-check.js --house` 굽기 → `--vclock` 견줌)는
//   손대지 않는다. 지키는 것:
//     ⓪ 정적 — 게이트가 굽기 `--make … --house` · 견줌 `<구운 판> --house --vclock` 두 줄을 부르고, 끝 줄 PASS/FAIL 글자가 있고,
//        부하 고리가 부모 pid · 시한을 본다(남는 고리 0 — T1013 사고 기록)
//     ① 판 자 기본 + 부하 고리 1 — 나감 0 · 끝 줄 `GATE-HOUSE PASS` · 부하 고리 pid 가 판 뒤 살아 있지 않다 · 임시 판 폴더가 지워졌다
//     ② ★미끼 — 벽시계 굽기 아이만 다른 세계(이 파일이 프리로드로 실려 아이 존 · 가상 시계 아님일 때만 `T400_BUILD_ACT=0`)면
//        나감 1 · 끝 줄 `GATE-HOUSE FAIL · 벽시계 ≠ 가상 시계` (게이트가 갈림을 본다 — 자명 통과 금지)
//     ③ ★[T1268 · T1258 회부 6] 느린 틱 판(`--slow` — 굽기 판을 코어 0 에 고리와 묶고 존 본 틱 머리마다 바쁜 ms) — 지금 판(켬 기본) 나감 0 · 끝 줄 PASS ·
//        틱이 실제로 느렸다(끝 줄 틱 자 — econ 날 벽시계 · 틱 간격 평균이 ① 넉넉한 판보다 길다 · 틱 늦춘 수 > 0)
//     ④ ★[T1268 미끼] 같은 느린 틱 판 + `T1258_ARTISAN_CLOCK=0`(T1258 고치기 전 장인 머묾 = 벽시계) — 나감 1 · 끝 줄 `GATE-HOUSE FAIL · 벽시계 ≠ 가상 시계`
//        (진짜 벽시계 자리 미끼 — 넉넉한 판에선 초록이던 그 갈림을 느린 틱 판이 잡는다 · 자명 통과 금지). ③ ④ 는 같이 돈다(③ 코어 0 · ④ 코어 1 — 서로 안 늦춘다).
//        ★[T1287 · T1280 회부 2] 종전 ④ 는 마감 사이 창 길이(상자 부하로 달라진다)가 머묾(5 ~ 6초)보다 기냐에 기대 바쁜 상자에서 '같음'이 났다(6/1).
//          이제 느린 틱 판은 **머묾 멈춤**(장인 몸이 사다리 머묾에 든 econ 날마다 한 번 · 틱 머리 6초 · `t1268-tick-meter` `T1287_DWELL_STALL_MS`)을 싣는다 —
//          벽시계로 머묾을 재는 판은 상자와 무관하게 다음 틱에 머묾이 끝난다. ④ 는 머묾 멈춤이 실제로 섰는지(끝 줄 `머묾 멈춤 N` > 0)도 본다.
//        ★★[T1287 — 뒤집힘의 진짜 까닭] 머묾 멈춤만으로도 20판 중 6판이 ③ ④ 둘 다 머묾 멈춤 0 · ④ 같음이었다 — 부하가 아니라 **띄운 실제 시각**이었다.
//          몸의 일과는 벽시계 낮밤(`worldPhase` ≥ 0.7 = 밤 · 하루 24분)을 읽는데 굽기 판은 띄운 시각의 게임 시각에서 출발해, 게임 16 ~ 23시에 걸린 판은 장인이 내내 잤다.
//          이제 게이트가 굽기 판 아이 존의 벽시계를 상수만큼 당겨 게임 0시(가상 시계 V0 와 같은 위상)에서 출발시킨다(`T1287_PHASE0` · 끝 줄 `낮밤 0시 고정(첫 날 게임 N시)`).
//          ③ ④ 는 둘 다 낮밤 0시 고정 · 첫 날 게임 시각이 밤(16.8시) 앞 · 머묾 멈춤 > 0 을 본다.
//   진짜 벽시계 자리 미끼(`T146_BUILD_MS=1 T1013_BAND_DAY=0` — 사냥터 짓기를 내일로)는 날 281 에야 갈려 짧은 판에 안 닿는다 — 400날 판은 보고/T1043 §3.
//   ★[T1289] 마감 틈 갈래 미끼(프리로드 갈래 `T1043_BAIT=gapK1|gapG1`): 느린 틱 판(`--slow`)에 실어도 둘 다 PASS 였다(2026-11-12 ·
//     `계측/T1289_2026-11-12/게이트_미끼.txt`) — 판 자(`--house` · 캐러밴 0)의 지문에 틈 갈래 자리(기온 · 달력 · 장인 틈 걸음)가 안 닿는다. 틈 갈래는 `test-t1273-clock-rest` ⑤ ⑦ 이 잡는다.
//     ★★[T1299 · T1289 회부 3] 이제 느린 틱 판에 **틈 판**(캐러밴 켬 벽시계 판 자 · 6날 · `t1299-gap-meter` — econ 날 시계 단조 · 틈 경계)이 붙는다:
//       ③ 의 틈 판이 정의대로(틈 틱 > 0 · 깨짐 0) · ⑤ `gapK1` → 단조 깨짐(틈에서 시계가 하루 거꾸로) · ⑥ `gapG1` → 경계 어긋남(틈의 econ 날 경계가 하루 늦다) — 둘 다 나감 1.
//   ★[T1300] 옛 저장 가리기(`_t1289In` · `T1300_OLD_AX`) · 관측 칸(`_t1300Obs`) · 전쟁 몸 세 칸(`_warEnsureBody` · `_warSetupReturn` 켬 · T681 켬 갈래)은 이 게이트 지문에 안 닿는다 —
//     판 자는 다시 뜬 판 · 캐러밴 몸이 없고 · 전쟁 몸 세 칸은 T681 켬 판에선 읽는 이가 없다(판 무변이 증인 · 단언 무변). 그 셋은 `test-t1273-clock-rest` ⑨ ⑪ ⑫ · `test-t1268-econ-clock` ⑥ · `test-t772-leg` ④′ 가 잡는다.
'use strict';
if (require.main !== module) {   // ★프리로드 갈래 — 게이트 · 기준선 자 · 판 자 부모 · 부하 고리에도 실린다: 아무것도 안 한다(본문이 돌면 판이 판을 낳는다)
  //   벽시계 굽기 아이(아이 존 · 가상 시계 아님)만 세계를 바꾼다 — 미끼 판에서만(`T1043_BAIT=wall`)
  if (process.env.T1043_BAIT === 'wall' && process.env.T577_SEED && !process.env.T745_VCLOCK) process.env.T400_BUILD_ACT = '0';
  //   ★[T1289] 마감 틈 갈래 미끼 — 존 아이(벽시계 · 가상 시계 둘 다 · 같은 글자)가 `server/villages.js` 를 실을 때 틈 갈래 글자 한 자리를 종전으로(파일 무변)
  //     'gapK1' = 마감 중 econ 날 시계를 그날 머리로(T1282 앞 — 장인 머묾 · 장마당 그림이 틈에 하루를 거꾸로) · 'gapG1' = 틈 `econDayToMs` 정렬을 종전 `world.day` 로(T1289 앞)
  const GAP = { gapK1: ['if (state.tickJobs || state._t731 || state._t1253Edge) return (state._t1282D === D ? D + 1 : D) * M;', 'if (state.tickJobs || state._t731 || state._t1253Edge) return D * M;'],
    gapG1: ['state._t1253Edge)) ? state.world.day + 1 : state.world.day;', 'state._t1253Edge)) ? state.world.day : state.world.day;'] }[process.env.T1043_BAIT || ''];
  if (GAP && process.env.T577_SEED) {
    const Module = require('module'), VF = require('path').join(__dirname, '..', 'server', 'villages.js'), old = Module._extensions['.js'];
    Module._extensions['.js'] = function (m, f) {
      if (f !== VF) return old(m, f);
      const src = require('fs').readFileSync(f, 'utf8'), n = src.split(GAP[0]).length - 1;
      if (n !== 1) { console.error(`[T1289 미끼] 자리 ${n}곳 — 멈춤`); process.exit(3); }
      m._compile(src.replace(GAP[0], GAP[1]), f);
    };
  }
  return;
}
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const GATE = path.join(__dirname, 'gate-house.js');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
function gate(args, env) {
  return new Promise((resolve) => {
    const E = Object.assign({}, process.env);
    delete E.T745_VCLOCK; delete E.T1043_BAIT; Object.assign(E, env);
    const ch = spawn(process.execPath, [GATE, ...args], { cwd: ROOT, env: E, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    ch.stdout.on('data', (b) => { out += b; }); ch.stderr.on('data', (b) => { out += b; });
    ch.on('close', (code) => resolve({ code, out, last: out.trim().split('\n').pop() }));
  });
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
(async () => {
  console.log('\n=== 판 자 결정론 착지 게이트 한 줄 — scripts/gate-house.js(시드 42 · 20날) ===');
  {
    const G = fs.readFileSync(GATE, 'utf8');
    ok(/sbc\(\['--make', BAKE, '--days', String\(DAYS\), '--seeds', SEEDS, '--house'\]/.test(G) && /sbc\(\[BAKE, '--house', '--vclock'\]/.test(G)
      && /GATE-HOUSE PASS · /.test(G) && /GATE-HOUSE FAIL · /.test(G) && /process\.ppid!==P\|\|Date\.now\(\)>T/.test(G),
      '⓪ 게이트 글자 — 굽기(--make --house) → 견줌(--house --vclock) · 끝 줄 PASS/FAIL · 부하 고리는 부모 pid · 시한을 본다');
  }
  const A = ['--days', '20', '--seeds', '42'];
  //   ★[T1299 ④] `T1299_ONLY4=1` — 미끼 ④ 되풀이 판(바쁨 10 · 한가 10)용 좁힌 판: ⓪ ① ③ ④ 일곱 건만(② 벽시계 미끼 · ③ 틈 판 · ⑤ ⑥ 틈 미끼 뺌 · 판 줄임 · 값 무변)
  const ONLY4 = process.env.T1299_ONLY4 === '1';
  const [p, b] = await Promise.all([gate([...A, '--load', '1'], {}), ONLY4 ? null : gate(A, { T1043_BAIT: 'wall', NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${__filename}`.trim() })]);
  const pids = ((p.out.match(/부하 고리 pid ([\d ]+)/) || [])[1] || '').trim().split(/\s+/).filter(Boolean).map(Number);
  const tmpd = (p.out.match(/(\/[^\s]*gate-house-[A-Za-z0-9]+)\//) || [])[1];
  ok(p.code === 0 && /^GATE-HOUSE PASS · 벽시계 = 가상 시계 같음 1\/1 · /.test(p.last), '★① 판 자 기본 + 부하 고리 1 — 나감 0 · 끝 줄 PASS', p.last);
  ok(pids.length === 1 && pids.every((x) => !alive(x)) && !!tmpd && !fs.existsSync(tmpd), '① 판 뒤 — 부하 고리 남은 것 0 · 임시 판 폴더 지움', `고리 ${pids.join(',') || '?'} · 폴더 ${tmpd || '?'}`);
  if (!ONLY4) ok(b.code === 1 && /^GATE-HOUSE FAIL · 벽시계 ≠ 가상 시계 다름 1\/1 · /.test(b.last), '[미끼 · ②] 벽시계 굽기 아이만 다른 세계 — 나감 1 · 끝 줄 FAIL', b.last);
  // ③ ④ ★[T1268] 느린 틱 판 — 지금 판 초록 · 고치기 전 판(`T1258_ARTISAN_CLOCK=0`) 빨강 · 틱이 실제로 느렸다(끝 줄 틱 자 ↔ ① 넉넉한 판)
  const tick = (line) => { const m = (line || '').match(/틱 간격 p50 ([\d.]+)ms · 평균 ([\d.]+)ms · p95 ([\d.]+)ms · 본문 평균 ([\d.]+)ms · econ 날 ([\d.]+)ms\((\d+)틱(?: · 늦춘 틱 (\d+))?(?: · 머묾 멈춤 (\d+))?/);
    const ph = (line || '').match(/낮밤 (0시 고정|실제 시각)\(첫 날 게임 ([\d.]+)시\)/);
    return m ? { p50: +m[1], mean: +m[2], p95: +m[3], body: +m[4], day: +m[5], n: +m[6], stalled: +(m[7] || 0), dwell: +(m[8] || 0), phase0: !!ph && ph[1] === '0시 고정', hour0: ph ? +ph[2] : null } : null; };
  const [s, r] = await Promise.all([gate([...A, '--slow', '--slow-core', '0', ...(ONLY4 ? ['--gap', 'off'] : [])], {}), gate([...A, '--slow', '--slow-core', '1'], { T1258_ARTISAN_CLOCK: '0' })]);   // 코어 둘(서로 안 늦춘다 — 판마다 혼자 돈 판과 같은 조건)
  const T0 = tick(p.last), T1 = tick(s.last), T2 = tick(r.last);
  ok(s.code === 0 && /^GATE-HOUSE PASS · 벽시계 = 가상 시계 같음 1\/1 · /.test(s.last) && /느린 틱\(/.test(s.last), '★③ 느린 틱 판(지금 판 · 켬 기본) — 나감 0 · 끝 줄 PASS', s.last);
  ok(!!T0 && !!T1 && !!T2 && T1.stalled > 0 && T2.stalled > 0 && T1.mean > T0.mean && T1.day > T0.day && T2.day > T0.day,
    '③ 틱이 실제로 느렸다 — 느린 판 둘의 econ 날 벽시계 · 틱 간격 평균이 ① 넉넉한 판보다 길다(끝 줄 틱 자)',
    T0 && T1 && T2 ? `넉넉 간격 ${T0.mean}ms · 날 ${T0.day}ms ↔ 느림 간격 ${T1.mean}ms · 날 ${T1.day}ms(+${(T1.mean - T0.mean).toFixed(1)}ms) · 미끼 판 날 ${T2.day}ms` : '틱 자 없음');
  ok(!!T1 && !!T2 && T1.phase0 && T2.phase0 && T1.hour0 != null && T1.hour0 < 16.8 && T2.hour0 < 16.8 && T1.dwell > 0 && T2.dwell > 0,
    '★③ ④ 낮밤 0시 고정(T1287) — 굽기 판 둘 다 첫 날 게임 시각이 밤 앞 · 머묾 멈춤이 섰다(띄운 실제 시각과 무관)',
    T1 && T2 ? `③ 첫 날 ${T1.hour0}시 · 머묾 멈춤 ${T1.dwell} · ④ 첫 날 ${T2.hour0}시 · 머묾 멈춤 ${T2.dwell}` : '틱 자 없음');
  ok(r.code === 1 && /^GATE-HOUSE FAIL · 벽시계 ≠ 가상 시계 다름 1\/1 · /.test(r.last) && !!T2 && T2.dwell > 0, '[미끼 · ④] 느린 틱 판 + `T1258_ARTISAN_CLOCK=0`(고치기 전 장인 머묾 벽시계) — 나감 1 · 끝 줄 FAIL · 머묾 멈춤이 섰다(T1287)', r.last);
  // ⑤ ⑥ ★[T1299 · T1289 회부 3] 틈 판 — ③ 의 끝 줄에 붙은 틈 판이 정의대로(틈이 섰고 · 단조 · 경계 깨짐 0) · 틈 갈래 미끼 둘(T1282 · T1289 앞 글자)은 틈 판만으로 빨강
  const gapOf = (line) => { const m = (line || '').match(/틈 선 마감 (\d+) · 틈 틱 (\d+) · 틈 몸 틱 (\d+) · 틈 장인 걸음 (\d+) · 시계 잼 (\d+) · 단조 깨짐 (\d+)(?:\([^)]*\))? · 경계 어긋남 (\d+)\/(\d+)/);
    return m ? { closes: +m[1], ticks: +m[2], checks: +m[5], dec: +m[6], drift: +m[7], bound: +m[8] } : null; };
  if (!ONLY4) {
  const G1 = gapOf(s.last);
  ok(!!G1 && G1.ticks > 0 && G1.bound > 0 && G1.dec === 0 && G1.drift === 0, '★③ 틈 판(T1299) — 캐러밴 켬 벽시계 판에 마감 틈이 섰고 econ 날 시계가 정의대로(단조 깨짐 0 · 경계 어긋남 0)',
    G1 ? `틈 선 마감 ${G1.closes} · 틈 틱 ${G1.ticks} · 시계 잼 ${G1.checks} · 단조 깨짐 ${G1.dec} · 경계 어긋남 ${G1.drift}/${G1.bound}` : '틈 판 줄 없음');
  const BAIT = { NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${__filename}`.trim() };
  const [k1, g1] = await Promise.all([gate(['--seeds', '42', '--gap-only'], Object.assign({ T1043_BAIT: 'gapK1' }, BAIT)), gate(['--seeds', '42', '--gap-only'], Object.assign({ T1043_BAIT: 'gapG1' }, BAIT))]);
  const K1 = gapOf(k1.last), Gg = gapOf(g1.last);
  ok(k1.code === 1 && /^GATE-HOUSE FAIL · 틈 갈래 ≠ econ 날 시계 · /.test(k1.last) && !!K1 && K1.dec > 0, '[미끼 · ⑤] `gapK1`(T1282 앞 — 마감 중 econ 날 시계 = 그날 머리) — 틈 판이 나감 1 · 끝 줄 FAIL · 단조 깨짐 > 0', k1.last);
  ok(g1.code === 1 && /^GATE-HOUSE FAIL · 틈 갈래 ≠ econ 날 시계 · /.test(g1.last) && !!Gg && Gg.drift > 0, '[미끼 · ⑥] `gapG1`(T1289 앞 — 틈 `econDayToMs` 정렬 = 닫는 날) — 틈 판이 나감 1 · 끝 줄 FAIL · 경계 어긋남 > 0', g1.last);
  }
  console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
