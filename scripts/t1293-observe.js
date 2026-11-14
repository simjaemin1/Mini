'use strict';
// (@regress 없음 — 러너 밖 · T1293 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1293-observe.js — 광부 포화(녹임 목표 밑 빈자리) 물음 셈 — T1277 판 꼴 곁 프리로드(`t1277-observe.js` 뒤에 싣는다) ==========
//   쓰는 법: NODE_OPTIONS="… -r $PWD/scripts/t1266-observe.js -r $PWD/scripts/t1277-observe.js -r $PWD/scripts/t1293-observe.js" node scripts/t577-server-run.js 100 1020
//     → 판 JSON 곁 `<판>-<시드>.t1293.json`(10날마다 덮어 쓴다 · 끝에 한 번 더)
//   ① 물음마다(v2 `t1266OreValue` 감쌈 — 인자 · 돌려준 값 그대로): 그 시간 단위 u(다섯째 인자 — 서버 `_t1266Keep` 의 그 수) · λ · 쉰 값 ·
//      그림자 값 pOwn = Σ 몫 × 그 칸 값(포화 앞 · `t1217PricesOf(v, 열쇠)` — 방금 그 물음이 세운 그 시간 표 · 캐시 적중) · 쓴 값 p(돌려준 값 — 끈 팔은 pOwn 과 같다) ·
//      포화면 값 pSat = Σ min(몫, 빈자리 ÷ u) × 그 칸 값(빈자리 = 값표 목표 − 유효 재고 · v2 `_targetV2` 그대로 — 끈 팔에선 "켰으면" 값) ·
//      곳간 ÷ 목표(몫 가중 · 목표 > 0 인 품목)
//      → 10날 칸 · 마을별: 물음 · 단위 · W(쓴 값) · W그림자 · W포화 · 쉰 값 합 · 쓴 값으로 닫힘 · 그림자면 닫힘 · 포화면 닫힘 · 포화로 값 0 · 포화로 깎임 · 곳간 ÷ 목표 합
//   ② 날 머리 광산 마을(T1277 ② 와 같은 마을 · 같은 순간) 원석 품목별: 곳간 · 값표 목표(`_targetV2(…).target` — 세계 몫 상한까지) · 흐름 목표(`_consEMA × 30`)
//   ⚠값을 바꾸지 않는다 — 감쌈은 인자 · 돌려준 값 그대로 · 세계 공급 캐시(`_worldStockOf`)가 오늘 이미 선 때만 `_targetV2` 를 부른다(그 순간을 앞당기지 않는다).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1293.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const OG = require(path.join(ROOT, 'server', 'ore-goods'));
const V2PATH = require.resolve(path.join(ROOT, 'sim', 'economy-sim-v2'));
let VIL = null, MINES = null, V2 = null;
const rec = { on: !!V1.T1266_ORE_BODY, cap: !!V1.T1271_ORE_CAP, sat: !!V1.T1293_ORE_SAT, split: !!V1.T1188_ORE_SPLIT, q: {}, ore: {}, err: null, wrapped: 0, noWs: 0, noU: 0 };
const r6 = (x) => +(+x || 0).toFixed(6);
const _nameOf = new Map();
let _today = 0;
function _bucket(day) { return Math.floor((day - 1) / 10) * 10 + 10; }   // 날 1~10 → 10 · 11~20 → 20 …
function _wsOk(v) { const w = v && v._world; return !!(w && w._effDemCache && w._effDemCache.day === w.day); }
function _install(m) {
  if (!m || V2 || typeof m.t1266OreValue !== 'function') return;
  V2 = m;
  const _ov = m.t1266OreValue;
  m.t1266OreValue = function (v, H, key, mix, units) {
    const r = _ov.apply(this, arguments);
    try {
      if (r && v && v.npcs && typeof m.t1217PricesOf === 'function') {
        const px = m.t1217PricesOf(v, key);   // 그 물음이 방금 세운 그 시간 표(캐시 적중 · null 이면 그 물음을 안 센다)
        if (px) {
          const M = mix && Object.keys(mix).length ? mix : { ore: 1 }, u = typeof units === 'number' && units > 0 ? units : 0;
          if (!(u > 0)) rec.noU++;
          let pOwn = 0, pSat = null, st = null;
          for (const id in M) { const f = M[id]; if (!(f > 0)) continue; pOwn += f * (px[id] || 0); }
          if (_wsOk(v) && typeof m._targetV2 === 'function' && typeof m._targetCtxV2 === 'function') {
            const ctx = m._targetCtxV2(v); pSat = 0; let s = 0, ws = 0;
            for (const id in M) { const f = M[id]; if (!(f > 0)) continue; const T = m._targetV2(v, id, ctx); if (!T) continue;
              const room = Math.max(0, T.target - T.sEff), g = room > 0 ? (u > 0 ? Math.min(f, room / u) : f) : 0;
              pSat += g * (px[id] || 0); if (T.target > 0) { s += f * (T.sEff / T.target); ws += f; } }
            st = ws > 0 ? s / ws : null;
          } else rec.noWs++;
          const B = rec.q[_bucket(_today || 1)] || (rec.q[_bucket(_today || 1)] = {}), vn = _nameOf.get(v) || '?';
          const Q = B[vn] || (B[vn] = { n: 0, u: 0, w: 0, wOwn: 0, wSat: 0, r: 0, closeNow: 0, closeOwn: 0, closeSat: 0, zero: 0, cut: 0, satN: 0, st: 0, stN: 0 });
          const lam = r.lam || 0, rest = r.rest, p = r.p || 0;
          Q.n++; Q.u = r6(Q.u + u); Q.w = r6(Q.w + u * p * lam); Q.wOwn = r6(Q.wOwn + u * pOwn * lam); Q.r = r6(Q.r + rest);
          if (!(u * p * lam > rest)) Q.closeNow++;
          if (!(u * pOwn * lam > rest)) Q.closeOwn++;
          if (p <= 0 && pOwn > 0) Q.zero++; else if (p < pOwn - 1e-12) Q.cut++;
          if (pSat != null) { Q.satN++; Q.wSat = r6(Q.wSat + u * pSat * lam); if (!(u * pSat * lam > rest)) Q.closeSat++; }
          if (st != null) { Q.st = r6(Q.st + st); Q.stN++; }
        }
      }
      rec.wrapped++;
    } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
    return r;
  };
}
{ const Module = require('module'); const _load = Module._load;
  Module._load = function (request) { const m = _load.apply(this, arguments); try { if (!V2 && /economy-sim-v2(\.js)?$/.test(String(request))) _install(m); } catch (e) {} return m; }; }
// ── ② 날 머리 광산 마을 원석(값표 목표) ─────────────────────────────────────────────────────────────────────────────────
function _isMine(e) { const L = (e && e.land) || {}; return (L.ore || 0) > 0.15 || (L.tin || 0) > 0.15; }   // T1277 ② 와 같은 마을
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
    const e = vil.econ || {}, st = e.storage || {}, ema = e._consEMA || {};
    const ok = V2 && _wsOk(e) && typeof V2._targetV2 === 'function';
    const ctx = ok ? V2._targetCtxV2(e) : null, o = {};
    for (const k of ids) { const s = st[k] || 0, f = (ema[k] || 0) * 30; let t = null; if (ok) { const T = V2._targetV2(e, k, ctx); t = T ? T.target : null; } if (s > 0 || f > 0 || (t || 0) > 0) o[k] = [r6(s), t == null ? null : r6(t), r6(f)]; }
    D[vil.name] = { o, pop: (e.npcs || []).length, miner: (e.counts && e.counts.miner) || 0, ok };
  }
  if (day % 10 === 0) write();
}
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 자리 */ } }
let last = -1;
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try { if (day !== last) { last = day; _today = day; snap(day); } } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return _t.apply(this, arguments);
};
process.on('exit', () => { write(); });
