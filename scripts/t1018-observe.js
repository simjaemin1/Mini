'use strict';
// (@regress 없음 — 러너 밖 · T1018 관찰기 · 읽기만 · 제품 손잡이 0)
// === scripts/t1018-observe.js — T1018 관찰기: 직업 배분이 읽는 칸 — 서버 판 자 · 랩 t17 곁 프리로드 ===
//
// ★[T1018 2026-10-31 · T994] 땔감 죽음 날 서버 마을 나무꾼이 적다(N 당 0.092 ↔ 랩 0.137) — 직업 배분 결정의 어느 입력이 갈리나.
//   econ 직업 고르기(`pickDeficitJob_rational`)는 모듈 안 함수라 밖에서 못 감싼다. 이 관찰기는 그 함수가 **읽는 마을 칸**을 틱 뒤에 적고,
//   틱 앞 · 뒤 NPC 직업(`currentJob`)을 견줘 그날 바뀐 몫(나무꾼으로 · 나무꾼에서 · 새로 난 나무꾼)을 센다(값 무변 · 마을 칸에 안 쓴다).
//   칸(마을 × 날 · 틱 뒤):
//     day · N · lj(나무꾼) · fJ(식량직 넷: 농부 · 어부 · 사냥꾼 · 채집꾼) · cr(장인 · 그 밖) · dr(징발 중) · drLj(징발 중 나무꾼)
//     ljIn · ljOut(그날 나무꾼으로 · 나무꾼에서 바뀐 사람) · ljBorn(그날 새로 난 나무꾼) · sw(그날 직업이 바뀐 사람 전부)
//     fe(곳간 식량 환산 ÷ N — 기근 문 `foodEquiv < N × 30` 이 읽는 칸) · pW · pF(그림자 가격 — `world.priceFn` = v2 `computeShadowPrices` · 읽기만)
//     eW · eF(실현 배분 EMA `v._allocEma` 의 wood · food — `allocRealCandidates` 가 읽는 칸) · housing · plan(`_t958Plan`) · wood(곳간 목재) · live(`_t400Live`)
//     need · did(그날 직업 자율 전환이 섰으면 econ 진단 칸 `v._dbgSwitch` — 직업 고르기가 낸 직업 · 전환 결과(`hold(…)` = 마찰 보류))
//   쓰는 법:
//     서버: NODE_OPTIONS="… -r $PWD/scripts/t1018-observe.js" node scripts/t577-server-run.js 800 1020,7,42   (판 JSON 곁 `<판>-<시드>.t1018.json`)
//     랩:   T1018_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t1018-observe.js" node scripts/t17-metrics.js 800 1020
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
const LAB = !SERVER && !!process.env.T1018_OUT && /scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1);
if (!SERVER && !LAB) return;
const OUT = SERVER ? (process.env.T1018_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1018.json' : '')) : process.env.T1018_OUT;
if (!OUT) return;
const V1 = require(path.join(__dirname, '..', 'sim', 'economy-sim'));
const FOOD = new Set(['farmer', 'fisher', 'hunter', 'forager']);
const COLS = ['day', 'N', 'lj', 'fJ', 'cr', 'dr', 'drLj', 'ljIn', 'ljOut', 'ljBorn', 'sw', 'fe', 'pW', 'pF', 'eW', 'eF', 'housing', 'plan', 'wood', 'live', 'need', 'did'];
const rec = { where: SERVER ? 'server' : path.basename(A1), cols: COLS, v: {}, errs: 0, err0: null };
const r2 = (x) => (x == null || !Number.isFinite(+x)) ? null : Math.round(+x * 100) / 100;
const r4 = (x) => (x == null || !Number.isFinite(+x)) ? null : Math.round(+x * 10000) / 10000;
const _tick = V1.tickVillage;
V1.tickVillage = function (v, day) {
  let pre = null;
  try { pre = new Map(); for (const n of (v && v.npcs) || []) pre.set(n, n.currentJob); } catch (e) { pre = null; }
  const r = _tick.apply(this, arguments);
  try {
    const N = (v.npcs || []).length;
    let lj = 0, fJ = 0, cr = 0, dr = 0, drLj = 0, ljIn = 0, ljOut = 0, ljBorn = 0, sw = 0;
    const seen = new Set();
    for (const n of v.npcs || []) {
      const j = n.currentJob; seen.add(n);
      if (j === 'lumberjack') lj++; else if (FOOD.has(j)) fJ++; else cr++;
      if (n._warDraft) { dr++; if (j === 'lumberjack') drLj++; }
      if (pre) { if (!pre.has(n)) { if (j === 'lumberjack') ljBorn++; }
        else { const o = pre.get(n); if (o !== j) { sw++; if (j === 'lumberjack') ljIn++; if (o === 'lumberjack') ljOut++; } } }
    }
    let pW = null, pF = null;
    try { const W = v._world; if (W && typeof W.priceFn === 'function') { const t = W.priceFn(v); if (t) { pW = t.wood; pF = t.food; } } } catch (e) { /* 값 없음 */ }
    let fe = null; try { fe = N > 0 ? V1.totalFoodEquivalent(v) / N : null; } catch (e) { fe = null; }
    const E = v._allocEma || {};
    (rec.v[v.name] || (rec.v[v.name] = [])).push([day | 0, N, lj, fJ, cr, dr, drLj, ljIn, ljOut, ljBorn, sw, r2(fe), r4(pW), r4(pF), r4(E.wood), r4(E.food),
      r2(v.housing), r2(v._t958Plan), r2((v.storage || {}).wood || 0), v._t400Live ? 1 : 0,
      (v._dbgSwitch && v._dbgSwitch.day === (day | 0)) ? v._dbgSwitch.need : null, (v._dbgSwitch && v._dbgSwitch.day === (day | 0)) ? v._dbgSwitch.did : null]);
  } catch (e) { rec.errs++; if (!rec.err0) rec.err0 = String(e && e.stack || e).slice(0, 400); }
  return r;
};
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ } });
