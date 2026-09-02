#!/usr/bin/env node
// === scripts/winter-metrics.js — 겨울나기 대리 지표 [T20] =======================
//   ※`@regress` 표 없음 — 이건 **계측기**지 하네스가 아니다(수가 세계를 따라 움직인다).
//     통과/실패가 아니라 **분포**를 낸다. 회귀 가드는 `test-winter` 가 건다.
//
// ★왜: T20 이 세계에 새로 심는 수는 딱 하나 — **목표량 N**(= 인구 × 1인 하루치 × D).
//   그 수가 사람 손에 닿는 크기인지(= 몇 번 짊어지면 되는지)는 **판정이 아니라 실측**이다.
//   지시서 대리 지표 셋: ⓐ 51마을 목표량 분포(D=5) · ⓑ 품목 분포 · ⓒ 예상 사건 건수.
//
// ⚠세계 조립은 `ev-density.js` 와 **같은 정본 함수**를 같은 순서로 부른다(사본 아님).
// 실행: node scripts/winter-metrics.js [일수=0] [시드=1020]
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/winter-metrics-${process.pid}.db`;

const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));
const DAYS = parseInt(process.argv[2], 10) || 0;
const SEED = parseInt(process.argv[3], 10) || 1020;

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const VillageLayout = R('server/village-layout');
const Villages = R('server/villages');
const Events = R('server/events');
const Winter = R('server/winter');
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
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;

const depositMap = Villages.playerVillageDepositMap();
const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap });
L.prime(world);
// ★장부만 붙이고 **겨울은 안 붙인다** — 랩엔 플레이어가 없어서 참여 0 이고(ⓔ③)
//   참여 0 인 해엔 사건 자체가 없다. 여기서 재는 건 사건이 아니라 **목표량**이다.
Winter.init({ db: null, zoneId: Z, ledger: () => L, gameDay: () => world.day, econV2 });

const _log = console.log; console.log = () => {};
for (let d = 0; d < DAYS; d++) { econV2.tickWorldV2(world); L.scanDay(world, world.day, {}); }
console.log = _log;

const live = world.villages.filter((v) => (v.npcs || []).length > 0);
console.log(`\n실지도 ${world.villages.length}곳(사람있는 곳 ${live.length}) · 시드 ${SEED} · ${DAYS}일 굴림 · WINTER_D=${Winter.CFG.D}`);

// ── ⓐ 목표량 분포 ─────────────────────────────────────────────────────────────
const pk = Winter.pickRes();
console.log(`\nⓑ 품목 — 곳간이 받는 재화 ∩ econ 생계 소비 중 최대: **${pk ? pk.res : '없음'}** (1인 하루 ${pk ? pk.perHead : 0})`);
{
  const S = (() => { try { return econV2.SUBSISTENCE_PER_NPC || {}; } catch (e) { return {}; } })();
  const cands = [...(L.deliverable && L.deliverable.toEcon ? L.deliverable.toEcon.keys() : [])].filter((r) => (+S[r] || 0) > 0);
  console.log(`   후보(곳간이 받고 사람이 먹는 것): ${cands.map((r) => `${r} ${S[r]}`).join(' · ') || '없음'}`);
  console.log(`   ★품목이 마을마다 다르지 않다 — 지금 판에선 한 품목이 전 마을 공통이다(회부: 어촌은 물고기로?)`);
}

console.log(`\nⓐ 목표량 N 분포 — N = round(인구 × 1인 하루치 × D)`);
for (const D of [1, 3, 5, 10]) {
  const NS = [];
  for (const v of live) { const t = Winter.targetOf({ econ: v }, D); if (t) NS.push({ n: t.target, pop: t.pop, name: v.name }); }
  NS.sort((a, b) => a.n - b.n);
  const q = (f) => NS.length ? NS[Math.min(NS.length - 1, Math.floor(NS.length * f))].n : 0;
  const sum = NS.reduce((a, b) => a + b.n, 0);
  const tag = D === Winter.CFG.D ? ' ★기본' : '';
  console.log(`  D=${String(D).padStart(2)}  N 최소 ${String(NS[0] ? NS[0].n : 0).padStart(5)} · 하위25% ${String(q(0.25)).padStart(5)} · 중앙 ${String(q(0.5)).padStart(5)} · 상위25% ${String(q(0.75)).padStart(5)} · 최대 ${String(NS[NS.length - 1] ? NS[NS.length - 1].n : 0).padStart(5)} · 평균 ${(sum / Math.max(1, NS.length)).toFixed(0)}${tag}`);
}
// ── ⓒ 예상 건수 ───────────────────────────────────────────────────────────────
{
  const yd = Events.calendarOf(0).yearDays;
  const years = DAYS / yd;
  console.log(`\nⓒ 예상 사건 건수 — 한 해에 마을당 **최대 1건**(달성이면 KEPT · 미달이되 1단위라도 냈으면 SHORT · 참여 0 이면 없음)`);
  console.log(`   한 해 ${yd}일 · ${DAYS}일 = ${years.toFixed(2)}해 ⇒ 상한 ${Math.floor(years) * live.length}건(전 마을이 매해 참여할 때)`);
  console.log(`   ★랩 실측은 **0건** — 헤드리스엔 플레이어가 없다(참여 0). 사건은 사람이 손을 댈 때만 생긴다.`);
  const S = L.stats;
  console.log(`   대조: 같은 ${DAYS}일 값·일 사건 총 ${S.emitted}건 ⇒ 겨울 사건은 상한을 다 채워도 ${(Math.floor(years) * live.length / Math.max(1, S.emitted) * 100).toFixed(2)}%`);
}

// ── ⓓ 사람 손 환산 — N 을 몇 번 짊어져야 하나(재민 실기 판정용) ──────────────
{
  const CAP = 60;   // 한 번에 들고 갈 수 있는 대략치(짐칸 한 종 상한 — 값 자체는 인벤 하네스가 정본)
  const NS = live.map((v) => { const t = Winter.targetOf({ econ: v }); return t ? t.target : 0; }).filter(Boolean).sort((a, b) => a - b);
  const mid = NS[Math.floor(NS.length / 2)] || 0;
  console.log(`\nⓓ 사람 손 환산(D=${Winter.CFG.D}) — 중앙 마을 N=${mid} ⇒ 한 번에 ${CAP}씩이면 **${Math.ceil(mid / CAP)}번**`);
  console.log(`   ⚠이건 "혼자서"의 수다. 마을 사람 여럿이 나누면 그만큼 준다(W-7ⓐ: 양은 횟수와 별개 축).`);
}
console.log('');
