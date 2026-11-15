#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1308-resume.js — 이어 도는 판 자(T1308): 끊겨도 같은 답 ==========================================================
//
// ★무엇을 보나(서버 판 자 조건 · 가상 시계 · 시드 1020 · 10날 · 마디 5날 — 판 넷)
//   ① 이은 판 — 5날 + 5날(체크포인트 한 번)이 끝까지 돈다 · 판 JSON 10날 · 날 줄 10(판 자 누계가 마디를 넘는다) · 마디 둘.
//   ② 끊긴 판 = 안 끊긴 판 — 5날 마디가 저장 없이 죽고(`--crash-at 5`) 판 자가 코드 3 으로 멈춘 뒤 `--resume` 으로 이은 판이
//      ① 과 econ 날 지문 · 마을 칸 지문 · 몸 자리 지문 · 판 JSON 이 **10/10 같다**(체크포인트에서 다시 도니까).
//   ③ 미끼 — 다시 뜬 마디에서 econ 난수 상태를 덮은 사본(`T1308_BAIT_RNG=1` = "난수 상태를 안 잇는 사본")은 ① 과 econ 지문이 갈린다(빨강이어야 한다).
//   ④ 한 번에 돈 판(10날 마디 하나)과 ① 의 차는 기록만 한다(판정 아님 — 제품 재기동이 잃는 서버 마을 칸 · 몸 자리 · 보고 T1308 §2 · 회부).
//   ⑤ 같은 폴더에 다른 판을 부르면 덮지 않는다(코드 2).
// 실행: node scripts/test-t1308-resume.js   (판 넷 · 동시 둘 · 약 6 ~ 8분)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 't1308-'));
const ENV = Object.assign({}, process.env, {
  T400_BUILD_ACT: '0', VILLAGE_CARAVAN_MAX: '0', T745_VCLOCK: '1',
  NODE_OPTIONS: ['t650-print.js', 't1308-bodyprint.js'].map((f) => `-r ${path.join(__dirname, f)}`).join(' '),
});
delete ENV.T1308_BAIT_RNG; delete ENV.T1308_KEEP;
const run = (args, extra) => new Promise((res) => {
  const c = spawn(process.execPath, [path.join(__dirname, 't1308-long-run.js'), ...args], { env: Object.assign({}, ENV, extra || {}), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  c.on('exit', (code) => res({ code, out }));
});
const cmp = (a, b) => JSON.parse((() => { const j = path.join(BASE, `cmp-${path.basename(a)}-${path.basename(b)}.json`); execFileSync(process.execPath, [path.join(__dirname, 't1308-cmp.js'), a, b, '--json', j], { stdio: 'ignore' }); return fs.readFileSync(j, 'utf8'); })());
const D = (n) => path.join(BASE, n);
const full = (r) => r && r.both > 0 && r.same === r.both;

(async () => {
  console.log(`\n=== T1308 이어 도는 판 자 — 끊겨도 같은 답 (${BASE}) ===`);
  const [X, Y1] = await Promise.all([
    run(['10', '1020', '--every', '5', '--tag', 'X', '--dir', D('X')]),
    run(['10', '1020', '--every', '5', '--tag', 'Y', '--dir', D('Y'), '--crash-at', '5']),
  ]);
  console.log('\n① 이은 판');
  const PX = JSON.parse(fs.readFileSync(path.join(D('X'), 'progress.json'), 'utf8'));
  const JX = JSON.parse(fs.readFileSync(path.join(D('X'), 'X-1020.json'), 'utf8'));
  ok(X.code === 0 && PX.done && PX.segs.length === 2, '5날 + 5날 — 끝까지 돌았다(마디 둘)', `코드 ${X.code} · 마디 ${PX.segs.map((s) => s.from + '→' + s.to).join(' · ')}`);
  ok(JX.days === 10 && JX.rows.length === 10 && JX.rows[0][0] === 1 && JX.rows[9][0] === 10, '판 JSON — 10날 · 날 줄 10(앞 마디 누계를 이어 받았다)', `${JX.days}날 · 줄 ${JX.rows.length}`);

  console.log('\n② 끊긴 판 = 안 끊긴 판');
  ok(Y1.code === 3, '5날 마디가 저장 없이 죽으면 판 자가 코드 3 으로 멈춘다(체크포인트 날 0 그대로)', `코드 ${Y1.code}`);
  const Y2 = await run(['--resume', D('Y')]);
  const PY = JSON.parse(fs.readFileSync(path.join(D('Y'), 'progress.json'), 'utf8'));
  ok(Y2.code === 0 && PY.done && PY.crashDone, '`--resume` 으로 이어 끝까지', `코드 ${Y2.code}`);
  const RY = cmp(D('X'), D('Y'));
  ok(full(RY.econ) && RY.econ.both === 10, 'econ 날 지문 10/10 같음', `${RY.econ && RY.econ.same}/${RY.econ && RY.econ.both}`);
  ok(full(RY.side), '마을 칸 지문 같음', `${RY.side && RY.side.same}/${RY.side && RY.side.both}`);
  ok(full(RY.body), '몸 자리 지문 같음', `${RY.body && RY.body.same}/${RY.body && RY.body.both}`);
  ok(RY.runJson && RY.runJson.same, '판 JSON 같음(판 조건 칸 빼고)', RY.runJson ? RY.runJson.diff.join(' · ') : '');

  console.log('\n③ 미끼 · ④ 기록 · ⑤ 덮지 않음');
  const [Z, S] = await Promise.all([
    run(['10', '1020', '--every', '5', '--tag', 'Z', '--dir', D('Z')], { T1308_BAIT_RNG: '1' }),
    run(['10', '1020', '--every', '10', '--tag', 'S', '--dir', D('S')]),
  ]);
  const RZ = cmp(D('X'), D('Z'));
  ok(Z.code === 0 && RZ.econ && RZ.econ.same < RZ.econ.both, '[미끼] 다시 뜬 마디에서 econ 난수 상태를 덮은 사본은 econ 지문이 갈린다', `${RZ.econ && RZ.econ.same}/${RZ.econ && RZ.econ.both} · 첫 갈림 ${RZ.econ && RZ.econ.first}`);
  const RS = cmp(D('S'), D('X'));
  console.log(`  · (기록 — 판정 아님) 한 번에 돈 10날 : 5날 + 5날 — econ ${RS.econ && RS.econ.same}/${RS.econ && RS.econ.both} · 마을 칸 ${RS.side && RS.side.same}/${RS.side && RS.side.both} · 몸 자리 ${RS.body && RS.body.same}/${RS.body && RS.body.both}` +
    ` · 갈린 마을 칸 ${Object.keys(RS.sideFields || {}).slice(0, 8).join(' ')}`);
  ok(S.code === 0, '한 번에 돈 판(마디 하나)도 같은 자로 끝까지', `코드 ${S.code}`);
  const W = await run(['12', '1020', '--every', '5', '--tag', 'X', '--dir', D('X')]);
  ok(W.code === 2, '같은 폴더에 다른 판(12날)을 부르면 덮지 않는다(코드 2)', `코드 ${W.code}`);

  console.log(`\n=== T1308 결과: ${pass} 통과 · ${fail} 실패 ===`);
  if (!fail) fs.rmSync(BASE, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
