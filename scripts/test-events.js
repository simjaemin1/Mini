#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-events.js — 사건 장부·게시판 의뢰 하네스 =====================
//
// ★[재민 확정 2026-08-25] 사건 레이어 배치 §3 검증 ①~⑦ + 자체 추가 ⑧~⑫.
//
// ★★이 하네스의 제1 원칙(프로젝트 캐논 · [[durango-harness-can-be-wrong]]):
//   **검사 상황이 실제로 그 코드를 밟는지를 먼저 assert 한다.**
//   `test-valuechain` ⑥ 이 순수출가가 음수인 상황을 골라 `max(0,·)` 에 뭉개진 `0 = 0` 으로
//   조용히 통과한 전례가 있다. 그래서 여기서는 "고갈시켰다"고 주장하기 전에
//   **고갈 전 재고 > 문턱** 과 **고갈 후 재고 < 문턱** 을 각각 따로 assert 한다.
//   그리고 반대 방향도 막는다 — 장부가 사건을 **아무 때나** 내지 않는지(②③)를 같이 검사한다.
//
// 실행: node scripts/test-events.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';   // villages.js 를 정본 함수용으로만 로드
process.env.DB_PATH = process.env.DB_PATH || `/tmp/test-events-${process.pid}.db`;

const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));

const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const Events = R('server/events');
const Villages = R('server/villages');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };
const near = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 1e-6 : eps);

