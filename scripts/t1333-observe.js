'use strict';
// (@regress 없음 — 러너 밖 · T1333 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1333-observe.js — 청동 길: 구리 · 주석이 어디서 어디로 가나 · 값 · 목표 · 짐 — T1313 판 꼴 곁 프리로드(`t1313-observe.js` 뒤에 싣는다) ==========
//   쓰는 법: NODE_OPTIONS="… -r $PWD/scripts/t1313-observe.js -r $PWD/scripts/t1333-observe.js" node scripts/t577-server-run.js 100 1020
//     → 판 JSON 곁 `<판>-<시드>.t1333.json`(10날마다 덮어 쓴다 · 끝에 한 번 더)
//   ① 날 머리(econ `tickVillage` 그날 첫 부름) 온 마을(51) — 칸 `rec.vcols`:
//      대장장이 · 석공 · 전사 · 사람 수 · 무기 곳간 · 무기 질 EMA(`_weapQ`) · 청동 무기 누계 · 녹임 누계 ·
//      금속(구리 · 주석 · 납 · 은)마다 [곳간 · 흐름 목표(`_consEMA × 30`) · 파생 수요(`derivedInputTarget` — 정본 함수 · 순수) · 값표 목표 · 유효 재고(`_targetV2` — 세계 공급 캐시가 오늘 선 때만) ·
//      교역 값(`_priceCache` — 그 마을이 교역 차례에 쓴 값표 · 그날 · 어제 것만)]
//   ② econ 교역 장부(`world.tradeLog`)의 새 줄(꼬리에서 읽기만 · t1313 과 같은 꼴): 품목 셈(보낸 짐 · 귀로 짐 품목별 줄 수) · 금속 · 무기 줄(날 · 보낸 → 받은 · 품목 · 양 · 떠난 값 · 닿은 값 · 거리 · 귀로?)
//   ③ 판 머리 한 번: 마을 사이 거리(`villageDist` — 구리 · 주석을 든 적 있는 마을 → 대장장이 마을 짝은 판 끝에 다시 적는다) · 교역 수(TAU · 운반비 · 습격 기본)
//   ⚠값을 바꾸지 않는다 — 장부는 읽기만 · `_targetV2` 는 세계 공급 캐시가 오늘 이미 선 때만 부른다 · `derivedInputTarget` 은 곳간 사본으로만 탐색한다(정본 주석).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1333.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const V2PATH = require.resolve(path.join(ROOT, 'sim', 'economy-sim-v2'));
const r4 = (x) => +(+x || 0).toFixed(4);
const MET = ['copper', 'tin', 'lead', 'silver'];   // 합금 재료 표 중 금은 뺀다(배합이 남지 않는다 — 하네스 ③)
const WATCH = new Set(['copper', 'tin', 'lead', 'silver', 'weapon', 'bronze_tool']);
const rec = { knobs: { alloy: !!V1.T1333_ALLOY_ORDER, exportCast: !!V1.T1333_EXPORT_CAST, ws: !!V1.T1333_WS_INPUT, copperDeriv: !!V1.COPPER_DERIV_ON },
  vcols: ['smith', 'mason', 'warrior', 'pop', 'weapon', 'weapQ', 'bronzeW', 'smelt'], mcols: ['stock', 'flowT', 'derivT', 'target', 'sEff', 'price'],
  day: {}, met: {}, rows: 0, resN: {}, legs: [], dist: {}, consts: null, err: null };
