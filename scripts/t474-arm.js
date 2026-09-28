#!/usr/bin/env node
// === scripts/t474-arm.js — T474 ③ 유도 팔 관측(3시드 800일) — `t17-metrics` 를 **그대로** 돌리고 옆에서 본다 ===
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 t17 을 안 고치나: t17 은 기준선의 자다 — 끔 팔 JSON 이 main 의 JSON 과 **바이트 동일**한 것이 "끔 = 종전"의 증거물이다.
//   그래서 이 파일은 t17 을 **한 프로세스 안에서 require** 하고, 정본 두 문에 **관측만** 거는 줄을 단다:
//     ⓐ `economy-sim-v2.createWorldV2` — 돌려주는 세계를 붙든다(판이 끝난 뒤 `tradeLog`·캐러밴 수를 읽는다)
//     ⓑ `events.createLedger` 의 `onEvent` — 사건마다 (마을, 날)을 적는다(t17 이 준 콜백은 **그대로 먼저** 부른다)
//   세계·장부에 아무것도 안 넣는다(값·순서 무변) ⇒ 이 파일로 돈 끔 팔의 t17 JSON 이 main 과 같으면 관측이 무해하다는 증거다.
//
// ★내는 것(한 판 · `<arm.json>`):
//   · 캐러밴 — 띄운 수(`_caravanIdCounter`) · 교역 기록 수 · 날 수 분포(기록의 `travelDays`) · 재routing·빈손 귀환·약탈 기록
//   · 소문 도달 — 사건마다 다른 마을에 닿는 날(정본 `server/rumor.js` 그래프 · 거리 = econ `villageDist`(이 자는 행렬이 없어 유클리드))
//       ★소문은 **캐러밴 시계를 탄다**(T7 제2 규약 — 시계 둘 금지): 그래프 속도 = econ 이 내보낸 이 판의 시계(`CARAVAN_DAY_SPEED`).
//         끔 = 500(= rumor 거울 그대로) · 켬 = 7,200. 관측이라 세계는 모른다(헤드리스엔 원래 소문이 없다 — t17 장부에 geo 가 없다).
//
// 실행: [T474_CARAVAN_WALK=1] T17_JSON=<t17.json> [LAB_SEEDCACHE=<캐시>] node scripts/t474-arm.js <일수> <시드> <arm.json>
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 1020;
const OUT = process.argv[4] || `/tmp/t474/arm-${SEED}.json`;

process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
const econ = require(path.join(ROOT, 'sim', 'economy-sim'));
const Events = require(path.join(ROOT, 'server', 'events'));
const Rumor = require(path.join(ROOT, 'server', 'rumor'));

// ⓐ 세계를 붙든다(관측만)
let W = null;
const _cw = econV2.createWorldV2;
econV2.createWorldV2 = function (...a) { const w = _cw.apply(this, a); W = w; return w; };
// ⓑ 사건을 적는다(관측만 — t17 콜백을 먼저 그대로 부른다)
const EV = [];
const _cl = Events.createLedger;
Events.createLedger = function (o) {
  const inner = o && o.onEvent;
  const o2 = Object.assign({}, o, { onEvent: (e) => { if (inner) inner(e); if (e && e.vid != null) EV.push([e.vid | 0, e.day | 0]); } });
  return _cl.call(this, o2);
};

process.argv = [process.argv[0], path.join(ROOT, 'scripts', 't17-metrics.js'), String(DAYS), String(SEED)];
require(path.join(ROOT, 'scripts', 't17-metrics.js'));
if (!W) { console.error('✗ 세계를 못 붙들었다'); process.exit(2); }

const q = (a, f) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * f))]; };
const d5 = (a) => ({ n: a.length, p10: q(a, 0.1), p50: q(a, 0.5), p90: q(a, 0.9), max: q(a, 1), mean: a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) : null });
const TL = W.tradeLog || [];
const td = TL.filter((t) => t && isFinite(t.travelDays)).map((t) => t.travelDays);
const dist = TL.filter((t) => t && isFinite(t.distance)).map((t) => t.distance);
const caravan = {
  clock: econV2.CARAVAN_DAY_SPEED, launched: W._caravanIdCounter || 0, log: TL.length,
  rerouted: TL.filter((t) => t && t.rerouted).length, abandoned: TL.filter((t) => t && (t.abandoned || (t.note && /빈손|포기/.test(t.note)))).length,
  raided: TL.filter((t) => t && t.raided).length,
  travelDays: d5(td), distance: d5(dist), perVillageDay: +((W._caravanIdCounter || 0) / Math.max(1, W.villages.length * DAYS)).toFixed(4),
  inFlightEnd: (W.caravans || []).length,
};
// 소문 도달 — 사건마다: 7일 안에 닿는 마을 수 · 닿는 마을 전부에 닿는 날 · 판 끝(DAYS)까지 들은 몫
const vs = W.villages;
const geo = { vids: () => vs.map((_, i) => i), dist: (a, b) => econ.villageDist(vs[a], vs[b]) };
const s0 = Rumor.CFG.SPEED; Rumor.CFG.SPEED = econV2.CARAVAN_DAY_SPEED;
const G = Rumor.createGraph(geo);
const rows = vs.map((_, i) => vs.map((__, j) => G.delayBetween(i, j)));
Rumor.CFG.SPEED = s0;
const in7 = [], full = [], heardEnd = [];
let pairs = 0, heard = 0, delaySum = 0;
for (const [vid, day] of EV) {
  const r = rows[vid]; if (!r) continue;
  let n7 = 0, mx = 0, h = 0, k = 0;
  for (let j = 0; j < r.length; j++) {
    if (j === vid || !isFinite(r[j])) continue;
    k++; pairs++; delaySum += r[j];
    if (r[j] <= 7) n7++;
    if (r[j] > mx) mx = r[j];
    if (day + r[j] <= DAYS) { h++; heard++; }
  }
  in7.push(n7); full.push(mx); heardEnd.push(k ? h / k : 0);
}
const rumor = { speed: econV2.CARAVAN_DAY_SPEED, events: EV.length, in7: d5(in7), fullReach: d5(full),
  meanDelay: pairs ? +(delaySum / pairs).toFixed(3) : null, heardByEnd: pairs ? +(heard / pairs).toFixed(4) : null };
const out = { seed: SEED, days: DAYS, arm: econV2.CARAVAN_DAY_SPEED === econV2.NPC_SPEED ? 'off' : 'walk', caravan, rumor };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`\n[T474 팔] ${out.arm} · 시계 ${caravan.clock} · 캐러밴 ${caravan.launched}(기록 ${caravan.log}) · 날 p50 ${caravan.travelDays.p50} 평균 ${caravan.travelDays.mean}`
  + ` · 소문 7일 안 p50 ${rumor.in7.p50}곳 · 평균 지연 ${rumor.meanDelay}일 → ${OUT}`);
