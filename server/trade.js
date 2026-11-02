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
// ★[T732 · 손잡이 `T732_MOMENT_LOT` · ★[T778] 켬 기본(`=0` 끔)] 곳간 로트 장부 — 견적(`gluttedAt` · `planSliced`)이 곳간을 잠깐 바꿨다 되돌리는 동안은 장부를 멈춘다.
//   늦게 · 켬일 때만 싣는다(끄면 · 랩이면 안 싣는다 — main 바이트 · 랩 모듈 무변). 값은 한 자리도 안 바꾼다.
const _T732_ON = (typeof process !== 'undefined' && process.env && process.env.T732_MOMENT_LOT !== '0');   // ★[T778] 켬 기본 · 되돌림 `=0`
let _t732G = null;
function _t732Pause(on) { if (!_T732_ON) return; if (_t732G === null) { try { _t732G = require('./granary-lots'); } catch (e) { _t732G = false; } } if (_t732G) _t732G.suspend(on); }
// ★★[T748 2026-10-14 · PM 10-14(족보 639) · 같은 손잡이 안 — 호스트가 `takeKcal`(kcal 정본 모듈)을 넘길 때만 · 끔/랩 = 종전 그대로] **거래소 받기 = 열량 짝.**
//   종전: 받는 쪽만 1개 = 1단위(`inventory[takeItem] += take`) — 꺼내기 · 게시판 보상은 T59 부터 `kcal.itemsOf`(1단위 = 하루치 2,450kcal)라
//     같은 곳간 몫이 문마다 다른 낱개로 나왔다(T732 §7-2). 넣는 쪽은 이미 열량이다(`_unitsOfFor` · 회관 = 거래소와 같은 문 · T725).
//   켬: 받을 단위 → 낱개 = `itemsOf`(꺼내기 · 게시판 보상과 **같은 함수**) · 받을 개수 → 단위 = `econUnitsOf`(넣기와 같은 열량 축) ·
//     낱개로 안 떨어지는 몫은 곳간에 남는다(종전 `Math.floor` 의 "넘치는 소수는 거래소 몫"과 같은 뜻 · 소멸 0).
//     열량이 없는 것(나무 · 돌 · 광물)은 종전 그대로 1개 = 1단위(`itemsOf` 가 다루지 않는 품목).
function _takeConv(K, item) {
  if (!K || !item || typeof K.itemsOf !== 'function' || !(K.kcalOf(item) > 0)) return null;
  return { items: (u) => K.itemsOf(item, u), units: (n) => K.econUnitsOf(item, n) };
}

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
  // ★넘침 프로브 — 재고를 이만큼 늘려 보고도 값이 안 내려가면 "바닥"이다(아래 `gluttedAt`).
  GLUT_PROBE_FRAC: _num('TRADE_GLUT_PROBE_FRAC', 0.5),
  GLUT_PROBE_MIN: _num('TRADE_GLUT_PROBE_MIN', 5),
  // ★[T69] 올림의 걸음 상한 — 이분 탐색이 낸 자리에서 한두 칸이면 끝난다(개체 무게가 섞여도).
  //   무한 루프를 막는 안전핀이지 손잡이가 아니다.
  CLIMB_MAX: 8,
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

// ── ★★넘침 판정 — "아무리 팔아도 값이 안 내려간다"를 화면이 말한다 ─────────────
//
// ★[재민 확정 2026-08-27] 왜 필요한가: `e2e-trade ⑤` 에서 **하네스가 세 번 속았다** —
//   과잉 재고 품목은 그림자가격이 바닥에 붙어 재고가 더 늘어도 값이 안 움직이는데,
//   화면은 그걸 말하지 않으니 "내 거래가 시세를 못 움직였다"로 읽힌다.
//   계측기가 속은 자리에서 **플레이어도 똑같이 속는다.** 그래서 딱지를 붙인다.
//
// ★★판정을 **다시 계산하지 않는다.** 바닥 상수(`PRICE_ADJ_MIN`)를 여기 옮겨 적으면 그게 사본이고,
//   econ 이 그 상수를 바꾸는 날 화면만 거짓말을 하게 된다. 대신 **정본에게 물어본다**:
//   그 품목 재고를 잠깐 크게 늘려 보고 **값이 그래도 안 움직이면** 바닥이다.
//   (`planSliced` 와 같은 문법 — 재고를 건드렸다가 `finally` 로 되돌린다. 계산이지 거래가 아니다.)
function gluttedAt(econV2, v, res, stock) {
  const st = v.storage || {};
  const before = +st[res] || 0;
  const p0 = +Events.pricesFresh(econV2, v)[res] || 0;
  if (!(p0 > 0)) return false;
  _t732Pause(true);   // ★[T732] 계산이지 거래가 아니다 — 장부 멈춤(끄면 무동작)
  try {
    st[res] = before + Math.max(CFG.GLUT_PROBE_MIN, before * CFG.GLUT_PROBE_FRAC);
    const p1 = +Events.pricesFresh(econV2, v)[res] || 0;
    // 재고를 크게 늘렸는데 값이 **한 톨도** 안 내려가면 바닥이다.
    return !(p1 < p0 * (1 - 1e-9));
  } finally { st[res] = before; _t732Pause(false); }
}

// ── 시세표 — 그 마을 앞에서만 부른다(원격 조회 API 를 만들지 않는다 · §3.2 정보 비대칭) ──
//   ★표시 세 칸이면 충분하다: 시세(기준 품목 환산) · 마을이 **사줄 여력** · 마을이 **팔 재고**.
function board(ledger, econV2, vil, vid, inventory, numeraire, takeKcal) {
  const v = vil.econ;
  const prices = Events.pricesFresh(econV2, v);   // ★지금 재고의 함수 — 하루 캐시가 아니다(머리 주석)
  const D = ledger.deliverable;
  const canIn = tradableIn(ledger), canOut = tradableOut(ledger, vid);
  // ★★[T69 · 캐논 §3① · 재민 확정 2026-09-03] 기준 품목은 **요청마다 온다.**
  //   거래소에선 내 짐에서 낼 물건을 먼저 고르고, 시세는 **그 물건 기준**으로 보인다
  //   (나무를 팔면 모든 시세가 "나무 몇 개"). 이건 **표시 기준**일 뿐이다 —
  //   값을 새로 계산하는 줄은 한 줄도 없고(머리 제1 규약), 나누는 **분모 하나**가
  //   달라질 뿐 분자는 종전과 같은 정본 표다.
  //   ★아직 안 골랐거나 그 마을에 시세가 없는 품목이면 종전 기준(곡식)으로 돌아간다.
  const nres = (numeraire && +prices[numeraire] > 0) ? String(numeraire) : CFG.NUMERAIRE;
  const pn = +prices[nres] || 0;
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
      // 기준 품목 환산 — **낼 물건 몇 개** 값인가(기준 행 자신은 정확히 1). **표시일 뿐**이다.
      num: pn > 0 ? sig(p / pn) : null,
      stock: +stock.toFixed(2),
      sell: (() => { const q = Events.payableQty(stock, CFG.STOCK_FRAC); const cv = takeKcal ? _takeConv(takeKcal, D.toEcon.get(res)) : null; return cv ? cv.items(q).items : q; })(),   // 마을이 지금 내줄 수 있는 양(물리 상한) · ★[T748] 켬이면 받을 낱개(열량 짝)
      mine: inventory ? (D.items.get(res) || []).reduce((n, it) => n + Math.floor(Number(inventory[it]) || 0), 0) : 0,
      glut: gluttedAt(econV2, v, res, stock),           // ★넘침 — 아래 함수 주석 참조
    });
  }
  rows.sort((a, b) => (b.num || 0) - (a.num || 0));
  // ★한글 이름은 **정본 한 자리**(`Events.koRes`)가 낸다 — 위 행들과 같은 함수다.
  //   `KO_NUM` 은 그 정본이 없는 경우의 폴백일 뿐이다(네 줄짜리 표가 기준을 정하면 그게 사본이다).
  return { vid, name: vil.name, numeraire: nres,
           numeraireKo: (Events.koRes ? Events.koRes(nres) : null) || KO_NUM[nres] || nres,
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
  _t732Pause(true);   // ★[T732] 조각 계획은 계산이다 — 장부 멈춤(끄면 무동작)
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
    _t732Pause(false);
  }
  return { gave, took, ratio: first, avg: gave > 0 ? took / gave : 0 };
}

