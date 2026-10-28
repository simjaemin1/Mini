#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly C   ← 야간 분할(T238) — 실서버 판 셋(판당 1~2분)
// === scripts/test-t986-bandit-day.js — 도적 하루가 econ 날 자리(날을 올린 머리 바로 뒤)에서 돌면 **두 시계가 같은 자리를 본다** · 벽시계 판 = 가상 시계 판(T986 · 2026-10-28) =====
//
// 판정 사본 0: 진짜 서버 판 자(`t577-server-run.js` — 하루 250ms · 서버 기준선 자 조건 `VILLAGE_CARAVAN_MAX=0` · `T400_BUILD_ACT=0` · 쉼터 `T969_SHELTER_DAY=1`)를
//   시드 42 로 40일 세 판(벽시계 켬 · 가상 시계 켬 · 가상 시계 끔) 띄우고 관찰기(`t986-bandit-witness.js` — 읽기만)가 남긴 것을 본다:
//   도적 하루마다 부른 길(존 틱 · 하루 마감) · 날 올림(econ `head`) 뒤 그때까지 결산한 마을 수 · 그 앞 econ 마을 상태 지문.
//   지키는 것:
//     ① `T986_BANDIT_DAY=1` — 두 시계 다 도적 하루가 날마다 하루 마감 자리(`dayTick`)에서 돌고, 머리 뒤 결산 수 = **0**(날을 올린 머리 바로 뒤 · 마을 조각 앞)
//     ② 그리고 두 판의 판 JSON 이 **바이트 같다**
//     ③ ★자명 통과 금지 — 끔(종전 · 존 틱이 부른다)이면 가상 시계 판(결정론)에서도 도적 하루는 머리가 든 틱 **끝**에 돈다 —
//        그 틱에 든 마을 결산 뒤(머리 뒤 결산 수 > 0 인 날이 있다) · 길 = 틱. 벽시계 판에선 그 수가 틱 몫 · 밀림에 달린다(보고 T986 §2)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't986bd-'));
const DAYS = 40, SEED = 42;
function collect(dir) {
  let json = null, wit = null;
  try { json = fs.readFileSync(path.join(dir, `base-${SEED}.json`)); } catch (e) {}
  try { wit = JSON.parse(fs.readFileSync(path.join(dir, `base-${SEED}.t986.json`), 'utf8')); } catch (e) {}
  return { json, wit };
}
function run(tag, env) {
  return new Promise((resolve) => {
    const dir = path.join(TMP, tag);
    const E = Object.assign({}, process.env, { VILLAGE_CARAVAN_MAX: '0', T400_BUILD_ACT: '0', T969_SHELTER_DAY: '1', T577_DIR: dir, T577_TAG: 'base', T577_PAR: '1' }, env);
    if (!env.T745_VCLOCK) delete E.T745_VCLOCK;
    if (!env.T986_BANDIT_DAY) delete E.T986_BANDIT_DAY;
    //   관찰기를 가상 시계보다 앞에(t969-trace 와 같은 차례) — 읽기만
    E.NODE_OPTIONS = `--require ${path.join(__dirname, 't986-bandit-witness.js')}` + (env.T745_VCLOCK ? ` --require ${path.join(__dirname, 't745-vclock.js')}` : '');
    const ch = spawn(process.execPath, [path.join(__dirname, 't577-server-run.js'), String(DAYS), String(SEED)], { cwd: ROOT, env: E, stdio: 'ignore' });
    ch.on('exit', () => resolve(collect(dir)));
  });
}
// 도적 하루마다 — [견준 날 수, 머리 뒤 결산 0 인 날 수, 결산 수 > 0 인 날 수, 길 셈]
function match(w) {
  if (!w) return { n: 0, zero: 0, pos: 0, via: {} };
  let n = 0, zero = 0, pos = 0; const via = {};
  for (const [, [, v, k]] of Object.entries(w.bandit)) { via[v] = (via[v] || 0) + 1; n++; if (k === 0) zero++; else if (k > 0) pos++; }
  return { n, zero, pos, via };
}
(async () => {
  console.log(`\n=== 도적 하루 econ 날 자리 — 벽시계 · 가상 시계(T986 · 시드 ${SEED} · ${DAYS}일) ===`);
  const [w1, v1, v0] = await Promise.all([run('wall-on', { T986_BANDIT_DAY: '1' }), run('vc-on', { T986_BANDIT_DAY: '1', T745_VCLOCK: '1' }), run('vc-off', { T745_VCLOCK: '1' })]);
  const mw = match(w1.wit), mv = match(v1.wit), m0 = match(v0.wit);
  ok(mw.n >= DAYS - 3 && mv.n >= DAYS - 3 && m0.n >= DAYS - 3, '[상황] 세 판 다 도적 하루가 날마다 돌았고 관찰기가 그 자리를 적었다(못 읽으면 아래가 자명 통과다)', `견준 날 벽 켬 ${mw.n} · 가 켬 ${mv.n} · 가 끔 ${m0.n}`);
  ok(mw.zero === mw.n && mv.zero === mv.n && !mw.via.tick && !mv.via.tick && mw.via.day === mw.n && mv.via.day === mv.n,
    '★① 켬 — 두 시계 다 도적 하루가 하루 마감 자리(`dayTick`)에서 돌고, 머리 뒤 결산 수 = 0(날을 올린 머리 바로 뒤 · 날마다)', `벽 ${mw.zero}/${mw.n} · 가 ${mv.zero}/${mv.n} · 길 ${JSON.stringify(mw.via)} ${JSON.stringify(mv.via)}`);
  ok(!!(w1.json && v1.json) && Buffer.compare(w1.json, v1.json) === 0, '★② 켬 — 판 JSON 바이트 같음(벽시계 = 가상 시계)', w1.json && v1.json ? `${w1.json.length} B` : '판 JSON 없음');
  ok(m0.n > 0 && m0.pos >= 1 && m0.via.tick === m0.n && !m0.via.day,
    '[미끼 · ③] 끔(종전 · 존 틱) — 가상 시계 판에서도 도적 하루는 머리가 든 틱 끝에 돈다(그 틱에 든 마을 결산 뒤 — 결산 수 > 0 인 날이 있다)', `결산 수 > 0 ${m0.pos}/${m0.n} · 0 ${m0.zero} · 길 ${JSON.stringify(m0.via)}`);
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
