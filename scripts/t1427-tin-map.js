#!/usr/bin/env node
// (@regress 없음 — 계측기 · 러너 밖) T1427 주석 지도 — 진단 표 · 굽기 계획
// =============================================================================
// 지시 T1427(재민 11-22 판정 34): 큰 주석 광맥 여섯 → 둘 · NPC 마을이 적어도 하나는 쥔다.
//   이 파일은 **재기만** 한다(정본 무변) — 굽기는 `scripts/t1427-tin-bake.js`.
//
//   ① 주요 광맥(NPC 가 보는 63) 광종 수 · 주석 여섯의 자리 · 반지름 · pk · 닿는 마을(노동권 원과 겹친 넓이)
//   ② 마을 51 의 `land.oreMix` · `land.ore` · 땅 주석(ore × 주석 몫) · 땅 구리 — 세계 조립은 랩 자와 같은 정본 함수
//      (`econ-lab-real.js` · `t17-metrics.js` 순서: pickSeedVillages → findOpenCenter → VillageLayout.generate → extractLandParamsApprox)
//   ③ 자잘한 주석 11 — 가장 가까운 큰 주석 광맥 · 가장 가까운 마을까지 걸음(셀 · 곧은 거리)
//   ④ 프로필 무게(존 프로필 `region-profiles` 한반도 열 — 단계 수는 `hanbando-minerals` POOL 에서 빌린다) · 지금 주요 수 · 기대 수
//
//   마을마다 "이 광맥이 그 마을 주석의 몇 몫" 은 villages.js `oreMix` 의 두 원 겹친 넓이 × pk 를 그대로 다시 셈한다(표만 —
//   다시 센 주석 몫이 정본 `ta.oreMix` 의 주석 몫과 같은지 스스로 맞대고 다르면 멈춘다).
//
// 쓰는 법: node scripts/t1427-tin-map.js [--json 표.json]
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const Z = 'hanbando';
const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const VillageLayout = R('server/village-layout');
const P = R('server/villages').__labProbe;
const S = R('server/sustain');
const HM = R('server/hanbando-minerals');
const RP = R('server/region-profiles');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const say = (s) => process.stdout.write(s + '\n');
const ZONE = ZONES[Z];
const SZ = P.SZ;

// ── 세계 조립 — econ-lab-real.js 와 같은 어댑터 · 같은 선별 ─────────────────────────────
P.setZoneId(Z);
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWaterTileLocal = (x, y) => {
  if (ZONE.isOcean) return true;
  if (!_inZone(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; }
};
const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isTerrainBlockedLocal = (x, y) => { if (!_inZone(x, y)) return true; return isRockTileLocal(x, y) || isWaterTileLocal(x, y); };
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal, isWaterTileLocal });
const hard = T.getZoneVillages(Z) || [];
const picked = P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
const vils = [];
for (const hv of picked) {
  const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
  if (!c) continue;
  if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62);
  const layout = VillageLayout.generate(ta, c.ccx, c.ccy, P.INITIAL_POP, {});
  const lp = P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout);
  vils.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy, x: c.ccx * SZ + SZ / 2, y: c.ccy * SZ + SZ / 2, lp });
}

