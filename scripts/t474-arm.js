#!/usr/bin/env node
// === scripts/t474-arm.js — T474 ③ · T489 유도·분리 팔 관측(3시드 800일) — `t17-metrics` 를 **그대로** 돌리고 옆에서 본다 ===
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 t17 을 안 고치나: t17 은 기준선의 자다 — 끔 팔 JSON 이 main 의 JSON 과 **바이트 동일**한 것이 "끔 = 종전"의 증거물이다.
//   그래서 이 파일은 t17 을 **한 프로세스 안에서 require** 하고, 정본 문에 **관측만** 거는 줄을 단다:
//     ⓐ `economy-sim-v2.createWorldV2` — 돌려주는 세계를 붙든다(판이 끝난 뒤 `tradeLog`·캐러밴 수를 읽는다)
//     ⓑ `economy-sim-v2.tickWorldV2` — 하루가 끝날 때마다 사람 수를 더하고 **새로 뜬 캐러밴**을 붙든다(출발·도착·귀환 날 = 캐러밴이 마을에 닿은 날)
//     ⓒ `events.createLedger` — `onEvent` 로 사건마다 (마을, 날, 유형, 품목)을 적고(t17 이 준 콜백을 **먼저 그대로** 부른다) ·
//        돌려주는 장부를 붙든다(판 끝에 `stats` — 유형별 수 · 게시·철회·깨진 약속을 읽는다)
//   세계·장부에 아무것도 안 넣는다(값·순서 무변) ⇒ 이 파일로 돈 끔 팔의 t17 JSON 이 main 과 같으면 관측이 무해하다는 증거다.
//   ★[T489] `T474_ARM_GEO=1` 이면 장부에 **지리를 준다**(`o.geo` — 소문 그래프가 장부 안에서 산다 · 거리 = econ `villageDist`).
//     장부의 사건 방출은 소문을 안 읽는다(`events.js` — RUMOR 는 조회 쪽 `visibleEvents`·`delayTo` 에만) ⇒ 지리를 줘도 t17 JSON 이
//     그대로여야 한다 — 그게 "밀도 ㉮ 는 소문 시계에 안 기댄다"의 **자명하지 않은** 실측이다(소문 그래프가 실제로 돈 판).
//
// ★내는 것(한 판 · `<arm.json>`):
//   · 캐러밴 — 띄운 수(`_caravanIdCounter`) · 교역 기록 수 · 날 수 분포(기록의 `travelDays`) · 도착 감사(`_tradeAudit`: 도착·손절·재routing)
//   · 장부 — 유형별 사건 수(`stats.byType`) · 유형 × 품목 · 게시 · 철회 · 축소 · 못갚아 · **깨진 약속**(T142 재검증 철회)
//   · 눈금 둘 — 마을·일(살아 있는 마을 × 날) · 사람·일(날마다 인구 합)
//   · 닿은 날 — 캐러밴이 떠나거나 닿은 (마을, 날)과 그 다음 날 · 값 사건(부족·글럿·값 오름·값 내림)이 그 날에 몰리는 몫
//   · 소문 도달 — 사건마다 다른 마을에 닿는 날(정본 `server/rumor.js` 그래프 · 거리 = econ `villageDist`(이 자는 행렬이 없어 유클리드))
//       두 속도로 센다: **코드 그대로**(`Rumor.CFG.SPEED` — 끔 500 거울 · T489 켬 = 몸) · **T7 이 요구하는 대로**(캐러밴 시계 = `CARAVAN_DAY_SPEED`)
//       `rumor` 칸은 T474 표와 같은 뜻(T7)이다 — `rumorCode` 가 코드 그대로다.
//
// 실행: [T474_CARAVAN_WALK=1] [T489_RUMOR_SPLIT=1|day] [T474_ARM_GEO=1] T17_JSON=<t17.json> node scripts/t474-arm.js <일수> <시드> <arm.json>
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 1020;
const OUT = process.argv[4] || `/tmp/t474/arm-${SEED}.json`;
const GEO = process.env.T474_ARM_GEO === '1';

process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
const econ = require(path.join(ROOT, 'sim', 'economy-sim'));
const Events = require(path.join(ROOT, 'server', 'events'));
const Rumor = require(path.join(ROOT, 'server', 'rumor'));

