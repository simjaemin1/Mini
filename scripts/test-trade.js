#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-trade.js — 마을 거래소 서버 E2E ================================
//
// ★[재민 확정 2026-08-27] *"마을마다 거래소가 있어서 거기서 모든 경제학이 계산되고 npc끼리
//   교역하잖아 — 거기서 플레이어도 물물교환할 수 있어야 해."*
//
// ★★제1 판정: **가격 사본이 없는가.** 거래소가 쓰는 값은 NPC 교역이 읽는 바로 그 시세여야 한다.
//   그래서 ①은 값을 손으로 다시 풀지 않고 **구조로** 잡는다:
//     ⓐ 왕복 비율의 곱이 정확히 ((1−s)/(1+s))² — 가격이 무엇이든 성립하고,
//        양방향이 **서로 다른 표**에서 왔다면 깨진다.
//     ⓑ 비율이 견적이 실어 보낸 그 두 가격에서만 나온다.
//     ⓒ 소스에 `computeShadowPrices` 호출이 **없다**(접근자만 쓴다) · 상한은 B-1 과 **같은 함수**.
//
// ★★족보 ㊻ — 픽스처 결백: 가격은 **한 번도 손대지 않는다**(재고만 움직이고 시세는 정본이 스스로 낸다).
//   열린 의뢰 계약도 안 건드린다 — ⑤가 그 계약이 지켜지는지를 재는 검사이기 때문이다.
//
// 실행: node scripts/test-trade.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
const say = (m) => console.log(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const TMP = `/tmp/test-trade-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(36000 + (process.pid % 800));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '1'; process.env.VILLAGE_MAX = process.env.VILLAGE_MAX || '2';
process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const V = H.SimVillages, T = H.Trade;

let CV = null, PX = 0, PY = 0;
// ★[T69] 꼬리 인자 둘이 늘었다: 시세표의 **기준 품목**, 견적·실행의 **받을 양**.
//   종전 호출은 그대로 종전 뜻이다(안 주면 기준=곡식 · 축=내는 양).
const B = (inv, num) => V.villageTradeBoard(CV.id, PX, PY, inv || {}, num);
const Q = (a, b, q, want) => V.villageTradeQuote(CV.id, PX, PY, a, b, q, null, want ? { want } : undefined);
const X = (inv, a, b, q, want) => V.villageTradeExec(CV.id, PX, PY, inv, a, b, q, null, want);
const rowOf = (res, inv) => B(inv).rows.find((r) => r.res === res) || null;
const itemOf = (res) => { const r = rowOf(res); return r ? (r.give[0] || r.item) : null; };

(async () => {
  say('\n=== 마을 거래소 — 플레이어 물물교환 (서버 정본 E2E) ===');

  // ═══ ⓪ 전제 ════════════════════════════════════════════════════════════════
  say('\n⓪ 전제');
  let list = [];
  for (let i = 0; i < 150; i++) { list = V.clientVillages ? V.clientVillages() : []; if (list && list.length) break; await sleep(1000); }
  ok(list.length > 0, '★마을 시딩을 기다렸다(안 기다리면 아래 전부가 "마을 없다"로 실패한다)', `${list.length}곳`);
  CV = list[0]; PX = CV.cx * 32 + 16; PY = CV.cy * 32 + 16;
  const b0 = B();
  ok(!b0.err && b0.rows.length > 2, '★전제 — 그 마을 시세표가 선다', b0.err || `${b0.rows.length}품목`);
  say(`    ${b0.name} — 스프레드 ${b0.spread} · 기준 품목 ${b0.numeraireKo}`);
  const s = T.CFG.SPREAD;
  const rows = b0.rows.filter((r) => r.canGive && r.canTake && r.stock > 8);
  ok(rows.length >= 2, '★★자명 통과 금지 — 재고가 있는 교환 가능 품목이 둘 이상 실재한다',
    rows.map((r) => `${r.ko}(${r.stock})`).join(' ') || '없음');
  const A = rows[0].res, Bb = rows[1].res;
  say(`    검사 짝: ${rows[0].ko}(${rows[0].stock}) ↔ ${rows[1].ko}(${rows[1].stock})`);

  // ═══ ① 교환비 = 정본 가격, 사본 없음 ═══════════════════════════════════════
  say('\n① 교환비 — NPC 교역이 읽는 **그 시세**를 쓰는가');
  const qAB = Q(A, Bb, 1), qBA = Q(Bb, A, 1);
  ok(!qAB.err && !qBA.err, '★전제 — 양방향 견적이 선다', qAB.err || qBA.err || '');
  const expect = ((1 - s) / (1 + s)) ** 2;
  const got = qAB.ratio * qBA.ratio;
  say(`    ${rows[0].ko}→${rows[1].ko} 비율 ${qAB.ratio} · 되돌리기 ${qBA.ratio} · 곱 ${got.toFixed(6)}`);
  ok(Math.abs(got - expect) < 1e-6,
    `★★① 왕복 비율 곱 = ((1−s)/(1+s))² = ${expect.toFixed(6)} — **양방향이 같은 표**를 본다`, got.toFixed(6));
  const fromPrices = (qAB.priceGive * (1 - s)) / (qAB.priceTake * (1 + s));
  // ★허용오차는 **실어 보낸 자릿수**(소수 6자리)에서 나온다 — 상수로 박지 않는다.
  //   1차엔 4자리 반올림 값으로 6자리 정밀도를 요구해 자기 발에 걸렸다.
  const tol = Math.max(1e-6, Math.abs(qAB.ratio) * 2e-5);
  ok(Math.abs(fromPrices - qAB.ratio) < tol,
    '★★① 한계비율이 **견적이 실어 보낸 그 두 가격에서만** 나온다(다른 수가 안 섞였다)',
    `${qAB.priceGive} / ${qAB.priceTake} → ${fromPrices.toFixed(6)} vs ${qAB.ratio}`);
  const tsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'trade.js'), 'utf8'));
  ok(!/computeShadowPrices/.test(tsrc), '★★① trade.js 는 가격 함수를 **직접 부르지도 않는다**(접근자만)');
  // ★★[2026-08-27 수정] 종전엔 여기서 `Events.pricesOf`(하루 캐시)를 **요구**했다. 그게 결함이었다 —
  //   `e2e-trade ⑤` 가 실측으로 잡았다: 캐시가 선 뒤 날을 얼리고 재고를 ±30% 움직여도
  //   표시 시세도 견적가도 소수점까지 그대로였다(하루에 한 번만 갱신되는 값이므로).
  //   거래소가 보는 시세는 **지금 재고의 함수**여야 한다 — 접근자만 쓰는 규약은 그대로다.
  ok(/Events\.pricesFresh/.test(tsrc) && !/Events\.pricesOf/.test(tsrc),
    '★★① 가격은 `Events.pricesFresh` 접근자 하나로만 온다 — **하루 캐시를 쓰지 않는다**(e2e-trade ⑤)');
  ok(/Events\.payableQty/.test(tsrc), '★★① 물리 상한도 **B-1 과 같은 함수**를 부른다');
  const esrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'events.js'), 'utf8'));
  ok(/payable: payableQty\(/.test(esrc), '★★① 게시판 보상도 그 함수를 쓰도록 **바뀌었다**(한쪽만 고쳐질 길이 없다)');
  ok(!/가격 갱신|updatePrice|recomputePrice/.test(tsrc),
    '★★① "가격 갱신" 코드가 **없다** — 재고가 움직이면 시세는 저절로 따라온다(있으면 사본을 만든 것이다)');

  // ═══ ② 왕복 손실 — 무한 차익 봉쇄 ══════════════════════════════════════════
  say('\n② 왕복 — A→B→A 하면 준다');
  {
    const itA = itemOf(A);
    const start = Math.max(4, Math.min(20, Q(A, Bb, 1).maxGive));
    const iv = { [itA]: start };
    const r1 = X(iv, A, Bb, start);
    ok(!r1.err, '★전제 — 첫 교환이 성립했다', r1.err || `${r1.give}→${r1.take}`);
    const gotB = r1.err ? 0 : r1.take;
    const r2 = gotB > 0 ? X(iv, Bb, A, gotB) : { err: '첫 교환 실패' };
    ok(!r2.err, '★전제 — 되돌리기도 성립했다', r2.err || `${r2.give}→${r2.take}`);
    const back = Math.floor(Number(iv[itA]) || 0);
    const theo = (1 - expect) * 100;
    say(`    ${start}개 → ${gotB} → 되돌아온 것 ${back} (이론 손실 하한 ${theo.toFixed(1)}%)`);
    ok(back < start, `★★② **왕복하면 준다** (${start} → ${back}) = 무한 차익이 성립하지 않는다`);
  }
  // ★대조군 — s=0 이면 **보존된다**. 이게 참이어야 위 손실이 스프레드 때문임이 증명된다.
  {
    const keep = T.CFG.SPREAD;
    T.CFG.SPREAD = 0;
    const itA = itemOf(A);
    const start = Math.max(4, Math.min(20, Q(A, Bb, 1).maxGive));
    const iv = { [itA]: start };
    const r1 = X(iv, A, Bb, start);
    const r2 = (!r1.err && r1.take > 0) ? X(iv, Bb, A, r1.take) : { err: 'x' };
    const back = Math.floor(Number(iv[itA]) || 0);
    T.CFG.SPREAD = keep;
    say(`    대조군 s=0: ${start} → ${r1.err ? '?' : r1.take} → ${back}`);
    // ★★1차 실장에서 이 대조군이 **없던 나무 4개를 만들어 냈다**(14 → 45 → 18).
    //   원인: 전량을 거래 전 시세로 값 매기면, 내 거래가 만든 가격 변화를 내가 주워 먹는다.
    //   조각 적분(planSliced)을 넣은 뒤로는 **스프레드가 0 이어도 왕복은 손해**다 — 그게 시장의 모양이다.
    ok(!r1.err && !r2.err && back <= start,
      '★★② 대조군 — **s=0 이어도 왕복이 이득이 아니다**(내 거래가 만든 값 변화를 내가 못 먹는다)',
      `${start} → ${back}`);
  }

  // ═══ ③ 물리 상한 · 절삭 · 원자성 ═══════════════════════════════════════════
  say('\n③ 물리 상한 — 마을은 없는 걸 못 준다');
  {
    const r = rowOf(Bb);
    const q = Q(A, Bb, 999999);
    ok(q.cap === r.sell, '★③ 견적의 상한이 시세표의 "팔 수 있는 양"과 같다', `${q.cap} = ${r.sell}`);
    ok(q.capped === true, '★전제 — 터무니없이 요구하면 상한에 걸리는 상황이다');
    const itA = itemOf(A);
    const iv = { [itA]: 100000 };
    const before = rowOf(Bb).stock;
    const ex = X(iv, A, Bb, 100000);
    ok(!ex.err, '★전제 — 그래도 거래 자체는 성립한다(거절이 아니라 절삭)', ex.err || '');
    ok(ex.capped === true && ex.give < 100000, '★★③ **거절이 아니라 절삭**이다 — 살 수 있는 만큼은 산다',
      `요구 ${ex.wanted} → 실제 ${ex.give}`);
    ok(ex.take <= before * (T.CFG.STOCK_FRAC + 1e-9), `★★③ 한 거래가 재고의 ${T.CFG.STOCK_FRAC} 를 못 넘는다`,
      `${ex.take} ≤ ${(before * T.CFG.STOCK_FRAC).toFixed(1)}`);
    const after = rowOf(Bb).stock;
    ok(Math.abs((before - after) - ex.take) < 0.01, '★★③ 마을 재고가 **정확히 준 만큼** 줄었다(원자적)',
      `${before} → ${after} (−${ex.take})`);
  }
  // 동시 경쟁 — 같은 마지막 재고를 둘이 못 가져간다
  {
    const itA = itemOf(A);
    const cap = Q(A, Bb, 1).cap;
    const need = Q(A, Bb, 1);
    const iv1 = { [itA]: 100000 }, iv2 = { [itA]: 100000 };
    const before = rowOf(Bb).stock;
    const e1 = X(iv1, A, Bb, 100000);
    const e2 = X(iv2, A, Bb, 100000);
    const after = rowOf(Bb).stock;
    const total = (e1.err ? 0 : e1.take) + (e2.err ? 0 : e2.take);
    say(`    둘이 동시에 쓸어감: ${e1.err ? 'X' : e1.take} + ${e2.err ? 'X' : e2.take} = ${total} · 재고 ${before} → ${after}`);
    ok(Math.abs((before - after) - total) < 0.01,
      '★★③ 경쟁해도 **나간 만큼만** 줄었다 — 초과 지급이 없다(B-1 과 동형)');
    ok(after >= -1e-9, '★③ 재고가 음수로 안 간다', after);
  }

  // ═══ ④ 가격 반응 — 공짜다 ══════════════════════════════════════════════════
  say('\n④ 가격 반응 — 내가 판 물건에 시세가 움직인다');
  {
    const sellRes = A, buyRes = Bb;
    const p0sell = Q(sellRes, buyRes, 1).priceGive;
    const p0buy = Q(sellRes, buyRes, 1).priceTake;
    const itA = itemOf(sellRes);
    const iv = { [itA]: 100000 };
    let moved = 0;
    for (let i = 0; i < 6; i++) { const r = X(iv, sellRes, buyRes, 100000); if (r.err) break; moved += r.give; }
    ok(moved > 0, '★전제 — 실제로 대량 매도가 일어났다', `${moved}개`);
    const p1sell = Q(sellRes, buyRes, 1).priceGive;
    const p1buy = Q(sellRes, buyRes, 1).priceTake;
    say(`    ${rowOf(sellRes).ko} ${p0sell} → ${p1sell} (내가 판 것 · 흔해졌다)`);
    say(`    ${rowOf(buyRes).ko} ${p0buy} → ${p1buy} (내가 산 것 · 귀해졌다)`);
    ok(p1sell < p0sell, '★★④ **내가 판 물건 값이 떨어졌다** — 첫 30분 ②의 그 장면');
    ok(p1buy > p0buy, '★★④ 내가 산 물건 값은 올랐다');
    ok(!/updatePrice|가격 갱신/.test(tsrc), '★④ 그런데 가격 갱신 코드는 **없다** — 재고의 함수라 저절로 움직였다');
  }

  // ═══ ⑤ 금지 품목 · 잠긴 품목 ═══════════════════════════════════════════════
  say('\n⑤ 금지 · 잠긴 품목');
  {
    const bad = Q(A, '_cash', 1);
    ok(!!bad.err, '★⑤ 내부 필드(`_` 로 시작)는 재화가 아니다 — 거절', bad.err || '통과해 버림!');
    const same = Q(A, A, 1);
    ok(!!same.err, '★⑤ 같은 물건끼리는 거절', same.err || '');
    const nope = Q('does_not_exist', Bb, 1);
    ok(!!nope.err, '★⑤ 없는 재화도 거절', nope.err || '');
    // 잠긴 품목 — 열린 의뢰의 보상 품목은 마을이 팔지 않는다
    const led = V.eventLedger;
    const board = led ? (led.board(CV.id) || []) : [];
    const locked = T.lockedRewards(led, CV.id);
    say(`    열린 의뢰 ${board.length}건 · 보상으로 잠긴 품목 ${locked.size ? [...locked].join(',') : '없음'}`);
    if (locked.size) {
      const lk = [...locked][0];
      const q = Q(A, lk, 1);
      ok(!!q.err && /삯|잡아 둔|못 판다/.test(q.err), '★★⑤ **게시판이 약속한 삯은 팔지 않는다**(계약 보호)', q.err);
    } else {
      ok(T.tradableOut(led, CV.id).size > 0 && typeof T.lockedRewards === 'function',
        '★⑤ (지금 열린 의뢰가 없어 잠긴 품목 없음 — 잠금 함수는 배선돼 있다)',
        '★이 절은 의뢰가 있을 때만 실검사가 된다');
    }
  }

  // ═══ ⑥ 게시판 우위 부등식 ══════════════════════════════════════════════════
  say('\n⑥ 게시판이 거래소보다 유리한가 (프리미엄 > 스프레드)');
  {
    const Ev = require(path.join(ROOT, 'server', 'events.js'));
    const prem = Ev.CFG.REQ_PREMIUM;
    const boardMult = 1 + prem;                       // 게시판: 시세 등가 × (1+프리미엄)
    const tradeMult = (1 - s) / (1 + s);              // 거래소: 사고 팔며 스프레드 두 번
    say(`    게시판 ×${boardMult.toFixed(3)} (프리미엄 ${prem}) vs 거래소 ×${tradeMult.toFixed(3)} (스프레드 ${s})`);
    ok(boardMult > tradeMult,
      '★★⑥ **같은 물건이면 게시판 납품이 항상 낫다** — 마을이 원하는 걸 가져다주는 값이 있다');
    ok(prem > 0 && s > 0, '★⑥ 둘 다 실제로 걸려 있다(0 이면 위 부등식이 공짜다)', `${prem} · ${s}`);
  }

  // ═══ ⑦ 원격 조회 불가 ══════════════════════════════════════════════════════
  say('\n⑦ 정보 비대칭 — 이웃 시세는 걸어가서 본다');
  {
    const far = V.villageTradeBoard(CV.id, PX + 99999, PY, {});
    ok(!!far.err, '★★⑦ 멀리서 시세표를 못 본다', far.err || '보였다!');
    const farQ = V.villageTradeQuote(CV.id, PX + 99999, PY, A, Bb, 1);
    ok(!!farQ.err, '★★⑦ 멀리서 견적도 못 낸다', farQ.err || '났다!');
    const farX = V.villageTradeExec(CV.id, PX + 99999, PY, { [itemOf(A)]: 10 }, A, Bb, 10);
    ok(!!farX.err, '★★⑦ 멀리서 교환도 못 한다', farX.err || '됐다!');
    // ★자명 통과 금지 — 가까이서는 실제로 된다
    ok(!B().err, '★★자명 통과 금지 — 가까이서는 실제로 보인다(게이트가 늘 막는 게 아니다)');
    const vsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
    const gate = (vsrc.match(/function villageTrade\w+\([^)]*\)\s*\{[^]*?_villageNear/g) || []).length;
    ok(gate >= 3, '★★⑦ 세 함수가 **전부** 게이트를 먼저 통과한다(우회로 없음)', `${gate}/3`);
  }

  // ═══ ⑧ 기준 품목 = 내가 낼 물건 (T69 · 캐논 §3①) ═══════════════════════════
  say('\n⑧ 시세는 **내가 낼 물건 기준**이다 (T69)');
  {
    const bF = B();
    ok(bF.numeraire === T.CFG.NUMERAIRE,
      '★전제 — 안 고르면 종전 기준(곡식)이다(폴백이 살아 있다)', `${bF.numeraire} · ${bF.numeraireKo}`);
    const bA = B({}, A);
    ok(bA.numeraire === A, `★★⑧ⓐ 기준을 ${rows[0].ko}(으)로 요청하면 표가 그 기준으로 온다`, `${bA.numeraire} · ${bA.numeraireKo}`);
    const selfRow = bA.rows.find((r) => r.res === A);
    ok(selfRow && Math.abs(selfRow.num - 1) < 1e-9,
      '★★⑧ⓐ **기준 행 자신은 정확히 1** — "나무를 팔면 시세가 나무 몇 개"의 정의', selfRow && selfRow.num);
    // ★다른 행은 p/p_A 여야 한다. 가격은 **견적이 실어 보낸 그 값**으로 맞댄다(하네스가 가격을 따로 풀지 않는다).
    const other = bA.rows.find((r) => r.res === Bb);
    const qq = Q(A, Bb, 1);
    // ★표시는 **유효숫자 4자리**로 잘린다(trade.js `sig`). 허용오차를 눈대중 상수로 박으면
    //   숫자 크기에 따라 어떤 짝에선 헐겁고 어떤 짝에선 자기 발에 걸린다 — 자르는 규칙 그대로 맞댄다.
    const expectNum = +(qq.priceTake / qq.priceGive).toPrecision(4);
    const tolN = Math.max(1e-9, expectNum * 1e-6);
    ok(other && Math.abs(other.num - expectNum) < tolN,
      `★★⑧ⓐ 다른 행은 p/p_${A} 다 — 표와 견적이 **같은 표**에서 나온다`,
      `${other && other.num} vs ${expectNum.toFixed(6)}`);
    ok(Math.abs(expectNum - 1) > 1e-6,
      '★★자명 통과 금지 — 두 품목의 값이 실제로 다르다(1이면 위 검사가 공짜다)', expectNum.toFixed(6));
    // ★★클라 재계산 0(소스 검사) — 패널은 서버가 준 `num`·`numeraireKo` 를 **찍기만** 한다.
    const psrc = codeOnly(fs.readFileSync(path.join(ROOT, 'public', 'client', '50-i-panel.js'), 'utf8'));
    const trPanel = (psrc.match(/function renderTradePanel[^]*?\n  \}\n/) || [''])[0];
    ok(trPanel.length > 500, '★전제 — 거래 패널 절을 실제로 떠냈다(못 떠내면 아래가 공짜다)', `${trPanel.length}자`);
    ok(/r\.num/.test(trPanel) && !/\bnum\s*[:=][^=]*\/\s*/.test(trPanel),
      '★★⑧ⓐ 패널은 `r.num` 을 **찍기만** 한다 — 비율을 나눠 다시 만드는 줄이 없다(사본 0)');
    ok(/numeraireKo/.test(trPanel) && !/'곡식'|"곡식"/.test(trPanel),
      '★★⑧ⓐ 기준 품목 한글 이름도 **서버가 준 것**이다(클라가 이름표를 따로 갖지 않는다)');
    const tsrc8 = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'trade.js'), 'utf8'));
    ok(/Events\.koRes\(nres\)/.test(tsrc8), '★⑧ⓐ 그 이름은 정본 `Events.koRes` 가 낸다(네 줄짜리 표가 아니라)');
  }

  // ═══ ⑨ 받을 양으로 묻고, 내는 양은 올림 (T69 · 캐논 §3②) ═══════════════════
  say('\n⑨ **받을 양**으로 묻는다 — 내는 양은 올림 (T69)');
  {
    const WANT = 3;
    const itA = itemOf(A);
    // ★★교환은 재고를 **정말로** 움직인다 ⇒ 시세도 움직인다. 그러니 아래 주장 하나하나는
    //   **자기 시점의 견적**에 맞대야 한다. 앞에서 받은 수를 뒤에서 재사용하면, 그 사이 값이
    //   달라져 검사가 조용히 다른 상황을 재게 된다(1차 실장에서 실제로 그랬다 — 7 을 기대하고 11 이 나왔다).
    const qw = Q(A, Bb, 1, WANT);
    ok(!qw.err && qw.want === WANT, '★전제 — want 견적이 선다', qw.err || `want=${qw.want}`);
    ok(qw.wantCapped !== true, '★전제 — 마을이 그만큼은 내줄 수 있다(상한에 안 걸린 상황이다)', `cap=${qw.cap}`);
    ok(qw.giveNeeded > 0, '★★⑨ⓑ "그걸 받으려면 몇 개?"에 답이 나온다', `${qw.giveNeeded}개(${qw.giveNeededUnits}단위)`);
    const frac = Math.abs(qw.giveNeededUnits - Math.round(qw.giveNeededUnits));
    ok(frac > 1e-4,
      '★★자명 통과 금지 — 연속해가 **정수가 아니다**(정수면 올림/내림이 같은 수라 ⓓ가 공짜다)',
      qw.giveNeededUnits);
    // 하네스는 `unitsOf` 를 안 넘긴다 ⇒ 1개 = 1단위(perItem = 1). 개체 무게가 섞인 경우는 ⓔ가 잰다.
    ok(qw.giveNeeded === Math.ceil(qw.giveNeededUnits),
      '★★⑨ⓑ 개수는 연속해의 **올림**이다(낱개로만 존재하는 물건 — 캐논 ②)',
      `ceil(${qw.giveNeededUnits}) = ${qw.giveNeeded}`);

    // ⓑ-1 **한 개 덜 내면 못 닿는다** — 이 견적(qw)의 시장에서 먼저 잰다.
    const less = Math.max(1, qw.giveNeeded - 1);
    const rMiss = X({ [itA]: less }, A, Bb, less);
    ok(!rMiss.err && rMiss.take < WANT,
      `★★⑨ⓑ 한 개 덜 내면(${less}개) ${WANT}개에 **못 닿는다** — 이것이 올림의 정의`,
      rMiss.err || `take ${rMiss.take}`);
    // ⓑ-2 **giveNeeded 로 내면 닿는다** — 방금 거래로 값이 움직였으니 견적을 다시 받는다.
    const qw2 = Q(A, Bb, 1, WANT);
    const rHit = X({ [itA]: 100000 }, A, Bb, 0, WANT);
    ok(!rHit.err && rHit.take >= WANT,
      `★★⑨ⓑ ${qw2.giveNeeded}개를 내면 ${WANT}개 **이상** 받는다`, rHit.err || `give ${rHit.give} → take ${rHit.take}`);
    ok(!rHit.err && rHit.give === qw2.giveNeeded && rHit.wantTake === WANT,
      '★★⑨ⓑ 실행이 **견적과 같은 수**를 냈다(견적과 실행이 다른 수를 쓰면 그게 보이지 않는 손이다)',
      rHit.err || `${rHit.give} = ${qw2.giveNeeded}`);
    // ★캐논 ③ — 넘치는 소수는 거래소 몫이다(플레이어가 더 받아 가지 않는다).
    ok(!rHit.err && Number.isInteger(rHit.take), '★★⑨ 받는 쪽은 종전대로 **내림**이다(초과분은 거래소 몫 · 캐논 ③)', rHit.take);

    // ⓔ 개수 물건 vs kg 물건 — 개체 하나가 여러 '단위'면 올림은 **개수 자리**에 걸린다.
    const PER = 2.22;                                   // 큰 물고기 한 마리 = 2.22단위(무게 배치의 그 수)
    const qU = V.villageTradeQuote(CV.id, PX, PY, A, Bb, 1, (it, n) => n * PER, { want: WANT });
    ok(!qU.err && qU.giveNeeded > 0, '★전제 — 개체 무게가 섞인 견적도 선다', qU.err || `${qU.giveNeeded}개`);
    ok(qU.giveNeeded === Math.ceil(qU.giveNeededUnits / PER),
      `★★⑨ⓔ 한 개가 ${PER}단위면 올림은 **개수 자리**에 걸린다(단위 자리는 소수 그대로)`,
      `ceil(${qU.giveNeededUnits} / ${PER}) = ${qU.giveNeeded}`);
    // ★맞댈 상대는 **같은 순간의** 환산 없는 견적이다 — 위 교환들이 값을 움직였으므로
    //   앞에서 받은 수와 맞대면 시장 변동을 환산 탓으로 읽게 된다(1차에 실제로 그랬다).
    const qN = Q(A, Bb, 1, WANT);
    ok(qU.giveNeededUnits > 0 && Math.abs(qU.giveNeededUnits - qN.giveNeededUnits) < 1e-6,
      '★★⑨ⓔ 필요한 **단위**는 환산과 무관하게 같다 — 달라지는 건 그걸 몇 개로 세느냐뿐',
      `${qU.giveNeededUnits} = ${qN.giveNeededUnits}`);
    ok(qU.giveNeeded !== qN.giveNeeded,
      '★★자명 통과 금지 — 그런데 **개수는 실제로 다르다**(같으면 환산이 안 걸린 것이다)',
      `${qU.giveNeeded}개(무게 섞임) vs ${qN.giveNeeded}개(1개=1단위)`);

    // ⓒ 왕복 — want 경로로 가도 손해다(②의 대조군과 같은 꼴).
    const startB = Math.max(2, Math.min(8, WANT));
    const iv = { [itA]: 10000 };
    const before = iv[itA];
    const r1 = X(iv, A, Bb, 0, startB);
    const itB = itemOf(Bb);
    const gotB = r1.err ? 0 : r1.take;
    const spentA = r1.err ? 0 : (before - iv[itA]);
    const r2 = gotB > 0 ? X(iv, Bb, A, gotB) : { err: '첫 교환 실패' };
    const backA = r2.err ? 0 : r2.take;
    ok(!r1.err && !r2.err, '★전제 — want 경로 왕복이 둘 다 성립했다', r1.err || r2.err || '');
    ok(!r1.err && !r2.err && backA < spentA,
      `★★⑨ⓒ **want 경로로 왕복해도 준다** (${spentA} → ${backA}) — 새 길이 차익 구멍이 아니다`);

    // ═══ ⓓ 돌연변이 — 올림을 내림으로 바꾸면 ⓑ가 빨강이어야 한다 ═════════════
    //   ★올림은 **한 자리**에 있다(quote 의 "닿을 때까지 올라가는" 걸음). 그 걸음을 없애면 곧 내림이다.
    //   ★★사본을 통째로 갈아 끼운다 — `villages.js` 는 `Trade.quote`/`Trade.exchange` 를
    //     **호출 시점에 찾으므로**, 그 두 자리만 바꾸면 정본 경로 전체가 돌연변이를 탄다.
    const SRC = path.join(ROOT, 'server', 'trade.js');
    const raw = fs.readFileSync(SRC, 'utf8');
    const SITE = 'takeAt(unitsAt(n)) < want';
    ok(raw.split(SITE).length - 1 === 1, '★전제 — 올림이 소스에 **한 자리**뿐이다(여러 자리면 돌연변이가 반쪽이다)');
    const mutPath = `/tmp/trade-mut-${process.pid}.js`;
    const mutSrc = raw.replace(/require\('\.\/([\w-]+)'\)/g, `require('${path.join(ROOT, 'server')}/$1')`)
                      .replace(SITE, 'takeAt(unitsAt(n)) < 0');   // ← 올라가지 않는다 = 내림
    fs.writeFileSync(mutPath, mutSrc);
    // ★맞댈 정본 값은 **지금 이 시장**에서 다시 받는다(위 거래들이 값을 움직였다).
    const qBase = Q(A, Bb, 1, WANT);
    ok(Math.abs(qBase.giveNeededUnits - Math.round(qBase.giveNeededUnits)) > 1e-4,
      '★★자명 통과 금지 — 지금 시장의 연속해도 정수가 아니다(정수면 올림·내림이 같은 수다)', qBase.giveNeededUnits);
    const q0 = T.quote, x0 = T.exchange;
    let mutGive = null, mutTake = null;
    try {
      const M = require(mutPath);
      T.quote = M.quote; T.exchange = M.exchange;
      const qm = Q(A, Bb, 1, WANT);
      mutGive = qm && qm.giveNeeded;
      const rm = mutGive > 0 ? X({ [itA]: 100000 }, A, Bb, 0, WANT) : { err: '견적 없음' };
      mutTake = rm.err ? null : rm.take;
    } finally {
      T.quote = q0; T.exchange = x0;
      try { delete require.cache[mutPath]; fs.unlinkSync(mutPath); } catch (e) {}
    }
    ok(mutGive === qBase.giveNeeded - 1,
      '★전제 — 돌연변이가 실제로 **한 칸 아래**를 냈다(안 달라지면 이 검사가 자명 통과다)',
      `${mutGive} vs 정본 ${qBase.giveNeeded}`);
    ok(mutTake !== null && mutTake < WANT,
      `★★⑨ⓓ **올림을 내림으로 바꾸면 ⓑ가 빨강이다** — ${WANT}개를 달랬는데 ${mutTake}개만 온다`, mutTake);
    // 돌연변이를 되돌린 뒤 정본이 다시 산다(되돌림이 실제로 됐는지 — 뒤 검사가 돌연변이 위에서 돌면 안 된다)
    const qBack = Q(A, Bb, 1, WANT);
    ok(qBack.ok === true && qBack.giveNeeded > 0 && T.quote === q0,
      '★전제 — 돌연변이를 되돌렸다(정본 함수가 제자리에 있고 견적이 다시 선다)', `${qBack.giveNeeded}개`);
  }

  say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