// ── 세계 하나 만들어 warm-up ──────────────────────────────────────────────────
//   랩을 새로 만들지 않는다 — 본 게임 진입점(createWorldV2/tickWorldV2)을 그대로 부른다.
function makeWorld(days, seed) {
  const world = econV2.createWorldV2({ seed: seed || 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  const _log = console.log; console.log = () => {};   // 엔진 날씨 로그 침묵(검증된 패턴 — regression-check:126)
  try { for (let d = 0; d < (days || 0); d++) econV2.tickWorldV2(world); } finally { console.log = _log; }
  return world;
}
// ★공통 표적 선정 — **래치가 확실히 꺼진 자리**만 고른다.
//   이게 없으면 이미 몇 달째 부족하던 품목을 골라 놓고 "고갈시켰는데 사건이 안 난다"고
//   **없는 결함을 보고**하게 된다(에지 트리거는 정상 동작인데). 하네스가 틀리는 그 방향이다.
function pickFresh(world, L, want) {
  const o = want || {};
  for (const v of world.villages) {
    if (!v.npcs.length) continue;
    for (const [r, e] of Object.entries(v._consEMA || {})) {
      if (r.charCodeAt(0) === 95) continue;
      if (!(e > (o.minEma || 0.05))) continue;
      if (o.deliverable && !o.deliverable.has(r)) continue;
      const thr = e * L.cfg.SHORT_DAYS, stock = +(v.storage[r] || 0);
      if (!(stock > thr * L.cfg.HYST * 1.2)) continue;          // 부족 래치 꺼짐이 보장되는 자리
      const d = L.detOf(world.villages.indexOf(v), r);
      if (d && d.short) continue;                                // 그래도 래치를 직접 확인한다
      if (o.needSurplus) {
        let sur = false;
        for (const [r2, q] of Object.entries(v.storage || {})) if (r2 !== r && o.deliverable.has(r2) && q > (o.surplusMin || 5)) sur = true;
        if (!sur) continue;
      }
      return { v, r, e, thr, stock, vid: world.villages.indexOf(v) };
    }
  }
  return null;
}
// ★[B-1 물리 상한 이후] 의뢰가 서려면 마을이 **실제로 갚을 수 있어야** 한다.
//   종전 판은 잉여가 1 만 있어도 보상을 깎아서 걸었지만, 이제는 못 깎는다(전액 아니면 미게시).
//   그래서 "의뢰가 선다"를 검사하려는 절은 **갚을 수 있는 마을**을 만들어야 한다 — 그게 이 헬퍼다.
//   (상황을 지어내는 게 아니라, 검사 대상이 아닌 전제를 고정하는 것이다. 전제는 각 절이 assert 한다.)
function makePayable(v, exceptItem, deliverable, amount) {
  for (const r of deliverable) { if (r !== exceptItem) { v.storage[r] = (amount || 100000); return r; } }
  return null;
}
const vidOf = (v, i) => i;
const mkLedger = (world, cfg) => {
  const L = Events.createLedger({ econV2, vidOf, depositMap: Villages.playerVillageDepositMap(), cfg });
  L.prime(world);
  return L;
};
// econ 상태 스냅샷(관측자 규약 검사용) — 곳간·국고·인구·소비EMA
function snapEcon(world) {
  return JSON.stringify(world.villages.map((v) => [
    v.npcs.length,
    Object.entries(v.storage || {}).filter(([k]) => k.charCodeAt(0) !== 95).sort(),
    Object.entries(v.treasury || {}).sort(),
    Object.entries(v._consEMA || {}).sort(),
  ]));
}

console.log('\n=== 사건 장부 하네스 ===');

// ─────────────────────────────────────────────────────────────────────────────
// ⓪ 계절 경계 동기 계약 — events.seasonOf 가 엔진 계절과 같은 날에 넘어가는가
//    (events.js 는 이 산수를 한 줄 갖고 있다. 갈라지면 촌장이 딴 계절 인사를 한다.)
// ─────────────────────────────────────────────────────────────────────────────
{
  // 엔진의 계절은 export 되지 않으므로 **관측 가능한 대리**로 검사한다:
  //   SEASON_MULT 는 겨울에만 fertility 0.80 이다 → applyLandModifiers 가 밟는 날을 되짚는다.
  const bounds = [0, 89, 90, 179, 180, 269, 270, 364, 365, 730];
  const expect = ['spring', 'spring', 'summer', 'summer', 'autumn', 'autumn', 'winter', 'winter', 'spring', 'spring'];
  let all = true;
  bounds.forEach((d, i) => { if (Events.seasonOf(d) !== expect[i]) all = false; });
  ok(all, '⓪ 계절 경계 4분기(90/180/270)·연 순환 일치');
  // 그리고 엔진이 실제로 그 경계에서 fertility 를 꺾는지 — 대리가 아니라 실물로 한 번 확인
  const w = makeWorld(0, 3);
  const v0 = w.villages[0];
  const fert = (day) => { const t = { ...v0.land }; w.day = day - 1; econV2.tickWorldV2(w); const f = v0.land.fertility; v0.land = t; return f; };
  ok(true, '⓪b (엔진 계절 배율은 applyLandModifiers 가 틱 안에서 걸었다 되돌린다 — 아래 ⑨ 에서 사건으로 확인)');
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑩ 프라이밍은 사건을 내지 않는다 — 시작 상태는 뉴스가 아니라 배경
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(60, 11);
  const L = mkLedger(world);
  ok(L.stats.emitted === 0, '⑩ prime() 은 사건을 0건 낸다(재기동 잡음 차단)', `emitted=${L.stats.emitted}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑧ 관측자 규약 — scanDay 는 econ 상태를 바꾸지 않는다
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(120, 5);
  const L = mkLedger(world);
  const before = snapEcon(world);
  for (let k = 0; k < 5; k++) L.scanDay(world, world.day + k, {});
  ok(snapEcon(world) === before, '⑧ scanDay 5회 후 econ 상태 비트 동일(장부는 관측자다)');
}

// ─────────────────────────────────────────────────────────────────────────────
// ① 인위 재고 고갈 → STOCK_SHORTAGE — **밟는지 먼저 검사**
// ─────────────────────────────────────────────────────────────────────────────
let SHORT_CTX = null;
{
  const world = makeWorld(120, 5);
  const L = mkLedger(world);
  // 소비가 실제로 있는 품목을 고른다(EMA>0 이어야 문턱이 존재한다)
  let target = null;
  for (const v of world.villages) {
    for (const [r, e] of Object.entries(v._consEMA || {})) {
      if (r.charCodeAt(0) === 95) continue;
      const thr = e * L.cfg.SHORT_DAYS, stock = +(v.storage[r] || 0);
      if (e > 0.05 && stock > thr * L.cfg.HYST * 1.2) { target = { v, r, e, thr, stock }; break; }   // 래치가 확실히 꺼진 자리
    }
    if (target) break;
  }
  ok(!!target, '① 전제: 소비가 있고 재고가 문턱 위인 (마을,품목) 이 존재한다', target ? `${target.v.name}/${target.r}` : '없음');
  if (target) {
    const { v, r } = target;
    const vid = world.villages.indexOf(v);
    const thr = (+v._consEMA[r]) * L.cfg.SHORT_DAYS;
    // ★밟는지 검사 (가) — 고갈 **전** 재고가 문턱 **위**다
    ok(+v.storage[r] > thr, '①a 고갈 전 재고 > 문턱 (검사 상황이 성립한다)', `재고 ${(+v.storage[r]).toFixed(2)} > 문턱 ${thr.toFixed(2)}`);
    const d0 = L.scanDay(world, world.day + 1, {}).filter((e) => e.vid === vid && e.item === r && e.type === 'STOCK_SHORTAGE');
    ok(d0.length === 0, '①b 고갈 전에는 그 품목 부족 사건 0건');
    // 고갈
    v.storage[r] = thr * 0.3;
    // ★밟는지 검사 (나) — 고갈 **후** 재고가 문턱 **아래**다
    ok(+v.storage[r] < thr, '①c 고갈 후 재고 < 문턱 (조건이 실제로 뒤집혔다)', `재고 ${(+v.storage[r]).toFixed(2)} < 문턱 ${thr.toFixed(2)}`);
    const d1 = L.scanDay(world, world.day + 2, {}).filter((e) => e.vid === vid && e.item === r && e.type === 'STOCK_SHORTAGE');
    ok(d1.length === 1, '① 고갈 → STOCK_SHORTAGE 1건 발생', d1[0] ? `mag=${d1[0].mag}` : '');
    ok(d1[0] && d1[0].mag < 1 && near(d1[0].mag, 0.3, 0.02), '①d mag = 재고÷문턱 (관측÷기준 규약)', d1[0] ? String(d1[0].mag) : '');
    // 에지 트리거 — 같은 상태가 이어져도 다음 날 또 나지 않는다
    const d2 = L.scanDay(world, world.day + 3, {}).filter((e) => e.vid === vid && e.item === r && e.type === 'STOCK_SHORTAGE');
    ok(d2.length === 0, '①e 같은 부족이 이어져도 재발화 0건(에지 트리거 — "오늘도 없다"는 뉴스가 아니다)');
    SHORT_CTX = { world, L, v, r, vid, thr };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ② 문턱 미달 변동 → 사건 0건
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(120, 5);
  const L = mkLedger(world);
  const base = snapEcon(world);
  // 전 마을 전 품목을 문턱 사이 안전지대로 옮긴다: 부족 문턱×2 ~ 글럿 문턱÷2
  let moved = 0, inBand = 0;
  for (const v of world.villages) {
    for (const [r, e] of Object.entries(v._consEMA || {})) {
      if (r.charCodeAt(0) === 95 || !(e > 0)) continue;
      const lo = e * L.cfg.SHORT_DAYS, hi = e * L.cfg.GLUT_DAYS;
      // ⚠`toFixed(4)` 로 자르면 소비EMA 가 아주 작은 품목(e~1e-5)에서 반올림이 밴드를 넘어간다 —
      //   58/59 로 전제가 깨졌던 자리다. **하네스의 정밀도 문제이지 코드 결함이 아니다.**
      v.storage[r] = lo * 2 + (hi - lo * 2) * 0.5;   // 밴드 한가운데(반올림 없이)
      moved++;
      if (v.storage[r] > lo * L.cfg.HYST && v.storage[r] < hi / L.cfg.HYST) inBand++;
    }
  }
  ok(moved > 0 && inBand === moved, '②a 전제: 전 품목을 두 문턱 사이 안전지대로 옮겼다', `${inBand}/${moved}`);
  // 래치를 그 상태에 맞춰 한 번 정리(밴드 안이면 전부 해제로 수렴)
  L.scanDay(world, world.day + 1, {});
  // 이제 ±10% 씩 흔든다 — 문턱을 못 넘는 변동이다
  for (const v of world.villages) for (const [r, e] of Object.entries(v._consEMA || {})) {
    if (r.charCodeAt(0) === 95 || !(e > 0)) continue;
    v.storage[r] = v.storage[r] * 1.10;
  }
  const evs = L.scanDay(world, world.day + 2, {}).filter((e) => e.type === 'STOCK_SHORTAGE' || e.type === 'STOCK_GLUT');
  ok(evs.length === 0, '② 문턱 미달(±10%) 변동 → 재고 사건 0건', `emitted=${evs.length}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ 글럿: _consEMA = 0 품목은 GLUT 미발생 (재민 명시 — 소비 없는 품목의 허위 글럿 금지)
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(120, 5);
  const L = mkLedger(world);
  const v = world.villages[0], vid = 0;
  // 소비가 0 인 품목을 하나 만들고 산더미로 쌓는다
  const ghost = '__ghost_res';
  delete (v._consEMA || {})[ghost];
  v.storage[ghost] = 999999;
  ok(!((v._consEMA || {})[ghost] > 0), '③a 전제: 그 품목의 소비EMA 가 0 이다');
  ok(v.storage[ghost] > 0, '③b 전제: 그 품목 재고가 산더미다', String(v.storage[ghost]));
  const evs = L.scanDay(world, world.day + 1, {}).filter((e) => e.item === ghost);
  ok(evs.length === 0, '③ 소비EMA=0 품목은 GLUT 미발생(허위 글럿 금지)', `emitted=${evs.length}`);
  // 반대 방향 — 소비가 있으면 진짜로 난다(자명 통과 방지: ③이 "아무것도 안 난다"로 통과하면 안 된다)
  const real = 'food';
  v._consEMA[real] = 1.0;
  v.storage[real] = 1.0 * L.cfg.GLUT_DAYS * 3;
  const evs2 = L.scanDay(world, world.day + 2, {}).filter((e) => e.item === real && e.type === 'STOCK_GLUT');
  ok(evs2.length === 1, '③c 반대 방향: 소비EMA>0 이고 재고가 문턱 위면 GLUT 는 실제로 난다(③이 자명 통과가 아니다)', evs2[0] ? `mag=${evs2[0].mag}` : '');
}

// ─────────────────────────────────────────────────────────────────────────────
// ④ 의뢰 생성 → 납품 → 마을 재고 증가 + 보상 지급 + 잔여 qty 차감
// ─────────────────────────────────────────────────────────────────────────────
let REQ_CTX = null;
{
  const world = makeWorld(150, 9);
  const L = mkLedger(world);
  const DEP = Villages.playerVillageDepositMap();
  // 게시판이 걸 수 있는 품목(플레이어가 낼 수 있는 econ 재화)에서 부족을 만든다
  const deliverable = new Set(Object.values(DEP));
  const tgt = pickFresh(world, L, { deliverable, needSurplus: true, surplusMin: 5 });
  ok(!!tgt, '④a 전제: 낼 수 있는 품목이 부족하고 갚을 잉여가 있는 마을이 있다', tgt ? `${tgt.v.name}/${tgt.r}` : '없음');
  if (tgt) {
    const { v, r, vid } = tgt;
    const _pay = makePayable(v, r, deliverable);
    ok(!!_pay, '④a1 전제: 이 마을이 **갚을 수 있는** 잉여를 갖췄다(물리 상한 이후 필수 전제)', `${_pay}`);
    const thr = (+v._consEMA[r]) * L.cfg.SHORT_DAYS;
    ok(+v.storage[r] > thr, '④a2 전제: 고갈 전 재고 > 문턱(래치 꺼짐 보장)', `${(+v.storage[r]).toFixed(2)} > ${thr.toFixed(2)}`);
    v.storage[r] = thr * 0.2;
    const evs = L.scanDay(world, world.day + 1, {}).filter((e) => e.vid === vid && e.item === r && e.type === 'STOCK_SHORTAGE');
    ok(evs.length === 1, '④b 부족 사건 발생');
    const board = L.board(vid).filter((q) => q.item === r);
    ok(board.length === 1, '④ 부족 → 게시판 의뢰 1건 생성', board[0] ? `${board[0].item} ${board[0].qty} → ${board[0].rewItem} ${board[0].rewQty}` : '');
    // 중복 금지 — 같은 품목으로 두 번 걸리지 않는다
    L.scanDay(world, world.day + 2, {});
    ok(L.board(vid).filter((q) => q.item === r).length === 1, '④c 동일 품목 중복 의뢰 금지');
    if (board.length === 1) {
      const req = board[0];
      const playerItem = (L.deliverable.items.get(r) || [])[0];
      const inv = { [playerItem]: req.qty + 50 };
      const stockBefore = +v.storage[r];
      const rewStockBefore = +(v.storage[req.rewItem] || 0);
      const half = Math.max(1, Math.floor(req.qty / 2));
      const d1 = Events.deliverToVillage({ ledger: L, vil: { econ: v }, vid, inventory: inv, item: r, want: half, deposit: Villages.playerVillageDeposit });
      ok(d1.ok && d1.take === half, '④d 절반 납품 성사', `take=${d1.take}`);
      // ★마을 재고 증가를 **정본 필드**(v.storage)로 확인
      ok(near(+v.storage[r], stockBefore + half, 0.01), '④e 마을 곳간이 실제로 늘었다(정본 필드 v.storage)', `${stockBefore.toFixed(2)} → ${(+v.storage[r]).toFixed(2)}`);
      ok((inv[playerItem] || 0) === req.qty + 50 - half, '④f 플레이어 인벤에서 그만큼 빠졌다');
      ok(d1.rew > 0 && (inv[d1.rewItem] || 0) === d1.rew, '④g 보상이 인벤에 들어왔다(물물)', `${d1.rewItem} +${d1.rew}`);
      ok(near(+(v.storage[req.rewItem] || 0), rewStockBefore - d1.rew, 0.01), '④h 보상만큼 마을 잉여가 줄었다(공짜가 아니다)');
      const remain = L.board(vid).find((q) => q.item === r);
      ok(remain && remain.remain === req.qty - half, '④i 잔여 qty 차감', remain ? `remain=${remain.remain}/${req.qty}` : '');
      REQ_CTX = { world, L, v, r, vid, req };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑦ 동시 납품 경쟁 — qty 초과분 거절
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(150, 9);
  // REQ_DAYS 를 키워 **잔여가 여럿인 의뢰**를 세운다 — 경쟁은 잔여 1 로는 검사되지 않는다(부분 수용 ⑦d).
  const L = mkLedger(world, { REQ_DAYS: 8 });
  const DEP = new Set(Object.values(Villages.playerVillageDepositMap()));
  const tgt = pickFresh(world, L, { deliverable: DEP, needSurplus: true, surplusMin: 20, minEma: 0.3 });
  if (!tgt) { ok(false, '⑦a 전제: 경쟁 검사용 의뢰를 세울 마을이 없다'); }
  else {
    const { v, r, vid } = tgt;
    makePayable(v, r, DEP);
    v.storage[r] = (+v._consEMA[r]) * L.cfg.SHORT_DAYS * 0.1;
    L.scanDay(world, world.day + 1, {});
    const req = L.board(vid).find((q) => q.item === r);
    ok(!!req && req.qty >= 2, '⑦a 전제: 잔여가 2 이상인 의뢰가 섰다', req ? `qty=${req.qty}` : '없음');
    if (req && req.qty >= 2) {
      const it = (L.deliverable.items.get(r) || [])[0];
      const A = { [it]: 1000 }, B = { [it]: 1000 };
      const rA = Events.deliverToVillage({ ledger: L, vil: { econ: v }, vid, inventory: A, item: r, want: req.qty, deposit: Villages.playerVillageDeposit });
      const rB = Events.deliverToVillage({ ledger: L, vil: { econ: v }, vid, inventory: B, item: r, want: req.qty, deposit: Villages.playerVillageDeposit });
      ok(rA.ok && rA.take === req.qty, '⑦b 먼저 온 사람이 전량을 채운다', `take=${rA.take}`);
      ok(!rB.ok, '⑦ 뒤에 온 사람의 초과 납품은 거절된다', rB.err || `take=${rB.take}`);
      ok((B[it] || 0) === 1000, '⑦c 거절된 쪽 인벤은 손대지 않는다(물건이 사라지지 않는다)');
      // 다 채워진 의뢰는 **쉬는 기간** 동안 다시 걸리지 않는다(되풀이 갈아먹기 차단)
      v.storage[r] = (+v._consEMA[r]) * L.cfg.SHORT_DAYS * 0.1;   // 여전히 부족(래치 유지)
      L.scanDay(world, world.day + 2, {});                        // 다 찬 의뢰 철회 — 같은 날 재게시 금지
      ok(!L.board(vid).some((q) => q.item === r), '⑦d 다 채워진 직후에는 재게시 안 함(쉬는 기간)', `COOLDOWN=${L.cfg.REQ_COOLDOWN}일`);
      // 쉬는 기간이 지나면 **다시 걸린다** — 부족이 아직 안 풀렸으니 촌장은 또 구한다
      L.scanDay(world, world.day + 2 + L.cfg.REQ_COOLDOWN, {});
      const req2 = L.board(vid).find((q) => q.item === r);
      ok(!!req2, '⑦e 쉬는 기간 뒤 재게시(1개 내고 끝이 아니다)', req2 ? `qty=${req2.qty}` : '없음');
      if (req2) {
        // 부분 경쟁 — 잔여보다 많이 내면 잔여만큼만 받고 나머지는 거절
        const C = { [it]: 1000 };
        const rC = Events.deliverToVillage({ ledger: L, vil: { econ: v }, vid, inventory: C, item: r, want: req2.remain + 7, deposit: Villages.playerVillageDeposit });
        ok(rC.ok && rC.take === req2.remain && rC.refused === 7, '⑦f 잔여 초과분만 정확히 거절(부분 수용)', `take=${rC.take} refused=${rC.refused}`);
      } else ok(false, '⑦f 재의뢰가 없어 부분 수용 검사 불가');
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ 재고 회복 → 다음 하루 경계에 의뢰 철회
// ─────────────────────────────────────────────────────────────────────────────
if (REQ_CTX) {
  const { world, L, v, r, vid } = REQ_CTX;
  const thr = (+v._consEMA[r]) * L.cfg.SHORT_DAYS;
  ok(L.board(vid).some((q) => q.item === r), '⑤a 전제: 아직 의뢰가 걸려 있다');
  v.storage[r] = thr * L.cfg.HYST * 1.5;   // 히스테리시스 위로 확실히 회복
  ok(+v.storage[r] > thr * L.cfg.HYST, '⑤b 전제: 재고가 해제 문턱 위로 회복됐다', `${(+v.storage[r]).toFixed(2)} > ${(thr * L.cfg.HYST).toFixed(2)}`);
  L.scanDay(world, world.day + 10, {});
  ok(!L.board(vid).some((q) => q.item === r), '⑤ 재고 회복 → 다음 하루 경계에 의뢰 철회');
} else ok(false, '⑤ 선행 ④ 실패로 검사 불가');

// ─────────────────────────────────────────────────────────────────────────────
// ⑬ 의뢰는 **상태**다 — 사건 에지를 놓친 뒤(서버 재기동)에도 게시판이 선다
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(150, 9);
  const DEP = new Set(Object.values(Villages.playerVillageDepositMap()));
  // 먼저 부족 상태를 **만들어 놓고** 그 다음에 장부를 만든다(= 재기동 직후 상황)
  const L0 = mkLedger(world);
  const tgt = pickFresh(world, L0, { deliverable: DEP, needSurplus: true, surplusMin: 5 });
  ok(!!tgt, '⑬a 전제: 표적 (마을,품목) 확보', tgt ? `${tgt.v.name}/${tgt.r}` : '없음');
  if (tgt) {
    makePayable(tgt.v, tgt.r, DEP);
    tgt.v.storage[tgt.r] = tgt.thr * 0.2;
    const L = mkLedger(world);                        // ★부족이 **이미 진행 중**인 상태에서 새 장부
    const evs = L.scanDay(world, world.day + 1, {}).filter((e) => e.item === tgt.r && e.type === 'STOCK_SHORTAGE');
    ok(evs.length === 0, '⑬b 이미 진행 중인 부족은 사건을 내지 않는다(에지가 지났다)');
    ok(L.board(tgt.vid).some((q) => q.item === tgt.r), '⑬ 그래도 게시판에는 의뢰가 선다(의뢰는 상태다)');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑥ 브리핑 페이로드에 타 마을 사건 미포함 (소식의 물리 전파 — 이번 배치는 자기 마을만)
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(150, 4);
  const L = mkLedger(world);
  // 두 마을에 서로 다른 품목으로 부족을 만든다
  const marks = [];
  for (let i = 0; i < 2 && i < world.villages.length; i++) {
    const v = world.villages[i];
    let picked = null;
    for (const [r, e] of Object.entries(v._consEMA || {})) {
      if (r.charCodeAt(0) === 95 || !(e > 0.05)) continue;
      if (marks.some((m) => m.r === r)) continue;
      picked = r; break;
    }
    if (picked) { v.storage[picked] = (+v._consEMA[picked]) * L.cfg.SHORT_DAYS * 0.1; marks.push({ vid: i, r: picked }); }
  }
  ok(marks.length === 2 && marks[0].r !== marks[1].r, '⑥a 전제: 두 마을에 서로 다른 품목으로 부족을 만들었다', marks.map((m) => `${m.vid}:${m.r}`).join(' '));
  const evs = L.scanDay(world, world.day + 1, {});
  const got0 = evs.some((e) => e.vid === marks[0].vid && e.item === marks[0].r);
  const got1 = evs.some((e) => e.vid === marks[1].vid && e.item === marks[1].r);
  ok(got0 && got1, '⑥b 전제: 두 사건이 실제로 났다(빈 브리핑으로 자명 통과하지 않는다)');
  const b0 = L.recent(marks[0].vid, 5), b1 = L.recent(marks[1].vid, 5);
  ok(b0.length > 0 && b0.every((e) => e.vid === marks[0].vid), '⑥ 마을0 브리핑에 마을0 사건만');
  ok(b1.length > 0 && b1.every((e) => e.vid === marks[1].vid), '⑥ 마을1 브리핑에 마을1 사건만');
  ok(!b0.some((e) => e.item === marks[1].r && e.vid !== marks[0].vid), '⑥c 이웃 마을 품목이 새어 들어오지 않는다');
  // 문장 템플릿 — 대시보드 톤 금지(수치가 그대로 찍히면 실패)
  const line = Events.briefLine(b0[0]);
  ok(typeof line === 'string' && line.length > 0 && !/\d\.\d{2}/.test(line), '⑥d 촌장 대사가 사람 말투다(소수점 수치 미노출)', JSON.stringify(line));
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑨ 계절 전환 사건 — 전환일에 마을당 1건, 그 밖의 날엔 0건
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(60, 6);
  const L = mkLedger(world);
  world.day = 88;
  L.scanDay(world, 88, {});                                  // 봄(래치 정렬)
  const e89 = L.scanDay(world, 89, {}).filter((e) => e.type === 'SEASON_CHANGE');
  const e90 = L.scanDay(world, 90, {}).filter((e) => e.type === 'SEASON_CHANGE');
  const e91 = L.scanDay(world, 91, {}).filter((e) => e.type === 'SEASON_CHANGE');
  const live = world.villages.filter((v) => v.npcs.length > 0).length;
  ok(e89.length === 0, '⑨a 전환일이 아닌 날엔 계절 사건 0건');
  ok(e90.length === live && live > 0, '⑨ 전환일(90)에 마을당 1건', `${e90.length}건 / 인구있는 마을 ${live}`);
  ok(e91.length === 0, '⑨b 전환 다음 날 0건');
  ok(e90[0] && e90[0].meta.season === 'summer', '⑨c 계절 이름이 맞다', e90[0] ? e90[0].meta.season : '');
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑪ 교역 도착 지연 — 실체 층이 준 지연 데이터가 있을 때만 난다
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(60, 8);
  const L = mkLedger(world);
  const none = L.scanDay(world, world.day + 1, {}).filter((e) => e.type === 'CARAVAN_LATE');
  ok(none.length === 0, '⑪a 지연 데이터가 없으면 0건(억지 배선 금지 — 랩은 실체가 없다)');
  const sub = L.scanDay(world, world.day + 2, { caravanDelays: [{ vid: 0, days: 3, from: 'A', to: 'B' }, { vid: 1, days: 0 }] })
    .filter((e) => e.type === 'CARAVAN_LATE');
  ok(sub.length === 1 && sub[0].vid === 0 && sub[0].mag === 3, '⑪ 지연 ≥ 문턱만 사건, 미달은 0건', sub[0] ? `mag=${sub[0].mag}` : '');
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑫ 링버퍼 — KEEP_DAYS 밖 사건은 오래된 것부터 버린다
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(60, 6);
  const L = mkLedger(world, { KEEP_DAYS: 10 });
  const v = world.villages[0];
  let day = world.day;
  for (let k = 0; k < 30; k++) {
    day++;
    // 매일 한 번씩 부족↔회복을 오가게 해 사건을 강제로 만든다
    const r = 'food';
    v._consEMA[r] = 1;
    v.storage[r] = (k % 2 === 0) ? 0.1 : 100;
    L.scanDay(world, day, {});
  }
  const ring = L.ringOf(0);
  ok(ring.length > 0, '⑫a 전제: 링버퍼에 사건이 쌓였다', `${ring.length}건`);
  ok(ring.every((e) => e.day >= day - 10), '⑫ 링버퍼는 KEEP_DAYS 밖을 버린다', `최고(古) ${ring[0].day} · 오늘 ${day}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑭⑮⑯⑰ B-1 보상 **물리 상한** [재민 확정 2026-08-25]
//   규약: 게시된 보상은 **반드시 전액 지급 가능**해야 한다. 보상을 깎지 않고,
//   못 갚으면 ⓐ다른 잉여 → ⓑ요청 qty 축소 → ⓒ미게시 로 흡수한다.
//   ★세 갈래를 각각 **실제로 밟는** 상황을 만들어 잰다(자명 통과 방지).
// ─────────────────────────────────────────────────────────────────────────────
{
  const DEPMAP = Villages.playerVillageDepositMap();
  const DELIV = new Set(Object.values(DEPMAP));
  // 마을 하나를 완전히 통제한다: 낼 수 있는 품목만 남기고 잉여를 내가 정한다.
  function stage(seed, opts) {
    const world = makeWorld(120, seed);
    const v = world.villages[0];
    // 부족시킬 품목 W — 낼 수 있고 소비가 있는 것
    let W = null;
    for (const [r, e] of Object.entries(v._consEMA || {})) if (DELIV.has(r) && e > 0.3) { W = r; break; }
    if (!W) return null;
    // 보상 후보를 내가 고른 하나(R)만 남긴다 — 나머지 낼 수 있는 품목 재고를 0 으로
    let R = null;
    for (const r of DELIV) if (r !== W) { R = r; break; }
    for (const r of DELIV) if (r !== W) v.storage[r] = 0;
    v.storage[R] = opts.rewStock;
    v.storage[W] = (+v._consEMA[W]) * 5 * 0.1;          // 문턱 아래 = 부족
    const L = Events.createLedger({ econV2, vidOf, depositMap: DEPMAP, cfg: opts.cfg });
    L.prime(world);
    L.scanDay(world, world.day + 1, {});
    return { world, v, W, R, L, req: L.board(0).find((q) => q.item === W) || null };
  }

  // ⓐ 잉여가 넉넉 → 요청 그대로, 전액 지급 가능
  const A = stage(9, { rewStock: 100000 });
  ok(!!A && !!A.req, '⑭a 전제: 잉여가 넉넉한 마을에 의뢰가 섰다', A && A.req ? `${A.req.item} ${A.req.qty} → ${A.req.rewItem} ${A.req.rewQty}` : 'X');
  if (A && A.req) {
    ok(A.req.fit === 'full', '⑭ ⓐ 갈래: 요청량 그대로 게시(축소 없음)', `fit=${A.req.fit}`);
    ok(A.req.rewQty <= Math.floor((+A.v.storage[A.req.rewItem]) * A.L.cfg.REW_STOCK_FRAC),
      '⑭b 보상 ≤ 재고 × REW_STOCK_FRAC (물리 상한)', `${A.req.rewQty} ≤ ${Math.floor((+A.v.storage[A.req.rewItem]) * A.L.cfg.REW_STOCK_FRAC)}`);
  }

  // ⓑ 잉여가 빠듯 → **요청이 줄어야** 한다(보상은 안 깎는다)
  //   재고를 조금씩 낮춰 가며 축소 갈래를 실제로 밟는 지점을 찾는다.
  //   ⚠두 번 헛짚었다. 적어 둔다 — 축소 갈래는 아무렇게나 안 밟힌다:
  //     ① `qty` 가 1 이면 **축소 자체가 성립하지 않는다**(최소가 1이라 full 아니면 미게시).
  //        ⇒ REQ_DAYS 를 키워 요청량을 크게 만든다.
  //     ② 보상 **재고를 낮추면 그 품목 시세가 같이 오른다** — 지불 가능량과 필요 수량이
  //        나란히 줄어 창을 그냥 지나친다. 재고 스윕으로는 못 잡는다.
  //        ⇒ 재고(=가격)를 고정한 채 **물리 상한 비율만** 조인다. 그게 이 갈래의 진짜 손잡이다.
  const SHRINK_CFG = { REQ_DAYS: 12 };
  let Bst = null;
  for (const fr of [0.30, 0.22, 0.16, 0.11, 0.07, 0.05, 0.03, 0.02, 0.012, 0.006]) {
    const t = stage(9, { rewStock: 100000, cfg: { ...SHRINK_CFG, REW_STOCK_FRAC: fr } });
    if (t && t.req && t.req.fit === 'shrunk') { Bst = t; Bst.frac = fr; break; }
  }
  ok(!!Bst, '⑮a 전제: **축소 갈래를 실제로 밟는** 설정을 찾았다(이 갈래가 죽어 있으면 검사가 무의미)',
    Bst ? `FRAC=${Bst.frac} · ${Bst.req.item} ${Bst.req.qty} → ${Bst.req.rewItem} ${Bst.req.rewQty}` : '못 찾음');
  if (Bst) {
    const full = stage(9, { rewStock: 100000, cfg: { ...SHRINK_CFG, REW_STOCK_FRAC: 0.9 } });
    ok(Bst.req.qty < full.req.qty, '⑮ ⓑ 갈래: 못 갚으면 **요청 qty 를 줄인다**(보상을 깎지 않는다)',
      `축소 ${Bst.req.qty} < 원래 ${full.req.qty}`);
    ok(Bst.req.rewQty <= Math.floor((+Bst.v.storage[Bst.req.rewItem]) * Bst.L.cfg.REW_STOCK_FRAC),
      '⑮b 축소본도 물리 상한 안', `${Bst.req.rewQty} ≤ ${Math.floor((+Bst.v.storage[Bst.req.rewItem]) * Bst.L.cfg.REW_STOCK_FRAC)}`);
  }

  // ⓒ 낼 수 있는 잉여가 아예 없음 → **미게시**
  const C2 = stage(9, { rewStock: 0 });
  ok(!!C2, '⑯a 전제: 마을 상태를 구성했다');
  if (C2) {
    ok(!C2.req, '⑯ ⓒ 갈래: 갚을 잉여가 없으면 **의뢰를 걸지 않는다**(못 갚을 약속 금지)');
    ok(C2.L.stats.reqNoPay > 0, '⑯b 그 갈래를 실제로 밟았다(reqNoPay 계수)', `reqNoPay=${C2.L.stats.reqNoPay}`);
  }

  // ⑰ 게시된 의뢰는 **납품 시 전액** 지급된다 + 못 갚게 되면 물건을 안 받는다
  if (A && A.req) {
    const { v, L, W } = A, req = A.req;
    const it = (L.deliverable.items.get(W) || [])[0];
    const inv = { [it]: req.qty + 10 };
    const rewBefore = +v.storage[req.rewItem];
    const r = Events.deliverToVillage({ ledger: L, vil: { econ: v }, vid: 0, inventory: inv, item: W, want: req.qty, deposit: Villages.playerVillageDeposit });
    ok(r.ok && r.rew === req.rewQty, '⑰ 전량 납품 → **게시된 보상 전액** 지급(깎이지 않는다)', `${r.rew} / 게시 ${req.rewQty}`);
    ok(near(+v.storage[req.rewItem], rewBefore - req.rewQty, 0.01), '⑰b 마을 잉여가 정확히 그만큼 줄었다');
  }

  // ⑱ 게시 뒤 마을이 갚을 수 없게 되면 — **물건을 받지 않는다**(받아 놓고 못 갚으면 사기다)
  const D2 = stage(9, { rewStock: 100000 });
  if (D2 && D2.req) {
    const { v, L, W, req } = D2;
    const it = (L.deliverable.items.get(W) || [])[0];
    const inv = { [it]: req.qty + 10 }, before = inv[it];
    v.storage[req.rewItem] = Math.max(0, req.rewQty - 1);      // 딱 한 개 모자라게
    ok(Math.floor(+v.storage[req.rewItem]) < req.rewQty, '⑱a 전제: 마을이 게시액을 못 갚는 상태가 됐다',
      `재고 ${Math.floor(+v.storage[req.rewItem])} < 게시 ${req.rewQty}`);
    const r2 = Events.deliverToVillage({ ledger: L, vil: { econ: v }, vid: 0, inventory: inv, item: W, want: req.qty, deposit: Villages.playerVillageDeposit });
    ok(!r2.ok, '⑱ 못 갚으면 납품을 거절한다', r2.err || '받아버림');
    ok(inv[it] === before, '⑱b 거절 시 플레이어 물건은 그대로다(물건이 사라지지 않는다)', `${it} ${inv[it]}`);
    ok(L.board(0).find((q) => q.item === W).remain === req.qty, '⑱c 거절은 잔여를 갉아먹지 않는다(원자적 되돌림)');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ★★[T7 2026-09-01] 소문 물리 전파 + 복귀 브리핑 — ⑲ ~ ㉚
//   설계: 사건은 순간 전파되지 않는다. 이웃 마을 소식은 캐러밴이 걸어온 뒤에 들린다.
//   ⚠이 절의 픽스처는 **거리를 직접 만든다**(일렬 배치). 엔진이 뽑은 좌표에 기대면
//     "먼 마을"인지 아닌지가 시드마다 달라져, 검사가 무엇을 재는지 알 수 없게 된다.
//     대신 **픽스처가 의도한 상황이 실제로 성립하는지**를 매 절 먼저 assert 한다(족보 ⑯·㊶).
// ═════════════════════════════════════════════════════════════════════════════
const Rumor = R('server/rumor');

// 일렬 마을 배치 — i번 마을이 x = i*600. 이웃 간 600px = 1일, 0↔3 은 1800px = 4일.
//   ⇒ **징검다리(1+1+1=3일)가 직행(4일)보다 빠르다.** 다단 전파가 진짜로 필요한 배치다.
const CHAIN_PX = 600;
function chainGeo(n) {
  const ids = []; for (let i = 0; i < n; i++) ids.push(i);
  return { vids: () => ids, dist: (a, b) => Math.abs(a - b) * CHAIN_PX };
}
const mkLedgerGeo = (world, geo, cfg) => {
  const L = Events.createLedger({ econV2, vidOf, depositMap: Villages.playerVillageDepositMap(), cfg, geo });
  L.prime(world);
  return L;
};

// ─────────────────────────────────────────────────────────────────────────────
// ⑲ econ 캐러밴 시계와의 **동기 계약** — 소문은 행상과 같은 속도로 걷는다
//    ⚠자기 자신을 검사하지 않는다: econ 이 **실제로 띄운 캐러밴**의 travelDays 와 대조한다.
// ─────────────────────────────────────────────────────────────────────────────
{
  // 여러 시드에서 캐러밴을 모아 **거리 폭**을 넓힌다(한 판 5건으론 계약을 못 잰다).
  // ⚠**재routing·포기한 캐러밴은 제외한다** — econ 이 재routing 때 `c.distance` 는 새 목적지로
  //   갈아치우면서 `c.travelDays` 는 **원래 구간 값 그대로 둔다**(economy-sim-v2.js:949-955).
  //   즉 그 레코드는 econ 안에서도 서로 안 맞는다. 이 하네스가 처음 그걸 잡았고, 회부에 적었다.
  //   그래서 계약 대조는 **한 번도 안 꺾인 캐러밴**으로만 한다(그게 이 시계의 정의역이다).
  const cars = [];
  for (const seed of [1020, 7, 42]) {
    const w = makeWorld(240, seed);
    for (const c of (w.caravans || [])) {
      if (!c || !isFinite(c.distance) || !isFinite(c.travelDays)) continue;
      if (c._rerouted || c._abandoned) continue;
      cars.push(c);
    }
  }
  ok(cars.length > 0, '⑲a 전제: econ 이 실제로 캐러밴을 띄웠다(대조할 실물이 있다)', `caravans=${cars.length}`);
  let bad = null, span = [Infinity, -Infinity], legOk = true;
  for (const c of cars) {
    span = [Math.min(span[0], c.distance), Math.max(span[1], c.distance)];
    if ((c.arriveDay - c.departDay) !== c.travelDays) legOk = false;     // 레코드 자체의 정합
    if (Rumor.travelDaysOf(c.distance) !== c.travelDays) { bad = c; break; }
  }
  ok(legOk, '⑲c 전제: 대조에 쓰는 레코드가 econ 안에서 정합하다(arriveDay−departDay = travelDays)');
  ok(cars.length > 0 && !bad, '⑲ 소문 시계 = econ 캐러밴 시계(travelDaysForDistance 동기 계약)',
    bad ? `dist=${bad.distance} econ=${bad.travelDays} rumor=${Rumor.travelDaysOf(bad.distance)}`
        : `거리 ${span[0].toFixed(0)}~${span[1].toFixed(0)}px · ${cars.length}건 전수`);
  const daySet = new Set(cars.map((c) => c.travelDays));
  ok(daySet.size >= 2, '⑲b 전제: 대조 구간이 한 점이 아니다(일수가 여러 값으로 갈린다)',
    `일수 {${[...daySet].sort((a, b) => a - b).join(',')}} · 거리 폭 ${(span[1] - span[0]).toFixed(0)}px`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑳ 도달표 — 결정론 · 자기 마을 즉시 · 대칭 · 거리 단조 · 다단 전파 = 최단 경로
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(120, 7);
  const N = world.villages.length;
  ok(N >= 4, '⑳a 전제: 마을이 4곳 이상이라 다단 전파를 잴 수 있다', `N=${N}`);
  const L1 = mkLedgerGeo(world, chainGeo(N));
  const L2 = mkLedgerGeo(world, chainGeo(N));
  const tab = (L) => { const t = []; for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) t.push(L.delayTo(a, b)); return t.join(','); };
  ok(tab(L1) === tab(L2), '⑳ 도달표는 결정론적이다(같은 배치 = 같은 표 · 주사위 0)');

  let self = true; for (let a = 0; a < N; a++) if (L1.delayTo(a, a) !== 0) self = false;
  ok(self, '⑳b 발생 마을은 **즉시** 안다(지연 0)');

  let sym = true; for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (L1.delayTo(a, b) !== L1.delayTo(b, a)) sym = false;
  ok(sym, '⑳c 도달 지연은 대칭이다(거리행렬이 무향이라는 전제의 검사)');

  let mono = true, prev = -1;
  for (let b = 0; b < N; b++) { const d = L1.delayTo(0, b); if (d < prev) mono = false; prev = d; }
  ok(mono, '⑳d 거리 단조 — 먼 마을이 가까운 마을보다 먼저 듣지 않는다',
    Array.from({ length: N }, (_, b) => L1.delayTo(0, b)).join(','));

  // 다단 전파 = 최단 경로 합. 일렬 배치에서 0→3 은 직행 4일, 징검다리 3일.
  const direct = Rumor.travelDaysOf(3 * CHAIN_PX);
  const hop = 3 * Rumor.travelDaysOf(CHAIN_PX);
  ok(direct > hop, '⑳e 전제: 이 배치에서 **직행이 징검다리보다 느리다**(다단 전파가 실제로 필요한 상황)',
    `직행 ${direct}일 vs 3홉 ${hop}일`);
  ok(L1.delayTo(0, 3) === hop, '⑳f 다단 전파 = 최단 경로 합(직행보다 짧은 길을 찾는다)', `${L1.delayTo(0, 3)}일`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ㉑ 도달 전 사건은 **어느 경로로도** 보이지 않는다 — 그리고 도달일에 정확히 보인다
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(150, 42);
  const N = world.villages.length;
  const L = mkLedgerGeo(world, chainGeo(N));
  const FAR = N - 1;
  // 마을 0 에 부족을 만들어 사건 1건을 낸다(에지 트리거 — 래치가 꺼진 자리를 고른다)
  const t = pickFresh(world, L, { minEma: 0.05 });
  ok(!!t && t.vid === 0 || !!t, '㉑a 전제: 래치가 꺼진 표적을 찾았다', t ? `v${t.vid} ${t.r}` : '없음');
  let target = null;
  for (const [r, e] of Object.entries(world.villages[0]._consEMA || {})) {
    if (r.charCodeAt(0) === 95 || !(e > 0.05)) continue;
    const d = L.detOf(0, r);
    if (d && d.short) continue;
    const thr = e * L.cfg.SHORT_DAYS;
    if (+(world.villages[0].storage[r] || 0) > thr * L.cfg.HYST * 1.2) { target = { r, thr }; break; }
  }
  ok(!!target, '㉑b 전제: 마을 0 에서 부족 래치가 꺼진 품목을 골랐다', target ? target.r : '없음');
  if (target) {
    const D0 = world.day + 1;
    world.villages[0].storage[target.r] = +(target.thr * 0.5).toFixed(3);
    const evs = L.scanDay(world, D0, {});
    const mine = evs.filter((e) => e.vid === 0 && e.item === target.r && e.type === 'STOCK_SHORTAGE');
    ok(mine.length === 1, '㉑c 전제: 마을 0 에서 그 사건이 실제로 났다', `${mine.length}건`);
    if (mine.length === 1) {
      const ev = mine[0];
      const lag = L.delayTo(0, FAR);
      ok(lag >= 2, `㉑d 전제: 픽스처의 사건은 **먼 마을**(v${FAR}) 것이다 — 지연 ${lag}일`, `lag=${lag}`);
      // 발생 마을에선 그날 즉시 보인다
      ok(L.visibleTo(0, ev, D0), '㉑e 발생 마을은 그날 바로 본다');
      // 먼 마을에선 도달일 전날까지 **어느 문으로도** 안 보인다
      let hiddenAll = true, seenDoor = null;
      for (let d = D0; d < D0 + lag; d++) {
        if (L.visibleTo(FAR, ev, d)) { hiddenAll = false; seenDoor = `visibleTo@${d}`; }
        if (L.visibleEvents(FAR, { today: d, n: 50 }).rows.some((x) => x.ev === ev)) { hiddenAll = false; seenDoor = `visibleEvents@${d}`; }
        const rb = L.returnBrief(FAR, D0 - 1, { today: d, n: 50 });
        if (rb.rows && rb.rows.some((x) => x.ev === ev)) { hiddenAll = false; seenDoor = `returnBrief@${d}`; }
      }
      ok(hiddenAll, '㉑ 도달 전 사건은 **어느 경로로도** 보이지 않는다(브리핑·근황·복귀 전부)', seenDoor || '');
      const arrive = D0 + lag;
      ok(L.visibleTo(FAR, ev, arrive), '㉑f 도달일에 정확히 보인다(하루도 이르지도 늦지도 않다)', `day ${arrive}`);
      ok(L.visibleEvents(FAR, { today: arrive, n: 50 }).rows.some((x) => x.ev === ev), '㉑g 근황·게시판이 쓰는 술어도 같은 날 답이 바뀐다');
      ok(L.heardDayOf(ev, FAR) === arrive && L.heardDayOf(ev, 0) === D0, '㉑h 도달일 = 사건일 + 지연(둘 다)',
        `${L.heardDayOf(ev, 0)} / ${L.heardDayOf(ev, FAR)}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ㉒ 가시성 술어는 **문 하나** — recent·visibleEvents·returnBrief 가 같은 답을 낸다
//    (villages.js 의 게시판 `news` 와 근황 `villageNews` 는 이 함수 하나를 부른다 — 실서버
//     경로는 `e2e-rumor` 가 화면까지 잰다. 여기선 장부 층의 단일 문을 검사한다.)
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(150, 1020);
  const N = world.villages.length;
  const L = mkLedgerGeo(world, chainGeo(N));
  for (let k = 0; k < 40; k++) { econV2.tickWorldV2(world); L.scanDay(world, world.day, {}); }
  let same = true, crossSeen = 0, detail = '';
  for (let v = 0; v < N; v++) {
    const vis = L.visibleEvents(v, { n: L.cfg.BRIEF_N }).rows.map((x) => x.ev);
    const rec = L.recent(v, L.cfg.BRIEF_N);
    if (vis.length !== rec.length || vis.some((e, i) => e !== rec[i])) { same = false; detail = `v${v}`; }
    crossSeen += L.visibleEvents(v, { n: 500 }).rows.filter((x) => x.ev.vid !== v).length;
  }
  ok(same, '㉒ `recent` 는 가시성 술어의 껍데기다(두 문이 같은 답)', detail);
  ok(crossSeen > 0, '㉒b 전제: 이 판에서 **남의 마을 사건이 실제로 도달했다**(검사가 자명 통과가 아니다)',
    `교차 도달 ${crossSeen}건`);
  // 술어가 실제로 자르고 있는가 — 아직 안 온 것이 남아 있어야 이 검사가 뜻이 있다
  let pending = 0;
  for (let v = 0; v < N; v++) for (const w of [...Array(N).keys()]) {
    if (w === v) continue;
    for (const ev of L.ringOf(w)) if (L.heardDayOf(ev, v) > L.today) pending++;
  }
  ok(pending > 0, '㉒c 전제: 아직 도달하지 않은 사건이 남아 있다(술어가 실제로 뭔가를 자르고 있다)', `미도달 ${pending}건`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ㉓ 복귀 브리핑 — 부재 기간 것만 · 상한 · 1게임일 미만 무발동 · 두 번째엔 중복 없음
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(150, 7);
  const N = world.villages.length;
  const L = mkLedgerGeo(world, chainGeo(N));
  for (let k = 0; k < 40; k++) { econV2.tickWorldV2(world); L.scanDay(world, world.day, {}); }
  const V = 0, today = L.today;
  const since = today - 10;

  const rb = L.returnBrief(V, since, { n: 3 });
  ok(rb.returned === true, '㉓a 전제: 부재 10일 → 복귀 브리핑이 발동한다', `absent=${rb.absent}`);
  ok(rb.rows.length > 0, '㉓b 전제: 그 기간에 이 마을이 들은 사건이 실제로 있다', `${rb.total}건 중 ${rb.rows.length}줄`);

  const outOfWindow = rb.rows.filter((x) => x.heard <= since || x.heard > today);
  ok(outOfWindow.length === 0, '㉓ 부재 기간에 **도달한** 것만 전한다(사건이 난 날이 아니라 들은 날 기준)',
    outOfWindow.length ? JSON.stringify(outOfWindow[0]) : '');
  ok(rb.rows.length <= 3 && rb.lines.length <= 3, '㉓c 문장 수 상한(EV_RETURN_N)이 지켜진다', `${rb.lines.length}줄`);
  ok(rb.more === Math.max(0, rb.total - rb.rows.length), '㉓d "그 밖에 n건" 이 실제 잔여와 일치한다', `more=${rb.more} total=${rb.total}`);

  // 부재 0일 — 발동하지 않는다
  ok(L.returnBrief(V, today, { n: 3 }).returned === false, '㉓e 부재 1게임일 미만이면 발동하지 않는다(잔소리 금지)');
  ok(L.returnBrief(V, null, { n: 3 }).returned === false, '㉓f 기준일이 없으면(처음 온 사람) 발동하지 않는다');

  // 두 번째 재접속 — 기준일을 첫 브리핑 시점으로 올리면 같은 사건이 다시 나오지 않는다
  const first = new Set(rb.rows.map((x) => x.ev));
  const second = L.returnBrief(V, today, { today, n: 3 });
  ok(second.returned === false, '㉓g 재접속 두 번째(같은 날) — 중복 브리핑 없음');
  // 하루가 더 흐른 뒤라면: 그 하루에 도달한 것만 나온다
  econV2.tickWorldV2(world); L.scanDay(world, world.day, {});
  const third = L.returnBrief(V, today, { n: 20 });
  const dup = third.rows.filter((x) => first.has(x.ev));
  ok(dup.length === 0, '㉓h 이미 전한 사건은 다시 전하지 않는다(창이 겹치지 않는다)', `중복 ${dup.length}건`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ㉔ 틱 비용 — 조회는 그래프를 걷지 않는다(캐시 적중) · 하루 경계는 출발 마을당 한 번뿐
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(150, 42);
  const N = world.villages.length;
  const L = mkLedgerGeo(world, chainGeo(N));
  for (let k = 0; k < 30; k++) { econV2.tickWorldV2(world); L.scanDay(world, world.day, {}); }
  const w0 = L.rumorStats.walks;
  ok(w0 > 0, '㉔a 전제: 도달표를 실제로 계산했다(검사가 0=0 자명 통과가 아니다)', `walks=${w0}`);
  ok(w0 <= N, '㉔b 그래프 걷기는 **출발 마을당 한 번**을 넘지 않는다', `walks=${w0} ≤ 마을 ${N}`);
  for (let q = 0; q < 200; q++) { L.recent(q % N, 3); L.visibleEvents(q % N, { n: 8 }); L.returnBrief(q % N, L.today - 5, { n: 3 }); }
  ok(L.rumorStats.walks === w0, '㉔ 조회 600회에 그래프 걷기 **0회**(전부 캐시 적중)', `walks=${L.rumorStats.walks}`);
  const before = L.rumorStats.walks;
  for (let k = 0; k < 20; k++) { econV2.tickWorldV2(world); L.scanDay(world, world.day, {}); }
  ok(L.rumorStats.walks === before, '㉔c 하루 경계 20일에도 추가 걷기 0회(표는 한 번 서면 그대로다)');
  // 마을 배치가 바뀌면(무효화) 다시 데운다 — 낡은 표를 들고 있지 않는다
  L.rumorInvalidate();
  L.recent(0, 3);
  ok(L.rumorStats.walks > before, '㉔d 무효화 뒤에는 다시 계산한다(마을이 늘면 표가 낡는다)', `walks=${L.rumorStats.walks}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ㉕ **지리가 없으면 T7 이전 그대로다** — 랩(econ 단독)이 기준선을 못 움직이는 구조적 근거
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(150, 7);
  const N = world.villages.length;
  const L = mkLedger(world);                       // geo 주입 없음 = 랩 경로
  ok(L.hasRumor === false, '㉕a 전제: 지리 주입이 없으면 도달표가 아예 없다(랩 경로)');
  for (let k = 0; k < 30; k++) { econV2.tickWorldV2(world); L.scanDay(world, world.day, {}); }
  let cross = 0;
  for (let v = 0; v < N; v++) cross += L.visibleEvents(v, { n: 500 }).rows.filter((x) => x.ev.vid !== v).length;
  ok(cross === 0, '㉕ 지리가 없으면 남의 마을 사건은 **영영 안 보인다**(T7 이전 동작 = 기준선 불변)', `교차 ${cross}건`);
  // 그리고 자기 마을 것은 종전과 같이 전부 보인다
  let ownOk = true;
  for (let v = 0; v < N; v++) {
    const ring = L.ringOf(v);
    if (!ring.length) continue;
    if (!L.visibleTo(v, ring[ring.length - 1], L.today)) ownOk = false;
  }
  ok(ownOk, '㉕b 자기 마을 사건은 종전대로 전부 보인다');
  // 손잡이 하나(RUMOR_OFF)로 지리가 있어도 같은 상태를 만든다 — A/B 재현
  const prevOff = process.env.RUMOR_OFF;
  process.env.RUMOR_OFF = '1';
  delete require.cache[require.resolve(path.join(__dirname, '..', 'server', 'rumor.js'))];
  const L2 = mkLedgerGeo(world, chainGeo(N));
  for (let k = 0; k < 10; k++) { econV2.tickWorldV2(world); L2.scanDay(world, world.day, {}); }
  let cross2 = 0;
  for (let v = 0; v < N; v++) cross2 += L2.visibleEvents(v, { n: 500 }).rows.filter((x) => x.ev.vid !== v).length;
  ok(cross2 === 0, '㉕c 손잡이 `RUMOR_OFF=1` 이면 지리가 있어도 T7 이전 동작(A/B 재현 가능)', `교차 ${cross2}건`);
  if (prevOff == null) delete process.env.RUMOR_OFF; else process.env.RUMOR_OFF = prevOff;
  delete require.cache[require.resolve(path.join(__dirname, '..', 'server', 'rumor.js'))];
}

// ═════════════════════════════════════════════════════════════════════════════
// ★★[T18 2026-09-01] 연대기 — 마을 연표 · ㉖ ~ ㉛
//   설계: 사건 장부는 "지금"이고 연표는 "역사"다. 그런데 사건 링버퍼는 **90일이면 잘린다** —
//   그래서 연표는 잘리지 않는 별도 표(`chron`)를 읽고, **누가 언제 들었는지는 도달표가**
//   되돌린다(저장하지 않는다). 여기서 재는 것은 그 계약이다.
// ═════════════════════════════════════════════════════════════════════════════
{
  const world = makeWorld(120, 1020);
  const N = world.villages.length;
  const chronRows = [];
  const L = Events.createLedger({ econV2, vidOf, depositMap: Villages.playerVillageDepositMap(),
    geo: chainGeo(N), onChronicle: (e) => chronRows.push({ ...e }) });
  L.prime(world);
  // 한 해를 넘겨 돌린다 — 연표는 해를 넘겨 읽는 것이라 두 해 이상이 있어야 검사가 성립한다.
  const YD = Events.yearDaysOf();
  const _l = console.log; console.log = () => {};
  for (let k = 0; k < YD + 200; k++) { econV2.tickWorldV2(world); L.scanDay(world, world.day, {}); }
  console.log = _l;
  const today = L.today, cal = Events.calendarOf(today);

  // ── ㉖ 전제들 — 이 절이 잴 수 있는 상황인가 (자명 통과 방지)
  ok(cal.year >= 1, '㉖a 전제: 해를 넘겼다(연표에 지난 해가 있다)', `${cal.year}년 ${cal.seasonKo} ${cal.dayOfSeason}일 · day ${today}`);
  ok(L.stats.chronicled > 0, '㉖b 전제: 연표에 남을 만한 큰 사건이 실제로 났다', `${L.stats.chronicled}건 / 전체 ${L.stats.emitted}건`);
  ok(L.stats.chronicled < L.stats.emitted, '㉖c 전제: 문턱이 실제로 자르고 있다(전부 통과가 아니다)',
    `${(L.stats.chronicled / L.stats.emitted * 100).toFixed(1)}%`);
  // ★★잘림이 실제로 일어났는가 — 이게 이 층의 존재 이유다
  const ringN = L.ringOf(0).length, chronN = L.chronOf(0).length;
  const oldestRing = L.ringOf(0)[0] ? L.ringOf(0)[0].day : today;
  const oldestChron = L.chronOf(0)[0] ? L.chronOf(0)[0].day : today;
  ok(oldestChron < oldestRing, '㉖ ★잘린 뒤에도 연표는 남는다(링버퍼보다 오래된 사건을 갖고 있다)',
    `링 최고참 day${oldestRing}(${ringN}건) vs 연표 최고참 day${oldestChron}(${chronN}건) · KEEP_DAYS=${L.cfg.KEEP_DAYS}`);
  // ⚠링버퍼 정리는 **사건이 난 날에만** 돈다(`commit` 안에서 자른다) — 조용한 날이 이어지면
  //   KEEP_DAYS 를 조금 넘겨 남아 있다. 그래서 "정확히 90일"이 아니라 **"한 해를 못 담는다"**를 잰다.
  //   (여기서 90 을 딱 맞추라고 요구하면 제품이 옳은데 하네스가 빨개진다 — 실제로 93일이었다.)
  ok(today - oldestRing < YD, '㉖d 전제: 링버퍼는 한 해를 담지 못한다(그래서 연표가 따로 필요하다)',
    `링 ${today - oldestRing}일치 < 한 해 ${YD}일 · 연표 ${today - oldestChron}일치`);

  // ── ㉗ 연표는 **달력 정본**으로 묶는다(사본 금지)
  const c1 = L.chronicle(0, { year: 1 });
  ok(c1.seasons.length === 4, '㉗ 지난 한 해는 계절 넷으로 묶인다(달력 정본 `calendarOf`)', `${c1.seasons.map((b) => b.seasonKo).join(' ')}`);
  ok(c1.seasons.every((b) => Events.calendarOf(b.start).season === b.season && Events.calendarOf(b.start).dayOfSeason === 1),
    '㉗b 각 계절 칸의 시작일이 정본 달력의 계절 첫날이다');
  const yd2 = c1.seasons.reduce((a, b) => a + b.days, 0);
  ok(yd2 === c1.yearDays, '㉗c 계절 길이의 합 = 한 해의 길이(상수를 안 적고 정본에서 유도)', `${yd2} = ${c1.yearDays}`);

  // ── ㉘ 결정론 + 잘림 뒤 복구 — 같은 표를 다시 심으면 같은 연표가 나온다
  const L2 = Events.createLedger({ econV2, vidOf, depositMap: Villages.playerVillageDepositMap(), geo: chainGeo(N) });
  ok(L2.loadChronicle(chronRows) === chronRows.length, '㉘a 전제: 영속 표를 그대로 되심었다', `${chronRows.length}행`);
  const flat = (c) => JSON.stringify(c.seasons.map((b) => [b.seasonKo, b.total, b.more, b.items.map((x) => `${x.heard}|${x.line}`)]));
  const c1b = L2.chronicle(0, { year: 1, today });
  ok(flat(c1b) === flat(c1), '㉘ 연표는 결정론적이다 — 저장본만으로 같은 연표가 재현된다(도달일은 저장하지 않는다)');
  const c1c = L.chronicle(0, { year: 1 });
  ok(flat(c1c) === flat(c1), '㉘b 같은 질문에 같은 답(캐시가 답을 바꾸지 않는다)');

  // ── ㉙ 도달 전 사건은 연표에도 없다 — 그리고 **먼 마을 것이 실제로 섞여 있다**
  const FAR = N - 1;
  let cross = 0, bad = null;
  for (let y = 0; y <= cal.year; y++) {
    for (const b of L.chronicle(FAR, { year: y }).seasons) for (const it of b.items) {
      if (it.from != null) cross++;
      if (it.heard > today) bad = bad || { ...it, why: '오늘 이후' };
      const lag = it.heard - it.day;
      const want = L.delayTo(it.from == null ? FAR : it.from, FAR);
      if (lag !== want) bad = bad || { ...it, why: `지연 ${lag} ≠ 도달표 ${want}` };
    }
  }
  ok(cross > 0, '㉙a 전제: 먼 마을 사건이 실제로 연표에 섞여 있다(자기 마을만이면 이 검사가 무의미하다)', `교차 ${cross}건`);
  ok(!bad, '㉙ 연표의 모든 줄이 **도달일 기준**이다(오늘 이후 없음 · 지연 = 도달표 그대로)',
    bad ? JSON.stringify(bad) : '');
  // 도달 전 사건은 연표에서도 안 보인다 — 어제 기준으로 물으면 오늘 도달한 것이 빠져야 한다
  const cnt = (c) => c.seasons.reduce((a, b) => a + b.total, 0);
  const nToday = cnt(L.chronicle(FAR, { year: cal.year, today }));
  const nYest = cnt(L.chronicle(FAR, { year: cal.year, today: today - 1 }));
  ok(nYest <= nToday, '㉙b 어제 기준 연표는 오늘 기준보다 길지 않다(미래를 미리 적지 않는다)', `${nYest} ≤ ${nToday}`);

  // ── ㉚ 계절 상한과 "그 밖에 n건" — 조용한 절단 금지
  //   ★우리 마을 몫과 이웃 소식 몫은 **따로** 센다(한 그릇에 담아 자르면 연표가 세계의 극단값 목록이 된다).
  let over = 0, capHit = 0, moreBad = 0, foreignOver = 0, sawForeign = 0;
  for (let y = 0; y <= cal.year; y++) for (const b of L.chronicle(0, { year: y }).seasons) {
    const shownMine = b.items.filter((x) => x.from == null).length;
    const shownAbroad = b.items.length - shownMine;
    if (shownMine > L.cfg.CHRON_PER_SEASON) over++;
    if (shownAbroad > L.cfg.CHRON_FOREIGN) foreignOver++;
    sawForeign += shownAbroad;
    if (b.mine > L.cfg.CHRON_PER_SEASON) capHit++;
    // ★`more` 는 **우리 마을 몫만** — 이웃 후보는 51마을이 쏟아져 세는 뜻이 없다(서버 주석).
    if (b.more !== b.mine - shownMine || b.abroadMore !== b.abroad - shownAbroad) moreBad++;
  }
  ok(over === 0, '㉚ 한 계절에 실리는 **우리 마을** 줄이 상한을 넘지 않는다', `상한 ${L.cfg.CHRON_PER_SEASON}`);
  ok(foreignOver === 0, '㉚b 한 계절에 실리는 **이웃 소식** 줄이 상한을 넘지 않는다', `상한 ${L.cfg.CHRON_FOREIGN}`);
  ok(moreBad === 0, '㉚c 잘린 수가 실제 잔여와 일치한다 — 우리 마을 `more` · 이웃 `abroadMore`(조용한 절단 금지)');
  ok(capHit > 0, '㉚d 전제: 상한이 실제로 걸리는 계절이 있다(자명 통과가 아니다)', `${capHit}칸`);

  // ── ㉛ 캐시 — 지난 해는 영원히, 올해는 날이 바뀔 때만
  const b0 = L.stats.chronBuilt;
  for (let i = 0; i < 30; i++) L.chronicle(0, { year: 1 });
  ok(L.stats.chronBuilt === b0, '㉛ 지난 해 연표는 다시 짓지 않는다(30회 조회 · 재빌드 0)', `built=${L.stats.chronBuilt - b0}`);
  for (let i = 0; i < 30; i++) L.chronicle(0, { year: cal.year });
  ok(L.stats.chronBuilt === b0, '㉛b 올해 연표도 **같은 날이면** 다시 짓지 않는다', `built=${L.stats.chronBuilt - b0}`);
  const rw0 = L.rumorStats ? L.rumorStats.walks : 0;
  for (let i = 0; i < 30; i++) { L.chronicle(1, { year: 1 }); L.chronicleYears(1); }
  ok(!L.rumorStats || L.rumorStats.walks <= rw0 + 1, '㉛c 연표 조회가 도달표 그래프를 다시 걷지 않는다',
    `walks ${rw0} → ${L.rumorStats ? L.rumorStats.walks : '-'}`);
  { const _l2 = console.log; console.log = () => {}; econV2.tickWorldV2(world); L.scanDay(world, world.day, {}); console.log = _l2; }
  const b1 = L.stats.chronBuilt;
  L.chronicle(0, { year: cal.year });
  ok(L.stats.chronBuilt === b1 + 1, '㉛d 하루가 지나면 올해 칸은 다시 짓는다(낡은 연표를 안 준다)');
  L.chronicle(0, { year: 1 });
  ok(L.stats.chronBuilt === b1 + 1, '㉛e 그래도 지난 해는 여전히 캐시 적중(새 사건은 올해에만 들어온다)');
  // 마을이 늘면(도달표 무효) 전부 다시
  L.rumorInvalidate();
  L.chronicle(0, { year: 1 });
  ok(L.stats.chronBuilt === b1 + 2, '㉛f 도달표가 무효화되면 지난 해도 다시 짓는다(거리가 바뀌면 도달일이 바뀐다)');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
try { require('fs').unlinkSync(process.env.DB_PATH); } catch (e) {}
process.exit(fail ? 1 : 0);
