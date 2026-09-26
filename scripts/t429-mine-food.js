#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T429 계측기)
// =============================================================================
// T429 — 광산 마을은 무엇을 먹나. 마을마다 800일 동안 **먹은 것이 어디서 왔나**를 econ 이 이미 적는 장부에서 읽는다.
//
//   세계 조립은 `t17-metrics` 와 **같은 순서·같은 정본 함수**다(시드 캐시 · `createWorldV2` · 나무 층 · 존 손잡이 · 해안선 띠).
//   ★자기검사: 끝에 기준선 열(인구·소멸·마을별 인구)을 내고 보고가 `t17-metrics` 의 `T17_JSON` 과 견준다 —
//     같으면 이 계측기는 같은 세계를 돈 것이다(장부 읽기는 세계를 안 건드린다).
//
//   날마다 `tickWorldV2` 뒤에 읽는 것(전부 econ 정본 필드 · 쓰기 0):
//     · 먹은 것     `v._foodEaten`(정본이 매일 비우고 다시 채운다 — 품목별)
//     · 스스로 낸 것 `v.dailyProductionBuf`(그날 일꾼이 낸 산출 — 품목별)
//     · 교역        `world.tradeLog` 의 **그날 행**(도착일에 적힌다): 정상 행의 `sent` 는 `to` 에 들어가고 `from` 에서 나갔다 ·
//                   `bought` 는 `to` 에서 나가 `from` 으로 돌아간다(귀환 도착은 뒤 — 여기선 산 날로 센다) ·
//                   재routing·빈손 귀환 행은 **도착이 아니다**(`events.js` 와 같은 규약).
//     · 곳간        식량 품목 재고(첫날·끝날)
//     · 굶은 날     `v.hunger > 0` · 기근 문 `totalFoodEquivalent < N×30`(t176 과 같은 술어)
//   ★"식량 품목" 은 손 목록이 아니다 — 800일 동안 **어느 마을이든 한 번이라도 먹은 품목**(`_foodEaten` 키)이다.
//
// 쓰는 법: node scripts/t429-mine-food.js <일수=800> <시드=1020>   (env: LAB_SEEDCACHE · T17_ZONE · T17_COAST · T429_JSON)
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t429-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 1020;

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const VillageLayout = R('server/village-layout');
const Villages = R('server/villages');
const P = Villages.__labProbe;
const Z = process.env.T17_ZONE || 'hanbando', ZONE = ZONES[Z], SZ = P.SZ;
P.setZoneId(Z);
// ── 지형 어댑터 — `t17-metrics` 와 같은 뜻(해안선 띠 손잡이 포함 · 기본 한반도 끔)
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const _COAST = process.env.T17_COAST !== undefined ? process.env.T17_COAST === '1' : (Z !== 'hanbando');
const _COAST_TILES = _COAST ? R('server/chunk').generateCoastlineWaterTiles({ ...ZONE, id: Z }, SZ, R('server/zone-config').findZoneAt,
  Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }))) : null;
const isWaterTileLocal = (x, y) => {
  if (ZONE.isOcean) return true;
  if (!_inZone(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  if (_COAST_TILES && _COAST_TILES.has(`${tx}_${ty}`)) return true;
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; }
};
const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isTerrainBlockedLocal = (x, y) => (!_inZone(x, y)) ? true : (isRockTileLocal(x, y) || isWaterTileLocal(x, y));
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal, isWaterTileLocal });

