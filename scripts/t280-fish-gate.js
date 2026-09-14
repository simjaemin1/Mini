#!/usr/bin/env node
// === scripts/t280-fish-gate.js — T280: 생선 관문 자리 (사본 · 정본 0 diff) ==================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
// ⚠**정본은 한 글자도 안 고친다.** 엔진 소스를 읽어 **메모리에서만** 한 자리를 갈아 끼우고
//   `require.cache` 에 그 사본을 꽂는다(`git diff` 0 · 디스크 무변).
//   치환은 **정확히 한 번**이어야 하고, 아니면 즉시 죽는다(조용한 사본 금지).
//
// 끼우는 자리 — T233 관문 바로 다음 한 줄:
//   `if (world.t280Gate && !world.t280Gate(a.v, c2.res, _q, day)) { continue; }`
//   문이 미설치면 그 줄은 항상 참이라 **`twogate` 와 비트 동일**(팔 `twogate` 로 확인한다).
//
// 관문 셋(값은 전부 **끔 팔 실측** — 새 수 0):
//   ⓐ stock  : 둘째가 그 품목 재고/N 을 **끔 팔 중앙값** 아래로 못 깎는다
//   ⓑ foodeq : **식량등가 품목**(food·fish·meat·cooked_food + FORAGE_FOOD_FACTOR 키)은 둘째로 안 싣는다
//   ⓒ origin : 한 마을·한 품목의 **둘째** 실림이 30일 이동합 상한을 못 넘는다.
//             ⚠상한은 끔 팔의 **첫째 화물** 30일 이동합 최대다 — 끔 팔에는 둘째가 **없어서**
//               둘째로는 잴 것이 없기 때문이다(첫 판이 빈 상한을 냈다). 읽기: "그 마을이
//               처방 없이도 30일에 내보내던 그 품목의 최대치 이상은 둘째로 더 못 보낸다.
//
// 실행: node scripts/t280-fish-gate.js [일수=800] [시드=1020]
//   T280_GATE=none|stock|foodeq|origin   T280_THRESH=/tmp/t280-thresh.json
//   T280_MEASURE=1  (끔 팔에서 문턱·상한을 재기만 한다 · 관문 미설치)
//   T280_JSON=/tmp/x.json   T280_LOG=/tmp/y.json (둘째 결정 로그 — 어촌 8곳)
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t280-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const Module = require('module');
const R = (p) => require(path.join(__dirname, '..', p));
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 1020;
const GATE = process.env.T280_GATE || 'none';
const MEASURE = process.env.T280_MEASURE === '1';
if (!['none', 'stock', 'foodeq', 'origin'].includes(GATE)) { console.error(`알 수 없는 관문: ${GATE}`); process.exit(2); }

// ── 사본 ────────────────────────────────────────────────────────────────────────────────
//   ⚠**여기가 이 카드의 전부다.** 정본을 읽어 한 자리만 갈고, 컴파일해서 캐시에 꽂는다.
const V2PATH = path.join(__dirname, '..', 'sim', 'economy-sim-v2.js');
{
  const src = fs.readFileSync(V2PATH, 'utf8');
  const ANCHOR = 'if (world.cargoTwoGate && !(_pu2 * _q > 0)) { if (!_picked) _gateBlocked++; continue; }';
  const n = src.split(ANCHOR).length - 1;
  if (n !== 1) { console.error(`★치환 자리가 ${n}개다(1이어야 한다) — 사본을 안 만든다`); process.exit(3); }
  const patched = src.replace(ANCHOR, ANCHOR +
    '\n            if (world.t280Gate && !world.t280Gate(a.v, c2.res, _q, day)) { continue; }');
  const m = new Module(V2PATH, null);
  m.filename = V2PATH;
  m.paths = Module._nodeModulePaths(path.dirname(V2PATH));
  m._compile(patched, V2PATH);
  require.cache[V2PATH] = m;
}

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
if (!/t280Gate/.test(econV2.tickWorldV2.toString()) && !MEASURE) {
  // tickWorldV2 안쪽 함수라 toString 에 안 보일 수 있다 — 사본이 꽂혔는지는 아래 연기 검사로 본다.
}
const VillageLayout = R('server/village-layout');
const Villages = R('server/villages');
const LV = R('server/livelihood');
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
if (!seeds) { console.error('시드 캐시가 없다'); process.exit(4); }

