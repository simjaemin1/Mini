#!/usr/bin/env node
// @regress
// @bait 3   ← 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1396-hunt-lab.js — 사냥실험실 되살리기 · 12 불변 · 머리 없는 자의 결정성 [T1396] ==========
//   ① `python3 sim/rebuild-huntlab.py --check` — `lab/사냥실험실.html` 이 **지금** `lab/마을실험실.html` 동물 블록으로 구운 것과 같다
//      (패치 아홉 앵커가 정확히 1곳씩 · `_insideBldgV` 앞잇기). 마을실험실 블록이 바뀌면 여기서 빨강 → 다시 구워라(07-07 뒤 넉 달 아무도 안 본 그 틈).
//   ② `node sim/hunt-check.js` — 사냥실험실 불변 체크리스트(카드가 "12 불변"이라 부른 것 · 지금 H1~H15 열다섯)가 전부 ✅.
//   ②' [T1413] 상자 무관 — H15 사망 수 = 0 · 열다섯 줄 값 지문 = 못 박은 값(sim/det-math.js 를 깐 판 · 맥 Node 18 · 20 · 22 · --jitless 같은 바이트) ·
//      `node --jitless` 판 = 보통 판(바이트). 못 박은 값이 바뀌면 = 랩을 다시 구웠거나 상자 차가 새로 샌 것(어느 쪽인지 가른 뒤 고친다).
//   ③ `scripts/t1396-hunt-lab.js --quick`(🦌 · 환율 5,000 · 사냥꾼 1 · 0.25날) 두 번 = 바이트 같음 · 씨를 바꾸면 다름(자명 통과 금지) ·
//      몸 수 = 무리터 숲 칸 × 0.02 근처(밀도 손잡이가 실제로 먹었다) · 표적을 쥔 판이 있다.
//   ★미끼 둘(이 파일 안 · 바꾼 자리 정확히 1곳 · 빨강이 될 줄을 단언):
//     ⓐ 앞잇기를 뺀 `rebuild-huntlab.py` 사본으로 구운 랩 → ② 의 "H1 크래시 없음" 이 ❌(블록 canWalk 가 `_insideBldgV` 를 못 찾는다)
//     ⓑ vm 맥락에 씨 뿌린 난수를 안 넣는 자 사본 → ③ "같은 씨 두 번 = 같은 표" 가 빨강
//     ⓒ [T1413] det-math 의 cos 계수 C1 끝자리 하나를 바꾼 사본(= 상자마다 다른 libm 끝자리의 흉내) → ②' 지문이 빨강
//   날짜 · 벽시계 0 — 판은 게임 분(`lifeGM`)으로만 간다.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const REB = path.join(ROOT, 'sim', 'rebuild-huntlab.py'), HC = path.join(ROOT, 'sim', 'hunt-check.js'), RUL = path.join(__dirname, 't1396-hunt-lab.js');
const LAB = path.join(ROOT, 'lab', '사냥실험실.html');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null && x !== '' ? '  ' + x : '')); };
const run = (cmd, args, env) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...(env || {}) }, timeout: 300000, maxBuffer: 1 << 26 });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't1396-hl-'));
const BAIT = {
  ulp: ['C1 = 4.16666666666666019037e-02', 'C1 = 4.16666666666667019037e-02'],
  pre: ["out=lab[:st2]+hdr+pre+blk+lab[en2:]", "out=lab[:st2]+hdr+blk+lab[en2:]"],
  seed: ["  vm.runInContext(`{let _s0=(${seed | 0})*2654435761>>>0;", "  if (0) vm.runInContext(`{let _s0=(${seed | 0})*2654435761>>>0;"],
};
const baitCopy = (file, B, dst) => { const src = fs.readFileSync(file, 'utf8'); const n = src.split(B[0]).length - 1; fs.writeFileSync(dst, n === 1 ? src.replace(B[0], B[1]) : src); return n; };
// hunt-check 줄 머리: 두 칸 + 표(U+2705 통과 · U+274C 실패) + 한 칸 — 판정 자리엔 코드 포인트로(lint ②)
const PASS_CP = 0x2705, FAIL_CP = 0x274C;
const mark = (l) => (l.slice(0, 2) === '  ' ? l.codePointAt(2) : 0);
const H15_DEAD = 0, HC_PRINT = '577ead06ac9f';   // [T1413] 씨 7 · det-math 판 — H15 사망 수 · 열다섯 줄 값(' — ' 뒤) sha1 앞 12
const hcPrint = (r) => { const L = (r.stdout || '').split('\n').filter((l) => mark(l) === PASS_CP || mark(l) === FAIL_CP); const d = L.map((l) => l.split(' — ').slice(1).join(' — ')).join('|');
  const h15 = L.find((l) => /^ H15 /.test(l.slice(3))) || ''; const m = /사망(\d+)/.exec(h15.split(' — ').slice(1).join(' — '));
  return { n: L.length, print: require('crypto').createHash('sha1').update(d).digest('hex').slice(0, 12), dead: m ? +m[1] : null }; };
