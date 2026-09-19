#!/usr/bin/env node
// === scripts/t326-eochon2.js — T326 계측기: **왜 그 한 곳은 간격으로도 안 풀리나** ============
//   (러너 밖 — `@regress` 표 없음. 끝난 판의 DB + 정본 지형 어댑터를 읽을 뿐 세계를 안 돌린다.)
//
// ★왜 [T326 카드 ② — "어촌2 는 왜 물에 끼었나 한 줄"]
//   T315/T326 실측에서 간격을 15 로 내리고 `_mapBeds` 를 살려도 **정지 마을이 한 곳 남는다**.
//   그 한 곳이 간격 때문이 아니라 **땅 때문**이라는 것을 수로 보여야 다음 카드가 옳은 자리를 판다.
//
// ★하는 일 — **코드 0 · 새 수 0 · 정본만 부른다**:
//   ⓐ DB 에서 그 마을의 영토 셀(`village_buildings` type='terr')과 완공집(type='house')을 읽는다.
//   ⓑ 정본 지형 어댑터(`__labProbe.makeTerrainAdapter` — 실서버의 그 함수)로 영토 셀을 분류한다:
//      물 · 막힘(바위) · 부지 원판(`LOT_CELLS`)이 통째로 영토 안에 들어가는 자리 · 물가 완충(`LOT_GUARD`) 침범.
//   ⓒ 그래서 **기하학적으로 집을 놓을 수 있는 짝수격자 자리**가 몇 곳인지, 그 자리들로 간격 `HG` 를
//      지키며 최대 몇 채가 서는지(탐욕 패킹 — 실제 배치와 같은 순서 규약: 중심 가까운 순)를 센다.
//   ⓓ 그 마을의 인구·침상과 비교한다.
//
// 실행: node scripts/t326-eochon2.js <존DB> [마을이름 …]        (이름 없으면 정지 마을을 스스로 고른다)
'use strict';
const path = require('path');
const VL = require(path.join(__dirname, '..', 'server', 'village-layout.js'));
const CAP = VL.HOUSE_CAP_PER_FLOOR;

const dbPath = process.argv[2];
if (!dbPath) { console.error('쓰는 법: node scripts/t326-eochon2.js <존DB> [마을이름 …]'); process.exit(2); }
const want = process.argv.slice(3);

// ── 정본 지형 어댑터(실서버의 그 함수 · 사본 0) ──────────────────────────────────
process.env.ENABLE_VILLAGES = '1'; process.env.VILLAGE_MAX = process.env.VILLAGE_MAX || '2';
process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
const _l = console.log; console.log = () => {};
const Zone = require(path.join(__dirname, '..', 'server', 'zone.js'));
console.log = _l;
const H = Zone.__testBind(), V = H.SimVillages;
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config.js'));
const TR = require(path.join(__dirname, '..', 'server', 'terrain.js'));
if (TR.setZonesMeta) TR.setZonesMeta(ZONES);
const ta = V.__labProbe.makeTerrainAdapter(TR, ZONES.hanbando,
  { isTerrainBlockedLocal: H.isTerrainBlockedLocal, isWaterTileLocal: H.isWaterTileLocal });

// ── DB ────────────────────────────────────────────────────────────────────────
const Database = require('better-sqlite3');
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const vrows = db.prepare('SELECT id, name, cx, cy, econ_state FROM villages').all();
//   ★[T326] 영토·집만 보면 "땅은 남는다" 는 거짓말이 된다 — **생활층 하드 필터가 보는 것을 전부 읽는다**
//   (`_lifeSiteFilters.reject` 가 묻는 순서 그대로: 집 간격 · 쉼터 이격 · 영토 · 지형 · 농지 · 물가 완충 · 곳간 · 도랑).
const brows = db.prepare("SELECT village_id, type, cx, cy, floors FROM village_buildings WHERE type IN ('terr','house','farmland','dryfield','granary','ditch','shelter','nongzone')").all();
db.close();

const byV = new Map();
for (const r of brows) {
  let o = byV.get(r.village_id);
  if (!o) byV.set(r.village_id, o = { terr: new Set(), house: [], farm: new Set(), pot: new Set(), gran: [], ditch: new Set(), shelter: [] });
  const k = r.cx + ',' + r.cy;
  if (r.type === 'terr') o.terr.add(k);
  else if (r.type === 'house') o.house.push([r.cx, r.cy, r.floors | 0]);
  else if (r.type === 'farmland' || r.type === 'dryfield') o.farm.add(k);
  else if (r.type === 'nongzone') o.pot.add(k);   // ★`_potSet` 의 영속 꼴(villages.js:2612) — **잠재 논**. 1패스는 이걸 피한다(strict)
  else if (r.type === 'granary') o.gran.push([r.cx, r.cy]);
  else if (r.type === 'ditch') o.ditch.add(k);
  else if (r.type === 'shelter') o.shelter.push([r.cx, r.cy]);
}

