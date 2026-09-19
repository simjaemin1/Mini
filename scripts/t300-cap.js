#!/usr/bin/env node
// === scripts/t300-cap.js — T300: 건축 상한 손잡이 (표 셋) ==============================
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T300]
//   PM #28: 꼴 = 캡 · 값 = 마을별 최대(끔 팔 실측). 이 파일은 셋을 읽는다 —
//   ⓐ 값 표(넷째 판 끔 팔 마을별 실측 최대) · ⓑ 캡 끔/켬 짝 Δ(T252 자) ·
//   ⓒ **자기 세계의 실측 최대로 묶으면 정의상 안 문다**(교차 표로 묶어야 문다).
//
// 실행: node scripts/t300-cap.js /tmp/t300
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : '/tmp/t300';
const SEEDS = [1020, 7, 42];
const XSRC = { 1020: 7, 7: 42, 42: 1020 };   // 교차 캡 — 그 시드의 세계를 **다른 시드의 끔 팔 표**로 묶었다
const L = (a, s) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, `${a}_${s}.json`), 'utf8')); } catch (e) { return null; } };
const caps = (s) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, `caps_${s}.json`), 'utf8')); } catch (e) { return null; } };
const nf = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));
const fx = (x, d) => (x == null ? '—' : Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pc = (a, b) => (b > 0 ? ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%' : '—');
const built = (o) => Math.round(o.per.reduce((x, p) => x + (p.builtSum || 0), 0));
const deadOf = (o) => o.per.filter((p) => p.everPop && p.N <= 0).map((p) => p.name);

console.log('\n=== T300 — 건축 상한 손잡이 `T300_BUILD_CAP` (넷째 판 · 51마을 · 800일 · 3시드) ===');
console.log('  기본 **끔** · `_allocKnob` 문법 · 정본 자리 하나(`built` 석재 배수 뒤) · **엔진 안 캡 상수 0**(값은 바깥)');

// ── ⓐ 값 표 ─────────────────────────────────────────────────────────────────
console.log('\nⓐ 값 표 — 넷째 판 **끔 팔**의 마을별 실측 최대 일일 건축(캡 값의 밑변 · 새 수 0)');
console.log('  시드   마을   최소      1사분     중앙      3사분     최대    |  가장 빠른 셋');
for (const s of SEEDS) {
  const c = caps(s); if (!c) { console.log(`  ${s}  자료 없다`); continue; }
  const v = Object.values(c).sort((a, b) => a - b);
  const q = (f) => v[Math.min(v.length - 1, Math.floor(v.length * f))];
  const top = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, x]) => `${k} ${x.toFixed(2)}`).join(' · ');
  console.log('  ' + String(s).padEnd(6) + String(v.length).padStart(5) + fx(v[0], 4).padStart(9)
    + fx(q(0.25), 4).padStart(10) + fx(q(0.5), 4).padStart(10) + fx(q(0.75), 4).padStart(10)
    + fx(v[v.length - 1], 4).padStart(10) + '  |  ' + top);
}

// ── ⓑ 캡 끔/켬 + 교차 ───────────────────────────────────────────────────────
const C = [['pop', '인구'], ['dead', '소멸'], ['weapQ', '무기Q'], ['expand', '확장셀'],
  ['reqOpened', '게시'], ['toolQ', '도구Q'], ['preserved', '보존식'], ['rawGrain', '생곡']];
const ARMS = [['끔(넷째 판)', 'off'], ['켬 · 자기 표', 'on'], ['켬 · 교차 표', 'x']];
console.log('\nⓑ 여덟 수 — 캡 끔 / 켬(자기 표) / 켬(교차 표)');
console.log('  시드  팔             ' + C.map(([, k]) => k.padStart(10)).join('') + '  지은 수용력   죽은 마을');
for (const s of SEEDS) {
  for (const [nm, a] of ARMS) {
    const o = L(a, s); if (!o) { console.log('  ' + String(s).padEnd(6) + nm.padEnd(15) + '자료 없다'); continue; }
    console.log('  ' + String(s).padEnd(6) + nm.padEnd(15)
      + C.map(([k]) => (k === 'dead' ? `${o.dead}/${o.ever}` : fx(o[k], k === 'toolQ' || k === 'preserved' || k === 'rawGrain' ? 1 : 0)).padStart(10)).join('')
      + nf(built(o)).padStart(13) + '   ' + (deadOf(o).join(' · ') || '(없음)'));
  }
  const b = L('off', s);
  if (b) for (const [nm, a] of ARMS.slice(1)) {
    const o = L(a, s); if (!o) continue;
    console.log('  ' + ''.padEnd(6) + ('  Δ ' + nm).padEnd(15)
      + C.map(([k]) => (k === 'dead' ? `${o.dead - b.dead >= 0 ? '+' : ''}${o.dead - b.dead}` : pc(o[k], b[k])).padStart(10)).join('')
      + pc(built(o), built(b)).padStart(13));
  }
  console.log('');
}

// ── ⓒ 캡이 무나 ─────────────────────────────────────────────────────────────
console.log('ⓒ 캡이 **실제로 무나** — 자기 표 대 교차 표');
console.log('  시드  표          상한을 넘던 마을   정확히 닿은 마을   넘은 마을(켬 팔 실측)');
for (const s of SEEDS) {
  const off = L('off', s), on = L('on', s), x = L('x', s);
  if (!off) continue;
  for (const [lbl, tbl, arm] of [['자기(시드 ' + s + ')', caps(s), on], ['교차(시드 ' + XSRC[s] + ')', caps(XSRC[s]), x]]) {
    if (!tbl) continue;
    let would = 0, touch = 0, over = 0, n = 0;
    for (const p of off.per) { if (!p.everPop) continue; const c = tbl[p.name]; if (c == null) continue; n++;
      if (p.builtMax > c + 1e-9) would++; if (Math.abs(p.builtMax - c) < 1e-9) touch++; }
    if (arm) for (const p of arm.per) { if (!p.everPop) continue; const c = tbl[p.name]; if (c == null) continue;
      if (p.builtMax > c + 1e-9) over++; }
    console.log('  ' + String(s).padEnd(6) + lbl.padEnd(13) + `${would}/${n}`.padStart(15) + `${touch}/${n}`.padStart(18) + String(over).padStart(22));
  }
}
console.log('  ⇒ 자기 표는 **정의상 안 문다**(넘던 마을 0 · 51곳 전부 정확히 닿는다) — 캡이 그 세계의 역사 그 자체라서다.');
console.log('    캡이 처방이 되려면 **기준 세계를 따로 말해야** 한다(교차 표가 그 대역이다).');
console.log('');
