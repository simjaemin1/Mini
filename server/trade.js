// === server/trade.js — 마을 거래소: 플레이어 물물교환 ============================
//
// ★[재민 확정 2026-08-27] 원문: *"마을마다 거래소가 있어서 거기서 모든 경제학이 계산되고
//   npc끼리 교역하잖아 — 거기서 플레이어도 물물교환할 수 있어야 해."*
//   이 배치의 존재 이유 둘: §7 의 경제 실배선(식량을 시장에서 구한다)과
//   첫 30분 ② **"내가 판 물건에 가격이 실제로 움직인다"** — 경제가 진짜인 게임만 가능한 장면이다.
//
// ★★제1 규약 — **가격 사본을 만들면 그 순간 실패다.**
//   교환비는 `econV2.computeShadowPrices(v)` **정본 하나**가 낸 값의 비율이다. 이 파일에는
//   가격을 계산하는 줄이 **하나도 없고**, 접근자(`events.pricesFresh`)만 부른다.
//
// ★★[2026-08-27 · `e2e-trade ⑤` 가 잡은 결함] **하루 캐시(`events.pricesOf`)를 쓰지 않는다.**
//   1차 실장은 `pricesOf(econV2, v, day)` 를 썼다. 그건 NPC 교역(`tickTradeV2`)이 **하루에 한 번**
//   덮는 `v._priceCache` 라, 같은 날 안에서는 재고가 아무리 움직여도 **같은 값을 돌려준다**.
//   실측(캐시가 선 뒤 날을 얼리고 대량 매도): 나무 재고 19.95→26.95(+35%)·돌 150→116(−23%)인데
//   표시 시세도 견적가도 **소수점까지 그대로**였다. 해동 후 하루가 지나서야 1.208→1.098 로 움직였다.
//   결과가 둘이었다:
//     ⓐ 이 배치의 **존재 이유가 화면에서 사라진다** — "내가 판 물건에 값이 실제로 움직인다"(첫 30분 ②)가
//        게임일이 바뀔 때까지 안 보인다. 장부에서만 움직이는 값은 플레이어에게 없는 것이다.
//     ⓑ 더 나쁘게, **화면과 실제가 갈린다** — 표시되는 한계비율은 아침 캐시에서 나오는데
//        실제 수령량은 `planSliced` 가 **지금 재고**로 낸다. 그게 곧 보이지 않는 손이다.
//   ⇒ 거래소가 보는 시세는 **지금 재고의 함수**다. 그림자가격은 원래 재고의 함수이고,
//     하루 캐시는 NPC 교역 틱의 **성능 장치**일 뿐 정본의 정의가 아니다.
//   ⚠이건 econ 변경이 **아니다.** NPC 교역은 종전대로 제 하루 캐시를 읽는다(그 경로는 한 줄도 안 건드렸다).
//     플레이어가 움직인 재고는 다음 날 캐시가 다시 계산될 때 NPC 쪽에도 그대로 반영된다.
//
// ★★가격 반응은 **공짜다.** 교환이 `v.storage` 를 움직이면, 그림자가격은 재고의 함수라
//   다음 조회에서 저절로 달라진다. 그래서 이 파일엔 "가격 갱신" 코드가 없다 —
//   그런 코드를 짜고 있다면 그건 사본을 만들고 있다는 신호다(그 줄에서 멈춰라).
//
// ★물리 상한은 `events.payableQty` 정본을 부른다(B-1 과 **같은 함수** · 두 벌 금지).
'use strict';
const path = require('path');
const Events = require('./events');