// ── 견적 ─────────────────────────────────────────────────────────────────────
//   마을이 A 를 살 때는 price(A)×(1−s), B 를 팔 때는 price(B)×(1+s).
//   ⇒ 조각별로 그 비율을 적용하고 합친다(위 planSliced). 표시되는 `ratio` 는 **첫 조각**(=한계가격),
//     실제로 받는 양은 `take`(평균가 반영)다 — 많이 낼수록 단가가 나빠지는 게 화면에도 보인다.
// ★★[T69 · 캐논 §3② · 재민 확정 2026-09-03] **받을 양으로 묻기** — "돌 3개를 받으려면 나무 몇 개?"
//   종전 견적은 **내는 양 기준뿐**이었다(give → take = floor). 그래서 캐논 ②의 "내는 쪽 올림"이
//   **설 자리가 없었다** — 올릴 대상 자체가 화면에 없었다.
//
// ★★이건 **새 가격 계산이 아니다.** 아래 `quote` 가 상한을 다 쓰는 `maxGive` 를 내는 그
//   **같은 이분 탐색**을, 목표만 `cap` 에서 `want` 로 바꿔 한 번 더 도는 것이다
//   (곡선이라 나눗셈으로 못 낸다 — `planSliced` 재호출뿐이고 값을 짓는 줄은 여전히 0이다).
//   그 최소 give 를 **개수로 올린 것**이 곧 캐논 ②의 올림이다.
//
// ⚠상계(`hi0`)는 **`cap` 에 닿는 give**를 그대로 받는다. `want ≤ cap` 이면 그 give 에서
//   `took ≥ cap ≥ want` 가 반드시 서므로 탐색이 헛돌지 않는다. `want/ratio×4` 같은 어림을
//   상계로 쓰면 곡선이 나쁜 마을에서 상계가 목표에 **못 닿아** 조용히 틀린 수를 낸다.
// ★★★**올림은 이 함수 하나다.** `quote`(견적)와 `exchange`(실행)가 **같은 걸음**을 부른다.
//   왜 하나여야 하나: 견적은 "개당 단위"를 **한 개짜리 어림**으로 잡고, 실행은 **고른 그 개체들의
//   실제 무게**로 잰다 — 자가 다르니 실행이 한 칸 더 올라가야 할 때가 있다. 그 걸음을 양쪽에
//   따로 적으면 그게 **사본**이고, 한쪽만 고쳐지는 날 견적과 실행이 다른 수를 말한다
//   (실제로 그렇게 짰다가 `test-trade ⑨ⓓ` 돌연변이가 잡았다 — 견적을 내림으로 망가뜨렸는데
//    실행 쪽 사본이 조용히 고쳐 줘서 검사가 초록이었다).
//
// ★★걸음의 정의: **한 칸 아래에서 출발해, 받을 양에 닿는 첫 정수까지 올라간다.** 그 첫 정수가
//   정의상 최소이고, 그것이 캐논 ②의 올림이다. ⚠이 걸음을 빼면 그대로 **내림**이 된다.
//   판정은 새 수식이 아니라 `planSliced` 재호출뿐이다(머리 제1 규약 — 가격 사본 0).
// ★★[T807 2026-10-19 · 세션5 · T792 회부 2] **견적 ≠ 실행(상한에 닿을 때)** — 손잡이 하나 `T807_QUOTE_TRIM`(★T817 켬 기본 · `=0` = 종전 견적).
//   결함: 상한(곳간 재고 × `STOCK_FRAC` — `payableQty`)에 닿으면 견적은 **소수 give**(상한에 닿는 그 몫)로 받을 양을 냈고(`take` = 상한),
//     실행은 낼 양을 **낱개로 내려**(`⌊maxGive ÷ 평균 단위/개⌋`) 그 give 로 받았다 — 화면이 "6 내면 44" 라 하고 실제로 4 를 받아 36 을 줬다
//     (받을 게 1 칸뿐이면 견적 1 · 실행 "한 개도 못 바꾼다").
//   켜면 견적과 실행이 **이 한 함수**(`_trimToCap`)로 상한 절삭을 한다(사본 0 · 같은 `planSliced`) — 견적의 `take` = 실행이 줄 양 ·
//     `giveUsed`(실제로 받을 낱개) 칸 하나를 더 싣는다. 새 수 0.
const T807_ON = !(typeof process !== 'undefined' && process.env && process.env.T807_QUOTE_TRIM === '0');   // ★[T817 · PM 10-20] 켬 기본(견적은 실제로 받을 양을 보인다 · 실행은 켬 · 끔 같다) · 되돌림 `=0`
//   n0 = 낸다고 한 낱개 · unitsAt(c) = c 개의 단위(견적 = 한 개짜리 어림 × c · 실행 = 고른 그 개체들의 실제 무게) ·
//   perItem = 평균 단위/개(절삭의 자 — 종전 실행 글자 그대로) · capped 가 아니면 n0 그대로.
// ★★[T835 2026-10-21 · 세션5 · T807 [정보]] **무거운 물건 견적도 고른 그 개체들의 무게로** — 손잡이 하나 `T835_QUOTE_WEIGHT`(★T847 켬 기본 · `=0` = 종전 견적).
//   결함: 견적은 낼 물건의 단위를 **한 개짜리 어림**(첫 아이템 1개 단위 × 개수 · 호스트 `villageTradeQuote`)으로 잡았고,
//     실행은 **고른 그 개체들**(`_pick` — 정본 순서로 어느 아이템에서 몇 개 · `_units` — 개체 무게 · 로트 신선도)로 잰다 — 무게가 다른 짐이면 견적 ≠ 실행.
//   켜면 견적이 실행과 **같은 고르기 · 같은 단위 셈**(`_giver` — 아래 · 실행도 이 함수다 · 사본 0)을 지난다: 낼 단위 · 평균 단위/개 · 상한 절삭의 자 ·
//     받을 양 주문의 올림 걸음이 전부 고른 개체로. 마른 실행이다(곳간 · 몸 · 인벤 무변 — `_pick` 은 읽기만 한다).
const T835_ON = !(typeof process !== 'undefined' && process.env && process.env.T835_QUOTE_WEIGHT === '0');   // ★[T847 · PM 10-22] 켬 기본(견적 = 실행 — 고른 그 개체들의 무게) · 되돌림 `=0`
//   낼 물건 고르기 · 단위 셈 — 실행(`exchange`)의 그 몸통 그대로(이름만 올렸다 · 견적이 켬일 때 같은 함수를 부른다).
function _giver(D, inventory, giveRes, unitsOf) {
  const playerItems = D.items.get(giveRes) || [];
  let have = 0;
  for (const it of playerItems) have += Math.floor(Number(inventory[it]) || 0);
  const pick = (cnt) => {                        // 개수 cnt 를 어느 아이템에서 몇 개씩 뺄지(정본 순서)
    const w = {}; let left = cnt;
    for (const it of playerItems) { if (left <= 0) break;
      const n = Math.min(left, Math.floor(Number(inventory[it]) || 0)); if (n > 0) { w[it] = n; left -= n; } }
    return w;
  };
  const units = (w) => { let u = 0; for (const [it, n] of Object.entries(w)) u += unitsOf ? Number(unitsOf(it, n)) || n : n; return u; };
  //   ★[T965] c 개의 단위(가진 것 너머는 첫 개체 단위로 잇는다 — 실행은 거기서 "없다") — 견적의 `_gAt` 식을 이리 올렸다(견적 · 실행이 같은 함수 · 값 무변)
  const at = (c) => (c <= have ? units(pick(c)) : units(pick(have)) + (c - have) * ((have >= 1 ? units(pick(1)) : 0) || 1));
  return { playerItems, have, pick, units, at };
}
// ★★[T999 2026-10-30 · 세션2 · T988 회부 1 · 2] **상한의 마지막 한 개도 판다 · 상한 탐색은 상한에 닿을 때까지 넓힌다** — 손잡이 하나 `T999_TRADE_CAP`(켬 기본 · 되돌림 `=0` = 종전 바이트).
//   결함 ① 상한 절삭(아래 `_trimToCap`)은 낼 낱개를 `⌊maxGive ÷ 평균 단위⌋` 로 깎았다. `maxGive = ⌊T⌋`(T = 마을이 내줄 몫 전부를 사는 낼 단위)라
//     깎인 낱개의 단위는 늘 T 아래다 — 받는 몫이 상한에 못 닿는다(상한 N 이면 많아야 N − 1 · 상한 1 판은 어느 양으로도 한 개를 못 받는다).
//   결함 ② 상한 이분 탐색(견적 `hiCap` · `maxGive`)의 첫 상계 `⌈cap ÷ 첫 조각 비율⌉ × 4` 가 T 보다 작으면 넓히지 않아 `maxGive` 가 작게 끝났다
//     (한 개를 낼수록 값이 나빠지는 짝 — 익힌 음식 → 곡식).
//   켜면 ① 상한에 닿은 주문(`capped`)은 낸 그대로 받을 양(상한까지)을 받는 **가장 적은 낱개**로 깎는다(이분 탐색 · 받을 낱개는 낱개를 더할수록 안 준다) —
//     넘는 몫은 마지막 낱개의 조각뿐이다(캐논 ② 올림 · ③ 넘치는 소수는 거래소 몫과 같은 꼴). 낼 것 한 개를 마을이 다 못 받는 판(한 개 넘침)은 종전 절삭 그대로다
//     (그 판은 거절 — "… 한 개 값이 … 전부(N)보다 비싸다 — 이 마을은 지금 그 값을 못 치른다").
//     ② 상한 탐색은 받을 양 올림의 연속해와 같은 함수(`_giveForTake` — 받을 양 = 상한 · 상계가 못 닿으면 두 배씩 넓힌다)로 — 첫 상계가 닿는 판은 종전과 한 자리도 안 다르다.
//   견적 · 실행이 같은 함수를 지난다(T807 · T835 · T965 견적 = 실행 그대로) · 새 수 0. ① 은 이 함수를 지나는 T807 켬 갈래에서만 선다(T807 끔이면 종전 실행 글자).
const T999_ON = !(typeof process !== 'undefined' && process.env && process.env.T999_TRADE_CAP === '0');   // ★[T999] 켬 기본 · 되돌림 `=0`
function _trimToCap(econV2, v, giveRes, takeRes, n0, unitsAt, capped, maxGive, perItem, cap, takeN) {
  if (T999_ON && capped && n0 >= 1 && typeof takeN === 'function') {   // ★[T999] 상한에 닿은 주문 — 받을 양 그대로 가장 적게 내는 낱개(한 개 넘침은 아래 종전 절삭)
    const u1 = unitsAt(1);
    if (u1 > 0 && planSliced(econV2, v, giveRes, takeRes, u1, cap).gave >= u1 - 1e-9) {   // 낼 것 한 개는 마을이 다 받는다
      const tk = (c) => takeN(planSliced(econV2, v, giveRes, takeRes, unitsAt(c), cap).took);
      const top = tk(n0);   // 낸 그대로 받을 양(상한에 닿았으니 상한 전부)
      let lo = 0, hi = n0;
      while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (tk(mid) >= top) hi = mid; else lo = mid; }
      const u = unitsAt(hi);
      return { n: hi, u, took: planSliced(econV2, v, giveRes, takeRes, u, cap).took };
    }
  }
  const n = (capped && perItem > 0) ? Math.min(n0, Math.floor(maxGive / perItem)) : n0;
  const u = unitsAt(n);
  const pl = u > 0 ? planSliced(econV2, v, giveRes, takeRes, u, cap) : { took: 0 };
  return { n, u, took: pl.took };
}
// ★★[T965 2026-10-28 · 세션2 · land1028 게이트 `test-t835-quote-weight` ⓓ 빨강] **받을 양 주문의 올림 걸음은 고른 그 개체들의 단위로 연속해 아래 마지막 낱개에서 출발한다** —
//   손잡이 하나 `T965_WANT_START`(켬 기본 · 되돌림 `=0` = 종전 바이트).
//   결함: 올림 걸음(`_climbToWant`)은 위로만 걷는다 — "한 칸 아래에서 출발해 닿는 첫 정수까지"가 최소가 되려면 출발점이 최소 낱개 **아래**여야 한다.
//     견적의 켬 갈래(T835)는 단위를 고른 그 개체들(`_gAt`)로 재면서도 출발점은 `⌊연속해 ÷ 첫 개체 단위⌋` 였다 — 정본 순서로 고르면 뒤 아이템이 앞 것보다
//     무거울 수 있고(익힌 음식 — 생선 0.9 단위 뒤에 고기 3.0 단위) 그때 출발점이 최소보다 **위**에서 시작해 내려오지 못한다 → 받을 양보다 많이 내고
//     (열다섯째 판 시드 7 · 마을 5 · 200날 · 마을3 익힌 음식 → 나무 21: 최소 10개 · 견적 20 에서 출발 → 상한 절삭으로 12 · 실행 11 = 견적 ≠ 실행 · 넘침),
//     실행은 견적의 낱개에서 출발해 위로만 걸어 같이 넘친다(끔 견적 — 한 개짜리 어림 — 에서 출발해도 같다).
//   켜면 두 자리(견적의 켬 갈래 · 실행의 받을 양 주문)가 출발점을 **단위가 연속해를 안 넘는 마지막 낱개**(아래 `_countAtOrBelow` — 고른 그 개체들의
//     단위 함수에 정수 이분 탐색 · 단위는 낱개를 더할수록 는다)로 잡는다 — 무게가 고르면 종전 출발점과 같은 수다. 걸음 · 절삭 · 값 셈은 그대로(새 수 0).
const T965_ON = !(typeof process !== 'undefined' && process.env && process.env.T965_WANT_START === '0');   // ★[T965] 켬 기본 · 되돌림 `=0`
function _countAtOrBelow(gu, unitsAt, maxN) {   // 단위(`unitsAt(c)`)가 연속해 `gu` 를 안 넘는 마지막 낱개 c(0 ~ maxN) — 0 낱개 = 0 단위
  let lo = 0, hi = 1;
  while (hi < maxN && unitsAt(hi) <= gu) { lo = hi; hi = Math.min(maxN, hi * 2); }
  if (unitsAt(hi) <= gu) return hi;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (unitsAt(mid) <= gu) lo = mid; else hi = mid; }
  return lo;
}
function _climbToWant(n0, want, unitsAt, takeAt, maxN) {
  let n = Math.max(CFG.MIN_GIVE, n0);
  for (let k = 0; k < CFG.CLIMB_MAX && n < maxN && takeAt(unitsAt(n)) < want; k++) n++;
  return n;
}

