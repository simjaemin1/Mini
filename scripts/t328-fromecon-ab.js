#!/usr/bin/env node
// === scripts/t328-fromecon-ab.js — T328: `fromEcon` 일곱 줄 반사실(같은 세계 · 장부 둘) ==========
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
// ⚠세계는 `t302-fromecon-ab.js` 와 **같은 문**(족보 130 · 사본 0) — 그 파일에서 갈라져 나왔다.
// ⚠**소스 치환 0** · **레포 코드 0**: 이 계측기가 재는 것은 `villages.playerVillageDepositMap()` 이
//   장부에 **주입되는 지점** 하나다. 주입을 바꾸는 것은 계측기 안이고, 정본 파일은 무접촉이다.
//
// 무엇을 묻나 — T328 이 표에 더한 일곱 줄(`wheat`·`rice`·`barley`·`chestnut`·`grape`·`mulberry_fruit`·`acorn`)이
//   **실제로 게시되나**. `인계/E-사건장부.md` 15-벽 이 잰 벽(사다리 24 중 15종은 낼 수가 없다)에서
//   다섯이 빠졌다 — 그런데 벽이 열렸다고 의뢰가 서는 것은 아니다:
//   게시는 `_consEMA > 0` 이 먼저다(14-흐름눈 규약 1). **그 둘은 다른 질문이고, 이 계측기는 뒤를 잰다.**
//
// 실행: node scripts/t328-fromecon-ab.js [일수=800] [시드=1020]
//   SEVEN=1|0   1 = 정본 표 그대로(일곱 줄 있음 · 이 카드 뒤) · 0 = 일곱 줄을 뺀 반사실(이 카드 전 = T302 판)
//   AB_SAMPLE=10  AB_JSON=/tmp/x.json
'use strict';
// ★팔은 **하나뿐**이다(`FIVE`). T258/T263/T274 손잡이는 main 에 없다 — 여기서 부르지 않는다.
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
    + '\nmodule.exports.__t302 = { cookTarget, COOK_SIDE_INGREDIENTS, FORAGE_FOOD_FACTOR, RAW_GRAINS, PRESERVED_FOODS, stats: _computeVillageStats };\n';
  const m = new Module(ECON_FILE, null);
  m.filename = ECON_FILE; m.paths = Module._nodeModulePaths(path.dirname(ECON_FILE));
  require.cache[ECON_FILE] = m; m._compile(src, ECON_FILE); m.loaded = true;
}
const _av = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DAYS = parseInt(_av[0], 10) || 800;
const SEED = parseInt(_av[1], 10) || 1020;
const SAMPLE = parseInt(process.env.AB_SAMPLE || '10', 10) || 10;

const econ = R('sim/economy-sim');
const CK = econ.__t302;
// ★재는 품목은 **사다리가 실제로 빼는 것 전수**다 — 손으로 안 적고 정본 표에서 모은다(사본 0).
const TRACK = Array.from(new Set(
  ['cooked_food', 'fish', 'meat', 'food']
    .concat(CK.RAW_GRAINS).concat(Object.keys(CK.FORAGE_FOOD_FACTOR)).concat(CK.PRESERVED_FOODS)
    .concat(CK.COOK_SIDE_INGREDIENTS)));
const SIDES = CK.COOK_SIDE_INGREDIENTS.slice();
// ★**식사 사다리**만 따로 — 벽은 사다리로 센다(`TRACK` 은 조리 부재료까지 포함해 더 넓다).
const LADDER = Array.from(new Set(
  ['cooked_food', 'fish', 'meat', 'food']
    .concat(CK.RAW_GRAINS).concat(Object.keys(CK.FORAGE_FOOD_FACTOR)).concat(CK.PRESERVED_FOODS)));

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
// ★★[T274] **집계** — 유도가 아니라 센다. 장부가 이미 문 둘을 준다(`onEvent`·`onRequest` · 관측만).
const TALLY = { short: {}, glut: {}, req: {} };
const _bump = (m, k) => { m[k] = (m[k] || 0) + 1; };
// ★★[T302] **반사실은 주입 하나다.** 정본 표를 부른 뒤, 이 계측기 안에서만 다섯 줄을 뺀다
//   (파일 무접촉 · `require.cache` 사본 0). 장부는 표를 주입받는 설계라 이 한 줄이 곧 "이 카드 전/후"다.
const FIVE  = ['salmon', 'shrimp', 'crab', 'oyster', 'seaweed'];                           // T302(이미 main)
const SEVEN = ['wheat', 'rice', 'barley', 'chestnut', 'grape', 'mulberry_fruit', 'acorn'];  // ★T328
const SEVEN_ON = process.env.SEVEN !== '0';
const DEPOSIT = (() => {
  const m = Object.assign({}, Villages.playerVillageDepositMap());
  const 다섯 = FIVE.filter((r) => m[r] === r).length, 일곱 = SEVEN.filter((r) => m[r] === r).length;
  if (다섯 !== 5 || 일곱 !== 7) { console.error(`정본 표가 전제와 다르다(다섯 ${다섯}/5 · 일곱 ${일곱}/7) — 이 계측기는 T328 뒤의 표를 전제한다`); process.exit(2); }
  if (!SEVEN_ON) for (const r of SEVEN) delete m[r];
  return m;
})();
const _DEL = Events.buildDeliverable(DEPOSIT);
const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: DEPOSIT,
  onEvent: (ev) => { if (!ev) return; if (ev.type === 'STOCK_SHORTAGE') _bump(TALLY.short, ev.item); else if (ev.type === 'STOCK_GLUT') _bump(TALLY.glut, ev.item); },
  onRequest: (req, kind) => { if (kind === 'open' && req && req.item) _bump(TALLY.req, req.item); } });