const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
R('server/trees').attachToWorld(world);
//   끔 팔(`MEASURE`)이 아니면 `twogate` 위에 얹는다 — 카드 ② 가 시킨 자리.
if (!MEASURE) { world.cargoTwo = true; world.cargoTwoGate = true; }
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.villages.forEach((v, i) => { v._t280i = i; });
world.day = 0;

//   식량등가 품목 — **정본 목록을 그대로 읽는다**(사본 0).
const FOODEQ = new Set(['food', 'fish', 'meat', 'cooked_food', ...Object.keys(econ.FORAGE_FOOD_FACTOR || {})]);
const WATCH8 = new Set(['농촌3', '어촌5', '어촌6', '광산5', '어촌12', '임업6', '어촌11', '어촌9']);
const SAMPLE = ['fish', 'salmon', 'food', 'meat', 'herb', 'hide', 'stone', 'wood', 'hemp', 'wheat', 'rice', 'shrimp', 'crab', 'oyster', 'seaweed', 'bone', 'fur', 'resin'];

const rows = world.villages.map((v, i) => ({
  i, name: v.name, pop0: v.npcs.length, popEnd: 0,
  second: {}, secondUnits: 0, legs: 0, blocked: 0,
  fishStock: 0, fishEnd: 0,
}));
const samples = MEASURE ? world.villages.map(() => ({})) : null;   // {품목: [재고/N 표본]}
const originMax = MEASURE ? world.villages.map(() => ({})) : null; // {품목: 30일 이동합 최대}
const roll = world.villages.map(() => ({}));                       // {품목: [{d, n}]}

// ── 관문 ────────────────────────────────────────────────────────────────────────────────
let TH = null;
if (!MEASURE && (GATE === 'stock' || GATE === 'origin')) {
  const p = process.env.T280_THRESH || '/tmp/t280-thresh.json';
  if (!fs.existsSync(p)) { console.error(`문턱 파일이 없다: ${p} — 먼저 T280_MEASURE=1 로 재라`); process.exit(5); }
  TH = JSON.parse(fs.readFileSync(p, 'utf8'));
}
const rollSum = (i, res, day) => {
  const a = roll[i][res]; if (!a) return 0;
  while (a.length && a[0].d < day - 30) a.shift();
  return a.reduce((s, x) => s + x.n, 0);
};
if (!MEASURE && GATE !== 'none') {
  world.t280Gate = (v, res, q, day) => {
    const i = v._t280i, r = rows[i];
    let pass = true;
    if (GATE === 'foodeq') {
      //   ⓑ 식량등가 품목은 둘째로 안 싣는다(정본 목록 그대로)
      pass = !FOODEQ.has(res);
    } else if (GATE === 'stock') {
      //   ⓐ 둘째가 재고/N 을 끔 팔 중앙값 아래로 못 깎는다
      const N = Math.max(1, v.npcs.length);
      const th = ((TH.stock[v.name] || {})[res]);
      if (th != null) pass = (((v.storage[res] || 0) - q) / N) >= th;
    } else if (GATE === 'origin') {
      //   ⓒ 한 마을·한 품목 30일 이동합 상한(끔 팔 실측 최대)
      const cap = ((TH.origin[v.name] || {})[res]);
      if (cap != null) pass = (rollSum(i, res, day) + q) <= cap;
    }
    if (!pass && r) r.blocked++;
    return pass;
  };
}

