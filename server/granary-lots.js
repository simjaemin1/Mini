'use strict';
// === server/granary-lots.js — T732: 곳간도 로트로 — econ 곳간 칸의 얻은 순간 장부 · 캐러밴 짐 · 전쟁 짐 ===
//
// ★★[T732 2026-10-14 · 손잡이 `T732_MOMENT_LOT` · ★[T778] 켬 기본(`=0` 끔) — 끄면 이 파일을 아무도 안 부른다(존·마을이 늦게 · 켬일 때만 싣는다) · main 바이트]
//   재민 10-12 · 10-14(족보 631 ①): 신선도는 아이템마다 — **곳간 포함.** T716 ⑤ 임시 고침(넣은 몫만 곁 장부)을 걷고 본 구현.
//
// ── 관측자 ─────────────────────────────────────────────────────────────────────────────────────────
//   econ 값을 **한 자리도 안 바꾼다.** 곳간 칸(`v.storage[재화]` — 로트 재화만)에 접근자를 걸어, econ 이 쓰는 그 값을 그대로 두고
//   같은 양을 장부에 적는다: **늘면 그 순간의 새 로트**(얻음 · 같은 순간이면 합친다) · **줄면 오래된 것부터**(먹음 · 썩음 · 세금 — FIFO).
//   ⇒ "NPC 는 오래된 것부터 먹는다"가 장부의 뜻이다. 상한 것을 버리는 것 · 먹을까 팔까는 econ 의 결정이라 이 카드 밖(T730 — 족보 631 ②).
//   옮김(사람 ↔ 곳간 · 캐러밴 · 전쟁 짐)은 **문이 레코드를 넘긴다** — 새 로트 = 얻은 순간 하나뿐.
//
// ── 레코드 ──────────────────────────────────────────────────────────────────────────────────────────
//   `{ k, u, f0, e, t, m, w }` — k 얻은 순간(게임 ms) · u econ 단위 · e/t 노출(정산 순간 t · 소수 날) · m/w 자리(곳간 · 길 위 = 몸에 지님)
//   `f0` = 곳간에 들 때 단위에 이미 접힌 신선도. 사람이 내는 문(회관 · 거래소 · 게시판)은 단위를 **열량 × 신선도**로 잰다(T725 · 부패 배치) —
//     그 몫을 다시 나이로 깎으면 두 번 깎는다. 그래서 꺼낼 때 낱개 = (문이 정한 낱개 몫) ÷ f0 · 나이는 레코드째(넣은 그대로 늙어 간다).
//     econ 이 만든 것은 f0 = 1(단위가 곧 갓 난 양).
//   ★★[T768 2026-10-16 · 같은 손잡이 안 · 새 손잡이 0] `it` = **넣은 그 품목**(재민 10-15 ⓑ — T732 §8 ①: "꺼낼 때 넣은 물건 그대로").
//     사람의 문(`recsFromPlayer`)과 손(`handRecs`)이 싣는다 · 옮김(`_copy` — 캐러밴 · 대기 칸 · 몸 짐 · 갱 · 되돌림)은 그대로 따라간다 ·
//     econ 이 만든 것 · 옛 레코드(칸 없음) = 문이 정한 **대표 품목**(읽는 쪽이 그렇게 읽는다 — 지우지 않는다).
//     econ 칸은 지금처럼 대표 단위로 센다(값 무변). 꺼낼 때(`recsToItems`) 품목이 대표 품목과 다르면 그 품목의 열량으로 낱개를 바꾼다
//     (문이 정한 낱개 몫 × 대표 열량 ÷ 그 품목 열량 — `kcal.itemsOf` 의 바닥 없는 꼴 · 레코드는 소수 낱개를 든다 · 새 수 0).
//     품목 셈(`ITM` — 마을마다 든 · 난 단위)이 장부 옆에 선다: 감싼 장부에서 그 품목 레코드 합 = 든 것 − 난 것(`checkItems`).
//
// ── 일시 변경 ────────────────────────────────────────────────────────────────────────────────────
//   거래소 견적(`trade.planSliced` · `gluttedAt`)은 곳간을 잠깐 바꿨다 되돌린다 — 그동안은 장부를 멈춘다(`suspend`).
//   교환이 실패해 곳간을 되돌리면(`exchange` ⑤) 장부도 되돌린다(`txBegin`/`txEnd`).
//   새 칸(econ 이 처음 만드는 재화)은 econ 하루 뒤 `sync` 가 감싼다 — 그 첫 몫은 그날 econ 틱의 순간에 얻은 것이다(틱 안의 순간은 하나).
//   `sync` 는 장부 합과 곳간 값을 맞대 보고, 어긋나면 고치고 **센다**(`stats().drift` — 길을 다 막았으면 0).
//
// ── 순간 ─────────────────────────────────────────────────────────────────────────────────────────
//   하루 마감은 세계에게 **한 순간**이다(villages.js T1 주석 — 마감 조각이 여러 프레임에 흘러도). 그래서 마감 동안 econ 이 얻은 것은
//   전부 그 순간(`tickBegin` 이 잡은 게임 ms) 하나로 적는다 — 같은 순간 · 같은 품목이면 한 레코드(같은 순간만 합친다).
//   마감 밖(사람의 문 · 실시간 몸)은 그때그때의 순간이다.
//
// ── 사람의 문(회관 · 거래소 · 게시판 · 겨울 몫 · 꺼내기 · 마을 밥 · 위세품 값) ──────────────────────────────────
//   문이 몇 개를 넣고 몇 단위를 꺼낼지는 **문이 정한다**(정본 함수 무변). 문 동안(`doorBegin`~`doorEnd`) 늘어난 몫은 잡아 두고(장부에 아직 안 적음),
//   줄어든 몫은 오래된 것부터 떼어 모은다. 문이 끝나면 존이 사람 쪽에서 실제로 나간 레코드(오래된 것부터)로 늘어난 몫을 채우고(`doorIn`),
//   모은 레코드를 사람에게 싣는다(`recsToPlayer`). 문이 실패해 곳간을 되돌리면 장부도 문 앞으로(스냅숏).
const Lots = require('./lots');
const Spoil = require('./spoil');
const ON = Lots.T732_MOMENT;
const EPS = 1e-9;
const LED = new WeakMap();      // econ 마을 → { [재화]: rec[] }
const DEBT = new WeakMap();     // econ 마을 → { [재화]: 곳간이 0 아래로 내려간 몫(장부가 줄 수 없는 몫) }
const PEND = new WeakMap();     // econ 마을 → { [재화]: rec[] } — 다음 늘어남이 받을 레코드(옮김 · 무게 = u)
const CAP = new WeakMap();      // econ 마을 → { [재화|'*']: rec[] } — 모으는 중(꺼내기 · 사기 · 싣기)
const TX = new WeakMap();       // econ 마을 → { [재화]: { arr, debt } } — 되돌릴 스냅숏
const CARGO = new WeakMap();    // 캐러밴 → { give, give2, ret, ret2 }
const WRAPPED = new WeakMap();  // econ 마을 → Set(감싼 재화)
let _suspend = 0;
let _tickK = null;   // 하루 마감의 순간(게임 ms) — 마감 동안 econ 이 얻은 것의 열쇠
let _door = null;    // 사람의 문 — { held: Map(v → {재화: 단위}), cap: Map(v → {재화: rec[]}), tx: Set(v) }
const ST = { attached: 0, seeded: 0, seededU: 0, restored: 0, t716In: 0, newLots: 0, moved: 0, outRecs: 0, debtU: 0,
  wrappedLate: 0, adopted: 0, drift: 0, driftU: 0, cargoIn: 0, cargoOut: 0, txRollback: 0, doors: 0, doorNoRec: 0, doorStale: 0, giveNoRec: 0, giveNoRecU: 0,
  // ★[T748] 켬 전용 일곱 길 — 손 · 대기 칸 · 몸 짐 · 갱 비축 · 존 경계(센다 · 판정 0)
  handRecs: 0, handU: 0, pockIn: 0, pockNew: 0, pockOut: 0, pockSeed: 0, pockDrift: 0, pockDriftU: 0,
  bagIn: 0, bagNew: 0, bagOut: 0, gangIn: 0, gangOut: 0, gangSeed: 0, gangDrift: 0, gangDriftU: 0, denIn: 0, xzOut: 0, xzIn: 0,
  // ★[T768] 품목 실은 레코드 — 싣기(문 · 손) · 장부에 든/난 단위 · 마을이 먹은(econ 줄이기) · 사람에게 그 품목으로 준 · 대표 품목과 달라 바꿔 준 · 짐에 실린
  itemTag: 0, itemTagU: 0, itemInU: 0, itemOutU: 0, itemEatU: 0, itemGiveU: 0, itemSwapU: 0, itemSwapRecs: 0, itemCargoU: 0 };
