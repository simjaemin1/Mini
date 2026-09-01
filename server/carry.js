// === server/carry.js — 소지 무게 · 용량 · 과적 [재민 확정 2026-08-27] ===========
//
// 재민 원문: *"모든 아이템은 좀보이드처럼 무게를 가져야 해."*
//
// ★★§8.3 문법 그대로 — **속은 연속, 겉은 계단.**
//   하드 컷이 없다: 용량을 넘겨도 **주울 수 있다**. 대신 초과율의 **연속함수**로 느려지고 피로가 빨리 찬다.
//   과적은 **선택**이라 신체 디버프보다 더 깊이 갈 수 있다(바닥 0.4 vs 신체 0.6) —
//   넘치게 사서 뒤뚱거리며 나르는 것도 플레이다. 다만 **곱 폭주는 막는다**(합산 바닥 0.35).
//
// ★무게 값은 여기서 정하지 않는다 — `server/weights.js` 가 정본이고 이 파일은 **합산만** 한다.
// ⚠econ 무접촉: 이 모듈은 플레이어 층 전용이다(NPC 캐러밴 무게 예산은 회부 M항).
'use strict';
const W = require('./weights');
const Lots = require('./lots');   // ★로트 소수 몫(먹다 남은 0.75단위)도 무게다 — 합을 정본에서 읽는다

const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const CFG = {
  // 기본 용량 — 캐러밴 짐꾼 90kg 은 **전문 직업** 기준이라 일반인은 그보다 한참 아래로 잡는다.
  CAP_KG: _num('CARRY_CAP_KG', 25),
  // 과적 바닥 — 신체 바닥(0.6)보다 **깊다**. 과적은 선택이기 때문이다.
  MOVE_FLOOR: _num('CARRY_MOVE_FLOOR', 0.4),
  // 신체 × 과적 **합산** 바닥 — 둘이 곱해 폭주하는 걸 막는다(죽음의 나선 방지와 같은 뜻).
  COMBINED_FLOOR: _num('CARRY_COMBINED_FLOOR', 0.35),
  // 피로 가속 — 초과율 1.0(=용량의 2배)에서 노동 피로가 이 배로 붙는다.
  FATIGUE_AT_2X: _num('CARRY_FATIGUE_AT_2X', 2.2),
  STAGE_HYST: _num('CARRY_STAGE_HYST', 0.03),   // 단계 진동 방지(body 와 같은 문법)
};

// ── 이속 곡선 — x = 적재율 r(=kg/용량), y = 배율 ─────────────────────────────
//   ★절벽 없음. r ≤ 1 이면 벌 없음(1.0). 넘는 순간부터 **연속으로** 떨어진다.
//   ★1단계 경계는 여기서 **유도**한다(상수로 박지 않는다 — body.js 와 같은 규약).
const MOVE_CURVE = [[1.0, 1], [1.15, 0.95], [1.5, 0.80], [2.0, 0.60], [3.0, 0.40]];

function lerpCurve(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (x <= x1) { const t = (x1 - x0) < 1e-9 ? 0 : (x - x0) / (x1 - x0); return y0 + (y1 - y0) * t; }
  }
  return pts[pts.length - 1][1];
}
function xWhereBelow(pts, y) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (y0 >= y && y1 < y) { const t = (y0 - y1) < 1e-9 ? 0 : (y0 - y) / (y0 - y1); return x0 + (x1 - x0) * t; }
  }
  return pts[pts.length - 1][0];
}
// 단계 경계(적재율) — 1단계 = **이속 −5% 체감점**, 2·3단계는 곡선 끝까지 고르게.
const R1 = xWhereBelow(MOVE_CURVE, 0.95);
const RMAX = MOVE_CURVE[MOVE_CURVE.length - 1][0];
const STAGE_AT = [R1, R1 + (RMAX - R1) * 0.30, R1 + (RMAX - R1) * 0.65];

// ── 개체 kg 원장 ─────────────────────────────────────────────────────────────
//   ★★[원장 승격 2026-08-30 재민 확정 ⓑ] 종전엔 `p.kgLedger[item] = [kg, kg, …]` — **수의 배열**이라
//   FIFO 로 앞에서만 꺼낼 수 있었다. 그래서 "2kg 물고기를 골라 버린다"가 구조적으로 불가능했고,
//   그 불가능이 UI 로 새어 나와 **인벤은 한 줄 · 바닥은 여러 줄**이라는 비대칭이 됐다(실기 1차가 잡았다).
//
//   지금은 `p.kgLedger[item] = [{ id, kg, d? }, …]` — **주소가 있는 개체 목록**이다.
//     · `id`  그 플레이어의 원장 안에서만 유일하면 된다(저장 blob 이 플레이어별이다 — 전역 유일 불필요).
//     · `kg`  그 개체의 실제 무게.  · `d` 취득 게임일(있으면 신선도 표시에 쓴다 — 없어도 된다).
//
//   ★★**3층 캐논은 그대로다**(무게 배치): 개체 / 로트 / 무기한 벌크.
//   원장은 **1층(개체)만** 갖는다. 잔가지·섬유 같은 무기한 벌크는 원장이 **없는 게 정상**이고,
//   그래서 UI 에서 펼칠 것도 없다. 이 배치는 그 캐논의 UI 완성이지 새 층을 만드는 게 아니다.
//
//   ★★그럼 "무엇이 개체형인가"를 어디에 적나 — **어디에도 안 적는다.**
//   품목 이름표를 새로 만들면 그게 두 벌째 표이고, 어종이 늘 때마다 갈린다(전리품 표 두 벌 사고).
//   대신 **구조가 정의한다: 원장이 있으면 개체형이다.** 원장은 `noteInstance` 로만 생기고,
//   `noteInstance` 는 **실제로 잰 kg 이 있는 경로**(낚시)에서만 불린다.
//   바닥 왕복도 이름표를 안 쓴다 — 버릴 때 원장에서 뺀 항목을 바닥템에 실어 보내고(`led`),
//   주울 때 그게 있을 때만 원장으로 되돌린다. 벌크는 표준 kg 이라 왕복해도 값이 같다.
//
//   ★불변식: **원장이 있으면 `L[item].length === inventory[item]`.**
//   짧으면 표준 kg 으로 채우고(무게 중립 — `peekKg` 가 어차피 표준으로 세던 몫이다),
//   길면 자른다. 이 채움이 있어서 **모든 낱개가 주소를 갖는다**(= 하나만 골라 버릴 수 있다).
function ledger(p) {
  if (!p.kgLedger || typeof p.kgLedger !== 'object') p.kgLedger = {};
  return p.kgLedger;
}
// 다음 id — 플레이어별 카운터. 저장에서 돌아오면 최대값+1 로 되짚는다(충돌 없음).
function _nextId(p) {
  if (!Number.isFinite(p._kgNextId)) {
    let mx = 0;
    for (const arr of Object.values(ledger(p))) {
      if (!Array.isArray(arr)) continue;
      for (const e of arr) if (e && Number.isFinite(e.id) && e.id > mx) mx = e.id;
    }
    p._kgNextId = mx + 1;
  }
  return p._kgNextId++;
}
// 옛 저장(수의 배열)·손편집 픽스처를 항목 모양으로 올린다. **읽는 모든 길목이 이걸 먼저 부른다.**
function _norm(p, item) {
  const L = ledger(p);
  const arr = L[item];
  if (!Array.isArray(arr)) return null;
  let changed = false;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (typeof e === 'number') { arr[i] = { id: _nextId(p), kg: +(+e).toFixed(3) }; changed = true; }
    else if (!e || !Number.isFinite(e.kg)) { arr.splice(i, 1); i--; changed = true; }
    else if (!Number.isFinite(e.id)) { e.id = _nextId(p); changed = true; }
  }
  void changed;
  return arr;
}
function hasLedger(p, item) { const a = _norm(p, item); return !!(a && a.length); }
function entries(p, item) { return _norm(p, item) || []; }

function noteInstance(p, item, kg, day) {
  const L = ledger(p);
  if (!Array.isArray(L[item])) L[item] = [];
  _norm(p, item);
  const e = { id: _nextId(p), kg: +(+kg).toFixed(3) };
  if (Number.isFinite(day)) e.d = day | 0;
  L[item].push(e);
  return L[item];
}
// 원장 항목을 **그대로** 되돌린다(바닥 왕복 — id 는 새로 매긴다: 남이 주울 수도 있으니 남의 id 를 물려받지 않는다).
function noteEntries(p, item, list) {
  for (const e of (list || [])) {
    if (!e || !Number.isFinite(e.kg)) continue;
    noteInstance(p, item, e.kg, e.d);
  }
  return entries(p, item);
}
function _drop(p, item) { const L = ledger(p); if (Array.isArray(L[item]) && !L[item].length) delete L[item]; }

