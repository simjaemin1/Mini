#!/usr/bin/env node
// === scripts/t337-consema-audit.js — T337: `_consEMA` 0/51 의 기전 · #33 세 팔 =====
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
// ⚠**레포 제품 코드 0 줄.** 세 팔은 **이 파일 안에서만** 세운다:
//   main 에는 T258/T263/T274 손잡이가 **없다**(그 셋은 가지에만 있었다 — 실측 §0-ⓐ).
//   그래서 env 로 못 켠다. 대신 **정본을 안 고치고** 밖에서 같은 일을 시킨다:
//     · `food` 팔 = 하루 틱 뒤 `v._foodEaten`(엔진이 이미 채우는 칸)을 **정본 `_cons` 에 그대로 넘긴다**.
//       T263 가지가 `consumeFood` 끝에 넣었던 그 한 줄과 **같은 값·같은 자리**(일 경계 폴드 전)다.
//     · `board` 팔 = 장부에만 식사를 보여 준다(T274 좁은 팔 · 세계는 안 건드린다).
//     · `both` = 둘 다.
//   ⇒ `_cons` 는 **정본 함수를 그대로 부른다**(내보내기 줄 하나 · 파일 무접촉 · 사본 0).
//
// 무엇을 묻나 — T302·T328 이 두 번 같은 답을 냈다: *"낼 수 있게는 됐는데 아무도 안 물어본다."*
//   `d.short = ema > 0 && stock < ema × SHORT_DAYS` 이므로 **EMA 가 0 인 품목은 부족이 될 수 없다**.
//   이 계측기는 그 0 이 **우연인지 구조인지**를 가른다.
//
// 실행: node scripts/t337-consema-audit.js [일수=800] [시드=1020]
//   ARM=base|food|board|both
//   AB_JSON=/tmp/x.json   AB_SAMPLE=10
'use strict';
// ★★[T337] 팔 넷 — **레포 손잡이는 없다**(main 에 T258/T263/T274 가 없다 · §0-ⓐ). 이 파일 안에서 세운다.
//   base  = 아무것도 안 한다(정본 그대로)
//   food  = 하루 틱 뒤 `v._foodEaten` 을 **정본 `_cons`** 에 그대로 넘긴다(T263 가지의 그 한 줄과 같은 값·같은 자리)
//   board = 장부에만 식사를 보여 준다(T274 좁은 팔 — 세계는 안 건드린다 · `scanDay` 앞뒤로 얹었다 뗀다)
//   both  = 둘 다
const ARMS = ['base', 'food', 'board', 'both'];
const ARM = ARMS.includes(process.env.ARM) ? process.env.ARM : 'base';
const ARM_FOOD = (ARM === 'food' || ARM === 'both');
const ARM_BOARD = (ARM === 'board' || ARM === 'both');
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
  // ★내보내기 줄 하나만 붙인다 — **치환 0**(파일은 한 글자도 안 바뀐다). `_cons` 는 정본 함수 그 자체다.
  const src = fs.readFileSync(ECON_FILE, 'utf8')
    + '\nmodule.exports.__t337 = { _cons, cookTarget, COOK_SIDE_INGREDIENTS, FORAGE_FOOD_FACTOR, RAW_GRAINS, PRESERVED_FOODS, PRESERVE_FROM, SHORT_DAYS: (typeof SHORT_DAYS !== "undefined" ? SHORT_DAYS : null) };\n';
  const m = new Module(ECON_FILE, null);
  m.filename = ECON_FILE; m.paths = Module._nodeModulePaths(path.dirname(ECON_FILE));
  require.cache[ECON_FILE] = m; m._compile(src, ECON_FILE); m.loaded = true;
}
const _av = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DAYS = parseInt(_av[0], 10) || 800;
const SEED = parseInt(_av[1], 10) || 1020;
const SAMPLE = parseInt(process.env.AB_SAMPLE || '10', 10) || 10;

const econ = R('sim/economy-sim');
const CK = econ.__t337;
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
// ★★[T362] 카드 ②가 묻는 것 — 식량 의뢰가 **몇 건 · 어느 마을 · 어느 계절**인가.
//   집계만 더한다(세계 무접촉 · 새 수 0). 계절은 **정본 함수**에게 묻는다(사본 0).
const REQV = {};          // 품목 → { 마을이름: 건수 }
const REQS = {};          // 품목 → { 계절: 건수 }
const _bump2 = (m, k1, k2) => { const o = m[k1] || (m[k1] = {}); o[k2] = (o[k2] || 0) + 1; };
const SEASONS = ['봄', '여름', '가을', '겨울'];
const _season = (d) => SEASONS[Math.floor(((d % 360) + 360) % 360 / 90)];   // ★[T362] 360일 4등분 — 새 수 0(달력 정본의 그 나눔)
const _bump = (m, k) => { m[k] = (m[k] || 0) + 1; };
const DEPOSIT = Villages.playerVillageDepositMap();   // ★정본 그대로 — 이 카드는 표를 안 건드린다
const _DEL = Events.buildDeliverable(DEPOSIT);
const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: DEPOSIT,
  onEvent: (ev) => { if (!ev) return; if (ev.type === 'STOCK_SHORTAGE') _bump(TALLY.short, ev.item); else if (ev.type === 'STOCK_GLUT') _bump(TALLY.glut, ev.item); },
  onRequest: (req, kind) => {
    if (!(kind === 'open' && req && req.item)) return;
    _bump(TALLY.req, req.item);
    // ★[T362] 같은 사건을 마을·계절로도 센다 — 마을 이름은 장부가 든 `vid`(= 색인)로 되찾는다.
    const _v = world.villages[req.vid];
    _bump2(REQV, req.item, (_v && _v.name) || ('#' + req.vid));
    _bump2(REQS, req.item, _season(world.day));
  } });
