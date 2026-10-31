'use strict';
// (@regress 없음 — 러너 밖 · T994 관찰기 · 읽기만 · 제품 손잡이 0)
// === scripts/t994-observe.js — T994 관찰기: 연료 블록이 그날 땐 몫(볏짚 밑변 · 잔가지 · 껍질 · 목재) · 들어온 몫 — 서버 판 자 · 랩 t17 곁 프리로드 ===
//
// ★[T994 2026-10-30 · T980 회부 3] 땔감이 K 를 묶은 죽음 날 실제 연료 충당(`_fuelCov`)이 서버 0.50 · 랩 0.92 — 어느 칸이 서버에서 비나.
//   econ 연료 블록(`sim/economy-sim.js` `tickVillage` — 볏짚 `v._grainToday` → 잔가지 `twig` · 껍질 `bark` → 목재 `wood` → `v._fuelCov`)은
//   지역 변수로 셈해 밖에 안 남긴다. 이 관찰기는 econ 이 **이미 쓰는 칸**의 읽기 · 쓰기를 그 틱 동안만 엿듣는다(값 무변):
//     · `v._grainToday` — 연료 블록이 0 으로 비우는 순간 직전 값 = 그날 볏짚 밑변(식량등가 · 곡물 실생산)
//     · `v.storage.{twig,bark,wood}` — 틱 안 모든 쓰기를 앞 · 뒤 값으로 적는다 → 볏짚을 비운 뒤 ~ `_fuelCov` 를 적기 전에 준 몫 = **땐 몫** ·
//       그 앞에 는 몫 = **틱 안에서 들어온 몫**(생산) · 앞 틱 끝 ↔ 이 틱 머리 차 = **틱 밖에서 들어온 몫**(교역 · 서버 생활층 · 크루)
//     · `v._fuelCov` — 그날 충당
//   엿듣기는 그 칸이 이미 마을에 있을 때만 건다(없던 칸을 만들지 않는다 · 키 차례 그대로). 틱 끝에 데이터 칸으로 되돌린다(같은 자리 · 같은 값).
//   쓰는 법:
//     서버: NODE_OPTIONS="… -r $PWD/scripts/t994-observe.js" node scripts/t577-server-run.js 800 1020,7,42   (판 JSON 곁 `<판>-<시드>.t994.json`)
//     랩:   T994_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t994-observe.js" node scripts/t17-metrics.js 800 1020
//   칸(마을 × 날): day · N · grain(그날 볏짚 밑변) · cov · 칸마다 [틱 머리 · 틱 밖 들어옴 · 틱 안 들어옴 · 땐 몫 · 연료 블록 때 재고 · 틱 끝] × twig · bark · wood
//   상수 사본 0 — 볏짚 환산 · 하급 연료 등가 · 1인 연료 수요는 econ 줄이 쥔다(이 관찰기는 양만 적는다).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
const LAB = !SERVER && !!process.env.T994_OUT && /scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1);
if (!SERVER && !LAB) return;
const OUT = SERVER ? (process.env.T994_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t994.json' : '')) : process.env.T994_OUT;
if (!OUT) return;
const V1 = require(path.join(__dirname, '..', 'sim', 'economy-sim'));
const KS = ['twig', 'bark', 'wood'];
const COLS = ['day', 'N', 'grain', 'cov', ...KS.flatMap((k) => [`${k}0`, `${k}Out`, `${k}In`, `${k}Burn`, `${k}At`, `${k}After`, `${k}1`])];
const rec = { where: SERVER ? 'server' : path.basename(A1), cols: COLS, v: {}, errs: 0, err0: null, hooked: 0, skipped: 0 };
const r3 = (x) => (x == null || !Number.isFinite(+x)) ? null : Math.round(+x * 1000) / 1000;
const last = new Map();   // 마을 → 앞 틱 끝 재고
function hook(obj, key, onSet, onGet) {
  const d = Object.getOwnPropertyDescriptor(obj, key);
  if (!d || !('value' in d) || !d.configurable || !d.writable) return null;
  let val = d.value;
  Object.defineProperty(obj, key, { configurable: true, enumerable: d.enumerable,
    get() { if (onGet) onGet(val); return val; }, set(x) { const old = val; val = x; onSet(old, x); } });
  return () => { Object.defineProperty(obj, key, { configurable: true, enumerable: d.enumerable, writable: true, value: val }); };
}
const _tick = V1.tickVillage;
V1.tickVillage = function (v, day) {
  let undo = [], st = null;
  try {
    const S = v && v.storage;
    if (S) {
      st = { phase: 0, grain: null, cov: null, k: {} };
      for (const k of KS) {
        const c = st.k[k] = { s0: S[k] || 0, inn: 0, burn: 0, after: 0, at: null, has: Object.prototype.hasOwnProperty.call(S, k) };
        if (!c.has) continue;
        //   차례: 0 = 연료 블록 앞(늘면 틱 안 들어옴) · 1 = 볏짚을 비운 뒤 ~ 충당을 적기 전(줄면 땐 몫) · 2 = 그 뒤(줄면 연료 밖 씀 — 주거 · 마모 …)
        const u = hook(S, k, (o, x) => { const dx = (+x || 0) - (+o || 0);
          if (st.phase === 1) { if (dx < 0) c.burn -= dx; else c.inn += dx; }
          else if (st.phase === 0) { if (dx > 0) c.inn += dx; }
          else if (dx < 0) c.after -= dx; });
        if (u) undo.push(u); else c.has = false;
      }
      const ug = hook(v, '_grainToday', (o, x) => { if (st.phase === 0 && x === 0) { st.grain = +o || 0; st.phase = 1; } });
      if (ug) undo.push(ug);
      const uc = hook(v, '_fuelCov', (o, x) => { if (st.phase === 1) { st.cov = x; st.phase = 2; for (const k of KS) { const c = st.k[k]; c.at = (S[k] || 0) + c.burn; } } });   // 연료 블록 때 재고 = 충당을 적는 순간 재고 + 땐 몫
      if (uc) undo.push(uc);
      if (!ug || !uc) rec.skipped++; else rec.hooked++;
    }
  } catch (e) { rec.errs++; if (!rec.err0) rec.err0 = String(e && e.stack || e).slice(0, 400); }
  let r;
  try { r = _tick.apply(this, arguments); }
  finally {
    for (const u of undo.reverse()) { try { u(); } catch (e) { rec.errs++; } }
    try {
      if (st) {
        const S = v.storage || {}, L = last.get(v.name) || null, row = [day | 0, (v.npcs || []).length, r3(st.grain), r3(st.cov != null ? st.cov : v._fuelCov)];
        const end = {};
        for (const k of KS) { const c = st.k[k]; const s1 = S[k] || 0; end[k] = s1;
          const out = L ? c.s0 - L[k] : null;   // 틱 밖 들어옴(+) · 나감(−)
          row.push(r3(c.s0), r3(out), r3(c.inn), r3(c.burn), r3(c.at), r3(c.after), r3(s1)); }
        last.set(v.name, end);
        (rec.v[v.name] || (rec.v[v.name] = [])).push(row);
      }
    } catch (e) { rec.errs++; if (!rec.err0) rec.err0 = String(e && e.stack || e).slice(0, 400); }
  }
  return r;
};
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ } });
