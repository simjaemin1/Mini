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
//   진짜 벽시계 자리 미끼(`T146_BUILD_MS=1 T1013_BAND_DAY=0` — 사냥터 짓기를 내일로)는 날 281 에야 갈려 짧은 판에 안 닿는다 — 400날 판은 보고/T1043 §3.
//   ★[T1289] 마감 틈 갈래 미끼(프리로드 갈래 `T1043_BAIT=gapK1|gapG1` — 손 확인용 · 이 하네스 단언 밖): 느린 틱 판(`--slow`)에 실어도 둘 다 PASS 였다(2026-11-12 ·
//     `계측/T1289_2026-11-12/게이트_미끼.txt`) — 판 자(`--house` · 캐러밴 0)의 지문에 틈 갈래 자리(기온 · 달력 · 장인 틈 걸음)가 안 닿는다. 틈 갈래는 `test-t1273-clock-rest` ⑤ ⑦ 이 잡는다.
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
  const [p, b] = await Promise.all([gate([...A, '--load', '1'], {}), gate(A, { T1043_BAIT: 'wall', NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${__filename}`.trim() })]);
  const pids = ((p.out.match(/부하 고리 pid ([\d ]+)/) || [])[1] || '').trim().split(/\s+/).filter(Boolean).map(Number);
  const tmpd = (p.out.match(/(\/[^\s]*gate-house-[A-Za-z0-9]+)\//) || [])[1];
  ok(p.code === 0 && /^GATE-HOUSE PASS · 벽시계 = 가상 시계 같음 1\/1 · /.test(p.last), '★① 판 자 기본 + 부하 고리 1 — 나감 0 · 끝 줄 PASS', p.last);
  ok(pids.length === 1 && pids.every((x) => !alive(x)) && !!tmpd && !fs.existsSync(tmpd), '① 판 뒤 — 부하 고리 남은 것 0 · 임시 판 폴더 지움', `고리 ${pids.join(',') || '?'} · 폴더 ${tmpd || '?'}`);
  ok(b.code === 1 && /^GATE-HOUSE FAIL · 벽시계 ≠ 가상 시계 다름 1\/1 · /.test(b.last), '[미끼 · ②] 벽시계 굽기 아이만 다른 세계 — 나감 1 · 끝 줄 FAIL', b.last);
  // ③ ④ ★[T1268] 느린 틱 판 — 지금 판 초록 · 고치기 전 판(`T1258_ARTISAN_CLOCK=0`) 빨강 · 틱이 실제로 느렸다(끝 줄 틱 자 ↔ ① 넉넉한 판)
  const tick = (line) => { const m = (line || '').match(/틱 간격 p50 ([\d.]+)ms · 평균 ([\d.]+)ms · p95 ([\d.]+)ms · 본문 평균 ([\d.]+)ms · econ 날 ([\d.]+)ms\((\d+)틱(?: · 늦춘 틱 (\d+))?/);
    return m ? { p50: +m[1], mean: +m[2], p95: +m[3], body: +m[4], day: +m[5], n: +m[6], stalled: +(m[7] || 0) } : null; };
  const [s, r] = await Promise.all([gate([...A, '--slow', '--slow-core', '0'], {}), gate([...A, '--slow', '--slow-core', '1'], { T1258_ARTISAN_CLOCK: '0' })]);   // 코어 둘(서로 안 늦춘다 — 판마다 혼자 돈 판과 같은 조건)
  const T0 = tick(p.last), T1 = tick(s.last), T2 = tick(r.last);
  ok(s.code === 0 && /^GATE-HOUSE PASS · 벽시계 = 가상 시계 같음 1\/1 · /.test(s.last) && /느린 틱\(/.test(s.last), '★③ 느린 틱 판(지금 판 · 켬 기본) — 나감 0 · 끝 줄 PASS', s.last);
  ok(!!T0 && !!T1 && !!T2 && T1.stalled > 0 && T2.stalled > 0 && T1.mean > T0.mean && T1.day > T0.day && T2.day > T0.day,
    '③ 틱이 실제로 느렸다 — 느린 판 둘의 econ 날 벽시계 · 틱 간격 평균이 ① 넉넉한 판보다 길다(끝 줄 틱 자)',
    T0 && T1 && T2 ? `넉넉 간격 ${T0.mean}ms · 날 ${T0.day}ms ↔ 느림 간격 ${T1.mean}ms · 날 ${T1.day}ms(+${(T1.mean - T0.mean).toFixed(1)}ms) · 미끼 판 날 ${T2.day}ms` : '틱 자 없음');
  ok(r.code === 1 && /^GATE-HOUSE FAIL · 벽시계 ≠ 가상 시계 다름 1\/1 · /.test(r.last), '[미끼 · ④] 느린 틱 판 + `T1258_ARTISAN_CLOCK=0`(고치기 전 장인 머묾 벽시계) — 나감 1 · 끝 줄 FAIL', r.last);
  console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