// ★★[T768] 품목 셈 — econ 마을 → { in: {품목: 단위}, out: {품목: 단위} }(그 장부에 든 · 난 품목 실은 레코드의 단위) · 되돌림 스냅숏
const ITM = new WeakMap();
const TXI = new WeakMap();
const EAT = {};   // 품목 → 마을이 먹은(econ 줄이기 · 문 · 싣기 밖) 단위 — "NPC 는 넣은 그 품목을 먹는다"
function _itm(v) { let o = ITM.get(v); if (!o) { o = { in: {}, out: {} }; ITM.set(v, o); } return o; }
function _itIn(v, it, u) { if (it == null || !(u > EPS)) return; const o = _itm(v); o.in[it] = (o.in[it] || 0) + u; ST.itemInU += u; }
function _itOut(v, it, u) { if (it == null || !(u > EPS)) return; const o = _itm(v); o.out[it] = (o.out[it] || 0) + u; ST.itemOutU += u; }
function _itSnap(v) { if (TXI.has(v)) return; const o = ITM.get(v); TXI.set(v, o ? { in: Object.assign({}, o.in), out: Object.assign({}, o.out) } : null); }

let _gpf = null, _cpf = null;
function _gran() { return _gpf || (_gpf = Spoil.placeFields('granary')); }
function _carry() { return _cpf || (_cpf = Spoil.placeFields('carry')); }
function _now() { return Lots.nowMs(); }
function _kNow() { return _tickK != null ? _tickK : _now(); }   // 새 로트의 열쇠 — 마감 중이면 마감의 순간
function _day() { return Lots.dayMs() || 1; }
function _nowFrac() { return _now() / _day(); }
function _rec(k, u) { const g = _gran(); return { k, u, f0: 1, e: 0, t: k / _day(), m: g.m, w: g.w }; }
// 정산 — 그 레코드의 자리 배율로 지금까지(소수 날 · `spoil.exposureAt` 정본)
function _settle(r, nf) { const t0 = (r.t == null) ? r.k / _day() : +r.t; if (t0 < nf) { r.e = +Spoil.exposureAt(r, nf, 0).toFixed(6); r.t = nf; } return r; }
// 자리를 바꾼다 — 정산 먼저(지난 구간에 새 배율이 소급되지 않게)
function _restamp(r, pf, nf) { _settle(r, nf); r.m = pf.m; r.w = pf.w; return r; }
function _copy(r, u) { const o = { k: r.k, u, f0: r.f0 == null ? 1 : r.f0, e: r.e, t: r.t, m: r.m, w: r.w }; if (r.it != null) o.it = r.it; return o; }   // ★[T768] 품목은 따라간다(없으면 칸도 없다 — 옛 꼴 그대로)
function _sortK(arr) { arr.sort((a, b) => (a.k - b.k) || ((+b.e || 0) - (+a.e || 0))); return arr; }

// ══ 접근자 — econ 이 쓰는 값은 그대로 · 같은 양을 장부에 ════════════════════════════════════════
function _wrap(v, res, seedK) {
  if (!Lots.isLot(res)) return false;
  const st = v.storage;
  const d = Object.getOwnPropertyDescriptor(st, res);
  if (!d || d.get) return false;                       // 없는 칸은 만들지 않는다(키 순서 무변) · 이미 감쌌다
  let val = d.value;
  const L = LED.get(v);
  if (!L[res]) { const q = Number(val) || 0; if (q > EPS) { L[res] = [_rec(seedK, q)]; ST.seeded++; ST.seededU += q; } }
  Object.defineProperty(st, res, {
    enumerable: d.enumerable !== false, configurable: true,
    get() { return val; },
    set(x) {
      const a = Number(val) || 0; val = x; const b = Number(x) || 0;
      if (_suspend) return;
      if (b > a + EPS) { if (_door) _hold(v, res, b - a); else _in(v, res, b - a); }
      else if (b < a - EPS) _out(v, res, a - b);
    },
  });
  let W = WRAPPED.get(v); if (!W) { W = new Set(); WRAPPED.set(v, W); } W.add(res);
  return true;
}
function _in(v, res, du) {
  const L = LED.get(v); if (!L) return;
  let left = du;
  const D = DEBT.get(v);
  if (D && D[res] > EPS) { const pay = Math.min(left, D[res]); D[res] -= pay; left -= pay; if (D[res] <= EPS) delete D[res]; }
  if (!(left > EPS)) return;
  _txTouch(v, res);
  const arr = L[res] || (L[res] = []);
  const P = PEND.get(v), q = P && P[res];
  if (q && q.length) {                                   // 옮김 — 넘겨받는 레코드(무게 비율대로 나눠 받는다)
    const W = q.reduce((a, r) => a + (+r.u || 0), 0);
    if (W > EPS) {
      const nf = _nowFrac(), g = _gran();
      for (const r of q) { const u = left * (+r.u || 0) / W; if (u > EPS) { arr.push(_restamp(_copy(r, u), g, nf)); _itIn(v, r.it, u); } }   // ★[T768] 든 품목 셈
      q.length = 0; delete P[res];
      ST.moved++;
      _sortK(arr);
      return;
    }
  }
  const k = _kNow(), g = _gran();                       // 얻음 — 지금 순간의 새 로트(같은 순간 · 같은 자리 · 갓 난 것이면 합친다)
  const last = arr.length ? arr[arr.length - 1] : null;
  if (last && last.k === k && last.m === g.m && last.w === g.w && !(+last.e > 0) && (last.f0 == null || last.f0 === 1) && last.it == null) last.u += left;   // ★[T768] 품목 실은 레코드엔 안 합친다(econ 이 만든 몫 = 대표 품목)
  else { arr.push(_rec(k, left)); ST.newLots++; if (last && last.k > k) _sortK(arr); }
}
function _out(v, res, du) {
  const L = LED.get(v); if (!L) return;
  _txTouch(v, res);
  const arr = L[res] || [];
  let left = du;
  const C = CAP.get(v), cap = C && (C[res] || C['*']);
  const taken = (cap || _door) ? [] : null;
  while (left > EPS && arr.length) {
    const r = arr[0], take = Math.min(left, r.u);
    if (taken) taken.push(_copy(r, take));
    if (r.it != null) { _itOut(v, r.it, take); if (!taken) { ST.itemEatU += take; EAT[r.it] = (EAT[r.it] || 0) + take; } }   // ★[T768] 난 품목 셈 · 문 · 싣기 밖이면 마을이 먹은 것(그 품목 그대로)
    r.u -= take; left -= take;
    if (r.u <= EPS) arr.shift();
  }
  if (left > EPS) { const D = DEBT.get(v) || (DEBT.set(v, {}), DEBT.get(v)); D[res] = (D[res] || 0) + left; ST.debtU += left; }
  if (!arr.length) delete L[res];
  if (taken && taken.length) {
    ST.outRecs += taken.length;
    if (cap) {
      if (C[res]) C[res].push(...taken);
      else { const S = C['*']; (S[res] || (S[res] = [])).push(...taken); }
    }
    if (_door) { let M = _door.cap.get(v); if (!M) { M = {}; _door.cap.set(v, M); } (M[res] || (M[res] = [])).push(...taken.map((r) => Object.assign({}, r))); }
  }
}
// 문 동안 늘어난 몫 — 아직 장부에 안 적는다(문이 끝나면 사람 쪽에서 나간 레코드로 채운다 · `doorIn`)
function _hold(v, res, du) {
  _txTouch(v, res);
  let H = _door.held.get(v); if (!H) { H = {}; _door.held.set(v, H); }
  H[res] = (H[res] || 0) + du;
}
// 되돌림 스냅숏 — 교환이 실패하면 곳간 값도 되돌아가니 장부도 그 순간으로
function _txTouch(v, res) {
  let T = TX.get(v);
  if (!T && _door && LED.has(v)) { T = {}; TX.set(v, T); _door.tx.add(v); TXI.delete(v); _itSnap(v); }   // ★[T768] 품목 셈도 그 순간으로 되돌릴 수 있게
  if (!T || T[res]) return;
  const L = LED.get(v), D = DEBT.get(v);
  T[res] = { arr: (L && L[res]) ? L[res].map((r) => Object.assign({}, r)) : null, debt: D ? (D[res] || 0) : 0 };
}

// ══ 붙이기 · 맞대기 ═════════════════════════════════════════════════════════════════════════════
//   `saved` = 저장된 장부(`dump` 꼴) — 있으면 그것을 꽂고, 없으면 지금 곳간 값을 `seedK` 순간의 로트 하나로(나이 모름 — 첫 부팅 · 끔에서 켬으로)
function attach(v, saved, seedK) {
  if (!ON || !v || !v.storage || typeof v.storage !== 'object' || !Lots.momentOn()) return false;
  if (!LED.has(v)) { LED.set(v, {}); ST.attached++; }
  const L = LED.get(v);
  const k = Number.isFinite(seedK) ? seedK : _kNow();
  if (saved && saved.L && typeof saved.L === 'object') {
    for (const [res, recs] of Object.entries(saved.L)) if (Array.isArray(recs) && recs.length && !L[res]) { L[res] = recs.filter((r) => r && r.u > EPS).map((r) => Object.assign({}, r)); for (const r of L[res]) _itIn(v, r.it, r.u); }   // ★[T768] 저장된 품목 칸째 · 셈은 붙은 그 순간부터(든 것 = 복원한 것)
    if (saved.D && typeof saved.D === 'object') DEBT.set(v, Object.assign({}, saved.D));
    ST.restored++;
  } else if (v._t716Lots && typeof v._t716Lots === 'object') {
    // ★[T716 걷기] 임시 고침의 곁 장부(`econ._t716Lots` — 사람이 넣은 몫만 · 그 나이째)가 있으면 그 레코드를 본 장부로 옮긴다(그 날 0시 순간 · 노출 그대로).
    //   나머지 몫(econ 이 만든 것)은 아래 씨앗(나이 모름). 단위 신선도 접힘(f0)은 곁 장부가 안 적었다 — 1 로 읽는다(펴지 않는다 = 더 늙어 보이는 쪽).
    const g = _gran();
    for (const [res, recs] of Object.entries(v._t716Lots)) {
      if (!Array.isArray(recs) || !Lots.isLot(res) || L[res]) continue;
      const have = Number(v.storage[res]) || 0;
      let left = have; const arr = [];
      for (const r of recs) { if (!(r && r.u > EPS) || !(left > EPS)) continue; const u = Math.min(left, +r.u); left -= u;
        arr.push({ k: Math.floor(+r.d || 0) * _day(), u, f0: 1, e: +r.e || 0, t: (r.t == null ? Math.floor(+r.d || 0) : +r.t), m: r.m == null ? g.m : r.m, w: r.w == null ? g.w : r.w }); }
      if (left > EPS) arr.push(_rec(k, left));
      if (arr.length) { L[res] = _sortK(arr); ST.t716In++; }
    }
    delete v._t716Lots;
  }
  for (const res of Object.keys(v.storage)) _wrap(v, res, k);
  // ★[T748] 대기 칸 줄 — 저장된 것이 있으면 그것 · 없으면 지금 칸 값을 `seedK` 순간의 레코드 하나로(나이 모름 — 첫 부팅 · 끔에서 켬으로)
  const SP = (saved && saved.P && typeof saved.P === 'object') ? saved.P : null;
  for (const key of Object.keys(POCK_KEYS)) for (const res of _pockRes(v, key)) {
    const want = _pockVal(v, key, res); if (!(want > EPS)) continue;
    const arr = _pock(v, key, res, true); if (arr.length) continue;
    const rec = SP && SP[key] && SP[key][res];
    if (Array.isArray(rec) && rec.length) arr.push(...rec.filter((r) => r && r.u > EPS).map((r) => Object.assign({}, r)));
    else { arr.push(_recAt(k, want, _pf(POCK_KEYS[key]))); ST.pockSeed++; }
  }
  return true;
}
// econ 하루 뒤(같은 턴) — 새 마을 · 새 칸을 감싸고, 장부 합 = 곳간 값을 맞대 본다(어긋나면 고치고 센다)
function sync(econVillages) {
  if (!ON || !Lots.momentOn()) return null;
  const k = _kNow();
  let late = 0, drift = 0;
  for (const v of (econVillages || [])) {
    if (!v || !v.storage) continue;
    if (!LED.has(v)) { attach(v, null, k); continue; }
    for (const res of Object.keys(v.storage)) if (_wrap(v, res, k)) { late++; ST.wrappedLate++; }
    const L = LED.get(v), D = DEBT.get(v) || {};
    for (const res of (WRAPPED.get(v) || [])) {
      const want = Number(v.storage[res]) || 0;
      const have = (L[res] || []).reduce((a, r) => a + r.u, 0) - (D[res] || 0);
      const dd = want - have;
      if (Math.abs(dd) > 1e-6 * Math.max(1, Math.abs(want))) {
        drift++; ST.drift++; ST.driftU += Math.abs(dd);
        const s = _suspend; _suspend = 0;
        if (dd > 0) _in(v, res, dd); else _out(v, res, -dd);
        _suspend = s;
      }
    }
    _pockSync(v);   // ★[T748] 대기 칸 줄도 같이 맞댄다(어긋남 = 막지 못한 길 · 센다)
  }
  return { late, drift };
}

