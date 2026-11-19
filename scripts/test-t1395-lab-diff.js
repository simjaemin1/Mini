#!/usr/bin/env node
// @regress
// @bait 3   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1395-lab-diff.js — 랩 ↔ 서버 손 사본 대조 줄이 정말 무는가(T1395 · 자 `scripts/lib-lab-diff.js`) =====================
//
// ★무엇: 전수표(`계측/T1395_2026-11-20/전수표.md`)의 "같음 · 손 사본" 줄을 `lib-lab-diff.js` SAME 로 올렸다 —
//   `lab-wiring-check.js` [P] 가 그 줄을 랩 글자 ↔ 서버 글자에서 값을 뽑아 맞댄다. 이 하네스는
//   ① 지금 레포에서 SAME 줄이 다 초록이고(값을 뽑았고 같다) · DIFFS 줄의 글자를 다 찾는다
//   ② ★미끼 — SAME 줄마다 **랩 쪽** 값 한 곳을 바꾸면 그 줄 하나만 빨강(나머지 초록)
//   ③ ★미끼 — SAME 줄마다 **서버 쪽** 값 한 곳을 바꾸면 그 줄 하나만 빨강
//   ④ ★미끼 — DIFFS 줄마다 서버 글자를 지우면 "글자 못 찾음"(다름 줄도 자리를 계속 쥔다)
//   ⑤ `lab-wiring-check.js` 가 [P] 를 부르고 실패 0 으로 끝난다
//   제품 무변 — 글자를 읽기만 한다(비튼 글자는 메모리에서만).
// 실행: node scripts/test-t1395-lab-diff.js
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const L = require('./lib-lab-diff.js');

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (d ? ' — ' + d : '')); } };

// 값 한 곳을 비튼다 — 정규식 첫 맞음의 첫 묶음만 바꾼다(바꾼 자리 수를 돌려준다)
function twist(src, re) {
  const g = new RegExp(re.source, re.flags.replace('g', ''));
  const m = g.exec(src); if (!m || m[1] == null) return { src, n: 0 };
  const at = m.index + m[0].indexOf(m[1]);
  const v = m[1], nv = /^-?\d+(\.\d+)?$/.test(v.trim()) ? String(+v + 7) : 'X_' + v;   // 글자 값은 앞에 붙인다(뒤에 붙이면 `(sizeMul)` 이 `sizeMul_X` 의 앞을 다시 문다)
  return { src: src.slice(0, at) + nv + src.slice(at + v.length), n: 1 };
}
function withTwist(file, re) {
  let n = 0;
  const srcOf = (f) => { const s = L.readRoot(f); if (f !== file) return s; const t = twist(s, re); n = t.n; return t.src; };
  return { srcOf, n: () => n };
}

console.log('\n① 지금 레포 — SAME 초록 · DIFFS 글자 찾음');
const R0 = L.checkSame();
ok(L.SAME.length >= 20, `[전제] SAME 줄 ${L.SAME.length} ≥ 20(0 이면 아래가 자명 통과)`);
const bad0 = R0.filter((r) => !r.ok);
ok(bad0.length === 0, `SAME ${R0.length}줄 다 같음`, bad0.map((r) => `${r.id} ${r.why}`).join(' · '));
const D0 = L.checkDiffs();
ok(L.DIFFS.length >= 5, `[전제] DIFFS 줄 ${L.DIFFS.length} ≥ 5`);
const lost0 = D0.filter((r) => !r.found);
ok(lost0.length === 0, `DIFFS ${D0.length}줄 두 글자 다 찾음`, lost0.map((r) => r.id).join(' '));
const same0 = D0.filter((r) => r.same);
ok(same0.length === 0, 'DIFFS 줄은 지금 값이 정말 다르다(같아졌으면 SAME 으로 옮길 차례)', same0.map((r) => `${r.id}=${r.lab}`).join(' '));
const ids = new Set(); let dup = '';
for (const p of L.SAME.concat(L.DIFFS)) { if (ids.has(p.id)) dup += p.id + ' '; ids.add(p.id); }
ok(!dup, 'id 겹침 0', dup);

console.log('\n② 미끼 — 랩 쪽 값 한 곳');
{
  const miss = [];
  for (const p of L.SAME) {
    const T = withTwist(p.lab[0], p.lab[1]);
    const R = L.checkSame(T.srcOf);
    const red = R.filter((r) => !r.ok).map((r) => r.id);
    // 같은 랩 글자 · 같은 정규식을 쓰는 줄이 둘이면(서버 두 자리 ↔ 랩 한 자리) 둘 다 빨강이 맞다
    const twins = L.SAME.filter((q) => q.lab[0] === p.lab[0] && q.lab[1].source === p.lab[1].source).map((q) => q.id).sort().join(',');
    if (T.n() !== 1 || red.sort().join(',') !== twins) miss.push(`${p.id}(바꾼 ${T.n()} · 빨강 ${red.join(',') || '0'})`);
  }
  ok(miss.length === 0, `★미끼 — SAME ${L.SAME.length}줄마다 랩 값 한 곳을 바꾼 자리 1 → 그 줄(같은 글자를 읽는 쌍둥이 줄 포함)만 빨강`, miss.join(' '));
}

console.log('\n③ 미끼 — 서버 쪽 값 한 곳');
{
  const miss = [];
  for (const p of L.SAME) {
    const T = withTwist(p.srv[0], p.srv[1]);
    const R = L.checkSame(T.srcOf);
    const red = R.filter((r) => !r.ok).map((r) => r.id);
    // 같은 서버 파일 · 같은 정규식을 쓰는 줄이 둘이면 둘 다 빨강이 맞다
    const twins = L.SAME.filter((q) => q.srv[0] === p.srv[0] && q.srv[1].source === p.srv[1].source).map((q) => q.id).sort().join(',');
    if (T.n() !== 1 || red.sort().join(',') !== twins) miss.push(`${p.id}(바꾼 ${T.n()} · 빨강 ${red.join(',') || '0'})`);
  }
  ok(miss.length === 0, `★미끼 — SAME ${L.SAME.length}줄마다 서버 값 한 곳을 바꾼 자리 1 → 그 줄만 빨강`, miss.join(' '));
}

console.log('\n④ 미끼 — 다름 줄의 서버 글자를 지운다');
{
  const miss = [];
  for (const p of L.DIFFS) {
    let n = 0;
    const srcOf = (f) => { const s = L.readRoot(f); if (f !== p.srv[0]) return s; const g = new RegExp(p.srv[1].source, p.srv[1].flags.replace('g', '')); const m = g.exec(s); if (!m) return s; n = 1; return s.slice(0, m.index) + s.slice(m.index + m[0].length); };
    const R = L.checkDiffs(srcOf).find((r) => r.id === p.id);
    if (n !== 1 || R.found) miss.push(`${p.id}(바꾼 ${n})`);
  }
  ok(miss.length === 0, `★미끼 — DIFFS ${L.DIFFS.length}줄마다 서버 글자를 지운 바꾼 자리 1 → 못 찾음`, miss.join(' '));
}

console.log('\n⑤ lab-wiring-check [P]');
{
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'lab-wiring-check.js')], { encoding: 'utf8', cwd: ROOT, maxBuffer: 64 << 20 });
  const out = r.stdout || '';
  ok(/\n\[P\] /.test(out), '[P] 섹션이 돈다');
  const pRows = (out.split('\n[P] ')[1] || '').split('\n=== ')[0];
  ok((pRows.match(/✅ P\d-/g) || []).length === L.SAME.length, `[P] 같음 줄 ${L.SAME.length} 이 다 ✅`, `✅ ${(pRows.match(/✅ P\d-/g) || []).length}`);
  ok(r.status === 0, `lab-wiring-check 실패 0(종료 ${r.status})`);
}

console.log(`\n=== T1395 랩↔서버 대조: 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
