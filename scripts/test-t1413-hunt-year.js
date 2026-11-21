#!/usr/bin/env node
// @regress
// @bait 1   ← 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1413-hunt-year.js — 사냥실험실 한 해 자(t1413-hunt-year)의 꼴 · 끝남 · 사냥 몫을 읽나 [T1413] ==========
//   ① `--quick`(🦌 · 환율 5,000 · 사냥꾼 1 · 몫 100% · 2날) — 표 한 줄의 꼴: ⓐ 빈 날 ≤ 날 · ⓑ 잡은 마리 ≥ 1 · kg = 마리 × 33(서버 정본 사슴 고기 kg) ·
//      ⓒ 사냥꾼-날당 kg = kg ÷ (사냥꾼 × 날) · ⓓ 끝 몸 ÷ 첫 몸 ∈ [0, 1) · 장부에서 뺀 마리(killed) ≥ 1 · 같은 씨 두 번 = 같은 줄(바이트).
//   ② 365날 판이 끝난다 — 🦌 · 환율 187,000(첫 몸 1.56 = 그리는 몸 1) · 몫 10% · 사냥꾼 1 · 365날: 나감 0 · days 365 · 빈 날 ∈ [1, 365] ·
//      비어도 판은 끝까지(빈 뒤 몸 0 · 끝 몫 0) · 잡은 몸은 손질해 가져온다(잡음 ≥ 1 — 몫이 끝나도 손질은 마친다) · 두 번 = 같은 줄(쉬고 돌아오는 길도 씨 난수).
//   ③ 사냥 몫을 실제로 읽는다 — 같은 칸(🦌 · 5,000 · 사냥꾼 1 · 3날)에서 몫 10% 와 100% 의 잡은 마리 · 끝 몫이 다르다(100% 가 더 잡는다).
//   ④ 표의 꼴 — `--sum` 이 ①③ 줄로 표 머리(열 열) · 경계 표 머리(열 일곱)를 낸다.
//   ★미끼 하나(이 파일 안 · 바꾼 자리 정확히 1곳 · 빨강이 될 줄을 단언):
//     ⓐ 사냥 몫을 안 읽는 자 사본(`shareOn` 이 늘 참) → ③ "몫 10% ≠ 100%" 가 빨강(두 몫이 같은 수)
//   날짜 · 벽시계 0 — 판은 게임 분(`lifeGM`)으로만 간다.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const RUL = path.join(__dirname, 't1413-hunt-year.js'), LAB = path.join(ROOT, 'lab', '사냥실험실.html');
const DEER = String.fromCodePoint(0x1F98C);   // 사슴 — 판정 자리엔 코드 포인트로(lint ②)
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null && x !== '' ? '  ' + x : '')); };
const run = (file, args) => spawnSync('node', [file, '--lab', LAB, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 300000, maxBuffer: 1 << 26 });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't1413-hy-'));
const BAIT = { share: ['const shareOn = (share, gm) => {', 'const shareOn = (share, gm) => { return true;'] };
const baitCopy = (file, B, dst) => { const src = fs.readFileSync(file, 'utf8'); const n = src.split(B[0]).length - 1; fs.writeFileSync(dst, n === 1 ? src.replace(B[0], B[1]) : src); return n; };
const rowsOf = (file) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const cell3 = (file, out) => { const r = run(file, ['--sp', '🦌', '--exch', '5000', '--hunters', '1', '--seeds', '7', '--days', '3', '--share', '0.1,1', '--out', out]);
  const R = rowsOf(out); return { rc: r.status, p10: R.find((x) => x.share === '0.1'), p100: R.find((x) => x.share === '1'), err: (r.stderr || '').split('\n').find((l) => /Error/.test(l)) || '' }; };
const sameNum = (a, b) => !!a && !!b && a.harv === b.harv && a.end === b.end && a.killed === b.killed;