// ══ 문 — 옮김 ═══════════════════════════════════════════════════════════════════════════════════
function pushIn(v, res, recs) {
  if (!LED.has(v) || !Array.isArray(recs) || !recs.length) return;
  let P = PEND.get(v); if (!P) { P = {}; PEND.set(v, P); }
  (P[res] || (P[res] = [])).push(...recs);
}
// 받는 문이 끝났다 — 남은 대기 레코드를 치운다. 그 문이 **새 칸**을 만들었으면(econ 은 없던 재화를 `(x || 0) + q` 로 처음 쓴다 — 접근자가 아직 없다)
//   그 대기 레코드로 칸을 감싼다(새 칸의 첫 몫 = 옮겨 온 레코드 · '지금 얻은 것'이 아니다).
function clearIn(v, res) {
  const P = PEND.get(v); if (!P) return;
  for (const r of (res == null ? Object.keys(P) : [res])) { const q = P[r]; if (q && q.length) _adopt(v, r, q); delete P[r]; }
  if (!Object.keys(P).length) PEND.delete(v);
}
function isWrapped(v, res) { const W = WRAPPED.get(v); if (!W || !W.has(res)) return false; const d = Object.getOwnPropertyDescriptor(v.storage, res); return !!(d && d.get); }
function _adopt(v, res, recs) {
  if (!LED.has(v) || !Lots.isLot(res) || !v.storage) return false;
  const d = Object.getOwnPropertyDescriptor(v.storage, res);
  if (!d || d.get) return false;
  const q = Number(d.value) || 0, L = LED.get(v);
  const W = recs.reduce((a, r) => a + (+r.u || 0), 0);
  if (!L[res] && q > EPS && W > EPS) {
    const nf = _nowFrac(), g = _gran();
    L[res] = _sortK(recs.filter((r) => (+r.u || 0) > EPS).map((r) => _restamp(_copy(r, q * (+r.u) / W), g, nf)));
    for (const r of L[res]) _itIn(v, r.it, r.u);   // ★[T768] 든 품목 셈(새 칸의 첫 몫 = 옮겨 온 레코드)
    ST.adopted++;
  }
  _wrap(v, res, _kNow());
  return true;
}
function capBegin(v, res) { if (!LED.has(v)) return false; let C = CAP.get(v); if (!C) { C = {}; CAP.set(v, C); } C[res == null ? '*' : res] = (res == null) ? {} : []; return true; }
function capEnd(v, res) {
  const C = CAP.get(v); if (!C) return res == null ? {} : [];
  const key = res == null ? '*' : res, got = C[key] || (res == null ? {} : []);
  delete C[key]; if (!Object.keys(C).length) CAP.delete(v);
  return got;
}
function suspend(on) { _suspend = Math.max(0, _suspend + (on ? 1 : -1)); }
function txBegin(v) { if (LED.has(v)) { TX.set(v, {}); TXI.delete(v); _itSnap(v); } }
function txEnd(v, commit) {
  const T = TX.get(v); TX.delete(v);
  const SI = TXI.get(v); TXI.delete(v);   // ★[T768] 품목 셈 스냅숏
  if (!T || commit) return;
  if (SI) ITM.set(v, SI); else ITM.delete(v);
  const L = LED.get(v); let D = DEBT.get(v);
  for (const [res, snap] of Object.entries(T)) {
    if (snap.arr && snap.arr.length) L[res] = snap.arr; else delete L[res];
    if (snap.debt > EPS) { if (!D) { D = {}; DEBT.set(v, D); } D[res] = snap.debt; } else if (D) delete D[res];
  }
  ST.txRollback++;
}
// 하루 마감 — 그 동안 econ 이 얻은 것은 그 순간 하나(villages.js 가 마감을 열 때 · 다 비웠을 때 부른다)
function tickBegin() { if (_door) _doorStale(); if (ON && Lots.momentOn()) _tickK = _now(); }
function tickEnd() { _tickK = null; }
// 사람의 문 — 열기 · 닫기(실패면 장부를 문 앞으로 되돌린다). 닫으면 { held, cap } 을 낸다(존이 레코드를 채우고 싣는다).
function doorBegin() {
  if (!ON || !Lots.momentOn()) return false;
  if (_door) _doorStale();
  _door = { held: new Map(), cap: new Map(), tx: new Set() }; ST.doors++;
  return true;
}
// 안 닫힌 문(문 사이에서 던져 닫는 줄을 못 탄 경우 — 존 문은 finally 로 닫는다) — 잡아 둔 늘어남을 그 순간의 새 로트로 적고 닫는다(센다 · 문이 영영 열려 econ 늘어남을 삼키지 않게)
function _doorStale() { const d = doorEnd(true); doorRest(d); ST.doorStale++; }
function doorEnd(commit) {
  const d = _door; _door = null;
  if (!d) return null;
  for (const v of d.tx) txEnd(v, !!commit);
  if (!commit) return null;
  return d;
}
// 문 동안 늘어난 그 칸의 몫을 사람 쪽에서 나간 레코드(무게 = 단위)로 채운다 · 레코드가 없으면 그 순간의 새 로트(세어 둔다)
function doorIn(d, v, res, recs) {
  const H = d && d.held.get(v), du = H ? (H[res] || 0) : 0;
  if (H) delete H[res];
  if (!(du > EPS)) {   // 접근자가 없던 칸(문이 처음 만든 재화) — 대기 레코드로 감싼다
    if (recs && recs.length && LED.has(v) && !isWrapped(v, res)) { pushIn(v, res, recs); clearIn(v, res); }
    return 0;
  }
  if (recs && recs.length) pushIn(v, res, recs); else ST.doorNoRec++;
  _in(v, res, du);
  clearIn(v, res);
  return du;
}
// 문이 끝났는데 아무도 안 채운 늘어남 — 그 순간의 새 로트로(세어 둔다 · 문 표를 다 막았으면 0)
function doorRest(d) {
  if (!d) return 0;
  let n = 0;
  for (const [v, H] of d.held) for (const res of Object.keys(H)) { if (H[res] > EPS) { _in(v, res, H[res]); n++; ST.doorNoRec++; } }
  d.held.clear();
  return n;
}
function doorCap(d, v, res) { const M = d && d.cap.get(v); return (M && M[res]) || []; }