const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const CFG = {
  // ★스프레드 — 마을이 살 땐 (1−s), 팔 땐 (1+s). 근거 둘:
  //   ⓐ **왕복 무한 차익 봉쇄** — s=0 이면 A→B→A 가 정확히 보존돼 무한 반복이 성립한다
  //      (`test-trade ②` 가 s=0 대조군으로 그걸 실증하고, 기본값에서 손실을 못 박는다).
  //   ⓑ **교역 세금 = 물물** 캐논의 플레이어 판 — 마진은 마을 몫으로 **물자로** 남는다(`_cash` 아님).
  SPREAD: _num('TRADE_SPREAD', 0.10),
  // 한 거래가 그 품목 재고에서 가져갈 수 있는 상한(B-1 과 같은 뜻·같은 함수).
  STOCK_FRAC: _num('TRADE_STOCK_FRAC', _num('EV_REW_STOCK_FRAC', 0.25)),
  // 시세 표시의 기준 품목 — **표시일 뿐** 계산은 어디까지나 비율이다.
  //   청동기에 곡식이 사실상의 화폐였고, 내부 `_cash`(세곡 장부)와도 정합한다.
  NUMERAIRE: process.env.PRICE_NUMERAIRE || 'food',
  MIN_GIVE: _num('TRADE_MIN_GIVE', 1),
  // ★★조각 수 — 한 거래를 몇 조각으로 나눠 값을 매기나. 아래 `planSliced` 주석이 이유다.
  SLICES: Math.max(1, Math.round(_num('TRADE_SLICES', 12))),
  DEPOSIT_RATE: _num('VILLAGE_DEPOSIT_RATE', 1),   // playerVillageDeposit 와 같은 값(환산율)
};
const KO_NUM = { food: '곡식', fish: '생선', wood: '나무', stone: '돌' };

// ★★[2026-08-27 · `e2e-trade ⑤` 가 같이 잡은 것] 표시는 **유효숫자**로 자른다, 소수점 고정이 아니라.
//   한 마을 안에서 곡식 환산 시세가 109.8 부터 0.002 까지 걸친다. `toFixed(3)` 이면 싼 쪽 네 품목이
//   화면에서 전부 "0.002"로 같아 보이고, 내 거래로 값이 움직여도 **그 자리에서 안 보인다**.
//   값이 같아 보이는 표는 정보가 아니다.
function sig(x, n = 4) { const v = Number(x); return (Number.isFinite(v) && v > 0) ? +v.toPrecision(n) : null; }

// ── 교환 가능 품목 ───────────────────────────────────────────────────────────
//   낼 수 있는 것 = `DEL.fromEcon`(곳간이 받는 재화) · 받을 수 있는 것 = `DEL.toEcon`(대표 아이템이 있는 재화).
//   그 위에 두 겹을 더 건다:
//     ⓐ 마을 **내부용 필드**(`_` 로 시작)는 재화가 아니다.
//     ⓑ **열린 의뢰가 보상으로 약속한 품목**은 팔지 않는다 — 게시판 계약을 거래소가 갉아먹으면
//        플레이어가 낸 뒤에 "갚을 게 없다"를 듣게 된다(게스트보상 배치에서 실제로 겪은 족보).
function lockedRewards(ledger, vid) {
  const out = new Set();
  try { for (const r of (ledger.board(vid) || [])) if (r.rewItem) out.add(r.rewItem); } catch (e) {}
  return out;
}
function tradableIn(ledger) { return ledger.deliverable.fromEcon; }
function tradableOut(ledger, vid) {
  const D = ledger.deliverable, locked = lockedRewards(ledger, vid);
  const out = new Set();
  for (const res of D.toEcon.keys()) { if (res.charCodeAt(0) === 95 || locked.has(res)) continue; out.add(res); }
  return out;
}

// ── 시세표 — 그 마을 앞에서만 부른다(원격 조회 API 를 만들지 않는다 · §3.2 정보 비대칭) ──
//   ★표시 세 칸이면 충분하다: 시세(기준 품목 환산) · 마을이 **사줄 여력** · 마을이 **팔 재고**.
function board(ledger, econV2, vil, vid, inventory) {
  const v = vil.econ;
  const prices = Events.pricesFresh(econV2, v);   // ★지금 재고의 함수 — 하루 캐시가 아니다(머리 주석)
  const D = ledger.deliverable;
  const canIn = tradableIn(ledger), canOut = tradableOut(ledger, vid);
  const pn = +prices[CFG.NUMERAIRE] || 0;
  const rows = [];
  const seen = new Set([...canIn, ...canOut]);
  for (const res of seen) {
    const p = +prices[res] || 0;
    if (!(p > 0)) continue;
    const stock = +((v.storage || {})[res] || 0);
    rows.push({
      res, ko: Events.koRes ? Events.koRes(res) : res,
      item: D.toEcon.get(res) || null,
      give: (D.items.get(res) || []),
      canGive: canIn.has(res), canTake: canOut.has(res),
      // 기준 품목 환산 — 곡식 몇 알 값인가. **표시일 뿐**이다.
      num: pn > 0 ? sig(p / pn) : null,
      stock: +stock.toFixed(2),
      sell: Events.payableQty(stock, CFG.STOCK_FRAC),   // 마을이 지금 내줄 수 있는 양(물리 상한)
      mine: inventory ? (D.items.get(res) || []).reduce((n, it) => n + Math.floor(Number(inventory[it]) || 0), 0) : 0,
    });
  }
  rows.sort((a, b) => (b.num || 0) - (a.num || 0));
  return { vid, name: vil.name, numeraire: CFG.NUMERAIRE, numeraireKo: KO_NUM[CFG.NUMERAIRE] || CFG.NUMERAIRE,
           spread: CFG.SPREAD, rows };
}

