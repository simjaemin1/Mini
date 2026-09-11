#!/usr/bin/env node
// === scripts/t165-ab.js — T165 서버 A/B: 행복 → 작업량 이식 (실지도 51마을) ===
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T165 §2-②③]
//   T157 은 **랩 8마을**에서 답했다("폭주 없음 · 격차 확대"). 판정은 **서버 3시드**(족보 141)다.
//   그래서 세계를 `t17-metrics.js` 와 **같은 길**로 세운다 — 실지도 51마을 · 같은 땅 파라미터 ·
//   같은 나무 층 주입 · 같은 사건 장부. 다른 것은 **손잡이 하나**뿐이다.
//
// ★이 파일에 산수는 **비율과 분위수**뿐이다. 계수·상한은 전부 엔진 정본이 갖는다(사본 0).
//
// 실행:
//   1) 한 판   : LAB_SEEDCACHE=/tmp/s.json T165_JSON=/tmp/ab/on_1020.json T157_HAPPYWORK=1 \
//                  node scripts/t165-ab.js 800 1020
//   2) 표      : node scripts/t165-ab.js --table /tmp/ab [--seeds 1020,7,42]
'use strict';
const path = require('path');
const fs = require('fs');

// ── 표 모드 — 측정 JSON 만 읽는다(세계를 안 세운다) ────────────────────────
if (process.argv.indexOf('--table') >= 0) {
  const DIR = process.argv[process.argv.indexOf('--table') + 1] || '/tmp/t165';
  const si = process.argv.indexOf('--seeds');
  const SEEDS = si >= 0 && process.argv[si + 1] ? process.argv[si + 1].split(',').map(Number) : [1020, 7, 42];
  const load = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
  const nf = (x) => (x == null ? '—' : Number(x).toLocaleString());
  const pct = (a, b) => (b > 0 ? ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%' : '—');
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };

  const got = [];
  for (const s of SEEDS) {
    const off = load(path.join(DIR, `off_${s}.json`)), on = load(path.join(DIR, `on_${s}.json`));
    if (!off || !on) { console.log(`  ⚠시드 ${s} — 자료 없다(off ${!!off} · on ${!!on})`); continue; }
    got.push({ s, off, on });
  }
  if (!got.length) { console.log('\n측정 JSON 이 없다 — 위 실행 절차를 먼저 돌려라.\n'); process.exit(1); }

  console.log(`\n=== T165 서버 A/B — 행복 → 작업량 이식 (실지도 51마을 · ${got[0].on.days}일) ===`);
  console.log(`  베이스 ${got[0].on.base || '?'} · 정본 H ${got[0].on.H} · 손잡이 T157_HAPPYWORK(기본 끔)`);

  // ⓐ 여덟 수 — `t17-metrics ⓚ` 문법 그대로
  console.log('\nⓐ 여덟 수 (T152 ⓚ 문법 · OFF = 이 베이스에서 내가 뜬 기준선)');
  const C = [['pop', '인구'], ['dead', '소멸'], ['weapQ', '무기Q'], ['expand', '확장셀'],
    ['reqOpened', '게시'], ['toolQ', '도구Q'], ['preserved', '보존식'], ['rawGrain', '생곡']];
  console.log('  시드  팔    ' + C.map(([, k]) => k.padStart(11)).join(''));
  for (const g of got) {
    const row = (t, o) => '  ' + String(g.s).padEnd(6) + t.padEnd(6)
      + C.map(([k]) => (k === 'dead' ? `${o.dead}/${o.ever}` : nf(typeof o[k] === 'number' ? Math.round(o[k]) : o[k])).padStart(11)).join('');
    console.log(row('OFF', g.off)); console.log(row('ON', g.on));
    console.log('  ' + ''.padEnd(6) + 'Δ'.padEnd(6)
      + C.map(([k]) => (k === 'dead' ? `${g.on.dead - g.off.dead}` : pct(g.on[k], g.off[k])).padStart(11)).join(''));
  }

  // ⓑ 격차 — 마을별 Δ산출 분포
  console.log('\nⓑ 마을별 Δ(곳간 식량등가) 분포 — 랩에서 본 −28~−37% 가 서버에서도 나오나');
  console.log('  시드    Δ최저    Δ하위25%    Δ중앙    Δ상위25%     Δ최고   | 내린 마을 / 잰 마을');
  for (const g of got) {
    const m = new Map(g.off.per.map((p) => [p.name, p]));
    const d = g.on.per.filter((p) => m.has(p.name) && m.get(p.name).foodEq > 0 && p.N > 0)
      .map((p) => (p.foodEq / m.get(p.name).foodEq - 1) * 100);
    const f = (x) => (x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(1) + '%');
    console.log('  ' + String(g.s).padEnd(7)
      + [q(d, 0), q(d, 0.25), q(d, 0.5), q(d, 0.75), q(d, 0.999)].map((x) => f(x).padStart(10)).join('')
      + '   | ' + d.filter((x) => x < 0).length + ' / ' + d.length);
  }

  // ⓑ' 행복 분포 · 상한
  console.log("\nⓑ' 행복 분포와 상한 — 배수가 실제로 얼마나 걸렸나(ON)");
  console.log('  시드   행복 최저   중앙   최고 | 배수 최저   중앙   최고 | 상한 걸린 마을·일 / 전체   1 미만 마을');
  for (const g of got) {
    const hs = g.on.per.filter((p) => p.N > 0 && p.happy != null).map((p) => p.happy);
    const ms = g.on.per.filter((p) => p.N > 0 && p.hwm != null).map((p) => p.hwm);
    const live = g.on.per.filter((p) => p.N > 0).length;
    console.log('  ' + String(g.s).padEnd(7)
      + [q(hs, 0), q(hs, 0.5), q(hs, 0.999)].map((x) => (x == null ? '—' : x.toFixed(2)).padStart(8)).join('') + '  |'
      + [q(ms, 0), q(ms, 0.5), q(ms, 0.999)].map((x) => (x == null ? '—' : x.toFixed(3)).padStart(9)).join('') + '  |'
      + `${nf(g.on.clampDays)} / ${nf(live * g.on.days)}`.padStart(22)
      + String(ms.filter((x) => x < 1).length).padStart(13));
  }

  // ⓒ 격차 마을 표 — 하위 10곳 · land.* · 석재 바닥
  console.log('\nⓒ 내린 마을 하위 10곳 (시드 1020 · ON) — 어떤 땅인가 · 석재 바닥과 겹치나');
  {
    const g = got[0], m = new Map(g.off.per.map((p) => [p.name, p]));
    const rows = g.on.per.filter((p) => m.has(p.name) && m.get(p.name).foodEq > 0 && p.N > 0)
      .map((p) => ({ ...p, d: (p.foodEq / m.get(p.name).foodEq - 1) * 100, offN: m.get(p.name).N }))
      .sort((a, b) => a.d - b.d).slice(0, 10);
    console.log('  마을         Δ산출    행복   배수   인구(OFF→ON)   지력   물   숲   돌   사냥  석재바닥');
    for (const r of rows) {
      console.log('  ' + String(r.name).padEnd(12) + ((r.d >= 0 ? '+' : '') + r.d.toFixed(1) + '%').padStart(8)
        + String(r.happy).padStart(8) + String(r.hwm).padStart(7)
        + `${r.offN}→${r.N}`.padStart(14)
        + String(r.fert).padStart(7) + String(r.water).padStart(6) + String(r.wood).padStart(5)
        + String(r.stone).padStart(6) + String(r.game).padStart(6)
        + (r.stoneFloor ? '  ★예' : '   아니오').padStart(9));
    }
    const fl = rows.filter((r) => r.stoneFloor).length;
    console.log(`  ⇒ 하위 10곳 중 **석재 바닥 ${fl}곳** (전체 석재 바닥 ${g.on.stoneFloorN}/${g.on.ever}곳 — T152 ⓛ 와 같은 술어)`);
  }
  console.log('');
  process.exit(0);
}