// ══ 사람 ↔ 곳간 ═════════════════════════════════════════════════════════════════════════════════
//   넣기: 사람의 로트 레코드(FIFO · 정산된 복사)를 재화 단위 무게로 바꿔 둔다. `unitsMode` = 문이 단위를 열량 × 신선도로 재는가(f0 = 그 신선도).
function recsFromPlayer(recs, item, units, unitsMode, today) {
  const out = [];
  if (!Array.isArray(recs) || !recs.length || !(units > 0)) return out;
  const fs = recs.map((r) => Math.max(0, Spoil.freshnessOf(item, Spoil.exposureOf(r, today))));
  const ws = recs.map((r, i) => (+r.n || 0) * (unitsMode ? fs[i] : 1));
  const W = ws.reduce((a, x) => a + x, 0);
  if (!(W > EPS)) return out;
  recs.forEach((r, i) => {
    if (!(ws[i] > EPS)) return;
    out.push({ k: Number.isFinite(r.k) ? r.k : Math.floor(r.d) * _day(), u: units * ws[i] / W, f0: unitsMode ? Math.max(1e-6, fs[i]) : 1,
      e: +r.e || 0, t: (r.t == null) ? (Number.isFinite(r.k) ? r.k / _day() : Math.floor(r.d)) : +r.t, m: r.m == null ? 1 : r.m, w: r.w == null ? 0 : r.w,
      it: item });   // ★[T768] 넣은 그 품목
  });
  if (out.length) { ST.itemTag += out.length; ST.itemTagU += units; }
  return out;
}
//   꺼내기: 곳간에서 빠진 레코드 → 사람 로트(문이 정한 낱개 `give` 를 단위 비율로 나눠 · f0 로 편다 · 나이는 레코드째).
//   반환 = 레코드별 { k, n, e, t, m, w } (사람 쪽 `Lots.moveIn` 이 그대로 받는다)
function recsToPlayer(recs, give) {
  const out = [];
  if (!Array.isArray(recs) || !recs.length || !(give > 0)) return out;
  const U = recs.reduce((a, r) => a + (+r.u || 0), 0);
  if (!(U > EPS)) return out;
  const per = give / U, nf = _nowFrac();
  let allOne = true;
  for (const r0 of recs) {
    const r = _settle(_copy(r0, r0.u), nf);
    const f0 = r.f0 == null ? 1 : +r.f0;
    if (f0 !== 1) allOne = false;
    const n = per * r.u / Math.max(1e-6, f0);
    if (n > EPS) out.push({ d: Math.floor(r.k / _day()), k: r.k, n, e: r.e, t: r.t, m: r.m, w: r.w });
  }
  // 6자리로 자른다 — 접힘이 없으면(f0 = 1) 합이 문이 정한 낱개와 **정확히** 같게(남은 끝수는 가장 큰 레코드에 · 낱개가 0.999999 로 떨어지지 않게)
  let S = 0, big = null;
  for (const o of out) { o.n = +o.n.toFixed(6); S += o.n; if (!big || o.n > big.n) big = o; }
  if (allOne && big) { const fix = +(give - S).toFixed(6); if (fix !== 0) big.n = +(big.n + fix).toFixed(6); }
  return out;
}
//   ★★[T768] 꺼내기 — **레코드의 품목 그대로**(재민 10-15 ⓑ). 문이 정한 낱개 `give`(대표 품목 `item` 기준)를 단위 비율로 나눈다(오래된 것부터 뗀 그 차례 ·
//     레코드째). 품목 칸(`it`)이 없거나 대표 품목이면 그 몫은 대표 품목(종전 `recsToPlayer` 그대로 — 품목이 다 같으면 그 함수 하나를 그대로 부른다 · 바이트) ·
//     다른 품목이면 그 품목으로: 낱개 = 문 몫 × 대표 열량 ÷ 그 품목 열량 ÷ f0(같은 열량 · `kcal.itemsOf` 의 바닥 없는 꼴 — 문이 열량으로 낱개를 정했으면
//     곧 단위 × 하루치 ÷ 그 품목 열량 · 둘 중 하나라도 열량이 없으면 낱개째). 반환 = { [품목]: [{ d, k, n, e, t, m, w }] }(사람 쪽 `Lots.moveIn` 이 그대로 받는다).
function recsToItems(recs, give, item, kcalOf) {
  const by = {};
  if (!Array.isArray(recs) || !recs.length || !(give > 0)) return by;
  const own = [], other = [];
  for (const r of recs) { ((r && r.it != null && r.it !== item) ? other : own).push(r); if (r && r.it != null) ST.itemGiveU += +r.u || 0; }
  if (!other.length) { const pr = recsToPlayer(recs, give); if (pr.length) by[item] = pr; return by; }
  const U = recs.reduce((a, r) => a + (+r.u || 0), 0);
  if (!(U > EPS)) return by;
  const per = give / U;
  if (own.length) { const pr = recsToPlayer(own, per * own.reduce((a, r) => a + (+r.u || 0), 0)); if (pr.length) by[item] = pr; }
  const kD = kcalOf ? (+kcalOf(item) || 0) : 0, nf = _nowFrac();
  for (const r0 of other) {
    const r = _settle(_copy(r0, r0.u), nf);
    const f0 = r.f0 == null ? 1 : +r.f0;
    const kX = kcalOf ? (+kcalOf(r.it) || 0) : 0;
    const n = +(per * r.u * ((kD > 0 && kX > 0) ? kD / kX : 1) / Math.max(1e-6, f0)).toFixed(6);
    if (!(n > 0)) continue;
    (by[r.it] || (by[r.it] = [])).push({ d: Math.floor(r.k / _day()), k: r.k, n, e: r.e, t: r.t, m: r.m, w: r.w });
    ST.itemSwapU += r.u; ST.itemSwapRecs++;
  }
  return by;
}

