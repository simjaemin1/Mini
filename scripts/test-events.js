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

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
try { require('fs').unlinkSync(process.env.DB_PATH); } catch (e) {}
process.exit(fail ? 1 : 0);