function _giveForTake(econV2, v, giveRes, takeRes, want, cap, hi0) {
  let lo = 0, hi = Math.max(1e-9, hi0);
  for (let k = 0; k < 8; k++) {                 // 상계가 목표에 못 닿으면 넓힌다(그럴 일은 없어야 한다)
    if (planSliced(econV2, v, giveRes, takeRes, hi, cap).took >= want - 1e-9) break;
    lo = hi; hi *= 2;
  }
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const pl = planSliced(econV2, v, giveRes, takeRes, mid, cap);
    if (pl.took >= want - 1e-9) hi = mid; else lo = mid;
  }
  return hi;
}

// ★★[T976 2026-10-28 · 세션2 · T965 회부 1] **받을 양 견적의 `wantCapped` 는 상한 절삭이 놓은 그대로 둔다** — 손잡이 하나 `T976_WANT_CAPPED`(켬 기본 · 되돌림 `=0` = 종전 바이트).
//   결함: 받을 양 갈래 끝 줄 `out.wantCapped = false;`(T69 · 09-03)가 T835 상한 절삭(10-21)이 놓은 `true` 를 곧바로 덮었다. 그 판은 마을이 지금 내줄 몫 전부(`cap`)가
//     낼 것 한 개 값에 못 미쳐 절삭이 낱개 0 을 낸 판이다(`giveNeeded` · `takeAtNeeded` = null · 실행은 "… 못 내준다 — 지금 내줄 수 있는 건 N까지다"로 거절).
//     견적이 `wantCapped = false` 라 클라 받을 양 축(`50-i-panel.js` `renderTradePanel`)은 경고도 '내야 할' 줄도 안 그리고 '바꾼다' 단추만 꺼진다 — 까닭 0.
//   켜면 끝 줄이 절삭이 `true` 를 놓은 판만 건너뛴다(그 밖은 종전처럼 false). 낱개 · 받을 양 · 절삭 · 값 · 실행은 그대로다(새 수 0).
const T976_ON = !(typeof process !== 'undefined' && process.env && process.env.T976_WANT_CAPPED === '0');   // ★[T976] 켬 기본 · 되돌림 `=0`
// ★★[T988 2026-10-28 · 세션2 · T976 회부 1 · 2] **거래가 안 서는 판의 말은 그 판의 참이다** — 손잡이 하나 `T988_TRADE_WORDS`(켬 기본 · 되돌림 `=0` = 종전 바이트).
//   결함(말만 · 값 무변): 실행 거절 말이 판을 잘못 갈랐다 —
//     ⓐ 받을 양 주문에서 T835 절삭이 낱개 0 을 낸 판(받을 양 ≤ 상한)도 "… N개를 못 내준다 — 지금 내줄 수 있는 건 N까지다"(받을 양 > 상한의 말) ·
//        화면도 T976 경고 "마을이 지금 내줄 수 있는 X은(는) N까지다" — 받을 양이 N 보다 작은데 상한을 까닭으로 댔다.
//     ⓑ 낼 양 축은 `maxGive < 1` 일 때만 "… 한 개 값이 … 전부(N)보다 비싸다 — 못 치른다" · 그 밖은 늘 "그 양으론 한 개도 못 바꾼다 — 더 내야 한다" —
//        `maxGive`(상한을 다 사는 낼 단위의 내림)가 1 이상인데 낱개 하나가 그보다 무겁거나 절삭에 깎인 판은 더 내도 안 된다(거꾸로).
//     ⓒ 받을 양 주문이 절삭돼 받을 양에 못 닿는 판(받을 < 받을 양)에 화면이 "X W 받으려면 — 내야 할 G n (낱개라 올림 …)" — 그 n 으로는 W 에 못 닿는다.
//   켜면 거절 말은 아래 `_whyNot` 하나가 낸다(견적 · 실행 같은 함수 · 말은 종전 낱말 그대로 — 새 말투 0):
//     상한 0 → "마을에 X이(가) 남아 있지 않다" · 낼 것 한 개(고른 첫 개체)를 마을이 다 못 받는다(그 한 개의 조각 계획이 상한에 닿는다) → "… 한 개 값이 … 전부(N)보다 비싸다 —
//     이 마을은 지금 그 값을 못 치른다" · 더 내면 선다(아래 `_moreWorks`) → "그 양으론 한 개도 못 바꾼다 — 더 내야 한다" · 그 밖 →
//     "그 양으론 한 개도 못 바꾼다"(종전 말의 앞 토막 — 그 양으로는 거래가 안 선다는 말이라 거절 판엔 늘 참이다).
//   "더 내야 한다" 의 참(`_moreWorks` · 읽기만 · 실행과 같은 식): 낸 낱개가 상한 절삭에 안 걸렸고 · 가진 것 안에서 상한 절삭이 안 걸리는 마지막 낱개 n* 이
//     낸 낱개보다 많고 · n* 를 내면 한 개라도 받는다(낱개를 더할수록 단위가 늘고 상한 걸림은 그 단위의 조각 계획이 정한다 — 이분 탐색).
//     상한 1 판(곳간 재고 4 이상 8 미만 · `STOCK_FRAC` 0.25)처럼 낱개 하나는 상한을 다 사는 단위보다 가볍지만 둘은 넘는 판은 n* 도 한 개를 못 받는다 — "더 내야 한다" 는 거기서 거짓이다.
//     그 밖(절삭에 걸린 판 · n* 도 못 받는 판 · 더 가진 것이 없는 판)은 앞 토막이다 — 더 내서 서는 길이 절삭 뒤에만 있어도 앞 토막은 참이다("더 내라" 를 말하지 않는다).
//     견적은 낼 사람 인벤이 와서(T835 켬) 그만큼 가졌을 때만 가진 것 안에서 · 인벤이 없으면(T835 끔 · 랩) 그 낱개 자(`perItem`)로 `maxGive + 1` 단위가 되는 낱개까지.
//   견적은 거절할 판에 그 말을 `why` 로 싣고(받을 양 축 절삭 0 판 · 낼 양 축 받을 낱개 0 판) 받을 양이 절삭돼 못 닿는 판엔 `wantShort` 를 싣는다 —
//     클라는 그 칸이 오면 그 말 · 낼 양 축의 그 줄("G n X t" · "마을이 내줄 수 있는 건 N까지 — n개만 받는다")을 그린다(칸이 없으면 종전 글자 그대로).
const T988_ON = !(typeof process !== 'undefined' && process.env && process.env.T988_TRADE_WORDS === '0');   // ★[T988] 켬 기본 · 되돌림 `=0`
function _moreWorks(econV2, v, giveRes, takeRes, n0, maxN, unitsAt, capU, takeN) {   // ★[T988] 낸 낱개 n0 보다 많이(maxN 까지) 내면 한 개라도 받나 — 상한 절삭 안 걸리는 마지막 낱개 n* 로(읽기만)
  const free = (c) => { const u = unitsAt(c); return u > 0 && planSliced(econV2, v, giveRes, takeRes, u, capU).gave >= u - 1e-9; };   // 그 낱개는 상한 절삭에 안 걸린다
  if (!(maxN > n0)) return false;
  if (T999_ON && !free(maxN)) return true;   // ★[T999] 가진 것 안에 상한에 닿는 낱개가 있다 — 절삭이 상한까지 판다(한 개 넘침은 `_whyNot` 이 먼저 가른다)
  if (!free(n0 + 1)) return false;
  let lo = n0 + 1, hi = maxN;
  if (free(hi)) lo = hi;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (free(mid)) lo = mid; else hi = mid; }
  return takeN(planSliced(econV2, v, giveRes, takeRes, unitsAt(lo), capU).took) > 0;
}
function _whyNot(econV2, v, giveRes, takeRes, capShow, capU, u1, more) {   // ★[T988] 거래가 안 서는 판의 말 하나(견적 · 실행 같은 함수 · 읽기만)
  if (capShow <= 0) return `마을에 ${Events.koRes(takeRes)}이(가) 남아 있지 않습니다.`;
  if (u1 > 0 && planSliced(econV2, v, giveRes, takeRes, u1, capU).gave < u1 - 1e-9) {
    return `${Events.koRes(giveRes)} 한 개 값이 마을이 내줄 수 있는 `
      + `${Events.koRes(takeRes)} 전부(${capShow})보다 비쌉니다. 이 마을은 지금 그 값을 치를 수 없습니다.`;
  }
  return more ? '그 양으로는 한 개도 바꿀 수 없습니다. 더 내야 합니다.' : '그 양으로는 한 개도 바꿀 수 없습니다.';
}
function quote(ledger, econV2, vil, vid, giveRes, takeRes, giveQty, opts) {
  const v = vil.econ;
  if (giveRes === takeRes) return { err: '같은 물건끼리는 바꿀 수 없습니다.' };
  const canIn = tradableIn(ledger), canOut = tradableOut(ledger, vid);
  if (!canIn.has(giveRes)) return { err: '곳간이 받지 않는 물건입니다.' };
  if (!canOut.has(takeRes)) {
    return { err: lockedRewards(ledger, vid).has(takeRes)
      ? '그것은 게시판 부탁의 삯으로 잡아 둔 것이라 마을이 팔 수 없습니다.'
      : '마을이 내주지 않는 물건입니다.' };
  }
  // ★`planSliced` 의 첫 조각과 **같은 표**를 봐야 표시된 한계비율이 실제 첫 조각과 일치한다.
  const prices = Events.pricesFresh(econV2, v);
  const pA = +prices[giveRes] || 0, pB = +prices[takeRes] || 0;
  if (!(pA > 0) || !(pB > 0)) return { err: '이 마을에는 그 물건의 시세가 없습니다.' };
  const s = CFG.SPREAD;
  const stock = +((v.storage || {})[takeRes] || 0);
  const cap = Events.payableQty(stock, CFG.STOCK_FRAC);
  // ★[무게 배치] **분수 수량을 허용한다** — 2kg 물고기 한 마리는 표준 0.9kg 짜리 2.22 '단위'다.
  //   개수는 정수지만 **재화 단위는 개체 무게에 비례**하므로 여기서 자르면 큰 물고기가 손해를 본다.
  //   ★[T835] 켬 + 호스트가 낼 사람 인벤(`opts.inventory`)을 넘겼으면 낼 단위 = **고른 그 개체들**(`_giver` · 실행과 같은 함수) — 개수는 `opts.giveCount`.
  const _G = (T835_ON && opts && opts.inventory) ? _giver(ledger.deliverable, opts.inventory, giveRes, (typeof opts.unitsOf === 'function') ? opts.unitsOf : null) : null;
  const _gN = (_G && Number(opts.giveCount) >= 1 && _G.have >= Math.floor(Number(opts.giveCount))) ? Math.floor(Number(opts.giveCount)) : 0;
  const _gAt = _G ? _G.at : null;   // c 개의 단위(가진 것 너머는 첫 개체 단위로 잇는다 — 실행은 거기서 "없다") · ★[T965] 식은 `_giver` 의 `at`(값 무변)
  const q = _gN ? _gAt(_gN) : Math.max(0, Number(giveQty) || 0);
  // 한계비율(첫 조각) — 표시용. 실제 수령량은 아래 planSliced 가 곡선을 따라 낸다.
  const ratio = (pA * (1 - s)) / (pB * (1 + s));
  const plan = q > 0 ? planSliced(econV2, v, giveRes, takeRes, q, cap) : { gave: 0, took: 0 };
  const conv = (opts && opts.takeKcal) ? _takeConv(opts.takeKcal, ledger.deliverable.toEcon.get(takeRes)) : null;   // ★[T748] 받는 쪽 열량 짝(끔 = null)
  const _tkN = (t) => (conv ? conv.items(t).items : Math.floor(t));   // ★[T999] 받을 단위 → 받을 낱개(아래 `take` 와 같은 식 · 상한 절삭이 받을 양을 견준다)
  const take = conv ? conv.items(plan.took).items : Math.floor(plan.took);
  // 상한을 다 쓰는 최대 낼 양 — 이분 탐색(곡선이라 나눗셈으로 못 낸다). 표시·절삭에 쓴다.
  let lo = 0, hi = Math.max(1, Math.ceil(cap / Math.max(1e-9, ratio)) * 4);
  if (T999_ON) hi = _giveForTake(econV2, v, giveRes, takeRes, cap, cap, hi);   // ★[T999] 상한 전부를 받을 양으로 한 연속해 — 첫 상계가 못 닿으면 넓힌다(닿는 판은 아래 종전 걸음과 같은 수)
  else for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const pl = planSliced(econV2, v, giveRes, takeRes, mid, cap);
    if (pl.took >= cap - 1e-9) hi = mid; else lo = mid;
  }
  const hiCap = hi;                            // ★올림 탐색의 상계 — 위 주석의 그 이유로 이 값을 쓴다
  const maxGive = Math.max(0, Math.floor(hi));
  const out = {
    ok: true, giveRes, takeRes, ratio: +ratio.toFixed(6), spread: s,
    avgRatio: q > 0 ? +(plan.took / Math.max(1e-9, plan.gave)).toFixed(6) : null,
    priceGive: +pA.toFixed(6), priceTake: +pB.toFixed(6),
    stock: +stock.toFixed(2), cap: conv ? conv.items(cap).items : cap, maxGive,
    give: q, take,
    // ★★[T83 ⓪ · T69 §7 이 적어 둔 표시 결함] 종전은 `Math.floor(plan.gave) < q` 였다.
    //   `q` 는 **재화 단위**라 소수다(생선 1개 = 0.18단위) ⇒ 상한에 안 걸렸는데도 `floor(2.18)=2 < 2.18`
    //   이라 늘 참이 되어, 화면이 "마을이 내줄 수 있는 건 …까지"를 **거짓으로** 띄웠다.
    //   ⇒ 같은 자(단위)로 잰다: **낸다고 한 만큼을 계획이 다 못 썼나**. 값은 안 바뀐다(절삭은
    //     `exchange` 의 `Math.min(q0, …)` 이 하고 있었다) — 거짓말하던 표시 하나가 참이 될 뿐이다.
    capped: plan.gave < q - 1e-9,
    // 표시용 — 기준 품목 환산
    numGive: (+prices[CFG.NUMERAIRE] || 0) > 0 ? sig(pA / prices[CFG.NUMERAIRE]) : null,
    numTake: (+prices[CFG.NUMERAIRE] || 0) > 0 ? sig(pB / prices[CFG.NUMERAIRE]) : null,
  };
  if (conv) out.capU = cap;   // ★[T748] 단위 상한(실행이 조각 계획에 쓴다 · 화면 `cap` 은 받을 낱개)
  if (_gN) out.giveUnitsPicked = +q.toFixed(3);   // ★[T835] 켬 = 견적이 잰 낼 단위(고른 그 개체들)
  if (T807_ON && out.capped) {   // ★[T807] 상한에 닿았다 — 실행과 같은 절삭(`_trimToCap`)으로 받을 양을 다시 낸다(끔 = 이 줄 무동작)
    const per = _gN ? q / _gN : ((opts && Number(opts.perItem) > 0) ? Number(opts.perItem) : 1);   // ★[T835] 켬 = 실행의 평균 단위/개(고른 그 개체들 ÷ 개수)
    const tr = _trimToCap(econV2, v, giveRes, takeRes, _gN || Math.floor(q / per + 1e-9), _gN ? _gAt : ((c) => c * per), true, maxGive, per, cap, _tkN);
    out.take = conv ? conv.items(tr.took).items : Math.floor(tr.took);
    out.giveUsed = tr.n; out.giveUsedUnits = +tr.u.toFixed(3);
  }

  // ── ★받을 양으로 물었다면: 내야 할 양(올림) ───────────────────────────────
  const o = opts || {};
  const want = Math.max(0, Math.floor(Number(o.want) || 0));
  if (want > 0) {
    // 개수↔단위: 낼 물건 한 개가 몇 '단위'인가(큰 물고기 한 마리 = 2.22단위).
    //   ★캐논 ②의 올림은 **낱개로만 존재하는 물건**의 규약이라 **개수 자리**에서 건다.
    //     단위 자리(`giveNeededUnits`)는 소수 그대로 같이 실어 보낸다 — kg 물건(로트)이
    //     들어올 자리이고, 그때는 이 수를 그대로 쓰면 된다.
    const perItem = (_G && _G.have >= 1) ? (_gAt(1) || 1) : ((Number(o.perItem) > 0) ? Number(o.perItem) : 1);   // ★[T835] 켬 = 고른 첫 개체의 단위(실행의 `per1` 과 같은 값)
    out.want = want;
    const wantU = conv ? conv.units(want) : want;   // ★[T748] 받을 낱개 → 단위(열량 짝 · 끔 = 그대로)
    if (!(wantU <= cap + 1e-9)) {
      // 마을이 그만큼을 못 내준다 — 값이 아니라 **물리 상한**의 문제다(`cap` 은 B-1 과 같은 함수).
      out.giveNeeded = null; out.giveNeededUnits = null; out.takeAtNeeded = null; out.wantCapped = true;
    } else {
      const gu = _giveForTake(econV2, v, giveRes, takeRes, wantU, cap, hiCap);
      // ★연속해(`gu`)를 그냥 `ceil` 하면 안 된다: 이분 탐색의 상계는 참값보다 (hi−lo)만큼 크게
      //   끝나므로, 참값이 마침 정수면 `ceil` 이 **한 칸 더** 올라가 올림이 최소가 아니게 된다
      //   (엡실론 눈대중은 답이 아니다). ⇒ **한 칸 아래에서 출발해 위 `_climbToWant` 로 올라간다.**
      const _takeAt = (u) => { const t = planSliced(econV2, v, giveRes, takeRes, Math.max(0, u), cap).took; return conv ? conv.items(t).items : Math.floor(t); };
      const _uAt = _G ? _gAt : ((c) => c * perItem);   // ★[T835] 켬 = 올림 걸음의 자도 고른 그 개체들(실행의 `_climbToWant` 와 같은 자)
      const n = _climbToWant((T965_ON && _G) ? _countAtOrBelow(gu, _uAt, Infinity) : Math.floor(gu / perItem), want, _uAt, _takeAt, Infinity);   // ★[T965] 켬 = 고른 그 개체들의 단위로 연속해 아래 마지막 낱개에서(끔 = 첫 개체 단위로 나눈 출발점)
      out.giveNeeded = n;
      out.giveNeededUnits = +gu.toFixed(6);
      out.takeAtNeeded = _takeAt(_uAt(n));
      if (T835_ON) {   // ★[T835] 받을 양 주문도 실행과 같은 상한 절삭 — 낱개 n 이 상한에 닿으면 실행은 낼 양을 깎는다(`_trimToCap` · 끔 = 이 줄 무동작)
        const un = _uAt(n), pn = un > 0 ? planSliced(econV2, v, giveRes, takeRes, un, cap) : { gave: 0 };
        if (pn.gave < un - 1e-9) {
          const tr = _trimToCap(econV2, v, giveRes, takeRes, n, _uAt, true, maxGive, un / n, cap, _tkN);
          out.giveNeeded = tr.n; out.takeAtNeeded = conv ? conv.items(tr.took).items : Math.floor(tr.took); out.wantTrimmed = true;
          if (T988_ON && tr.n > 0 && out.takeAtNeeded > 0 && out.takeAtNeeded < want) out.wantShort = true;   // ★[T988] 절삭돼 받을 양에 못 닿는다 — 화면은 낼 양 축의 그 줄로
          if (!(tr.n > 0) || !(out.takeAtNeeded > 0)) {   // 낱개 하나 값이 내줄 수 있는 몫보다 크다 — 실행은 못 한다
            if (T988_ON) out.why = _whyNot(econV2, v, giveRes, takeRes, out.cap, cap, _uAt(1), false);   // ★[T988] 실행이 거절할 그 말(같은 함수 · 받을 양 축은 "더 내야 한다" 를 안 한다)
            out.giveNeeded = null; out.takeAtNeeded = null; out.wantCapped = true;
          }
        }
      }
      if (!(T976_ON && out.wantCapped === true)) out.wantCapped = false;   // ★[T976] 켬 = 위 T835 절삭이 놓은 true(낱개 0 — 실행이 못 하는 판)는 그대로 · 끔 = 종전(늘 false 로 덮는다)
    }
  }
  //   ★[T988] 낼 양 축 — 실행이 거절할 판(낼 낱개 0 · 받을 낱개 0)이면 견적도 실행과 같은 말을 싣는다(끔 = 칸 없음)
  if (T988_ON && !(want > 0)) {
    const g = (out.giveUsed != null) ? out.giveUsed : (q > 0 ? (_gN || 1) : 0);
    if (!(g > 0) || !(out.take > 0)) {
      const u1 = _G ? (_G.have >= 1 ? _gAt(1) : 0) : ((opts && Number(opts.perItem) > 0) ? Number(opts.perItem) : q);
      const per = (opts && Number(opts.perItem) > 0) ? Number(opts.perItem) : 1, _tN = (t) => (conv ? conv.items(t).items : Math.floor(t));
      //   더 내면 서나 — 인벤이 오면 가진 것 안에서(그만큼 가졌을 때만) · 없으면(T835 끔 · 랩) 그 낱개 자로 `maxGive + 1` 단위가 되는 낱개까지
      //     (그 너머에서만 서는 판 — 견적 상계가 참 경계에 못 닿아 `maxGive` 가 작은 판 — 은 앞 토막으로 남는다 · 앞 토막은 참이다)
      const more = !out.capped && g > 0 && (_G ? (_gN > 0 && _moreWorks(econV2, v, giveRes, takeRes, _gN, _G.have, _gAt, cap, _tN))
        : _moreWorks(econV2, v, giveRes, takeRes, Math.floor(q / per + 1e-9), Math.ceil((maxGive + 1) / per), (c) => c * per, cap, _tN));
      out.why = _whyNot(econV2, v, giveRes, takeRes, out.cap, cap, u1, more);
    }
  }
  return out;
}

