#!/usr/bin/env node
// === scripts/t249-deaths.js — T249: 짚 이월이 벼랑으로 민 마을 넷 (표 셋) =============
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T249 §0]
//   T240 에서 짚 이월 팔이 죽인 넷(농촌12·농촌9·광산3·농촌10)은 **한계 마을이 아니었다**
//   (장부 팔 막바지 N=31/125/72/5). 연료가 늘었는데 왜 마을이 죽나 — 세 후보를 표로 가른다:
//   ⓐ 하급 연료 대체가 다른 항을 밀었나 · ⓑ 곡식 경로에 손이 갔나 · ⓒ 되먹임(연료↑ → K↑ → 과잉 성장 → 붕괴).
//   재는 자는 `t176-ab.js` 그대로고(`T176_WATCH` 로 그 마을만 날마다 한 줄), 여기선 산수가 비교와 최소·최대뿐이다.
//
// 실행: node scripts/t249-deaths.js /tmp/t249
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : '/tmp/t249';
const load = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const TARGETS = [[1020, '농촌12'], [7, '농촌9'], [42, '광산3'], [42, '농촌10']];
const ARMS = [['OFF', 'off'], ['장부', 'led'], ['이월', 'car']];
const nf = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));
const p = (x, w, d) => String(x == null ? '—' : (typeof x === 'number' ? x.toFixed(d) : x)).padStart(w);

const W = {};
for (const [s, nm] of TARGETS) {
  W[s + '|' + nm] = {};
  for (const [, t] of ARMS) {
    const d = load(path.join(DIR, `${t}_${s}.json`));
    const v = d && d.per.find((x) => x.name === nm);
    W[s + '|' + nm][t] = v && v.watch ? v.watch : null;
  }
}

console.log('\n=== T249 — 짚 이월이 벼랑으로 민 마을 넷 (실지도 51마을 · 800일 · 세 팔 · 날마다) ===');

// ── ⓐ 열마다 처음 갈리는 날 ─────────────────────────────────────────────────
const COLS = ['pend', 'straw', 'strawRaw', 'low', 'twig', 'bark', 'twigP', 'barkP', 'woodFuel', 'wood', 'pW',
  'cov', 'need', 'eat', 'food', 'pF', 'grain', 'hp', 'gated', 'N', 'lj', 'fm', 'fg', 'house'];
console.log('\nⓐ 장부 팔 대 이월 팔 — **열마다 처음 갈리는 날**(빠른 순 · 원인은 위, 결과는 아래)');
for (const [s, nm] of TARGETS) {
  const A = W[s + '|' + nm].led, B = W[s + '|' + nm].car;
  if (!A || !B) { console.log(`  ⚠${nm}(시드 ${s}) — 자료 없다`); continue; }
  // ★자명 통과 금지 — **두 팔 모두 그 칸 자체가 없으면** "같다"고 적지 않는다(옛 계측기 판 섞임 방지).
  const present = COLS.filter((c) => A.some((r) => r[c] !== undefined) || B.some((r) => r[c] !== undefined));
  const absent = COLS.filter((c) => !present.includes(c));
  const first = {};
  for (let i = 0; i < Math.min(A.length, B.length); i++)
    for (const c of present)
      if (first[c] === undefined && JSON.stringify(A[i][c]) !== JSON.stringify(B[i][c]))
        first[c] = { d: A[i].d, a: A[i][c], b: B[i][c] };
  const ord = Object.entries(first).sort((x, y) => x[1].d - y[1].d);
  console.log(`  ── ${nm}(시드 ${s}) ──`);
  for (const [c, v] of ord.slice(0, 9)) {
    const fmt = (x) => (typeof x === 'object' && x ? JSON.stringify(x).slice(0, 40) : String(x));
    console.log('     ' + c.padEnd(9) + '날 ' + String(v.d).padStart(4) + '   장부 ' + fmt(v.a).padStart(14) + ' → 이월 ' + fmt(v.b).padStart(14));
  }
  const never = present.filter((c) => first[c] === undefined);
  if (never.length) console.log('     ★끝까지 같은 열: ' + never.join(' '));
  if (absent.length) console.log('     ⚠이 판엔 없는 열(판정 안 함): ' + absent.join(' '));
}

// ── ⓑ 꼭대기와 바닥 ─────────────────────────────────────────────────────────
console.log('\nⓑ 얼마나 커졌다가 얼마나 떨어졌나 — **과잉 성장 뒤 붕괴**의 자');
console.log('  시드  마을      팔      최대 인구(날)      최소 인구(날 · 100일 뒤)   끝 인구   최대 주거   최대 충당률');
for (const [s, nm] of TARGETS) {
  for (const [an, t] of ARMS) {
    const A = W[s + '|' + nm][t];
    if (!A) { console.log('  ' + String(s).padEnd(6) + nm.padEnd(9) + an.padEnd(8) + '—'); continue; }
    let mx = -1, mxd = null, mn = 1e9, mnd = null, hx = 0, cx = 0;
    for (const r of A) {
      if (r.N > mx) { mx = r.N; mxd = r.d; }
      if (r.d >= 100 && r.N < mn) { mn = r.N; mnd = r.d; }
      if ((r.house || 0) > hx) hx = r.house;
      if ((r.cov || 0) > cx) cx = r.cov;
    }
    console.log('  ' + String(s).padEnd(6) + nm.padEnd(9) + an.padEnd(8)
      + `${mx} (날 ${mxd})`.padStart(16) + `${mn} (날 ${mnd})`.padStart(24)
      + String(A[A.length - 1].N).padStart(9) + p(hx, 12, 1) + p(cx, 13, 3));
  }
}