// 개수 n 을 꺼낼 때의 **실제 kg 합**(FIFO). 장부를 실제로 깎는다.
// ★뺀 항목을 같이 낸다 — 바닥템이 그걸 싣고, 다시 주우면 같은 무게로 돌아온다.
function takeEntries(p, item, n) {
  const std = W.kgOfOrDefault(item);
  const arr = _norm(p, item);
  let left = Math.max(0, Math.floor(n)), sum = 0;
  const took = [];
  while (left > 0 && arr && arr.length) { const e = arr.shift(); took.push(e); sum += e.kg; left--; }
  sum += left * std;                       // 원장에 없는 몫은 표준 무게
  _drop(p, item);
  return { kg: +sum.toFixed(3), entries: took };
}
function takeKg(p, item, n) { return takeEntries(p, item, n).kg; }
// ★★[원장 승격] **id 를 지목해서** 뺀다 — FIFO 강제 해제. 2kg 물고기 하나만 골라 버리는 길이 여기다.
//   없는 id 는 조용히 버리지 않고 `missing` 으로 낸다(호출자가 수량을 그만큼 덜 깎아야 한다).
function takeByIds(p, item, ids) {
  const arr = _norm(p, item);
  const want = new Set((ids || []).map((v) => +v).filter(Number.isFinite));
  const took = [];
  if (arr) {
    for (let i = 0; i < arr.length && want.size; i++) {
      if (!want.has(arr[i].id)) continue;
      want.delete(arr[i].id);
      took.push(arr.splice(i, 1)[0]); i--;
    }
  }
  _drop(p, item);
  const kg = took.reduce((s, e) => s + e.kg, 0);
  return { kg: +kg.toFixed(3), entries: took, n: took.length, missing: [...want] };
}
// 깎지 않고 보기만(견적·표시용)
function peekKg(p, item, n) {
  const std = W.kgOfOrDefault(item);
  const arr = _norm(p, item) || [];
  let left = Math.max(0, Math.floor(n)), sum = 0, i = 0;
  while (left > 0 && i < arr.length) { sum += arr[i++].kg; left--; }
  return +(sum + left * std).toFixed(3);
}

// ★★불변식 쓸개 — 원장이 있으면 **개수와 길이가 같아야 한다.**
//   짧으면 표준 kg 으로 채우고(무게 중립), 길면 자르고, 0 이면 지운다.
//   왜 채우나: 채워야 **낱개마다 주소가 생긴다**. 안 채우면 "표준 몫"은 골라서 버릴 수가 없다
//   (= 인벤 펼침에서 어떤 줄은 드롭 버튼이 없는 반쪽이 된다).
//   왜 여기서 쓸어 담나: 아이템이 느는 경로가 채집·요리·보상·거래·바닥줍기·픽스처로 흩어져 있다.
//   경로마다 `note` 를 심는 대신 **인벤을 정본으로 두고 차이를 메운다**(로트와 같은 문법).
function reconcile(p, inventory) {
  const L = ledger(p);
  for (const item of Object.keys(L)) {
    const have = Math.max(0, Math.floor(Number((inventory || {})[item]) || 0));
    const arr = _norm(p, item);
    if (!arr) { delete L[item]; continue; }
    if (!arr.length || !have) { delete L[item]; continue; }
    if (arr.length > have) arr.length = have;
    else if (arr.length < have) {
      const std = W.kgOfOrDefault(item);
      while (arr.length < have) arr.push({ id: _nextId(p), kg: std });
    }
    if (!arr.length) delete L[item];
  }
}

// ★★debug assert — 어긋나면 **조용히 넘어가지 않는다**(재민 지시 §2-A).
//   기본 켬. 같은 (자리·품목) 은 30초에 한 번만 짖는다(로그 폭주 방지).
//   `CARRY_ASSERT_THROW=1` 이면 던진다 — 하네스가 이 모드로 돌려 회귀를 잡는다.
const _ASSERT_ON = process.env.CARRY_ASSERT !== '0';
const _ASSERT_THROW = process.env.CARRY_ASSERT_THROW === '1';
const _assertSeen = new Map();
let _assertCount = 0;
function assertInvariant(p, inventory, where) {
  if (!_ASSERT_ON) return true;
  const L = (p && p.kgLedger) || {};
  let ok = true;
  for (const item of Object.keys(L)) {
    const arr = L[item];
    if (!Array.isArray(arr) || !arr.length) continue;
    const have = Math.max(0, Math.floor(Number((inventory || {})[item]) || 0));
    if (arr.length === have) continue;
    ok = false; _assertCount++;
    const msg = `[carry:불변식] ${where || '?'} · ${item} 원장 ${arr.length} ≠ 인벤 ${have}`;
    if (_ASSERT_THROW) throw new Error(msg);
    const k = `${where}|${item}`, now = Date.now();
    if (!(_assertSeen.get(k) > now - 30000)) { _assertSeen.set(k, now); console.warn(msg); }
  }
  return ok;
}
function assertCount() { return _assertCount; }

