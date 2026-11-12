'use strict';
// (@regress 없음 — 러너 밖 · T1277 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1277-observe.js — 광부 한 시간 값의 갈래 · 몸이 하루 치는 셀 — T1266 판 꼴 곁 프리로드(`t1266-observe.js` 뒤에 싣는다) ==========
//   쓰는 법: NODE_OPTIONS="… -r $PWD/scripts/t1256-observe.js -r $PWD/scripts/t1266-observe.js -r $PWD/scripts/t1277-observe.js" node scripts/t577-server-run.js 60 1020
//     → 판 JSON 곁 `<판>-<시드>.t1277.json`(10날마다 덮어 쓴다 · 끝에 한 번 더)
//   ① 한 시간 값 갈래(v2 `t1266OreValue` 감쌈 — 인자 · 돌려준 값 그대로): 물음마다
//      · 그림자 값 = Σ 몫 × 그 마을 값표 칸(`t1217PricesOf(v, 열쇠)` — 방금 그 물음이 세운 그 시간 표 · 캐시 적중이라 다시 매기지 않는다)
//      · 순수출가 = Σ 몫 × `netExportValue`(방금 그 물음이 채운 그 캐시 칸 — 적중) · 쓴 값 p(= Σ 몫 × max(둘)) · λ · 가장 좋은 물건 · 쉰 값
//      · 단위(그 물음이 칠 원석 단위) = `t1266Stat().u` 의 다음 물음 앞 차(그 물음만 u 를 더한다 · 판 끝에 마지막 물음을 닫는다)
//      → 10날 칸 · 마을별: 물음 · 단위 · W(쓴 값 = Σ 단위 × p × λ) · W그림자 · W수출 · 쉰 값 합 · 수출이 이긴 물음 · 그림자 값이면 닫힐 물음 · λ · best 표
//      · ★민감도(회부 자료 — 값을 안 바꾼다): 물음마다 log10(W그림자 ÷ 쉰 값) 0.1 칸 막대 · 바닥 없는 그림자 값(v2 `_targetV2` 목표 ÷ 유효 재고 그대로 —
//        `PRICE_ADJ_MIN` 바닥만 안 건다 · 웃돈 상한 · 원석 상한 `_oreCapV2` 는 건다)이면 닫힐 물음 · 그 물음 원석 재고 ÷ 목표(몫 가중)
//   ② 날 머리(econ `tickVillage` 그날 첫 부름) 광산 마을 원석 품목별: 곳간 · 흐름 목표(`_consEMA × 30` — v2 `_targetV2` 의 flowT) · 값표 칸(`_priceCache`) · 녹임 누계
//   ③ 몸 셀(`T1256_BODY_MS` 가상 시계 표본 — t1256 · t1266 과 같은 박자): 광산 마을 광부 몸 가운데 '채광'(t1256 `stateOf`)인 몸의 자리 셀(`_t724Site`) —
//      날 · 마을별 다른 셀 수 · 다른 몸 수 · 표본 수 · 셀 하나에 선 몸 수(그날 · 셀마다 다른 몸)
//   ⚠값을 바꾸지 않는다 — 감쌈은 인자 · 돌려준 값 그대로 · 다시 부르는 두 함수는 그 물음이 방금 채운 캐시만 읽는다(세계 무변 · 계측 칸 `_t1217PxStat.hit` 만 오른다).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1277.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const OG = require(path.join(ROOT, 'server', 'ore-goods'));
const O56 = require(path.join(__dirname, 't1256-observe.js'));
const stateOf = O56 && O56.stateOf;
const V2PATH = require.resolve(path.join(ROOT, 'sim', 'economy-sim-v2'));
let VIL = null, MINES = null, V2 = null;
const rec = { on: !!V1.T1266_ORE_BODY, cap: !!V1.T1271_ORE_CAP, split: !!V1.T1188_ORE_SPLIT, q: {}, ore: {}, cell: {}, err: null, wrapped: 0 };
const r6 = (x) => +(+x || 0).toFixed(6);
const _nameOf = new Map();
let _today = 0;
// ── ① 한 시간 값 갈래 ───────────────────────────────────────────────────────────────────────────────────────────
let pend = null, prevU = null;
function _bucket(day) { return Math.floor((day - 1) / 10) * 10 + 10; }   // 날 1~10 → 10 · 11~20 → 20 …
function _close(curU) {
  if (!pend) return;
  const units = Math.max(0, (curU || 0) - (prevU || 0));
  const B = rec.q[pend.b] || (rec.q[pend.b] = {}), Q = B[pend.v] || (B[pend.v] = { n: 0, u: 0, w: 0, wOwn: 0, wNev: 0, r: 0, nevWin: 0, closeOwn: 0, closeNow: 0, closeFree: 0, lam: 0, pOwn: 0, pNev: 0, p: 0, pFree: 0, st: 0, stN: 0, best: {}, hOwn: {}, bestT0: 0, bestN: 0, pBest: 0 });
  Q.n++; Q.u = r6(Q.u + units);
  Q.w = r6(Q.w + units * pend.p * pend.lam); Q.wOwn = r6(Q.wOwn + units * pend.pOwn * pend.lam); Q.wNev = r6(Q.wNev + units * pend.pNev * pend.lam);
  Q.r = r6(Q.r + pend.rest); Q.lam = r6(Q.lam + pend.lam); Q.pOwn = r6(Q.pOwn + pend.pOwn); Q.pNev = r6(Q.pNev + pend.pNev); Q.p = r6(Q.p + pend.p);
  if (pend.pNev > pend.pOwn + 1e-12) Q.nevWin++;
  if (!(units * pend.pOwn * pend.lam > pend.rest)) Q.closeOwn++;
  if (pend.pFree != null) { Q.pFree = r6(Q.pFree + pend.pFree); if (!(units * pend.pFree * pend.lam > pend.rest)) Q.closeFree++; }
  if (pend.st != null) { Q.st = r6(Q.st + pend.st); Q.stN++; }
  if (pend.bT != null) { Q.bestN++; if (pend.bT <= 0) Q.bestT0++; Q.pBest = r6(Q.pBest + (pend.pB || 0)); }
  { const x = units * pend.pOwn * pend.lam / pend.rest, h = x > 0 ? (Math.round(Math.log10(x) * 10) / 10).toFixed(1) : '-inf'; Q.hOwn[h] = (Q.hOwn[h] || 0) + 1; }
  if (!(units * pend.p * pend.lam > pend.rest)) Q.closeNow++;
  if (pend.best) Q.best[pend.best] = (Q.best[pend.best] || 0) + 1;
  pend = null;
}
function _uNow() { try { const s = VIL && VIL.t1266Stat ? VIL.t1266Stat() : null; return s ? s.u : null; } catch (e) { return null; } }
function _install(m) {
  if (!m || V2 || typeof m.t1266OreValue !== 'function') return;
  V2 = m;
  const _ov = m.t1266OreValue;
  //   ⚠순수출가는 제품 함수가 그 물음에서 부를 때만 다시 읽는다(캐시 적중) — 안 부르는 함수(T1277 고침)에서 관찰기가 부르면 세계 공유 캐시(`_nevCache`)를
  //     제품보다 먼저 채우고 이웃 값표를 매긴다(`migrateOre` 쓰기) — 뒤 값이 갈린다. 그 판은 순수출가 칸을 0 으로 둔다(`rec.nev` = 거짓).
  const NEV = /netExportValue/.test(String(_ov)); rec.nev = NEV;
  m.t1266OreValue = function (v, H, key, mix) {
    const r = _ov.apply(this, arguments);
    try {
      if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages'));
      const u = _uNow(); _close(u); prevU = u;
      if (r && v && v.npcs) {
        const px = m.t1217PricesOf(v, key);   // 그 물음이 방금 세운 그 시간 표(캐시 적중) · null 이면 그림자 칸을 안 센다
        const M = mix && Object.keys(mix).length ? mix : { ore: 1 };
        let pOwn = 0, pNev = 0;
        for (const id in M) { const f = M[id]; if (!(f > 0)) continue; const nev = (NEV && v._world) ? m.netExportValue(v._world, v, id) : 0; pOwn += f * ((px && px[id]) || 0); pNev += f * (nev || 0); }
        //   바닥 없는 그림자 값 · 재고 ÷ 목표(몫 가중) — v2 정본 칸 함수를 그대로 부른다(목표 · 유효 재고 · 웃돈 상한 · 원석 상한 · 바닥만 뺀다 · 계측)
        let pFree = null, stR = null, pend_bT = null, pend_pB = null;
        //   ⚠세계 공급 캐시(`_worldStockOf` — 그날 첫 부름에 선다)가 오늘 이미 선 때만 — 관찰기가 그 순간을 앞당기면 뒤 값이 갈린다(v2 `shadowPricesOf` 머리말)
        const _w = v._world, _wsOk = !!(_w && _w._effDemCache && _w._effDemCache.day === _w.day);
        if (_wsOk && typeof m._targetV2 === 'function' && typeof m._targetCtxV2 === 'function') {
          const ctx = m._targetCtxV2(v); pFree = 0; stR = 0; let wsum = 0;
          for (const id in M) { const f = M[id]; if (!(f > 0)) continue; const T = m._targetV2(v, id, ctx); if (!T) continue;
            let q = T.base * Math.min(T.maxAdj, Math.pow(T.target / T.sEff, T.e));
            const cap = m._oreCapV2 ? m._oreCapV2(v, (k) => m._priceOfV2(v, k, ctx), id) : null; if (cap != null) q = Math.min(q, cap);
            pFree += f * q; if (T.target > 0) { stR += f * (T.sEff / T.target); wsum += f; } }
          stR = wsum > 0 ? stR / wsum : null;
          if (r.best) { const TB = m._targetV2(v, r.best, ctx); if (TB) { pend_bT = TB.target; pend_pB = (px && px[r.best]) || 0; } }   // λ 를 정한 물건의 그 마을 목표(0 = 값 바닥) · 값
        }
        pend = { b: _bucket(_today || 1), v: _nameOf.get(v) || '?', p: r.p || 0, pOwn: px ? pOwn : 0, pNev, lam: r.lam || 0, best: r.best || null, rest: r.rest, pFree, st: stR, bT: pend_bT, pB: pend_pB };
      }
      rec.wrapped++;
    } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
    return r;
  };
}
{ const Module = require('module'); const _load = Module._load;
  Module._load = function (request) { const m = _load.apply(this, arguments); try { if (!V2 && /economy-sim-v2(\.js)?$/.test(String(request))) _install(m); } catch (e) {} return m; }; }
