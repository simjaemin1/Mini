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
//   ⚠2026-08-26 수리: 'A' 를 `cfg: {}` 로 뒀더니 **채택 뒤에는 A 와 C 가 같은 값**이 나왔다
//     (기본값이 이미 ±70·H1.6 이 됐으므로). 라벨은 A 인데 내용은 C 인, 조용히 무의미해진 열이었다.
//     ⇒ 채택 전 값을 **명시**한다. 열이 스스로 뜻을 갖게.
const CANDS = BASE_ONLY ? [] : [
  { tag: 'A 채택전(±40 · H1.35)', cfg: { PRICE_UP: 0.40, PRICE_DOWN: 0.40, HYST: 1.35 } },
  { tag: 'B ±55 · H1.6', cfg: { PRICE_UP: 0.55, PRICE_DOWN: 0.55, HYST: 1.6 } },
  { tag: 'C ±70 · H1.6 ★채택', cfg: { PRICE_UP: 0.70, PRICE_DOWN: 0.70, HYST: 1.6 } },
];
const depositMap = Villages.playerVillageDepositMap();
// ★[T18 2026-09-01] 연표 문턱 스윕용 원자료 — **채택 문턱(C)** 의 사건만 심각도와 함께 모은다.
//   장부를 건드리지 않는다: 이미 있는 `onEvent` 훅에 얹을 뿐이고, 훅이 없을 때와 결과가 같다.
const CHRON_RAW = [];
const LS = CANDS.map((c) => {
  const adopted = /★채택/.test(c.tag);
  const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap, cfg: c.cfg,
    onEvent: adopted ? ((e) => CHRON_RAW.push({ t: e.type, s: Math.abs(Math.log(Math.max(1e-6, e.mag || 1))) })) : null });
  L.prime(world); return { ...c, L };
});

// ★★[T18 2026-09-01] 연표 계측용 장부 하나를 **더** 단다 — 장부는 관측자라 여러 개를 한 세계에 얹을 수
//   있다(이 스크립트의 존재 이유가 그거다). 채택 문턱(C)과 **같은 cfg** 에 지리만 얹어,
//   실지도 51마을에서 연표가 몇 행 쌓이고 조회가 몇 ms 인지를 잰다.
//   ⚠거리는 `econ.villageDist` 정본 함수다 — 여기엔 지형 BFS 행렬이 없으니 **유클리드로 떨어진다**
//     (그래서 실서버보다 도달이 **조금 빠르다**. 행 수는 지리와 무관하고, 조회 비용만 하한이 된다).
const CHRON = BASE_ONLY ? null : (() => {
  const vids = world.villages.map((_, i) => i);
  const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap,
    cfg: { PRICE_UP: 0.70, PRICE_DOWN: 0.70, HYST: 1.6 },
    geo: { vids: () => vids, dist: (a, b) => econ.villageDist(world.villages[a], world.villages[b]) } });
  L.prime(world);
  return L;
})();

