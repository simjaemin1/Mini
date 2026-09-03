#!/usr/bin/env node
// === scripts/t17-metrics.js — ECON 수술의 계측기 (T17 → T60 확장) ==============
//
// ★★**계측기다. 하네스가 아니다 — 러너에 넣지 마라.**
//   러너는 파일 **첫 열의 등재 표**로 스스로 찾는다(`run-regress.sh` `_disc`) — 이 파일엔 그 표가 없다.
//   `scripts/trade-metrics.js` 와 같은 자리: 판정하지 않고 **수치를 낸다**.
//   판정은 `보고_T17_승인대기.md` 의 옛/새/귀속 표에서 재민이 한다(지시 §5).
//
// ★세계 조립은 `scripts/ev-density.js` 와 **같은 순서·같은 정본 함수**다(사본 아님).
//   실지도 → pickSeedVillages → VillageLayout.generate → extractLandParamsApprox → createWorldV2.
//
// 내는 열 (지시 §6 의 "새 기준선 스냅샷 제안" 항목):
//   ⓐ 기준선 — 인구 · 소멸 · 무기Q · 확장셀 · 거래
//   ⓑ 게시 — 건수 · 마을당 며칠에 1건(밀도 캐논 2~3일)
//   ⓒ 부족/글럿 **품목 분포** — 지시 §3 "부족 품목 분포 전/후"
//   ⓓ 도구 — 재고 Σ · 도구Q(품질보정 총량) · 부족 건수 · 게시 의뢰 건수
//   ⓔ 보존식 — 재고 Σ · 캐러밴 유통량(건수·수량)
//   ⓕ 소금 — 재고 Σ · **해안/내륙 가격 지역차**(자염 편입의 목적 그 자체)
//   ⓖ MSY — 상한이 선 마을 · 어촌 인구·어부·생선 재고·가격
//   ⓗ [T60] **어장 눈금** — 어촌별 잠재 어획(`_fishRawLast`) 대 상한(`land.fishSustain`)의 비
//   ⓘ [T60] **밀도 분해** — 사건 밀도가 어떤 유형·품목에서 왔나
//   ⓙ [T60] **사장 셋** — `woodSustain`·`forageSustain`·`marginalQ` 가 켜지면 무엇이 움직이나(표만)
//
// 축 손잡이(대조군 — 지시 §3 "①~③ 각각 끈 시드 1개씩"):
//   T17_TOOL=0 / T17_PRESERVE=0 / T17_SALT=0  → 그 축만 끈다(엔진 쪽 손잡이와 같은 이름)
//   [T60] T60_FISH2WAY=0  낚시 양방향 끔 · T60_MSY_MODE=legacy|lab|ema|fishv2 · T17_MSY=1 상한 켬
//
// 실행: node scripts/t17-metrics.js [일수=800] [시드=1020]
//   T17_JSON=/tmp/x.json  … 표를 JSON 으로도 남긴다(옛/새 비교 표를 손으로 옮겨 적지 않게)
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t17-metrics-${process.pid}.db`;

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
const SPEC = R('server/specialty');
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

// ★해안 판정 — **엔진이 쓰는 그 값을 그대로 읽는다**(사본 금지).
//   `server/villages.js` 의 `extractLandParamsApprox` 가 `coastal`(과 계측용 `_seaDistPx`)을 붙이고,
//   `createVillage` 의 land 화이트리스트가 그걸 통과시킨다. 계측기가 따로 재면 그게 곧 두 번째 정의다.
const coastal = new Set();

world.villages.forEach((v, i) => { if (v.land && v.land.coastal) coastal.add(i); });
{
  const d = seeds.map((s) => s.lp && s.lp._seaDistPx).filter((x) => x != null).sort((a, b) => a - b);
  console.log(`  해안(land.coastal) ${coastal.size}곳 · 바다까지 px — 최소 ${d[0]} · 중앙 ${d[Math.floor(d.length / 2)]} · 최대 ${d[d.length - 1]}`);
}
const depositMap = Villages.playerVillageDepositMap();
const shortByItem = new Map(), glutByItem = new Map(), reqByItem = new Map();
const L = Events.createLedger({
  econV2, vidOf: (v, i) => i, depositMap,
  cfg: { PRICE_UP: 0.70, PRICE_DOWN: 0.70, HYST: 1.6 },
  onEvent: (e) => {
    if (e.type === 'STOCK_SHORTAGE') shortByItem.set(e.item, (shortByItem.get(e.item) || 0) + 1);
    else if (e.type === 'STOCK_GLUT') glutByItem.set(e.item, (glutByItem.get(e.item) || 0) + 1);
  },
});
L.prime(world);

const _log = console.log; console.log = () => {};
for (let d = 0; d < DAYS; d++) { econV2.tickWorldV2(world); L.scanDay(world, world.day, {}); }
console.log = _log;

// ── ⓐ 기준선 ────────────────────────────────────────────────────────────────
let pop = 0, dead = 0, ever = 0, weapQ = 0, expand = 0;
for (const v of world.villages) {
  const n = (v.npcs || []).length; pop += n;
  if (v._everPop) ever++;
  if (v._everPop && n <= 0) dead++;
  weapQ += (v.storage.weapon || 0) * (v._weapQ != null ? v._weapQ : 1);
  expand += v.expansions || 0;
}
const live = world.villages.filter((v) => (v.npcs || []).length > 0).length;
const S = L.stats;
const perVD = S.emitted / Math.max(1, live * S.days);
const daysPer = 1 / Math.max(1e-9, perVD);

const AX = (k, dflt) => (process.env['T17_' + k] === '0' ? '끔' : dflt);
console.log(`\n=== T17 계측 — 실지도 ${seeds.length}곳 · 시드 ${SEED} · ${DAYS}일 ===`);
console.log(`  축: 도구 ${AX('TOOL', '켬')} · 보존식 ${AX('PRESERVE', '켬')} · 소금 ${AX('SALT', '켬')}`);
console.log(`\nⓐ 기준선   인구 ${pop} · 소멸 ${dead}/${ever} · 무기Q ${weapQ.toFixed(0)} · 확장셀 ${expand} · 거래 ${world.tradeLog.length}`);
console.log(`ⓑ 게시     의뢰 **${S.reqOpened}**건(기준선 정본의 '게시' 열) · 철회 ${S.reqClosed} · 사건 ${S.emitted}건 · 마을당 ${daysPer.toFixed(2)}일/건 (밀도 캐논 2~3일) · 인구있는 마을 ${live}`);

// ── ⓒ 부족/글럿 품목 분포 ────────────────────────────────────────────────────
const topOf = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const ko = (r) => (SPEC.RESOURCES[r] && SPEC.RESOURCES[r].ko) || r;
const fmtTop = (m) => topOf(m, 10).map(([r, c]) => `${ko(r)} ${c}`).join(' · ') || '없음';
const sumOf = (m) => [...m.values()].reduce((a, b) => a + b, 0);
console.log(`\nⓒ 부족 품목 분포 (총 ${sumOf(shortByItem)}건)`);
console.log(`   ${fmtTop(shortByItem)}`);
console.log(`ⓒ 글럿 품목 분포 (총 ${sumOf(glutByItem)}건)`);
console.log(`   ${fmtTop(glutByItem)}`);

// ── ⓓ~ⓕ 축별 열 ─────────────────────────────────────────────────────────────
const PRESERVED = ['dried_fish', 'dried_fruit', 'smoked_meat', 'pickled_veg'];
const stockOf = (r) => world.villages.reduce((a, v) => a + (v.storage[r] || 0), 0);
const toolStock = stockOf('tool') + stockOf('bronze_tool') + stockOf('iron_tool');
let toolQ = 0;
for (const v of world.villages) toolQ += (v.storage.tool || 0) * (v._toolQ != null ? v._toolQ : 1);
console.log(`\nⓓ 도구     재고 ${toolStock.toFixed(1)} · 도구Q ${toolQ.toFixed(1)} · 부족 ${shortByItem.get('tool') || 0}건 · 글럿 ${glutByItem.get('tool') || 0}건`);

const presStock = PRESERVED.reduce((a, r) => a + stockOf(r), 0);
let presTrades = 0, presAmt = 0;
for (const t of world.tradeLog) {
  if (t.sent && PRESERVED.includes(t.sent.res)) { presTrades++; presAmt += t.sent.amt || 0; }
  if (t.bought && PRESERVED.includes(t.bought.res)) { presTrades++; presAmt += t.bought.amt || 0; }
}
console.log(`ⓔ 보존식   재고 ${presStock.toFixed(1)} (${PRESERVED.map((r) => `${ko(r)} ${stockOf(r).toFixed(1)}`).join(' · ')})`);
console.log(`           캐러밴 유통 ${presTrades}건 · ${presAmt.toFixed(1)} 단위`);

// 소금 — 해안/내륙 가격 지역차. 가격은 정본 함수(computeShadowPrices) 하나만 부른다.
let cN = 0, cP = 0, iN = 0, iP = 0, cS = 0, iS = 0, saltTrades = 0, saltAmt = 0;
world.villages.forEach((v, i) => {
  if (!(v.npcs || []).length) return;
  let p = 0; try { p = (econV2.computeShadowPrices(v) || {}).salt || 0; } catch (e) {}
  if (coastal.has(i)) { cN++; cP += p; cS += v.storage.salt || 0; }
  else { iN++; iP += p; iS += v.storage.salt || 0; }
});
for (const t of world.tradeLog) {
  if (t.sent && t.sent.res === 'salt') { saltTrades++; saltAmt += t.sent.amt || 0; }
  if (t.bought && t.bought.res === 'salt') { saltTrades++; saltAmt += t.bought.amt || 0; }
}
const cAvg = cN ? cP / cN : 0, iAvg = iN ? iP / iN : 0;
console.log(`ⓕ 소금     재고 해안 ${cS.toFixed(1)}(${cN}곳) · 내륙 ${iS.toFixed(1)}(${iN}곳) · 부족 ${shortByItem.get('salt') || 0}건`);
console.log(`           가격 해안 ${cAvg.toFixed(3)} · 내륙 ${iAvg.toFixed(3)} · **지역차 ×${cAvg > 0 ? (iAvg / cAvg).toFixed(2) : '—'}** (내륙÷해안 — 1보다 크면 소금길이 선다)`);
console.log(`           캐러밴 유통 ${saltTrades}건 · ${saltAmt.toFixed(1)} 단위`);

// ── ⓖ MSY A/B (지시 §5 — 표만 낸다. 판정은 재민) ─────────────────────────────
{
  const on = process.env.T17_MSY === '1';
  const fishers = world.villages.reduce((a, v) => a + ((v.counts && v.counts.fisher) || 0), 0);
  let fv = 0, fpop = 0, fstock = 0, fp = 0, fpN = 0, capped = 0;
  for (const v of world.villages) {
    if (!(v.npcs || []).length) continue;
    const isFish = ((v.counts && v.counts.fisher) || 0) > 0;
    if (v.land && v.land.fishSustain != null) capped++;
    if (!isFish) continue;
    fv++; fpop += v.npcs.length; fstock += v.storage.fish || 0;
    try { const p = (econV2.computeShadowPrices(v) || {}).fish; if (p != null) { fp += p; fpN++; } } catch (e) {}
  }
  console.log(`ⓖ MSY      상한 ${on ? '**켬**' : '끔'}(T17_MSY) · 상한이 실제로 선 마을 ${capped}/${live}`);
  console.log(`           어촌 ${fv}곳 · 인구 ${fpop} · 어부 ${fishers} · 생선 재고 ${fstock.toFixed(1)} · 생선 가격 평균 ${fpN ? (fp / fpN).toFixed(3) : '—'}`);
}

// ── ⓗ [T60] 어장 눈금 — 잠재 어획 대 상한 ────────────────────────────────────
const SUS = R('server/sustain');
{
  const rows = [];
  for (const v of world.villages) {
    if (!(v.npcs || []).length) continue;
    const raw = +(v._fishRawLast || 0), cap = (v.land && v.land.fishSustain != null) ? +v.land.fishSustain : null;
    if (!(raw > 0)) continue;
    rows.push({ n: v.name, f: (v.counts && v.counts.fisher) || 0, raw: +raw.toFixed(2), cap,
                ratio: cap != null ? +(cap / raw).toFixed(2) : null, ema: +(v._fishRawEMA || 0).toFixed(2) });
  }
  rows.sort((a, b) => b.raw - a.raw);
  const rs = rows.filter((r) => r.ratio != null).map((r) => r.ratio).sort((a, b) => a - b);
  console.log(`\nⓗ 어장 눈금  모드 **${SUS.MSY_MODE}** · 헤드룸 ${SUS.MSY_HEADROOM} · 상한 스위치 T17_MSY=${process.env.T17_MSY === '1' ? '켬' : '끔'}`);
  console.log(`           어부가 있는 마을 ${rows.length} · 잠재 어획 최대 ${rows[0] ? rows[0].raw : 0} · 중앙 ${rows.length ? rows[Math.floor(rows.length / 2)].raw : 0}`);
  if (rs.length) {
    console.log(`           **상한÷잠재** 최소 ${rs[0]} · 중앙 ${rs[Math.floor(rs.length / 2)]} · 최대 ${rs[rs.length - 1]}   (랩 설계 의도 = 1.5~2)`);
    console.log(`           상한이 **무는**(비<1) 마을 ${rs.filter((x) => x < 1).length}/${rs.length}`);
  } else console.log('           상한 미적용(land.fishSustain 없음) — 비를 못 잰다');
  console.log('           ' + rows.slice(0, 6).map((r) => `${r.n}(어부${r.f} 잠재${r.raw}${r.cap != null ? ' 상한' + r.cap : ''})`).join(' · '));
}

// ── ⓘ [T60] 밀도 분해 ────────────────────────────────────────────────────────
{
  const byType = L.stats.byType || {};
  console.log(`\nⓘ 밀도 분해  사건 ${S.emitted} · 마을당 ${daysPer.toFixed(2)}일/건 (캐논 2~3일)`);
  console.log(`           유형 — ` + Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(' · '));
  const topS = topOf(shortByItem, 5).map(([r, c]) => `${ko(r)} ${c}`).join(' · ');
  console.log(`           부족 상위 — ${topS}   (도구 ${shortByItem.get('tool') || 0} · 소금 ${shortByItem.get('salt') || 0})`);
}

// ── ⓙ [T60] 사장 셋 — 켜면 무엇이 움직이나(표만) ─────────────────────────────
{
  let wN = 0, fN = 0, mN = 0, wS = 0, fS = 0;
  for (const s2 of seeds) {
    const lp = s2.lp || {};
    if (lp.woodSustain != null) { wN++; wS += lp.woodSustain; }
    if (lp.forageSustain != null) { fN++; fS += lp.forageSustain; }
    if (lp.marginalQ != null) mN++;
  }
  let lumber = 0, forager = 0;
  for (const v of world.villages) { lumber += (v.counts && v.counts.lumberjack) || 0; forager += (v.counts && v.counts.forager) || 0; }
  console.log(`\nⓙ 사장 셋   woodSustain 잰 마을 ${wN}(합 ${wS.toFixed(1)}) · forageSustain ${fN}(합 ${fS.toFixed(1)}) · marginalQ ${mN}`);
  console.log(`           지금 land 에 실린 것: wood ${world.villages.filter((v) => v.land && v.land.woodSustain != null).length} · forage ${world.villages.filter((v) => v.land && v.land.forageSustain != null).length} · marginalQ ${world.villages.filter((v) => v.land && v.land.marginalQ != null).length}  ← **전부 0 이면 사장**`);
  console.log(`           켜지면 물릴 대상 — 벌목꾼 ${lumber}명 · 채집꾼 ${forager}명 (어부 ${world.villages.reduce((a, v) => a + ((v.counts && v.counts.fisher) || 0), 0)}명과 같은 자리)`);
}

if (process.env.T17_JSON) {
  const out = {
    seed: SEED, days: DAYS, villages: seeds.length, live,
    axes: { tool: process.env.T17_TOOL !== '0', preserve: process.env.T17_PRESERVE !== '0', salt: process.env.T17_SALT !== '0' },
    base: { pop, dead, ever, weapQ: +weapQ.toFixed(0), expand, trades: world.tradeLog.length },
    board: { reqOpened: S.reqOpened, reqClosed: S.reqClosed, emitted: S.emitted, daysPer: +daysPer.toFixed(2) },
    short: Object.fromEntries(topOf(shortByItem, 30)), glut: Object.fromEntries(topOf(glutByItem, 30)),
    tool: { stock: +toolStock.toFixed(1), q: +toolQ.toFixed(1), short: shortByItem.get('tool') || 0 },
    preserve: { stock: +presStock.toFixed(1), trades: presTrades, amt: +presAmt.toFixed(1),
                each: Object.fromEntries(PRESERVED.map((r) => [r, +stockOf(r).toFixed(1)])) },
    msy: (() => {
      const on = process.env.T17_MSY === '1';
      let fv = 0, fpop = 0, fstock = 0, fp = 0, fpN = 0, capped = 0;
      const fishers = world.villages.reduce((a, v) => a + ((v.counts && v.counts.fisher) || 0), 0);
      for (const v of world.villages) {
        if (!(v.npcs || []).length) continue;
        if (v.land && v.land.fishSustain != null) capped++;
        if (!(((v.counts && v.counts.fisher) || 0) > 0)) continue;
        fv++; fpop += v.npcs.length; fstock += v.storage.fish || 0;
        try { const p = (econV2.computeShadowPrices(v) || {}).fish; if (p != null) { fp += p; fpN++; } } catch (e) {}
      }
      return { on, capped, fishVillages: fv, fishPop: fpop, fishers, fishStock: +fstock.toFixed(1), fishPrice: fpN ? +(fp / fpN).toFixed(4) : null };
    })(),
    fish: (() => {
      const rows = [];
      for (const v of world.villages) {
        if (!(v.npcs || []).length) continue;
        const raw = +(v._fishRawLast || 0), cap = (v.land && v.land.fishSustain != null) ? +v.land.fishSustain : null;
        if (raw > 0) rows.push({ name: v.name, fishers: (v.counts && v.counts.fisher) || 0, raw: +raw.toFixed(2), cap, ratio: cap != null ? +(cap / raw).toFixed(3) : null });
      }
      const rs = rows.filter((r) => r.ratio != null).map((r) => r.ratio).sort((a, b) => a - b);
      return { mode: SUS.MSY_MODE, headroom: SUS.MSY_HEADROOM, capOn: process.env.T17_MSY === '1',
               n: rows.length, ratioMin: rs[0] ?? null, ratioMed: rs.length ? rs[Math.floor(rs.length / 2)] : null,
               ratioMax: rs.length ? rs[rs.length - 1] : null, binding: rs.filter((x) => x < 1).length, rows: rows.slice(0, 20) };
    })(),
    salt: { coastStock: +cS.toFixed(1), inlandStock: +iS.toFixed(1), coastN: cN, inlandN: iN,
            coastPrice: +cAvg.toFixed(4), inlandPrice: +iAvg.toFixed(4),
            gap: cAvg > 0 ? +(iAvg / cAvg).toFixed(3) : null, trades: saltTrades, amt: +saltAmt.toFixed(1) },
  };
  fs.writeFileSync(process.env.T17_JSON, JSON.stringify(out, null, 2));
  console.log(`\n  JSON: ${process.env.T17_JSON}`);
}
try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
