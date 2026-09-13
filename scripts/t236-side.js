#!/usr/bin/env node
// === scripts/t236-side.js — T236: 부재료는 내륙에 오고 있나 (첫째 화물 leg 전수) ==============
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
// ⚠세계는 `scripts/t17-metrics.js`·`t204-cook.js`·`t231-second-anatomy.js` 와 **같은 문**(족보 130).
// ⚠**코드 0.** 엔진에 훅이 없다(`onTradeLeg`·`spareCapFn` 은 이 판에 없다) — 그래서 이 계측기는
//   **`world.caravans` 를 날마다 훑는다**(정본 무접촉 · 관측만). 그 배열이 첫째 화물의 정본 장부다:
//   `sim/economy-sim-v2.js:811~826` 이 `{from,to,giveRes,giveAmt,departDay,arriveDay,state}` 로 싣고,
//   `:1034` 이 도착 때 `c.to.storage[c.giveRes] += deliveredGive` 로 내린다.
// ⚠문턱 재판정은 **정본 `cookTarget` 을 그대로 부른다**(T204 되돌림 문법 · 재구현 0):
//   내보내기가 없으므로 소스를 읽어 끝에 내보내기 줄만 붙여 `require.cache` 에 심는다(파일 무접촉).
//
// 실행: node scripts/t236-side.js [일수=800] [시드=1020]
//   T236_SAMPLE=10          행복·문턱 표본 간격(일)
//   T236_JSON=/tmp/x.json
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t236-${process.pid}.db`;

const path = require('path');
const fs = require('fs');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

// ── ★정본 한 인스턴스 + 내보내기 줄(파일 무접촉 · T204 문법) ─────────────────
const ECON_FILE = path.join(ROOT, 'sim', 'economy-sim.js');
{
  const src = fs.readFileSync(ECON_FILE, 'utf8')
    + '\nmodule.exports.__t236 = { cookTarget, COOK_SIDE_INGREDIENTS, stats: _computeVillageStats };\n';
  const m = new Module(ECON_FILE, null);
  m.filename = ECON_FILE; m.paths = Module._nodeModulePaths(path.dirname(ECON_FILE));
  require.cache[ECON_FILE] = m; m._compile(src, ECON_FILE); m.loaded = true;
}

const _av = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DAYS = parseInt(_av[0], 10) || 800;
const SEED = parseInt(_av[1], 10) || 1020;
const SAMPLE = parseInt(process.env.T236_SAMPLE || '10', 10) || 10;

const econ = R('sim/economy-sim');
const CK = econ.__t236;
const SIDES = CK.COOK_SIDE_INGREDIENTS.slice();          // ★정본 표 그대로(손으로 안 적는다)
const cookTarget = CK.cookTarget;

// 문턱 되돌림(T204 그대로) — 제약을 Infinity 로 떼고 정본을 다시 부른다. ⓑ 는 식량이 아닌 `twig` 로만 뗀다(누수 0).
const INF = Infinity;
function relaxed(s, A, B, C) {
  const st = Object.assign({}, s.storage);
  if (A) st.food = INF;
  if (B) st.twig = INF;
  const dp = Object.assign({}, s.dailyProductionBuf);
  if (C) for (const r of SIDES) dp[r] = INF;
  return Object.assign({}, s, { storage: st, dailyProductionBuf: dp });
}
function gateOf(v) {
  const s = { npcs: new Array(Math.max(1, (v.npcs || []).length)), storage: Object.assign({}, v.storage || {}),
    dailyProductionBuf: Object.assign({}, v.dailyProductionBuf || {}) };
  if (cookTarget(s) > 0) return '선다';
  if (!(cookTarget(relaxed(s, 1, 1, 1)) > 0)) return 'ⓒ정원상한';
  if (!(cookTarget(relaxed(s, 0, 1, 1)) > 0)) return 'ⓐ식량안보';
  if (!(cookTarget(relaxed(s, 1, 0, 1)) > 0)) return 'ⓑ부재료재고';
  if (!(cookTarget(relaxed(s, 1, 1, 0)) > 0)) return 'ⓒ흐름';
  return '알수없음';
}

// ── 세계 — `t17-metrics.js` 와 같은 문 (시드 캐시는 T231 문법) ───────────────
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
R('server/trees').attachToWorld(world);          // ★족보 130 — 서버가 여는 그 문을 계측기도 연다
const LAND = {};
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
  LAND[s.name] = { fert: s.lp.fertility, water: s.lp.water, wood: s.lp.wood, stone: s.lp.stone, game: s.lp.game };
}
world.day = 0;
const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: Villages.playerVillageDepositMap(), onEvent: () => {} });
L.prime(world);

// ── 관측: leg 장부 · 도착 · 행복 표본 ────────────────────────────────────────
const SIDESET = new Set(SIDES);
const LEGS = [];                         // {id, dep, from, res, amt0, to0}
const track = new Map();                 // id → {c, rec, arrived}
const ARRIV = [];                        // {day, to, res, amt, gate, fate:{d1,d3,d7}}
const HAP = new Map();                   // 마을 → [행복]
const STOCK = new Map();                 // 마을 → {fishPC:[], sidePC:[]}
const pending = [];                      // 도착 뒤 잔존 추적
function pushArr(m, k, x) { let a = m.get(k); if (!a) m.set(k, a = []); a.push(x); }

const _log = console.log; console.log = () => {};
for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world); L.scanDay(world, world.day, {});
  // ① 새 leg
  for (const c of (world.caravans || [])) {
    if (track.has(c.id)) continue;
    const rec = { id: c.id, dep: c.departDay, from: c.from && c.from.name, to0: c.to && c.to.name,
      res: c.giveRes, amt0: c.giveAmt, side: SIDESET.has(c.giveRes) };
    LEGS.push(rec); track.set(c.id, { c, rec, arrived: false });
  }
  // ② 도착 — 도착일이 지난 leg 을 확정(경로가 바뀌면 그 시점의 `to` 를 읽는다)
  for (const [id, t] of track) {
    if (t.arrived) continue;
    const c = t.c;
    if (world.day < c.arriveDay && c.state === 'outbound') continue;
    t.arrived = true; t.rec.to = c.to && c.to.name; t.rec.amt = c.giveAmt; t.rec.arr = world.day;
    if (t.rec.side && c.to) {
      const a = { day: world.day, to: c.to.name, res: c.giveRes, amt: c.giveAmt,
        stock: (c.to.storage[c.giveRes] || 0), pop: (c.to.npcs || []).length,
        gate: gateOf(c.to), fate: {} };
      ARRIV.push(a); pending.push({ a, v: c.to, res: c.giveRes, base: (c.to.storage[c.giveRes] || 0), day: world.day });
    }
  }
  // ③ 도착 뒤 잔존(+1 · +3 · +7일)
  for (let i = pending.length - 1; i >= 0; i--) {
    const p = pending[i], dd = world.day - p.day;
    if (dd === 1 || dd === 3 || dd === 7) p.a.fate['d' + dd] = +(p.v.storage[p.res] || 0).toFixed(3);
    if (dd >= 7) pending.splice(i, 1);
  }
  // ④ 행복·재고 표본
  if (world.day % SAMPLE === 0) {
    for (const v of world.villages) {
      const n = (v.npcs || []).length; if (n <= 0) continue;
      if (v.lastStats && typeof v.lastStats.happiness === 'number') pushArr(HAP, v.name, v.lastStats.happiness);
      let side = 0; for (const r of SIDES) side += (v.storage[r] || 0);
      let s = STOCK.get(v.name); if (!s) STOCK.set(v.name, s = { fish: [], side: [], gate: {} });
      s.fish.push((v.storage.fish || 0) / n); s.side.push(side / n);
      const g = gateOf(v); s.gate[g] = (s.gate[g] || 0) + 1;
    }
  }
}
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

const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (x) => (100 * x).toFixed(1) + '%';
const kindOf = (nm) => (String(nm).match(/^[가-힣]+/) || ['?'])[0];

// 마을 등급 — 행복 시간중앙 하위 10 / 상위 5 (T196 문법)
const V = world.villages.map((v) => ({ name: v.name, pop: (v.npcs || []).length, land: LAND[v.name] || {},
  hMed: med(HAP.get(v.name) || []) })).filter((x) => x.hMed != null);
const byH = V.slice().sort((a, b) => a.hMed - b.hMed);
const BOT = new Set(byH.slice(0, 10).map((x) => x.name));
const TOP = new Set(byH.slice(-5).map((x) => x.name));

console.log(`\n=== T236 부재료 교역 — 서버 ${seeds.length}곳 · 시드 ${SEED} · ${DAYS}일 · **끈** 팔 · 표본 ${SAMPLE}일 ===`);
console.log(`  여덟 수   인구 ${pop} · 소멸 ${dead}/${ever} · 무기Q ${weapQ.toFixed(0)} · 확장셀 ${expand}`);
console.log(`            게시 ${S.reqOpened} · 일/건 ${daysPer.toFixed(2)} · 도구Q ${toolQ.toFixed(1)} · 보존식 ${presStock.toFixed(1)}`);
console.log(`  부재료 정본(COOK_SIDE_INGREDIENTS): ${SIDES.join(' · ')}`);

// ── ⓐ leg 표 ────────────────────────────────────────────────────────────────
const done = LEGS.filter((r) => r.arr != null);
const sideLegs = done.filter((r) => r.side);
const amtOf = (a) => a.reduce((s, r) => s + (r.amt || 0), 0);
console.log(`\n  [ⓐ] leg 총 ${LEGS.length}건(도착 확정 ${done.length}) · **부재료 leg ${sideLegs.length}건 = ${pct(sideLegs.length / Math.max(1, done.length))}** · 부재료 양 ${amtOf(sideLegs).toFixed(0)} / 전체 ${amtOf(done).toFixed(0)} = ${pct(amtOf(sideLegs) / Math.max(1, amtOf(done)))}`);
{
  const byRes = {};
  for (const r of done) { const k = r.res; (byRes[k] || (byRes[k] = { n: 0, amt: 0, side: r.side }))['n']++; byRes[k].amt += r.amt || 0; }
  const rows = Object.entries(byRes).sort((a, b) => b[1].n - a[1].n).slice(0, 12);
  console.log('  품목'.padEnd(16) + 'leg'.padStart(8) + '비율'.padStart(8) + '양'.padStart(11) + '   부재료?');
  for (const [k, x] of rows) console.log('  ' + k.padEnd(14) + String(x.n).padStart(8) + pct(x.n / done.length).padStart(8) + x.amt.toFixed(0).padStart(11) + (x.side ? '   ★' : ''));
  // 출발 → 도착 유형
  const pair = {};
  for (const r of sideLegs) { const k = kindOf(r.from) + '→' + kindOf(r.to); (pair[k] || (pair[k] = { n: 0, amt: 0 })).n++; pair[k].amt += r.amt || 0; }
  const pr = Object.entries(pair).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  console.log('  부재료 leg 출발→도착  ' + (pr.length ? pr.map(([k, x]) => `${k} ${x.n}건(${x.amt.toFixed(0)})`).join(' · ') : '—'));
  // 내륙 하위 10곳이 받은 부재료
  const toBot = sideLegs.filter((r) => BOT.has(r.to));
  const daysWith = new Set(toBot.map((r) => r.arr + '|' + r.to)).size;
  console.log(`  **하위 10곳(내륙)이 받은 부재료** — leg ${toBot.length}건 · 합 ${amtOf(toBot).toFixed(1)} · 마을·일 ${daysWith}회(전체 마을·일 ${10 * DAYS} 중 ${pct(daysWith / (10 * DAYS))})`);
  const perV = {};
  for (const r of toBot) (perV[r.to] || (perV[r.to] = { n: 0, amt: 0 })).n++, perV[r.to].amt += r.amt || 0;
  console.log('    ' + (Object.keys(perV).length ? Object.entries(perV).map(([k, x]) => `${k} ${x.n}건/${x.amt.toFixed(0)}`).join(' · ') : '**한 건도 없다**'));
  const toTop = sideLegs.filter((r) => TOP.has(r.to));
  console.log(`    (대조) 상위 5곳이 받은 부재료 — leg ${toTop.length}건 · 합 ${amtOf(toTop).toFixed(1)}`);
}

// ── ⓑ 도착 뒤 ───────────────────────────────────────────────────────────────
console.log(`\n  [ⓑ] 부재료 도착 ${ARRIV.length}회 — 도착 당일 그 마을의 cookTarget 판정 · 도착 뒤 잔존`);
{
  const g = {};
  for (const a of ARRIV) g[a.gate] = (g[a.gate] || 0) + 1;
  const tot = Math.max(1, ARRIV.length);
  console.log('  도착 당일 문턱  ' + Object.entries(g).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${pct(n / tot)}`).join(' · '));
  const f1 = ARRIV.filter((a) => a.fate.d1 != null), f7 = ARRIV.filter((a) => a.fate.d7 != null);
  const rate = (arr, k) => med(arr.map((a) => a.fate[k] / Math.max(1e-9, a.stock)));
  console.log(`  잔존(도착 재고 대비 중앙)  +1일 ${f1.length ? (100 * rate(f1, 'd1')).toFixed(0) + '%' : '—'} · +3일 ${(() => { const f3 = ARRIV.filter((a) => a.fate.d3 != null); return f3.length ? (100 * rate(f3, 'd3')).toFixed(0) + '%' : '—'; })()} · +7일 ${f7.length ? (100 * rate(f7, 'd7')).toFixed(0) + '%' : '—'}  (표본 ${f1.length}/${f7.length})`);
  const botA = ARRIV.filter((a) => BOT.has(a.to));
  if (botA.length) {
    const gb = {}; for (const a of botA) gb[a.gate] = (gb[a.gate] || 0) + 1;
    console.log(`  하위 10곳 도착 ${botA.length}회 · 문턱 ` + Object.entries(gb).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${pct(n / botA.length)}`).join(' · '));
  } else console.log('  하위 10곳 도착 **0회** — 문턱을 물을 일이 없다');
}

// ── ⓒ 안 실리는 이유 ───────────────────────────────────────────────────────
console.log('\n  [ⓒ] 어촌은 fish 를 잉여로 갖고 있나 · 그 마을은 무엇을 실어 냈나');
{
  const SUB = econV2.SUBSISTENCE_PER_NPC || {};
  // 문턱은 정본 인용(`sim/economy-sim-v2.js:645~651`): target=max(subs×30, N×0.8) · 식량류 thresh=target×1.4
  const subFish = SUB.fish || 0;
  console.log(`  정본 인용: fish 의 subs/인 = ${subFish} ⇒ target = max(${subFish}×30, N×0.8) = N×0.8 · **수출 문턱 thresh = N×1.12** (식량류 ×1.4)`);
  console.log('  마을'.padEnd(12) + '물'.padStart(6) + 'fish재고/N중앙'.padStart(16) + '문턱대비'.padStart(10) + '  leg 품목(상위 5)');
  const fishers = V.filter((x) => +x.land.water >= 1.4).sort((a, b) => b.hMed - a.hMed).slice(0, 6);
  for (const x of fishers) {
    const st = STOCK.get(x.name) || { fish: [] };
    const m = med(st.fish) || 0;
    const mine = done.filter((r) => r.from === x.name);
    const by = {}; for (const r of mine) (by[r.res] || (by[r.res] = 0), by[r.res]++);
    const top5 = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ${n}`).join(' · ');
    console.log('  ' + x.name.padEnd(10) + String(x.land.water).padStart(6) + m.toFixed(2).padStart(16) + (m / 1.12).toFixed(1).padStart(9) + '배' + '  ' + (top5 || '—'));
  }
  const fishLegs = done.filter((r) => r.res === 'fish');
  console.log(`  fish leg ${fishLegs.length}건 · 도착 유형 ` + (() => { const p = {}; for (const r of fishLegs) { const k = kindOf(r.from) + '→' + kindOf(r.to); p[k] = (p[k] || 0) + 1; } return Object.entries(p).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ${n}`).join(' · ') || '—'; })());
}

// ── 자기검사 — T204 재현 ────────────────────────────────────────────────────
{
  const F = CK.stats;
  const one = (nm) => {
    const v = world.villages.find((x) => x.name === nm); if (!v) return null;
    const N = Math.max(1, (v.npcs || []).length);
    const s = { npcs: new Array(N), storage: Object.assign({}, v.storage), _foodEaten: Object.assign({}, v._foodEaten || {}),
      _idleFrac: v._idleFrac, _tradingN: v._tradingN, _coldStress: v._coldStress, _clothCov: v._clothCov, _clothQ: v._clothQ, _lgCov: v._lgCov, _weapQ: v._weapQ };
    const base = F(s, N).happiness;
    const st2 = Object.assign({}, s.storage); delete st2.cooked_food;
    return base - F(Object.assign({}, s, { storage: st2 }), N).happiness;
  };
  const t = Array.from(TOP).map(one).filter((x) => x != null);
  console.log(`\n  자기검사  상위 5곳 cooked_food 행복 기여 ${t.length ? (t.reduce((a, b) => a + b, 0) / t.length).toFixed(3) : '—'} (T204: 0.475 / 0.495 / 0.500)`
    + ` · leg 총 ${LEGS.length}건(T231 시드 7 = 8,376)`);
}

if (process.env.T236_JSON) {
  fs.writeFileSync(process.env.T236_JSON, JSON.stringify({ seed: SEED, days: DAYS, sides: SIDES,
    eight: { pop, dead, ever, weapQ, expand, toolQ, presStock, reqOpened: S.reqOpened, daysPer },
    legs: LEGS.length, sideLegs: sideLegs.length, arriv: ARRIV, bottom: Array.from(BOT), top: Array.from(TOP),
    villages: V }, null, 1));
  console.log(`\n  [JSON] ${process.env.T236_JSON}`);
}
