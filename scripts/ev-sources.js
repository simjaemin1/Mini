#!/usr/bin/env node
// === scripts/ev-sources.js — T50 §0: 후보 사건의 **원천**이 실재하는가 =============
//   ⚠계측기다. 하네스가 아니다 — **러너에 넣지 마라**(`// @regress` 표를 붙이지 않는다).
//
// ★이 스크립트가 대답하는 질문 [T50 2026-09-02]
//   지시서는 일곱 후보(습격·풍흉·소멸 위기·완공·처음·캐러밴 실종·동사)를 주고 이렇게 못박았다:
//   **"원천이 없는 후보는 만들지 않는다"**(각본 금지 — 습격 사건을 넣으려고 습격을 만들지 않는다).
//   그래서 여기서 재는 것은 사건이 아니라 **원천**이다. 세 가지를 잰다:
//     ⓐ 그 일이 지금 실제로 일어나는가(실지도 51마을 800일)
//     ⓑ 얼마나 나는가 — 장부 밀도 캐논("마을당 2~3일에 1건")을 흔드는가
//     ⓒ 인구 축 문턱 스윕 — 새로 만든 문턱 **하나**의 채택 근거
//
// ★장부를 **실제로 달아서** 잰다(손으로 검출기를 다시 짜지 않는다 — 그게 사본이고, 사본은
//   구현이 바뀌는 날 조용히 갈라진다). 랩에 장부를 다는 것 자체가 "장부는 관측자다"의 실증이다.
//
// 실행: node scripts/ev-sources.js [일수=800] [시드=1020]
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/ev-sources-${process.pid}.db`;

const path = require('path');
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

// ── 실지도 세계 조립 — `ev-density.js` 와 **같은 순서·같은 정본 함수** ──────────
P.setZoneId(Z);
const _in = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWater = (x, y) => { if (ZONE.isOcean) return true; if (!_in(x, y)) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ); try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
const isRock = (x, y) => { if (!_in(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isBlocked = (x, y) => (!_in(x, y)) ? true : (isRock(x, y) || isWater(x, y));
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal: isBlocked, isWaterTileLocal: isWater });
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
const N = world.villages.length;
console.log(`실지도 ${N}곳 · 시드 ${SEED} · ${DAYS}일`);

// ── 장부 하나(채택 문턱 그대로) + 인구 축 스윕용 원자료 ───────────────────────
const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: Villages.playerVillageDepositMap() });
L.prime(world);
const POP = world.villages.map(() => []);
const _l = console.log; console.log = () => {};
for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world);
  L.scanDay(world, world.day, {});
  for (let i = 0; i < N; i++) POP[i].push(world.villages[i].npcs.length);
}
console.log = _l;

// ── ⓐ 유형별 건수 — 값 유형 대 일 유형 ────────────────────────────────────────
const S = L.stats, B = S.byType;
const deed = new Set(L.deedTypes);
let vN = 0, dN = 0;
for (const t of L.TYPES) (deed.has(t) ? (dN += B[t] || 0) : (vN += B[t] || 0));
const live = world.villages.filter((v) => (v.npcs || []).length > 0).length;
console.log(`\nⓐ 유형별 건수 (인구있는 마을 ${live}곳 × ${DAYS}일 · 총 ${S.emitted}건 · 마을당 ${(1 / (S.emitted / Math.max(1, live * S.days))).toFixed(2)}일에 1건)`);
for (const t of L.TYPES) {
  const n = B[t] || 0;
  const per = n ? (n / N).toFixed(2) : '0';
  console.log(`  ${(deed.has(t) ? '일 ' : '값 ')}${t.padEnd(16)} ${String(n).padStart(7)}   ${(n / Math.max(1, S.emitted) * 100).toFixed(2).padStart(6)}%   마을당 ${per}`);
}
console.log(`  ── 값 ${vN}건 · 일 ${dN}건 (${(dN / Math.max(1, S.emitted) * 100).toFixed(1)}%)`);
console.log(`  ⚠랩(econ 단독)에서 **구조적으로 0** 인 것: CARAVAN_LATE·CARAVAN_RAIDED·TRADER_KILLED(도적 호스트 없음) · BUILT(생활층 없음).`);
console.log(`     없는 데이터를 억지로 만들지 않는다 — 실서버에서만 나는 유형이 있다는 사실을 그대로 적는다.`);

// ── ⓑ 원천이 없는 후보 — 여기 적힌 것이 설계 백로그다 ─────────────────────────
let blockade = 0;
for (const v of world.villages) if (v.isolated) blockade++;
console.log(`\nⓑ 원천 점검(후보 중 등재 못 한 것)`);
console.log(`  · 마을 소멸 확정  — ${world.villages.filter((v) => v._everPop && !v.npcs.length).length}/${N} 곳. 인구 0 인 마을은 \`scanDay\` 가 건너뛴다(사람 없는 마을엔 소식이 없다) ⇒ **관측자가 없다**.`);
console.log(`  · 봉쇄(blockade)  — world.events 큐 ${world.events.length}건 · 지금 봉쇄 중 ${blockade}곳. 이 존은 큐를 아무도 안 채운다.`);
console.log(`  · 동사·부상 사망  — T43(쓰러짐)·T44(극단 HP) 착지 전. econ 인구는 죽는 이유를 구분하지 않는다.`);
console.log(`  · 캐러밴 실종     — \`_abandoned\`(빈손 귀환)는 **경제 판단**이지 사건이 아니다. 실종은 \`tradersKilled\` 로 이미 잡힌다.`);