// ══ 캐러밴 · 전쟁 짐(sim 훅이 부른다 — `setLotHook`) ════════════════════════════════════════════
//   짐은 길 위에서 늙는다 — 자리 = 몸에 지님(정산은 꺼낼 때 조회 함수가 한다 · 새 수 0).
function _toCarry(recs) { const nf = _nowFrac(), c = _carry(); for (const r of recs) _restamp(r, c, nf); return recs; }
function cargo(c, slot, recs) {
  if (!c || !Array.isArray(recs)) return;
  let K = CARGO.get(c); if (!K) { K = {}; CARGO.set(c, K); }
  K[slot] = _toCarry(recs.map((r) => _copy(r, r.u)));
  ST.cargoOut++;
  for (const r of recs) if (r && r.it != null) ST.itemCargoU += +r.u || 0;   // ★[T768] 짐에 실린 품목 레코드(품목째 길을 간다)
}
function unload(c, slot, v, res, amt) {
  const K = c && CARGO.get(c), recs = K && K[slot];
  if (!recs || !recs.length || !(amt > 0)) { if (K) delete K[slot]; return; }
  const U = recs.reduce((a, r) => a + r.u, 0);
  const frac = U > EPS ? Math.min(1, amt / U) : 0;
  if (frac > 0) pushIn(v, res, recs.map((r) => _copy(r, r.u * frac)));   // 약탈 · 우회로 준 몫은 비율대로(주사위 0)
  delete K[slot];
  ST.cargoIn++;
}
function bounce(c) {   // 빈손 귀환 — 안 판 짐이 그대로 돌아온다
  const K = c && CARGO.get(c); if (!K) return;
  if (K.give) { K.ret = K.give; delete K.give; }
  if (K.give2) { K.ret2 = K.give2; delete K.give2; }
}
function cargoDump(c) { const K = c && CARGO.get(c); return K && Object.keys(K).length ? JSON.parse(JSON.stringify(K)) : null; }
function cargoLoad(c, saved) { if (c && saved && typeof saved === 'object') CARGO.set(c, JSON.parse(JSON.stringify(saved))); }
// 전쟁 짐(`war-core` 훅) — 곳간에서 뗀 품목별 레코드를 짐에(몸에 지님) · 내려놓을 때 비율대로
function packFrom(byRes) { const out = {}; for (const [res, recs] of Object.entries(byRes || {})) if (recs && recs.length) out[res] = _toCarry(recs.map((r) => _copy(r, r.u))); return out; }
// 팩의 남은 몫 — 원정 동안 **오래된 것부터** 먹혔으니 남은 것은 새 쪽 꼬리(품목마다 단위 비율 `keep`)
function packKeep(byRes, keep) {
  const kf = Number(keep);
  if (!byRes || !(kf > 0)) return null;
  if (kf >= 1) return byRes;
  const out = {};
  for (const [res, recs] of Object.entries(byRes)) {
    if (!Array.isArray(recs) || !recs.length) continue;
    let want = recs.reduce((a, r) => a + (+r.u || 0), 0) * kf;
    const tail = [];
    for (let i = recs.length - 1; i >= 0 && want > EPS; i--) { const t = Math.min(want, +recs[i].u || 0); if (t > EPS) tail.unshift(_copy(recs[i], t)); want -= t; }
    if (tail.length) out[res] = tail;
  }
  return out;
}
function giveBegin(v, byRes, frac) {
  if (!byRes) return;
  const f = Number(frac) > 0 ? Math.min(1, +frac) : 0;
  for (const [res, recs] of Object.entries(byRes)) if (recs && recs.length && f > 0) pushIn(v, res, recs.map((r) => _copy(r, r.u * f)));
}
function giveEnd(v) { clearIn(v); }
// 레코드 없이 곳간에 드는 줌(전쟁 짐을 몸이 내려놓기 T423 · 노획 운반 T466 · 장부 없는 그릇에서 온 노획 — 기본 끔 갈래) — 그 순간의 새 로트가 된다 · 센다
function giveNoRec(v, items) { if (!LED.has(v)) return; let q = 0; for (const k in (items || {})) if (Lots.isLot(k)) q += +items[k] || 0; if (q > 0) { ST.giveNoRec++; ST.giveNoRecU += q; } }
// ══ ★★[T748 2026-10-14] 켬 전용 일곱 길 — 로트를 그대로 넘긴다(손잡이 `T732_MOMENT_LOT` · ★[T778] 켬 기본(`=0` 끔) 안 · 그 길의 손잡이가 켜졌을 때만 닿는다) ══════
//   PM 10-14(족보 639): T732 §8 ④ 는 **이 손잡이 안에서 막는다**(그 손잡이가 켤 때 다시 열 일 0). 새 수 0 · 판정 0 · 끔이면 아무도 안 부른다.
//   ① 손 → 곳간(어부 T312 · 채집 T347 · 농부 T368): 몸의 로트(사람 `p.lots` · NPC 곁 장부)를 오래된 것부터 떼어 곳간 레코드로(`handRecs`).
//      입구가 그날 몫까지만 받으면(수요 문) **받은 만큼만** 떼야 하니 입구 줄 앞에서 문을 열고 받은 몫을 본 뒤 뗀다(`doorOpen` · `doorShut`).
//   ② 날짜 없던 대기 칸(채집 짐 `_t544Pack` · 고르게 `_t368Pend` · `_t100Pend`) — 칸마다 레코드 줄(`POCK`): 넣을 때 그 순간(손이 넘긴 레코드가 있으면 그것) ·
//      뺄 때 오래된 것부터 곳간에(`pushIn`). econ 이 쓰는 값은 그대로 · 같은 양을 줄에(관측자).
//   ③ 전쟁 짐(T423 · T441 · T466): 팩 레코드를 몸 짐 줄(`BAG` — 몸 밖 · 몸 필드 0)로 나눠 싣고 · 먹으면 오래된 것부터 · 내려놓으면 레코드째 곳간에.
//      노획(T466)은 적 곳간에서 뗀 레코드째 몸에 · 전장 더미(전사자의 짐)도 레코드째 · 못 실은 곳간 몫은 레코드째 그 곳간에 되돌린다.
//   ④ 소굴(T476): 갱 비축에 레코드 줄(`GANG`) — 장물아비 환산 몫은 그 순간 얻은 것(장물아비가 내준 식량) · 유지비는 오래된 것부터 ·
//      토벌 땐 소굴 어댑터(econ 꼴)에 그 줄을 붙여 곳간처럼 뗀다(정본 `_warFoodTake` 그대로) · 싸운 뒤 남은 줄을 갱에 되비춘다.
//   ⑤ 존 경계(T525): 짐 레코드가 기록('arrive' · 'return')에 실려 이웃 존으로 간다(`cargoDump` · `cargoLoad` — 받는 존이 그 캐러밴에 다시 싣는다).
const POCK = new WeakMap();   // econ 마을 → { [칸]: { [품목]: rec[] } } — 날짜 없던 대기 칸의 레코드 줄
const BAG = new WeakMap();    // 몸 → { [재화]: rec[] } — 전쟁 짐의 레코드 줄(몸 밖)
const GANG = new WeakMap();   // 갱 → rec[] — 비축(식량 하나)의 레코드 줄
// 대기 칸 — 이름 → 자리(짐은 몸에 지님 · 고르게 대기는 곳간 더미). 숫자 칸(`_t100Pend`)은 품목 'food' 하나다.
const POCK_KEYS = { _t544Pack: 'carry', _t368Pend: 'granary', _t100Pend: 'granary' };
function _pf(place) { return place === 'carry' ? _carry() : _gran(); }
function _recAt(k, u, pf) { return { k, u, f0: 1, e: 0, t: k / _day(), m: pf.m, w: pf.w }; }
function _sumU(arr) { let s = 0; for (const r of (arr || [])) s += +r.u || 0; return s; }
function _fifo(arr, u) {   // 오래된 것부터 u 를 뗀다(뗀 복사를 돌려준다 · 모자라면 있는 만큼)
  const out = []; let left = u;
  while (left > EPS && arr.length) { const r = arr[0], t = Math.min(left, +r.u || 0); if (t > EPS) out.push(_copy(r, t)); r.u -= t; left -= t; if (r.u <= EPS) arr.shift(); }
  return out;
}
function _scaleTo(recs, u) { const S = _sumU(recs); if (S > EPS && u >= 0) { const f = u / S; for (const r of recs) r.u *= f; } return recs; }
function _merge(arr, recs, pf, nf) { for (const r of (recs || [])) if ((+r.u || 0) > EPS) arr.push(_restamp(_copy(r, +r.u), pf, nf)); return _sortK(arr); }
// ① 몸의 손 → 레코드(오래된 것부터 `n` 개를 몸의 로트 장부에서 뺀다) · `per` = 낱개 하나의 econ 단위(손이 단위를 들면 1)
function handRecs(p, item, n, per) {
  if (!ON || !Lots.momentOn() || !p || !(n > EPS)) return [];
  let out = [];
  try { out = Lots.moveOut(p, item, n, p.inventory || {}, Math.floor(_nowFrac())) || []; } catch (e) { out = []; }
  const W = Number(per) > 0 ? +per : 1;
  const recs = [];
  for (const r of out) {
    const q = +r.n || 0; if (!(q > EPS)) continue;
    const k = Number.isFinite(r.k) ? r.k : Math.floor(+r.d || 0) * _day();
    recs.push({ k, u: q * W, f0: 1, e: +r.e || 0, t: (r.t == null) ? k / _day() : +r.t, m: r.m == null ? 1 : r.m, w: r.w == null ? 0 : r.w, it: item });   // ★[T768] 손이 넣은 그 품목
  }
  if (recs.length) { ST.handRecs += recs.length; ST.handU += _sumU(recs); ST.itemTag += recs.length; ST.itemTagU += _sumU(recs); }
  return recs;
}
// 곳간 입구(econ 정본 한 줄)를 문으로 감싼다 — 그 줄 앞에서 열고(`doorOpen`) · 뒤에서 닫으며 늘어난 몫(세금 뗀 것)을
//   입구가 받은 만큼 뗀 레코드로 채운다(`doorShut`). 입구 줄은 글자 그대로 둔다(하네스가 그 줄을 읽는다 · 사본 0).
//   닫는 줄을 못 타면(입구가 던졌다) 다음 문 · 마감이 그 문을 닫고 잡아 둔 몫을 그 순간의 로트로 적는다(T732 `_doorStale` · 센다).
function doorOpen(v) { return !!(ON && LED.has(v) && doorBegin()); }
function doorShut(v, res, recs) { const d = doorEnd(true); if (d) { doorIn(d, v, res, recs || []); doorRest(d); } }
// ② 대기 칸
function _pock(v, key, res, make) {
  let P = POCK.get(v); if (!P) { if (!make) return null; P = {}; POCK.set(v, P); }
  let K = P[key]; if (!K) { if (!make) return null; K = P[key] = {}; }
  if (!K[res]) { if (!make) return null; K[res] = []; }
  return K[res];
}
function _pockVal(v, key, res) { const S = v && v[key]; if (S == null) return 0; if (typeof S === 'number') return res === 'food' ? S : 0; return Number(S[res]) || 0; }
function _pockRes(v, key) {   // econ 칸의 품목 ∪ 줄의 품목(econ 이 칸을 지웠는데 줄이 남은 것도 본다)
  const S = v && v[key], out = new Set();
  if (S != null) { if (typeof S === 'number') out.add('food'); else for (const r of Object.keys(S)) out.add(r); }
  const P = POCK.get(v), K = P && P[key]; if (K) for (const r of Object.keys(K)) out.add(r);
  return [...out];
}
function pockPut(v, key, res, u, recs) {
  if (!ON || !LED.has(v) || !POCK_KEYS[key] || !(u > EPS)) return;
  const arr = _pock(v, key, res, true), pf = _pf(POCK_KEYS[key]), nf = _nowFrac();
  if (recs && recs.length) { _merge(arr, _scaleTo(recs.map((r) => _copy(r, +r.u || 0)), u), pf, nf); ST.pockIn++; }
  else { arr.push(_recAt(_kNow(), u, pf)); _sortK(arr); ST.pockNew++; }
}
function pockTake(v, key, res, u) {
  const arr = (ON && LED.has(v)) ? _pock(v, key, res, false) : null;
  if (!arr || !(u > EPS)) return [];
  const out = _fifo(arr, u);
  if (!arr.length) delete POCK.get(v)[key][res];
  if (out.length) ST.pockOut++;
  return out;
}
// econ 훅 — 고르게 대기 칸에 든다(손이 넘긴 레코드가 `pushIn` 으로 와 있으면 그것 · 없으면 그 순간 얻은 것) / 대기 칸에서 푼다(오래된 것부터 → 곳간)
function pendIn(v, key, res, units) {
  if (!ON || !LED.has(v)) return;
  const P = PEND.get(v), q = P && P[res];
  const recs = (q && q.length) ? q.splice(0) : null;
  if (P && P[res] && !P[res].length) delete P[res];
  pockPut(v, key, res, units, recs);
}
function pendOut(v, key, res, units) { const recs = pockTake(v, key, res, units); if (recs.length) pushIn(v, res, recs); }
// 대기 칸 맞대기 — 줄 합 = econ 값(어긋나면 고치고 센다 · 길을 다 막았으면 0)
function _pockSync(v) {
  for (const key of Object.keys(POCK_KEYS)) for (const res of _pockRes(v, key)) {
    const want = _pockVal(v, key, res), arr = _pock(v, key, res, want > EPS);
    const have = _sumU(arr), dd = want - have;
    if (!(Math.abs(dd) > 1e-9)) continue;
    //   칸 값의 자릿수 자름(`toFixed(6)`)만큼은 조용히 맞춘다(비율 · 나이 무변) — 그보다 크면 막지 못한 길이다(센다 · 고친다)
    if (arr && arr.length && have > EPS && Math.abs(dd) <= 1e-4 * Math.max(1, Math.abs(want))) { _scaleTo(arr, Math.max(0, want)); continue; }
    ST.pockDrift++; ST.pockDriftU += Math.abs(dd);
    if (dd > 0) { arr.push(_recAt(_kNow(), dd, _pf(POCK_KEYS[key]))); _sortK(arr); } else if (arr) _fifo(arr, -dd);
  }
}
// ③ 몸 짐
function bagPut(p, byRes) {
  if (!ON || !p || !byRes) return;
  let B = BAG.get(p); if (!B) { B = {}; BAG.set(p, B); }
  const nf = _nowFrac(), c = _carry();
  for (const [res, recs] of Object.entries(byRes)) if (recs && recs.length) { _merge(B[res] || (B[res] = []), recs, c, nf); ST.bagIn++; }
}
function bagNote(p, res, u) {   // 길에서 딴 것(T441) — 그 순간 얻은 것
  if (!ON || !p || !(u > EPS) || !Lots.isLot(res)) return;
  let B = BAG.get(p); if (!B) { B = {}; BAG.set(p, B); }
  (B[res] || (B[res] = [])).push(_recAt(_now(), u, _carry())); _sortK(B[res]); ST.bagNew++;
}
function bagOut(p, res, u) { const B = BAG.get(p), arr = B && B[res]; if (!arr || !(u > EPS)) return []; const out = _fifo(arr, u); if (!arr.length) delete B[res]; if (out.length) ST.bagOut++; return out; }
function bagTake(p, keys) {   // 짐을 다 내린다 — { 재화: rec[] }(내려놓기 · 전사 더미 · 노획 운반 끝)
  const B = BAG.get(p); if (!B) return null;
  const out = {};
  for (const res of (keys || Object.keys(B))) if (B[res] && B[res].length) { out[res] = B[res]; delete B[res]; }
  if (!Object.keys(B).length) BAG.delete(p);
  return Object.keys(out).length ? out : null;
}
function bagOf(p) { return BAG.get(p) || null; }
// 레코드 묶음 { 재화: rec[] } 끼리 — 더하기 · 품목 u 만큼 오래된 것부터 떼기(묶음에서 빠진다)
function lotsAdd(into, add) { if (!add) return into; const o = into || {}; for (const [res, recs] of Object.entries(add)) if (recs && recs.length) (o[res] || (o[res] = [])).push(...recs.map((r) => _copy(r, +r.u || 0))); for (const res of Object.keys(o)) _sortK(o[res]); return o; }
function lotsTake(lots, res, u) { const arr = lots && lots[res]; if (!arr || !(u > EPS)) return []; const out = _fifo(arr, u); if (!arr.length) delete lots[res]; return out; }
// ④ 갱 비축
function gangIn(g, u, seed) { if (!ON || !g || !(u > EPS) || !Lots.momentOn()) return; let a = GANG.get(g); if (!a) { a = []; GANG.set(g, a); } a.push(_recAt(_kNow(), u, _gran())); _sortK(a); if (seed) ST.gangSeed++; else ST.gangIn++; }
function gangOut(g, u) { const a = GANG.get(g); if (!a || !(u > EPS)) return; _fifo(a, u); ST.gangOut++; }
function gangSync(g) {   // 줄 합 = 갱 비축(어긋나면 고치고 센다 — 비축을 바꾸는 길을 다 막았으면 0)
  if (!ON || !g || !Lots.momentOn()) return;
  const want = Math.max(0, +g.food || 0), a = GANG.get(g) || [], have = _sumU(a), dd = want - have;
  if (Math.abs(dd) > 1e-6 * Math.max(1, want)) { ST.gangDrift++; ST.gangDriftU += Math.abs(dd); if (dd > 0) { a.push(_recAt(_kNow(), dd, _gran())); _sortK(a); } else _fifo(a, -dd); GANG.set(g, a); }
}
function gangDump(g) { const a = GANG.get(g); return (a && a.length) ? a.map((r) => { const o = { k: r.k, u: +r.u.toFixed(9), f0: r.f0 == null ? 1 : r.f0, e: r.e, t: r.t, m: r.m, w: r.w }; if (r.it != null) o.it = r.it; return o; }) : null; }   // ★[T768] 품목 칸째(있을 때만)
function gangLoad(g, saved) { if (g && Array.isArray(saved) && saved.length) GANG.set(g, saved.filter((r) => r && r.u > EPS).map((r) => Object.assign({}, r))); }
function gangOf(g) { return GANG.get(g) || null; }
// 소굴 어댑터(econ 꼴 `{ storage }`)에 갱 줄을 붙인다 — 곳간처럼 뗀다(전쟁 정본 `_warFoodTake` 의 capBegin/capEnd 가 레코드를 모은다)
const DEN_RES = ['food', 'fish', 'meat', 'cooked_food', 'vegetable'];
function denAttach(e, g) {
  if (!ON || !e || !e.storage || !g || !Lots.momentOn()) return false;
  gangSync(g);
  if (!LED.has(e)) LED.set(e, {});
  const L = LED.get(e);
  for (const k of Object.keys(L)) delete L[k];
  DEBT.delete(e);
  const food = Number(e.storage.food) || 0, a = GANG.get(g) || [];
  if (food > EPS && a.length) L.food = _scaleTo(a.map((r) => _copy(r, +r.u)), food);
  for (const res of DEN_RES) if (res in e.storage) _wrap(e, res, _kNow());
  ST.denIn++;
  return true;
}
function denSync(e, g) {   // 싸운 뒤 — 어댑터 줄(식량 칸 다 · 갱 비축은 하나)을 갱에 되비춘다
  if (!ON || !e || !g || !LED.has(e)) return;
  const L = LED.get(e), all = [];
  for (const res of DEN_RES) if (L[res]) all.push(...L[res].map((r) => _copy(r, +r.u)));
  GANG.set(g, _scaleTo(_sortK(all), Math.max(0, +g.food || 0)));
  gangSync(g);
}
// ⑤ 존 경계 — 기록에 실을 짐 레코드 · 받은 기록의 짐 레코드를 그 캐러밴에(센다)
function xzOut(c) { const K = cargoDump(c); if (K) ST.xzOut++; return K; }
function xzIn(c, saved) { if (c && saved && typeof saved === 'object') { cargoLoad(c, saved); ST.xzIn++; } }
const hooks = { capBegin, capEnd, cargo, unload, bounce, pushIn, clearIn, packFrom, packKeep, giveBegin, giveEnd, giveNoRec,
  pendIn, pendOut, xzOut, xzIn };   // ★[T748] 대기 칸(econ 고르게) · 존 경계 기록

