#!/usr/bin/env node
// === scripts/t311-4arm.js — T311 ⓒ: 캡 × 짚 이월 4팔 (T300 ② · T252 자) ==============
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T311 ③]
//   T300 ② 의 4팔은 `T240_STRAW_CARRY` 가 main 에 없어 못 돌렸다. T311 이 그 가지를 넷째 판 위로
//   리베이스했으니 이제 같은 세계에서 두 손잡이를 **교차**로 켤 수 있다. 팔 넷:
//     `off`  캡 끔 · 짚 끔   = **넷째 판**(끔 = 비트 동일의 뿌리)
//     `cap`  캡 켬 · 짚 끔   = T300 이 "정의상 안 문다"고 증명한 팔(자기 표)
//     `str`  캡 끔 · 짚 켬   = T240 의 그 팔
//     `both` 캡 켬 · 짚 켬   = T264 의 반사실(이월 팔에 건축 속도만 끔 팔 실측으로 캡)
//   ★캡 값은 **그 세계 자신의 끔 팔 실측 최대**(`off` 팔 `per[].builtMax`)다 — T300 ⓐ 문법 · 새 수 0.
//     `str` 팔은 다른 세계이므로 같은 표가 그쪽에는 **교차 표**로 작동한다. 그게 이 4팔의 요점이다.
//
// ★판정은 `인계/공통.md` §2 의 **T252 자**뿐이다(여기서 새 기준 0):
//   3시드 짝 Δ 부호 3/3 일치 **그리고** |평균| > 폭 → 가름 · 부호 일치 · |평균| ≤ 폭 → 방향만 ·
//   부호 갈림 → 못 가름. 소멸은 3시드 0/51 이라 한 곳만 나도 유의.
//
// 실행: node scripts/t311-4arm.js /tmp/t311/r
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : '/tmp/t311/r';
const SEEDS = [1020, 7, 42];
const L = (a, s) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, `${a}_${s}.json`), 'utf8')); } catch (e) { return null; } };
const nf = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));
const fx = (x, d) => (x == null ? '—' : Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pc = (a, b) => (b > 0 ? ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%' : '—');
const built = (o) => Math.round(o.per.reduce((x, p) => x + (p.builtSum || 0), 0));
const bitDead = (o) => o.per.filter((p) => p.everPop && p.N <= 0).map((p) => p.name);

// ★[인계/공통.md §기준선 — 넷째 판] 이 표는 **견주기만** 한다. 어떤 계산에도 안 들어간다.
const BASE4 = {
  1020: { pop: 8318, dead: 0, weapQ: 1306, expand: 9602, reqOpened: 2504, toolQ: 16596.5, preserved: 4284.2, rawGrain: 74094.9 },
  7: { pop: 7935, dead: 0, weapQ: 1275, expand: 9892, reqOpened: 2151, toolQ: 14638.6, preserved: 4719.3, rawGrain: 74291.4 },
  42: { pop: 7853, dead: 0, weapQ: 1356, expand: 9790, reqOpened: 2356, toolQ: 15293.9, preserved: 3885.9, rawGrain: 76117.9 },
};
const C = [['pop', '인구'], ['dead', '소멸'], ['weapQ', '무기Q'], ['expand', '확장셀'],
  ['reqOpened', '게시'], ['toolQ', '도구Q'], ['preserved', '보존식'], ['rawGrain', '생곡']];
const ARMS = [['끔(넷째 판)', 'off'], ['캡만', 'cap'], ['짚만', 'str'], ['캡+짚', 'both']];

console.log('\n=== T311 ⓒ — 캡 × 짚 이월 4팔 (리베이스본 · 51마을 · 800일 · 3시드) ===');
console.log('  `T300_BUILD_CAP` 값 = 그 세계 자신의 **끔 팔 실측 최대**(새 수 0) · `T240_STRAW_CARRY=1` · 둘 다 기본 끔');

// ── ① 끔 팔이 넷째 판 표와 같은가(리베이스 착지의 뿌리) ─────────────────────
console.log('\n① 끔 팔 = 넷째 판 표 (인계/공통.md §기준선 — 견주기만)');
console.log('  시드' + C.map(([, k]) => k.padStart(11)).join('') + '   판정');
for (const s of SEEDS) {
  const o = L('off', s); const b = BASE4[s];
  if (!o) { console.log('  ' + String(s).padEnd(6) + '자료 없다'); continue; }
  const same = C.every(([k]) => (k === 'dead' ? o.dead === b.dead
    : Math.abs(Number(o[k]) - b[k]) <= (k === 'toolQ' || k === 'preserved' || k === 'rawGrain' ? 0.05 : 0.5)));
  console.log('  ' + String(s).padEnd(6)
    + C.map(([k]) => (k === 'dead' ? `${o.dead}/${o.ever}` : fx(o[k], k === 'toolQ' || k === 'preserved' || k === 'rawGrain' ? 1 : 0)).padStart(11)).join('')
    + '   ' + (same ? '여덟 수 동일 ✅' : '★다르다'));
}

// ── ② 여덟 수 4팔 ───────────────────────────────────────────────────────────
console.log('\n② 여덟 수 — 팔 넷');
console.log('  시드  팔           ' + C.map(([, k]) => k.padStart(11)).join('') + '  지은 수용력   죽은 마을');
for (const s of SEEDS) {
  for (const [nm, a] of ARMS) {
    const o = L(a, s); if (!o) { console.log('  ' + String(s).padEnd(6) + nm.padEnd(13) + '자료 없다'); continue; }
    console.log('  ' + String(s).padEnd(6) + nm.padEnd(13)
      + C.map(([k]) => (k === 'dead' ? `${o.dead}/${o.ever}` : fx(o[k], k === 'toolQ' || k === 'preserved' || k === 'rawGrain' ? 1 : 0)).padStart(11)).join('')
      + nf(built(o)).padStart(13) + '   ' + (bitDead(o).join(' · ') || '(없음)'));
  }
}

// ── ③ 짝 Δ · T252 판정 ──────────────────────────────────────────────────────
//   기준 팔을 둘로 본다: 켬 대 끔(절대 효과) · 캡+짚 대 짚만(캡이 이월 팔에서 무엇을 하나 — T264 물음)
const PAIRS = [['캡만 − 끔', 'cap', 'off'], ['짚만 − 끔', 'str', 'off'], ['캡+짚 − 끔', 'both', 'off'], ['★캡+짚 − 짚만', 'both', 'str']];
console.log('\n③ 짝 Δ% 와 T252 판정(부호 3/3 + |평균| > 폭 → 가름)');
console.log('  짝                 수        ' + SEEDS.map((s) => ('시드' + s).padStart(10)).join('') + '     평균       폭     판정');
for (const [nm, A, B] of PAIRS) {
  for (const [k, kn] of C) {
    const ds = SEEDS.map((s) => { const a = L(A, s), b = L(B, s); if (!a || !b) return null;
      return k === 'dead' ? (a.dead - b.dead) : (b[k] > 0 ? (a[k] / b[k] - 1) * 100 : null); });
    if (ds.some((x) => x == null)) continue;
    const mean = ds.reduce((x, y) => x + y, 0) / ds.length;
    const span = Math.max(...ds) - Math.min(...ds);
    const signs = ds.filter((x) => x !== 0).map((x) => Math.sign(x));
    let verdict;
    if (k === 'dead') verdict = ds.every((x) => x === 0) ? '소멸 무변' : '★소멸 바뀜(한 곳만 나도 유의)';
    else if (signs.length === 0) verdict = '비트 동일';
    else if (new Set(signs).size > 1) verdict = '못 가름(부호 갈림)';
    else verdict = Math.abs(mean) > span ? '**가름**' : '방향만';
    console.log('  ' + nm.padEnd(19) + kn.padEnd(9)
      + ds.map((x) => (k === 'dead' ? (x >= 0 ? '+' : '') + x : (x >= 0 ? '+' : '') + x.toFixed(2) + '%').padStart(10)).join('')
      + (k === 'dead' ? String(mean.toFixed(2)) : mean.toFixed(2) + '%').padStart(10)
      + (k === 'dead' ? String(span.toFixed(2)) : span.toFixed(2) + 'p').padStart(9) + '   ' + verdict);
  }
  console.log('');
}

// ── ④ 캡이 무나 — 마을 수 ───────────────────────────────────────────────────
console.log('④ 캡이 실제로 무나 — `builtMax` 가 캡 값에 닿거나 넘은 마을 수(캡 팔)');
console.log('  시드   팔        상한 있는 마을   정확히 닿음   넘음   캡 아래');
for (const s of SEEDS) {
  let cap = null; try { cap = JSON.parse(fs.readFileSync(path.join(DIR, `caps_${s}.json`), 'utf8')); } catch (e) {}
  if (!cap) { console.log('  ' + String(s).padEnd(6) + 'caps 표 없다'); continue; }
  for (const a of ['cap', 'both']) {
    const o = L(a, s); if (!o) continue;
    let n = 0, hit = 0, over = 0, under = 0;
    for (const p of o.per) { const c = cap[p.name]; if (c == null) continue; n++;
      const d = (p.builtMax || 0) - c;
      if (d > 1e-9) over++; else if (d > -1e-9) hit++; else under++; }
    console.log('  ' + String(s).padEnd(7) + a.padEnd(10) + String(n).padStart(12) + String(hit).padStart(14) + String(over).padStart(7) + String(under).padStart(9));
  }
}
console.log('');