// ── ⓒ 인구 축 문턱 스윕 — 새로 만든 문턱 **하나**의 채택 근거 ────────────────
//   장부의 `POP_COLLAPSE` 와 **같은 산수**를 오프라인으로 다시 돌린다(창·이탈만 바꿔 가며).
console.log(`\nⓒ 인구 축 스윕 — 채택 EV_POP_WIN=${Events.CFG.POP_WIN} · EV_POP_DOWN=${Events.CFG.POP_DOWN}`);
console.log('  창(일)  이탈%   발화건수   sev 중앙/최대   마을당');
const HY = Events.CFG.HYST, PMIN = Events.CFG.POP_MIN;
for (const WIN of [30, 60, 90, 180]) {
  for (const DOWN of [0.20, 0.30, 0.40, 0.50]) {
    let n = 0; const sevs = [];
    for (let i = 0; i < N; i++) {
      let ema = null, on = false;
      const onTh = 1 - DOWN, offTh = 1 - DOWN / HY;
      for (const p of POP[i]) {
        if (p < PMIN) { ema = null; on = false; continue; }
        if (ema == null) { ema = p; continue; }
        const ratio = p / ema;
        if (!on && ratio < onTh) { on = true; n++; sevs.push(Math.abs(Math.log(Math.max(1e-6, ratio)))); }
        else if (on && ratio > offTh) on = false;
        ema = ema * (1 - 1 / WIN) + p * (1 / WIN);
      }
    }
    sevs.sort((a, b) => a - b);
    const star = (WIN === Events.CFG.POP_WIN && Math.abs(DOWN - Events.CFG.POP_DOWN) < 1e-9) ? '  ★채택' : '';
    console.log(`  ${String(WIN).padStart(5)}  ${(DOWN * 100).toFixed(0).padStart(4)}%  ${String(n).padStart(8)}   ${(sevs.length ? sevs[sevs.length >> 1].toFixed(2) : '-').padStart(5)}/${(sevs.length ? sevs[sevs.length - 1].toFixed(2) : '-').padStart(5)}   ${(n / N).toFixed(2)}${star}`);
  }
}
console.log(`  ※ 창을 30→180 으로 여섯 배 늘려도 건수가 15~31 안에 머문다 — 이 신호는 **드물고 뚜렷하다**.`);
console.log('');