const _log = console.log;
console.log = () => {};
for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world);
  for (const x of LS) x.L.scanDay(world, world.day, {});
  if (CHRON) CHRON.scanDay(world, world.day, {});
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
console.log('  ' + '문턱'.padEnd(26) + '건수'.padStart(8) + '마을당 몇 일에 1건'.padStart(20) + '  값 유형(부족/글럿/급등/급락/계절)' + '   일 유형   ms/일');
// ★[T50] 유형 이름을 여기 다시 적지 않는다 — 정본 목록(`Events.DEED_TYPES`)으로 가른다.
const DEED = new Set(Events.DEED_TYPES);
for (const x of LS) {
  const S = x.L.stats;
  const perVD = S.emitted / Math.max(1, live * S.days);
  const daysPer = 1 / Math.max(1e-9, perVD);
  const B = S.byType;
  let dN = 0; for (const t of Events.TYPES) if (DEED.has(t)) dN += B[t] || 0;
  const hit = (daysPer >= 2 && daysPer <= 3) ? ' ★목표' : '';
  console.log('  ' + x.tag.padEnd(24) + String(S.emitted).padStart(8) + (daysPer.toFixed(2) + '일').padStart(18)
    + `   ${B.STOCK_SHORTAGE}/${B.STOCK_GLUT}/${B.PRICE_SPIKE}/${B.PRICE_DROP}/${B.SEASON_CHANGE}`
    + `   ${String(dN).padStart(5)}(${(dN / Math.max(1, S.emitted) * 100).toFixed(1)}%)`
    + `   ${(S.scanMs / Math.max(1, S.days)).toFixed(3)}` + hit);
}
// 편중 — 평균 뒤에 숨은 분포(한 마을이 다 내고 나머지는 조용한 게 최악)
console.log(`\nⓒ 마을별 편중(최근 ${LS[0].L.cfg.KEEP_DAYS}일 보유 건수)`);
for (const x of LS) {
  const per = x.L.vids.map((vid) => x.L.ringOf(vid).length).sort((a, b) => b - a);
  const q = (f) => per[Math.min(per.length - 1, Math.floor(per.length * f))] || 0;
  console.log(`  ${x.tag.padEnd(24)} 최다 ${String(per[0] || 0).padStart(4)} · 상위25% ${String(q(0.25)).padStart(4)} · 중앙 ${String(q(0.5)).padStart(4)} · 하위25% ${String(q(0.75)).padStart(4)} · 최소 ${String(per[per.length - 1] || 0).padStart(4)}`);
}
// ── ⓔ [T18] 연표 문턱 스윕 — "연대기에 남길 만큼 큰 사건"의 선을 어디에 그을 것인가 ────────
//   등급 필드는 없다(§0-ⓓ). 있는 건 `sev = |ln(관측÷기준)|` 하나뿐이라 거기에 선을 긋는다.
//   읽을 만한 연표의 기준: **마을 한 해에 계절당 몇 줄**(4계절 × 몇 줄 = 한 해 한 화면).
if (CHRON_RAW.length) {
  // ★[T50] 이 스윕은 **값 유형**에만 뜻이 있다 — 일 유형은 sev 문턱을 면제받는다(드묾이 곧 등급).
  const CH_TYPES = new Set(CHRON ? CHRON.chronTypes : []);
  const cand = CHRON_RAW.filter((r) => CH_TYPES.has(r.t) && !DEED.has(r.t));
  const years = DAYS / 365;
  console.log(`\nⓔ 연표 문턱 스윕 (계절 전환 제외 후보 ${cand.length}건 · ${live}마을 × ${years.toFixed(2)}해)`);
  console.log('  ' + '문턱 |ln(mag)|'.padEnd(16) + '연표 행'.padStart(9) + '마을·해당'.padStart(11) + '마을·계절당'.padStart(12) + '  타입 분포(부족/글럿/급등/급락)');
  for (const th of [0.7, 1.2, 1.7, 2.2, 2.7, 3.2, 4.0]) {
    const sel = cand.filter((r) => r.s >= th);
    const per = sel.length / Math.max(1, live * years);
    const b = { STOCK_SHORTAGE: 0, STOCK_GLUT: 0, PRICE_SPIKE: 0, PRICE_DROP: 0, CARAVAN_LATE: 0 };
    for (const r of sel) b[r.t]++;
    console.log('  ' + `≥ ${th.toFixed(1)}`.padEnd(16) + String(sel.length).padStart(9)
      + per.toFixed(1).padStart(11) + (per / 4).toFixed(1).padStart(12)
      + `   ${b.STOCK_SHORTAGE}/${b.STOCK_GLUT}/${b.PRICE_SPIKE}/${b.PRICE_DROP}`);
  }
}

