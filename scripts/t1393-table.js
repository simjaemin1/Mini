#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1393 판 표 · 읽기만)
// === scripts/t1393-table.js — 사냥판 판 셋(끔 · 몸 판만 · 켬)의 날 줄(`t1393-probe`)을 표로 ==========================
//   node scripts/t1393-table.js <runs 폴더> <씨> [끈 판 탐침(사냥 마을 고르기 — T1359 off-<씨>.probe.jsonl)]
//   ⚠OFFP 는 T1331 장부 탐침 꼴(칸 [10] = econ 사냥꾼) — 그 파일은 zone 칸이 있다(아래 HV 는 그 줄을 읽는다).
//   사냥 마을 = 끈 판(판 시계 기준선 판 조건) 날 50 ~ 400 econ 사냥꾼 평균 ≥ 1(T1359 `사냥마을.js` 같은 식 · 그 판 탐침 칸 [10]).
'use strict';
const fs = require('fs'), path = require('path');
const [, , D, SEED, OFFP] = process.argv;
const KG = 2450 / 1500;   // econ 고기 단위 → kg(`kcal.js` DAY_KCAL 2,450 ÷ meat_game 1,500 kcal/kg — t1331-analyze 와 같은 수)
const load = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => !r.err && r.zone === undefined) : null;   // t1331-run 의 장부 탐침이 같은 파일에 쓴다(칸 `zone`) — 이 탐침 줄만
let HV = null;
if (OFFP && fs.existsSync(OFFP)) {
  const O = fs.readFileSync(OFFP, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.vil && r.zone !== undefined), hs = {}; let n = 0;
  for (const r of O) { if (r.d < 50) continue; n++; for (const v of r.vil) hs[v[0]] = (hs[v[0]] || 0) + v[10]; }
  HV = new Set(Object.keys(hs).filter((k) => hs[k] / n >= 1));
}
const at = (L, d) => L.find((r) => r.d === d) || L.filter((r) => r.d <= d).pop() || L[L.length - 1];
const out = {};
for (const tag of ['off', 'body', 'on']) {
  const L = load(path.join(D, `${tag}-${SEED}.probe.jsonl`)); if (!L || !L.length) continue;
  const last = L[L.length - 1], r1 = at(L, 2);
  const hv = (r, f) => r.vil.filter((v) => HV && HV.has(v[0])).reduce((a, v) => a + f(v), 0);
  const meat = L.filter((r) => r.d >= 1).map((r) => r.meat), meat50 = L.filter((r) => r.d >= 50).map((r) => r.meat);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const cpuDay = (r1 && last.d > r1.d) ? (last.cpu - r1.cpu) / 1e6 / (last.d - r1.d) : null;
  const ch = last.chase, b = last.body, b1r = L.find((r) => r.body && r.body.home), b1 = b1r ? b1r.body : null;
  let homes = null;
  if (b && b1 && b1.home && b.home) { const h0 = Object.keys(b1.home).length; const h1 = Object.keys(b.home).length; homes = { at: b1r.d, start: h0, end: h1, empty: h0 - h1 }; }
  const hunters = (d) => at(L, d).hun;
  const huntDays = L.reduce((a, r) => a + (r.hun || 0), 0);
  out[tag] = {
    days: last.d, pop: { d100: at(L, 100).pop, d400: last.pop }, hunters: { d1: hunters(1), d50: hunters(50), d100: hunters(100), d200: hunters(200), d400: last.hun },
    meatKgDay: +(avg(meat) * KG).toFixed(1), meatKgDay50: +(avg(meat50) * KG).toFixed(1),
    hunt: HV ? { n: HV.size, pop100: hv(at(L, 100), (v) => v[1]), pop400: hv(last, (v) => v[1]), fd400: hv(last, (v) => v[4]), empty400: last.vil.filter((v) => HV.has(v[0]) && v[1] === 0).length, hunters400: hv(last, (v) => v[2]), got: hv(last, (v) => v[5]) } : null,
    empty400: last.vil.filter((v) => v[1] === 0).length, fd400: last.vil.reduce((a, v) => a + v[4], 0),
    body: b ? { start: b.start, d100: at(L, 100).body.alive, d400: b.alive, died: b.died, born: b.born, mismatch: b.mismatch, by: b.by, homes } : null,
    chase: ch ? { wake: ch.wake, sleep: ch.sleep, hunt: ch.hunt, seen: ch.seen, cap: ch.cap, cut: ch.cut, lost: ch.lost, awakeMean: +(ch.awakeSum / Math.max(1, ch.awakeN)).toFixed(1), awakePeak: ch.awakePeak, ownPeak: ch.ownPeak, fieldPeak: ch.fieldPeak,
      cpuSecDay: +(ch.cpuUs / 1e6 / last.d).toFixed(2), cpuMaxMs: +(ch.cpuMax / 1000).toFixed(1), huntMin: ch.huntMin != null ? Math.round(ch.huntMin) : null } : null,
    t1195: last.t1195, killsPerHunterDay: ch && huntDays ? +(ch.hunt / huntDays).toFixed(3) : null,
    cpuSecDay: cpuDay != null ? +cpuDay.toFixed(2) : null,
  };
}
console.log(JSON.stringify({ seed: +SEED, huntVil: HV ? [...HV] : null, ...out }, null, 1));