// ★UI 가 그릴 것 — **서버가 낸다.** 클라가 "무엇이 개체형인가" 표를 들면 그게 사본이다.
//   원장이 있는 품목만 나간다 → 벌크는 자연히 빠지고, 클라는 "있으면 펼친다"만 하면 된다.
function viewLedger(p, inventory) {
  reconcile(p, inventory);
  const L = ledger(p), out = {};
  for (const item of Object.keys(L)) {
    const arr = L[item];
    if (!Array.isArray(arr) || !arr.length) continue;
    out[item] = arr.map((e) => (Number.isFinite(e.d) ? { id: e.id, kg: e.kg, d: e.d } : { id: e.id, kg: e.kg }));
  }
  return out;
}

// ── 총 무게 ─────────────────────────────────────────────────────────────────
//   벌크(수량×표준kg) + 개체 장부(실제kg) + 도구·장비 인스턴스 + 요리.
function totalKg(p) {
  const inv = p.inventory || {};
  const L = ledger(p);
  let kg = 0;
  const seen = new Set();
  for (const [item, n0] of Object.entries(inv)) {
    const n = Math.max(0, Math.floor(Number(n0) || 0));
    if (!n) continue;
    seen.add(item);
    kg += peekKg(p, item, n);
    // ★로트 품목의 **소수 몫**(한 입 먹고 남은 0.75단위)은 인벤 정수에 안 올라간다 —
    //   그래도 손에 들려 있으니 무게는 나간다(`oreCarry` 와 같은 규약).
    if (Lots.isLot(item)) { const frac = Lots.sum(p, item) - n; if (frac > 1e-9) kg += frac * W.kgOfOrDefault(item); }
    void L;
  }
  // 인벤 정수가 0 인데 소수 몫만 남은 품목(0.75단위)도 무게에 센다
  for (const item of Object.keys(p.lots || {})) {
    if (seen.has(item)) continue;
    const frac = Lots.sum(p, item);
    if (frac > 1e-9) kg += frac * W.kgOfOrDefault(item);
  }
  for (const t of (p.toolItems || [])) kg += W.kgOfOrDefault(t.type);
  for (const e of (p.equipment || [])) kg += W.kgOfOrDefault(e.type);
  for (const d of (p.dishes || [])) kg += W.kgOfOrDefault('cooked_food');
  // 장착품은 equipment 배열에 그대로 있으므로 equipSlots 를 또 더하지 않는다(이중 계산 금지).
  return +kg.toFixed(3);
}
// ── ★★[T12 지게 2026-09-01] 상한은 이제 한 값이 아니다 — **기본 + 운반구** 이다. ─────────
//   ★가산은 **곱이 아니라 더하기**다. 이유: `MOVE_CURVE` 는 kg 이 아니라 **비율 r = kg/cap** 을 받는다
//   ⇒ 상한만 옮기면 **곡선은 한 글자도 안 변하고 통째로 옮겨진다**(과적 단계·바닥·피로 전부 그대로).
//   그래서 이 배치는 곡선을 손대지 않는다 — 손대는 순간 과적의 모든 수가 같이 움직인다.
//
//   ★★**수를 여기 적지 않는다.** 가산은 착용한 인스턴스의 `attrs.load` 그 수다
//   (`player-items.ITEM_TYPES.carrier` 가 정본 — 품질·재료가 정한 수). 여기서 표를 들면
//   화면에 뜨는 "적재 20" 과 실제 상한이 갈리는 날이 온다(족보 (83) 의 사촌).
//   ⇒ carry 는 **어느 슬롯을 볼지**만 안다. 그 슬롯 이름의 정본도 여기다(zone 의 레시피가 이걸 불러 쓴다).
const CARRIER_SLOT = 'back';
// 착용 중인 운반구 인스턴스 — 없으면 null. 파손품은 섬기지 않는다(zone 이 자동 해제하지만 이중 방어).
function carrierOf(p) {
  const id = p && p.equipSlots && p.equipSlots[CARRIER_SLOT];
  if (!id) return null;
  const inst = (p.equipment || []).find((e) => e && e.id === id);
  if (!inst || inst.broken || inst.dura === 0) return null;
  return inst;
}
function carrierBonus(p) {
  const inst = carrierOf(p);
  const v = inst && inst.attrs ? Number(inst.attrs.load) : 0;
  return Number.isFinite(v) && v > 0 ? v : 0;
}
function capKg(p) { return CFG.CAP_KG + carrierBonus(p); }
// ★지게가 **지금 일하고 있나** — 마모 판정의 정본. 기본 상한을 넘지 않는 짐이면 지게는 놓아둔 것과 같다
//   ⇒ 빈 몸으로 걷는다고 닳지 않는다(옷이 **추울 때만** 닳는 것과 같은 규약).
function carrierWorking(p) {
  if (!carrierOf(p)) return false;
  return totalKg(p) > CFG.CAP_KG;
}

