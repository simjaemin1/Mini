#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly C   ← 야간 분할(T238) — 실서버 판 둘(판당 1분 안팎)
// === scripts/test-t1013-band-day.js — 사냥터 짓기를 그날 안에(`T1013_BAND_DAY`) · 판 자 기본 켬(T1013 · 2026-10-31) ==========================
//
// 판정 사본 0: 진짜 서버 판 자(`t577-server-run.js` — 하루 250ms · 서버 기준선 자 조건 `VILLAGE_CARAVAN_MAX=0` · 집 행위 켬)를 시드 42 로 20일,
//   사냥터 짓기 몫을 있던 손잡이 `T146_BUILD_MS=1`(마을 하루치 1ms)로 줄여 띄운다 — 큰 마을 띠가 하루 몫을 넘게 만든다(부하 판의 꼴을 몫으로 세운다).
//   관찰은 프리로드(이 파일 자신 · 읽기만)가 판 끝에 `villages.t1013Stat()`(몫이 바닥난 마을-날 · 같은 날 이어 지은 번 · 내일로 넘긴 마을-날)를 적는 것뿐이다.
//   지키는 것:
//     ⓪ 정적 — 제품 손잡이 글자 `T1013_BAND_DAY = process.env.T1013_BAND_DAY === '1'` 하나(끔 기본) · 판 자 아이 기본 `1`(부르는 값 먼저)
//     ① 켬(판 자 기본 · env 미설정) — 몫이 바닥난 날이 있는데(자명 통과 금지) **내일로 넘긴 마을-날 0** · 같은 날 이어 지은 번 > 0
//     ② ★미끼 — 끔(`T1013_BAND_DAY=0`)이면 같은 판에서 내일로 넘긴 마을-날 > 0 (= 다 짓는 날이 몫 · CPU 에 달린다 · 보고/T1013 §2)
'use strict';
if (require.main !== module && !process.env.T577_SEED) return;   // ★프리로드로 실렸는데 아이 존이 아니면(판 자 부모 · 러너) 아무것도 안 한다 — 본문이 돌면 판이 판을 낳는다
// ── 프리로드 갈래(아이 존 — 읽기만) ──
if (process.env.T1013_STAT_OUT && process.env.T577_SEED && require.main !== module) {
  const path = require('path'), fs = require('fs');
  process.on('exit', () => { try { const V = require(path.join(__dirname, '..', 'server', 'villages.js')); fs.writeFileSync(process.env.T1013_STAT_OUT, JSON.stringify(V.t1013Stat ? V.t1013Stat() : null)); } catch (e) {} });
  return;
}
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't1013bd-'));
const DAYS = 20, SEED = 42;
function run(tag, env) {
  return new Promise((resolve) => {
    const dir = path.join(TMP, tag), out = path.join(TMP, tag + '.stat.json');
    const E = Object.assign({}, process.env, { VILLAGE_CARAVAN_MAX: '0', T400_BUILD_ACT: '1', T146_BUILD_MS: '1', T577_DIR: dir, T577_TAG: 'base', T577_PAR: '1', T1013_STAT_OUT: out }, env);
    if (!('T1013_BAND_DAY' in env)) delete E.T1013_BAND_DAY;
    delete E.T745_VCLOCK;
    E.NODE_OPTIONS = `--require ${__filename}`;
    const ch = spawn(process.execPath, [path.join(__dirname, 't577-server-run.js'), String(DAYS), String(SEED)], { cwd: ROOT, env: E, stdio: 'ignore' });
    ch.on('exit', () => { let st = null; try { st = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) {} resolve(st); });
  });
}
(async () => {
  console.log(`\n=== 사냥터 짓기 그날 안에 — T1013_BAND_DAY(시드 ${SEED} · ${DAYS}일 · T146_BUILD_MS=1) ===`);
  {
    const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const R = fs.readFileSync(path.join(ROOT, 'scripts', 't577-server-run.js'), 'utf8');
    const n = (V.match(/process\.env\.T1013_BAND_DAY/g) || []).length;
    ok(/const T1013_BAND_DAY = process\.env\.T1013_BAND_DAY !== '0';/.test(V) && n === 1
      && /const KID_BAND = process\.env\.T1013_BAND_DAY != null \? process\.env\.T1013_BAND_DAY : '1';/.test(R) && /T1013_BAND_DAY: KID_BAND,/.test(R),
      "⓪ 손잡이 — 제품 `!== '0'` 하나(켬 기본 · ★재민 11-01 · PM land1036) · 판 자 아이 기본 `1`(부르는 값 먼저)", `env 읽기 ${n}`);
  }
  const [on, off] = await Promise.all([run('on', {}), run('off', { T1013_BAND_DAY: '0' })]);
  ok(!!(on && on.on === true && on.short > 0 && on.carry === 0 && on.resume > 0),
    '★① 켬(판 자 기본) — 몫이 바닥난 마을-날이 있는데 내일로 넘긴 마을-날 0 · 같은 날 이어 지었다', JSON.stringify(on));
  ok(!!(off && off.on === false && off.carry > 0 && off.resume === 0),
    '[미끼 · ②] 끔(`=0`) — 같은 판에서 내일로 넘긴 마을-날이 있다(다 짓는 날이 몫에 달린다)', JSON.stringify(off));
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