// ── ② 날 머리 광산 마을 원석 ────────────────────────────────────────────────────────────────────────────────────
function _isMine(e) { const L = (e && e.land) || {}; return (L.ore || 0) > 0.15 || (L.tin || 0) > 0.15; }
function snap(day) {
  if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages'));
  if (!V2 && require.cache[V2PATH]) _install(require.cache[V2PATH].exports);
  const P = VIL.__labProbe._t569Probe.setup();
  if (!MINES) { MINES = new Set(); for (const vil of (P.villages || [])) if (_isMine(vil.econ)) MINES.add(vil.name); rec.mines = [...MINES]; }
  for (const vil of (P.villages || [])) if (vil.econ) _nameOf.set(vil.econ, vil.name);
  const D = rec.ore[day] = {};
  const ids = rec.split ? OG.ids : ['ore'];
  for (const vil of (P.villages || [])) {
    if (!MINES.has(vil.name)) continue;
    const e = vil.econ || {}, st = e.storage || {}, ema = e._consEMA || {}, c = e._priceCache || {};
    const o = {};
    for (const k of ids) { const s = st[k] || 0, t = (ema[k] || 0) * 30; if (s > 0 || t > 0) o[k] = [r6(s), r6(t), r6(c[k] || 0)]; }
    D[vil.name] = { o, smelt: r6(e._smeltedTotal || 0), pop: (e.npcs || []).length, miner: (e.counts && e.counts.miner) || 0 };
  }
  if (day % 10 === 0) write();
}
function write() {
  try {
    const cell = {};
    for (const d in rec.cell) { const D = rec.cell[d], o = {}; for (const vn in D.v) { const X = D.v[vn]; const per = {}; for (const [ck, S] of X.byCell) per[ck] = S.size; o[vn] = { cells: X.byCell.size, pids: X.pids.size, samp: X.samp, perCell: per }; } cell[d] = { n: D.n, v: o }; }
    fs.writeFileSync(OUT, JSON.stringify(Object.assign({}, rec, { cell })));
  } catch (e) { /* 자리 */ }
}
let last = -1;
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try { if (day !== last) { last = day; _today = day; snap(day); } } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return _t.apply(this, arguments);
};
// ── ③ 몸 셀 표본 ────────────────────────────────────────────────────────────────────────────────────────────────
const BODY_MS = process.env.T1256_BODY_MS == null ? 10000 : +process.env.T1256_BODY_MS;
if (BODY_MS > 0 && typeof stateOf === 'function') {
  setInterval(() => {
    try {
      if (!VIL || !MINES) return;
      const P = VIL.__labProbe._t569Probe.setup(), B = VIL.__p3Bind({});
      const players = (B.state.deps && B.state.deps.players) || new Map();
      const day = (B.state && B.state.world && B.state.world.day) | 0;
      const D = rec.cell[day] || (rec.cell[day] = { n: 0, v: {} }); D.n++;
      for (const vil of (P.villages || [])) {
        if (!MINES.has(vil.name)) continue;
        for (const pid of (vil.npcPids || [])) {
          const p = players.get(pid); if (!p || p.simJob !== 'miner') continue;
          const s = p._t724Site; if (!s || s.cx == null || stateOf(p) !== 'mine') continue;
          const X = D.v[vil.name] || (D.v[vil.name] = { byCell: new Map(), pids: new Set(), samp: 0 });
          const ck = s.cx + '_' + s.cy; let S = X.byCell.get(ck); if (!S) X.byCell.set(ck, S = new Set());
          S.add(pid); X.pids.add(pid); X.samp++;
        }
      }
    } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  }, BODY_MS);
}
process.on('exit', () => { try { _close(_uNow()); } catch (e) {} write(); });