L.prime(world);

// ── 표본 ────────────────────────────────────────────────────────────────────
const H = new Map(), C = new Map();
const SIDESET = new Set(SIDES);
const FLOW = {}; for (const r of TRACK) FLOW[r] = { prod: 0, eat: 0, d0: 0, dEnd: 0 };
let legAll = 0, legSide = 0, legSideAmt = 0, legAllAmt = 0;
const seenLeg = new Set();
const _log = console.log; console.log = () => {};
for (const v of world.villages) for (const r of TRACK) FLOW[r].d0 += (v.storage[r] || 0);
// ★★[T337 ①] **EMA 감사** — 품목별로 "하루라도 >0 인 마을이 있었나"를 800일 내내 센다.
//   0 이 우연인지 구조인지는 이 표가 가른다: 최댓값 · >0 이던 마을·날의 수 · 처음 >0 이 된 날.
const AUDIT = {}; for (const r of TRACK) AUDIT[r] = { max: 0, vDays: 0, vEver: new Set(), firstDay: null };
// ★[T274 좁은 팔] 장부만 보는 식사 EMA — 세계와 **따로** 돈다(같은 α=1/30 · 새 수 0).
const BOARD_EMA = new Map();
const EMA_N = 30;
for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world);

  // ── 팔 `food` — 엔진이 채운 `_foodEaten` 을 **정본 `_cons`** 에 넘긴다(일 경계 폴드 앞자리) ──
  if (ARM_FOOD) {
    for (const v of world.villages) {
      const fe = v._foodEaten; if (!fe) continue;
      for (const r in fe) CK._cons(v, r, fe[r]);
    }
  }
  // ── 팔 `board` — 장부에만 식사를 보여 준다(얹었다 뗀다 · 세계 무접촉) ──
  let _saved = null;
  if (ARM_BOARD) {
    _saved = [];
    for (const v of world.villages) {
      let fe = BOARD_EMA.get(v); if (!fe) BOARD_EMA.set(v, fe = {});
      const eaten = v._foodEaten || {};
      for (const r in fe) if (!(r in eaten)) fe[r] *= (EMA_N - 1) / EMA_N;
      for (const r in eaten) fe[r] = (fe[r] || 0) * ((EMA_N - 1) / EMA_N) + (eaten[r] || 0) * (1 / EMA_N);
      const base = v._consEMA || {};
      const merged = Object.assign({}, base);
      for (const r in fe) if (fe[r] > 0) merged[r] = (merged[r] || 0) + fe[r];
      _saved.push([v, v._consEMA]); v._consEMA = merged;
    }
  }
  L.scanDay(world, world.day, {});
  if (_saved) for (const [v, e] of _saved) v._consEMA = e;

  for (const v of world.villages) {
    const dp = v.dailyProductionBuf || {}, fe = v._foodEaten || {};
    for (const r of TRACK) { FLOW[r].prod += dp[r] || 0; FLOW[r].eat += fe[r] || 0; }
    const e = v._consEMA; if (!e) continue;
    for (const r of TRACK) {
      const q = e[r] || 0; if (!(q > 0)) continue;
      const a = AUDIT[r];
      if (q > a.max) a.max = q;
      a.vDays++; a.vEver.add(v.name);
      if (a.firstDay === null) a.firstDay = d;
    }
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

console.log(`\n=== _consEMA 감사 · #33 팔 **${ARM}** — 서버 ${seeds.length}곳 · 시드 ${SEED} · ${DAYS}일 ===`);
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
  // ★★[T362 ②] **flowT 와 의뢰의 자리** — 가격 target 의 흐름 항이 실제로 움직이나, 그리고 의뢰가 어디서 어느 철에 나나.
  //   flowT 는 v2 정본의 그 식이다(`sim/economy-sim-v2.js:406,514`): subs 등재면 **0**(가드), 아니면 `EMA × 30`.
  //   ⚠식을 여기서 새로 짓지 않는다 — 가드도 값도 정본의 것을 그대로 읽는다(새 수 0 · 사본 0).
  console.log(`    ★[T362] flowT(= subs 등재면 0 · 아니면 EMA×30) · 의뢰 난 마을·계절`);
  const _reqTot = (r) => TALLY.req[r] || 0;
  const _rows = TRACK.filter((r) => ema[r].med > 1e-9 || _reqTot(r) > 0)
    .sort((a, b) => (_reqTot(b) - _reqTot(a)) || (ema[b].med - ema[a].med));
  for (const r of _rows) {
    const e = ema[r];
    const flowT = e.subs ? 0 : e.med * 30;
    const vs = Object.entries(REQV[r] || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const ss = SEASONS.map((k) => `${k} ${(REQS[r] || {})[k] || 0}`).join(' · ');
    console.log(`      ${r.padEnd(12)} flowT ${flowT.toFixed(3).padStart(8)}${e.subs ? ' (가드 0)' : ''}`
      + ` · 의뢰 ${String(_reqTot(r)).padStart(5)}`
      + ` · 마을 ${vs.length ? vs.map(([n, c]) => n + ' ' + c).join(', ') : '-'}`
      + ` · ${ss}`);
  }
  // ★★[T337 ①] **EMA 감사** — 0 이 우연인가 구조인가.
  console.log(`    ★사다리 ${LADDER.length}종 EMA 감사(${DAYS}일 × ${world.villages.length}마을 = ${DAYS * world.villages.length} 마을·일)`);
  console.log(`      ${'품목'.padEnd(15)} ${'보존원물'.padEnd(8)} ${'EMA>0 마을·일'.padStart(13)} ${'그런 마을'.padStart(9)} ${'최대EMA'.padStart(9)} ${'첫날'.padStart(6)}  먹힘/마을·일`);
  const nL3 = world.villages.filter((v) => (v.npcs || []).length > 0).length;
  for (const r of LADDER) {
    const a = AUDIT[r], e = ema[r] || { eat: 0 };
    const pf = (CK.PRESERVE_FROM && (r in CK.PRESERVE_FROM)) ? '✅' : '—';
    console.log(`      ${r.padEnd(15)} ${pf.padEnd(8)} ${String(a.vDays).padStart(13)} ${String(a.vEver.size + '/' + world.villages.length).padStart(9)} ${a.max.toFixed(4).padStart(9)} ${String(a.firstDay === null ? '-' : a.firstDay).padStart(6)}  ${(e.eat / Math.max(1, DAYS * nL3)).toFixed(3)}`);
  }
  // ★벽 — **사다리**인데 못 내는 것(하네스 ㊽c 와 같은 셈 · 여기선 이 판의 주입으로 센다).
  //   ⚠`TRACK` 은 사다리 + 조리 부재료라 사다리보다 넓다(`twig`) — 벽은 **사다리로만** 센다.
  const wall = LADDER.filter((r) => !_DEL.fromEcon.has(r));
  console.log(`    벽(식사 사다리 ${LADDER.length}종 중 못 내는 것) ${wall.length}종: ${wall.join('·')}`);
}
console.log(`  팔        ARM=${ARM} (food=${ARM_FOOD} · board=${ARM_BOARD}) — 레포 제품 코드 0 줄 · 정본 파일 무접촉 · 소스 치환 0`);
if (process.env.AB_JSON) {
  const nLive2 = world.villages.filter((v) => (v.npcs || []).length > 0).length;
  for (const r of TRACK) { ema[r].eatenPerVD = ema[r].eat / Math.max(1, DAYS * nLive2); }
  fs.writeFileSync(process.env.AB_JSON, JSON.stringify({ arm: ARM, audit: Object.fromEntries(LADDER.map((r) => [r, { max: AUDIT[r].max, vDays: AUDIT[r].vDays, vEver: AUDIT[r].vEver.size, firstDay: AUDIT[r].firstDay, preserveFrom: !!(CK.PRESERVE_FROM && (r in CK.PRESERVE_FROM)) }])), tally: TALLY, reqByVillage: REQV, reqBySeason: REQS,
    flowT: Object.fromEntries(TRACK.map((r) => [r, ema[r].subs ? 0 : ema[r].med * 30])),
    emaMed: Object.fromEntries(TRACK.map((r) => [r, ema[r].med])),
    knob: process.env.T263_FOOD_CONS || '(미설정=끔)', seed: SEED, days: DAYS, track: TRACK, sides: SIDES, nLive: nLive2,
    eight: { pop, dead, ever, weapQ, expand, toolQ, presStock, reqOpened: S.reqOpened, daysPer },
    cooksTot, cookedTot, standsAll: standsOf(V.map((x) => x.name)), standsBot: standsOf(BOT), standsTop: standsOf(TOP),
    botCooks: sum(BOT, 'cooks'), botOut: sum(BOT, 'out'), botStock: sum(BOT, 'stock'),
    hMed: med(V.map((x) => x.hMed)), below: V.filter((x) => x.hMed < 0.5).length,
    legAll, legSide, legSideAmt, legAllAmt, ema, bottom: BOT, top: TOP }, null, 1));
  console.log(`\n  [JSON] ${process.env.AB_JSON}`);
}