L.prime(world);

// ── 표본 ────────────────────────────────────────────────────────────────────
const H = new Map(), C = new Map();
const SIDESET = new Set(SIDES);
const FLOW = {}; for (const r of TRACK) FLOW[r] = { prod: 0, eat: 0, d0: 0, dEnd: 0 };
let legAll = 0, legSide = 0, legSideAmt = 0, legAllAmt = 0;
const seenLeg = new Set();
const _log = console.log; console.log = () => {};
for (const v of world.villages) for (const r of TRACK) FLOW[r].d0 += (v.storage[r] || 0);
for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world); L.scanDay(world, world.day, {});
  for (const v of world.villages) {
    const dp = v.dailyProductionBuf || {}, fe = v._foodEaten || {};
    for (const r of TRACK) { FLOW[r].prod += dp[r] || 0; FLOW[r].eat += fe[r] || 0; }
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
for (const v of world.villages) for (const r of TRACK) FLOW[r].dEnd += (v.storage[r] || 0);
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
for (const r of TRACK) {
  const vals = world.villages.filter((v) => (v.npcs || []).length > 0).map((v) => ((v._consEMA || {})[r] || 0));
  const nz = vals.filter((x) => x > 0).length;
  const f = FLOW[r], denom = Math.max(1e-9, f.prod + f.d0);
  ema[r] = { med: med(vals), max: Math.max(0, ...vals), nz, n: vals.length,
    subs: SUBS[r] || 0, flowTUsed: !SUBS[r],
    prod: f.prod, eat: f.eat, stock: f.dEnd,
    eatPc: f.eat / denom, stockPc: f.dEnd / denom, otherPc: (f.prod + f.d0 - f.eat - f.dEnd) / denom };
}

console.log(`\n=== fromEcon 일곱 줄 반사실 — 서버 ${seeds.length}곳 · 시드 ${SEED} · ${DAYS}일 · 일곱 **${SEVEN_ON ? '있음(T328 뒤)' : '없음(T328 전)'}** ===`);
console.log(`  여덟 수   인구 ${pop} · 소멸 ${dead}/${ever} · 무기Q ${weapQ.toFixed(0)} · 확장셀 ${expand}`);
console.log(`            게시 ${S.reqOpened} · 일/건 ${daysPer.toFixed(2)} · 도구Q ${toolQ.toFixed(1)} · 보존식 ${presStock.toFixed(1)}`);
console.log(`  조리      요리사 ${cooksTot}명 · cooked_food 재고 ${cookedTot.toFixed(0)} · 선다 전체 ${pct(standsOf(V.map((x) => x.name)))} · 하위10 ${pct(standsOf(BOT))} · 상위5 ${pct(standsOf(TOP))}`);
console.log(`  하위 10곳 요리사 평균합 ${sum(BOT, 'cooks').toFixed(2)} · 조리식/일 합 ${sum(BOT, 'out').toFixed(2)} · 재고 합 ${sum(BOT, 'stock').toFixed(1)}`);
console.log(`  행복      중앙 ${med(V.map((x) => x.hMed)).toFixed(3)} · 하위10 중앙 ${med(BOT.map((nm) => V.find((x) => x.name === nm).hMed)).toFixed(3)} · 0.5 미만 ${V.filter((x) => x.hMed < 0.5).length}/${V.length}`);
console.log(`  캐러밴    leg 전체 ${legAll} · 부재료 leg ${legSide}(${pct(legSide / Math.max(1, legAll))}) · 실린 양 ${pct(legSideAmt / Math.max(1e-9, legAllAmt))}`);
console.log(`  사다리 품목 ${TRACK.length}종 — 흐름-EMA(마을 중앙 · >0 마을 수) · subs 가드 · 기록/실제 비 · 행선`);
const nLive = world.villages.filter((v) => (v.npcs || []).length > 0).length;
for (const r of TRACK) {
  const e = ema[r];
  const eatenPerVD = e.eat / Math.max(1, DAYS * nLive);          // 마을·일당 실제로 먹힌 양
  const ratio = (e.med > 1e-9) ? (eatenPerVD / e.med) : null;    // 실제 ÷ 기록 (1 에 가까울수록 메워진 것)
  if (e.prod <= 0 && e.eat <= 0 && e.med <= 0) continue;         // 이 판에 안 나온 품목은 줄을 안 낸다
  console.log(`    ${r.padEnd(12)} EMA 중앙 ${e.med.toFixed(4)} · >0 ${e.nz}/${e.n}곳`
    + ` · subs ${e.subs ? e.subs.toFixed(4) + '(가드 — flowT 0)' : '없음(flowT 적용)'}`
    + ` · 먹힘 ${eatenPerVD.toFixed(3)}/마을·일 · 실제/기록 ${ratio == null ? '∞(기록 0)' : ratio.toFixed(1) + '배'}`
    + ` · 생산 ${e.prod.toFixed(0)} 그밖 ${pct(e.otherPc)}`);
}
{
  //   ★집계 — 비등재 7종(가드 없는 자리가 보는 그 일곱)을 먼저, 그 다음 상위 품목.
  const NOSUB = TRACK.filter((r) => !ema[r].subs);
  const sum = (m) => Object.values(m).reduce((a, b) => a + b, 0);
  console.log(`  게시판 집계(800일 · 51마을)  부족 ${sum(TALLY.short)}건 · 글럿 ${sum(TALLY.glut)}건 · 의뢰 게시 ${sum(TALLY.req)}건`);
  console.log(`    비등재 7종 — 부족/글럿/의뢰 건수 vs 실제 먹힌 양(마을·일)`);
  const nL = world.villages.filter((v) => (v.npcs || []).length > 0).length;
  for (const r of NOSUB) {
    const e = ema[r];
    console.log(`      ${r.padEnd(11)} 부족 ${String(TALLY.short[r] || 0).padStart(5)} · 글럿 ${String(TALLY.glut[r] || 0).padStart(5)} · 의뢰 ${String(TALLY.req[r] || 0).padStart(5)}`
      + ` · 먹힘 ${(e.eat / Math.max(1, DAYS * nL)).toFixed(3)}/마을·일 · EMA 중앙 ${e.med.toFixed(4)}`);
  }
  const top = Object.entries(TALLY.req).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`    의뢰 상위 8: ${top.map(([r, n]) => r + ' ' + n).join(' · ') || '(없음)'}`);
  // ★★[T302] **다섯 줄이 여는 것** — 부족은 서는데 의뢰가 0 이던 그 다섯.
  const nL2 = world.villages.filter((v) => (v.npcs || []).length > 0).length;
  console.log(`    ★일곱(T328) — 낼 수 있나 ${SEVEN.filter((r) => _DEL.fromEcon.has(r)).length}/7 · 벽에서 빠졌나`);
  for (const r of SEVEN) {
    const e = ema[r] || { eat: 0, med: 0, prod: 0 };
    console.log(`      ${r.padEnd(11)} 낼수있다 ${_DEL.fromEcon.has(r) ? '✅' : '✗ '}`
      + ` · 부족 ${String(TALLY.short[r] || 0).padStart(5)} · 글럿 ${String(TALLY.glut[r] || 0).padStart(5)} · 의뢰 ${String(TALLY.req[r] || 0).padStart(5)}`
      + ` · 먹힘 ${(e.eat / Math.max(1, DAYS * nL2)).toFixed(3)}/마을·일 · EMA 중앙 ${e.med.toFixed(4)} · 생산 ${e.prod.toFixed(0)}`);
  }
  // ★벽 — **사다리**인데 못 내는 것(하네스 ㊽c 와 같은 셈 · 여기선 이 판의 주입으로 센다).
  //   ⚠`TRACK` 은 사다리 + 조리 부재료라 사다리보다 넓다(`twig`) — 벽은 **사다리로만** 센다.
  const wall = LADDER.filter((r) => !_DEL.fromEcon.has(r));
  console.log(`    벽(식사 사다리 ${LADDER.length}종 중 못 내는 것) ${wall.length}종: ${wall.join('·')}`);
}
console.log(`  손잡이    SEVEN=${SEVEN_ON ? '1(정본 표 그대로)' : '0(일곱 줄 뺀 반사실)'} — 정본 파일 무접촉 · 소스 치환 0`);
if (process.env.AB_JSON) {
  const nLive2 = world.villages.filter((v) => (v.npcs || []).length > 0).length;
  for (const r of TRACK) { ema[r].eatenPerVD = ema[r].eat / Math.max(1, DAYS * nLive2); }
  fs.writeFileSync(process.env.AB_JSON, JSON.stringify({ seven: SEVEN_ON, wall: LADDER.filter((r) => !_DEL.fromEcon.has(r)), tally: TALLY, seed: SEED, days: DAYS, track: TRACK, sides: SIDES, nLive: nLive2,
    eight: { pop, dead, ever, weapQ, expand, toolQ, presStock, reqOpened: S.reqOpened, daysPer },
    cooksTot, cookedTot, standsAll: standsOf(V.map((x) => x.name)), standsBot: standsOf(BOT), standsTop: standsOf(TOP),
    botCooks: sum(BOT, 'cooks'), botOut: sum(BOT, 'out'), botStock: sum(BOT, 'stock'),
    hMed: med(V.map((x) => x.hMed)), below: V.filter((x) => x.hMed < 0.5).length,
    legAll, legSide, legSideAmt, legAllAmt, ema, bottom: BOT, top: TOP }, null, 1));
  console.log(`\n  [JSON] ${process.env.AB_JSON}`);
}
