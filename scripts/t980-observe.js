'use strict';
// (@regress 없음 — 러너 밖 · T980 관찰기 · 읽기만 · 제품 손잡이 0)
// === scripts/t980-observe.js — T980 관찰기: 땔감 K(fuelK) 의 입력 칸 — 서버 판 자 · 랩 t17 곁 프리로드 ===
//
// ★[T980 2026-10-28 · T931 회부 2] 열여섯째 판에 남은 "곳간 찬 날 · 그날 굶주림 0 인 죽음"의 K 를 묶은 칸이 랩(목표)과 같은 자리 · 같은 규칙인지 본다.
//   땔감 K 줄(`sim/economy-sim.js` `woodCapFlow` — 벌목 자리 만충 흐름 ∧ `land.woodSustain` + 볏짚 + 목재 수입 EMA + 곳간 목재 / 90 · ÷ 1인 연료 수요)이
//   읽는 **마을 칸**을 그 틱 뒤 그대로 적는다(상수 · 함수 사본 0 — econ 이 내보내지 않는 `jobCapacity` · `FIREWOOD_PC` 는 안 쓴다).
//   쓰는 법(`t931-observe.js` 와 같은 자리 · 같이 건다):
//     서버: NODE_OPTIONS="… -r $PWD/scripts/t980-observe.js" node scripts/t577-server-run.js 800 1020,7,42   (판 JSON 곁 `<판>-<시드>.t980.json`)
//     랩:   T980_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t980-observe.js" node scripts/t17-metrics.js 800 1020
//   칸(마을 × 날 · 틱 뒤): day · N(틱 뒤 인구) · wood(곳간 목재) · wImp(`_woodImportEMA`) · lWood(`land.wood`) · wSus(`land.woodSustain` · 없으면 null) ·
//     cold(`_coldStress`) · fuelK(`_fuelKema` — K 에 든 땔감 K) · fuelCov(`_fuelCov` — 그날 연료 충당) · lj(벌목꾼 수 · `npc.currentJob` — ★T994 고침) · fImp(`_importEMA` — 식량 수입 EMA) · size(`land.size`)
//   ⚠읽기만 — 마을 칸에 쓰지 않는다(RNG · 캐시 무접촉).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
const LAB = !SERVER && !!process.env.T980_OUT && /scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1);
if (!SERVER && !LAB) return;
const OUT = SERVER ? (process.env.T980_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t980.json' : '')) : process.env.T980_OUT;
if (!OUT) return;
const V1 = require(path.join(__dirname, '..', 'sim', 'economy-sim'));
const COLS = ['day', 'N', 'wood', 'wImp', 'lWood', 'wSus', 'cold', 'fuelK', 'fuelCov', 'lj', 'fImp', 'size'];
const rec = { where: SERVER ? 'server' : path.basename(A1), cols: COLS, v: {}, errs: 0, err0: null };
const r2 = (x) => (x == null || !Number.isFinite(+x)) ? null : Math.round(+x * 100) / 100;
const _tick = V1.tickVillage;
V1.tickVillage = function (v, day) {
  const r = _tick.apply(this, arguments);
  try {
    let lj = 0; for (const n of (v.npcs || [])) if (n.currentJob === 'lumberjack') lj++;   // ★[T994] econ 이 읽는 칸은 `currentJob`(T980 판은 `job` 을 읽어 늘 0 이었다)
    const L = v.land || {}, S = v.storage || {};
    (rec.v[v.name] || (rec.v[v.name] = [])).push([day | 0, (v.npcs || []).length, r2(S.wood || 0), r2(v._woodImportEMA), r2(L.wood), L.woodSustain != null ? r2(L.woodSustain) : null,
      r2(v._coldStress || 0), r2(v._fuelKema), r2(v._fuelCov), lj, r2(v._importEMA), r2(L.size)]);
  } catch (e) { rec.errs++; if (!rec.err0) rec.err0 = String(e && e.stack || e).slice(0, 400); }
  return r;
};
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ } });
