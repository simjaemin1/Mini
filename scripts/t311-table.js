#!/usr/bin/env node
// === scripts/t311-table.js — T311 ⓐⓑ 표: 고기 사슬 · 성장 게이트 (관찰 ↔ 빨리감기) ======
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 — `t311-hunt.js` 는 한 판에 두 팔을 다 돌 수 있지만, 관찰 팔이 판당 15~25분이라
//   팔을 **따로** 돌려 JSON 으로 남겼다(가지도 둘이다). 이 파일은 그 JSON 들을 짝지어 표로 만든다.
//   새로 계산하는 것은 **비율 둘**뿐이다 — `호출 수 / hn`(분모 누수)와 `고기 / Σ반환`(문 뒤 배수 M).
//   ⇒ 하루 고기 = `hkill × (호출 수/hn) × M` 이라는 그 항등식의 두 인자다(사슬 지도는 t311-hunt 머리말).
//
// 실행: node scripts/t311-table.js /tmp/t311 [--seeds 1020,7,42]
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : '/tmp/t311';
const si = process.argv.indexOf('--seeds');
const SEEDS = si >= 0 && process.argv[si + 1] ? process.argv[si + 1].split(',').map(Number) : [1020, 7, 42];
const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { return null; } };
const OBS = (s) => { const o = rd(`obs_post_${s}.json`) || rd(`obs_pre_${s}.json`); return o && (o.obs || null); };
const BLK = (s) => { const o = rd(`bulkpost_${s}.json`) || rd(`bulkpre_${s}.json`); return o && (o.bulk || null); };
const f2 = (x, d = 2) => (x == null ? '—' : Number(x).toFixed(d));
const pc = (a, b) => (b > 0 ? ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%' : '—');

console.log('\n=== T311 ⓐ — 고기 사슬: 어디서 3분의 1이 새나 (마을 셋 · 30일 · 3시드) ===');
console.log('  하루 고기 = `hkill × (호출 수 / hn) × M`   ·   `huntIncomeReal` 은 `kills / v.counts.hunter` 를 돌린다');
console.log('\n  시드  마을(역할)     팔        잡은 마릿수    호출 수    평균 hn   호출/hn    Σ반환값   곳간行 고기        M');
for (const s of SEEDS) {
  const o = OBS(s), b = BLK(s); if (!o || !b) { console.log(`  ${s}  자료 없다`); continue; }
  for (const n of Object.keys(o.vil)) {
    for (const [nm, R] of [['관찰', o], ['빨리감기', b]]) {
      const t = R.vil[n]; if (!t) continue;
      const hn = t.hiCalls ? t.hiHnSum / t.hiCalls : 0;
      const cph = t.hiCalls / (t.days || 1);
      console.log('  ' + String(s).padEnd(6) + `${n}(${t.role})`.padEnd(15) + nm.padEnd(10)
        + f2(t.hkill).padStart(12) + String(t.hiCalls).padStart(11) + f2(hn).padStart(10)
        + (hn ? f2(cph / hn, 4) : '—').padStart(10) + f2(t.hiRetSum).padStart(11)
        + f2(t.meat).padStart(13) + (t.hiRetSum ? f2(t.meat / t.hiRetSum, 4) : '—').padStart(10));
    }
    const a = o.vil[n], c = b.vil[n];
    if (a && c) console.log('  ' + ''.padEnd(6) + ''.padEnd(15) + 'Δ 관찰−빨리'.padEnd(10)
      + pc(a.hkill, c.hkill).padStart(12) + pc(a.hiCalls, c.hiCalls).padStart(11)
      + pc(a.hiCalls ? a.hiHnSum / a.hiCalls : 0, c.hiCalls ? c.hiHnSum / c.hiCalls : 0).padStart(10)
      + ''.padStart(10) + pc(a.hiRetSum, c.hiRetSum).padStart(11)
      + pc(a.meat, c.meat).padStart(13)
      + ((a.hiRetSum && c.hiRetSum) ? pc(a.meat / a.hiRetSum, c.meat / c.hiRetSum) : '—').padStart(10));
  }
}

console.log('\n=== T311 ⓑ — 증분 캐시 · 성장 게이트 ===');
console.log('  `econ.counts` 대 `v.npcs` 인구조사 어긋남 · `_hcap = min(housing, _mapBeds)`(`economy-sim.js:3150`)');
console.log('\n  시드  마을(역할)     팔        인구   Σcounts  어긋난날  맹수死   housing  맵 침대  집 채  완공 층  크루 누적초  채집꾼  어부');
for (const s of SEEDS) {
  const o = OBS(s), b = BLK(s); if (!o || !b) continue;
  for (const n of Object.keys(o.vil)) {
    for (const [nm, R] of [['관찰', o], ['빨리감기', b]]) {
      const t = R.vil[n]; if (!t) continue; const L = t.last || {};
      console.log('  ' + String(s).padEnd(6) + `${n}(${t.role})`.padEnd(15) + nm.padEnd(10)
        + String(t.pop).padStart(6) + String(t.popCounts).padStart(9) + `${t.driftDays}/${t.days}`.padStart(9)
        + String(t.deaths).padStart(7) + f2(L.housing, 1).padStart(10) + String(L.mapBeds == null ? '—' : L.mapBeds).padStart(8)
        + String(L.houses == null ? '—' : L.houses).padStart(7) + String(L.builtFloors == null ? '—' : L.builtFloors).padStart(8)
        + String(L.crewTot == null ? '—' : L.crewTot).padStart(12)
        + String(L.cntForager == null ? '—' : L.cntForager).padStart(8) + String(L.cntFisher == null ? '—' : L.cntFisher).padStart(6));
    }
  }
}

console.log('\n=== T311 ⓑ-2 — 두 팔이 갈리는 첫날 (같은 씨 · 같은 세계로 출발한다) ===');
console.log('  시드  마을        인구 갈림   침대 갈림   고기 M 갈림   그 전날까지 M 최대차');
for (const s of SEEDS) {
  const o = OBS(s), b = BLK(s); if (!o || !b) continue;
  for (const n of Object.keys(o.vil)) {
    const A = (o.vil[n] || {}).rows || [], B = (b.vil[n] || {}).rows || [];
    const first = (f) => { for (let i = 0; i < Math.min(A.length, B.length); i++) if (f(A[i], B[i])) return A[i].d; return null; };
    const dPop = first((x, y) => x.pop !== y.pop);
    const dBed = first((x, y) => x.beds !== y.beds);
    const dM = first((x, y) => { if (!(x.ret > 0) || !(y.ret > 0)) return false; return Math.abs(x.meat / x.ret - y.meat / y.ret) > 0.005; });
    let mx = 0;
    for (let i = 0; i < Math.min(A.length, B.length); i++) {
      if (dPop && A[i].d >= dPop) break;
      if (A[i].ret > 0 && B[i].ret > 0) mx = Math.max(mx, Math.abs(A[i].meat / A[i].ret - B[i].meat / B[i].ret));
    }
    console.log('  ' + String(s).padEnd(6) + n.padEnd(12) + String(dPop == null ? '안 갈림' : '' + dPop + '일').padStart(10)
      + String(dBed == null ? '안 갈림' : '' + dBed + '일').padStart(12) + String(dM == null ? '안 갈림' : '' + dM + '일').padStart(14)
      + f2(mx, 4).padStart(20));
  }
}
console.log('');