// ── ⓕ [T18] 연표 대리 지표 — 실지도 51마을에서 몇 행 쌓이고 조회가 얼마나 드는가 ─────────
if (CHRON) {
  const YD = Events.yearDaysOf();
  const yrs = Math.max(1, Math.ceil(DAYS / YD));
  const t0 = Date.now();
  let cells = 0, shown = 0, cut = 0, cutAbroad = 0;
  for (const vid of CHRON.vids) for (let y = 0; y < yrs; y++) {
    const c = CHRON.chronicle(vid, { year: y });
    for (const b of c.seasons) { cells++; shown += b.items.length; cut += b.more; cutAbroad += b.abroadMore; }
  }
  const ms1 = Date.now() - t0;
  const t1 = Date.now();
  for (const vid of CHRON.vids) for (let y = 0; y < yrs; y++) CHRON.chronicle(vid, { year: y });
  const ms2 = Date.now() - t1;
  const S = CHRON.stats;
  console.log(`\nⓕ 연표(연대기) — 문턱 |ln(mag)| ≥ ${CHRON.cfg.CHRON_SEV} · 이웃 ≥ ${CHRON.cfg.CHRON_FOREIGN_SEV}`
    + ` · 계절 상한 우리 ${CHRON.cfg.CHRON_PER_SEASON} / 이웃 ${CHRON.cfg.CHRON_FOREIGN}`);
  console.log(`  영구 보관 행 ${S.chronicled} (전체 사건 ${S.emitted} 의 ${(S.chronicled / Math.max(1, S.emitted) * 100).toFixed(1)}%)`
    + ` · 마을·해당 ${(S.chronicled / Math.max(1, live * DAYS / YD)).toFixed(1)}행`);
  console.log(`  전수 조회 ${live}마을 × ${yrs}해 = ${cells}칸 — 첫 조회 ${ms1}ms(칸당 ${(ms1 / Math.max(1, cells)).toFixed(3)}ms)`
    + ` · 두 번째 ${ms2}ms(캐시)`);
  console.log(`  화면에 뜨는 줄 ${shown} · 우리 마을 잘림 ${cut}("그 밖에 n건") · 이웃 후보 잘림 ${cutAbroad}(화면에 안 센다)`);
  console.log(`  칸당 평균 — 뜨는 줄 ${(shown / Math.max(1, cells)).toFixed(1)} · "그 밖에" ${(cut / Math.max(1, cells)).toFixed(1)}건`);
  // ── ★[T50] **"일" 대 "값"** — 이 배치가 고치러 온 바로 그 비율 ────────────────────────
  //   T18 회부 A-1: *"연대기가 값이 크게 움직인 해로만 읽힌다."* 그 문장이 참인지 거짓인지는
  //   화면에 실제로 뜨는 줄에서만 알 수 있다(보관 행이 아니라). 그래서 **뜨는 줄**을 센다.
  let dRow = 0, vRow = 0, dKept = 0, dCand = 0;
  for (const vid of CHRON.vids) for (let y = 0; y < yrs; y++) {
    for (const b of CHRON.chronicle(vid, { year: y }).seasons) for (const it of b.items) (it.deed ? dRow++ : vRow++);
  }
  for (const vid of CHRON.vids) for (const ev of CHRON.chronOf(vid)) if (CHRON.isDeed(ev)) dCand++;
  dKept = dRow;
  console.log(`  ★일 대 값 — 화면에 뜨는 줄 ${dRow + vRow}줄 중 **일 ${dRow}줄(${(dRow / Math.max(1, dRow + vRow) * 100).toFixed(1)}%)** · 값 ${vRow}줄`);
  console.log(`     (보관된 일 사건 ${dCand}건 중 ${dKept}줄이 화면까지 왔다 — 일은 드물어서 상한에 거의 안 걸린다)`);
}

console.log(`\nⓓ 의뢰(플레이어 없음 → 납품 0 · 게시/철회만)`);
for (const x of LS) console.log(`  ${x.tag.padEnd(24)} 게시 ${String(x.L.stats.reqOpened).padStart(6)} · 철회 ${String(x.L.stats.reqClosed).padStart(6)}`
  + ` · 축소 ${String(x.L.stats.reqShrunk).padStart(5)} · 못갚아미게시 ${String(x.L.stats.reqNoPay).padStart(6)} · 재검증철회 ${String(x.L.stats.reqRevalidated).padStart(5)}`
  + ` · 마을·일당 ${(x.L.stats.reqOpened / Math.max(1, live * DAYS)).toFixed(4)}`);
console.log(`\n※ CARAVAN_LATE 는 랩(econ 단독)에 실체 캐러밴이 없어 **구조적으로 0**이다 — 실서버에서만 난다.`);
try { require('fs').unlinkSync(process.env.DB_PATH); } catch (e) {}
