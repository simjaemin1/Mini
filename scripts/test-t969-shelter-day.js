#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly C   ← 야간 분할(T238) — 실서버 판 셋(판당 2~3분)
// === scripts/test-t969-shelter-day.js — 쉼터 백필이 econ 날 자리에서 서면 **벽시계 판 = 가상 시계 판**(T969 · 2026-10-28) =====================
//
// 판정 사본 0: 진짜 서버 판 자(`t577-server-run.js` — 하루 250ms · 서버 기준선 자 조건 `VILLAGE_CARAVAN_MAX=0` · `T400_BUILD_ACT=0`)를 시드 42 로 61일
//   벽시계 · 가상 시계(`t745-vclock`) 두 판 띄워 판 JSON 과 쉼터가 선 날(존 기록 `🛖 공용 쉼터 백필` 줄 앞의 econ 날)을 본다.
//   지키는 것:
//     ① `T969_SHELTER_DAY=1` — 두 판의 쉼터가 같은 econ 날에 선다(첫 판 = ⌈15,000 ms ÷ 250 ms⌉ = 60 째 마감 · 그 줄 앞 마지막 `마을 econ day` 줄은 59)
//     ② 그리고 두 판의 판 JSON 이 **바이트 같다**(econ · 마을 칸 · 판 끝 수)
//     ③ ★자명 통과 금지 — 끔(종전 벽시계 타이머)이면 벽시계 판의 쉼터가 켬 판과 다른 날에 선다(기동 · 마감이 실제 시간을 먹는다 — 이 판이 잡은 갈림의 첫 칸)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't969sd-'));
const DAYS = 61, SEED = 42;
function collect(dir) {   // 판 JSON 과 쉼터가 선 날(백필 줄 앞 가장 가까운 `마을 econ day N` 줄의 N)
  let json = null, day = null;
  try { json = fs.readFileSync(path.join(dir, `base-${SEED}.json`)); } catch (e) {}
  try {
    const L = fs.readFileSync(path.join(dir, `base-${SEED}.log`), 'utf8').split('\n');
    const i = L.findIndex((l) => /공용 쉼터 백필 — \d+곳에 세웠다/.test(l));
    if (i >= 0) for (let j = i; j >= 0; j--) { const m = /마을 econ day (\d+)/.exec(L[j]); if (m) { day = +m[1]; break; } }
  } catch (e) {}
  return { json, day };
}
function run(tag, env) {
  return new Promise((resolve) => {
    const dir = path.join(TMP, tag);
    const E = Object.assign({}, process.env, { VILLAGE_CARAVAN_MAX: '0', T400_BUILD_ACT: '0', T577_DIR: dir, T577_TAG: 'base', T577_PAR: '1' }, env);
    if (!env.T745_VCLOCK) delete E.T745_VCLOCK;
    if (!env.T969_SHELTER_DAY) delete E.T969_SHELTER_DAY;
    E.NODE_OPTIONS = env.T745_VCLOCK ? `--require ${path.join(__dirname, 't745-vclock.js')}` : '';
    //   판 자는 스스로 닫히는 판(T577_DAYS) — 끝(exit)을 기다린다(판 자 안에서 존 준비 증인 `FB.waitUp` 이 기동을 본다)
    const ch = spawn(process.execPath, [path.join(__dirname, 't577-server-run.js'), String(DAYS), String(SEED)], { cwd: ROOT, env: E, stdio: 'ignore' });
    ch.on('exit', () => resolve(collect(dir)));
  });
}
(async () => {
  console.log(`\n=== 쉼터 백필 econ 날 자리 — 벽시계 · 가상 시계(T969 · 시드 ${SEED} · ${DAYS}일) ===`);
  const [w1, v1] = await Promise.all([run('wall-on', { T969_SHELTER_DAY: '1' }), run('vc-on', { T969_SHELTER_DAY: '1', T745_VCLOCK: '1' })]);
  ok(w1.day != null && w1.day === v1.day && w1.day === 59, '★① 켬 — 두 판의 쉼터가 같은 econ 날(60 째 마감 — 앞 요약 줄 59)에 선다', `벽시계 ${w1.day} · 가상 시계 ${v1.day}`);
  ok(!!(w1.json && v1.json) && Buffer.compare(w1.json, v1.json) === 0, '★② 켬 — 판 JSON 바이트 같음(벽시계 = 가상 시계)', w1.json && v1.json ? `${w1.json.length} B` : '판 JSON 없음');
  const w0 = await run('wall-off', {});
  ok(w0.day != null && w0.day !== w1.day, '[미끼 · ③] 끔(종전 벽시계 타이머) — 벽시계 판 쉼터는 켬 판과 다른 날(이 갈림의 첫 칸)', `벽시계 끔 ${w0.day} ↔ 켬 ${w1.day}`);
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