const info = vrows.map((v) => {
  let ec = null; try { ec = v.econ_state ? JSON.parse(v.econ_state) : null; } catch (e) {}
  const o = byV.get(v.id) || { terr: new Set(), house: [], farm: new Set(), pot: new Set(), gran: [], ditch: new Set(), shelter: [] };
  const floors = o.house.reduce((s, h) => s + h[2], 0);
  const pop = ec && ec.npcs ? ec.npcs.length : 0;
  return { id: v.id, name: v.name, ccx: v.cx, ccy: v.cy, terr: o.terr, houses: o.house, floors,
    farm: o.farm, pot: o.pot, gran: o.gran, ditch: o.ditch, shelter: o.shelter,
    beds: floors * CAP, pop, housing: ec && ec.housing != null ? +ec.housing : null,
    mapBeds: ec && ec._mapBeds !== undefined ? +ec._mapBeds : undefined };
});
// 이름을 안 주면 **정지한 마을**(인구 ≥ 침상 이면서 침상 < housing)을 스스로 고른다
const picks = want.length ? info.filter((x) => want.includes(x.name))
  : info.filter((x) => x.housing != null && x.beds < x.housing && x.pop >= x.beds);

const GAP = VL.LIFE_HOUSE_GAP;
console.log(`\n=== T326 — 간격으로 안 풀리는 마을은 왜 그런가 (DB: ${path.basename(dbPath)}) ===`);
console.log(`  정본: LIFE_HOUSE_GAP ${GAP} · LOT_R ${VL.LOT_R} · FARM_GAP ${VL.FARM_GAP} · LOT_CELLS ${VL.LOT_CELLS.length}셀 · LOT_GUARD ${VL.LOT_GUARD.length}셀 · 층당 정원 ${CAP}`);
console.log(`  대상 ${picks.length}곳: ${picks.map((p) => p.name).join(' · ') || '(없음)'}\n`);

