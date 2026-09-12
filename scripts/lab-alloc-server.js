#!/usr/bin/env node
// === scripts/lab-alloc-server.js — T164: 실현 배분 서버 A/B (51마을 · 800일) ==================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
// ⚠세계는 `scripts/t17-metrics.js` 와 **같은 문**으로 세운다(사본이 아니라 같은 절차 · 족보 130).
//   이 파일이 더 내는 것은 T164 가 물은 것들뿐이다:
//     여덟 수 + **K 축 분포**(자리/식량/연료 · `_kDbg`) + **직업 점유** + **MSY 최소**(`_forageScale`)
//
// 실행: node scripts/lab-alloc-server.js [일수=800] [시드=1020]
//   L_ALLOC_REAL=1 …   ← 실현 배분 팔   ·   (없음) ← 종전 팔
//   T164_JSON=/tmp/x.json  표를 JSON 으로도 남긴다
//
// ★★[T177 2026-09-12] **궤적 추적** `T177_TRACE=1` — 코드 0(엔진 무접촉).
//   `L_ALLOC_REAL` 을 **끄고** 정본에 남아 있는 주입 문(`world.allocFn`)에 관찰자를 건다:
//     · `T177_ARM=old`  → 후보 목록만 **기록하고 null** 을 돌려준다 = 종전 팔 그대로
//     · `T177_ARM=real` → 기록한 뒤 **정본 `allocRealCandidates` 를 그대로 부른다** = 실현 팔 그대로
//   ⚠정본을 다시 구현하지 않는다 — 그 함수를 **부른다**(사본 0). 문이 넘기는 ctx 는 직접 호출 때의
//     상위집합이라(period·counts·w·forageYields·JOBS 전부 포함) 두 경로의 수가 같아야 한다 —
//     `T177_ARM=real` 이 T164 §3-1 의 여덟 수를 그대로 내는지가 이 계측기의 자기검사다.
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t164-${process.pid}.db`;

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
const TRACE = process.env.T177_TRACE === '1';
const TARM = process.env.T177_ARM || 'old';
const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
R('server/trees').attachToWorld(world);        // ★족보 130 — 서버가 여는 그 문을 계측기도 연다
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;

// ── ★[T177] 관찰자 문 ─────────────────────────────────────────────────────────
const TR = { job: {}, calls: 0, rewritten: 0 };
const _trJob = (j) => (TR.job[j] || (TR.job[j] = { n: 0, oldSum: 0, newSum: 0, ratioSum: 0, ratioN: 0,
  pickedOld: 0, pickedNew: 0, cntSum: 0, toolSum: 0, toolN: 0, zeroReal: 0,
  // ★[T189] 폴백 갈래 — 폴백 호출 수와 그 안에서 실제로 뽑힌 수
  fbN: 0, fbPicked: 0, rwN: 0, rwPicked: 0, cnt0: 0, firstReal: null }));
function _toolCov(v) {
  const c = v.counts || {}; let td = 0;
  for (const j in c) { const jd = econ.JOBS[j]; if (jd && jd.toolDependent) td += c[j] || 0; }
  const stock = (v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0);
  return td > 0 ? Math.min(1, stock / td) : 1;
}
if (TRACE) {
  world.allocFn = (v, w2, cands, ctx) => {
    TR.calls++;
    const alt = (TARM === 'real') ? econ.allocRealCandidates(v, w2, cands, ctx) : null;
    const cov = _toolCov(v);
    const oldBest = cands.slice().sort((a, b) => b[1] - a[1])[0];
    const newBest = alt ? alt.slice().sort((a, b) => b[1] - a[1])[0] : null;
    if (alt) TR.rewritten++;
    for (let i = 0; i < cands.length; i++) {
      const j = cands[i][0], go = cands[i][1];
      const t = _trJob(j);
      t.n++; t.oldSum += go; t.cntSum += (ctx.counts && ctx.counts[j]) || 0;
      t.toolSum += cov; t.toolN++;
      const nHere = (ctx.counts && ctx.counts[j]) || 0;
      if (nHere <= 0) t.cnt0++;                            // ★인원 0 인 채로 후보에 선 호출
      if (alt) {
        const gn = alt[i][1];
        t.newSum += gn;
        const isFb = (gn === go);
        if (isFb) { t.zeroReal++; t.fbN++; if (newBest && newBest[0] === j) t.fbPicked++; }
        else { t.rwN++; if (newBest && newBest[0] === j) t.rwPicked++; if (go > 0) { t.ratioSum += gn / go; t.ratioN++; } }
        if (!isFb && t.firstReal === null) t.firstReal = (w2 && w2.day) || 0;   // ★실현이 처음 생긴 날
      }
      if (oldBest && oldBest[0] === j) t.pickedOld++;
      if (newBest && newBest[0] === j) t.pickedNew++;
    }
    return alt;
  };
}

// ── ★[T177] 마을 궤적(10일) — 소멸 귀속용 ────────────────────────────────────
const VT = TRACE ? world.villages.map(() => []) : null;
function _snapVil() {
  world.villages.forEach((v, i) => {
    const jc = {}; for (const n of (v.npcs || [])) jc[n.currentJob] = (jc[n.currentJob] || 0) + 1;
    VT[i].push({ d: world.day, pop: (v.npcs || []).length, jobs: jc,
      k: v._kDbg ? { s: +v._kDbg.slot.toFixed(1), p: +v._kDbg.prod.toFixed(1), f: +v._kDbg.fuel.toFixed(1) } : null,
      st: +(v.storage.stone || 0).toFixed(1), tl: +(v.storage.tool || 0).toFixed(1),
      wd: +(v.storage.wood || 0).toFixed(1), cov: +_toolCov(v).toFixed(3) });
  });
}

// 장부 — `t17-metrics.js` 와 같은 계약(정본 문턱 그대로 · cfg 사본 없음)
const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: Villages.playerVillageDepositMap(), onEvent: () => {} });
L.prime(world);

const _log = console.log; console.log = () => {};
for (let d = 0; d < DAYS; d++) { econV2.tickWorldV2(world); L.scanDay(world, world.day, {}); if (TRACE && world.day % 10 === 0) _snapVil(); }
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

// ── T164 가 더 묻는 것 ───────────────────────────────────────────────────────
const bind = { slot: 0, prod: 0, fuel: 0, none: 0 };
let Ksum = 0;
for (const v of world.villages) {
  const k = v._kDbg; if (!k) { bind.none++; continue; }
  const m = Math.min(k.slot, k.prod, k.fuel); Ksum += m;
  if (m === k.fuel) bind.fuel++; else if (m === k.prod) bind.prod++; else bind.slot++;
}
const jc = {}; let tot = 0;
for (const v of world.villages) for (const n of (v.npcs || [])) { jc[n.currentJob] = (jc[n.currentJob] || 0) + 1; tot++; }
const jobs = Object.entries(jc).sort((a, b) => b[1] - a[1]);
const topShare = tot ? jobs[0][1] / tot : 0;
const farmerShare = tot ? (jc.farmer || 0) / tot : 0;
const foragerShare = tot ? (jc.forager || 0) / tot : 0;
const fsArr = world.villages.map((v) => (v._forageScale != null ? v._forageScale : null)).filter((x) => x != null);
const msyMin = fsArr.length ? Math.min.apply(null, fsArr) : null;
const msyMean = fsArr.length ? fsArr.reduce((a, b) => a + b, 0) / fsArr.length : null;
const msyBite = fsArr.filter((x) => x < 0.999).length;
// ratio — 채집 식량환산이 전체 식량등가 재고에서 차지하는 몫(T151 ⓐ 문법)
const foodEq = world.villages.reduce((a, v) => a + econ.totalFoodEquivalent(v), 0);
const FF = econ.FORAGE_FOOD_FACTOR;
const forageEq = world.villages.reduce((a, v) => a + Object.keys(FF).reduce((b, r) => b + (v.storage[r] || 0) * FF[r], 0), 0);

const ARM = econ.allocRealOn() ? '실현' : (TRACE ? (TARM === 'real' ? '실현(문)' : '종전(문)') : '종전');
console.log(`\n=== T164 서버 A/B — 실지도 ${seeds.length}곳 · 시드 ${SEED} · ${DAYS}일 · 배분 **${ARM}**`
  + (econ.allocRealOn() ? ` (창 ×${econ.allocRealWin()})` : '') + ' ===');
console.log(`  여덟 수   인구 ${pop} · 소멸 ${dead}/${ever} · 무기Q ${weapQ.toFixed(0)} · 확장셀 ${expand}`);
console.log(`            게시 ${S.reqOpened} · 일/건 ${daysPer.toFixed(2)} · 도구Q ${toolQ.toFixed(1)} · 보존식 ${presStock.toFixed(1)}`);
console.log(`  K 축      자리 ${bind.slot} · 식량흐름 ${bind.prod} · 연료 ${bind.fuel}  (K 합 ${Ksum.toFixed(0)} · 인구있는 마을 ${live})`);
console.log(`  직업      최대 ${jobs[0] ? jobs[0][0] + ' ' + (topShare * 100).toFixed(1) + '%' : '—'} · 농부 ${(farmerShare * 100).toFixed(1)}% · 채집꾼 ${(foragerShare * 100).toFixed(1)}% · 가짓수 ${jobs.length}`);
console.log(`            ${jobs.slice(0, 8).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
console.log(`  MSY       평균 ${msyMean == null ? '—' : msyMean.toFixed(3)} · 최소 ${msyMin == null ? '—' : msyMin.toFixed(3)} · **무는 마을 ${msyBite}/${fsArr.length}**`);
console.log(`  ratio     식량등가 ${foodEq.toFixed(0)} · 그중 구황(채집) ${forageEq.toFixed(0)} = ${(forageEq / Math.max(1, foodEq) * 100).toFixed(1)}%`);

if (TRACE) {
  console.log(`\n  [T177] 문 호출 ${TR.calls}회 · 다시 쓴 호출 ${TR.rewritten}회`);
  console.log('  직업'.padEnd(14) + '평균인원'.padStart(9) + '실현/종전'.padStart(11) + '폴백%'.padStart(7)
    + '폴백중뽑힘%'.padStart(13) + '실현중뽑힘%'.padStart(13) + '인원0%'.padStart(8)
    + '실현첫날'.padStart(10) + '고른 종전→실현'.padStart(18));
  const rows = Object.entries(TR.job).sort((a, b) => b[1].n - a[1].n);
  for (const [j, t] of rows) {
    const jd = econ.JOBS[j] || {};
    console.log('  ' + j.padEnd(12)
      + (t.cntSum / Math.max(1, t.n)).toFixed(1).padStart(9)
      + (t.ratioN ? (t.ratioSum / t.ratioN).toFixed(2) : '—').padStart(11)
      + (100 * t.fbN / Math.max(1, t.n)).toFixed(0).padStart(7)
      + (t.fbN ? (100 * t.fbPicked / t.fbN).toFixed(1) : '—').padStart(13)
      + (t.rwN ? (100 * t.rwPicked / t.rwN).toFixed(1) : '—').padStart(13)
      + (100 * t.cnt0 / Math.max(1, t.n)).toFixed(0).padStart(8)
      + String(t.firstReal === null ? '—' : 'd' + t.firstReal).padStart(10)
      + `${t.pickedOld} → ${t.pickedNew}`.padStart(18));
  }
}
if (process.env.T177_JSON) {
  fs.writeFileSync(process.env.T177_JSON, JSON.stringify({ seed: SEED, days: DAYS, arm: ARM,
    pop, dead, ever, weapQ, expand, toolQ, presStock, posted: S.reqOpened,
    job: TR.job, calls: TR.calls, rewritten: TR.rewritten,
    vil: world.villages.map((v, i) => ({ name: v.name, pop: (v.npcs || []).length,
      landStone: +(v.land.stone || 0).toFixed(3), landWood: +(v.land.wood || 0).toFixed(3),
      everPop: !!v._everPop, trace: VT ? VT[i] : null })) }));
  console.log(`  T177 JSON: ${process.env.T177_JSON}`);
}
if (process.env.T164_JSON) {
  fs.writeFileSync(process.env.T164_JSON, JSON.stringify({ seed: SEED, days: DAYS, arm: ARM,
    pop, dead, ever, weapQ, expand, toolQ, presStock, posted: S.reqOpened, daysPer,
    bind, Ksum, live, jobs, topShare, farmerShare, foragerShare, msyMean, msyMin, msyBite, foodEq, forageEq }));
  console.log(`  JSON: ${process.env.T164_JSON}`);
}