// ⓐ 세계를 붙든다(관측만)
let W = null;
const _cw = econV2.createWorldV2;
econV2.createWorldV2 = function (...a) { const w = _cw.apply(this, a); W = w; return w; };
// ⓑ 하루 끝 — 사람·일 · 새 캐러밴(관측만)
let personDays = 0, villageDaysLive = 0, ticks = 0;
const CAR = new Map();   // id → { c, from, to, dep }
const vIdx = new Map();  // econ 마을 → t17 vid(= 배열 자리)
const _tw = econV2.tickWorldV2;
econV2.tickWorldV2 = function (w, ...rest) {
  const r = _tw.call(this, w, ...rest);
  if (w === W) {
    ticks++;
    if (!vIdx.size) W.villages.forEach((v, i) => vIdx.set(v, i));
    for (const v of W.villages) { const n = (v.npcs || []).length; personDays += n; if (n > 0) villageDaysLive++; }
    for (const c of (W.caravans || [])) {
      if (!c || c.id == null || CAR.has(c.id)) continue;
      CAR.set(c.id, { c, from: vIdx.get(c.from), to: vIdx.get(c.to), dep: c.departDay });
    }
  }
  return r;
};
// ⓒ 장부 — 사건(마을·날·유형·품목) · 장부 붙들기 · [T489] 지리 주입(선택)
const EV = [];                                // [vid, day, typeIdx, itemIdx]
const TYPES = [], TIX = new Map(), ITEMS = [], IIX = new Map();
const ix = (m, arr, k) => { let i = m.get(k); if (i === undefined) { i = arr.length; arr.push(k); m.set(k, i); } return i; };
let LEDGER = null;
const _cl = Events.createLedger;
Events.createLedger = function (o) {
  const inner = o && o.onEvent;
  const extra = { onEvent: (e) => { if (inner) inner(e); if (e && e.vid != null) EV.push([e.vid | 0, e.day | 0, ix(TIX, TYPES, e.type), ix(IIX, ITEMS, e.item == null ? '' : String(e.item))]); } };
  if (GEO && W) {
    const vs = W.villages;
    extra.geo = { vids: () => vs.map((_, i) => i), dist: (a, b) => econ.villageDist(vs[a], vs[b]) };
  }
  LEDGER = _cl.call(this, Object.assign({}, o, extra));
  return LEDGER;
};

process.argv = [process.argv[0], path.join(ROOT, 'scripts', 't17-metrics.js'), String(DAYS), String(SEED)];
require(path.join(ROOT, 'scripts', 't17-metrics.js'));
if (!W) { console.error('✗ 세계를 못 붙들었다'); process.exit(2); }
if (!LEDGER) { console.error('✗ 장부를 못 붙들었다'); process.exit(2); }

const q = (a, f) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * f))]; };
const d5 = (a) => ({ n: a.length, p10: q(a, 0.1), p50: q(a, 0.5), p90: q(a, 0.9), max: q(a, 1), mean: a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) : null });
const TL = W.tradeLog || [];
const td = TL.filter((t) => t && isFinite(t.travelDays)).map((t) => t.travelDays);
const dist = TL.filter((t) => t && isFinite(t.distance)).map((t) => t.distance);
const A = W._tradeAudit || { n: 0, bail: 0, reroute: 0 };
const caravan = {
  clock: econV2.CARAVAN_DAY_SPEED, launched: W._caravanIdCounter || 0, log: TL.length,
  rerouted: TL.filter((t) => t && t.rerouted).length, abandoned: TL.filter((t) => t && (t.abandoned || (t.note && /빈손|포기/.test(t.note)))).length,
  raided: TL.filter((t) => t && t.raided).length,
  travelDays: d5(td), distance: d5(dist), perVillageDay: +((W._caravanIdCounter || 0) / Math.max(1, W.villages.length * DAYS)).toFixed(4),
  inFlightEnd: (W.caravans || []).length,
  audit: { arrived: A.n || 0, bail: A.bail || 0, reroute: A.reroute || 0 },
};
// ── 장부 ─────────────────────────────────────────────────────────────────────
const S = LEDGER.stats || {};
const ledger = { emitted: S.emitted, days: S.days, byType: Object.assign({}, S.byType || {}),
  reqOpened: S.reqOpened, reqClosed: S.reqClosed, reqShrunk: S.reqShrunk, reqNoPay: S.reqNoPay, reqRevalidated: S.reqRevalidated,
  reqFilled: S.reqFilled, capped: S.capped };
const typeItem = {};
for (const [, , t, it] of EV) { const T = TYPES[t], I = ITEMS[it]; (typeItem[T] || (typeItem[T] = {}))[I] = ((typeItem[T] || {})[I] || 0) + 1; }
// ── 닿은 날 — 캐러밴이 떠나거나 닿은 (마을, 날) · 사건은 그 날이나 다음 날에 난다(틱·장부 날 매김 차이를 품는 창) ──
const KEY = (v, d) => v * 8192 + d;
const touch = new Set();
let legs = 0;
for (const { c, from, to, dep } of CAR.values()) {
  const put = (v, d) => { if (v == null || !isFinite(d) || d < 0 || d > DAYS + 1) return; touch.add(KEY(v, d)); legs++; };
  put(from, dep); put(to, c.arriveDay); put(from, c.returnArriveDay);
}
const touched = (v, d) => touch.has(KEY(v, d)) || touch.has(KEY(v, d - 1));
const VALUE = new Set(['STOCK_SHORTAGE', 'STOCK_GLUT', 'PRICE_SPIKE', 'PRICE_DROP']);
let vEv = 0, vEvT = 0, allEv = 0, allEvT = 0;
for (const [v, d, t] of EV) { const on = touched(v, d); allEv++; if (on) allEvT++; if (VALUE.has(TYPES[t])) { vEv++; if (on) vEvT++; } }
let vd = 0, vdT = 0;
for (let v = 0; v < W.villages.length; v++) for (let d = 1; d <= DAYS; d++) { vd++; if (touched(v, d)) vdT++; }
const touchStat = { legs, touchedVillageDays: vdT, villageDays: vd, shareDays: +(vdT / Math.max(1, vd)).toFixed(4),
  valueEvents: vEv, valueTouched: vEvT, shareValue: +(vEvT / Math.max(1, vEv)).toFixed(4),
  allEvents: allEv, allTouched: allEvT, shareAll: +(allEvT / Math.max(1, allEv)).toFixed(4),
  // 닿은 날·안 닿은 날의 값 사건 비율(마을·일당) — 둘의 비가 "캐러밴이 닿은 날에 값 사건이 몇 배 잦나"
  rateTouched: +(vEvT / Math.max(1, vdT)).toFixed(4), rateUntouched: +((vEv - vEvT) / Math.max(1, vd - vdT)).toFixed(4) };
