// === 계측/T1342_2026-11-16/t1342_eq.js — 돌아온 사람 소식 줄 자리 옮김이 문 결과를 안 바꾸는가(계측 전용 · 제품 무변) ===
//   두 해 판의 묶음 + 고침(BKG2) 세 판과 v2 만 + 고침 1020 · 42 는 소식 줄이 받는 곳 문(`_t1312Pass`) 안에 있던 글로 돌았다.
//   그 글은 하네스 `test-t1306-migrate-food` 가 떼어 읽는 `_t1312Pass` 글을 바꿔 그 하네스를 깼다 — 그래서 소식 줄을 들은 줄(`_t1306Known`)로 옮겼다(`_t1312Pass` 는 베이스 글 그대로).
//   옛 글(아래 OLD_* — 옮기기 전 그대로) · 새 글(이 나무 server/villages.js)의 함수 사본을 같은 무작위 입력 25만에 부르고 받는 곳 문 결과(들은 행복 · null)를 견준다.
//   입력: 손잡이 셋 꼴(문 켬 · K 켬 / 문 끔 · K 켬 / 둘 다 끔) · 들은 줄 0 ~ 3줄(행복 · 침상 · K 없음 포함) · 소식 없음 · 옛 소식 · 다른 마을 소식 · 새 소식 · 앞서 고른 수 0 ~ 6
//     + 소식이 결과를 바꾸는 꼴만 5만(옛 글에서 소식을 끄면 결과가 바뀌는 사례를 센다 — 견줌이 헛돌지 않는다는 증인).
//   node 계측/T1342_2026-11-16/t1342_eq.js → 한 줄 JSON(같음 = 사례 수면 옮김이 문 결과를 안 바꾼다)
'use strict';
const fs = require('fs'), path = require('path');
const NEW = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'villages.js'), 'utf8');
const OLD_KNOWN = "function _t1306Known(fromVil, toVil, day) {   // 받는 마을 곳간을 떠나는 마을에서 아는 만큼 — { d, fe, n, lag } · 모르면 null\n  const L = state.ledger, e = toVil && toVil.econ;\n  if (!L || typeof L.delayTo !== 'function' || !e || !fromVil) return null;\n  const lag = L.delayTo(fromVil.dbId, toVil.dbId);\n  if (!isFinite(lag)) return null;   // 못 닿는 마을 — 소문이 영영 안 간다(rumor.js 제4 규약)\n  const ring = Array.isArray(e._t1306Fd) ? e._t1306Fd : null; if (!ring) return null;\n  const td = (day | 0) - lag;\n  for (let i = ring.length - 1; i >= 0; i--) if ((ring[i].d | 0) <= td) return { d: ring[i].d | 0, fe: ring[i].fe, n: ring[i].n, h: ring[i].h, beds: ring[i].beds, K: ring[i].K, lag };   // ★[T1312] 행복 · 침상 · ★[T1319] K(켬 줄에만 있다)\n  return null;   // 소식이 아직 안 닿았다(판 첫날 · 고리보다 먼 소식)\n}";
const OLD_PASS = "function _t1312Pass(fromVil, toVil, day, h0) {   // 이주 문(켬) — 들은 행복 · 침상 · 곳간 + 무리 셈 · 통과면 들은 행복 · 아니면 null\n  const E1 = state.econ, k = _t1306Known(fromVil, toVil, day);\n  _t1312Stat.seen++;\n  if (!k) { _t1312Stat.unknown++; return null; }\n  _t1312Stat.lagSum += k.lag;\n  if (h0 == null || k.h == null || !(k.h > h0)) { _t1312Stat.unhappy++; return null; }\n  const _ks = _t1342On() ? _t1342Told(fromVil, toVil, k) : null;   // ★[T1342] 문 앞에서 돌아온 사람이 전한 소식(사람 수 · K)이 들은 줄보다 새면 그것(끔 = null = 종전 줄)\n  const pk = _t1312PickedOf(fromVil, toVil, day), nk = (_ks ? _ks.n : k.n) + pk, beds = k.beds == null ? Infinity : k.beds;\n  if (!(beds > nk)) { _t1312Stat.beds++; return null; }\n  if (_t1319KOn() && (_ks ? _ks.K : k.K) != null && nk + 1 > (_ks ? _ks.K : k.K)) { _t1319Stat.overK++; if (_ks) _t1342Stat.toldCut++; return null; }   // ★[T1319] 켬 = 들은 인구 + 앞서 고른 수 + 이 사람이 들은 K 를 넘으면 안 간다(들은 K 없으면 이 문은 안 선다)\n  const per = E1.DAILY_FOOD_CONSUMPTION * (E1.t1319MigNeedDays || E1.t1297NeedDays)(day);\n  if (!(k.fe >= (nk + 1) * per)) { _t1312Stat.thin++; if (pk > 0 && k.fe >= (k.n + 1) * per) _t1312Stat.herdCut++; return null; }\n  _t1312Stat.ok++;\n  return k.h;\n}";
const sl = (S, name) => { const a = S.indexOf('function ' + name + '('); if (a < 0) throw new Error('no ' + name); return S.slice(a, S.indexOf('\n}\n', a) + 2); };
const T = { told: sl(NEW, '_t1342Told'), merge: sl(NEW, '_t1342Merge'), known: sl(NEW, '_t1306Known'), pass: sl(NEW, '_t1312Pass') };
let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const ENV = { lag: 1, per: 10, on: false, kOn: false, pk: 0 };
const ST = { ledger: { delayTo: () => ENV.lag }, econ: { get DAILY_FOOD_CONSUMPTION() { return ENV.per / 2; }, t1319MigNeedDays: () => 2 } };
const on = () => ENV.on, kOn = () => ENV.kOn, picked = () => ENV.pk;
const told = new Function(T.told + '\nreturn _t1342Told;')();
const stat = () => ({ seen: 0, ok: 0, unknown: 0, unhappy: 0, beds: 0, thin: 0, herdCut: 0, lagSum: 0 });
const mkPass = (txt, known) => new Function('state', '_t1312Stat', '_t1306Known', '_t1312PickedOf', '_t1319KOn', '_t1319Stat', '_t1342On', '_t1342Told', '_t1342Stat', txt + '\nreturn _t1312Pass;')(ST, stat(), known, picked, kOn, { overK: 0 }, on, told, { toldCut: 0, toldUse: 0 });
const PO = mkPass(OLD_PASS, new Function('state', OLD_KNOWN + '\nreturn _t1306Known;')(ST));
const merge = new Function('_t1342Told', '_t1342Stat', T.merge + '\nreturn _t1342Merge;')(told, { toldUse: 0 });
const PN = mkPass(T.pass, new Function('state', '_t1342On', '_t1342Merge', T.known + '\nreturn _t1306Known;')(ST, on, merge));
let N = 0, same = 0, diff = 0, passes = 0, toldChanged = 0; const ex = [];
const cmp = (a, b, c) => { N++; if (a === b) same++; else { diff++; if (ex.length < 5) ex.push({ c, a, b }); } };
for (let c = 0; c < 200000; c++) {
  const mode = ri(0, 2), lag = ri(1, 6), day = ri(20, 900), pk = ri(0, 6), per = 2 * ri(5, 40);
  const ring = []; const d0 = day - lag - ri(0, 12);
  for (let j = 0, L = ri(0, 3); j < L; j++) ring.push({ d: d0 + j * ri(0, 3), fe: ri(0, 4000), n: ri(0, 120), h: rnd() < 0.05 ? null : rnd(), beds: rnd() < 0.2 ? null : ri(0, 150), K: rnd() < 0.15 ? null : ri(0, 150) + (rnd() < 0.5 ? 0.5 : 0) });
  const from = { dbId: 7, econ: {} }, to = { dbId: 9, econ: { _t1306Fd: ring } }, tk = ri(0, 3);
  if (tk === 1) from.econ._t1342Seen = { 9: { d: day - ri(0, 40), n: ri(0, 200), K: ri(1, 150) + 0.5 } };
  else if (tk === 2) from.econ._t1342Seen = { 11: { d: day, n: 300, K: 1 } };
  else if (tk === 3) from.econ._t1342Seen = { 9: { d: d0 + ri(-3, 3), n: ri(0, 200), K: ri(1, 150) } };
  const h0 = rnd() < 0.05 ? null : rnd() * 0.6;
  Object.assign(ENV, { lag, per, on: mode === 0, kOn: mode !== 2, pk });
  const a = PO(from, to, day, h0), b = PN(from, to, day, h0); if (a != null) passes++; cmp(a, b, c);
}
for (let c = 0; c < 50000; c++) {
  const lag = ri(1, 6), day = ri(20, 900), pk = ri(0, 3);
  const ring = [{ d: day - lag - ri(0, 5), fe: 4000, n: ri(0, 50), h: 0.9, beds: 500, K: 100 }];
  const from = { dbId: 7, econ: { _t1342Seen: { 9: { d: day - ri(0, 3), n: ri(50, 200), K: ri(20, 120) } } } }, to = { dbId: 9, econ: { _t1306Fd: ring } };
  Object.assign(ENV, { lag, per: 20, on: true, kOn: true, pk });
  const a = PO(from, to, day, 0.1), b = PN(from, to, day, 0.1);
  ENV.on = false; if (PO(from, to, day, 0.1) !== a) toldChanged++;
  cmp(a, b, 'b' + c);
}
console.log(JSON.stringify({ cases: N, same, diff, passes, toldChanged, ex }));
process.exit(diff === 0 && toldChanged > 0 ? 0 : 1);
