#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T569 ③④ 표 기계 · 판정 0)
// =============================================================================
// T569 ③ 시딩 간격 — 다 자란 두 마을이 안 닿는 간격 = 두 마을 영토 상한 원 반지름 합(r = √(상한/π) · 상한 = 인구 × LAND_NEED · T538)
//   한반도 후보 51 중 그 간격보다 붙은 쌍(셀 거리 < rA + rB)을 인구 셋으로 센다:
//     ⓐ 시딩 때(INITIAL_POP) · ⓑ 3시드 800일 끝 인구(t17 JSON `vpop` · 시드마다) · ⓒ 서울 사본 9년(DB · 있으면)
//   + 참고: 시딩 영토(3,450셀 · 같은 넓이 원) 끼리 닿는 쌍.
// T569 ④ 상한 대 집 부지 — 상한(인구 × 12) 안에 그 인구의 집 부지(⌈인구 ÷ 정원⌉ × 124)·마당(회관 마당 원판)·밭(인구 × LAND_NEED)이 들어가나.
//   상한이 걸린 마을의 영토는 max(시딩 영토, 상한) 에서 멎는다(T538 — 줄이지 않는다). 그 땅에 다 안 들어가는 집 수 = "상한 탓 집터 거부" 의 하한.
//
// 쓰는 법: node scripts/t569-tables.js [t17 JSON …]      env: T569_DB=<서울 사본 db>(선택)
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t569t-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const VL = R('server/village-layout');
const P = R('server/villages').__labProbe;
const SZ = P.SZ, NEED = VL.LAND_NEED, LOT = VL.LOT_CELLS.length, YARD = VL.YARD_CELLS.length, CAPH = VL.HOUSE_CAP_PER_FLOOR * VL.HOUSE_MAX_FLOORS;
const SEED_TERR = 3450;   // 시딩 영토 셀(사본 · 새 세계 판 실측 — 표의 참고 줄)
const cands = (T.siteCandidates('hanbando') || []).map((v) => ({ name: v.name, cx: v.x / SZ, cy: v.y / SZ }));
const rOf = (cells) => Math.sqrt(Math.max(0, cells) / Math.PI);

const popSets = [['ⓐ 시딩 때(INITIAL_POP ' + P.INITIAL_POP + ')', Object.fromEntries(cands.map((c) => [c.name, P.INITIAL_POP]))]];
for (const f of process.argv.slice(2)) { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); popSets.push([`ⓑ 800일 끝 시드 ${j.seed}`, Object.fromEntries((j.vpop || []).map((v) => [v.name, v.pop]))]); } catch (e) { console.error('읽기 실패', f, e.message); } }
if (process.env.T569_DB) {
  const { DatabaseSync } = require('node:sqlite'); const d = new DatabaseSync(process.env.T569_DB);
  const m = {}; for (const r of d.prepare('SELECT name, econ_state FROM villages').all()) { try { m[r.name] = (JSON.parse(r.econ_state).npcs || []).length; } catch (e) {} }
  popSets.push(['ⓒ 서울 사본 9년(day 3341)', m]); d.close();
}

console.log(`\n[T569 ③] 한반도 후보 ${cands.length} · 쌍 ${cands.length * (cands.length - 1) / 2} — 셀 거리 < rA + rB(r = √(인구 × ${NEED} / π))`);
console.log('| 인구 | 붙은 쌍 | 가장 붙은 셋(거리 · 필요) |');
console.log('|---|---:|---|');
const pairsOf = (pop) => { const out = [];
  for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
    const a = cands[i], b = cands[j], d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
    const need = rOf((pop[a.name] || 0) * NEED) + rOf((pop[b.name] || 0) * NEED);
    if (d < need) out.push({ a: a.name, b: b.name, d, need });
  } return out.sort((p, q) => (p.d - p.need) - (q.d - q.need)); };
const res3 = {};
for (const [label, pop] of popSets) { const pr = pairsOf(pop); res3[label] = pr;
  console.log(`| ${label} | ${pr.length} | ${pr.slice(0, 3).map((x) => `${x.a}·${x.b} ${x.d.toFixed(0)} < ${x.need.toFixed(0)}`).join(' · ') || '—'} |`); }
{ const seedR = rOf(SEED_TERR); let n = 0; for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) if (Math.hypot(cands[i].cx - cands[j].cx, cands[i].cy - cands[j].cy) < 2 * seedR) n++;
  console.log(`| 참고 — 시딩 영토 ${SEED_TERR}셀 원(r ${seedR.toFixed(0)}) 끼리 | ${n} | — |`); }

console.log(`\n[T569 ④] 상한(인구 × ${NEED}) 안에 집 부지(⌈인구 ÷ ${CAPH}⌉ × ${LOT})·마당(${YARD})·밭(인구 × ${NEED})이 드나 — 땅 = max(시딩 ${SEED_TERR}, 상한)`);
console.log('| 인구 | 마을(인구>0) | 상한 < 필요 | 땅(max) < 필요 | 못 드는 집 합 | 인당 상한 · 인당 필요(집+밭) |');
console.log('|---|---:|---:|---:|---:|---|');
const res4 = {};
for (const [label, pop] of popSets) {
  let n = 0, capShort = 0, landShort = 0, housesShort = 0;
  for (const c of cands) { const p = pop[c.name] || 0; if (!p) continue; n++;
    const cap = p * NEED, houses = Math.ceil(p / CAPH), need = houses * LOT + YARD + p * NEED, land = Math.max(SEED_TERR, cap);
    if (cap < need) capShort++;
    if (land < need) { landShort++; housesShort += Math.min(houses, Math.ceil((need - land) / LOT)); } }
  res4[label] = { n, capShort, landShort, housesShort };
  console.log(`| ${label} | ${n} | ${capShort} | ${landShort} | ${housesShort} | ${NEED} · ${(LOT / CAPH + NEED).toFixed(1)} |`);
}
const out = process.env.T569_OUT || '/tmp/t569/tables.json';
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify({ res3, res4, NEED, LOT, YARD, CAPH }, null, 1));
console.log('\n→', out);