const _SEEDCACHE = process.env.LAB_SEEDCACHE || '';
let seeds = null;
if (_SEEDCACHE && fs.existsSync(_SEEDCACHE)) { try { seeds = JSON.parse(fs.readFileSync(_SEEDCACHE, 'utf8')); } catch (e) { seeds = null; } }
if (!seeds) {
  const hard = T.getZoneVillages(Z) || [];
  const picked = P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
  seeds = [];
  for (const hv of picked) {
    const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
    if (!c) continue;
    let layout;
    try { if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62); layout = VillageLayout.generate(ta, c.ccx, c.ccy, P.INITIAL_POP, {}); } catch (e) { continue; }
    seeds.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy, lp: P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout),
      layout: { farmland: layout.farmland, dryfield: layout.dryfield, nongZone: layout.nongZone, territory: layout.territory,
                houses: (layout.houses || []).map((h) => ({ cx: h.cx, cy: h.cy })) } });
  }
  if (_SEEDCACHE) { try { fs.writeFileSync(_SEEDCACHE, JSON.stringify(seeds)); } catch (e) {} }
}
const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
R('server/trees').attachToWorld(world);
{ const _tw = parseFloat(process.env.T191_TOOLWEAR || ''); if (Number.isFinite(_tw) && _tw > 0 && _tw !== 1) world.toolWearMul = _tw; }
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;

// ── 장부 읽기
const types = new Map((T.getZoneVillages(Z) || []).map((v) => [v.name, v.type]));
const byName = new Map(world.villages.map((v, i) => [v.name, i]));
const M = world.villages.map((v) => ({ name: v.name, type: types.get(v.name) || '?', eat: {}, prod: {}, tin: {}, tout: {}, stock0: null,
  hungerDays: 0, famineDays: 0, pop0: v.npcs.length, popMax: v.npcs.length, popMin: v.npcs.length, deadDay: null,
  partners: new Map(), stoneFloor: false }));
const add = (o, r, x) => { if (x > 0) o[r] = (o[r] || 0) + x; };
const FOOD = new Set();
const snapStock = (v) => Object.fromEntries(Object.entries(v.storage || {}).filter(([r]) => r.charCodeAt(0) !== 95).map(([r, x]) => [r, +x || 0]));
world.villages.forEach((v, i) => { M[i].stock0 = snapStock(v); });
const _STONE_FLOOR = R('server/livelihood').FLOOR.stone;
world.villages.forEach((v, i) => { M[i].stoneFloor = (v.land && v.land.stone || 0) <= _STONE_FLOOR + 1e-9; M[i].land = { ...(v.land || {}) }; });

const _log = console.log; console.log = () => {};
for (let day = 0; day < DAYS; day++) {
  econV2.tickWorldV2(world);
  world.villages.forEach((v, i) => {
    const m = M[i], n = (v.npcs || []).length;
    for (const [r, x] of Object.entries(v._foodEaten || {})) { if (x > 0) { FOOD.add(r); add(m.eat, r, x); } }
    for (const [r, x] of Object.entries(v.dailyProductionBuf || {})) add(m.prod, r, +x || 0);
    if (n > m.popMax) m.popMax = n;
    if (n < m.popMin) m.popMin = n;
    if (n === 0 && m.deadDay == null && v._everPop) m.deadDay = world.day;
    if (n > 0 && (v.hunger || 0) > 0) m.hungerDays++;
    if (n > 0 && econ.totalFoodEquivalent(v) < n * 30) m.famineDays++;
  });
  const TL = world.tradeLog || [];
  for (let k = TL.length - 1; k >= 0; k--) {
    const e = TL[k];
    if ((e.day | 0) !== (world.day | 0)) { if ((e.day | 0) < (world.day | 0)) break; else continue; }
    if (e.rerouted || e.abandoned) continue;
    const a = byName.get(e.from), b = byName.get(e.to);
    if (a == null || b == null) continue;
    if (e.sent && e.sent.amt > 0) { add(M[b].tin, e.sent.res, e.sent.amt); add(M[a].tout, e.sent.res, e.sent.amt); }
    if (e.bought && e.bought.amt > 0) { add(M[a].tin, e.bought.res, e.bought.amt); add(M[b].tout, e.bought.res, e.bought.amt); }
    for (const [x, y] of [[a, b], [b, a]]) {
      const p = M[x].partners.get(y) || { n: 0, dist: e.distance || 0, got: {} };
      p.n++; M[x].partners.set(y, p);
    }
    if (e.sent && e.sent.amt > 0) add(M[b].partners.get(a).got, e.sent.res, e.sent.amt);       // 받은 쪽 기준 — 식량 여부는 끝에 가른다
    if (e.bought && e.bought.amt > 0) add(M[a].partners.get(b).got, e.bought.res, e.bought.amt);
  }
}
console.log = _log;

