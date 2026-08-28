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

// ── 개체 kg 장부 ─────────────────────────────────────────────────────────────
//   ★낚시 v2 가 남긴 자리를 채운다: 1.7kg 물고기와 0.4kg 물고기는 **다른 물건**이다.
//   구조는 `oreLedger`(선광 전 원석의 숨은 kg 장부)와 **같은 문법**이다 — 새 발명이 아니다.
//   `p.kgLedger[item] = [kg, kg, …]` — 그 아이템 **개수만큼**의 실제 무게 목록(FIFO).
//   목록이 개수보다 짧으면 남는 것은 **표준 kg** 로 친다(옛 저장·다른 취득 경로와의 호환).
function ledger(p) {
  if (!p.kgLedger || typeof p.kgLedger !== 'object') p.kgLedger = {};
  return p.kgLedger;
}
function noteInstance(p, item, kg) {
  const L = ledger(p);
  if (!Array.isArray(L[item])) L[item] = [];
  L[item].push(+(+kg).toFixed(3));
  return L[item];
}
// 개수 n 을 꺼낼 때의 **실제 kg 합**(FIFO). 장부를 실제로 깎는다.
function takeKg(p, item, n) {
  const L = ledger(p), std = W.kgOfOrDefault(item);
  let left = Math.max(0, Math.floor(n)), sum = 0;
  const arr = Array.isArray(L[item]) ? L[item] : null;
  while (left > 0 && arr && arr.length) { sum += arr.shift(); left--; }
  sum += left * std;                       // 장부에 없는 몫은 표준 무게
  if (arr && !arr.length) delete L[item];
  return +sum.toFixed(3);
}
// 깎지 않고 보기만(견적·표시용)
function peekKg(p, item, n) {
  const L = ledger(p), std = W.kgOfOrDefault(item);
  const arr = Array.isArray(L[item]) ? L[item] : [];
  let left = Math.max(0, Math.floor(n)), sum = 0, i = 0;
  while (left > 0 && i < arr.length) { sum += arr[i++]; left--; }
  return +(sum + left * std).toFixed(3);
}
// 장부가 개수보다 길면 잘라 낸다(다른 경로가 인벤만 깎았을 때의 자기 치유).
function reconcile(p, inventory) {
  const L = ledger(p);
  for (const item of Object.keys(L)) {
    const have = Math.max(0, Math.floor(Number((inventory || {})[item]) || 0));
    if (!Array.isArray(L[item]) || !L[item].length) { delete L[item]; continue; }
    if (L[item].length > have) L[item].length = have;
    if (!L[item].length) delete L[item];
  }
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
function capKg(p) { return CFG.CAP_KG; }   // ★지게 등 확장구는 회부 — 지금은 한 값이다

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
function toSave(p) { const L = ledger(p); return Object.keys(L).length ? L : null; }
function fromSave(p, saved) { if (saved && typeof saved === 'object') p.kgLedger = saved; return ledger(p); }

module.exports = { CFG, MOVE_CURVE, STAGE_AT, R1,
  lerpCurve, xWhereBelow, ledger, noteInstance, takeKg, peekKg, reconcile,
  totalKg, capKg, effects, stageOf, moodle, combinedMove, payload, toSave, fromSave };