const log = [];
const roll1 = world.villages.map(() => ({}))   // 첫째 화물 30일 이동창(끔 팔 상한 측정용)
world.onTradeLeg = (o) => {
  const r = rows[o.vid]; if (!r) return;
  r.legs++;
  if (MEASURE) {
    //   ★ⓒ 상한 — 끔 팔의 **첫째 화물** 30일 이동합 최대. 끔에는 둘째가 없으므로 여기서 잰다.
    const a1 = roll1[o.vid][o.res] || (roll1[o.vid][o.res] = []);
    a1.push({ d: o.day, n: o.units });
    while (a1.length && a1[0].d < o.day - 30) a1.shift();
    const s1 = a1.reduce((x, y) => x + y.n, 0);
    if (s1 > (originMax[o.vid][o.res] || 0)) originMax[o.vid][o.res] = s1;
  }
  if (o.second && o.secondUnits > 0) {
    r.secondUnits += o.secondUnits;
    r.second[o.second] = (r.second[o.second] || 0) + o.secondUnits;
    const a = roll[o.vid][o.second] || (roll[o.vid][o.second] = []);
    a.push({ d: o.day, n: o.secondUnits });
    //   ① 결정 로그 — 어촌 8곳만(파일이 커지지 않게)
    if (process.env.T280_LOG && WATCH8.has(r.name)) {
      const v = world.villages[o.vid], N = Math.max(1, v.npcs.length);
      log.push({ d: o.day, v: r.name, res: o.second, n: +o.secondUnits.toFixed(1),
        pu: +(o.p2ProfitPerUnit || 0).toFixed(4),
        stockPerN: +(((v.storage[o.second] || 0)) / N).toFixed(3),
        fishPerN: +((v.storage.fish || 0) / N).toFixed(3), N });
    }
  }
};

for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world, d);
  if (MEASURE && d % 10 === 0) {
    for (let i = 0; i < world.villages.length; i++) {
      const v = world.villages[i], N = Math.max(1, v.npcs.length), sm = samples[i];
      for (const res of SAMPLE) (sm[res] || (sm[res] = [])).push((v.storage[res] || 0) / N);
    }
  }
}
for (let i = 0; i < world.villages.length; i++) {
  rows[i].popEnd = world.villages[i].npcs.length;
  rows[i].fishEnd = +(world.villages[i].storage.fish || 0).toFixed(1);
}
const totalPop = rows.reduce((a, r) => a + r.popEnd, 0);
const LAB = { none: 'twogate(관문 없음)', stock: 'ⓐ 재고 문턱', foodeq: 'ⓑ 식량등가 제외', origin: 'ⓒ 원산지 상한' }[GATE];
console.log(`\n=== T280 [${MEASURE ? '끔(측정)' : LAB}] — 시드 ${SEED} · ${DAYS}일 · 마을 ${rows.length} ===`);
console.log(`  인구 합 **${totalPop}** · leg ${rows.reduce((a, r) => a + r.legs, 0)} · 둘째 ${rows.reduce((a, r) => a + r.secondUnits, 0).toFixed(0)} 단위 · 관문에 걸림 ${rows.reduce((a, r) => a + r.blocked, 0)}`);

if (MEASURE) {
  const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
  const out = { stock: {}, origin: {} };
  for (let i = 0; i < world.villages.length; i++) {
    const n = rows[i].name;
    out.stock[n] = {}; out.origin[n] = {};
    for (const res of SAMPLE) out.stock[n][res] = +med(samples[i][res] || []).toFixed(4);
    for (const res in originMax[i]) out.origin[n][res] = +originMax[i][res].toFixed(1);
  }
  const p = process.env.T280_THRESH_OUT || '/tmp/t280-thresh-' + SEED + '.json';
  fs.writeFileSync(p, JSON.stringify(out));
  console.log(`  문턱/상한: ${p}`);
}
if (process.env.T280_LOG) { fs.writeFileSync(process.env.T280_LOG, JSON.stringify(log)); console.log(`  결정 로그: ${process.env.T280_LOG} (${log.length}건)`); }
if (process.env.T280_JSON) {
  fs.writeFileSync(process.env.T280_JSON, JSON.stringify({ seed: SEED, gate: GATE, measure: MEASURE, totalPop, rows }));
  console.log(`  JSON: ${process.env.T280_JSON}`);
}