// ── 실행 — 원자적 ────────────────────────────────────────────────────────────
//   ★순서가 곧 안전이다(B-1 과 동형): ① 견적 ② **재고를 먼저 잡는다** ③ 내 물건을 뺀다
//     ④ 곳간에 넣는다(정본 deposit) ⑤ 못 하면 잡아 둔 재고를 되돌린다.
//   동시 경쟁은 ②의 즉시 차감이 관문이다 — 두 사람이 같은 마지막 재고를 못 가져간다.
function exchange(a) {
  const { ledger, econV2, vil, vid, inventory, giveRes, takeRes, deposit } = a;
  const v = vil.econ;
  const D = ledger.deliverable;

  // 내가 실제로 들고 있는가 — 한 재화에 여러 아이템이 매핑된다(익힌 음식 등)
  // ★★[무게 배치 2026-08-27] **개수 → 재화 단위** 환산. 큰 물고기는 여러 단위어치다.
  //   `unitsOf(item, n)` 이 없으면 1개=1단위(종전 그대로) — 이 배치 이전 경로는 안 달라진다.
  //   ★[T835] 고르기 · 단위 셈은 `_giver` 하나다(견적도 켬이면 그 함수 — 몸통은 종전 글자 그대로 옮겼다).
  const unitsOf = (typeof a.unitsOf === 'function') ? a.unitsOf : null;
  const G = _giver(D, inventory, giveRes, unitsOf);
  const have = G.have, _pick = G.pick, _units = G.units;
  //   ★[T748] 받는 쪽 열량 짝 — 호스트가 `takeKcal` 을 넘길 때만(켬 · 끔/랩 = null = 종전 `Math.floor` 그대로)
  const conv = a.takeKcal ? _takeConv(a.takeKcal, D.toEcon.get(takeRes)) : null;
  const _qo = conv ? { takeKcal: a.takeKcal } : undefined;
  const _takeN = (t) => (conv ? conv.items(t).items : Math.floor(t));

  // ★★[T69 · 캐논 §3②] **받을 양으로 들어온 주문** — 내는 양은 위 `quote` 의 올림이다.
  //   여기서 값을 새로 짓지 않는다: `quote({want})` 가 같은 `planSliced` 로 낸 `giveNeeded` 를 받는다.
  //   ⚠견적의 `perItem` 은 **한 개짜리 어림**이다(개체 무게가 섞이면 평균이 달라진다).
  //     그래서 실행은 **고른 그 개체들의 실제 무게**로 다시 재서, 모자라면 한 개씩 올린다 —
  //     올림은 "받기로 한 양에 닿는 최소 개수"라는 뜻이고, 그 판정은 어림이 아니라 실측이어야 한다.
  //   ★받는 쪽은 종전 그대로 `Math.floor` 다 — 넘치는 소수는 거래소 몫(캐논 ③).
  const wantTake = Math.max(0, Math.floor(Number(a.want) || 0));
  let q0;
  if (wantTake > 0) {
    const per1 = _units(_pick(1)) || 1;
    const _gw = T835_ON ? { inventory, unitsOf: unitsOf || undefined } : null;   // ★[T835] 켬 = 견적의 올림 걸음도 고른 그 개체로(끔 = 종전 글자)
    const qw = quote(ledger, econV2, vil, vid, giveRes, takeRes, per1, Object.assign(conv ? { want: wantTake, perItem: per1, takeKcal: a.takeKcal } : { want: wantTake, perItem: per1 }, _gw));
    if (qw.err) return { ok: false, err: qw.err };
    if (!(qw.giveNeeded > 0)) {
      if (T988_ON && qw.why) return { ok: false, err: qw.why };   // ★[T988] 절삭 0 판 — 견적이 실은 그 말(받을 양 ≤ 상한이라 아래 말은 거짓)
      return { ok: false, err: `마을이 ${Events.koRes(takeRes)} ${wantTake}개를 내줄 수 없습니다.`
        + ` 지금 내줄 수 있는 것은 ${qw.cap}개까지입니다.` };
    }
    // ★견적의 `giveNeeded` 에서 출발해, **고른 그 개체들의 실제 무게**로 다시 재며 올라간다.
    //   걸음은 견적과 **같은 함수**다(`_climbToWant`) — 자만 어림에서 실측으로 바뀐다.
    const _tw = (u) => _takeN(planSliced(econV2, v, giveRes, takeRes, u, (qw.capU != null) ? qw.capU : qw.cap).took);
    //   ★[T965] 켬 = 견적 낱개가 아니라 연속해(`giveNeededUnits`) 아래 마지막 낱개에서 출발해 고른 그 개체들(`G.at` — 가진 것 너머는 첫 개체 단위로 이음)로 오른다
    //     — 가진 것보다 많이 닿아야 하면 아래 "그만큼 없다"가 그 낱개 수로 말한다(끔 = 종전 글자 · 견적 낱개에서 · 가진 것까지)
    q0 = T965_ON ? _climbToWant(_countAtOrBelow(qw.giveNeededUnits, G.at, Infinity), wantTake, G.at, _tw, Infinity)
      : _climbToWant(qw.giveNeeded, wantTake, (c) => _units(_pick(c)), _tw, have);
  } else {
    q0 = Math.max(0, Math.floor(Number(a.giveQty) || 0));       // ★플레이어가 내는 건 **개수**다
  }
  if (q0 < CFG.MIN_GIVE) return { ok: false, err: `${CFG.MIN_GIVE}개 이상은 내야 합니다.` };
  if (have < q0) {
    return { ok: false, err: wantTake > 0
      ? `${Events.koRes(takeRes)} ${wantTake}개를 받으려면 ${Events.koRes(giveRes)} ${q0}개가 있어야 하는데 그만큼 없습니다.`
      : '그만큼 갖고 있지 않습니다.' };
  }

  const u0 = _units(_pick(q0));
  const perItem = q0 > 0 ? u0 / q0 : 1;           // 이 제안의 **평균 단위/개** — 견적을 세우는 데만 쓴다

  const qt = quote(ledger, econV2, vil, vid, giveRes, takeRes, u0, _qo);
  const capU = (qt.capU != null) ? qt.capU : qt.cap;   // ★[T748] 조각 계획은 단위 상한(화면 `cap` 은 켬이면 받을 낱개)
  if (qt.err) return { ok: false, err: qt.err };

  // 물리 상한 — 넘치면 **거절이 아니라 절삭**이다(살 수 있는 만큼은 산다).
  //   ★수량은 견적과 **같은 조각 계획**에서 나온다(견적과 실행이 다른 수를 쓰면 그게 보이지 않는 손이다).
  //   ★상한은 **단위**로 걸리므로 개수로 되돌린다(평균 단위/개로 나눈 뒤 내림 — 넘치게 주지 않는다).
  //     ★[T999] 켬이면 상한 전부를 받는 가장 적은 낱개(넘는 몫은 마지막 낱개의 조각 · 한 개 넘침은 이 내림 그대로 — `_trimToCap` 머리).
  let give = q0, wantW, giveUnits, pl;
  if (T807_ON) {   // ★[T807] 견적과 같은 절삭 함수(실행은 고른 그 개체들의 실제 무게로 — `unitsAt`)
    const tr = _trimToCap(econV2, v, giveRes, takeRes, q0, (c) => _units(_pick(c)), qt.capped, qt.maxGive, perItem, capU, _takeN);
    give = tr.n; wantW = _pick(give); giveUnits = tr.u; pl = { took: tr.took };
  } else {
  if (qt.capped && perItem > 0) give = Math.min(q0, Math.floor(qt.maxGive / perItem));
  wantW = _pick(give);
  giveUnits = _units(wantW);                // ★실행은 **고른 그 개체들의 실제 무게**로 다시 잰다
  pl = giveUnits > 0 ? planSliced(econV2, v, giveRes, takeRes, giveUnits, capU) : { took: 0 };
  }
  let take = _takeN(pl.took);
  //   ★[T748] 곳간에서 실제로 나가는 단위 — 켬이면 낱개에 든 열량만(낱개로 안 떨어지는 몫은 곳간에 남는다) · 끔 = 받는 개수 그대로(1개 = 1단위)
  const spend = conv ? +(pl.took - (conv.items(pl.took).leftUnits || 0)).toFixed(4) : take;
  if (!(give > 0) || !(take > 0)) {
    // ★★여기 메시지가 거짓말을 하면 안 된다. 1차 실장에서 "더 내야 한다"고 했는데,
    //   실제로는 **덜 내야** 하는(혹은 아예 못 하는) 상황이었다 — 원인이 정반대였다.
    //   재고 0 인 품목은 그림자가격이 폭발해서(낚시 배치에서 본 그 현상) 생선 한 마리가
    //   마을의 나무 전량보다 비싸진다. 그때 옳은 말은 "**마을이 값을 못 치른다**"이다.
    if (T988_ON) {   // ★[T988] 그 판의 참 말(아래 셋은 끔 = 종전 글자) — "더 내야 한다" 는 낼 양 주문이 절삭에 안 걸렸고 가진 것 안에서 더 내면 설 때만
      const more = !(wantTake > 0) && !qt.capped && give > 0 && _moreWorks(econV2, v, giveRes, takeRes, q0, have, G.at, capU, _takeN);
      return { ok: false, err: _whyNot(econV2, v, giveRes, takeRes, qt.cap, capU, _units(_pick(1)), more) };
    }
    if (qt.cap <= 0) return { ok: false, err: `마을에 ${Events.koRes(takeRes)}이(가) 남아 있지 않습니다.` };
    if (qt.maxGive < 1) {
      return { ok: false, err: `${Events.koRes(giveRes)} 한 개 값이 마을이 내줄 수 있는 `
        + `${Events.koRes(takeRes)} 전부(${qt.cap})보다 비쌉니다. 이 마을은 지금 그 값을 치를 수 없습니다.` };
    }
    return { ok: false, err: '그 양으로는 한 개도 바꿀 수 없습니다. 더 내야 합니다.' };
  }

  // ② 재고를 **먼저** 잡는다(동시 경쟁의 관문)
  const before = +((v.storage || {})[takeRes] || 0);
  if (before < spend) return { ok: false, err: '마을 재고가 방금 줄었습니다. 다시 해 보십시오.' };
  v.storage[takeRes] = +(before - spend).toFixed(3);

  // ③④ 내 물건 → 곳간(정본 deposit). 실패하면 ⑤ 되돌린다.
  const want = wantW;
  const dep = deposit(vil, inventory, want, unitsOf || undefined);
  if (!dep || !dep.ok) {
    v.storage[takeRes] = before;                      // ⑤ 되돌림
    return { ok: false, err: (dep && dep.err) || '곳간이 받지 않았습니다.' };
  }
  const takeItem = D.toEcon.get(takeRes);
  if (!takeItem) { v.storage[takeRes] = before; return { ok: false, err: '내줄 물건이 실제로 없습니다.' }; }
  inventory[takeItem] = (inventory[takeItem] || 0) + take;

  return { ok: true, vid, name: vil.name, giveRes, takeRes, give, take,
           gaveItems: dep.taken, tookItem: takeItem, ratio: qt.ratio,
           giveUnits: +giveUnits.toFixed(3), perItem: +perItem.toFixed(3),
           capped: q0 !== give, wanted: q0, wantTake: wantTake > 0 ? wantTake : null,
           stockAfter: +v.storage[takeRes].toFixed(3), ...(conv ? { takeUnits: spend } : {}) };   // ★[T748] 켬이면 나간 단위도
}

module.exports = { CFG, KO_NUM, board, quote, exchange, tradableIn, tradableOut, lockedRewards, T807_ON, T835_ON, T965_ON, T976_ON, T988_ON, T999_ON };