// ── ★★조각내어 값 매기기 — 이 배치에서 가장 중요한 함수 ─────────────────────
//
// 1차 실장은 **거래 전 시세로 전량**을 계산했다. 그랬더니 하네스 ②가 잡았다:
//   스프레드를 0 으로 둔 대조군에서 나무 14 → 돌 45 → 나무 **18**. **없던 나무 4개가 생겼다.**
// 왜인가: 내가 나무를 팔면 나무가 흔해져 싸지고, 돌을 사면 돌이 귀해져 비싸진다.
// 그 상태에서 되팔면 **비싸진 돌을 팔고 싸진 나무를 산다** — 왕복의 두 다리가 **둘 다 유리**하다.
// 즉 내 거래가 만든 가격 변화를 내가 그대로 주워 먹는다. 스프레드 10%로는 그 폭을 못 덮는다
// (한 번에 재고의 25%를 움직이니 가격이 그보다 크게 움직인다).
//
// ⇒ 옳은 모양은 **곡선을 따라 적분**하는 것이다. 실제 시장이 그렇듯, 많이 팔수록 **평균 단가가 나빠진다**.
//   그래서 거래를 조각으로 나눠 조각마다 그때의 시세로 값을 매긴다. 그러면
//     · 파는 다리: 팔수록 값이 떨어져 평균이 나빠진다
//     · 사는 다리: 살수록 값이 올라 평균이 나빠진다
//   양쪽 다 **불리**해지고, 왕복은 스프레드가 0 이어도 손해가 된다(하네스 ②의 대조군이 그걸 확인한다).
//
// ★이건 가격 사본이 아니다 — 조각마다 **정본 함수**(`Events.pricesFresh`)를 다시 부를 뿐이다.
//   "가격은 재고의 함수"라는 사실을 **정직하게 쓰는** 것이 이 함수의 전부다.
// ⚠재고를 잠깐 건드렸다가 **반드시 되돌린다**(finally). 이건 계산이지 거래가 아니다.
function planSliced(econV2, v, giveRes, takeRes, giveQty, cap) {
  const s = CFG.SPREAD, n = CFG.SLICES;
  const q = Math.max(0, Number(giveQty) || 0);
  if (!(q > 0)) return { gave: 0, took: 0, ratio: 0 };
  const step = q / n;
  const g0 = +((v.storage || {})[giveRes] || 0), t0 = +((v.storage || {})[takeRes] || 0);
  let gave = 0, took = 0, first = 0;
  try {
    for (let i = 0; i < n; i++) {
      const p = Events.pricesFresh(econV2, v);
      const pA = +p[giveRes] || 0, pB = +p[takeRes] || 0;
      if (!(pA > 0) || !(pB > 0)) break;
      const r = (pA * (1 - s)) / (pB * (1 + s));
      if (i === 0) first = r;
      const t = step * r;
      if (took + t >= cap) {                     // 상한에 닿았다 — 남은 자리만큼만
        const room = Math.max(0, cap - took);
        if (room > 0 && r > 0) { gave += room / r; took += room; }
        break;
      }
      gave += step; took += t;
      v.storage[giveRes] = (v.storage[giveRes] || 0) + step * CFG.DEPOSIT_RATE;
      v.storage[takeRes] = (v.storage[takeRes] || 0) - t;
    }
  } finally {
    v.storage[giveRes] = g0; v.storage[takeRes] = t0;   // ★계산이었을 뿐 — 원상복구
  }
  return { gave, took, ratio: first, avg: gave > 0 ? took / gave : 0 };
}

// ── 견적 ─────────────────────────────────────────────────────────────────────
//   마을이 A 를 살 때는 price(A)×(1−s), B 를 팔 때는 price(B)×(1+s).
//   ⇒ 조각별로 그 비율을 적용하고 합친다(위 planSliced). 표시되는 `ratio` 는 **첫 조각**(=한계가격),
//     실제로 받는 양은 `take`(평균가 반영)다 — 많이 낼수록 단가가 나빠지는 게 화면에도 보인다.
function quote(ledger, econV2, vil, vid, giveRes, takeRes, giveQty) {
  const v = vil.econ;
  if (giveRes === takeRes) return { err: '같은 물건끼리는 바꿀 게 없다' };
  const canIn = tradableIn(ledger), canOut = tradableOut(ledger, vid);
  if (!canIn.has(giveRes)) return { err: '곳간이 받지 않는 물건이다' };
  if (!canOut.has(takeRes)) {
    return { err: lockedRewards(ledger, vid).has(takeRes)
      ? '그건 게시판 의뢰의 삯으로 잡아 둔 것이다 — 마을이 못 판다'
      : '마을이 내주지 않는 물건이다' };
  }
  // ★`planSliced` 의 첫 조각과 **같은 표**를 봐야 표시된 한계비율이 실제 첫 조각과 일치한다.
  const prices = Events.pricesFresh(econV2, v);
  const pA = +prices[giveRes] || 0, pB = +prices[takeRes] || 0;
  if (!(pA > 0) || !(pB > 0)) return { err: '이 마을엔 그 물건의 시세가 없다' };
  const s = CFG.SPREAD;
  const stock = +((v.storage || {})[takeRes] || 0);
  const cap = Events.payableQty(stock, CFG.STOCK_FRAC);
  const q = Math.max(0, Math.floor(Number(giveQty) || 0));
  // 한계비율(첫 조각) — 표시용. 실제 수령량은 아래 planSliced 가 곡선을 따라 낸다.
  const ratio = (pA * (1 - s)) / (pB * (1 + s));
  const plan = q > 0 ? planSliced(econV2, v, giveRes, takeRes, q, cap) : { gave: 0, took: 0 };
  const take = Math.floor(plan.took);
  // 상한을 다 쓰는 최대 낼 양 — 이분 탐색(곡선이라 나눗셈으로 못 낸다). 표시·절삭에 쓴다.
  let lo = 0, hi = Math.max(1, Math.ceil(cap / Math.max(1e-9, ratio)) * 4);
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const pl = planSliced(econV2, v, giveRes, takeRes, mid, cap);
    if (pl.took >= cap - 1e-9) hi = mid; else lo = mid;
  }
  const maxGive = Math.max(0, Math.floor(hi));
  return {
    ok: true, giveRes, takeRes, ratio: +ratio.toFixed(6), spread: s,
    avgRatio: q > 0 ? +(plan.took / Math.max(1e-9, plan.gave)).toFixed(6) : null,
    priceGive: +pA.toFixed(6), priceTake: +pB.toFixed(6),
    stock: +stock.toFixed(2), cap, maxGive,
    give: q, take,
    capped: Math.floor(plan.gave) < q,
    // 표시용 — 기준 품목 환산
    numGive: (+prices[CFG.NUMERAIRE] || 0) > 0 ? sig(pA / prices[CFG.NUMERAIRE]) : null,
    numTake: (+prices[CFG.NUMERAIRE] || 0) > 0 ? sig(pB / prices[CFG.NUMERAIRE]) : null,
  };
}

