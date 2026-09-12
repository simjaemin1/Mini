#!/usr/bin/env node
// === scripts/t204-cook.js — T204: 조리식은 왜 내륙에 안 서나 (cookTarget 세 문턱 귀속) ============
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
// ⚠세계는 `scripts/t17-metrics.js`·`t196-happy.js` 와 **같은 문**으로 세운다(사본이 아니라 같은 절차 · 족보 130).
// ⚠**코드 0.** `sim/economy-sim.js` 는 한 바이트도 안 고친다. `cookTarget` 은 내보내기가 없으므로
//   T196 문법 그대로 — **그 파일 소스를 읽어 끝에 내보내기 줄만** 붙여 `require.cache` 에 심는다
//   (세계 전체가 그 한 인스턴스를 쓴다 · 동작 무변). 문턱 판정은 **그 정본 함수를 부른다**(재구현 0).
//
// 세 문턱(`sim/economy-sim.js:3606 cookTarget`):
//   ⓐ 식량 안보   `totalFoodEquivalent(v) < N×35 || storage.food < N×8`            → 0
//   ⓑ 부재료 재고 `Σ COOK_SIDE_INGREDIENTS(storage) < N×1.5`                       → 0
//   ⓒ 정원        `min(floor(sideFlow/3), floor(N×0.06))`  — 흐름이 3 미만이거나 N<17 이면 0
//
// **귀속은 되돌림(ablation)이다 — 제약을 `Infinity` 로 떼고 정본을 다시 부른다**(새 수 0: 무한은 값이 아니라 '제약 제거'):
//   · ⓐ 뗌: `storage.food = Infinity`            (식량 안보 두 조건 동시 충족)
//   · ⓑ 뗌: 부재료 여섯 `storage[r] = Infinity`   (정본 표 그대로 읽어서)
//   · ⓒ 뗌: 여섯 `dailyProductionBuf[r] = Infinity`
//   문턱 g 가 막았나 = **g 만 남기고 나머지를 다 뗐을 때도 0 인가**. 셋을 다 떼도 0 이면 남는 원인은
//   `floor(N×0.06)` 하나뿐 ⇒ **ⓒ-정원상한(N<17)**. 코드 순서(ⓐ→ⓑ→ⓒ)로 **첫 막는 문턱**도 같이 찍는다.
//
// 표본 시점: **정본이 `v.lastStats = stats` 를 쓰는 그 순간**(`:3089`) — 접근자 하나(마을 객체에만 · 정본 무접촉).
//   그 자리는 픽커가 `cookTarget` 을 부르는 `:3115` 보다 **26줄 앞**이고, 그 사이에 `dailyProductionBuf` 리셋(`:2106`)이
//   없으므로 **픽커가 보는 그 버퍼**다. 자기검사가 그것을 받친다: `cookTarget>0` 인 마을·일과 요리사가 선 마을·일이 같이 간다.
//
// 실행: node scripts/t204-cook.js [일수=800] [시드=1020]
//   T204_SAMPLE=10          표본 간격(일)
//   T204_T100=1             T100 켠 팔(`T100_FIELD_YIELD` env 를 그대로 넘긴다 · ③ 접점 한 줄용)
//   T204_JSON=/tmp/x.json   표를 JSON 으로도
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t204-${process.pid}.db`;

const path = require('path');
const fs = require('fs');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

// ── ★정본 한 인스턴스 + 내보내기 줄(파일 무접촉 · T196 문법) ─────────────────
const ECON_FILE = path.join(ROOT, 'sim', 'economy-sim.js');
const _src = fs.readFileSync(ECON_FILE, 'utf8');
const _addend = '\nmodule.exports.__t204 = { cookTarget, COOK_SIDE_INGREDIENTS, stats: _computeVillageStats, JOBS };\n';
{
  const m = new Module(ECON_FILE, null);
  m.filename = ECON_FILE;
  m.paths = Module._nodeModulePaths(path.dirname(ECON_FILE));
  require.cache[ECON_FILE] = m;
  m._compile(_src + _addend, ECON_FILE);
  m.loaded = true;
}

const _av = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DAYS = parseInt(_av[0], 10) || 800;
const SEED = parseInt(_av[1], 10) || 1020;
const SAMPLE = parseInt(process.env.T204_SAMPLE || '10', 10) || 10;

const econ = R('sim/economy-sim');
const CK = econ.__t204;
if (!CK || typeof CK.cookTarget !== 'function') { console.error('정본 cookTarget 을 못 잡았다'); process.exit(1); }
const SIDES = CK.COOK_SIDE_INGREDIENTS.slice();            // ★정본 표 그대로(손으로 안 적는다)
const cookTarget = CK.cookTarget;

// ── 귀속 — 정본을 부르기만 한다(재구현 0) ────────────────────────────────────
const INF = Infinity;
// ★뗄 때 **새는 길이 없어야** 한다: ⓑ 를 여섯 전부로 떼면 과일·채소·버섯·고기·물고기가 `totalFoodEquivalent` 에
//   들어가 ⓐ 까지 같이 풀린다(그러면 ⓐ 가 영원히 안 잡힌다 — 첫 판에서 '알수없음' 132개가 났다).
//   그래서 ⓑ 는 **`twig` 하나로만** 뗀다: 정본 부재료 목록에 있으면서 `FORAGE_FOOD_FACTOR` 에 없는 유일한 품목이라
//   `sideStock` 만 올리고 식량등가는 한 톨도 안 올린다(아래 자기검사가 그 0 을 찍는다).
//   ⚠뗌을 겹칠 땐 **한 사본에 같이 얹는다**(따로 만들어 합치면 `storage` 가 통째로 덮여 앞의 뗌이 사라진다 — 둘째 판의 결함).
function relaxed(s, A, B, C) {
  const st = Object.assign({}, s.storage);
  if (A) st.food = INF;                                   // ⓐ 식량 안보 — 둘 다(식량등가·food/N) 한 번에
  if (B) st.twig = INF;                                   // ⓑ 부재료 재고 — 식량이 아닌 부재료로만
  const dp = Object.assign({}, s.dailyProductionBuf);
  if (C) for (const r of SIDES) dp[r] = INF;              // ⓒ 부재료 흐름
  return Object.assign({}, s, { storage: st, dailyProductionBuf: dp });
}
function attribute(s) {
  const t0 = cookTarget(s);
  if (t0 > 0) return { t: t0, stands: true, first: '선다', A: false, B: false, Cf: false, Cn: false };
  const Cn = !(cookTarget(relaxed(s, 1, 1, 1)) > 0);       // 셋을 다 떼도 0 ⇒ 남는 것은 floor(N×0.06) 하나
  const A = !Cn && !(cookTarget(relaxed(s, 0, 1, 1)) > 0);  // ⓐ만 남기고 떼도 0 ⇒ ⓐ가 막는다
  const B = !Cn && !(cookTarget(relaxed(s, 1, 0, 1)) > 0);
  const Cf = !Cn && !(cookTarget(relaxed(s, 1, 1, 0)) > 0);
  const first = Cn ? 'ⓒ정원상한' : (A ? 'ⓐ식량안보' : (B ? 'ⓑ부재료재고' : (Cf ? 'ⓒ흐름' : '알수없음')));
  return { t: 0, stands: false, first, A, B, Cf, Cn };
}

// 뗌이 새지 않는다 — 정본 `totalFoodEquivalent` 로 확인(twig 는 식량이 아니다)
const _leak = (() => {
  const probe = { storage: { food: 1, fish: 1, meat: 1, cooked_food: 0 } };
  const before = econ.totalFoodEquivalent(probe);
  const after = econ.totalFoodEquivalent({ storage: Object.assign({}, probe.storage, { twig: INF }) });
  return after - before;
})();

// ── ★표본 후크 — 정본이 `lastStats` 를 쓰는 그 자리(접근자만) ────────────────
let CAPTURE = false;
function hookVillage(v) {
  if (v.__t204) return; v.__t204 = true;
  let _ls = v.lastStats, _snap = null, _day = -1;
  Object.defineProperty(v, 'lastStats', {
    configurable: true, enumerable: true,
    get() { return _ls; },
    set(s) {
      _ls = s;
      if (!CAPTURE) return;
      const n = (v.npcs || []).length;
      let cooks = 0; for (const p of (v.npcs || [])) if (p.currentJob === 'cook') cooks++;
      _snap = {
        npcs: new Array(Math.max(1, n)),                              // cookTarget 은 길이만 본다
        storage: Object.assign({}, v.storage || {}),
        dailyProductionBuf: Object.assign({}, v.dailyProductionBuf || {}),
        _pop: n, _cooks: cooks, _happy: s && s.happiness,
      };
      _day = (v._world && v._world.day) || 0;
    },
  });
  Object.defineProperty(v, '__t204snap', { configurable: true, enumerable: false, get() { return _snap ? { s: _snap, day: _day } : null; } });
}

// ── 세계 — `t17-metrics.js` 와 같은 문 ───────────────────────────────────────
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

const hard = T.getZoneVillages(Z) || [];
const picked = P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
const seeds = [];
for (const hv of picked) {
  const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
  if (!c) continue;
  let layout;
  try { if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62); layout = VillageLayout.generate(ta, c.ccx, c.ccy, P.INITIAL_POP, {}); } catch (e) { continue; }
  seeds.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy, lp: P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout) });
}

const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
R('server/trees').attachToWorld(world);        // ★족보 130
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;
for (const v of world.villages) hookVillage(v);
const LAND = {};
for (const s of seeds) LAND[s.name] = { fert: s.lp.fertility, water: s.lp.water, wood: s.lp.wood, stone: s.lp.stone, game: s.lp.game, ore: s.lp.ore };

const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: Villages.playerVillageDepositMap(), onEvent: () => {} });
L.prime(world);

// ── 표본 이력 ────────────────────────────────────────────────────────────────
const HIST = new Map();
const LASTSNAP = new Map();
function harvest() {
  for (const v of world.villages) {
    const S0 = v.__t204snap; if (!S0) continue;
    if ((v.npcs || []).length <= 0) continue;
    let a = HIST.get(v.name); if (!a) HIST.set(v.name, a = []);
    if (a.length && a[a.length - 1].d === S0.day) continue;     // 틱을 거른 마을 — 같은 표본 두 번 안 센다
    const s = S0.s, n = Math.max(1, s._pop);
    const at = attribute(s);
    let sideStock = 0, sideFlow = 0, have = 0;
    const items = {};
    for (const r of SIDES) {                                     // 서술용 열(문턱 판정은 위에서 정본이 했다)
      const q = s.storage[r] || 0, f = s.dailyProductionBuf[r] || 0;
      sideStock += q; sideFlow += f; if (q >= 0.5) have++;
      items[r] = [q / n, f];                                     // [재고/N, 흐름]
    }
    a.push({ d: S0.day, pop: s._pop, cooks: s._cooks, target: at.t, stands: at.stands, first: at.first, items,
      A: at.A, B: at.B, Cf: at.Cf, Cn: at.Cn,
      cookedOut: s.dailyProductionBuf.cooked_food || 0, cookedStock: s.storage.cooked_food || 0,
      foodPC: (s.storage.food || 0) / n, feqPC: econ.totalFoodEquivalent(s) / n,
      sideStockPC: sideStock / n, sideFlow, have, happy: s._happy });
    LASTSNAP.set(v.name, { s, n, d: S0.day });
  }
}

const _log = console.log; console.log = () => {};
for (let d = 0; d < DAYS; d++) {
  CAPTURE = (world.day % SAMPLE === 0) || (d === DAYS - 1);
  econV2.tickWorldV2(world); L.scanDay(world, world.day, {});
  for (const v of world.villages) hookVillage(v);
  if (CAPTURE) harvest();
}
CAPTURE = false;
console.log = _log;

// ── 여덟 수 ──────────────────────────────────────────────────────────────────
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
const S = L.stats;
const daysPer = 1 / Math.max(1e-9, S.emitted / Math.max(1, live * S.days));

// ── 표 ───────────────────────────────────────────────────────────────────────
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (x) => (100 * x).toFixed(0) + '%';
const pct1 = (x) => (100 * x).toFixed(1) + '%';

const V = [];
for (const v of world.villages) {
  const h = HIST.get(v.name) || []; if (!h.length) continue;
  V.push({ name: v.name, pop: (v.npcs || []).length, land: LAND[v.name] || {}, hist: h,
    hMed: med(h.map((x) => x.happy).filter((x) => x != null)),
    stands: h.filter((x) => x.stands).length / h.length,
    cooksMed: med(h.map((x) => x.cooks)), cookedOutMed: med(h.map((x) => x.cookedOut)),
    cookedStockMed: med(h.map((x) => x.cookedStock)), sideStockMed: med(h.map((x) => x.sideStockPC)),
    sideFlowMed: med(h.map((x) => x.sideFlow)), feqMed: med(h.map((x) => x.feqPC)), foodMed: med(h.map((x) => x.foodPC)),
    haveMed: med(h.map((x) => x.have)), popMed: med(h.map((x) => x.pop)),
    firstMode: (() => { const c = {}; for (const x of h) c[x.first] = (c[x.first] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0]; })() });
}
const byHappy = V.slice().filter((v) => v.hMed != null).sort((a, b) => a.hMed - b.hMed);
const bottom = byHappy.slice(0, 10), top = byHappy.slice(-5).reverse();
const rest = V.filter((v) => bottom.indexOf(v) < 0 && top.indexOf(v) < 0);
const poolOf = (set) => set.flatMap((v) => v.hist);

console.log(`\n=== T204 조리 문턱 귀속 — 서버 ${seeds.length}곳 · 시드 ${SEED} · ${DAYS}일 · **끈** 팔${process.env.T100_FIELD_YIELD ? ' + T100 켬' : ''} · 표본 ${SAMPLE}일 ===`);
console.log(`  여덟 수   인구 ${pop} · 소멸 ${dead}/${ever} · 무기Q ${weapQ.toFixed(0)} · 확장셀 ${expand}`);
console.log(`            게시 ${S.reqOpened} · 일/건 ${daysPer.toFixed(2)} · 도구Q ${toolQ.toFixed(1)} · 보존식 ${presStock.toFixed(1)}`);
const POOL = poolOf(V);
console.log(`  자기검사  표본 ${POOL.length}개(마을·일) · cookTarget>0 ${pct1(POOL.filter((x) => x.stands).length / POOL.length)}`
  + ` ↔ 요리사>0 ${pct1(POOL.filter((x) => x.cooks > 0).length / POOL.length)}`
  + ` ↔ 조리식 산출>0 ${pct1(POOL.filter((x) => x.cookedOut > 0).length / POOL.length)}`
  + ` · **귀속 실패(알수없음) ${POOL.filter((x) => x.first === '알수없음').length}개** · ⓑ 뗌이 식량등가에 새는 양 ${_leak}`);
console.log(`  부재료 전수(정본 COOK_SIDE_INGREDIENTS): ${SIDES.join(' · ')}`);

console.log('\n  집단'.padEnd(12) + '표본'.padStart(8) + '선다'.padStart(8) + 'ⓐ식량안보'.padStart(12) + 'ⓑ부재료재고'.padStart(14) + 'ⓒ흐름'.padStart(9) + 'ⓒ정원상한'.padStart(12));
for (const [nm, set] of [['전체', V], ['하위 10곳', bottom], ['상위 5곳', top], ['나머지', rest]]) {
  const p = poolOf(set); if (!p.length) continue;
  const f = (k) => pct1(p.filter((x) => x.first === k).length / p.length);
  console.log('  ' + nm.padEnd(10) + String(p.length).padStart(8) + pct1(p.filter((x) => x.stands).length / p.length).padStart(8)
    + f('ⓐ식량안보').padStart(12) + f('ⓑ부재료재고').padStart(14) + f('ⓒ흐름').padStart(9) + f('ⓒ정원상한').padStart(12));
}
console.log('\n  문턱별 위반율(겹침 허용)');
{
  const blocked = POOL.filter((x) => !x.stands);
  const cn = blocked.filter((x) => x.Cn);
  const q = blocked.filter((x) => !x.Cn);      // ★N<17 표본은 정원상한이 먼저 0 이라 다른 문턱을 묻지 않는다 — 분모에서 뺀다
  console.log('  ' + `막힌 표본 ${blocked.length}개 중 ⓒ정원상한(N<17) ${pct1(cn.length / Math.max(1, blocked.length))}`);
  console.log('  ' + `나머지 ${q.length}개에서(겹침 허용)`.padEnd(24)
    + ['A', 'B', 'Cf'].map((k, i) => ['ⓐ', 'ⓑ', 'ⓒ흐름'][i] + ' ' + pct1(q.filter((x) => x[k]).length / Math.max(1, q.length))).join(' · ')
    + ` · **ⓐ와ⓑ 둘 다 ${pct1(q.filter((x) => x.A && x.B).length / Math.max(1, q.length))}** · ⓐ만 ${pct1(q.filter((x) => x.A && !x.B).length / Math.max(1, q.length))} · ⓑ만 ${pct1(q.filter((x) => x.B && !x.A).length / Math.max(1, q.length))}`);
}

const cols = (v) => [v.popMed, v.cooksMed, v.cookedOutMed, v.cookedStockMed, v.feqMed, v.foodMed, v.sideStockMed, v.sideFlowMed, v.haveMed];
const hdr = ['인구', '요리사', '조리식/일', '조리식재고', '식량등가/N', 'food/N', '부재료/N', '부재료흐름', '가진부재료'];
function vtable(title, set) {
  console.log(`\n  ${title}`.padEnd(16) + hdr.map((h) => h.padStart(11)).join('') + '   선다%  첫막음(최빈)        지력  물');
  for (const v of set) {
    console.log('  ' + String(v.name).padEnd(12) + cols(v).map((x) => (x == null ? '—' : (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2))).padStart(11)).join('')
      + pct(v.stands).padStart(7) + '  ' + (v.firstMode ? (v.firstMode[0] + ' ' + pct(v.firstMode[1] / v.hist.length)).padEnd(20) : ''.padEnd(20))
      + String(v.land.fert ?? '—').padStart(5) + String(v.land.water ?? '—').padStart(6));
  }
}
vtable('하위 10곳', bottom);
vtable('상위 5곳', top);

// ── 부재료 전수 — 품목별 재고/N · 흐름 (집단별 마을·일 중앙) ────────────────
{
  console.log('\n  부재료 품목'.padEnd(16) + SIDES.map((r) => r.padStart(11)).join('') + '   (위: 재고/N · 아래: 흐름/일 · 마을·일 중앙)');
  for (const [nm, set] of [['전체', V], ['하위 10곳', bottom], ['상위 5곳', top], ['나머지', rest]]) {
    const p = poolOf(set); if (!p.length) continue;
    console.log('  ' + (nm + ' 재고').padEnd(14) + SIDES.map((r) => (med(p.map((x) => x.items[r][0])) ?? 0).toFixed(2).padStart(11)).join(''));
    console.log('  ' + (nm + ' 흐름').padEnd(14) + SIDES.map((r) => (med(p.map((x) => x.items[r][1])) ?? 0).toFixed(2).padStart(11)).join(''));
  }
  const p = poolOf(V);
  console.log('  ' + '있는 날 비율'.padEnd(13) + SIDES.map((r) => pct(p.filter((x) => x.items[r][0] > 0).length / p.length).padStart(11)).join('') + '   재고가 한 톨이라도 있는 마을·일');
  console.log('  ' + '≥0.5 인 날'.padEnd(14) + SIDES.map((r) => pct(p.filter((x) => x.items[r][0] * 1 >= 0.5 / Math.max(1, 1)).length / p.length).padStart(11)).join('') + '   (재고/N ≥ 0.5)');
}

// ── cooked_food 의 행복 기여(T196 재현) ──────────────────────────────────────
{
  const F = CK.stats;
  const one = (v) => {
    const S0 = LASTSNAP.get(v.name); if (!S0) return null;
    const base = F(S0.s, S0.n).happiness;
    const st = Object.assign({}, S0.s.storage); delete st.cooked_food;
    return base - F(Object.assign({}, S0.s, { storage: st }), S0.n).happiness;
  };
  const t = top.map(one).filter((x) => x != null);
  const b = bottom.map(one).filter((x) => x != null);
  console.log(`\n  cooked_food 의 행복 기여(마지막 표본 · 마을당 평균 · T196 재현)  상위 5곳 ${t.length ? (t.reduce((a, c) => a + c, 0) / t.length).toFixed(3) : '—'}`
    + ` · 하위 10곳 ${b.length ? (b.reduce((a, c) => a + c, 0) / b.length).toFixed(3) : '—'}`);
}

if (process.env.T204_JSON) {
  fs.writeFileSync(process.env.T204_JSON, JSON.stringify({ seed: SEED, days: DAYS, sample: SAMPLE, sides: SIDES,
    eight: { pop, dead, ever, weapQ, expand, toolQ, presStock, reqOpened: S.reqOpened, daysPer },
    villages: V.map((v) => ({ name: v.name, pop: v.pop, land: v.land, hMed: v.hMed, stands: v.stands, cooksMed: v.cooksMed,
      cookedOutMed: v.cookedOutMed, cookedStockMed: v.cookedStockMed, sideStockMed: v.sideStockMed, sideFlowMed: v.sideFlowMed,
      feqMed: v.feqMed, foodMed: v.foodMed, haveMed: v.haveMed, popMed: v.popMed, firstMode: v.firstMode,
      firstMix: (() => { const c = {}; for (const x of v.hist) c[x.first] = (c[x.first] || 0) + 1; return c; })(),
      flags: { n: v.hist.length, A: v.hist.filter((x) => x.A).length, B: v.hist.filter((x) => x.B).length,
        Cf: v.hist.filter((x) => x.Cf).length, Cn: v.hist.filter((x) => x.Cn).length, stands: v.hist.filter((x) => x.stands).length },
      items: (() => { const o = {}; for (const r of SIDES) o[r] = [med(v.hist.map((x) => x.items[r][0])), med(v.hist.map((x) => x.items[r][1]))]; return o; })() })) }, null, 1));
  console.log(`\n  [JSON] ${process.env.T204_JSON}`);
}