// ── 광맥 ────────────────────────────────────────────────────────────────────────────
const ores = T._getHardcoded()[Z].ores;
const RR = S.LABOR_R * SZ;
// 두 원의 겹친 넓이(px²) — villages.js oreMix 와 같은 식(표만)
function overlap(d, r) {
  if (d >= RR + r) return 0;
  if (d <= Math.abs(RR - r)) return Math.PI * Math.min(RR, r) * Math.min(RR, r);
  const c1 = (d * d + RR * RR - r * r) / (2 * d * RR), c2 = (d * d + r * r - RR * RR) / (2 * d * r);
  const a1 = Math.acos(Math.max(-1, Math.min(1, c1))), a2 = Math.acos(Math.max(-1, Math.min(1, c2)));
  return RR * RR * (a1 - Math.sin(2 * a1) / 2) + r * r * (a2 - Math.sin(2 * a2) / 2);
}
const distOf = (A, B) => Math.hypot(A[0] - B[0], A[1] - B[1]);
const majors = [];
ores.forEach((o, i) => { if (!o.minor) majors.push(Object.assign({ i }, o)); });
// 마을마다 광맥별 기여(넓이 × pk × 몫) — 주석 몫 다시 셈 → 정본 oreMix 와 맞대기
const contrib = new Map();   // vil name → [{i, name, mineral, w(all), wTin}]
for (const v of vils) {
  const list = []; let tot = 0, tin = 0;
  for (const o of majors) {
    const a = overlap(Math.hypot(o.center[0] - v.x, o.center[1] - v.y), o.radius || 0);
    if (!(a > 0)) continue;
    const dist = (o.minerals && typeof o.minerals === 'object') ? o.minerals : { [o.mineral]: 1 };
    let w = 0, wt = 0;
    for (const m in dist) { const x = a * (o.pk || 0) * dist[m]; w += x; if (m === 'tin') wt += x; }
    tot += w; tin += wt;
    list.push({ i: o.i, name: o.name, mineral: o.mineral, area: a / (SZ * SZ), w, wTin: wt });
  }
  const mixTin = (v.lp.oreMix && v.lp.oreMix.tin) || 0;
  const re = tot > 0 ? tin / tot : 0;
  if (Math.abs(re - mixTin) > 1e-3) { console.error(`✗ ${v.name} 다시 센 주석 몫 ${re.toFixed(4)} ≠ 정본 oreMix ${mixTin} — 표 식이 정본과 다르다`); process.exit(3); }
  contrib.set(v.name, { list, tot });
}

// ① 주요 광종 수
const cntMaj = {}; for (const o of majors) cntMaj[o.mineral] = (cntMaj[o.mineral] || 0) + 1;
const cntAll = {}; for (const o of ores) cntAll[o.mineral] = (cntAll[o.mineral] || 0) + 1;
const tinMaj = majors.filter((o) => o.mineral === 'tin');
const tinRows = tinMaj.map((o) => {
  const touch = [];
  for (const v of vils) { const c = contrib.get(v.name); const e = c.list.find((x) => x.i === o.i); if (e) touch.push({ name: v.name, area: Math.round(e.area), shareOfVilTin: e.wTin > 0 && v.lp.oreMix && v.lp.oreMix.tin > 0 ? +(e.wTin / c.list.reduce((s, x) => s + x.wTin, 0)).toFixed(3) : 0, distCells: Math.round(distOf(o.center, [v.x, v.y]) / SZ) }); }
  let nearV = null; for (const v of vils) { const d = distOf(o.center, [v.x, v.y]) / SZ; if (!nearV || d < nearV.d) nearV = { name: v.name, d: Math.round(d) }; }
  // 공유 — 광맥 원(셀 한 칸 해상도) 가운데 마을 노동권 하나 · 둘 이상에 든 칸(어느 마을들인지)
  const rC = (o.radius || 0) / SZ, cx = o.center[0] / SZ, cy = o.center[1] / SZ, LR = S.LABOR_R;
  let cells = 0, in1 = 0, in2 = 0; const pairs = {};
  for (let y = Math.floor(cy - rC); y <= Math.ceil(cy + rC); y++) for (let x = Math.floor(cx - rC); x <= Math.ceil(cx + rC); x++) {
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > rC) continue; cells++;
    const who = vils.filter((v) => Math.hypot(x + 0.5 - (v.x / SZ), y + 0.5 - (v.y / SZ)) <= LR).map((v) => v.name);
    if (who.length >= 1) in1++; if (who.length >= 2) { in2++; const k = who.sort().join('+'); pairs[k] = (pairs[k] || 0) + 1; }
  }
  return { i: o.i, name: o.name, center: o.center, radius: o.radius, pk: o.pk, touch, nearV, share: { cells, in1, in2, pairs } };
});
// ② 마을
const vRows = vils.map((v) => ({ name: v.name, ccx: v.ccx, ccy: v.ccy, ore: v.lp.ore, oreGrade: v.lp.oreGrade, oreMix: v.lp.oreMix || {},
  tinLand: +((v.lp.ore || 0) * ((v.lp.oreMix || {}).tin || 0)).toFixed(4), cuLand: +((v.lp.ore || 0) * ((v.lp.oreMix || {}).copper || 0)).toFixed(4),
  goldLand: +((v.lp.ore || 0) * ((v.lp.oreMix || {}).gold || 0)).toFixed(4) }));
