#!/usr/bin/env node
'use strict';
// @regress
// @bait 3
// === scripts/test-t1425-ruler.js — 자(us-line · t646 표)의 분자 · 분모 · 틱 비용 줄(T1425 ①) ===
//   판을 띄우지 않는다 — T1415 자 판 하나(`계측/T1415_2026-11-21/ruler/main1.json` · 표본 줄 `lines-main1.jsonl.gz`)를 틀로 삼아
//   지금 `scripts/t646-anatomy.js table` · `scripts/us-line.js line` 사본을 임시 폴더에서 돈다(레포 무접촉).
//   ① 옛 "걸음 µs" = 결정 문 구간 µs/사람 × (CPU 표본 중 `npcStep` 표본 ÷ 결정 문 고리 표본) — 하네스가 표본 줄을 따로 더해 같은 값인가
//      · 결정 문 µs/사람 = 결정 문 구간 ms 합 ÷ 틱 ÷ 사람 · 틱 µs/사람 = 구간 합 ÷ 틱 ÷ 사람(구간 합 = 틱 본문)
//   ② 새 줄(틱 비용) — 틱 ms = 틱 µs/사람 × 사람 ÷ 1000 · 몸 µs = 결정 문 + 커널 준비 + 이동 문 µs/사람 · 덩이 표 합 = 틱 ms
//   ③ 왜 반대로 가나 — 같은 판에서 `npcStep` 표본만 반으로(건너뛴 몸이 걸음 몸통을 안 부른다) ⇒ 옛 걸음 µs 는 반 · 틱 ms · 몸 µs 는 그대로
//      (건너뛴 몸은 분모(사람)에 남고 분자(npcStep 표본)에서 빠진다 — 옛 줄은 틱 비용과 같이 움직이지 않는다)
//   ★미끼 셋 [T1356 규약]: ⓐ 분자 · 분모를 바꿔 낀 t646 사본(npcStep ÷ 결정 → 결정 ÷ npcStep) → ① 빨강
//     ⓑ 건너뛴 몸을 분모에서 뺀 us-line 사본(틱 ms 를 연 몸 수로 — 사람 × npcStep/결정) → ② 빨강
//     ⓒ 표본기 몫을 틱 줄에 섞은 us-line 사본(틱 ms 에 걸음 µs × 사람을 더한다 — 자 탓을 틱 비용으로 읽는 꼴) → ② 빨강
//   날짜 · 벽시계를 안 쓴다(판 파일의 수만).
const path = require('path'), fs = require('fs'), os = require('os'), zlib = require('zlib'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m + (d !== undefined ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ' + d : '')); } };
const FX = path.join(ROOT, '계측', 'T1415_2026-11-21', 'ruler');
const T646 = fs.readFileSync(path.join(ROOT, 'scripts', 't646-anatomy.js'), 'utf8'), USL = fs.readFileSync(path.join(ROOT, 'scripts', 'us-line.js'), 'utf8'), RULE = fs.readFileSync(path.join(ROOT, 'scripts', 'lib-tick-rule.js'), 'utf8');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't1425-ruler-'));
// 판 하나를 임시 폴더에 — 표본 줄은 `nsScale` 배(걸음 몸통 표본만) · 고친 사본 셋으로 표 · 줄을 낸다
function world(name, opt) {
  const D = path.join(TMP, name), S = path.join(D, 'scripts'), P = path.join(D, 'pan'); fs.mkdirSync(S, { recursive: true }); fs.mkdirSync(P, { recursive: true });
  fs.writeFileSync(path.join(S, 't646-anatomy.js'), opt.t646 || T646); fs.writeFileSync(path.join(S, 'us-line.js'), opt.usl || USL); fs.writeFileSync(path.join(S, 'lib-tick-rule.js'), RULE);
  const j = JSON.parse(fs.readFileSync(path.join(FX, 'main1.json'), 'utf8')), L = path.join(P, 'lines-main1.jsonl');
  const lines = zlib.gunzipSync(fs.readFileSync(path.join(FX, 'lines-main1.jsonl.gz'))).toString('utf8').trim().split('\n').map((x) => JSON.parse(x));
  if (opt.nsScale !== undefined) for (const c of lines) { c.ns = Math.round(c.ns * opt.nsScale); c.nsSelf = Math.round(c.nsSelf * opt.nsScale); }
  fs.writeFileSync(L, lines.map((x) => JSON.stringify(x)).join('\n') + '\n');
  j.lines.file = L; j.tag = 'fx1'; fs.writeFileSync(path.join(P, 'fx1.json'), JSON.stringify(j));
  const r = spawnSync(process.execPath, [path.join(S, 'us-line.js'), 'line', '--dir', P, '--arm', 'fx', '--seg'], { cwd: D, encoding: 'utf8', maxBuffer: 1 << 28 });
  const T = JSON.parse(fs.readFileSync(path.join(P, 'table.json'), 'utf8')), U = JSON.parse(fs.readFileSync(path.join(P, 'us-line.json'), 'utf8'));
  return { j, lines, T, U, out: r.stdout || '', err: r.stderr || '' };
}
// 하네스가 따로 센 값(판 파일에서 바로)
function mine(W) {
  const w = W.j.windows.find((x) => x.W === 'day'), A = { n: 0, popN: 0, seg: {} };
  for (const sl of w.slices) for (const x of sl.ana) { A.n += x.n; A.popN += x.popN; for (const [k, v] of Object.entries(x.seg)) A.seg[k] = (A.seg[k] || 0) + v; }
  const pop = A.popN / A.n, us = (ms) => ms / A.n * 1000 / pop;
  const lo = Math.min(...w.slices.map((x) => x.mt0)), hi = Math.max(...w.slices.map((x) => x.mt1));
  let ns = 0, dec = 0; for (const c of W.lines) if (c.t0 >= lo && c.t1 <= hi) { ns += c.ns; dec += c.dec; }
  const decUs = us(A.seg['결정 문(순회)']), segSum = us(Object.values(A.seg).reduce((s, v) => s + v, 0));
  return { pop: Math.round(pop), decUs, stepUs: dec ? decUs * ns / dec : 0, segSum, tickMs: segSum * Math.round(pop) / 1000,
    bodyUs: us(A.seg['결정 문(순회)']) + us(A.seg['화살·걸음 커널 준비']) + us(A.seg['이동 문(순회)']), ns, dec };
}
const near = (a, b, e) => a != null && b != null && Math.abs(a - b) <= (e || 0.0015) * Math.max(1, Math.abs(b));
function check(W) {
  const M = mine(W), r = W.T.runs.find((x) => x.W === 'day'), u = W.U[0];
  const step = r && (r.live ? r.live.stepUs : r.lines && r.lines.stepUs);
  return { M, r, u, c1: !!r && near(r.segUs['결정 문(순회)'], M.decUs) && near(step, M.stepUs, 0.003) && near(r.segSumUs, M.segSum),
    c2: !!u && !!u.tick && near(u.tick.day.ms, M.tickMs, 0.003) && near(u.tick.day.body, M.bodyUs, 0.003) && near(Object.values(u.tick.segDay).reduce((s, v) => s + v, 0), M.tickMs, 0.003), step };
}

