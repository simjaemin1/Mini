#!/usr/bin/env node
// === scripts/t17-metrics.js — ECON 수술의 계측기 (T17 → T60 확장) ==============
//
// ★★**계측기다. 하네스가 아니다 — 러너에 넣지 마라.**
//   러너는 파일 **첫 열의 등재 표**로 스스로 찾는다(`run-regress.sh` `_disc`) — 이 파일엔 그 표가 없다.
//   `scripts/trade-metrics.js` 와 같은 자리: 판정하지 않고 **수치를 낸다**.
//   판정은 `보고_T17_승인대기.md` 의 옛/새/귀속 표에서 재민이 한다(지시 §5).
//
// ★세계 조립은 `scripts/ev-density.js` 와 **같은 순서·같은 정본 함수**다(사본 아님).
//   실지도 → pickSeedVillages → VillageLayout.generate → extractLandParamsApprox → createWorldV2.
//
// 내는 열 (지시 §6 의 "새 기준선 스냅샷 제안" 항목):
//   ⓐ 기준선 — 인구 · 소멸 · 무기Q · 확장셀 · 거래
//   ⓑ 게시 — 건수 · 마을당 며칠에 1건(밀도 캐논 2~3일)
//   ⓒ 부족/글럿 **품목 분포** — 지시 §3 "부족 품목 분포 전/후"
//   ⓓ 도구 — 재고 Σ · 도구Q(품질보정 총량) · 부족 건수 · 게시 의뢰 건수
//   ⓔ 보존식 — 재고 Σ · 캐러밴 유통량(건수·수량)
//   ⓕ 소금 — 재고 Σ · **해안/내륙 가격 지역차**(자염 편입의 목적 그 자체)
//   ⓖ MSY — 상한이 선 마을 · 어촌 인구·어부·생선 재고·가격
//   ⓗ [T60] **어장 눈금** — 어촌별 잠재 어획(`_fishRawLast`) 대 상한(`land.fishSustain`)의 비
//   ⓘ [T60] **밀도 분해** — 사건 밀도가 어떤 유형·품목에서 왔나
//   ⓙ [T60] **사장 셋** — `woodSustain`·`forageSustain`·`marginalQ` 가 켜지면 무엇이 움직이나(표만)
//
// 축 손잡이(대조군 — 지시 §3 "①~③ 각각 끈 시드 1개씩"):
//   T17_TOOL=0 / T17_PRESERVE=0 / T17_SALT=0  → 그 축만 끈다(엔진 쪽 손잡이와 같은 이름)
//   [T60] T60_FISH2WAY=0  낚시 양방향 끔 · T60_MSY_MODE=legacy|lab|ema|fishv2 · T17_MSY=1 상한 켬
//
// 실행: node scripts/t17-metrics.js [일수=800] [시드=1020]
//   T17_JSON=/tmp/x.json  … 표를 JSON 으로도 남긴다(옛/새 비교 표를 손으로 옮겨 적지 않게)
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t17-metrics-${process.pid}.db`;

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
const Events = R('server/events');
const SPEC = R('server/specialty');
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

// ★[T100 2026-09-05 · 순전한 계측 편의 · 값 무변] 51곳 `VillageLayout.generate` 는 전수 ~10분이다.
//   결정론이라 캐시할 수 있다. **손잡이가 없으면 종전 루프 그대로**(기본값 무변 — 이 파일은 기준선의 자다).
//   `LAB_SEEDCACHE=<경로>` 를 주면 그 파일에 적고/읽는다. 지우면 그대로 다시 만든다(값 동일).
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
  if (_SEEDCACHE) { try { fs.mkdirSync(path.dirname(_SEEDCACHE), { recursive: true }); fs.writeFileSync(_SEEDCACHE, JSON.stringify(seeds)); } catch (e) {} }
}
const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
// ★★[T135] 나무 층 주입 — **서버가 부르는 그 문**(`server/villages.js` Stage 3)을 계측기도 부른다.
//   ⚠족보 130: 계측기가 이 문을 안 열면 여덟 수는 대체를 못 보고 "안 움직인다"고 말한다.
//     그건 대체가 없다는 증거가 아니라 **자가 그 층을 안 돈다**는 증거다. `test-trees` 가 두 자리를 다 본다.
require('../server/trees').attachToWorld(world);
// ★★[T191 2026-09-12 · 계측 전용 · **env 가 없으면 한 글자도 안 바뀐다**] 도구 마모 배수 주입.
//   T180 이 엔진에 뚫은 문(`world.toolWearMul`)을 **서버 세계에서도** 한 번 보기 위한 자리다.
//   카드 T191 ②: 랩 8마을이 못 보는 꼬리(족보 144)를 51마을로 한 번 본다.
//   ⚠이 줄을 여기 둔 이유: ⓚ 여덟 수를 **다시 구현하지 않기 위해서**다(계측기 정본 재구현 0 · T163 규약).
//     `T191_TOOLWEAR` 를 안 주면 `world.toolWearMul` 이 없고 엔진 배수는 1 이다 — 기준선 계측기 무변.
{ const _tw = parseFloat(process.env.T191_TOOLWEAR || ''); if (Number.isFinite(_tw) && _tw > 0 && _tw !== 1) world.toolWearMul = _tw; }
// ★[T200 · 계측 전용] 재고 EMA 수출 문턱 — `T200_EXPORT_EMA=1` 일 때만 문을 연다(없으면 무변).
//   랩은 `window.L_EXPORT_EMA` 로 **같은 문**을 연다(문은 하나 — 하네스가 지문으로 대조한다).
if (process.env.T200_EXPORT_EMA === '1') world.exportStockEma = true;
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;
// ★★[T100 2026-09-05 · 손잡이 없으면 무변] **개간 관측** — 이 계측기는 여태 `ENABLE_VILLAGES=0` 이라
//   생활층 개간이 안 돌았다. econ 이 밭을 안 봤을 땐 무해했지만(T86 까지), 밭이 밑변이 되면
//   **밭이 시딩값에 얼어붙은 세계**를 재게 된다(라이브는 개간이 돈다). `T100_CLEAR=1` 이면 정본
//   `_lifeClearDay` 를 하루에 한 번 돌린다 — 판정은 그 함수가 하고 계측기는 부르기만 한다(사본 0).
const _CLEAR = process.env.T100_CLEAR === '1';
const _clearVils = [];
if (_CLEAR) {
  let _rowid = 0;
  P._clearProbe.setup(ta, world, { insertVillageBuilding: () => ++_rowid });
  world.villages.forEach((ev, i) => {
    const s2 = seeds[i]; if (!s2 || !s2.layout) return;
    _clearVils.push(P._clearProbe.attach({ dbId: i + 1, name: s2.name, ccx: s2.ccx, ccy: s2.ccy, econ: ev, layout: s2.layout }));
  });
  console.log(`  [T100] 개간 관측 켬 — 마을 ${_clearVils.length}곳 · 초기 밭 ${_clearVils.reduce((a, v) => a + v._farmSet.size, 0)}칸`);
}

// ★해안 판정 — **엔진이 쓰는 그 값을 그대로 읽는다**(사본 금지).
//   `server/villages.js` 의 `extractLandParamsApprox` 가 `coastal`(과 계측용 `_seaDistPx`)을 붙이고,
//   `createVillage` 의 land 화이트리스트가 그걸 통과시킨다. 계측기가 따로 재면 그게 곧 두 번째 정의다.
const coastal = new Set();

world.villages.forEach((v, i) => { if (v.land && v.land.coastal) coastal.add(i); });
{
  const d = seeds.map((s) => s.lp && s.lp._seaDistPx).filter((x) => x != null).sort((a, b) => a - b);
  console.log(`  해안(land.coastal) ${coastal.size}곳 · 바다까지 px — 최소 ${d[0]} · 중앙 ${d[Math.floor(d.length / 2)]} · 최대 ${d[d.length - 1]}`);
}
const depositMap = Villages.playerVillageDepositMap();
const shortByItem = new Map(), glutByItem = new Map(), reqByItem = new Map();
const L = Events.createLedger({
  econV2, vidOf: (v, i) => i, depositMap,
  // ★[T94 2026-09-05] 여기 있던 `cfg: { PRICE_UP: 0.70, PRICE_DOWN: 0.70, HYST: 1.6 }` 를 **뺐다**.
  //   그건 채택 문턱의 **사본**이었고, T94 가 채택을 ±90 으로 옮기자 이 계측기만 옛 문턱으로 재면서
  //   "기준선 정본"의 일/건 열을 조용히 옛 값으로 찍고 있었다(실측: 22469건 · 1.82일 — ±70 의 수).
  //   ⇒ 정본(`events.js` 기본값)을 그대로 따른다. 되돌려 보고 싶으면 env 한 줄이다
  //     (`EV_PRICE_UP=0.70 EV_PRICE_DOWN=0.70 node scripts/t17-metrics.js 800 1020`).
  //   ⚠econ 일곱 열(인구·소멸·무기Q·확장셀·도구Q·보존식·소금)은 **장부와 무관**하다 —
  //     장부는 관측자라 문턱을 바꿔도 그 일곱은 한 자도 안 움직인다(T94 보고 §3 이 3시드로 증명한다).
  onEvent: (e) => {
    if (e.type === 'STOCK_SHORTAGE') shortByItem.set(e.item, (shortByItem.get(e.item) || 0) + 1);
    else if (e.type === 'STOCK_GLUT') glutByItem.set(e.item, (glutByItem.get(e.item) || 0) + 1);
  },
});
L.prime(world);

// ★★[T152 2026-09-07] **석재 바닥 마을 궤적 표본** — 계측만(엔진 무접촉 · 코드 변경 0).
//   `land.stone == FLOOR(0.25)` 인 마을만 하루치 상태를 받아 둔다(그 밖의 마을은 안 본다 = 비용 ~0).
//   왜 이 마을들인가: T135 2판이 농촌12 로 본 죽음의 고리 —
//     석재 0 → 석공이 도구를 못 만든다(`produceSpecial` 게이트 `stone >= _stCost`) → 도구 0 →
//     전 직업 생산 ×0.25(맨손) → 기근 → 인구 0. 그 고리는 **바닥 마을에서만** 상시 임계다.
const STONE_FLOOR = require(path.join(__dirname, '..', 'server', 'livelihood')).FLOOR.stone;
const floorIdx = world.villages.map((v, i) => [v, i]).filter(([v]) => (v.land && v.land.stone || 0) <= STONE_FLOOR + 1e-9);
const floorTrace = floorIdx.map(([v]) => ({ name: v.name, land: +(v.land.stone || 0).toFixed(3),
  pop0: (v.npcs || []).length, popMax: (v.npcs || []).length, stoneMin: Infinity, toolMin: Infinity,
  daysStone0: 0, daysTool0: 0, forDays: 0, masonDays: 0, days: 0 }));

const _log = console.log; console.log = () => {};
for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world); L.scanDay(world, world.day, {});
  if (_CLEAR) P._clearProbe.tickDay(_clearVils);                 // [T100 4판] 개간 관측
  for (let k = 0; k < floorIdx.length; k++) {                    // ★[T152] 석재 바닥 마을 표본
    const v = floorIdx[k][0], t = floorTrace[k];
    const n = (v.npcs || []).length, st = +(v.storage.stone || 0), tl = +(v.storage.tool || 0);
    t.days++;
    if (n > t.popMax) t.popMax = n;
    if (st < t.stoneMin) t.stoneMin = st;
    if (tl < t.toolMin) t.toolMin = tl;
    if (st < 0.2) t.daysStone0++;                 // STONE_NET 1차 발동 문턱(절대 0.2) 아래에 있던 날
    if (tl < 0.05) t.daysTool0++;                 // 도구가 사실상 0 이던 날
    t.forDays += ((v.counts || {}).forager || 0);
    t.masonDays += ((v.counts || {}).mason || 0);
  }
}
if (_CLEAR) console.log(`  [T100] 개간 관측 — 끝 밭 ${_clearVils.reduce((a, v) => a + v._farmSet.size, 0)}칸 · 마을당 중앙 ${_clearVils.map((v) => v._farmSet.size).sort((a, b) => a - b)[Math.floor(_clearVils.length / 2)]}칸`);
console.log = _log;

// ── ⓐ 기준선 ────────────────────────────────────────────────────────────────
let pop = 0, dead = 0, ever = 0, weapQ = 0, expand = 0;
for (const v of world.villages) {
  const n = (v.npcs || []).length; pop += n;
  if (v._everPop) ever++;
  if (v._everPop && n <= 0) dead++;
  weapQ += (v.storage.weapon || 0) * (v._weapQ != null ? v._weapQ : 1);
  expand += v.expansions || 0;
}
const live = world.villages.filter((v) => (v.npcs || []).length > 0).length;
const S = L.stats;
const perVD = S.emitted / Math.max(1, live * S.days);
const daysPer = 1 / Math.max(1e-9, perVD);

const AX = (k, dflt) => (process.env['T17_' + k] === '0' ? '끔' : dflt);
console.log(`\n=== T17 계측 — 실지도 ${seeds.length}곳 · 시드 ${SEED} · ${DAYS}일 ===`);
console.log(`  축: 도구 ${AX('TOOL', '켬')} · 보존식 ${AX('PRESERVE', '켬')} · 소금 ${AX('SALT', '켬')}`);
console.log(`\nⓐ 기준선   인구 ${pop} · 소멸 ${dead}/${ever} · 무기Q ${weapQ.toFixed(0)} · 확장셀 ${expand} · 거래 ${world.tradeLog.length}`);
console.log(`ⓑ 게시     의뢰 **${S.reqOpened}**건(기준선 정본의 '게시' 열) · 철회 ${S.reqClosed} · 사건 ${S.emitted}건 · 마을당 ${daysPer.toFixed(2)}일/건 (밀도 캐논 2~3일) · 인구있는 마을 ${live}`);

// ── ⓒ 부족/글럿 품목 분포 ────────────────────────────────────────────────────
const topOf = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const ko = (r) => (SPEC.RESOURCES[r] && SPEC.RESOURCES[r].ko) || r;
const fmtTop = (m) => topOf(m, 10).map(([r, c]) => `${ko(r)} ${c}`).join(' · ') || '없음';
const sumOf = (m) => [...m.values()].reduce((a, b) => a + b, 0);
console.log(`\nⓒ 부족 품목 분포 (총 ${sumOf(shortByItem)}건)`);
console.log(`   ${fmtTop(shortByItem)}`);
console.log(`ⓒ 글럿 품목 분포 (총 ${sumOf(glutByItem)}건)`);
console.log(`   ${fmtTop(glutByItem)}`);

// ── ⓓ~ⓕ 축별 열 ─────────────────────────────────────────────────────────────
const PRESERVED = ['dried_fish', 'dried_fruit', 'smoked_meat', 'pickled_veg'];
const stockOf = (r) => world.villages.reduce((a, v) => a + (v.storage[r] || 0), 0);
const toolStock = stockOf('tool') + stockOf('bronze_tool') + stockOf('iron_tool');
let toolQ = 0;
for (const v of world.villages) toolQ += (v.storage.tool || 0) * (v._toolQ != null ? v._toolQ : 1);
console.log(`\nⓓ 도구     재고 ${toolStock.toFixed(1)} · 도구Q ${toolQ.toFixed(1)} · 부족 ${shortByItem.get('tool') || 0}건 · 글럿 ${glutByItem.get('tool') || 0}건`);

const presStock = PRESERVED.reduce((a, r) => a + stockOf(r), 0);
let presTrades = 0, presAmt = 0;
for (const t of world.tradeLog) {
  if (t.sent && PRESERVED.includes(t.sent.res)) { presTrades++; presAmt += t.sent.amt || 0; }
  if (t.bought && PRESERVED.includes(t.bought.res)) { presTrades++; presAmt += t.bought.amt || 0; }
}
console.log(`ⓔ 보존식   재고 ${presStock.toFixed(1)} (${PRESERVED.map((r) => `${ko(r)} ${stockOf(r).toFixed(1)}`).join(' · ')})`);
console.log(`           캐러밴 유통 ${presTrades}건 · ${presAmt.toFixed(1)} 단위`);

// 소금 — 해안/내륙 가격 지역차. 가격은 정본 함수(computeShadowPrices) 하나만 부른다.
let cN = 0, cP = 0, iN = 0, iP = 0, cS = 0, iS = 0, saltTrades = 0, saltAmt = 0;
world.villages.forEach((v, i) => {
  if (!(v.npcs || []).length) return;
  let p = 0; try { p = (econV2.computeShadowPrices(v) || {}).salt || 0; } catch (e) {}
  if (coastal.has(i)) { cN++; cP += p; cS += v.storage.salt || 0; }
  else { iN++; iP += p; iS += v.storage.salt || 0; }
});
for (const t of world.tradeLog) {
  if (t.sent && t.sent.res === 'salt') { saltTrades++; saltAmt += t.sent.amt || 0; }
  if (t.bought && t.bought.res === 'salt') { saltTrades++; saltAmt += t.bought.amt || 0; }
}
const cAvg = cN ? cP / cN : 0, iAvg = iN ? iP / iN : 0;
console.log(`ⓕ 소금     재고 해안 ${cS.toFixed(1)}(${cN}곳) · 내륙 ${iS.toFixed(1)}(${iN}곳) · 부족 ${shortByItem.get('salt') || 0}건`);
console.log(`           가격 해안 ${cAvg.toFixed(3)} · 내륙 ${iAvg.toFixed(3)} · **지역차 ×${cAvg > 0 ? (iAvg / cAvg).toFixed(2) : '—'}** (내륙÷해안 — 1보다 크면 소금길이 선다)`);
console.log(`           캐러밴 유통 ${saltTrades}건 · ${saltAmt.toFixed(1)} 단위`);

// ── ⓖ MSY A/B (지시 §5 — 표만 낸다. 판정은 재민) ─────────────────────────────
{
  const on = process.env.T17_MSY === '1';
  const fishers = world.villages.reduce((a, v) => a + ((v.counts && v.counts.fisher) || 0), 0);
  let fv = 0, fpop = 0, fstock = 0, fp = 0, fpN = 0, capped = 0;
  for (const v of world.villages) {
    if (!(v.npcs || []).length) continue;
    const isFish = ((v.counts && v.counts.fisher) || 0) > 0;
    if (v.land && v.land.fishSustain != null) capped++;
    if (!isFish) continue;
    fv++; fpop += v.npcs.length; fstock += v.storage.fish || 0;
    try { const p = (econV2.computeShadowPrices(v) || {}).fish; if (p != null) { fp += p; fpN++; } } catch (e) {}
  }
  console.log(`ⓖ MSY      상한 ${on ? '**켬**' : '끔'}(T17_MSY) · 상한이 실제로 선 마을 ${capped}/${live}`);
  console.log(`           어촌 ${fv}곳 · 인구 ${fpop} · 어부 ${fishers} · 생선 재고 ${fstock.toFixed(1)} · 생선 가격 평균 ${fpN ? (fp / fpN).toFixed(3) : '—'}`);
}

// ── ⓗ [T60] 어장 눈금 — 잠재 어획 대 상한 ────────────────────────────────────
const SUS = R('server/sustain');
{
  const rows = [];
  for (const v of world.villages) {
    if (!(v.npcs || []).length) continue;
    const raw = +(v._fishRawLast || 0), cap = (v.land && v.land.fishSustain != null) ? +v.land.fishSustain : null;
    if (!(raw > 0)) continue;
    rows.push({ n: v.name, f: (v.counts && v.counts.fisher) || 0, raw: +raw.toFixed(2), cap,
                ratio: cap != null ? +(cap / raw).toFixed(2) : null, ema: +(v._fishRawEMA || 0).toFixed(2) });
  }
  rows.sort((a, b) => b.raw - a.raw);
  const rs = rows.filter((r) => r.ratio != null).map((r) => r.ratio).sort((a, b) => a - b);
  console.log(`\nⓗ 어장 눈금  모드 **${SUS.MSY_MODE}** · 헤드룸 ${SUS.MSY_HEADROOM} · 상한 스위치 T17_MSY=${process.env.T17_MSY === '1' ? '켬' : '끔'}`);
  console.log(`           어부가 있는 마을 ${rows.length} · 잠재 어획 최대 ${rows[0] ? rows[0].raw : 0} · 중앙 ${rows.length ? rows[Math.floor(rows.length / 2)].raw : 0}`);
  if (rs.length) {
    console.log(`           **상한÷잠재** 최소 ${rs[0]} · 중앙 ${rs[Math.floor(rs.length / 2)]} · 최대 ${rs[rs.length - 1]}   (랩 설계 의도 = 1.5~2)`);
    console.log(`           상한이 **무는**(비<1) 마을 ${rs.filter((x) => x < 1).length}/${rs.length}`);
  } else console.log('           상한 미적용(land.fishSustain 없음) — 비를 못 잰다');
  console.log('           ' + rows.slice(0, 6).map((r) => `${r.n}(어부${r.f} 잠재${r.raw}${r.cap != null ? ' 상한' + r.cap : ''})`).join(' · '));
}

// ── ⓘ [T60] 밀도 분해 ────────────────────────────────────────────────────────
{
  const byType = L.stats.byType || {};
  console.log(`\nⓘ 밀도 분해  사건 ${S.emitted} · 마을당 ${daysPer.toFixed(2)}일/건 (캐논 2~3일)`);
  console.log(`           유형 — ` + Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(' · '));
  const topS = topOf(shortByItem, 5).map(([r, c]) => `${ko(r)} ${c}`).join(' · ');
  console.log(`           부족 상위 — ${topS}   (도구 ${shortByItem.get('tool') || 0} · 소금 ${shortByItem.get('salt') || 0})`);
}

// ── ⓙ [T60] 사장 셋 — 켜면 무엇이 움직이나(표만) ─────────────────────────────
{
  let wN = 0, fN = 0, mN = 0, wS = 0, fS = 0;
  for (const s2 of seeds) {
    const lp = s2.lp || {};
    if (lp.woodSustain != null) { wN++; wS += lp.woodSustain; }
    if (lp.forageSustain != null) { fN++; fS += lp.forageSustain; }
    if (lp.marginalQ != null) mN++;
  }
  let lumber = 0, forager = 0;
  for (const v of world.villages) { lumber += (v.counts && v.counts.lumberjack) || 0; forager += (v.counts && v.counts.forager) || 0; }
  console.log(`\nⓙ 사장 셋   woodSustain 잰 마을 ${wN}(합 ${wS.toFixed(1)}) · forageSustain ${fN}(합 ${fS.toFixed(1)}) · marginalQ ${mN}`);
  console.log(`           지금 land 에 실린 것: wood ${world.villages.filter((v) => v.land && v.land.woodSustain != null).length} · forage ${world.villages.filter((v) => v.land && v.land.forageSustain != null).length} · marginalQ ${world.villages.filter((v) => v.land && v.land.marginalQ != null).length}  ← **전부 0 이면 사장**`);
  console.log(`           켜지면 물릴 대상 — 벌목꾼 ${lumber}명 · 채집꾼 ${forager}명 (어부 ${world.villages.reduce((a, v) => a + ((v.counts && v.counts.fisher) || 0), 0)}명과 같은 자리)`);
}

// ── ⓚ ★★[T152 2026-09-07] **기준선 한 줄** — 카드들이 각자 다른 문법으로 내던 열을 한 자리에 ──────
//   ㉮/㉯ 밀도(T133 문법) · 게시·깨진 약속(T142 문법) · `land.game` 최저·중앙(T146 문법 자리) ·
//   그리고 위 ⓐ 여덟 수. 이 한 줄이 다음 카드들이 견줄 기준선이다.
{
  const DEED = new Set(Events.DEED_TYPES || []);
  const B = S.byType || {};
  let vN = 0, dN = 0;
  for (const t of Events.TYPES) { const n = B[t] || 0; if (DEED.has(t)) dN += n; else vN += n; }
  const dens = (n) => (n > 0 ? (live * DAYS / n) : Infinity);
  // 생곡 — 밀·쌀·보리·기장 곳간 합(T73 이 만든 열 · 공통.md 기준선 표의 그 이름).
  const RAWGRAIN = ['wheat', 'rice', 'barley', 'millet'];
  const rawGrainStock = RAWGRAIN.reduce((a, r) => a + stockOf(r), 0);
  const games = world.villages.filter((v) => (v.npcs || []).length > 0)
    .map((v) => +((v.land && v.land.game) || 0)).sort((a, b) => a - b);
  const gMin = games.length ? games[0] : null;
  const gMed = games.length ? games[games.length >> 1] : null;
  console.log(`\nⓚ [T152] 기준선 한 줄 — 시드 ${SEED} · ${DAYS}일 · 인구있는 마을 ${live}`);
  console.log(`  여덟 수   인구 ${pop} · 소멸 ${dead}/${ever} · 무기Q ${weapQ.toFixed(0)} · 확장셀 ${expand}`
    + ` · 게시 ${S.reqOpened} · 도구Q ${toolQ.toFixed(1)} · 보존식 ${presStock.toFixed(1)} · 생곡 ${rawGrainStock.toFixed(1)}`);
  console.log(`  밀도      ㉮ 전체 ${dens(S.emitted).toFixed(2)}일/건 · ㉯ 값 유형 ${dens(vN).toFixed(2)}일/건 (캐논 2~3일)`
    + `   [값 ${vN} · 일 ${dN} · 합 ${S.emitted}]`);
  console.log(`  약속      게시 ${S.reqOpened} · 철회 ${S.reqClosed} · 축소 ${S.reqShrunk}`
    + ` · 못갚아미게시 ${S.reqNoPay} · **깨진 약속(재검증철회) ${S.reqRevalidated}**`);
  // ★★[T152 실측 · 족보 (130)] 이 두 수는 **시딩값(정적)** 이다 — econ 랩은 `villages.js` 생활층
  //   하루 틱(`_lifeDaily`)을 **안 돈다.** T146 이 얹은 **동적** `land.game`(사냥으로 줄고 회복하는 그 값)은
  //   여기 안 잡힌다(T146 자신도 "3시드 A/B 전부 비트 동일 — econ 랩은 _lifeDaily 를 안 돈다"고 적었고,
  //   T152 가 `T146_GAME=0` 으로 되돌려도 JSON 이 비트 동일함을 재확인했다).
  //   ⇒ 동적 land.game 의 기준선은 **T146 계측기**에서 읽어라. 여기 수를 그 자리에 쓰면 틀린 근거가 된다.
  console.log(`  land.game(시딩값 · 정적) 최저 ${gMin == null ? '—' : gMin.toFixed(2)} · 중앙 ${gMed == null ? '—' : gMed.toFixed(2)}`
    + `   [바닥 ${require(path.join(__dirname, '..', 'server', 'livelihood')).FLOOR.game}]`);
  console.log(`            ⚠동적 land.game(T146)은 이 랩이 **안 돈다**(생활층 미실행 · 족보 130) — T146 계측기를 봐라.`);
}

// ── ⓛ ★★[T152] 석재 바닥의 나선 — **몇 곳이 칼날 위에 있나**(귀속만 · 구현 0) ─────────────
{
  console.log(`\nⓛ [T152] 석재 바닥 마을 — \`land.stone == FLOOR(${STONE_FLOOR})\` 전수`);
  if (!floorTrace.length) {
    console.log(`  이 시드엔 바닥 마을이 **0곳**이다(그래서 이 시드에선 그 궤적이 못 난다).`);
  } else {
    console.log('  ' + '마을'.padEnd(12) + 'land'.padStart(6) + '인구(끝/최고)'.padStart(14)
      + '돌 최저'.padStart(9) + '도구 최저'.padStart(10) + '돌<0.2 일수'.padStart(12)
      + '도구≈0 일수'.padStart(12) + '채집·석공(누적 인·일)'.padStart(22) + '  궤적');
    let onEdge = 0;
    for (let k = 0; k < floorTrace.length; k++) {
      const v = floorIdx[k][0], t = floorTrace[k];
      const now = (v.npcs || []).length;
      // ★"궤적 진입" 의 정의(이 표 안에서만 쓰는 말): 도구가 사실상 0 이던 날이 전체의 10% 를 넘고,
      //   그 판에서 인구가 최고점의 절반 밑으로 내려간 적이 있다 — T135 2판이 적은 그 고리의 관측 가능한 그림자.
      const spiral = (t.daysTool0 / Math.max(1, t.days) > 0.1) && (now < t.popMax * 0.5);
      if (spiral) onEdge++;
      console.log('  ' + String(t.name).padEnd(12) + t.land.toFixed(2).padStart(6)
        + `${now}/${t.popMax}`.padStart(14) + (isFinite(t.stoneMin) ? t.stoneMin.toFixed(2) : '—').padStart(9)
        + (isFinite(t.toolMin) ? t.toolMin.toFixed(2) : '—').padStart(10)
        + String(t.daysStone0).padStart(12) + String(t.daysTool0).padStart(12)
        + `${t.forDays}/${t.masonDays}`.padStart(22) + (spiral ? '  ★진입' : '  —'));
    }
    console.log(`  ⇒ **칼날 위 ${onEdge}곳 / 바닥 마을 ${floorTrace.length}곳**(인구있는 마을 ${live} 중).`);
  }
  console.log(`  ★산수(귀속): 바닥 마을 채집꾼의 돌 산출은 \`land.stone × 스킬 × MSY × 0.9\` = **0.225/인·일**(스킬 1 기준)이 상한이고,`);
  console.log(`    석공의 도구 한 배치가 \`_stCost = 0.2 × taper\`, 마제석검 한 자루가 **0.5** 다(economy-sim.js:2152·2178).`);
  console.log(`    ⇒ 바닥 마을에선 채집꾼 하나가 석공 하나를 겨우 먹인다 — 전사 무장이 한 번 끼면 그 자리에서 0 이 된다.`);
  console.log(`    STONE_NET 은 **부르는 사람**은 맞게 부른다(게이트 \`land.stone >= 0.25\` 가 바닥을 포함하도록 \`>\`→\`>=\` 로 고쳐져 있다).`);
  console.log(`    못 잡는 것은 **흐름의 굵기**다 — 바닥 마을은 그 안전망이 여는 관이 세계에서 가장 가늘다.`);
}