// ── 소문 도달 — 두 속도(코드 그대로 · T7) ────────────────────────────────────
const vs = W.villages;
const geo = { vids: () => vs.map((_, i) => i), dist: (a, b) => econ.villageDist(vs[a], vs[b]) };
function reachAt(speed) {
  const s0 = Rumor.CFG.SPEED; Rumor.CFG.SPEED = speed;
  const G = Rumor.createGraph(geo);
  const rows = vs.map((_, i) => vs.map((__, j) => G.delayBetween(i, j)));
  Rumor.CFG.SPEED = s0;
  const in7 = [], full = [], hist = new Map();
  let pairs = 0, heard = 0, delaySum = 0;
  for (const [vid, day] of EV) {
    const r = rows[vid]; if (!r) continue;
    let n7 = 0, mx = 0;
    for (let j = 0; j < r.length; j++) {
      if (j === vid || !isFinite(r[j])) continue;
      pairs++; delaySum += r[j]; hist.set(r[j], (hist.get(r[j]) || 0) + 1);
      if (r[j] <= 7) n7++;
      if (r[j] > mx) mx = r[j];
      if (day + r[j] <= DAYS) heard++;
    }
    in7.push(n7); full.push(mx);
  }
  // (사건 × 마을) 도달 날 분포 — 막대그림에서 분위수를 읽는다(쌍이 수백만이라 정렬하지 않는다)
  const ks = [...hist.keys()].sort((a, b) => a - b);
  const qh = (f) => { let acc = 0; const want = f * pairs; for (const k of ks) { acc += hist.get(k); if (acc >= want) return k; } return ks.length ? ks[ks.length - 1] : null; };
  return { speed, events: EV.length, in7: d5(in7), fullReach: d5(full),
    delay: { pairs, p10: qh(0.1), p50: qh(0.5), p90: qh(0.9), max: ks.length ? ks[ks.length - 1] : null, within7: pairs ? +(ks.filter((k) => k <= 7).reduce((a, k) => a + hist.get(k), 0) / pairs).toFixed(4) : null },
    meanDelay: pairs ? +(delaySum / pairs).toFixed(3) : null, heardByEnd: pairs ? +(heard / pairs).toFixed(4) : null };
}
const rumorT7 = reachAt(econV2.CARAVAN_DAY_SPEED);
const rumorCode = (Rumor.CFG.SPEED === econV2.CARAVAN_DAY_SPEED) ? rumorT7 : reachAt(Rumor.CFG.SPEED);
const T474 = econV2.CARAVAN_DAY_SPEED !== econV2.NPC_SPEED, T489 = econV2.T489_RUMOR_SPLIT;
const arm = T489 ? (T474 ? (T489 === 'day' ? 'both-day' : 'both') : 'split') : (T474 ? 'walk' : 'off');
const out = { seed: SEED, days: DAYS, arm, geo: GEO, clocks: { caravan: econV2.CARAVAN_DAY_SPEED, rumorCode: Rumor.CFG.SPEED, t489: T489 || null },
  caravan, rumor: rumorT7, rumorCode, ledger, typeItem, scale: { personDays, villageDaysLive, ticks }, touch: touchStat,
  // 장부 안 소문 그래프가 실제로 돌았나(지리 준 판) — 행 수·세대 · 없으면 null(지리 없는 판 = t17 그대로)
  ledgerRumor: LEDGER.hasRumor ? Object.assign({ speed: Rumor.CFG.SPEED }, JSON.parse(JSON.stringify(LEDGER.rumorStats || {}))) : null };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`\n[T474·T489 팔] ${arm}${GEO ? ' · 지리 줌' : ''} · 캐러밴 시계 ${caravan.clock} · 소문 시계(코드) ${Rumor.CFG.SPEED} · 캐러밴 ${caravan.launched} · 날 평균 ${caravan.travelDays.mean}`
  + ` · 사건 ${ledger.emitted} · 값 사건 닿은 날 몫 ${touchStat.shareValue}(날 몫 ${touchStat.shareDays}) · 소문 평균 지연(코드) ${rumorCode.meanDelay}일 → ${OUT}`);