// ── ⓑ' 주거가 인구보다 먼저다 ───────────────────────────────────────────────
console.log("\nⓑ' **주거가 인구보다 언제나 먼저 갈린다** — 짚이 아낀 목재가 집이 된다");
console.log('  시드  마을      짚 첫 갈림  목재재고 첫 갈림   **주거** 첫 갈림   **인구** 첫 갈림  |  100일째 주거(장부→이월)   100일째 인구');
for (const [s2, nm] of TARGETS) {
  const A = W[s2 + '|' + nm].led, B = W[s2 + '|' + nm].car;
  if (!A || !B) continue;
  const fd = (c) => { for (let i = 0; i < Math.min(A.length, B.length); i++)
    if (JSON.stringify(A[i][c]) !== JSON.stringify(B[i][c])) return A[i].d; return null; };
  const at = (Wv, d, c) => { const r = Wv.find((x) => x.d === d); return r ? r[c] : null; };
  console.log('  ' + String(s2).padEnd(6) + nm.padEnd(9)
    + String(fd('straw')).padStart(9) + String(fd('wood')).padStart(15) + String(fd('house')).padStart(16)
    + String(fd('N')).padStart(16) + '  |' + `${at(A, 100, 'house')} → ${at(B, 100, 'house')}`.padStart(22)
    + `${at(A, 100, 'N')} → ${at(B, 100, 'N')}`.padStart(17));
}

// ── ⓑ'' 하급 연료는 어디로 갔나 ─────────────────────────────────────────────
console.log("\nⓑ'' 대체된 하급 연료의 행방 — **두 팔이 모두 산 날만** 세어 하루 평균으로(인구 차 보정은 옆 칸)");
console.log('  시드  마을      산 날   잔가지 산출   껍질 산출   하급 사용   짚      목재 연료  |  잔가지 재고   껍질 재고');
for (const [s2, nm] of TARGETS) {
  const A = W[s2 + '|' + nm].led, B = W[s2 + '|' + nm].car;
  if (!A || !B) continue;
  const mapB = new Map(B.map((r) => [r.d, r]));
  const K2 = ['twigP', 'barkP', 'low', 'straw', 'woodFuel', 'twig', 'bark'];
  const acc = {}; let n2 = 0;
  for (const r of A) { const b2 = mapB.get(r.d); if (!b2 || !(r.N > 0) || !(b2.N > 0)) continue; n2++;
    for (const k of K2) { acc[k] = acc[k] || [0, 0]; acc[k][0] += r[k] || 0; acc[k][1] += b2[k] || 0; } }
  if (!n2) continue;
  const cell = (k) => { const [x, y] = acc[k]; const d = x > 0 ? (((y / x) - 1) * 100).toFixed(0) + '%' : '—';
    return `${(x / n2).toFixed(3)}→${(y / n2).toFixed(3)} ${d}`; };
  console.log('  ' + String(s2).padEnd(6) + nm.padEnd(9) + String(n2).padStart(5) + '  '
    + cell('twigP').padStart(19) + cell('barkP').padStart(19) + cell('low').padStart(19)
    + cell('straw').padStart(19) + cell('woodFuel').padStart(20) + '  |'
    + `${(acc.twig[0] / n2).toFixed(3)}→${(acc.twig[1] / n2).toFixed(3)}`.padStart(15)
    + `${(acc.bark[0] / n2).toFixed(3)}→${(acc.bark[1] / n2).toFixed(3)}`.padStart(15));
}
console.log('  ※재고가 두 팔 다 0 언저리인데 사용이 줄었으면 남은 답은 하나 — **애초에 덜 모은다**.');

// ── ⓒ 곡식 무변 ─────────────────────────────────────────────────────────────
console.log('\nⓒ 곡식은 정말 무변인가 — **유입**과 **곳간**과 **식단**을 따로 본다(장부 대 이월)');
console.log('  시드  마을      곡식 유입 첫 갈림   곳간 식량 첫 갈림   식단 첫 갈림   목재값 첫 갈림   짚 첫 갈림');
for (const [s, nm] of TARGETS) {
  const A = W[s + '|' + nm].led, B = W[s + '|' + nm].car;
  if (!A || !B) continue;
  const has = (c) => A.some((r) => r[c] !== undefined) || B.some((r) => r[c] !== undefined);
  const fd = (c) => { if (!has(c)) return 'NA'; for (let i = 0; i < Math.min(A.length, B.length); i++)
    if (JSON.stringify(A[i][c]) !== JSON.stringify(B[i][c])) return A[i].d; return null; };
  const g = fd('grain'), f = fd('food'), e = fd('eat'), w = fd('pW'), st = fd('straw');
  const lab = (x) => (x === 'NA' ? '(열 없음)' : x == null ? '끝까지 같다' : '날 ' + x);
  console.log('  ' + String(s).padEnd(6) + nm.padEnd(9)
    + lab(g).padStart(16) + lab(f).padStart(20) + lab(e).padStart(15)
    + lab(w).padStart(17) + lab(st).padStart(14));
}
console.log('  ※곡식 **유입**(`dailyProductionBuf.food`)이 짚보다 **늦게** 갈리면 곡식 경로는 무접촉이다 —');
console.log('    곳간·식단이 먼저 갈리는 것은 `_cons(v,\'wood\')` → 그림자가격 → **식단 사다리**(`:509~535` 유효가격)를 탄 것이다.');
console.log('');
