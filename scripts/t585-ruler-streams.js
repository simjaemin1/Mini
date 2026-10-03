// (@regress 없음 — 러너 밖 · T585 계측기 · 제품 무변)
// === scripts/t585-ruler-streams.js — 두 자(t17·t176)에 개울을 **넣어 본** 판 ==========================================
//   두 자는 존을 안 띄우고 `villages.__labProbe.makeTerrainAdapter(T, ZONE, deps)` 로 지형을 묻는다 — deps 에 개울 술어가 없으니
//   기본 판은 개울을 모른다(= 3시드 동일 판). 실서버 시딩(초기화 판)은 존이 `isStreamLocal` 을 넘기므로 개울이 집터·논밭을 바꾼다.
//   그 차이가 econ 의 땅 셈(`extractLandParamsApprox`)에 닿는지 보려고 이 훅이 deps 에 **같은 술어**(`server/streams.js`)를 끼운다.
//   쓰는 법: node -r ./scripts/t585-ruler-streams.js scripts/t17-metrics.js 800 <seed>
//   ★[T601 ④] 이제 두 자가 **기본으로** 같은 술어를 받는다(`streams.rulerDeps` · 끔 `T601_RULER_STREAMS=0`) — 이 훅은 같은 판을 한 번 더 끼울 뿐(값 같음 · 옛 줄 호환용).
'use strict';
const path = require('path');
const S = require(path.join(__dirname, '..', 'server', 'streams.js'));
const V = require(path.join(__dirname, '..', 'server', 'villages.js'));
const P = V.__labProbe;
const orig = P.makeTerrainAdapter;
P.makeTerrainAdapter = function (terrain, ZONE, deps) {
  const zid = (ZONE && ZONE.id) || process.env.T17_ZONE || 'hanbando';
  const d = Object.assign({}, deps, { isStreamLocal: (x, y) => S.isStreamLocal(zid, x, y) });
  return orig.call(this, terrain, ZONE, d);
};
process.on('exit', () => { process.stderr.write(`[t585-ruler-streams] 개울 술어를 끼웠다 · ${JSON.stringify(S.stats(process.env.T17_ZONE || 'hanbando'))}\n`); });