// ── 실행 — 원자적 ────────────────────────────────────────────────────────────
//   ★순서가 곧 안전이다(B-1 과 동형): ① 견적 ② **재고를 먼저 잡는다** ③ 내 물건을 뺀다
//     ④ 곳간에 넣는다(정본 deposit) ⑤ 못 하면 잡아 둔 재고를 되돌린다.
//   동시 경쟁은 ②의 즉시 차감이 관문이다 — 두 사람이 같은 마지막 재고를 못 가져간다.
function exchange(a) {
  const { ledger, econV2, vil, vid, inventory, giveRes, takeRes, deposit } = a;
  const v = vil.econ;
  const q0 = Math.max(0, Math.floor(Number(a.giveQty) || 0));
  if (q0 < CFG.MIN_GIVE) return { ok: false, err: `${CFG.MIN_GIVE}개 이상은 내야 한다` };
  const D = ledger.deliverable;

  const qt = quote(ledger, econV2, vil, vid, giveRes, takeRes, q0);
  if (qt.err) return { ok: false, err: qt.err };

  // 내가 실제로 들고 있는가 — 한 재화에 여러 아이템이 매핑된다(익힌 음식 등)
  const playerItems = D.items.get(giveRes) || [];
  let have = 0;
  for (const it of playerItems) have += Math.floor(Number(inventory[it]) || 0);
  if (have < q0) return { ok: false, err: '그만큼 갖고 있지 않다' };

  // 물리 상한 — 넘치면 **거절이 아니라 절삭**이다(살 수 있는 만큼은 산다).
  //   ★수량은 견적과 **같은 조각 계획**에서 나온다(견적과 실행이 다른 수를 쓰면 그게 보이지 않는 손이다).
  let give = Math.min(q0, Math.max(0, Math.floor(qt.give && qt.capped ? qt.maxGive : q0)));
  if (give > qt.maxGive) give = qt.maxGive;
  const pl = give > 0 ? planSliced(econV2, v, giveRes, takeRes, give, qt.cap) : { took: 0 };
  let take = Math.floor(pl.took);
  if (!(give > 0) || !(take > 0)) {
    // ★★여기 메시지가 거짓말을 하면 안 된다. 1차 실장에서 "더 내야 한다"고 했는데,
    //   실제로는 **덜 내야** 하는(혹은 아예 못 하는) 상황이었다 — 원인이 정반대였다.
    //   재고 0 인 품목은 그림자가격이 폭발해서(낚시 배치에서 본 그 현상) 생선 한 마리가
    //   마을의 나무 전량보다 비싸진다. 그때 옳은 말은 "**마을이 값을 못 치른다**"이다.
    if (qt.cap <= 0) return { ok: false, err: `마을에 ${Events.koRes(takeRes)}이(가) 남아 있지 않다` };
    if (qt.maxGive < 1) {
      return { ok: false, err: `${Events.koRes(giveRes)} 한 개 값이 마을이 내줄 수 있는 `
        + `${Events.koRes(takeRes)} 전부(${qt.cap})보다 비싸다 — 이 마을은 지금 그 값을 못 치른다` };
    }
    return { ok: false, err: '그 양으론 한 개도 못 바꾼다 — 더 내야 한다' };
  }

  // ② 재고를 **먼저** 잡는다(동시 경쟁의 관문)
  const before = +((v.storage || {})[takeRes] || 0);
  if (before < take) return { ok: false, err: '마을 재고가 방금 줄었다 — 다시 해 보라' };
  v.storage[takeRes] = +(before - take).toFixed(3);

  // ③④ 내 물건 → 곳간(정본 deposit). 실패하면 ⑤ 되돌린다.
  const want = {};
  let left = give;
  for (const it of playerItems) {
    if (left <= 0) break;
    const n = Math.min(left, Math.floor(Number(inventory[it]) || 0));
    if (n > 0) { want[it] = n; left -= n; }
  }
  const dep = deposit(vil, inventory, want);
  if (!dep || !dep.ok) {
    v.storage[takeRes] = before;                      // ⑤ 되돌림
    return { ok: false, err: (dep && dep.err) || '곳간이 받지 않았다' };
  }
  const takeItem = D.toEcon.get(takeRes);
  if (!takeItem) { v.storage[takeRes] = before; return { ok: false, err: '내줄 물건의 실체가 없다' }; }
  inventory[takeItem] = (inventory[takeItem] || 0) + take;

  return { ok: true, vid, name: vil.name, giveRes, takeRes, give, take,
           gaveItems: dep.taken, tookItem: takeItem, ratio: qt.ratio,
           capped: q0 !== give, wanted: q0,
           stockAfter: +v.storage[takeRes].toFixed(3) };
}

module.exports = { CFG, KO_NUM, board, quote, exchange, tradableIn, tradableOut, lockedRewards };