console.log('== ① 옛 걸음 µs · 결정 문 µs · 틱 µs — 분자 · 분모');
const W0 = world('base', {}), C0 = check(W0);
ok(!!C0.r && C0.M.dec > 0 && C0.M.ns > 0, '[전제] 틀 판에 낮 창 · 결정 문 고리 표본 · npcStep 표본이 있다(0 이면 아래가 공짜)', `몸 ${C0.M.pop} · 결정 표본 ${C0.M.dec} · npcStep 표본 ${C0.M.ns}`);
ok(C0.c1, '표 = 하네스 셈 — 결정 문 µs/사람 · 걸음 µs(= 결정 문 µs × npcStep 표본 ÷ 결정 표본) · 틱 µs/사람(구간 합)', `결정 ${C0.r && C0.r.segUs['결정 문(순회)']} ↔ ${C0.M.decUs.toFixed(3)} · 걸음 ${C0.step} ↔ ${C0.M.stepUs.toFixed(3)} · 틱 ${C0.r && C0.r.segSumUs} ↔ ${C0.M.segSum.toFixed(3)}`);
console.log('== ② 새 줄 — 틱 ms · 몸 µs · 덩이 표');
ok(C0.c2, '틱 ms = 틱 µs × 몸 ÷ 1000 · 몸 µs = 결정 + 커널 준비 + 이동 · 덩이 표 합 = 틱 ms', C0.u && C0.u.tick ? `틱 ${C0.u.tick.day.ms.toFixed(3)} ↔ ${C0.M.tickMs.toFixed(3)} ms · 몸 ${C0.u.tick.day.body.toFixed(3)} ↔ ${C0.M.bodyUs.toFixed(3)}` : '줄 없음');
ok(/틱 · 낮 [\d.]+ ms \[/.test(W0.out) && /\| \*\*합\*\* \|/.test(W0.out), '`line` 이 틱 줄과 덩이 표(합 줄)를 찍는다');
console.log('== ③ 건너뛴 몸 — 옛 줄만 내려간다');
const W1 = world('skip', { nsScale: 0.5 }), C1 = check(W1);
ok(C1.c1 && near(C1.step, C0.step * 0.5, 0.01) && near(C1.u.tick.day.ms, C0.u.tick.day.ms, 1e-9) && near(C1.u.tick.day.body, C0.u.tick.day.body, 1e-9),
  '걸음 몸통 표본 반(건너뛴 몸) ⇒ 걸음 µs 반 · 틱 ms · 몸 µs 그대로 — 옛 줄은 분모(사람)에 건너뛴 몸을 남긴 채 분자만 준다', `걸음 ${C0.step} → ${C1.step} · 틱 ${C0.u.tick.day.ms.toFixed(3)} → ${C1.u.tick.day.ms.toFixed(3)} ms`);

console.log('== 미끼 셋');
const bait = (src, a, b) => { const n = src.split(a).length - 1; return { n, src: n === 1 ? src.replace(a, b) : src }; };
const B1 = bait(T646, 'stepUs = T.dec ? decUs * T.ns / T.dec : 0', 'stepUs = T.ns ? decUs * T.dec / T.ns : 0');
const C1b = check(world('bait1', { t646: B1.src }));
ok(B1.n === 1 && !C1b.c1, '미끼 ⓐ 분자 · 분모를 바꿔 낀 t646 사본 → ① 빨강', `바꾼 자리 ${B1.n} · 걸음 ${C1b.step} ↔ ${C1b.M.stepUs.toFixed(3)}`);
const B2 = bait(USL, 'ms: med(R2.map((x) => x.segSumUs * x.pop / 1000)),', 'ms: med(R2.map((x) => x.segSumUs * x.pop * (x.lines && x.lines.decSamples ? x.lines.stepSamples / x.lines.decSamples : 1) / 1000)),');
const C2b = check(world('bait2', { usl: B2.src }));
ok(B2.n === 1 && !C2b.c2, '미끼 ⓑ 건너뛴 몸을 분모에서 뺀 us-line 사본(틱 ms 를 연 몸 수로) → ② 빨강', `바꾼 자리 ${B2.n} · 틱 ${C2b.u && C2b.u.tick ? C2b.u.tick.day.ms.toFixed(3) : '?'} ↔ ${C2b.M.tickMs.toFixed(3)}`);
const B3 = bait(USL, 'ms: med(R2.map((x) => x.segSumUs * x.pop / 1000)),', 'ms: med(R2.map((x) => (x.segSumUs + ((x.lines && x.lines.stepUs) || 0)) * x.pop / 1000)),');
const C3b = check(world('bait3', { usl: B3.src }));
ok(B3.n === 1 && !C3b.c2, '미끼 ⓒ 표본기 몫(걸음 µs)을 틱 줄에 섞은 us-line 사본 → ② 빨강', `바꾼 자리 ${B3.n} · 틱 ${C3b.u && C3b.u.tick ? C3b.u.tick.day.ms.toFixed(3) : '?'} ↔ ${C3b.M.tickMs.toFixed(3)}`);

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
console.log(`\n=== T1425 자 ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