for (const p of picks) {
  // 영토 셀 분류
  let water = 0, blocked = 0;
  for (const k of p.terr) { const i = k.indexOf(','), x = +k.slice(0, i), y = +k.slice(i + 1);
    if (ta.isWater && ta.isWater(x, y)) water++; else if (ta.isBlocked(x, y)) blocked++; }
  // 하드 필터 전수(집 간격만 빼고 — 그건 아래 패킹이 본다) · 사유별로 센다
  const why = { 격자: 0, 마당: 0, 영토밖: 0, 지형: 0, 농지: 0, 잠재논: 0, 물가완충: 0, 곳간: 0, 도랑: 0, 쉼터: 0 };
  const anchors = [];
  for (const k of p.terr) {
    const i = k.indexOf(','), x = +k.slice(0, i), y = +k.slice(i + 1);
    if ((x & 1) || (y & 1)) { why.격자++; continue; }                        // 짝수 격자 — 집터 규약
    if (Math.hypot(x - p.ccx, y - p.ccy) < VL.HALL_CLEAR) { why.마당++; continue; }
    let sh = false;
    for (const s2 of p.shelter) if (Math.hypot(s2[0] - x, s2[1] - y) < GAP) { sh = true; break; }
    if (sh) { why.쉼터++; continue; }
    let bad = null;
    for (const [dx, dy] of VL.LOT_CELLS) { const xx = x + dx, yy = y + dy;
      if (!p.terr.has(xx + ',' + yy)) { bad = '영토밖'; break; }
      if (ta.isBlocked(xx, yy)) { bad = '지형'; break; }
      if (p.farm.has(xx + ',' + yy)) { bad = '농지'; break; }
      if (p.pot.has(xx + ',' + yy)) { bad = '잠재논'; break; }   // ★1패스(strict) 가 피하는 그 칸 — `_potSet`
      if (p.ditch.has(xx + ',' + yy)) { bad = '도랑'; break; } }
    if (bad) { why[bad]++; continue; }
    let wet = false;
    for (const [dx, dy] of VL.LOT_GUARD) if (ta.isWater && ta.isWater(x + dx, y + dy)) { wet = true; break; }
    if (wet) { why.물가완충++; continue; }
    let g = false;
    for (const g2 of p.gran) {
      if (g2[0] + 2 >= x - 6 && g2[0] - 2 <= x + 1 && g2[1] + 1 >= y - 6 && g2[1] - 1 <= y - 1) { g = true; break; }
      if (g2[0] + 2 >= x + 1 && g2[0] - 2 <= x + 4 && g2[1] + 1 >= y + 1 && g2[1] - 1 <= y + 4) { g = true; break; } }
    if (g) { why.곳간++; continue; }
    anchors.push([x, y, Math.hypot(x - p.ccx, y - p.ccy)]);
  }
  anchors.sort((a, b) => a[2] - b[2]);                                     // 중심 가까운 순 — 실제 배치와 같은 규약
  // 그 앵커들로 간격을 지키며 최대 몇 채(탐욕 — 실제 알고리즘과 같은 순서)
  const packOf = (gap) => { const put = []; for (const a of anchors) { let ok = true;
      for (const h of put) if (Math.hypot(h[0] - a[0], h[1] - a[1]) < gap) { ok = false; break; }
      if (ok) put.push(a); } return put.length; };
  const p15 = packOf(GAP), p18 = packOf(VL.LIFE_HOUSE_GAP_AISLE);
  // ★★[T326] **결정적인 수**: 지금 서 있는 12채를 그대로 두고, 그 다음 한 채를 놓을 자리가 남아 있나.
  //   패킹 최대치는 "처음부터 다시 놓으면" 의 수라 마을이 지금 자랄 수 있나를 말해 주지 않는다.
  const freeNow = (gap) => anchors.filter((a) => {
    for (const h of p.houses) if (Math.hypot(h[0] - a[0], h[1] - a[1]) < gap) return false;
    return true;
  }).length;
  const f15 = freeNow(GAP), f18 = freeNow(VL.LIFE_HOUSE_GAP_AISLE);
  const need = Math.ceil(p.pop / CAP);
  console.log(`  ${p.name} @(${p.ccx},${p.ccy})`);
  console.log(`    영토 ${p.terr.size}셀 — 물 ${water} · 막힘(바위) ${blocked} · 나머지 ${p.terr.size - water - blocked}`);
  console.log(`    하드 필터 전수를 지나는 **짝수격자 앵커 ${anchors.length}곳** — 막힌 사유: ` +
    Object.entries(why).filter(([, n]) => n > 0).map(([k2, n]) => `${k2} ${n}`).join(' · '));
  console.log(`    그 앵커로 간격 ${GAP} 를 지키며 최대 **${p15}채**(간격 ${VL.LIFE_HOUSE_GAP_AISLE} 면 ${p18}채) — 실제 완공 ${p.houses.length}채`);
  console.log(`    인구 ${p.pop} · 침상 ${p.beds}(= ${p.floors}층 × ${CAP}) · housing ${p.housing == null ? '?' : p.housing.toFixed(1)} · \`_mapBeds\` ${p.mapBeds === undefined ? '안 적힘' : p.mapBeds}`);
  console.log(`    ⇒ 인구를 담으려면 ${need}채가 필요한데 **땅이 내주는 최대가 ${p15}채**다 ⇒ ${p15 >= need ? '땅은 남는다(막은 것은 간격이 아니다)' : `**부족 ${need - p15}채 — 간격이 아니라 땅이다**`}`);
  const packedBeds = p15 * CAP;
  console.log(`    최대 패킹의 침상 ${packedBeds} vs 인구 ${p.pop} ⇒ 침상/인구 최대 ${p.pop ? (100 * packedBeds / p.pop).toFixed(0) : '-'}%`);
  console.log(`    ★**지금 서 있는 ${p.houses.length}채를 그대로 두고 다음 한 채를 놓을 자리**: 간격 ${GAP} 에서 **${f15}곳**(간격 ${VL.LIFE_HOUSE_GAP_AISLE} 면 ${f18}곳)`);
  const want = VL.houseSiteWant(p.pop, p.housing || 0, p.floors, 0);
  console.log(`    방아쇠(\`houseSiteWant(${p.pop}, ${(p.housing || 0).toFixed(1)}, ${p.floors}, 0)\`) = **${want}** ⇒ ` +
    (want && f15 === 0 ? '**원하는데 자리가 0** — 막은 것은 기하다(이 마을은 꽉 찼다)'
     : want && f15 > 0 ? `**원하고 자리도 ${f15}곳 있다** — 막은 것은 기하가 아니다(집터를 여는 쪽·크루·순서를 봐야 한다)`
     : '방아쇠가 더 안 원한다(목표를 채웠다)') + '\n');
}
