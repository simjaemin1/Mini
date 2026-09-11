#!/usr/bin/env node
// === scripts/stone-trade-diag.js — T173 §0 진단: 바닥 마을의 돌은 왜 안 들어오나 ==========
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
//
// T152 (B) 가 올린 처방 ①("교역으로 석재가 들어오게 · 캐러밴 의뢰 우선") 앞의 진단이다.
// T152 가 적은 위험이 그대로 물음이다: *"살 것이 있어야 산다 — 바닥 마을은 갚을 잉여도 얇다"*.
//
//   ⓐ 게시판 — 바닥 36마을이 **석재 의뢰를 거나**(게시/축소/철회 · T142 의 `onRequest` 훅 그대로 · 정본 재구현 0)
//   ⓑ 캐러밴 — 바닥 마을에 돌이 **실제로 들어오나**(수입량) · 파는 마을은 있나(돌 잉여) ·
//              바닥 마을은 **무엇으로 갚나**(수출 가능 잉여 — 출발 leg 의 `candidates` 문턱 그대로)
//
// 실행: node scripts/stone-trade-diag.js [일수=800] [시드=1020]
//   T173_JSON=/tmp/x.json
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t173-diag-${process.pid}.db`;

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

const _SEEDCACHE = process.env.LAB_SEEDCACHE || '/tmp/t163-seeds.json';
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
  if (_SEEDCACHE) { try { fs.writeFileSync(_SEEDCACHE, JSON.stringify(seeds)); } catch (e) {} }
}

const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
require('../server/trees').attachToWorld(world);
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;

// ── 장부 — T142 의 `onRequest` 훅 그대로(새 창구 0 · 장부는 관측자) ──────────────────
const REQLOG = [];            // {vid,item,day,qty,rewItem,rewQty,fit,kind}
//   ★납품 가능 품목표는 **정본에서 받는다**(`t17-metrics`·`ev-density` 와 같은 자) — 없으면 의뢰가 0 건이 된다
//     ("낼 수 없는 의뢰는 의뢰가 아니라 벽이다" · events.js). 이 한 줄이 빠져 첫 판이 전부 0 을 냈다.
const depositMap = Villages.playerVillageDepositMap();
const ledger = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap,
  onRequest: (req, kind) => { if (!req || req.vid == null) return;
    REQLOG.push({ vid: req.vid | 0, item: req.item, day: req.day | 0, qty: req.qty,
                  rewItem: req.rewItem, rewQty: req.rewQty, fit: req.fit || 'full', kind }); } });
ledger.prime(world);

const FL = LV.FLOOR.stone;
const isFloor = (v) => Math.abs((v.land.stone || 0) - FL) < 1e-9;

// ── 캐러밴 흐름 — 세계가 이미 쥔 기록만 읽는다(훅 0 · 행동 무관) ────────────────────
//   출발: `tradeStats.exportBy`(자원별 수출량 — 엔진이 이미 센다)
//   귀환: 캐러밴의 `_returningRes`/`returnRes` 를 하루마다 훑어 도착분을 센다
const imp = seeds.map(() => ({}));     // vid → {item: qty}
const seenReturn = new Set();
// 바닥 마을의 `돌<0.2` 일수 · 수출 가능 잉여 품목(출발 leg 문턱 그대로 물어본다)
const rows = world.villages.map((v, i) => ({ vid: i, name: v.name, floor: isFloor(v), stone0: 0, days: 0,
  toolLow: 0, expCand: {}, stoneImp: 0, stoneExp: 0 }));

const SUBS = econV2.__t173 && econV2.__t173.SUBSISTENCE_PER_NPC;   // 없으면 아래 근사 안 쓴다

for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world, d);
  // 귀환 화물 도착분 — `_returningRes` 가 붙은 캐러밴이 집에 닿는 날
  for (const c of (world.caravans || [])) {
    if (!c._returningRes) continue;
    if (c.returnArriveDay !== d) continue;
    const k = c.id + '|' + d;
    if (seenReturn.has(k)) continue;
    seenReturn.add(k);
    const vi = world.villages.indexOf(c.from);
    if (vi < 0) continue;
    const q = +c._returningAmt || 0;
    imp[vi][c._returningRes] = (imp[vi][c._returningRes] || 0) + q;
  }
  for (let i = 0; i < world.villages.length; i++) {
    const v = world.villages[i], r = rows[i];
    if (!v.npcs || !v.npcs.length) continue;
    r.days++;
    if ((v.storage.stone || 0) < 0.2) r.stone0++;
    if ((v.storage.tool || 0) < 0.05) r.toolLow++;
  }
  ledger.scanDay(world, d);
}

// 수출 — 엔진이 이미 센 자원별 수출량
for (let i = 0; i < world.villages.length; i++) {
  const v = world.villages[i], r = rows[i];
  const eb = (v.tradeStats && v.tradeStats.exportBy) || {};
  for (const k in eb) r.expCand[k] = eb[k];
  r.stoneExp = eb.stone || 0;
  r.stoneImp = imp[i].stone || 0;
}

const fl = rows.filter((r) => r.floor), rest = rows.filter((r) => !r.floor);
const med = (a) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const sum = (a) => a.reduce((x, y) => x + y, 0);

console.log(`\n=== T173 §0 진단 — 시드 ${SEED} · ${DAYS}일 · 마을 ${rows.length} (바닥 ${fl.length} · 그 밖 ${rest.length}) ===`);

// ⓐ 게시판 ────────────────────────────────────────────────────────────────────
const openS = REQLOG.filter((x) => x.kind === 'open');
const closeS = REQLOG.filter((x) => x.kind === 'close');
const stOpen = openS.filter((x) => x.item === 'stone');
const flSet = new Set(fl.map((r) => r.vid));
const stOpenFl = stOpen.filter((x) => flSet.has(x.vid));
const st = ledger.stats || {};
console.log(`\nⓐ 게시판 — 바닥 마을이 석재 의뢰를 거나`);
console.log(`  전체 게시 ${st.reqOpened} · 철회 ${st.reqClosed} · 축소 ${st.reqShrunk} · 못갚아미게시 ${st.reqNoPay} · 재검증철회 ${st.reqRevalidated} · 채움 ${st.reqFilled}`);
console.log(`  그 중 **석재** 게시 ${stOpen.length}건 (바닥 마을 몫 **${stOpenFl.length}건** · 그 밖 ${stOpen.length - stOpenFl.length}건)`);
{
  const byItem = {};
  for (const x of openS) byItem[x.item] = (byItem[x.item] || 0) + 1;
  const top = Object.entries(byItem).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`  게시 품목 상위 — ${top.map(([k, n]) => `${k} ${n}`).join(' · ')}`);
  const shr = stOpen.filter((x) => x.fit === 'shrunk').length;
  console.log(`  석재 의뢰 중 축소본 ${shr}건 (${stOpen.length ? (shr / stOpen.length * 100).toFixed(1) : 0}%)`);
  const rew = {};
  for (const x of stOpen) rew[x.rewItem] = (rew[x.rewItem] || 0) + 1;
  const rt = Object.entries(rew).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`  **대금**(석재 의뢰가 내건 잉여) — ${rt.map(([k, n]) => `${k} ${n}`).join(' · ') || '—'}`);
  console.log(`  ⚠채움 ${st.reqFilled} — 이 랩에는 **플레이어가 없다**(납품 claim 을 부르는 자가 없다). 게시판은 NPC 채널이 아니다.`);
}

// ⓑ 캐러밴 ────────────────────────────────────────────────────────────────────
console.log(`\nⓑ 캐러밴 — 돌이 실제로 들어오나`);
console.log(`  구간 | 마을 | 돌 수입(중앙/합) | 돌 수출(중앙/합) | 돌<0.2 일수(중앙) | 도구≈0(중앙)`);
for (const [lab, g] of [['**바닥**', fl], ['그 밖', rest]]) {
  console.log(`  ${lab.padEnd(8)} | ${String(g.length).padStart(3)} | ${med(g.map((r) => r.stoneImp)).toFixed(1)} / ${sum(g.map((r) => r.stoneImp)).toFixed(0)}`
    + ` | ${med(g.map((r) => r.stoneExp)).toFixed(1)} / ${sum(g.map((r) => r.stoneExp)).toFixed(0)}`
    + ` | ${med(g.map((r) => r.stone0))} | ${med(g.map((r) => r.toolLow))}`);
}
{
  const sellers = rest.filter((r) => r.stoneExp > 0);
  console.log(`  파는 마을(돌 수출 > 0): **${sellers.length}곳** / 그 밖 ${rest.length}곳 — ${sellers.slice(0, 8).map((r) => `${r.name} ${r.stoneExp.toFixed(0)}`).join(' · ')}`);
  const buyers = fl.filter((r) => r.stoneImp > 0);
  console.log(`  돌이 한 번이라도 들어온 바닥 마을: **${buyers.length}곳** / ${fl.length}곳`);
  // 바닥 마을은 무엇으로 갚나 — 실제 수출량 상위
  const agg = {};
  for (const r of fl) for (const k in r.expCand) agg[k] = (agg[k] || 0) + r.expCand[k];
  const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`  **바닥 마을이 실제로 판 것**(대금 자리) — ${top.map(([k, n]) => `${k} ${n.toFixed(0)}`).join(' · ') || '없다'}`);
  const tot = Object.values(agg).reduce((a, b) => a + b, 0);
  const agg2 = {};
  for (const r of rest) for (const k in r.expCand) agg2[k] = (agg2[k] || 0) + r.expCand[k];
  console.log(`  수출 총량 — 바닥 ${tot.toFixed(0)} · 그 밖 ${Object.values(agg2).reduce((a, b) => a + b, 0).toFixed(0)}`);
}

if (process.env.T173_JSON) {
  fs.writeFileSync(process.env.T173_JSON, JSON.stringify({ seed: SEED, days: DAYS, stats: st, rows,
    stoneOpen: stOpen.length, stoneOpenFloor: stOpenFl.length }, null, 1));
  console.log(`\n  JSON: ${process.env.T173_JSON}`);
}