// ── 측정 모드 — `t17-metrics.js` 와 같은 길로 세계를 세운다 ────────────────
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t165-${process.pid}.db`;
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
    seeds.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy, lp: P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout) });
  }
  if (_SEEDCACHE) { try { fs.mkdirSync(path.dirname(_SEEDCACHE), { recursive: true }); fs.writeFileSync(_SEEDCACHE, JSON.stringify(seeds)); } catch (e) {} }
}

const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
R('server/trees').attachToWorld(world);          // ★T135 나무 층 — `t17-metrics` 와 같은 문(족보 130)
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;

const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: Villages.playerVillageDepositMap() });
L.prime(world);
const _log = console.log; console.log = () => {};
for (let d = 0; d < DAYS; d++) { econV2.tickWorldV2(world); L.scanDay(world, world.day, {}); }
console.log = _log;

// ── 읽는 자리는 `t17-metrics ⓐⓓⓔⓚⓛ` 와 같다 ──────────────────────────────
const SPEC = R('server/specialty');
const stockOf = (r) => world.villages.reduce((a, v) => a + (v.storage[r] || 0), 0);
const PRESERVED = ['dried_fish', 'dried_fruit', 'smoked_meat', 'pickled_veg'];
const STONE_FLOOR = 0.25;      // ★T152 ⓛ 와 같은 술어(`land.stone == FLOOR`) — 값은 그 보고의 수
let pop = 0, dead = 0, ever = 0, weapQ = 0, expand = 0, toolQ = 0, clampDays = 0, stoneFloorN = 0;
const per = [];
for (const v of world.villages) {
  const n = (v.npcs || []).length; pop += n;
  if (v._everPop) ever++;
  if (v._everPop && n <= 0) dead++;
  weapQ += (v.storage.weapon || 0) * (v._weapQ != null ? v._weapQ : 1);
  expand += v.expansions || 0;
  toolQ += (v.storage.tool || 0) * (v._toolQ != null ? v._toolQ : 1);
  clampDays += v._hwClampDays || 0;
  const sf = Math.abs((v.land.stone || 0) - STONE_FLOOR) < 1e-9;
  if (sf) stoneFloorN++;
  per.push({ name: v.name, N: n,
    happy: v.lastStats ? +v.lastStats.happiness.toFixed(3) : null,
    health: v.lastStats ? +v.lastStats.health.toFixed(3) : null,
    hwm: v._hwmLast != null ? +v._hwmLast.toFixed(4) : null,
    clampDays: v._hwClampDays || 0,
    fert: +(v.land.fertility || 0).toFixed(2), water: +(v.land.water || 0).toFixed(2),
    wood: +(v.land.wood || 0).toFixed(2), stone: +(v.land.stone || 0).toFixed(2),
    game: +(v.land.game || 0).toFixed(2), stoneFloor: sf,
    foodEq: +econ.totalFoodEquivalent(v).toFixed(1) });
}
const RAW = (SPEC && SPEC.RAW_GRAINS) || ['wheat', 'rice', 'barley', 'millet', 'sorghum', 'buckwheat', 'oat', 'rye', 'corn'];
const out = {
  days: DAYS, seed: SEED, arm: econ.happyWorkWOf({}) > 0 ? 'on' : 'off',
  H: econ.T157_HAPPYWORK_H, knob: econ.T157_HAPPYWORK, base: process.env.T165_BASE || '',
  pop, dead, ever, weapQ: +weapQ.toFixed(1), expand, toolQ: +toolQ.toFixed(1),
  preserved: +PRESERVED.reduce((a, r) => a + stockOf(r), 0).toFixed(1),
  rawGrain: +RAW.reduce((a, r) => a + stockOf(r), 0).toFixed(1),
  reqOpened: (L.stats || {}).reqOpened || 0, emitted: (L.stats || {}).emitted || 0,
  trades: (world.tradeLog || []).length, clampDays, stoneFloorN, per,
};
console.log(`\n[T165] 시드 ${SEED} · ${DAYS}일 · 팔 ${out.arm.toUpperCase()} (손잡이 ${out.knob ? '켬' : '끔'} · 정본 H ${out.H})`);
console.log(`  인구 ${pop.toLocaleString()} · 소멸 ${dead}/${ever} · 무기Q ${Math.round(weapQ)} · 확장셀 ${expand.toLocaleString()} · 게시 ${out.reqOpened.toLocaleString()} · 도구Q ${Math.round(toolQ)} · 보존식 ${Math.round(out.preserved)} · 생곡 ${Math.round(out.rawGrain).toLocaleString()}`);
console.log(`  상한 걸린 마을·일 ${clampDays.toLocaleString()} · 석재 바닥 ${stoneFloorN}/${ever}곳`);
if (process.env.T165_JSON) {
  try { fs.mkdirSync(path.dirname(process.env.T165_JSON), { recursive: true }); fs.writeFileSync(process.env.T165_JSON, JSON.stringify(out, null, 1));
    console.log(`  [json] ${process.env.T165_JSON}`); } catch (e) { console.log('  [json] 실패: ' + e.message); }
}
