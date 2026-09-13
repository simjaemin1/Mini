#!/usr/bin/env node
// === scripts/cook-foodsec-ab.js — #21 ⓐ 값 판정 자료: 조리 식량안보 문턱의 반사실 A/B ==========
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). **레포 코드 0** —
//   반사실 팔은 **정본 소스를 읽어 그 한 줄만 바꾼 사본을 `require.cache` 에 심어** 만든다(파일 무접촉).
//
// 무엇을 묻나 — `cookTarget`(`sim/economy-sim.js:3639`) 의 ⓐ 식량안보 게이트는 두 수를 쓴다:
//     if (totalFoodEquivalent(v) < N * 35 || (v.storage.food || 0) < N * 8) return 0;
//   · `N * 8`  은 **정본 문법**이다 — 같은 파일 `:3285` `foodRich = v.storage.food > N * 8` 과 같은 자.
//   · `N * 35` 는 **고아**다 — 이 파일에서 `35` 가 쓰이는 자리가 그 한 줄뿐이고,
//     바로 옆 `:2394`(보존식 게이트)는 **같은 물음**을 `RESERVE_PC.food × DAILY_FOOD_CONSUMPTION`(=30일치)로 묻는다.
//   ⇒ 반사실 팔 `canon` 은 그 고아를 **정본 자**로 갈아 끼운다(새 수 0 — 값을 짓지 않고 **읽는다**).
//
// 실행: node scripts/cook-foodsec-ab.js [일수=800] [시드=1020]
//   ARM=base|canon      base = 정본 그대로(35) · canon = RESERVE_PC.food × DAILY_FOOD_CONSUMPTION
//   AB_SAMPLE=10  AB_JSON=/tmp/x.json
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/cfs-${process.pid}.db`;

const path = require('path');
const fs = require('fs');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

const ARM = process.env.ARM === 'canon' ? 'canon' : 'base';
const ECON_FILE = path.join(ROOT, 'sim', 'economy-sim.js');
const ORPHAN = 'if (totalFoodEquivalent(v) < N * 35 || (v.storage.food || 0) < N * 8) return 0;';
const CANON  = 'if (totalFoodEquivalent(v) < N * (RESERVE_PC.food || 30) * DAILY_FOOD_CONSUMPTION || (v.storage.food || 0) < N * 8) return 0;';
let _swapped = 0;
{
  let src = fs.readFileSync(ECON_FILE, 'utf8');
  const hits = src.split(ORPHAN).length - 1;
  if (hits !== 1) { console.error(`정본의 그 줄을 못 찾았다(일치 ${hits}) — 계측기가 낡았다`); process.exit(2); }
  if (ARM === 'canon') { src = src.replace(ORPHAN, CANON); _swapped = 1; }
  src += '\nmodule.exports.__ab = { cookTarget, COOK_SIDE_INGREDIENTS, stats: _computeVillageStats, RESERVE_PC, DAILY_FOOD_CONSUMPTION };\n';
  const m = new Module(ECON_FILE, null);
  m.filename = ECON_FILE; m.paths = Module._nodeModulePaths(path.dirname(ECON_FILE));
  require.cache[ECON_FILE] = m; m._compile(src, ECON_FILE); m.loaded = true;
}
const _av = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DAYS = parseInt(_av[0], 10) || 800;
const SEED = parseInt(_av[1], 10) || 1020;
const SAMPLE = parseInt(process.env.AB_SAMPLE || '10', 10) || 10;

const econ = R('sim/economy-sim');
const AB = econ.__ab;
const SIDES = AB.COOK_SIDE_INGREDIENTS.slice();
const DAYS30 = (AB.RESERVE_PC.food || 30) * AB.DAILY_FOOD_CONSUMPTION;

// ── 세계 — `t17-metrics.js` 와 같은 문 (시드 캐시) ───────────────────────────
const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econV2 = R('sim/economy-sim-v2');
const VillageLayout = R('server/village-layout');
const Villages = R('server/villages');
const Events = R('server/events');
const P = Villages.__labProbe;
const Z = 'hanbando', ZONE = ZONES[Z], SZ = P.SZ;
P.setZoneId(Z);
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWaterTileLocal = (x, y) => {
  if (ZONE.isOcean) return true;
  if (!_inZone(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; }
};
const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isTerrainBlockedLocal = (x, y) => (!_inZone(x, y)) ? true : (isRockTileLocal(x, y) || isWaterTileLocal(x, y));
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal, isWaterTileLocal });
const CACHE = process.env.LAB_SEEDCACHE || '/tmp/t163-seeds.json';
let seeds = null;
if (fs.existsSync(CACHE)) { try { seeds = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { seeds = null; } }
if (!seeds || !seeds.length) {
  const hard = T.getZoneVillages(Z) || [];
  const picked = P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
  seeds = [];
  for (const hv of picked) {
    const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
    if (!c) continue;
    let layout;
    try { if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62); layout = VillageLayout.generate(ta, c.ccx, c.ccy, P.INITIAL_POP, {}); } catch (e) { continue; }
    seeds.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy, lp: P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout) });
  }
  try { fs.writeFileSync(CACHE, JSON.stringify(seeds)); } catch (e) {}
}
const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
R('server/trees').attachToWorld(world);
const LAND = {};
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev); LAND[s.name] = { fert: s.lp.fertility, water: s.lp.water };
}
world.day = 0;
const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: Villages.playerVillageDepositMap(), onEvent: () => {} });
L.prime(world);

// ── 표본 ────────────────────────────────────────────────────────────────────
const H = new Map(), C = new Map();
let band = 0, bandTot = 0;                       // 식량등가/N 이 [30,35) 인 마을·일(문턱 사이 띠)
const _log = console.log; console.log = () => {};
for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world); L.scanDay(world, world.day, {});
  if (world.day % SAMPLE === 0) {
    for (const v of world.villages) {
      const n = (v.npcs || []).length; if (n <= 0) continue;
      if (v.lastStats && typeof v.lastStats.happiness === 'number') { let a = H.get(v.name); if (!a) H.set(v.name, a = []); a.push(v.lastStats.happiness); }
      let c = C.get(v.name); if (!c) C.set(v.name, c = { cooks: [], out: [], stock: [], stands: 0, n: 0 });
      let cooks = 0; for (const p of (v.npcs || [])) if (p.currentJob === 'cook') cooks++;
      c.cooks.push(cooks); c.out.push(v.dailyProductionBuf.cooked_food || 0); c.stock.push(v.storage.cooked_food || 0);
      const s = { npcs: new Array(n), storage: Object.assign({}, v.storage), dailyProductionBuf: Object.assign({}, v.dailyProductionBuf) };
      if (AB.cookTarget(s) > 0) c.stands++;
      c.n++;
      const feq = econ.totalFoodEquivalent(v) / n;
      bandTot++; if (feq >= DAYS30 && feq < 35) band++;
    }
  }
}
console.log = _log;

let pop = 0, dead = 0, ever = 0, weapQ = 0, expand = 0, toolQ = 0;
for (const v of world.villages) {
  const n = (v.npcs || []).length; pop += n;
  if (v._everPop) ever++;
  if (v._everPop && n <= 0) dead++;
  weapQ += (v.storage.weapon || 0) * (v._weapQ != null ? v._weapQ : 1);
  expand += v.expansions || 0;
  toolQ += ((v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0)) * (v._toolQ != null ? v._toolQ : 1);
}
const PRESERVED = ['dried_fish', 'dried_fruit', 'smoked_meat', 'pickled_veg'];
const presStock = world.villages.reduce((a, v) => a + PRESERVED.reduce((b, r) => b + (v.storage[r] || 0), 0), 0);
const live = world.villages.filter((v) => (v.npcs || []).length > 0).length;
const S = L.stats, daysPer = 1 / Math.max(1e-9, S.emitted / Math.max(1, live * S.days));
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (x) => (100 * x).toFixed(1) + '%';

const V = world.villages.map((v) => ({ name: v.name, pop: (v.npcs || []).length, land: LAND[v.name] || {}, hMed: med(H.get(v.name) || []) })).filter((x) => x.hMed != null);
const byH = V.slice().sort((a, b) => a.hMed - b.hMed);
const BOT = byH.slice(0, 10).map((x) => x.name), TOP = byH.slice(-5).map((x) => x.name);
const sum = (names, k) => names.reduce((a, nm) => { const c = C.get(nm); return a + (c ? c[k].reduce((x, y) => x + y, 0) / Math.max(1, c[k].length) : 0); }, 0);
const standsOf = (names) => { let s = 0, n = 0; for (const nm of names) { const c = C.get(nm); if (c) { s += c.stands; n += c.n; } } return n ? s / n : 0; };
const cookedTot = world.villages.reduce((a, v) => a + (v.storage.cooked_food || 0), 0);
const cooksTot = world.villages.reduce((a, v) => a + (v.npcs || []).filter((p) => p.currentJob === 'cook').length, 0);

console.log(`\n=== 조리 식량안보 문턱 A/B — 서버 ${seeds.length}곳 · 시드 ${SEED} · ${DAYS}일 · 팔 **${ARM}**${ARM === 'canon' ? `(정본 자 ${DAYS30}일치)` : '(정본 그대로 35)'} ===`);
console.log(`  여덟 수   인구 ${pop} · 소멸 ${dead}/${ever} · 무기Q ${weapQ.toFixed(0)} · 확장셀 ${expand}`);
console.log(`            게시 ${S.reqOpened} · 일/건 ${daysPer.toFixed(2)} · 도구Q ${toolQ.toFixed(1)} · 보존식 ${presStock.toFixed(1)}`);
console.log(`  조리      요리사 ${cooksTot}명 · cooked_food 재고 ${cookedTot.toFixed(0)} · cookTarget 선다 전체 ${pct(standsOf(V.map((x) => x.name)))} · 하위10 ${pct(standsOf(BOT))} · 상위5 ${pct(standsOf(TOP))}`);
console.log(`  하위 10곳 요리사 평균합 ${sum(BOT, 'cooks').toFixed(2)} · 조리식/일 합 ${sum(BOT, 'out').toFixed(2)} · 재고 합 ${sum(BOT, 'stock').toFixed(1)}`);
console.log(`  행복      중앙 ${med(V.map((x) => x.hMed)).toFixed(3)} · 하위10 중앙 ${med(BOT.map((nm) => V.find((x) => x.name === nm).hMed)).toFixed(3)} · 0.5 미만 마을 ${V.filter((x) => x.hMed < 0.5).length}/${V.length}`);
console.log(`  문턱 사이 띠(식량등가/N ∈ [${DAYS30},35))  ${band}/${bandTot} 마을·일 = ${pct(band / Math.max(1, bandTot))}   ← ${ARM === 'base' ? '이 띠가 canon 팔에서 새로 열린다' : '이 팔에선 이미 열려 있다'}`);
console.log(`  바꾼 줄   ${_swapped ? 'canon: N × RESERVE_PC.food(' + AB.RESERVE_PC.food + ') × DAILY_FOOD_CONSUMPTION(' + AB.DAILY_FOOD_CONSUMPTION + ')' : 'base: N × 35 (정본 그대로 · 치환 0)'}`);
if (process.env.AB_JSON) {
  fs.writeFileSync(process.env.AB_JSON, JSON.stringify({ arm: ARM, seed: SEED, days: DAYS,
    eight: { pop, dead, ever, weapQ, expand, toolQ, presStock, reqOpened: S.reqOpened, daysPer },
    cooksTot, cookedTot, standsAll: standsOf(V.map((x) => x.name)), standsBot: standsOf(BOT), standsTop: standsOf(TOP),
    botCooks: sum(BOT, 'cooks'), botOut: sum(BOT, 'out'), botStock: sum(BOT, 'stock'),
    hMed: med(V.map((x) => x.hMed)), below: V.filter((x) => x.hMed < 0.5).length, band, bandTot, bottom: BOT, top: TOP }, null, 1));
  console.log(`\n  [JSON] ${process.env.AB_JSON}`);
}
