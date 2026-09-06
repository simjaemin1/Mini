#!/usr/bin/env node
// scripts/_t138-cleared.js — T138 ⓒ 개간 뒤 모양(헤드리스) · 계측기 · 러너 밖
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t138-cl-${process.pid}.db`;
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..'), R = (p) => require(path.join(ROOT, p));
const DAYS = parseInt(process.argv[2], 10) || 800, SEED = parseInt(process.argv[3], 10) || 1020;
const OUT = process.argv[4] || '/tmp/t138/cleared.json';
const WANT = ['광산3', '농촌20', '임업4', '농촌1', '농촌7', '어촌3'];
const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim'), econV2 = R('sim/economy-sim-v2');
const Villages = R('server/villages'), P = Villages.__labProbe, CL = P._clearProbe;
const Z = 'hanbando', ZONE = ZONES[Z], SZ = P.SZ; P.setZoneId(Z);
const seeds = JSON.parse(fs.readFileSync(process.env.LAB_SEEDCACHE || '/tmp/farm-seeds.json', 'utf8'));
const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
for (const s of seeds) { const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 }; world.villages.push(ev); }
world.day = 0;
// 지형 어댑터 — `t100-fieldbase.js` 와 **같은 순서·같은 정본 함수**(밭 창발이 서려면 `state.ta` 가 있어야 한다)
const _in = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isW = (x, y) => { if (ZONE.isOcean) return true; if (!_in(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
const isR = (x, y) => { if (!_in(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal: (x, y) => (!_in(x, y)) ? true : (isR(x, y) || isW(x, y)), isWaterTileLocal: isW });
CL.setup(ta, world, { insertVillageBuilding: () => 0 });
const vils = seeds.map((s, i) => CL.attach({ dbId: i + 1, name: s.name, ccx: s.ccx, ccy: s.ccy, econ: world.villages[i], layout: s.layout }));
const seed0 = {}; for (const v of vils) if (WANT.indexOf(v.name) >= 0) seed0[v.name] = [...v._farmSet];
const _l = console.log; console.log = () => {};
for (let d = 0; d < DAYS; d++) { econV2.tickWorldV2(world); CL.tickDay(vils); }
console.log = _l;
const out = { days: DAYS, seed: SEED, vills: {} };
for (const v of vils) { if (WANT.indexOf(v.name) < 0) continue;
  out.vills[v.name] = { ccx: v.ccx, ccy: v.ccy, N: (v.econ.npcs || []).length,
    fert: +(v.econ.land.fertility || 0).toFixed(2),
    seed: seed0[v.name], now: [...v._farmSet], dry: [...v._drySet],
    terr: [...v._terrSet] }; }
fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out));
for (const n of WANT) { const o = out.vills[n]; if (o) console.log(`  ${n.padEnd(6)} fert ${o.fert} N ${String(o.N).padStart(3)} · 밭 ${o.seed.length} → ${o.now.length}칸`); }
console.log(`  → ${OUT}`);
