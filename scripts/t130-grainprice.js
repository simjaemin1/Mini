#!/usr/bin/env node
// === scripts/t130-grainprice.js — 쌀·밀 가격 급등/급락의 원천 (T130 — T94 회부 ⓑ) ==========
//
// ★재민 요구(2026-09-05): "T86 세계 시드 1020 800일에서 쌀·밀 가격 급등/급락 사건의 원천을
//   귀속해라 — 식단 예산이 곡물 수요를 흔드는가 · 캐러밴 유입 시점인가 · 생곡→식량 환산인가."
//   **코드 0 · 표만.** 이 파일은 계측기다 — 러너 등재 표(`// @regress`)가 **없다**.
//
// ★세계 조립·사건 장부는 `scripts/t17-metrics.js` 와 **같은 순서·같은 정본 함수**다(사본 아님).
//   사건도 그 장부가 내는 **그 사건**이다(PRICE_UP/DOWN 0.70 · HYST 1.6) — 따로 판정하지 않는다.
//
// ★재는 법 — 가격은 `base × clamp((target/stock)^elast)` 하나다(`computeShadowPrices`).
//   그래서 사건의 원천은 **target 이 움직였나 · stock 이 움직였나** 둘 중 하나로 갈린다.
//   stock 을 움직이는 통로는 넷이고, 넷 다 **정본이 남긴 값에서 그대로 읽는다**:
//     ① prod  농부 부산물     `v.dailyProductionBuf[r]`
//     ② diet  식단 예산(T86)  `v._foodEaten[r]`
//     ③ subs  자급 인출        `_priceParamsV2(v,r).target / 30`
//              ⚠`tickSubsistence` 가 매일 조용히 빼 가는 몫이다(`SUBSISTENCE_PER_NPC[r] × N`).
//                표를 옮겨 적지 않으려고 **정본이 낸 target 에서 되읽는다**(target = subs × 30).
//     ④ car   캐러밴 유입/유출  `world.caravans` 원장(`arriveDay`·`returnArriveDay`·`departDay`)
//   나머지(세금·부패·잔여)는 **잔차**로 남긴다 — 지어내지 않는다.
//
// 실행: node scripts/t130-grainprice.js [일수=800] [시드=1020] [출력json]
//   LAB_SEEDCACHE=<경로>  시딩 캐시(51곳 `VillageLayout.generate` 전수 ~10분)
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t130-grain-${process.pid}.db`;
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 1020;
const OUT = process.argv[4] || '/tmp/t130/grainprice.json';
const GRAINS = ['wheat', 'rice', 'barley'];

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim'); const econV2 = R('sim/economy-sim-v2');
const VillageLayout = R('server/village-layout'); const Villages = R('server/villages');
const Events = R('server/events');
const P = Villages.__labProbe, Z = 'hanbando', ZONE = ZONES[Z], SZ = P.SZ;
P.setZoneId(Z);
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWaterTileLocal = (x, y) => { if (ZONE.isOcean) return true; if (!_inZone(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isTerrainBlockedLocal = (x, y) => (!_inZone(x, y)) ? true : (isRockTileLocal(x, y) || isWaterTileLocal(x, y));
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal, isWaterTileLocal });

// 시딩 — `t17-metrics.js` 와 같은 캐시 규약(결정론이라 값 동일 · 없으면 그대로 만든다)
const CACHE = process.env.LAB_SEEDCACHE || '';
let seeds = null;
if (CACHE && fs.existsSync(CACHE)) { try { seeds = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { seeds = null; } }
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
  if (CACHE) { try { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(seeds)); } catch (e) {} }
}
const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;
const vidOf = new Map(world.villages.map((v, i) => [v, i]));

// 사건 장부 — `t17-metrics.js` 와 **같은 설정**(그 계측기가 세는 그 사건이어야 한다)
const evs = [];
const L = Events.createLedger({
  econV2, vidOf: (v, i) => i, depositMap: Villages.playerVillageDepositMap(),
  cfg: { PRICE_UP: 0.70, PRICE_DOWN: 0.70, HYST: 1.6 },
  onEvent: (e) => { if ((e.type === 'PRICE_SPIKE' || e.type === 'PRICE_DROP') && GRAINS.indexOf(e.item) >= 0) evs.push(e); },
});
L.prime(world);

// ── 하루치 채널 기록 ─────────────────────────────────────────────────────────
const key = (vid, r, day) => vid + '|' + r + '|' + day;
const chan = new Map();      // key → 하루치 채널
const ema = new Map();       // (vid|item) → 장부와 같은 자기평균(α=1/30 · 판정 뒤 폴드)
const ratios = [];           // 일별 p/pEma — ⓓ 문턱 스윕용
const arrivals = [];         // 곡물 캐러밴 하역 (vid, item, day, amt) — ⓑ 시간 상관용
let _freshDay = -1, _freshCache = new Map();
const _freshOf = (v) => { if (_freshDay !== world.day) { _freshDay = world.day; _freshCache = new Map(); }
  let p = _freshCache.get(v); if (!p) { p = econV2.computeShadowPrices(v); _freshCache.set(v, p); } return p; };
// ★★캐러밴 회계는 **네 다리 전부**를 세야 한다(실측으로 배웠다).
//   ① 출발   `from` 이 `giveAmt`(=차감된 `N_units`)를 낸다
//   ② 도착   `to` 가 `giveAmt` 를 받는다
//   ③ **도착 그 자리에서 귀환 화물을 산다** — `to` 가 `_returningAmt` 를 **낸다**  ← 이걸 빠뜨렸었다
//   ④ 귀환   `from` 이 `_returningAmt` 를 받는다
//   ③이 크다: 실측에서 한 마을이 하루에 밀 **295.5개**를 귀환 화물로 내줬다(잔차 −296 의 정체).
//   ⚠원장 필드는 **되쓰인다**(같은 객체가 다리마다 갈아쓴다) — 그래서 날짜로 뒤늦게 재지 않고
//     **id·state 차분**으로 읽는다(틱 전 스냅샷 ↔ 틱 뒤 현재).
const _log = console.log; console.log = () => {};
let prevCar = new Map();
for (const c of (world.caravans || [])) prevCar.set(c.id, { state: c.state, from: c.from, to: c.to, giveRes: c.giveRes, giveAmt: c.giveAmt, rRes: c._returningRes, rAmt: c._returningAmt });
for (let d = 0; d < DAYS; d++) {
  const nextDay = world.day + 1;
  const pre = new Map();
  world.villages.forEach((v, i) => { for (const r of GRAINS) pre.set(key(i, r, nextDay), +(v.storage[r] || 0)); });
  econV2.tickWorldV2(world);
  L.scanDay(world, world.day, {});
  // ── 네 다리 차분 ───────────────────────────────────────────────────────────
  const carIn = new Map(), carOut = new Map(), nowCar = new Map();
  const add = (m, v0, r, amt) => { const vi = vidOf.get(v0); if (vi == null || !(amt > 0) || GRAINS.indexOf(r) < 0) return;
      const k = key(vi, r, world.day); m.set(k, (m.get(k) || 0) + amt);
      if (m === carIn) arrivals.push({ vid: vi, item: r, day: world.day, amt });   // ★ⓑ 시간 상관용 — 하역 원장
    };
  for (const c of (world.caravans || [])) {
    nowCar.set(c.id, { state: c.state, from: c.from, to: c.to, giveRes: c.giveRes, giveAmt: c.giveAmt, rRes: c._returningRes, rAmt: c._returningAmt });
    const p0 = prevCar.get(c.id);
    if (!p0) { add(carOut, c.from, c.giveRes, +c.giveAmt || 0); continue; }             // ① 출발(새 id)
    if (p0.state === 'outbound' && c.state !== 'outbound') {                             // ②③ 도착
      add(carIn, c.to, c.giveRes, +c.giveAmt || 0);
      add(carOut, c.to, c._returningRes, +c._returningAmt || 0);                         // ★귀환 화물 매입
    }
  }
  for (const [id, p0] of prevCar) {                                                      // ④ 귀환(사라진 id)
    if (nowCar.has(id)) continue;
    if (p0.state === 'inbound') add(carIn, p0.from, p0.rRes, +p0.rAmt || 0);
    else if (p0.state === 'outbound') { add(carIn, p0.to, p0.giveRes, +p0.giveAmt || 0); add(carOut, p0.to, p0.rRes, +p0.rAmt || 0); add(carIn, p0.from, p0.rRes, +p0.rAmt || 0); }
  }
  prevCar = nowCar;
  world.villages.forEach((v, i) => {
    const N = (v.npcs || []).length; if (!N) return;
    for (const r of GRAINS) {
      const k = key(i, r, world.day);
      const pp = econV2._priceParamsV2(v, r);
      const stock = +(v.storage[r] || 0), st0 = pre.get(key(i, r, world.day)) || 0;
      const prod = +((v.dailyProductionBuf || {})[r] || 0);
      const diet = +((v._foodEaten || {})[r] || 0);
      const subs = Math.min(pp.target / 30, st0);          // ★정본 target 에서 되읽는다(표 사본 0)
      const cIn = carIn.get(k) || 0, cOut = carOut.get(k) || 0;
      // ★가격을 **누가 찍었나** — 장부는 `pricesOf` 로 읽는데, 그 함수는 그 날 캐시가 있으면
      //   캐시를 준다(`_priceCacheDay === day`). 캐시는 `tickTradeV2` 가 틱 **앞머리**에서 뜨고,
      //   캐러밴 하역은 그 **뒤**다 ⇒ 캐시 날에는 **도착 직전의 빈 곳간**이 값으로 박힌다.
      const cacheHit = (v._priceCacheDay === world.day);
      // 장부가 본 값 그대로: 그 날 캐시가 있으면 캐시, 없으면 정본 재계산(`events.js pricesOf` 동형)
      const pSeen = (cacheHit && v._priceCache) ? (+v._priceCache[r] || 0) : (_freshOf(v)[r] || 0);
      const es = ema.get(i + '|' + r) || ema.set(i + '|' + r, { p: null, n: 0 }).get(i + '|' + r);
      const ratio = (es.p != null && es.n >= 30 && pSeen > 0.05) ? pSeen / es.p : null;   // PRICE_WIN 30 · PRICE_MIN 0.05
      if (ratio != null) ratios.push({ vid: i, item: r, day: world.day, ratio });
      if (pSeen > 0.05) { es.p = (es.p == null) ? pSeen : es.p * (29 / 30) + pSeen / 30; es.n++; }   // 판정 뒤 폴드(장부와 같은 순서)
      chan.set(k, { target: pp.target, stock, st0, N, cacheHit, p: +pSeen.toFixed(4),
        prod: +prod.toFixed(4), diet: +diet.toFixed(4), subs: +subs.toFixed(4),
        carIn: +cIn.toFixed(4), carOut: +cOut.toFixed(4),
        // 잔차 = 정본이 남긴 값으로 설명 안 되는 몫(세금 3% · 부패 · 기타) — 지어내지 않고 그대로 둔다
        resid: +((stock - st0) - prod + diet + subs - cIn + cOut).toFixed(4) });
    }
  });
}
console.log = _log;

// ── 귀속 ─────────────────────────────────────────────────────────────────────
// 사건 날의 가격은 **그 날 새로 계산된 값**이고, 장부는 그것을 자기 EMA(창 `PRICE_WIN`)와 견준다.
// 그래서 "무엇이 움직였나"는 **사건 직전 창**에서 각 통로가 재고를 얼마나 밀었나로 읽는다.
const WIN = parseInt(process.env.T130_WIN || '10', 10);    // 되짚는 창(일) — 손잡이(기본 10일)
// ★워밍업 제외 — 장부는 `PRICE_WIN`(30일) 만큼 자기평균을 채운 **뒤에야** 판정한다(`events.js` warm).
//   그래서 첫 판정일에 51마을 × 3곡물이 한꺼번에 터진다. 그건 세계가 아니라 **창이 열린 것**이다.
//   기본 60일(= 창 30 × 2)까지 잘라 낸다. 잘라 낸 수도 같이 적는다 — 숨기지 않는다.
const SKIP = parseInt(process.env.T130_SKIP || '60', 10);
const CH = ['prod', 'diet', 'subs', 'carIn', 'carOut', 'resid'];
const rows = [], warm = [];
for (const e of evs) {
  if (e.day <= SKIP) { warm.push(e); continue; }
  const acc = { prod: 0, diet: 0, subs: 0, carIn: 0, carOut: 0, resid: 0 };
  let st0 = null, st1 = null, tg0 = null, tg1 = null, N0 = null, N1 = null, miss = 0;
  for (let k = WIN - 1; k >= 0; k--) {
    const c = chan.get(key(e.vid, e.item, e.day - k));
    if (!c) { miss++; continue; }
    for (const ch of CH) acc[ch] += c[ch];
    if (st0 == null) { st0 = c.st0; tg0 = c.target; N0 = c.N; }
    st1 = c.stock; tg1 = c.target; N1 = c.N;
  }
  if (st0 == null) continue;
  // 가격 = base × (target/stock)^e  ⇒  Δlog p = e × (Δlog target − Δlog stock)
  const lg = (a, b) => (a > 0 && b > 0) ? Math.log(b / a) : 0;
  const dTarget = lg(tg0, tg1), dStock = lg(st0, st1);
  // 재고를 민 통로 중 절대값 최대 — 유입은 +, 유출은 −
  const signed = { prod: acc.prod, diet: -acc.diet, subs: -acc.subs, carIn: acc.carIn, carOut: -acc.carOut, resid: acc.resid };
  let top = null, topA = 0;
  for (const ch in signed) if (Math.abs(signed[ch]) > topA) { topA = Math.abs(signed[ch]); top = ch; }
  // 축: target 이 재고보다 더 움직였으면 인구(수요) 축이다
  const axis = Math.abs(dTarget) > Math.abs(dStock) ? 'target(인구)' : 'stock';
  const c0 = chan.get(key(e.vid, e.item, e.day)) || null;   // ★사건 **당일**의 한 줄(창과 따로 본다)
  rows.push({ day: e.day, vid: e.vid, name: (world.villages[e.vid] || {}).name, item: e.item, type: e.type,
    d0: c0 ? { st0: +c0.st0.toFixed(1), st1: +c0.stock.toFixed(1), prod: c0.prod, diet: c0.diet, subs: c0.subs, carIn: c0.carIn, carOut: c0.carOut, cacheHit: c0.cacheHit } : null,
    // ★계측 시점 결함: 캐시 날 + 그 날 유입이 커서 **찍힌 재고(st0)와 하루 끝 재고(stock)가 갈린 것**
    stale: !!(c0 && c0.cacheHit && c0.carIn > 0 && c0.stock > c0.st0 * 2 + 1),
    mag: e.mag, p: e.meta && e.meta.p, avg: e.meta && e.meta.avg,
    axis, top, dStockLog: +dStock.toFixed(3), dTargetLog: +dTarget.toFixed(3),
    st0: +st0.toFixed(1), st1: +st1.toFixed(1), N0, N1,
    win: Object.fromEntries(CH.map((c) => [c, +acc[c].toFixed(2)])) });
}

// ── 표 ───────────────────────────────────────────────────────────────────────
const pct = (n, d) => d ? (n / d * 100).toFixed(1) + '%' : '—';
console.log(`\n══ T130 — T94 회부 ⓑ — 쌀·밀 가격 사건의 원천 (T86 세계 · 시드 ${SEED} · ${DAYS}일 · 51마을) ══`);
console.log(`  사건 정의는 장부 정본 그대로: 자기 가격 EMA 대비 **±70%** 이탈(PRICE_UP/DOWN 0.70 · HYST 1.6)`);
console.log(`  되짚는 창 ${WIN}일 (T130_WIN) · 워밍업 ${SKIP}일 제외 (T130_SKIP · 장부 PRICE_WIN=30 의 2배)`);
console.log(`  손잡이: T86_DIET=${process.env.T86_DIET === '0' ? '끔' : '켬'} · T73_RAWGRAIN=${process.env.T73_RAWGRAIN === '0' ? '끔' : '켬'} · T100_FIELD_YIELD=${process.env.T100_FIELD_YIELD === '1' ? '켬' : '끔(T86 세계)'}`);
console.log(`  워밍업 창에서 잘라 낸 사건 ${warm.length}건 (창이 열린 첫날의 일제 발화 — 세계가 아니다)\n`);
console.log('── ⓐ 사건 수 ──');
for (const r of GRAINS) {
  const up = rows.filter((x) => x.item === r && x.type === 'PRICE_SPIKE').length;
  const dn = rows.filter((x) => x.item === r && x.type === 'PRICE_DROP').length;
  console.log(`  ${r.padEnd(7)} 급등 ${String(up).padStart(4)} · 급락 ${String(dn).padStart(4)} · 합 ${up + dn}`);
}
console.log(`  합계 ${rows.length}건 (장부가 낸 곡물 가격 사건 전부)`);

console.log('\n── ⓑ 축: 수요(target=인구)인가 재고인가 ──');
for (const a of ['stock', 'target(인구)']) {
  const n = rows.filter((x) => x.axis === a).length;
  console.log(`  ${a.padEnd(12)} ${String(n).padStart(4)}건  ${pct(n, rows.length)}`);
}

console.log('\n── ⓒ 재고를 민 통로 (사건 직전 창의 절대값 최대) ──');
const NAMES = { prod: '농부 부산물 생산', diet: '식단 예산(T86)', subs: '자급 인출(tickSubsistence)',
                carIn: '캐러밴 유입', carOut: '캐러밴 유출', resid: '잔차(세금·부패·기타)' };
for (const t of ['PRICE_SPIKE', 'PRICE_DROP']) {
  const sub = rows.filter((x) => x.type === t);
  console.log(`  [${t === 'PRICE_SPIKE' ? '급등' : '급락'} ${sub.length}건]`);
  const cnt = {};
  for (const x of sub) cnt[x.top] = (cnt[x.top] || 0) + 1;
  for (const ch of Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]))
    console.log(`    ${NAMES[ch].padEnd(24)} ${String(cnt[ch]).padStart(4)}건  ${pct(cnt[ch], sub.length)}`);
}

console.log('\n── ⓓ 통로별 창 합계 (전 사건 평균 · 단위 개) ──');
console.log('  ' + CH.map((c) => c.padStart(8)).join(' ') + '     ← + 는 유입, − 는 유출');
for (const t of ['PRICE_SPIKE', 'PRICE_DROP']) {
  const sub = rows.filter((x) => x.type === t); if (!sub.length) continue;
  const avg = CH.map((c) => (sub.reduce((a, x) => a + x.win[c], 0) / sub.length));
  console.log('  ' + avg.map((n) => n.toFixed(2).padStart(8)).join(' ') + `   [${t === 'PRICE_SPIKE' ? '급등' : '급락'}]`);
}

console.log('\n── ⓔ 표본 (급등·급락 각 6건) ──');
for (const t of ['PRICE_SPIKE', 'PRICE_DROP']) {
  for (const x of rows.filter((r2) => r2.type === t).slice(0, 6))
    console.log(`  d${String(x.day).padStart(3)} ${String(x.name).padEnd(6)} ${x.item.padEnd(6)} ${t === 'PRICE_SPIKE' ? '급등' : '급락'} ×${x.mag}` +
      `  재고 ${x.st0}→${x.st1}  N ${x.N0}→${x.N1}  축 ${x.axis}  주범 ${NAMES[x.top]}\n` +
      `        창(${WIN}일): ` + CH.map((c) => `${c} ${x.win[c]}`).join(' · ') +
      (x.d0 ? `\n        당일   : 재고 ${x.d0.st0}→${x.d0.st1} · prod ${x.d0.prod} · diet ${x.d0.diet} · subs ${x.d0.subs} · carIn ${x.d0.carIn} · carOut ${x.d0.carOut}` : ''));
}
console.log('\n── ⓔ-2 계측 시점 — 장부가 **캐러밴 하역 전** 값을 찍었나 ──');
{
  const st = rows.filter((x) => x.stale).length;
  const ch = rows.filter((x) => x.d0 && x.d0.cacheHit).length;
  const zero = rows.filter((x) => x.d0 && x.d0.st0 < 1 && x.d0.st1 > 10).length;
  console.log(`  캐시 날에 잡힌 사건        ${String(ch).padStart(4)} / ${rows.length}  ${pct(ch, rows.length)}`);
  console.log(`  ★그 중 **하역 전 빈 곳간**을 찍은 것  ${String(st).padStart(4)}  ${pct(st, rows.length)}`);
  console.log(`  당일 재고가 <1 에서 >10 으로 뛴 사건 ${String(zero).padStart(4)}  ${pct(zero, rows.length)}   ← 값과 세계가 갈린 자리`);
  for (const t of ['PRICE_SPIKE', 'PRICE_DROP']) {
    const sub = rows.filter((x) => x.type === t), n = sub.filter((x) => x.stale).length;
    console.log(`    ${t === 'PRICE_SPIKE' ? '급등' : '급락'} ${String(sub.length).padStart(4)}건 중 ${String(n).padStart(4)}건 ${pct(n, sub.length)}`);
  }
}
console.log('\n── ⓑ 캐러밴 유입 시점 — 하역과 가격 사건의 시간 상관 ──');
{
  // 마을·품목별 하역일 집합 → 사건마다 **가장 가까운 하역까지의 시차**
  const byVI = new Map();
  for (const a of arrivals) { const k = a.vid + '|' + a.item; (byVI.get(k) || byVI.set(k, []).get(k)).push(a.day); }
  for (const [, ds] of byVI) ds.sort((x, y) => x - y);
  const lagOf = (x) => { const ds = byVI.get(x.vid + '|' + x.item); if (!ds || !ds.length) return null;
    let best = null; for (const d of ds) { const l = d - x.day; if (best == null || Math.abs(l) < Math.abs(best)) best = l; } return best; };
  const H = {}; let none = 0, same = 0, near = 0;
  for (const x of rows) { const l = lagOf(x); if (l == null) { none++; continue; }
    const b = Math.max(-5, Math.min(5, l)); H[b] = (H[b] || 0) + 1; if (l === 0) same++; if (Math.abs(l) <= 1) near++; }
  console.log(`  하역이 한 번도 없던 마을·품목의 사건 ${none}건 (아래 표에서 제외)`);
  console.log('  시차(일)  ' + [-5,-4,-3,-2,-1,0,1,2,3,4,5].map((b) => String(b === -5 ? '≤-5' : b === 5 ? '≥+5' : b).padStart(6)).join(''));
  console.log('  건수      ' + [-5,-4,-3,-2,-1,0,1,2,3,4,5].map((b) => String(H[b] || 0).padStart(6)).join(''));
  console.log(`  ★**같은 날** 하역 ${same}건 ${pct(same, rows.length)} · **±1일 안** ${near}건 ${pct(near, rows.length)}`);
  const dropSame = rows.filter((x) => x.type === 'PRICE_DROP' && lagOf(x) === 0).length;
  const upSame = rows.filter((x) => x.type === 'PRICE_SPIKE' && lagOf(x) === 0).length;
  console.log(`    급락 중 같은 날 하역 ${dropSame} ${pct(dropSame, rows.filter((x) => x.type === 'PRICE_DROP').length)} · 급등 중 ${upSame} ${pct(upSame, rows.filter((x) => x.type === 'PRICE_SPIKE').length)}`);
}

console.log('\n── ⓓ 문턱 대 곡물의 자연 변동폭 ──');
{
  console.log(`  잰 날 ${ratios.length} (마을·품목·일 · 자기평균 30일 채운 뒤 · 시세 > 0.05)`);
  const q = (a, pq) => a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * pq)))];
  for (const r of GRAINS.concat(['(전체)'])) {
    const xs = ratios.filter((x) => r === '(전체)' || x.item === r).map((x) => x.ratio).sort((a, b) => a - b);
    if (!xs.length) continue;
    console.log(`  ${r.padEnd(8)} p/자기평균 분위 — 1% ${q(xs,0.01).toFixed(2)} · 5% ${q(xs,0.05).toFixed(2)} · 25% ${q(xs,0.25).toFixed(2)} · 50% ${q(xs,0.5).toFixed(2)} · 75% ${q(xs,0.75).toFixed(2)} · 95% ${q(xs,0.95).toFixed(2)} · 99% ${q(xs,0.99).toFixed(2)}`);
  }
  console.log('  문턱을 넓히면 몇 %가 남나 (진입 기준 · 히스테리시스 전):');
  console.log('    문턱      급등(>1+t)      급락(<1−t)        합');
  for (const t of [0.40, 0.55, 0.70, 0.90, 0.95]) {
    const up = ratios.filter((x) => x.ratio > 1 + t).length, dn = ratios.filter((x) => x.ratio < 1 - t).length;
    console.log(`    ±${(t * 100).toFixed(0).padStart(3)}   ${String(up).padStart(8)} ${pct(up, ratios.length).padStart(8)}  ${String(dn).padStart(8)} ${pct(dn, ratios.length).padStart(8)}   ${pct(up + dn, ratios.length).padStart(8)}` + (t === 0.70 ? '   ← 채택값' : ''));
  }
}

console.log('\n── ⓕ 진동 — 같은 마을·품목이 급등↔급락을 되풀이하는가 ──');
{
  const by = new Map();
  for (const x of rows) { const k = x.vid + '|' + x.item; (by.get(k) || by.set(k, []).get(k)).push(x); }
  const osc = [...by.entries()].map(([k, xs]) => {
    xs.sort((a, b) => a.day - b.day);
    let flips = 0; for (let i = 1; i < xs.length; i++) if (xs[i].type !== xs[i - 1].type) flips++;
    const gaps = []; for (let i = 1; i < xs.length; i++) gaps.push(xs[i].day - xs[i - 1].day);
    gaps.sort((a, b) => a - b);
    return { k, name: xs[0].name, item: xs[0].item, n: xs.length, flips,
      medGap: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null };
  }).sort((a, b) => b.flips - a.flips);
  const many = osc.filter((o) => o.flips >= 4);
  console.log(`  급등↔급락을 4번 이상 뒤집은 마을·품목 ${many.length} / ${osc.length}쌍`);
  for (const o of many.slice(0, 8)) console.log(`    ${o.name.padEnd(6)} ${o.item.padEnd(6)} 사건 ${String(o.n).padStart(3)}건 · 뒤집힘 ${String(o.flips).padStart(3)}회 · 사건 간격 중앙 ${o.medGap}일`);
  const allGaps = rows.length > 1 ? (() => { const g = []; for (const [, xs] of by) { xs.sort((a, b) => a.day - b.day); for (let i = 1; i < xs.length; i++) g.push(xs[i].day - xs[i - 1].day); } g.sort((a, b) => a - b); return g; })() : [];
  if (allGaps.length) console.log(`  전체 사건 간격 — 최소 ${allGaps[0]}일 · 중앙 ${allGaps[Math.floor(allGaps.length / 2)]}일 · 최대 ${allGaps[allGaps.length - 1]}일`);
}
try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); } catch (e) {}
fs.writeFileSync(OUT, JSON.stringify({ seed: SEED, days: DAYS, win: WIN, skip: SKIP, warm: warm.length, nRatios: ratios.length, nArrivals: arrivals.length,
  knobs: { T86_DIET: process.env.T86_DIET || '1', T73_RAWGRAIN: process.env.T73_RAWGRAIN || '1' },
  n: rows.length, rows }, null, 1));
console.log(`\n  → ${OUT}`);