const hcVerdict = (r) => { const L = (r.stdout || '').split('\n'); return { rc: r.status, okN: L.filter((l) => mark(l) === PASS_CP).length, badN: L.filter((l) => mark(l) === FAIL_CP).length, h1Bad: L.some((l) => mark(l) === FAIL_CP && /^ H1 /.test(l.slice(3))), tail: L.filter(Boolean).slice(-1)[0] || (r.stderr || '').split('\n')[0] }; };

try {
  console.log('① 사냥실험실 = 지금 마을실험실 동물 블록(다시 굽기 --check)');
  const r1 = run('python3', [REB, '--check']);
  ok(r1.status === 0 && /패치 9\/9 · 앞잇기 1/.test(r1.stdout || ''), '① `rebuild-huntlab.py --check` 초록 — 패치 9/9 · 앞잇기 1 · 랩 파일이 지금 블록 그대로', ((r1.stdout || '') + (r1.stderr || '')).trim().split('\n').pop());

  console.log('② 사냥실험실 불변 체크리스트(hunt-check)');
  const r2 = run('node', [HC]), v2 = hcVerdict(r2);
  ok(v2.rc === 0 && v2.okN >= 15 && v2.badN === 0, '② hunt-check 전부 ✅(H1~H15 · 카드의 "12 불변")', `rc ${v2.rc} · ✅ ${v2.okN} · ❌ ${v2.badN} · ${v2.tail}`);

  console.log("②' 상자 무관 — H15 사망 수 · 체크리스트 지문(det-math)");
  const p2 = hcPrint(r2), r2j = run('node', ['--jitless', HC]);
  ok(p2.n === 15 && p2.dead === H15_DEAD, "②' H15 사망 수 = " + H15_DEAD + '(못 박음 · 맥 Node 22 사망 0 ↔ 리눅스 사망 2 였던 자리)', `줄 ${p2.n} · 사망 ${p2.dead}`);
  ok(p2.print === HC_PRINT, "②' 열다섯 줄 값 지문 = 못 박은 값(상자 · Node 판 무관)", `${p2.print} / 못 박음 ${HC_PRINT}`);
  ok(r2j.status === r2.status && r2j.stdout === r2.stdout, "②' `node --jitless` 판 = 보통 판(바이트)", r2j.stdout === r2.stdout ? '같음' : '다름');

  console.log('③ 머리 없는 자 — 같은 씨 = 같은 표');
  const q = (file, extra) => run('node', [file, '--quick', '--lab', LAB, ...(extra || [])]);
  const a = q(RUL), b = q(RUL), c = q(RUL, ['--seed', '8']);
  let J = null; try { J = JSON.parse(a.stdout); } catch (e) {}
  const R0 = J && J.rows && J.rows[0];
  ok(a.status === 0 && b.status === 0 && !!R0 && a.stdout === b.stdout, '③ 같은 씨 두 번 = 같은 표(바이트)', R0 ? `몸 ${R0.mobs} · 판 ${R0.eps} · 화살 ${R0.shots}` : (a.stderr || '').split('\n')[0]);
  ok(c.status === 0 && c.stdout !== a.stdout, '③ 씨를 바꾸면 다른 표(자명 통과 금지 — 난수가 판을 실제로 움직인다)');
  const want = R0 ? R0.win.K * 0.02 : 0;
  ok(!!R0 && R0.win.K > 1000 && Math.abs(R0.mobs - want) <= want * 0.25 && R0.eps > 0, '③ 몸 수 ≈ 무리터 숲 칸 × 0.02(환율 5,000 밀도 손잡이가 먹었다) · 표적을 쥔 판 > 0', R0 ? `숲 ${R0.win.K} · 몸 ${R0.mobs} · 기대 ${want.toFixed(1)} · 판 ${R0.eps}` : '');

  console.log('★미끼 ⓐ — 앞잇기(`_insideBldgV`)를 뺀 다시 굽기 사본');
  fs.mkdirSync(path.join(TMP, 'sim'), { recursive: true });
  const nA = baitCopy(REB, BAIT.pre, path.join(TMP, 'sim', 'rebuild-huntlab.py'));
  const outA = path.join(TMP, '사냥실험실_bait.html');
  const rbA = run('python3', [path.join(TMP, 'sim', 'rebuild-huntlab.py')], { HUNTLAB_ROOT: ROOT, HUNTLAB_OUT: outA });
  const vA = fs.existsSync(outA) ? hcVerdict(run('node', [HC], { HUNTLAB_HTML: outA })) : { rc: null, h1Bad: false, tail: (rbA.stderr || '').split('\n')[0] };
  ok(nA === 1 && rbA.status === 0 && vA.rc !== 0 && vA.h1Bad, "★미끼 ⓐ — 바꾼 자리 1곳(`hdr+pre+blk`) · 그 사본으로 구운 랩에선 ② 'H1 크래시 없음' 이 ❌", `n ${nA} · rc ${vA.rc} · ${vA.tail}`);

  console.log('★미끼 ⓑ — 씨 뿌린 난수를 안 넣는 자 사본');
  const fB = path.join(TMP, 't1396-hunt-lab.js');
  const nB = baitCopy(RUL, BAIT.seed, fB);
  const ba = q(fB), bb = q(fB);
  ok(nB === 1 && ba.status === 0 && bb.status === 0 && ba.stdout !== bb.stdout, "★미끼 ⓑ — 바꾼 자리 1곳(씨 뿌린 `Math.random` 줄) · 그 사본에선 ③ '같은 씨 두 번 = 같은 표' 가 빨강", `n ${nB} · 두 표 ${ba.stdout === bb.stdout ? '같음' : '다름'}`);

  console.log('★미끼 ⓒ — det-math cos 계수 끝자리 하나를 바꾼 사본(상자 차 흉내)');
  const DM = path.join(ROOT, 'sim', 'det-math.js');
  const nC = baitCopy(DM, BAIT.ulp, path.join(TMP, 'sim', 'det-math.js'));
  fs.copyFileSync(HC, path.join(TMP, 'sim', 'hunt-check.js'));
  const pC = hcPrint(run('node', [path.join(TMP, 'sim', 'hunt-check.js')], { HUNTLAB_HTML: LAB }));
  ok(nC === 1 && pC.n === 15 && pC.print !== HC_PRINT, "★미끼 ⓒ — 바꾼 자리 1곳(C1 끝자리) · 그 사본에선 ②' '열다섯 줄 값 지문' 이 빨강", `n ${nC} · 줄 ${pC.n} · ${pC.print} · 사망 ${pC.dead}`);
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
console.log(`\n${fail ? '✗' : '✓'} test-t1396-hunt-lab ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
