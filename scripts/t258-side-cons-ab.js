#!/usr/bin/env node
// === scripts/t258-side-cons-ab.js — T258: 부재료 소비를 흐름-EMA 에 실으면 무엇이 보이나 ==========
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
// ⚠세계는 `cook-foodsec-ab.js`·`t253-cook-side-list-ab.js`·`t236-side.js` 와 **같은 문**(족보 130 · 사본 0).
// ⚠**소스 치환 0** — 이 카드의 팔은 **진짜 손잡이**다(`T258_SIDE_CONS` · `_allocKnob` 문법 · 기본 끔).
//   그래서 T253 처럼 `require.cache` 에 사본을 심지 않는다. 내보내기 줄만 붙인다(파일 무접촉).
//
// 무엇을 묻나 — 요리사 본체의 `storage[r] −= 0.5` 에 `_cons` 가 없었다(T253 §0-ⓐ-2).
//   `_consEMA` 를 읽는 자리는 v2 에 **셋**이고(`:362` 그림자가격 · `:470` 가격 target · `:1252` 과잉부패 보호),
//   셋 다 `flowT = SUBSISTENCE_PER_NPC[r] ? 0 : _consEMA[r] × 30` 이라 **subs 등재 품목은 안 바뀐다**.
//   ⇒ 부재료 6종 중 `mushroom`(specialty subsistence 0.3)은 무변이고 나머지 다섯이 움직인다 — 그걸 잰다.
//
// 실행: node scripts/t258-side-cons-ab.js [일수=800] [시드=1020]
//   ARM=off|on          off = 손잡이 미설정(기본) · on = `T258_SIDE_CONS=1`
//   AB_SAMPLE=10  AB_JSON=/tmp/x.json
'use strict';
const ARM = process.env.ARM === 'on' ? 'on' : 'off';
if (ARM === 'on') process.env.T258_SIDE_CONS = '1'; else delete process.env.T258_SIDE_CONS;
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t258-${process.pid}.db`;

const path = require('path');
const fs = require('fs');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

// ── ★정본 한 인스턴스 + 내보내기 줄(파일 무접촉 · T204/T236/T253 문법 · **치환 0**) ────
const ECON_FILE = path.join(ROOT, 'sim', 'economy-sim.js');
{
  const src = fs.readFileSync(ECON_FILE, 'utf8')
    + '\nmodule.exports.__t258 = { cookTarget, COOK_SIDE_INGREDIENTS, sideConsOn, stats: _computeVillageStats };\n';
  const m = new Module(ECON_FILE, null);
  m.filename = ECON_FILE; m.paths = Module._nodeModulePaths(path.dirname(ECON_FILE));
  require.cache[ECON_FILE] = m; m._compile(src, ECON_FILE); m.loaded = true;
}
const _av = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DAYS = parseInt(_av[0], 10) || 800;
const SEED = parseInt(_av[1], 10) || 1020;
const SAMPLE = parseInt(process.env.AB_SAMPLE || '10', 10) || 10;

const econ = R('sim/economy-sim');
const CK = econ.__t258;
const SIDES = CK.COOK_SIDE_INGREDIENTS.slice();          // ★정본 표 그대로
const KNOB_ON = CK.sideConsOn();                          // ★정본 손잡이에게 직접 묻는다(손으로 안 적는다)
if (KNOB_ON !== (ARM === 'on')) { console.error(`손잡이 상태가 팔과 안 맞는다(ARM=${ARM} · sideConsOn=${KNOB_ON})`); process.exit(2); }

// ── 세계 ────────────────────────────────────────────────────────────────────
const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econV2 = R('sim/economy-sim-v2');
const SUBS = econV2.SUBSISTENCE_PER_NPC;                  // ★정본 표(재구현 0) — flowT 의 subs 가드
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
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;
const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: Villages.playerVillageDepositMap(), onEvent: () => {} });
L.prime(world);

// ── 표본 ────────────────────────────────────────────────────────────────────
const H = new Map(), C = new Map();
const SIDESET = new Set(SIDES);
const FLOW = {}; for (const r of SIDES) FLOW[r] = { prod: 0, eat: 0, d0: 0, dEnd: 0 };
let legAll = 0, legSide = 0, legSideAmt = 0, legAllAmt = 0;
const seenLeg = new Set();
const _log = console.log; console.log = () => {};
for (const v of world.villages) for (const r of SIDES) FLOW[r].d0 += (v.storage[r] || 0);
for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world); L.scanDay(world, world.day, {});
  for (const v of world.villages) {
    const dp = v.dailyProductionBuf || {}, fe = v._foodEaten || {};
    for (const r of SIDES) { FLOW[r].prod += dp[r] || 0; FLOW[r].eat += fe[r] || 0; }
  }
  for (const c of (world.caravans || [])) {
    if (seenLeg.has(c.id)) continue;
    seenLeg.add(c.id);
    legAll++; legAllAmt += (c.giveAmt || 0);
    if (SIDESET.has(c.giveRes)) { legSide++; legSideAmt += (c.giveAmt || 0); }
  }
  if (world.day % SAMPLE === 0) {
    for (const v of world.villages) {
      const n = (v.npcs || []).length; if (n <= 0) continue;
      if (v.lastStats && typeof v.lastStats.happiness === 'number') { let a = H.get(v.name); if (!a) H.set(v.name, a = []); a.push(v.lastStats.happiness); }
      let c = C.get(v.name); if (!c) C.set(v.name, c = { cooks: [], out: [], stock: [], stands: 0, n: 0 });
      let cooks = 0; for (const p of (v.npcs || [])) if (p.currentJob === 'cook') cooks++;
      c.cooks.push(cooks); c.out.push(v.dailyProductionBuf.cooked_food || 0); c.stock.push(v.storage.cooked_food || 0);
      const s = { npcs: new Array(n), storage: Object.assign({}, v.storage), dailyProductionBuf: Object.assign({}, v.dailyProductionBuf) };
      if (CK.cookTarget(s) > 0) c.stands++;
      c.n++;
    }
  }
}
for (const v of world.villages) for (const r of SIDES) FLOW[r].dEnd += (v.storage[r] || 0);
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
const pct = (x) => (100 * x).toFixed(2) + '%';

const V = world.villages.map((v) => ({ name: v.name, hMed: med(H.get(v.name) || []) })).filter((x) => x.hMed != null);
const byH = V.slice().sort((a, b) => a.hMed - b.hMed);
const BOT = byH.slice(0, 10).map((x) => x.name), TOP = byH.slice(-5).map((x) => x.name);
const sum = (names, k) => names.reduce((a, nm) => { const c = C.get(nm); return a + (c ? c[k].reduce((x, y) => x + y, 0) / Math.max(1, c[k].length) : 0); }, 0);
const standsOf = (names) => { let s = 0, n = 0; for (const nm of names) { const c = C.get(nm); if (c) { s += c.stands; n += c.n; } } return n ? s / n : 0; };
const cookedTot = world.villages.reduce((a, v) => a + (v.storage.cooked_food || 0), 0);
const cooksTot = world.villages.reduce((a, v) => a + (v.npcs || []).filter((p) => p.currentJob === 'cook').length, 0);

// ── 부재료 6종의 흐름-EMA · subs 가드 · 그 밖 ────────────────────────────────
const ema = {};
for (const r of SIDES) {
  const vals = world.villages.filter((v) => (v.npcs || []).length > 0).map((v) => ((v._consEMA || {})[r] || 0));
  const nz = vals.filter((x) => x > 0).length;
  const f = FLOW[r], denom = Math.max(1e-9, f.prod + f.d0);
  ema[r] = { med: med(vals), max: Math.max(0, ...vals), nz, n: vals.length,
    subs: SUBS[r] || 0, flowTUsed: !SUBS[r],
    prod: f.prod, eat: f.eat, stock: f.dEnd,
    eatPc: f.eat / denom, stockPc: f.dEnd / denom, otherPc: (f.prod + f.d0 - f.eat - f.dEnd) / denom };
}

console.log(`\n=== 부재료 흐름-EMA A/B — 서버 ${seeds.length}곳 · 시드 ${SEED} · ${DAYS}일 · 팔 **${ARM}**${ARM === 'on' ? '(T258_SIDE_CONS=1)' : '(손잡이 미설정 = 기본)'} ===`);
console.log(`  여덟 수   인구 ${pop} · 소멸 ${dead}/${ever} · 무기Q ${weapQ.toFixed(0)} · 확장셀 ${expand}`);
console.log(`            게시 ${S.reqOpened} · 일/건 ${daysPer.toFixed(2)} · 도구Q ${toolQ.toFixed(1)} · 보존식 ${presStock.toFixed(1)}`);
console.log(`  조리      요리사 ${cooksTot}명 · cooked_food 재고 ${cookedTot.toFixed(0)} · 선다 전체 ${pct(standsOf(V.map((x) => x.name)))} · 하위10 ${pct(standsOf(BOT))} · 상위5 ${pct(standsOf(TOP))}`);
console.log(`  하위 10곳 요리사 평균합 ${sum(BOT, 'cooks').toFixed(2)} · 조리식/일 합 ${sum(BOT, 'out').toFixed(2)} · 재고 합 ${sum(BOT, 'stock').toFixed(1)}`);
console.log(`  행복      중앙 ${med(V.map((x) => x.hMed)).toFixed(3)} · 하위10 중앙 ${med(BOT.map((nm) => V.find((x) => x.name === nm).hMed)).toFixed(3)} · 0.5 미만 ${V.filter((x) => x.hMed < 0.5).length}/${V.length}`);
console.log(`  캐러밴    leg 전체 ${legAll} · 부재료 leg ${legSide}(${pct(legSide / Math.max(1, legAll))}) · 실린 양 ${pct(legSideAmt / Math.max(1e-9, legAllAmt))}`);
console.log(`  부재료 6종 — 흐름-EMA(마을 중앙 · >0 마을 수) · subs 가드 · 행선`);
for (const r of SIDES) {
  const e = ema[r];
  console.log(`    ${r.padEnd(10)} EMA 중앙 ${e.med.toFixed(4)} · 최대 ${e.max.toFixed(3)} · >0 ${e.nz}/${e.n}곳`
    + ` · subs ${e.subs ? e.subs.toFixed(4) + '(가드 ON — flowT 무시)' : '없음(flowT 적용)'}`
    + ` · 생산 ${e.prod.toFixed(0)} 먹힘 ${pct(e.eatPc)} 끝재고 ${pct(e.stockPc)} 그밖 ${pct(e.otherPc)}`);
}
console.log(`  손잡이    ${KNOB_ON ? 'T258_SIDE_CONS=1 (부재료 차감이 _cons 에 실린다)' : '미설정 — 정본 기본(끔 · 비트 동일)'}`);
if (process.env.AB_JSON) {
  fs.writeFileSync(process.env.AB_JSON, JSON.stringify({ arm: ARM, knob: KNOB_ON, seed: SEED, days: DAYS, sides: SIDES,
    eight: { pop, dead, ever, weapQ, expand, toolQ, presStock, reqOpened: S.reqOpened, daysPer },
    cooksTot, cookedTot, standsAll: standsOf(V.map((x) => x.name)), standsBot: standsOf(BOT), standsTop: standsOf(TOP),
    botCooks: sum(BOT, 'cooks'), botOut: sum(BOT, 'out'), botStock: sum(BOT, 'stock'),
    hMed: med(V.map((x) => x.hMed)), below: V.filter((x) => x.hMed < 0.5).length,
    legAll, legSide, legSideAmt, legAllAmt, ema, bottom: BOT, top: TOP }, null, 1));
  console.log(`\n  [JSON] ${process.env.AB_JSON}`);
}