// ── 효과 ────────────────────────────────────────────────────────────────────
function effects(p) {
  const kg = totalKg(p), cap = capKg(p);
  const r = cap > 0 ? kg / cap : 0;
  const raw = lerpCurve(MOVE_CURVE, r);
  const move = Math.max(CFG.MOVE_FLOOR, raw);
  // 피로 가속 — 초과율에 **선형**. r=2 에서 FATIGUE_AT_2X 배.
  const fatigue = 1 + Math.max(0, r - 1) * (CFG.FATIGUE_AT_2X - 1);
  return {
    kg, cap, ratio: +r.toFixed(4), over: r > 1,
    moveMult: +move.toFixed(4), rawMove: +raw.toFixed(4),
    fatigueMult: +fatigue.toFixed(4),
    floored: raw < CFG.MOVE_FLOOR,
  };
}
// 단계(겉은 계단) — 전환에만 히스테리시스.
function stageOf(p, r) {
  if (!p._carryStage) p._carryStage = 0;
  const H = CFG.STAGE_HYST;
  let s = p._carryStage;
  while (s < 3 && r >= STAGE_AT[s] + H) s++;
  while (s > 0 && r < STAGE_AT[s - 1] - H) s--;
  p._carryStage = s;
  return s;
}
function moodle(p) {
  const e = effects(p);
  const s = stageOf(p, e.ratio);
  return s > 0 ? { axis: 'carry', ko: '무거움', emo: '🎒', stage: s, sev: +Math.min(1, (e.ratio - 1) / (RMAX - 1)).toFixed(3) } : null;
}
// ★신체 × 과적 **합산** — 곱하되 바닥에서 자른다(둘 다 최악이어도 0.35 아래로 안 간다).
function combinedMove(bodyMove, carryMove) {
  const b = Number(bodyMove); const c = Number(carryMove);
  const bb = Number.isFinite(b) ? b : 1, cc = Number.isFinite(c) ? c : 1;
  return +Math.max(CFG.COMBINED_FLOOR, bb * cc).toFixed(4);
}
// 클라·패널이 그릴 것 전부 — 하네스도 이걸 읽는다(사본 계측기 금지).
function payload(p) {
  const e = effects(p);
  return { kg: e.kg, cap: e.cap, ratio: e.ratio, over: e.over,
           moveMult: e.moveMult, fatigueMult: e.fatigueMult, floored: e.floored,
           stage: stageOf(p, e.ratio) };
}
// ★저장은 **항목 모양으로만** 나간다(옛 수의 배열은 여기서 올려 보낸다) — 저장 전후 구조가 갈리면
//   "재접속을 넘어 그대로인가" 판정이 자기 직렬화 때문에 실패한다(로트가 겪은 그 함정).
function toSave(p) {
  const L = ledger(p);
  for (const item of Object.keys(L)) { _norm(p, item); if (!L[item] || !L[item].length) delete L[item]; }
  return Object.keys(L).length ? L : null;
}
function fromSave(p, saved) {
  if (saved && typeof saved === 'object') p.kgLedger = saved;
  p._kgNextId = undefined;                       // ★id 카운터를 되짚게 한다(최대값+1) — 복원 뒤 충돌 금지
  for (const item of Object.keys(ledger(p))) _norm(p, item);
  return ledger(p);
}

module.exports = { CFG, MOVE_CURVE, STAGE_AT, R1,
  lerpCurve, xWhereBelow, ledger, noteInstance, noteEntries, takeKg, takeEntries, takeByIds, peekKg, reconcile,
  hasLedger, entries, viewLedger, assertInvariant, assertCount,
  totalKg, capKg, effects, stageOf, moodle, combinedMove, payload, toSave, fromSave,
  CARRIER_SLOT, carrierOf, carrierBonus, carrierWorking };