const tinVils = vRows.filter((v) => (v.oreMix.tin || 0) > 0);
const landSum = (k) => vRows.reduce((s, v) => s + (v.ore || 0) * (v.oreMix[k] || 0), 0);
// ③ 자잘한 주석
const smallTin = ores.map((o, i) => Object.assign({ i }, o)).filter((o) => o.minor && o.mineral === 'tin').map((o) => {
  let nm = null; for (const t of tinMaj) { const d = distOf(o.center, t.center) / SZ; if (!nm || d < nm.d) nm = { name: t.name, d: Math.round(d) }; }
  let nv = null; for (const v of vils) { const d = distOf(o.center, [v.x, v.y]) / SZ; if (!nv || d < nv.d) nv = { name: v.name, d: Math.round(d) }; }
  return { i: o.i, name: o.name, center: o.center, radius: o.radius, pk: o.pk, nearTinMajor: nm, nearVil: nv };
});
// ④ 프로필 무게 — 한반도 열(단계 수는 POOL) · 주요에 설 수 있는 광종(재민 08-01: 주요 철 0 · 은 단독 0)
const own = RP.weightsOf('ore', Z) || {};
const can = Object.keys(own).filter((k) => own[k] > 0 && !RP.NO_MAJOR.includes(k) && k !== 'silver');
const wSum = can.reduce((s, k) => s + own[k], 0);
const expect = {}; for (const k of can) expect[k] = +(majors.length * own[k] / wSum).toFixed(2);
const pool = HM.POOL;

const out = { zone: Z, nMajor: majors.length, nAll: ores.length, cntMaj, cntAll, tinRows, villages: vRows, tinVils: tinVils.map((v) => v.name),
  land: { tin: +landSum('tin').toFixed(3), copper: +landSum('copper').toFixed(3), gold: +landSum('gold').toFixed(3) }, smallTin,
  profile: { own, can, wSum, expect, pool, noMajor: RP.NO_MAJOR } };

say(`## T1427 주석 지도 — ${Z} 광맥 ${ores.length}(주요 ${majors.length}) · 마을 ${vils.length}`);
say(`주요 광종: ${Object.entries(cntMaj).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · ')} — 주석 : 구리 = 1 : ${((cntMaj.copper || 0) / Math.max(1, cntMaj.tin || 0)).toFixed(1)}`);
say(`전체 광종: ${Object.entries(cntAll).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · ')}`);
say('\n큰 주석 광맥:');
for (const r of tinRows) say(`  #${r.i} ${r.name} (${r.center}) r${r.radius} pk ${r.pk} · 가장 가까운 마을 ${r.nearV.name} ${r.nearV.d}셀 · 닿는 마을 ${r.touch.map((t) => `${t.name}(겹침 ${t.area}셀² · 그 마을 주석의 ${(t.shareOfVilTin * 100).toFixed(0)}%)`).join(' · ') || '없음'}`
  + ` · 공유 — 광맥 ${r.share.cells}칸 가운데 노동권 하나 이상 ${r.share.in1} · 둘 이상 ${r.share.in2}${r.share.in2 ? '(' + Object.entries(r.share.pairs).map(([k, v]) => k + ' ' + v).join(' · ') + ')' : ''}`);
say('\n주석이 드는 마을:');
for (const v of tinVils) say(`  ${v.name} — 주석 몫 ${v.oreMix.tin} · 땅 ore ${v.ore} · 땅 주석 ${v.tinLand} · 땅 구리 ${v.cuLand} · 조성 ${JSON.stringify(v.oreMix)}`);
say(`\n마을 노동권 땅 합 — 주석 ${out.land.tin} · 구리 ${out.land.copper} · 금 ${out.land.gold}`);
say('\n자잘한 주석:');
for (const s of smallTin) say(`  #${s.i} ${s.name} r${s.radius} pk ${s.pk} · 가장 가까운 큰 주석 ${s.nearTinMajor.name} ${s.nearTinMajor.d}셀 · 가장 가까운 마을 ${s.nearVil.name} ${s.nearVil.d}셀`);
say(`\n프로필 무게(한반도 열): ${JSON.stringify(own)} · 주요에 설 수 있는 ${can.join('·')} (합 ${wSum}) · 기대 수(주요 ${majors.length}): ${JSON.stringify(expect)}`);
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(out, null, 1) + '\n');
