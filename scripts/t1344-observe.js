'use strict';
// (@regress 없음 — 러너 밖 · T1344 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1344-observe.js — 청동 몫 곳간 · 섞어 싣기 · 식량 교역 · 합금 표(은 든 주조) — `t1333-observe.js` 뒤에 싣는 곁 프리로드 ==========
//   쓰는 법: NODE_OPTIONS="… -r $PWD/scripts/t1333-observe.js -r $PWD/scripts/t1344-observe.js" node scripts/t577-server-run.js 100 1020
//     → 판 JSON 곁 `<판>-<시드>.t1344.json`(10날마다 덮어 쓴다 · 끝에 한 번 더)
//   ① 날 머리(econ `tickVillage` 그날 첫 부름) — 청동 자격 · 대장장이 · 청동을 낸 적 있는 마을만 · 칸 `rec.acols`:
//      사람 · 전사 · 대장장이 · 석공 · 무기 곳간 · 근접검 비중(`_swordFrac`) · 청동 몫(`_t1344Q` — 손잡이 켬일 때만 선다 · 끔 = null) · 식량 안보(`_foodSecF` — 정본 함수 · 읽기) ·
//      청동 누계(`_bronzeWeaponMade`) · 구리 · 주석 곳간
//      → 자가 "종전 문(근접검 전부 ≥ 청동 몫 한도)이 닫힌 날" · "새 문(청동 근접검 ≥ 한도)이 닫힌 날"을 같은 판에서 센다.
//   ② 주조 훅(`world.onCast` — econ 대장장이 주조 갈래가 관찰기가 줄 때만 부른다 · 서버 · 랩 · 자는 안 준다):
//      [날 · 마을 · 산출 · 등급 · 청동도 · 주조성 · 구리 · 주석 · 납 · 은 · 금] + 은이 들었으면 **은을 뺀 배합**(같은 곳간(주조 앞) · 같은 값 함수 `_oppPrice` · 같은 탐색 `_meltSearch`)의
//      [등급 · 청동도 · 주조성 · 산출(노동 같음) · 구리 · 주석 · 납 · 금] — 회부 5(합금 표 고증) 한 장.
//   ③ 교역 장부(`world.tradeLog`) 새 줄(꼬리에서 읽기만): 날마다 줄 수 · 식량 교역량(econ 식량 단위 — `storageFoodPer` 정본 · 보낸 짐 + 둘째 화물 + 받아 온 짐 · 바구니) ·
//      둘째 화물(`sent2` — 섞어 싣기 · T206)이 닿은 줄 [날 · 보낸 · 받은 · 첫째 · 첫째 양 · 둘째 · 둘째 양 · 거리]
//   ④ 출발 캐러밴(`world.caravans` — 날 머리에 새 id 만): 둘째 화물이 실린 것 [날 · 보낸 · 받은 · 첫째 · 양 · 둘째 · 양 · 호위] (닿기 전 · 습격 전 계획 양)
//   ⚠값을 바꾸지 않는다 — 훅 안의 은 뺀 탐색은 곳간 **사본**으로만 · 값 함수는 그 순간 econ 이 이미 세운 캐시를 읽는다(그날 세계 공급 · 순수출가 캐시 — 같은 열쇠).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1344.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const r4 = (x) => +(+x || 0).toFixed(4);
const MELT = ['copper', 'tin', 'lead', 'silver', 'gold'];
const V2PATH = require.resolve(path.join(ROOT, 'sim', 'economy-sim-v2'));
const rec = {
  knobs: { bronzeStock: !!V1.T1344_BRONZE_STOCK, mixLoad: null, alloy: !!V1.T1333_ALLOY_ORDER, exportCast: !!V1.T1333_EXPORT_CAST },
  acols: ['pop', 'warrior', 'smith', 'mason', 'weapon', 'swordFrac', 'q', 'secF', 'bronzeW', 'copper', 'tin'],
  ccols: ['day', 'v', 'amt', 'grade', 'bz', 'castF', ...MELT],
  xcols: ['grade', 'bz', 'castF', 'amt', 'copper', 'tin', 'lead', 'gold'],
  day: {}, casts: [], noAg: [], trade: {}, mix: [], depart: [], rows: 0, err: null,
};
let VIL = null, W0 = null, V2 = null, foodRef = null;
const foodPer = (r) => { try { const f = foodRef ? V1.storageFoodPer(foodRef, r) : 0; return f > 0 ? f : 0; } catch (e) { return 0; } };
function _cast(v, m, amt) {
  try {
    if (!m || !m.take) return;
    const d = (W0 && W0.day) | 0;
    const t = m.take;
    rec.casts.push([d, v.name, r4(amt), r4(m.grade), r4(m.bronzeness), r4(m.castF), ...MELT.map((k) => r4(t[k] || 0))]);
    if ((t.silver || 0) > 0) {   // 은 든 주조 — 은 뺀 배합(주조 앞 곳간 사본 · 같은 값 함수 · 같은 탐색)
      const st = Object.assign({}, v.storage || {});
      for (const k in t) st[k] = (st[k] || 0) + t[k];
      st.silver = 0;
      const alt = V1._meltSearch(st, V1._oppPrice(v));
      const base = m.castF > 0 ? amt / m.castF : amt;
      rec.noAg.push(rec.casts.length - 1, alt ? [r4(alt.grade), r4(alt.bronzeness), r4(alt.castF), r4(base * (alt.castF || 0)), r4(alt.take.copper || 0), r4(alt.take.tin || 0), r4(alt.take.lead || 0), r4(alt.take.gold || 0)] : null);
    }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
}
const SEEN = new WeakSet();
function _row(r) {
  const d = r.day | 0;
  const T = rec.trade[d] || (rec.trade[d] = [0, 0, 0]);   // 줄 · 식량(보낸 + 둘째 + 바구니) · 식량(받아 온)
  T[0]++;
  const add = (res, amt, i) => { const f = foodPer(res); if (f > 0 && amt > 0) T[i] = r4(T[i] + amt * f); };
  if (!r.abandoned && r.sent) add(r.sent.res, +r.sent.amt, 1);
  if (!r.abandoned && r.sent2) { add(r.sent2.res, +r.sent2.amt, 1); rec.mix.push([d, r.from, r.to, r.sent ? r.sent.res : null, r.sent ? r4(r.sent.amt) : 0, r.sent2.res, r4(r.sent2.amt), r.distance | 0]); }
  if (!r.abandoned) for (const it of (r.basket || [])) if (it) add(it.res, +it.amt, 1);
  for (const it of (r.retBasket || [])) if (it) add(it.res, +it.amt, 2);
  if (!r.retBasket && r.bought) add(r.bought.res, +r.bought.amt, 2);
}
function _readLog(w) {
  const L = w && w.tradeLog; if (!Array.isArray(L) || !L.length) return;
  let i = L.length - 1; while (i >= 0 && !SEEN.has(L[i])) i--;
  for (let j = i + 1; j < L.length; j++) { const r = L[j]; if (r && typeof r === 'object') { SEEN.add(r); rec.rows++; try { _row(r); } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); } } }
}
let lastCid = 0;
function _departs(w, day) {
  for (const c of (w.caravans || [])) {
    if (!c || !(c.id > lastCid)) continue;
    if (c.giveRes2 && c.giveAmt2 > 0) rec.depart.push([c.departDay != null ? c.departDay : day, c.from && c.from.name, c.to && c.to.name, c.giveRes, r4(c.giveAmt), c.giveRes2, r4(c.giveAmt2), c.escort | 0]);
  }
  for (const c of (w.caravans || [])) if (c && c.id > lastCid) lastCid = c.id;
}
function snap(day) {
  if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages'));
  if (!V2 && require.cache[V2PATH]) { V2 = require.cache[V2PATH].exports; rec.knobs.mixLoad = !!V2.T1344_MIX_LOAD; }
  const P = VIL.__labProbe._t569Probe.setup();
  const vils = (P.villages || []).filter((x) => x && x.econ);
  for (const vil of vils) { const e = vil.econ; if (e._world && e._world !== W0) { W0 = e._world; break; } }
  if (W0 && W0.onCast !== _cast) W0.onCast = _cast;   // 주조 훅(읽기만 — econ 이 관찰기가 줄 때만 부른다)
  if (!foodRef && vils.length) foodRef = vils[0].econ;
  _readLog(W0);
  if (W0) _departs(W0, day);
  const D = rec.day[day] = {};
  for (const vil of vils) {
    const e = vil.econ, st = e.storage || {}, cnt = e.counts || {};
    let cap = false; try { cap = V1._bronzeCapable(e); } catch (err) { cap = false; }
    if (!(cap || (cnt.smith || 0) > 0 || (e._bronzeWeaponMade || 0) > 0)) continue;
    let sf = null; try { sf = V1._foodSecF(e); } catch (err) { sf = null; }
    D[vil.name] = [(e.npcs || []).length, cnt.warrior || 0, cnt.smith || 0, cnt.mason || 0, r4(st.weapon), e._swordFrac == null ? null : r4(e._swordFrac), e._t1344Q == null ? null : r4(e._t1344Q), sf == null ? null : r4(sf), r4(e._bronzeWeaponMade), r4(st.copper), r4(st.tin)];
  }
  if (day % 10 === 0) write();
}
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 자리 */ } }
let last = -1;
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try { if (day !== last) { last = day; snap(day); } } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return _t.apply(this, arguments);
};
process.on('exit', () => { try { _readLog(W0); } catch (e) {} write(); });
