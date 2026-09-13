#!/usr/bin/env node
// === scripts/t253-cook-side-list-ab.js — #21 ⓑ 자료: 부재료 목록에 셋을 넣으면 무엇이 바뀌나 =====
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). **레포 코드 0** —
//   반사실 팔은 **정본 소스를 읽어 목록 한 줄만 바꾼 사본을 `require.cache` 에 심어** 만든다(파일 무접촉).
//   뼈대는 판정21a 의 `scripts/cook-foodsec-ab.js` 그대로다(세계 문·여덟 수·표본 문법 · 사본 0).
//
// 무엇을 묻나 — T236 이 쟀다: 어촌이 `salmon` 을 25~114건 내륙으로 싣는데, 그 셋
//   (`salmon`·`crab`·`shrimp`)이 `COOK_SIDE_INGREDIENTS`(`sim/economy-sim.js:181`) **밖**이다.
//   넣으면 **새 교역 0 · 새 수 0** 으로 지금 흐르는 화물이 부재료가 된다. 다만 그 셋은
//   `FORAGE_FOOD_FACTOR` 에 이미 있어서(**연어 0.7 · 게 0.35 · 새우 0.35**) 식량등가에 **든다** —
//   부재료로 0.5 씩 먹히면 그만큼 식량 쪽에서 빠진다. 그 몫을 재는 것이 이 계측기다.
//   ★값은 안 바꾼다. 켤지는 재민(판정대기 #21 ⓑ).
//
// 실행: node scripts/t253-cook-side-list-ab.js [일수=800] [시드=1020]
//   ARM=base|list       base = 목록 그대로(치환 0) · list = 셋 추가
//   AB_SAMPLE=10        무거운 표본 간격(일). 셋의 흐름은 **날마다** 센다.
//   AB_JSON=/tmp/x.json
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t253-${process.pid}.db`;

const path = require('path');
const fs = require('fs');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

const ARM = process.env.ARM === 'list' ? 'list' : 'base';
const ECON_FILE = path.join(ROOT, 'sim', 'economy-sim.js');
const ADD = ['salmon', 'crab', 'shrimp'];
// ★정본 그 한 줄. 자기검사 — 정확히 한 번이 아니면 멈춘다(계측기가 낡으면 조용히 틀리지 않게).
const ORPHAN = "const COOK_SIDE_INGREDIENTS = ['fruit', 'vegetable', 'mushroom', 'meat', 'fish', 'twig'];";
const LIST   = "const COOK_SIDE_INGREDIENTS = ['fruit', 'vegetable', 'mushroom', 'meat', 'fish', 'twig', 'salmon', 'crab', 'shrimp'];";
let _swapped = 0;
{
  let src = fs.readFileSync(ECON_FILE, 'utf8');
  const hits = src.split(ORPHAN).length - 1;
  if (hits !== 1) { console.error(`정본의 그 줄을 못 찾았다(일치 ${hits}) — 계측기가 낡았다`); process.exit(2); }
  if (ARM === 'list') { src = src.replace(ORPHAN, LIST); _swapped = 1; }
  src += '\nmodule.exports.__t253 = { cookTarget, COOK_SIDE_INGREDIENTS, stats: _computeVillageStats, RESERVE_PC, DAILY_FOOD_CONSUMPTION, FORAGE_FOOD_FACTOR };\n';
  const m = new Module(ECON_FILE, null);
  m.filename = ECON_FILE; m.paths = Module._nodeModulePaths(path.dirname(ECON_FILE));
  require.cache[ECON_FILE] = m; m._compile(src, ECON_FILE); m.loaded = true;
}
const _av = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DAYS = parseInt(_av[0], 10) || 800;
const SEED = parseInt(_av[1], 10) || 1020;
const SAMPLE = parseInt(process.env.AB_SAMPLE || '10', 10) || 10;

const econ = R('sim/economy-sim');
const AB = econ.__t253;
const SIDES = AB.COOK_SIDE_INGREDIENTS.slice();          // ★정본 표 그대로(손으로 안 적는다)
const FEQ = AB.FORAGE_FOOD_FACTOR;

// ── 세계 — `cook-foodsec-ab.js`·`t236-side.js` 와 **같은 문**(족보 130 · 사본 0) ─────────
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
//   ★셋의 행선 — 날마다 센다. 엔진에 훅이 없으므로(T236 §머리) **정본이 이미 적어 두는 두 장부**를 읽는다:
//     생산 `v.dailyProductionBuf[r]` · 먹힘 `v._foodEaten[r]`(consumeFood 가 그날 먹은 군별 몫을 적는다).
//     팔림은 `world.caravans` 를 날마다 훑어 **새 leg** 를 센다(T236 문법 · 관측만).
//     나머지(Δ재고로 남는 것)는 **부패 + 부재료**다 — 이 둘은 훅 없이 못 가른다.
//     ⇒ base 팔의 '그 밖'은 **순수 부패**이고, `list − base` 가 곧 **부재료가 가져간 몫**이다(그게 이 카드의 물음).
const FLOW = {}; for (const r of ADD) FLOW[r] = { prod: 0, eat: 0, sold: 0, d0: 0, dEnd: 0 };
const seenLeg = new Set();
const isFish = (nm) => /어촌|해안|포구/.test(String(nm || ''));
let gateHitF = 0, gateTotF = 0;             // ⓐ 식량안보 게이트에 걸리는 **어촌**·일
const feqF = [];                            // 어촌 식량등가/N 표본
const _log = console.log; console.log = () => {};
for (const v of world.villages) for (const r of ADD) FLOW[r].d0 += (v.storage[r] || 0);
for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world); L.scanDay(world, world.day, {});
  // ① 셋의 흐름 — 날마다
  for (const v of world.villages) {
    const dp = v.dailyProductionBuf || {}, fe = v._foodEaten || {};
    for (const r of ADD) { FLOW[r].prod += dp[r] || 0; FLOW[r].eat += fe[r] || 0; }
  }
  for (const c of (world.caravans || [])) {
    if (seenLeg.has(c.id)) continue;
    seenLeg.add(c.id);
    if (FLOW[c.giveRes]) FLOW[c.giveRes].sold += (c.giveAmt || 0);
  }
  // ② 무거운 표본
  if (world.day % SAMPLE === 0) {
    for (const v of world.villages) {
      const n = (v.npcs || []).length; if (n <= 0) continue;
      if (v.lastStats && typeof v.lastStats.happiness === 'number') { let a = H.get(v.name); if (!a) H.set(v.name, a = []); a.push(v.lastStats.happiness); }
      let c = C.get(v.name); if (!c) C.set(v.name, c = { cooks: [], out: [], stock: [], stands: 0, n: 0, fish: isFish(v.name) });
      let cooks = 0; for (const p of (v.npcs || [])) if (p.currentJob === 'cook') cooks++;
      c.cooks.push(cooks); c.out.push(v.dailyProductionBuf.cooked_food || 0); c.stock.push(v.storage.cooked_food || 0);
      const s = { npcs: new Array(n), storage: Object.assign({}, v.storage), dailyProductionBuf: Object.assign({}, v.dailyProductionBuf) };
      if (AB.cookTarget(s) > 0) c.stands++;
      c.n++;
      // ⓐ 식량안보 게이트(정본 그 줄의 두 항) — 어촌만
      if (c.fish) {
        const feq = econ.totalFoodEquivalent(v);
        feqF.push(feq / n);
        gateTotF++; if (feq < n * 35 || (v.storage.food || 0) < n * 8) gateHitF++;
      }
    }
  }
}
for (const v of world.villages) for (const r of ADD) FLOW[r].dEnd += (v.storage[r] || 0);
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

const V = world.villages.map((v) => ({ name: v.name, pop: (v.npcs || []).length, hMed: med(H.get(v.name) || []) })).filter((x) => x.hMed != null);
const byH = V.slice().sort((a, b) => a.hMed - b.hMed);
const BOT = byH.slice(0, 10).map((x) => x.name), TOP = byH.slice(-5).map((x) => x.name);
const FISHN = V.map((x) => x.name).filter(isFish);
const sum = (names, k) => names.reduce((a, nm) => { const c = C.get(nm); return a + (c ? c[k].reduce((x, y) => x + y, 0) / Math.max(1, c[k].length) : 0); }, 0);
const standsOf = (names) => { let s = 0, n = 0; for (const nm of names) { const c = C.get(nm); if (c) { s += c.stands; n += c.n; } } return n ? s / n : 0; };
const cookedTot = world.villages.reduce((a, v) => a + (v.storage.cooked_food || 0), 0);
const cooksTot = world.villages.reduce((a, v) => a + (v.npcs || []).filter((p) => p.currentJob === 'cook').length, 0);
const feqFishMed = med(feqF);
// ★셋의 행선 — **세계 하나의 장부**다. 교역은 마을 A→B 라 **세계에선 사라지지 않는다**(첫 판에서
//   '팔림'을 소진으로 빼서 그 밖이 음수로 나왔다 — 그게 오독이었다). 그래서:
//     생산 + 처음재고 = 먹힘 + 끝재고 + **그 밖**(부패 + 수송손실 · list 팔에선 여기에 부재료가 더해진다)
//   ⇒ 그래서 `list − base` 의 '그 밖' 차이가 곧 **부재료가 가져간 몫**이다(훅 없이 가를 수 있는 유일한 자리).
//   '실림'은 소진이 아니라 **흐름량**이라 따로 적는다(내륙에 얼마나 가 있나 — T236 의 그 물음).
const fate = {};
for (const r of ADD) {
  const f = FLOW[r];
  const denom = Math.max(1e-9, f.prod + f.d0);
  const other = f.prod + f.d0 - f.eat - f.dEnd;      // 부패 + 수송손실 (+ list 팔에선 부재료)
  fate[r] = { prod: f.prod, eat: f.eat, sold: f.sold, other, stock: f.dEnd,
    eatPc: f.eat / denom, soldPc: f.sold / denom, otherPc: other / denom, stockPc: f.dEnd / denom };
}
const fSum = (k) => ADD.reduce((a, r) => a + fate[r][k], 0);
const fDenom = Math.max(1e-9, fSum('prod') + ADD.reduce((a, r) => a + FLOW[r].d0, 0));

console.log(`\n=== 부재료 목록 A/B — 서버 ${seeds.length}곳 · 시드 ${SEED} · ${DAYS}일 · 팔 **${ARM}**${ARM === 'list' ? '(셋 추가)' : '(정본 그대로 · 치환 0)'} ===`);
console.log(`  부재료 목록  ${SIDES.join(' · ')}   (${SIDES.length}종 · 조리 한 번에 최대 5종 × 0.5)`);
console.log(`  여덟 수   인구 ${pop} · 소멸 ${dead}/${ever} · 무기Q ${weapQ.toFixed(0)} · 확장셀 ${expand}`);
console.log(`            게시 ${S.reqOpened} · 일/건 ${daysPer.toFixed(2)} · 도구Q ${toolQ.toFixed(1)} · 보존식 ${presStock.toFixed(1)}`);
console.log(`  조리      요리사 ${cooksTot}명 · cooked_food 재고 ${cookedTot.toFixed(0)} · cookTarget 선다 전체 ${pct(standsOf(V.map((x) => x.name)))} · 하위10 ${pct(standsOf(BOT))} · 상위5 ${pct(standsOf(TOP))}`);
console.log(`  하위 10곳 요리사 평균합 ${sum(BOT, 'cooks').toFixed(2)} · 조리식/일 합 ${sum(BOT, 'out').toFixed(2)} · 재고 합 ${sum(BOT, 'stock').toFixed(1)}`);
console.log(`  어촌 ${FISHN.length}곳  식량등가/N 중앙 ${feqFishMed == null ? '—' : feqFishMed.toFixed(1)} · ⓐ게이트 걸림 ${pct(gateHitF / Math.max(1, gateTotF))} (${gateHitF}/${gateTotF} 마을·일) · 선다 ${pct(standsOf(FISHN))}`);
console.log(`  행복      중앙 ${med(V.map((x) => x.hMed)).toFixed(3)} · 하위10 중앙 ${med(BOT.map((nm) => V.find((x) => x.name === nm).hMed)).toFixed(3)} · 0.5 미만 ${V.filter((x) => x.hMed < 0.5).length}/${V.length}`);
console.log(`  셋의 행선(생산+처음재고 기준 · 열량계수 연어 ${FEQ.salmon} 게 ${FEQ.crab} 새우 ${FEQ.shrimp})`);
for (const r of ADD) {
  const f = fate[r];
  console.log(`    ${r.padEnd(7)} 생산 ${f.prod.toFixed(0)} · 먹힘 ${pct(f.eatPc)} · 끝재고 ${pct(f.stockPc)} · 그 밖(부패+수송손실${ARM === 'list' ? '+**부재료**' : ''}) ${pct(f.otherPc)} · [실림 ${pct(f.soldPc)} — 소진 아님]`);
}
console.log(`    합계    먹힘 ${pct(fSum('eat') / fDenom)} · 끝재고 ${pct(fSum('stock') / fDenom)} · 그 밖 ${pct(fSum('other') / fDenom)} · [실림 ${pct(fSum('sold') / fDenom)}]`);
console.log(`  바꾼 줄   ${_swapped ? 'list: 목록에 ' + ADD.join('·') + ' 셋 추가(치환 1)' : 'base: 정본 목록 그대로(치환 0)'}`);
if (process.env.AB_JSON) {
  fs.writeFileSync(process.env.AB_JSON, JSON.stringify({ arm: ARM, seed: SEED, days: DAYS, sides: SIDES,
    eight: { pop, dead, ever, weapQ, expand, toolQ, presStock, reqOpened: S.reqOpened, daysPer },
    cooksTot, cookedTot, standsAll: standsOf(V.map((x) => x.name)), standsBot: standsOf(BOT), standsTop: standsOf(TOP),
    standsFish: standsOf(FISHN), fishN: FISHN.length, feqFishMed, gateHitF, gateTotF,
    botCooks: sum(BOT, 'cooks'), botOut: sum(BOT, 'out'), botStock: sum(BOT, 'stock'),
    hMed: med(V.map((x) => x.hMed)), below: V.filter((x) => x.hMed < 0.5).length,
    fate, flow: FLOW, bottom: BOT, top: TOP, fish: FISHN }, null, 1));
  console.log(`\n  [JSON] ${process.env.AB_JSON}`);
}
