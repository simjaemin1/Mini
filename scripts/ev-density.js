#!/usr/bin/env node
// === scripts/ev-density.js — 사건 밀도 실측 · 문턱 A/B ==========================
//
// ★[재민 확정 2026-08-25] "사건 밀도 = 각본 금지, 생태계 파라미터로 창발.
//   목표치: **마을당 2~3일에 1건**, 플레이어에게 닿는 건 그중 절반."
//
// ★이 스크립트가 랩을 복제하지 않는 방법:
//   장부는 **관측자**다 → 같은 world 를 **여러 장부가 동시에** 볼 수 있다.
//   그래서 문턱 A/B 를 한 판의 틱 스트림 위에서 돌린다 —
//     · 판마다 다시 800일을 돌릴 필요가 없다(51마을 800일 한 판이 ~5분)
//     · 그리고 무엇보다 **완전히 같은 세계**를 견주게 된다(카오스 잡음 0).
//   덤으로 이게 "장부가 econ 을 안 건드린다"의 실증이기도 하다 — 장부를 N개 달아도
//   최종 인구·소멸이 **장부 0개일 때와 같아야** 한다(아래 ⓐ 기준선 대조).
//
// 실행: node scripts/ev-density.js [일수=800] [시드=1020]
//   EV_BASE=1 …  장부를 하나도 안 달고 기준선만 낸다(A/B 의 A)
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/ev-density-${process.pid}.db`;

const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 1020;
const BASE_ONLY = process.env.EV_BASE === '1';

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const VillageLayout = R('server/village-layout');
const Villages = R('server/villages');
const Events = R('server/events');
const P = Villages.__labProbe;
const Z = 'hanbando', ZONE = ZONES[Z], SZ = P.SZ;

// ── 실지도 세계 조립 — econ-lab-real.js 와 **같은 순서·같은 함수**(사본 아님, 같은 정본 호출) ──
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
console.log(`실지도 ${seeds.length}곳 · 시드 ${SEED} · ${DAYS}일`);

// ── A/B 후보 문턱 ────────────────────────────────────────────────────────────
//   1차 스윕(시드 1020)에서 ±40%(1.94일)는 목표를 **넘겼고**(너무 잦다) ±55~70% 가 2.0~2.2일로 들어왔다.
//   결선 3종만 3시드로 다시 잰다. SHORT_DAYS 는 **안 건드린다** — 그 값은 게시판 의뢰의 정의이기도 해서
//   밀도 맞추자고 흔들면 "부족"의 뜻이 바뀐다(밀도 튜닝이 게임 규칙을 바꾸면 안 된다).
const CANDS = BASE_ONLY ? [] : [
  { tag: 'A 기본(±40 · H1.35)', cfg: {} },
  { tag: 'B ±55 · H1.6', cfg: { PRICE_UP: 0.55, PRICE_DOWN: 0.55, HYST: 1.6 } },
  { tag: 'C ±70 · H1.6', cfg: { PRICE_UP: 0.70, PRICE_DOWN: 0.70, HYST: 1.6 } },
];
const depositMap = Villages.playerVillageDepositMap();
const LS = CANDS.map((c) => {
  const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap, cfg: c.cfg });
  L.prime(world); return { ...c, L };
});

const _log = console.log;
console.log = () => {};
for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world);
  for (const x of LS) x.L.scanDay(world, world.day, {});
}
console.log = _log;

// ── 기준선(장부가 궤적을 안 건드렸다는 실증) ─────────────────────────────────
let pop = 0, dead = 0, weapQ = 0, ever = 0;
for (const v of world.villages) {
  const n = (v.npcs || []).length; pop += n;
  if (v._everPop) ever++;
  if (v._everPop && n <= 0) dead++;
  weapQ += (v.storage.weapon || 0) * (v._weapQ != null ? v._weapQ : 1);
}
console.log(`\nⓐ 기준선 — 인구 ${pop} · 소멸 ${dead}/${ever} · 무기Q ${weapQ.toFixed(0)} · 거래 ${world.tradeLog.length} · 장부 ${LS.length}개 부착`);

if (!LS.length) process.exit(0);
const live = world.villages.filter((v) => (v.npcs || []).length > 0).length;
console.log(`\nⓑ 사건 밀도 (인구있는 마을 ${live}곳 × ${DAYS}일)`);
console.log('  ' + '문턱'.padEnd(26) + '건수'.padStart(8) + '마을당 몇 일에 1건'.padStart(20) + '  타입 분포(부족/글럿/급등/급락/계절)' + '   ms/일');
for (const x of LS) {
  const S = x.L.stats;
  const perVD = S.emitted / Math.max(1, live * S.days);
  const daysPer = 1 / Math.max(1e-9, perVD);
  const B = S.byType;
  const hit = (daysPer >= 2 && daysPer <= 3) ? ' ★목표' : '';
  console.log('  ' + x.tag.padEnd(24) + String(S.emitted).padStart(8) + (daysPer.toFixed(2) + '일').padStart(18)
    + `   ${B.STOCK_SHORTAGE}/${B.STOCK_GLUT}/${B.PRICE_SPIKE}/${B.PRICE_DROP}/${B.SEASON_CHANGE}`
    + `   ${(S.scanMs / Math.max(1, S.days)).toFixed(3)}` + hit);
}
// 편중 — 평균 뒤에 숨은 분포(한 마을이 다 내고 나머지는 조용한 게 최악)
console.log(`\nⓒ 마을별 편중(최근 ${LS[0].L.cfg.KEEP_DAYS}일 보유 건수)`);
for (const x of LS) {
  const per = x.L.vids.map((vid) => x.L.ringOf(vid).length).sort((a, b) => b - a);
  const q = (f) => per[Math.min(per.length - 1, Math.floor(per.length * f))] || 0;
  console.log(`  ${x.tag.padEnd(24)} 최다 ${String(per[0] || 0).padStart(4)} · 상위25% ${String(q(0.25)).padStart(4)} · 중앙 ${String(q(0.5)).padStart(4)} · 하위25% ${String(q(0.75)).padStart(4)} · 최소 ${String(per[per.length - 1] || 0).padStart(4)}`);
}
console.log(`\nⓓ 의뢰(플레이어 없음 → 납품 0 · 게시/철회만)`);
for (const x of LS) console.log(`  ${x.tag.padEnd(24)} 게시 ${String(x.L.stats.reqOpened).padStart(6)} · 철회 ${String(x.L.stats.reqClosed).padStart(6)} · 마을·일당 ${(x.L.stats.reqOpened / Math.max(1, live * DAYS)).toFixed(4)}`);
console.log(`\n※ CARAVAN_LATE 는 랩(econ 단독)에 실체 캐러밴이 없어 **구조적으로 0**이다 — 실서버에서만 난다.`);
try { require('fs').unlinkSync(process.env.DB_PATH); } catch (e) {}