let VIL = null, V2 = null, W0 = null;
function _wsOk(v) { const w = v && v._world; return !!(w && w._effDemCache && w._effDemCache.day === w.day); }
function _note(row) {
  try {
    if (!row || typeof row !== 'object') return;
    rec.rows++;
    const d = row.day | 0;
    const one = (res, amt, back, pf, pt) => {
      if (!res || !(amt > 0)) return;
      const k = (back ? '↩' : '') + res; rec.resN[k] = (rec.resN[k] || 0) + 1;
      if (WATCH.has(res)) rec.legs.push([d, back ? row.to : row.from, back ? row.from : row.to, res, r4(amt), pf == null ? null : r4(pf), pt == null ? null : r4(pt), row.distance | 0, back ? 1 : 0]);
    };
    if (!row.abandoned && row.sent) one(row.sent.res, +row.sent.amt, false, row.sent.pAtFrom, row.sent.pAtTo);
    if (!row.abandoned) for (const it of (row.basket || [])) if (it) one(it.res, +it.amt, false, null, null);
    for (const it of (row.retBasket || [])) if (it) one(it.res, +it.amt, true, null, null);
    if (!row.retBasket && row.bought) one(row.bought.res, +row.bought.amt, true, null, null);
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
}
const SEEN = new WeakSet();
function _readLog(w) {
  const L = w && w.tradeLog; if (!Array.isArray(L) || !L.length) return;
  let i = L.length - 1; while (i >= 0 && !SEEN.has(L[i])) i--;
  for (let j = i + 1; j < L.length; j++) { const r = L[j]; if (r && typeof r === 'object') { SEEN.add(r); _note(r); } }
}
function snap(day) {
  if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages'));
  if (!V2 && require.cache[V2PATH]) V2 = require.cache[V2PATH].exports;
  const P = VIL.__labProbe._t569Probe.setup();
  const vils = (P.villages || []).filter((x) => x && x.econ);
  for (const vil of vils) { const e = vil.econ; if (e._world && e._world !== W0) { W0 = e._world; break; } }
  _readLog(W0);
  if (!rec.consts && V2) rec.consts = { TAU: V2.TAU != null ? V2.TAU : null, TC1000: V2.TRANSPORT_COST_PER_1000 != null ? V2.TRANSPORT_COST_PER_1000 : null, infoRange: W0 ? (W0.infoRange || 400) : null };
  const D = rec.day[day] = {}, M = rec.met[day] = {};
  for (const vil of vils) {
    const e = vil.econ, st = e.storage || {}, cnt = e.counts || {}, ema = e._consEMA || {};
    D[vil.name] = [cnt.smith || 0, cnt.mason || 0, cnt.warrior || 0, (e.npcs || []).length, r4(st.weapon), e._weapQ == null ? null : r4(e._weapQ), r4(e._bronzeWeaponMade), r4(e._smeltedTotal)];
    const ok = V2 && _wsOk(e) && typeof V2._targetV2 === 'function';
    const ctx = ok ? V2._targetCtxV2(e) : null;
    const pc = (e._priceCache && (e._priceCacheDay === day || e._priceCacheDay === day - 1)) ? e._priceCache : null;
    const o = {};
    for (const m of MET) {
      const s = st[m] || 0, f = (ema[m] || 0) * 30;
      let dT = 0; try { dT = V1.derivedInputTarget ? V1.derivedInputTarget(e, m) : 0; } catch (err) { dT = null; }
      let t = null, se = null; if (ok) { const T = V2._targetV2(e, m, ctx); if (T) { t = T.target; se = T.sEff; } }
      const p = pc ? pc[m] : null;
      if (s > 0 || f > 0 || (dT || 0) > 0 || (t || 0) > 0) o[m] = [r4(s), r4(f), dT == null ? null : r4(dT), t == null ? null : r4(t), se == null ? null : r4(se), p == null ? null : r4(p)];
    }
    if (Object.keys(o).length) M[vil.name] = o;
  }
  if (day % 10 === 0) write();
}
function dists() {   // 판 끝 — 구리 · 주석을 든 적 있는 마을 → 대장장이가 있던 마을(villageDist · 읽기만)
  try {
    if (!VIL) return; const P = VIL.__labProbe._t569Probe.setup();
    const by = new Map((P.villages || []).filter((x) => x && x.econ).map((x) => [x.name, x.econ]));
    const holders = new Set(), smiths = new Set();
    for (const M of Object.values(rec.met)) for (const [n, o] of Object.entries(M)) if ((o.copper && o.copper[0] > 0) || (o.tin && o.tin[0] > 0)) holders.add(n);
    for (const D of Object.values(rec.day)) for (const [n, r] of Object.entries(D)) if (r[0] > 0) smiths.add(n);
    for (const a of holders) for (const b of smiths) { if (a === b) continue; const va = by.get(a), vb = by.get(b); if (va && vb) rec.dist[a + '→' + b] = Math.round(V1.villageDist(va, vb)); }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
}
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 자리 */ } }
let last = -1;
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try { if (day !== last) { last = day; snap(day); } } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return _t.apply(this, arguments);
};
process.on('exit', () => { try { _readLog(W0); dists(); } catch (e) {} write(); });