const sumF = (o) => Object.entries(o).reduce((s, [r, x]) => s + (FOOD.has(r) ? x : 0), 0);
const out = world.villages.map((v, i) => {
  const m = M[i], s1 = snapStock(v);
  const st0 = sumF(m.stock0), st1 = sumF(s1);
  const partners = [...m.partners.entries()].map(([j, p]) => ({ name: world.villages[j].name, n: p.n, dist: p.dist, food: +sumF(p.got).toFixed(1) }));
  const foodPartners = partners.filter((p) => p.food > 0);
  return { name: m.name, type: m.type, stoneFloor: m.stoneFloor, land: { fertility: m.land.fertility, water: m.land.water, game: m.land.game, stone: m.land.stone, wood: m.land.wood, ore: m.land.ore },
    pop0: m.pop0, popMax: m.popMax, popMin: m.popMin, popEnd: (v.npcs || []).length, deadDay: m.deadDay,
    eat: +sumF(m.eat).toFixed(1), prod: +sumF(m.prod).toFixed(1), tin: +sumF(m.tin).toFixed(1), tout: +sumF(m.tout).toFixed(1),
    stock0: +st0.toFixed(1), stock1: +st1.toFixed(1), foodImportedStat: +(((v.tradeStats || {}).foodImported) || 0).toFixed(1),
    hungerDays: m.hungerDays, famineDays: m.famineDays,
    partners: partners.length, foodPartners: foodPartners.length,
    foodPartnerDistMed: foodPartners.length ? foodPartners.map((p) => p.dist).sort((a, b) => a - b)[foodPartners.length >> 1] : null,
    topFoodPartners: foodPartners.sort((a, b) => b.food - a.food).slice(0, 3),
    eatBy: Object.fromEntries(Object.entries(m.eat).map(([r, x]) => [r, +x.toFixed(1)])),
    prodFoodBy: Object.fromEntries(Object.entries(m.prod).filter(([r]) => FOOD.has(r)).map(([r, x]) => [r, +x.toFixed(1)])),
    tinBy: Object.fromEntries(Object.entries(m.tin).filter(([r]) => FOOD.has(r)).map(([r, x]) => [r, +x.toFixed(1)])) };
});
let pop = 0, dead = 0, ever = 0;
for (const v of world.villages) { const n = (v.npcs || []).length; pop += n; if (v._everPop) ever++; if (v._everPop && n <= 0) dead++; }
const res = { zone: Z, seed: SEED, days: DAYS, base: { pop, dead, ever }, vpop: world.villages.map((v) => ({ name: v.name, pop: v.npcs.length })),
  food: [...FOOD].sort(), villages: out };
if (process.env.T429_JSON) fs.writeFileSync(process.env.T429_JSON, JSON.stringify(res, null, 1));
console.log(`[T429] ${Z} 시드 ${SEED} · ${DAYS}일 · 인구 ${pop} · 소멸 ${dead}/${ever} · 식량 품목 ${FOOD.size}`);
for (const o of out.filter((x) => x.type === 'mining')) {
  const inflow = o.prod + o.tin;
  console.log(`  ${o.name.padEnd(6)} 인구 ${o.pop0}→${o.popMax}→${o.popEnd} · 먹음 ${o.eat} · 자급 ${o.prod} · 교역 유입 ${o.tin}(${inflow ? (o.tin / inflow * 100).toFixed(1) : '—'}%) · 유출 ${o.tout} · 곳간 ${o.stock0}→${o.stock1} · 굶은 날 ${o.hungerDays} · 기근문 ${o.famineDays} · 짝 ${o.partners}(식량 ${o.foodPartners})`);
}
