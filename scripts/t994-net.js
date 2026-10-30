'use strict';
// (@regress 없음 — 러너 밖 · T994 곁 관찰기 · 읽기만) 나무꾼 쪽 칸 — econ `tickVillage` 틱 뒤
//   그날 나무꾼 수(`npc.currentJob === 'lumberjack'` — econ 이 읽는 칸) · 인구 · econ 주거(`housing`) · 계획 주거(`_t958Plan` — T958 켬 · 집 행위 마을만) ·
//   지은 침상(`_mapBeds`) · 집 행위 마을인가(`_t400Live`) · 곳간 목재 · 충당(`_fuelCov`)을 적는다(값 무변 · 마을 칸에 안 쓴다).
//   주거 목재 안전망(`pickDeficitJob_rational` — 인구 ≥ 주거 × 0.95 · 곳간 목재 < 인구 × 2 → 나무꾼)이 읽는 칸이 서버 ↔ 랩 어디서 갈리나를 본다.
//   서버: NODE_OPTIONS="… -r scripts/t994-net.js" node scripts/t577-server-run.js 800 7   (판 곁 `<판>-<시드>.net.json`)
//   랩:   NET_OUT=<파일> NODE_OPTIONS="-r scripts/t994-net.js" node scripts/t17-metrics.js 800 7
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
const LAB = !SERVER && !!process.env.NET_OUT && /scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1);
if (!SERVER && !LAB) return;
const OUT = SERVER ? process.env.T577_OUT.replace(/\.json$/, '') + '.net.json' : process.env.NET_OUT;
const V1 = require(path.join(__dirname, '..', 'sim', 'economy-sim'));
const COLS = ['day', 'N', 'lj', 'housing', 'plan', 'beds', 'live', 'wood', 'cov'];
const rec = { where: SERVER ? 'server' : path.basename(A1), cols: COLS, v: {} };
const r2 = (x) => (x == null || !Number.isFinite(+x)) ? null : Math.round(+x * 100) / 100;
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  const r = _t.apply(this, arguments);
  try { let lj = 0; for (const n of (v.npcs || [])) if (n.currentJob === 'lumberjack') lj++;
    (rec.v[v.name] || (rec.v[v.name] = [])).push([day | 0, (v.npcs || []).length, lj, r2(v.housing), r2(v._t958Plan), v._mapBeds !== undefined ? r2(v._mapBeds) : null, v._t400Live ? 1 : 0, r2((v.storage || {}).wood || 0), r2(v._fuelCov)]); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ }
  return r;
};
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