// ══ 영속 · 보기 · 자 ═════════════════════════════════════════════════════════════════════════════
function dump(v) {
  const L = LED.get(v); if (!L) return null;
  const out = { L: {}, D: Object.assign({}, DEBT.get(v) || {}) };
  const _rd = (r) => { const o = { k: r.k, u: +r.u.toFixed(9), f0: r.f0 == null ? 1 : r.f0, e: r.e, t: r.t, m: r.m, w: r.w }; if (r.it != null) o.it = r.it; return o; };   // ★[T768] 품목 칸째(있을 때만 — 옛 꼴은 칸이 없다)
  for (const [res, recs] of Object.entries(L)) if (recs && recs.length) out.L[res] = recs.map(_rd);
  // ★[T748] 대기 칸 줄(있을 때만 — 없으면 칸이 안 생긴다)
  const P = POCK.get(v);
  if (P) for (const [key, K] of Object.entries(P)) for (const [res, recs] of Object.entries(K)) if (recs && recs.length) { const o = out.P || (out.P = {}); (o[key] || (o[key] = {}))[res] = recs.map(_rd); }
  return out;
}
function ledger(v, res) { const L = LED.get(v); return L ? (res == null ? L : (L[res] || [])) : null; }
function attached(v) { return LED.has(v); }
// 그 재화의 곳간 몫 신선도(단위 가중 · 상한 몫) — 화면 · 하네스가 읽는다
function freshOf(v, res) {
  const L = LED.get(v), arr = L && L[res]; if (!arr || !arr.length) return null;
  const today = Math.floor(_nowFrac());
  let U = 0, wf = 0, bad = 0;
  for (const r of arr) { const f = Spoil.freshnessOf(res, Spoil.exposureOf(Object.assign({}, r, { k: r.k }), today)); U += r.u; wf += f * r.u; if (f <= 0) bad += r.u; }
  return { u: +U.toFixed(6), fresh: U > 0 ? +(wf / U).toFixed(6) : 1, spoiledU: +bad.toFixed(6), lots: arr.length };
}
function stats(reset) { const o = Object.assign({}, ST); if (reset) for (const k of Object.keys(ST)) ST[k] = 0; return o; }
// 불변식 — 감싼 칸마다 장부 합 − 빚 = 곳간 값(어긋난 칸 목록)
function check(econVillages, tol) {
  const bad = []; let cells = 0;
  for (const v of (econVillages || [])) {
    const L = LED.get(v); if (!L) continue;
    const D = DEBT.get(v) || {};
    for (const res of (WRAPPED.get(v) || [])) {
      cells++;
      const want = Number(v.storage[res]) || 0, have = (L[res] || []).reduce((a, r) => a + r.u, 0) - (D[res] || 0);
      if (Math.abs(want - have) > (tol || 1e-6) * Math.max(1, Math.abs(want))) bad.push({ v: v.name, res, want, have });
    }
    // ★[T748] 대기 칸 — 줄 합 = econ 칸 값
    for (const key of Object.keys(POCK_KEYS)) for (const res of _pockRes(v, key)) {
      const want = _pockVal(v, key, res); const arr = _pock(v, key, res, false);
      if (!(want > EPS) && !(arr && arr.length)) continue;
      cells++;
      const have = _sumU(arr);
      if (Math.abs(want - have) > Math.max(tol || 1e-6, 1e-4) * Math.max(1, Math.abs(want))) bad.push({ v: v.name, res, pock: key, want, have });   // 칸 값 자릿수 자름(6자리) 몫은 같다고 본다(맞대기와 같은 문턱)
    }
  }
  return { cells, bad };
}
// ★[T748] 몸 짐 · 갱 비축 불변식 — 줄 합 = 몸의 그 칸(짐 칸 목록) · 갱 비축
function checkBag(p, keys, tol) {
  const B = BAG.get(p) || {}, inv = (p && p.inventory) || {}, bad = [];
  for (const res of (keys || Object.keys(B))) {
    if (!Lots.isLot(res)) continue;
    const want = Number(inv[res]) || 0, have = _sumU(B[res]);
    if (Math.abs(want - have) > (tol || 1e-6) * Math.max(1, Math.abs(want))) bad.push({ res, want, have });
  }
  return bad;
}
function checkGang(g, tol) { const want = Math.max(0, +g.food || 0), have = _sumU(GANG.get(g)); return Math.abs(want - have) > (tol || 1e-6) * Math.max(1, want) ? { want, have } : null; }
// ★★[T768] 품목 불변식 — 감싼 장부마다 그 품목 레코드의 단위 합 = 든 것 − 난 것(`ITM`) · 장부의 품목별 합(대표 품목 몫 = 칸 없는 레코드는 `'*'`)
function itemSums(v) {
  const L = LED.get(v); if (!L) return null;
  const out = {};
  for (const [res, recs] of Object.entries(L)) for (const r of (recs || [])) { const k = r.it != null ? r.it : `*${res}`; out[k] = (out[k] || 0) + (+r.u || 0); }
  return out;
}
function checkItems(econVillages, tol) {
  const bad = []; let items = 0, tagged = 0;
  for (const v of (econVillages || [])) {
    if (!LED.has(v)) continue;
    const S = itemSums(v) || {}, M = ITM.get(v) || { in: {}, out: {} };
    const keys = new Set([...Object.keys(M.in), ...Object.keys(M.out), ...Object.keys(S).filter((k) => k[0] !== '*')]);
    for (const it of keys) {
      items++;
      const have = S[it] || 0, want = (M.in[it] || 0) - (M.out[it] || 0);
      tagged += have;
      if (Math.abs(have - want) > (tol || 1e-6) * Math.max(1, Math.abs(want))) bad.push({ v: v.name, it, have, want });
    }
  }
  return { items, tagged: +tagged.toFixed(6), bad };
}
function itemFlow(v) { const M = ITM.get(v); return M ? { in: Object.assign({}, M.in), out: Object.assign({}, M.out) } : null; }
function eaten(reset) { const o = Object.assign({}, EAT); if (reset) for (const k of Object.keys(EAT)) delete EAT[k]; return o; }

module.exports = { ON, attach, sync, pushIn, clearIn, capBegin, capEnd, suspend, txBegin, txEnd, isWrapped,
  tickBegin, tickEnd, doorBegin, doorEnd, doorIn, doorRest, doorCap,
  recsFromPlayer, recsToPlayer, recsToItems, hooks, cargo, unload, bounce, cargoDump, cargoLoad, packFrom, packKeep, giveBegin, giveEnd,
  itemSums, checkItems, itemFlow, eaten,   // ★[T768] 품목 칸 · 품목 불변식 · 마을이 먹은 품목
  dump, ledger, attached, freshOf, stats, check,
  // ★[T748] 켬 전용 일곱 길
  POCK_KEYS, handRecs, doorOpen, doorShut, pockPut, pockTake, pendIn, pendOut, pock: (v, key, res) => _pock(v, key, res, false),
  bagPut, bagNote, bagOut, bagTake, bagOf, lotsAdd, lotsTake, checkBag,
  gangIn, gangOut, gangSync, gangDump, gangLoad, gangOf, checkGang, denAttach, denSync, xzOut, xzIn };