try {
  console.log('① 표 한 줄의 꼴(--quick)');
  const a = run(RUL, ['--quick']), b = run(RUL, ['--quick']);
  let J = null; try { J = JSON.parse(a.stdout); } catch (e) {}
  const q = J && J.rows && J.rows[0];
  ok(a.status === 0 && !!q && a.stdout === b.stdout, '① --quick 나감 0 · 같은 씨 두 번 = 같은 줄(바이트)', q ? `잡음 ${q.harv} · 끝 ${q.end}` : (a.stderr || '').split('\n')[0]);
  ok(!!q && q.days === 2 && q.empty >= 1 && q.empty <= q.days && q.harv >= 1 && q.kg === q.harv * 33 && Math.abs(q.kgHD - q.kg / (q.nh * q.days)) < 1e-3 && q.end >= 0 && q.end < 1 && q.killed >= 1,
    '① ⓐ 빈 날 ≤ 날 · ⓑ 마리 ≥ 1 · kg = 마리 × 33 · ⓒ kg ÷ (사냥꾼 × 날) · ⓓ 끝 몫 ∈ [0, 1) · 장부에서 뺀 마리 ≥ 1',
    q ? `빈 날 ${q.empty} · 마리 ${q.harv} · kg ${q.kg} · 날당 ${q.kgHD} · 끝 ${q.end} · 뺀 ${q.killed}` : '');

  console.log('② 365날 판이 끝난다');
  const o2 = path.join(TMP, 'y365.jsonl');
  const r2 = run(RUL, ['--sp', '🦌', '--exch', '187000', '--share', '0.1', '--hunters', '1', '--seeds', '7', '--days', '365', '--out', o2]);
  const y = rowsOf(o2)[0];
  const o2b = path.join(TMP, 'y365b.jsonl'); run(RUL, ['--sp', '🦌', '--exch', '187000', '--share', '0.1', '--hunters', '1', '--seeds', '7', '--days', '365', '--out', o2b]);
  ok(!!y && fs.existsSync(o2b) && fs.readFileSync(o2, 'utf8') === fs.readFileSync(o2b, 'utf8'), '② 같은 씨 두 번 = 같은 줄(바이트 · 쉬었다 돌아오는 사냥꾼 자리도 씨 뿌린 난수)');
  ok(r2.status === 0 && !!y && y.days === 365 && y.empty >= 1 && y.empty <= 365, '② 365날 판 나감 0 · days 365 · 빈 날 ∈ [1, 365]', y ? `빈 날 ${y.empty}${y.emptied ? '' : '(안 빔)'} · 끝 ${y.end}` : (r2.stderr || '').split('\n')[0]);
  ok(!!y && y.emptied && y.end === 0 && y.harv >= 1, '② 첫 몸 1.56 은 비고(끝 몫 0) · 비어도 판은 끝까지 · 잡은 몸은 손질해 가져온다(잡음 ≥ 1)', y ? `빔 ${y.emptied} · 끝 ${y.end} · 잡음 ${y.harv} · 넘긴 분 ${y.over}` : '');

  console.log('③ 사냥 몫을 실제로 읽는다(10% ↔ 100%)');
  const c3 = cell3(RUL, path.join(TMP, 'share.jsonl'));
  ok(c3.rc === 0 && !!c3.p10 && !!c3.p100 && !sameNum(c3.p10, c3.p100) && c3.p100.harv > c3.p10.harv,
    '③ 몫 10% ≠ 100%(잡은 마리 · 끝 몫) · 100% 가 더 잡는다', c3.p10 && c3.p100 ? `10%: 잡음 ${c3.p10.harv} · 끝 ${c3.p10.end} / 100%: 잡음 ${c3.p100.harv} · 끝 ${c3.p100.end}` : c3.err);

  console.log('④ 표의 꼴(--sum)');
  const qf = path.join(TMP, 'q.jsonl'); fs.writeFileSync(qf, (q ? JSON.stringify(q) + '\n' : '') + fs.readFileSync(path.join(TMP, 'share.jsonl'), 'utf8'));
  const s4 = spawnSync('node', [RUL, '--sum', qf], { cwd: ROOT, encoding: 'utf8' });
  const L4 = (s4.stdout || '').split('\n');
  const head = L4.find((l) => /^\| 종 \| 환율 \| 첫 몸 K \|/.test(l)), bh = L4.find((l) => /^\| 종 \| 환율 \| 버티는 칸/.test(l));
  const cols = (l) => (l ? l.split('|').length - 2 : 0);
  ok(s4.status === 0 && cols(head) === 10 && cols(bh) === 7 && L4.some((l) => l.startsWith('| ' + DEER + ' | 5,000 | 58.451 | 10% | 1 |')),
    '④ 표 머리 열 10 · 경계 표 머리 열 7 · 칸 줄(🦌 · 5,000 · 58.451 · 10% · 1)', `열 ${cols(head)} · ${cols(bh)}`);

  console.log('★미끼 ⓐ — 사냥 몫을 안 읽는 자 사본');
  const fA = path.join(TMP, 't1413-hunt-year.js');
  const nA = baitCopy(RUL, BAIT.share, fA);
  const cA = cell3(fA, path.join(TMP, 'bait.jsonl'));
  ok(nA === 1 && cA.rc === 0 && sameNum(cA.p10, cA.p100), "★미끼 ⓐ — 바꾼 자리 1곳(`shareOn`) · 그 사본에선 ③ '몫 10% ≠ 100%' 가 빨강(두 몫이 같은 수)",
    `n ${nA} · ` + (cA.p10 && cA.p100 ? `10%: ${cA.p10.harv} · ${cA.p10.end} / 100%: ${cA.p100.harv} · ${cA.p100.end}` : cA.err));
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
console.log(`\n${fail ? '✗' : '✓'} test-t1413-hunt-year ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
