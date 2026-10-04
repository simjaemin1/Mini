#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T611 추신 ⓓ 표 기계 · 판정 0) 개울 래스터 옛 ↔ 새 — 바뀐 개울 칸이 어느 마을의 집터·밭·마당에 걸렸나
//   두 판: 옛 래스터 판(D · `git show 0679cd5a:server/streams/hanbando.bin` 을 지금 지문으로 다시 싼 것) ↔ 새 래스터 판(base · 지금 main)
//   마을마다: 자기 판의 시딩 배치(시딩 캐시 layout — 집 부지 원판 · 논 · 밭 · 회관 마당 원판) 안 개울 셀 수 · 바뀐 칸(옛만 / 새만)이 옛 배치에 걸린 수 · 인구 전후
//   쓰는 법: node scripts/t611-raster.js <old.bin> <new.bin> <dir(seeds_<팔>_<시드>.json · rul/<팔>_<시드>.json)> [시드…]
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const S = require(path.join(ROOT, 'server', 'streams.js'));
const VL = require(path.join(ROOT, 'server', 'village-layout.js'));
const [OLD, NEW, DIR, ...seedArgs] = process.argv.slice(2);
const SEEDS = seedArgs.length ? seedArgs.map(Number) : [42];
const dec = (f) => { const d = S.decodeFile(fs.readFileSync(f)); const N = d.NX * d.NY, m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = (d.bits[i >> 3] >> (i & 7)) & 1; return { ...d, m }; };
const O = dec(OLD), Nw = dec(NEW), NX = O.NX;
const at = (M, x, y) => (x < 0 || y < 0 || x >= NX || y >= O.NY) ? 0 : M.m[y * NX + x];
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
function foot(v) {   // 배치 칸 집합 — 부(집 부지) · 논밭 · 마당
  const L = v.layout || {}, lot = new Set(), field = new Set(), yard = new Set();
  for (const h of L.houses || []) for (const [dx, dy] of VL.LOT_CELLS) lot.add((h.cx + dx) + ',' + (h.cy + dy));
  for (const c of [...(L.farmland || []), ...(L.dryfield || [])]) field.add(Array.isArray(c) ? c[0] + ',' + c[1] : c.cx + ',' + c.cy);
  for (const [dx, dy] of VL.YARD_CELLS) yard.add((v.ccx + dx) + ',' + (v.ccy + dy));
  return { lot, field, yard };
}
const cnt = (set, M) => { let n = 0; for (const k of set) { const i = k.indexOf(','); if (at(M, +k.slice(0, i), +k.slice(i + 1))) n++; } return n; };
const cntDiff = (set, A, B) => { let n = 0; for (const k of set) { const i = k.indexOf(','), x = +k.slice(0, i), y = +k.slice(i + 1); if (at(A, x, y) && !at(B, x, y)) n++; } return n; };
const out = { seeds: {}, oldCells: O.n, newCells: Nw.n };
for (const s of SEEDS) {
  const sD = J(path.join(DIR, `seeds_D_${s}.json`)), sB = J(path.join(DIR, `seeds_base_${s}.json`));
  const rD = J(path.join(DIR, 'rul', `D_${s}.json`)), rB = J(path.join(DIR, 'rul', `base_${s}.json`));
  if (!sD || !sB || !rD || !rB) { console.log(`시드 ${s}: 입력 없음`); continue; }
  const pD = new Map(rD.vpop.map((v) => [v.name, v.pop])), pB = new Map(rB.vpop.map((v) => [v.name, v.pop])), LB = new Map(sB.map((v) => [v.name, v]));
  const rows = [];
  for (const d of sD) {
    const b = LB.get(d.name); if (!b) continue;
    const fd = foot(d), fb = foot(b);
    rows.push({ name: d.name,
      oldOn: { lot: cnt(fd.lot, O), field: cnt(fd.field, O), yard: cnt(fd.yard, O) },
      newOn: { lot: cnt(fb.lot, Nw), field: cnt(fb.field, Nw), yard: cnt(fb.yard, Nw) },
      newOnly: cntDiff(new Set([...fd.lot, ...fd.field, ...fd.yard]), Nw, O), oldOnly: cntDiff(new Set([...fd.lot, ...fd.field, ...fd.yard]), O, Nw),
      terrNewOnly: cntDiff(new Set((d.layout.territory || []).map((c) => c[0] + ',' + c[1])), Nw, O),
      moved: d.ccx !== b.ccx || d.ccy !== b.ccy, houses: [(d.layout.houses || []).length, (b.layout.houses || []).length],
      fields: [((d.layout.farmland || []).length + (d.layout.dryfield || []).length), ((b.layout.farmland || []).length + (b.layout.dryfield || []).length)],
      pop: [pD.get(d.name) || 0, pB.get(d.name) || 0] });
  }
  rows.sort((a, b) => (a.pop[1] - a.pop[0]) - (b.pop[1] - b.pop[0]));
  const touched = rows.filter((r) => r.newOnly + r.oldOnly > 0), clean = rows.filter((r) => r.newOnly + r.oldOnly === 0);
  const sum = (a, f) => a.reduce((x, r) => x + f(r), 0);
  out.seeds[s] = { popOld: sum(rows, (r) => r.pop[0]), popNew: sum(rows, (r) => r.pop[1]), touched: touched.length, dTouched: sum(touched, (r) => r.pop[1] - r.pop[0]), clean: clean.length, dClean: sum(clean, (r) => r.pop[1] - r.pop[0]), rows };
  console.log(`\n[시드 ${s}] 옛 래스터 ${out.seeds[s].popOld} → 새 래스터 ${out.seeds[s].popNew}(${((out.seeds[s].popNew - out.seeds[s].popOld) / out.seeds[s].popOld * 100).toFixed(1)}%)`);
  console.log(`  바뀐 개울 칸이 옛 배치(집 부지·논밭·마당)에 걸린 마을 ${touched.length} · 인구 Δ 합 ${out.seeds[s].dTouched} | 안 걸린 마을 ${clean.length} · Δ 합 ${out.seeds[s].dClean}`);
  console.log('  | 마을 | 옛 배치 위 개울(부지/논밭/마당) | 새 배치 위 개울 | 바뀐 칸(새만/옛만) | 영토 새만 | 집 옛→새 | 논밭 칸 옛→새 | 인구 옛→새 |');
  for (const r of rows.slice(0, 12)) console.log(`  | ${r.name} | ${r.oldOn.lot}/${r.oldOn.field}/${r.oldOn.yard} | ${r.newOn.lot}/${r.newOn.field}/${r.newOn.yard} | ${r.newOnly}/${r.oldOnly} | ${r.terrNewOnly} | ${r.houses.join('→')} | ${r.fields.join('→')} | ${r.pop.join('→')} (${r.pop[1] - r.pop[0]}) |`);
}
fs.writeFileSync(path.join(DIR, 'raster.json'), JSON.stringify(out, null, 1));
console.log('\n→', path.join(DIR, 'raster.json'));