if (process.env.T17_JSON) {
  const out = {
    seed: SEED, days: DAYS, villages: seeds.length, live,
    axes: { tool: process.env.T17_TOOL !== '0', preserve: process.env.T17_PRESERVE !== '0', salt: process.env.T17_SALT !== '0' },
    base: { pop, dead, ever, weapQ: +weapQ.toFixed(0), expand, trades: world.tradeLog.length },
    board: { reqOpened: S.reqOpened, reqClosed: S.reqClosed, emitted: S.emitted, daysPer: +daysPer.toFixed(2) },
    short: Object.fromEntries(topOf(shortByItem, 30)), glut: Object.fromEntries(topOf(glutByItem, 30)),
    tool: { stock: +toolStock.toFixed(1), q: +toolQ.toFixed(1), short: shortByItem.get('tool') || 0 },
    preserve: { stock: +presStock.toFixed(1), trades: presTrades, amt: +presAmt.toFixed(1),
                each: Object.fromEntries(PRESERVED.map((r) => [r, +stockOf(r).toFixed(1)])) },
    msy: (() => {
      const on = process.env.T17_MSY === '1';
      let fv = 0, fpop = 0, fstock = 0, fp = 0, fpN = 0, capped = 0;
      const fishers = world.villages.reduce((a, v) => a + ((v.counts && v.counts.fisher) || 0), 0);
      for (const v of world.villages) {
        if (!(v.npcs || []).length) continue;
        if (v.land && v.land.fishSustain != null) capped++;
        if (!(((v.counts && v.counts.fisher) || 0) > 0)) continue;
        fv++; fpop += v.npcs.length; fstock += v.storage.fish || 0;
        try { const p = (econV2.computeShadowPrices(v) || {}).fish; if (p != null) { fp += p; fpN++; } } catch (e) {}
      }
      return { on, capped, fishVillages: fv, fishPop: fpop, fishers, fishStock: +fstock.toFixed(1), fishPrice: fpN ? +(fp / fpN).toFixed(4) : null };
    })(),
    fish: (() => {
      const rows = [];
      for (const v of world.villages) {
        if (!(v.npcs || []).length) continue;
        const raw = +(v._fishRawLast || 0), cap = (v.land && v.land.fishSustain != null) ? +v.land.fishSustain : null;
        if (raw > 0) rows.push({ name: v.name, fishers: (v.counts && v.counts.fisher) || 0, raw: +raw.toFixed(2), cap, ratio: cap != null ? +(cap / raw).toFixed(3) : null });
      }
      const rs = rows.filter((r) => r.ratio != null).map((r) => r.ratio).sort((a, b) => a - b);
      return { mode: SUS.MSY_MODE, headroom: SUS.MSY_HEADROOM, capOn: process.env.T17_MSY === '1',
               n: rows.length, ratioMin: rs[0] ?? null, ratioMed: rs.length ? rs[Math.floor(rs.length / 2)] : null,
               ratioMax: rs.length ? rs[rs.length - 1] : null, binding: rs.filter((x) => x < 1).length, rows: rows.slice(0, 20) };
    })(),
    salt: { coastStock: +cS.toFixed(1), inlandStock: +iS.toFixed(1), coastN: cN, inlandN: iN,
            coastPrice: +cAvg.toFixed(4), inlandPrice: +iAvg.toFixed(4),
            gap: cAvg > 0 ? +(iAvg / cAvg).toFixed(3) : null, trades: saltTrades, amt: +saltAmt.toFixed(1) },
  };
  fs.writeFileSync(process.env.T17_JSON, JSON.stringify(out, null, 2));
  console.log(`\n  JSON: ${process.env.T17_JSON}`);
}
try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
