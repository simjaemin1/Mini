// (@regress 없음 — 랩 자 곁 한 벌 · `t17-metrics.js` · `t176-ab.js` 가 같은 함수를 부른다 · 사본 0)
// === scripts/lib-lab-dist.js — 랩 자도 서버와 같은 교역 거리(지형 최단거리 행렬)를 쓴다 (T1047) ===
//
// ★왜 [T1012 카드 감 4 → T1047 · PM 11-01 "추상 금지 — 랩도 같은 지형 거리"]
//   서버 존은 부팅 때 `villages.js computeAndInjectDistMatrix` 로 전쌍 지형 최단거리(코스 격자 · 8방 Dijkstra · 다리 구제)를
//   econ 에 넣는다(`setDistMatrix`) ⇒ econ `villageDist` 가 그 행렬을 먼저 읽는다. 랩 자 둘은 행렬을 안 세워 **직선**(유클리드 폴백)으로 쟀다.
//   T1012 갈래 판 euclid(서버를 직선으로)가 첫해 캐러밴 차의 123% 를 메웠다(지형 = 직선 × 1.224 · 닿지 못하는 쌍 0).
//
// ★손잡이 `T1047_LAB_DIST`(★랩 기본 켬 후보 · 되돌림 `=0` = 직선 · 그때 이 파일은 아무것도 안 한다 = 종전 바이트)
//   켬이면 랩 자가 econ 세계를 세운 직후(`world.day = 0` · 생활층 문을 열기 전) 이 함수를 한 번 부른다:
//     ① 지형 어댑터 = 랩 자가 시딩에 쓰는 그 deps(해안 띠 · 개울 · 물 · 바위) + **다리 칸**(존 설정 `ZONE.bridges` — zone.js `BRIDGE_CELLS` 와 같은 표 ·
//        `isBridgeLocal` = zone.js `isBridgeTileLocal` 과 같은 식). 다리는 **이 행렬에만** 건다 — 랩 시딩 어댑터는 무접촉(시딩 바이트 무변).
//     ② 행렬 = 서버 정본 함수 그대로(`villages.__labProbe._distProbe.compute` — `computeAndInjectDistMatrix` · 사본 0 · 새 수 0).
//        정본 문은 모듈 칸(`state.world` · `state.econ` · `state._distCtx`)에 기대므로 **빈 세계**(좌표만)와 받아 적는 econ 자리로 돌리고,
//        다 센 뒤 그 칸들을 비운다(생활층 문 — `_cropProbe` · `_clearProbe` — 은 이 뒤에 제 세계를 다시 꽂는다 · 걷기 술어가 이 어댑터를 물려받지 않게).
//     ③ econ 주입 = `econ.setDistMatrix(world, 행렬)` — 서버 존과 같은 한 줄.
//   `LAB_SEEDCACHE` 를 주면 행렬을 그 곁(`<캐시>.t1047dist.json`)에 싣고 다음 판은 읽는다(지문 = 마을 좌표 · 격자 간격 · 다리 칸 · 개울 표식 — 다르면 다시 센다).
'use strict';
const fs = require('fs');
const crypto = require('crypto');

const T1047_LAB_DIST = process.env.T1047_LAB_DIST !== '0';   // ★[T1047] 랩 기본 켬 후보 · 되돌림 `=0`(직선 = 종전 바이트)

function _bridgeSet(ZONE) { const S = new Set(), bl = ZONE.bridges || []; for (let i = 0; i + 1 < bl.length; i += 2) S.add(bl[i] + '_' + bl[i + 1]); return S; }

// o = { P(villages.__labProbe), T(terrain), ZONE, deps(랩 자 시딩 deps), sig(개울 표식), world, econ, cache(LAB_SEEDCACHE), log }
function inject(o) {
  if (!T1047_LAB_DIST) return null;
  const { P, T, ZONE, world, econ } = o;
  const log = o.log || console.log;
  const SZ = P.SZ, BR = _bridgeSet(ZONE);
  const isBridgeLocal = (x, y) => BR.has(Math.floor(x / SZ) + '_' + Math.floor(y / SZ));   // zone.js `isBridgeTileLocal` 과 같은 식(셀 열쇠)
  const coords = world.villages.map((v) => [v.coord.x, v.coord.y]);
  const sig = crypto.createHash('sha1').update(JSON.stringify({ step: P._distProbe.DIST_STEP, coords, br: [...BR].sort(), t601: o.sig || '' })).digest('hex').slice(0, 16);
  const file = o.cache ? o.cache + '.t1047dist.json' : '';
  const t0 = Date.now();
  let mat = null, cached = false;
  if (file && fs.existsSync(file)) {
    try { const c = JSON.parse(fs.readFileSync(file, 'utf8')); if (c && c.sig === sig) { mat = c.mat.map((r) => r.map((d) => (d == null ? Infinity : d))); cached = true; } } catch (e) { mat = null; }
  }
  if (!mat) {
    const ta = P.makeTerrainAdapter(T, ZONE, Object.assign({}, o.deps, { isBridgeLocal }));
    const scratch = { villages: world.villages.map((v) => ({ name: v.name, coord: v.coord })) };
    P._distProbe.setup(ta, ZONE, scratch, { setDistMatrix: (w, m) => { mat = m; } });
    try { P._distProbe.compute('T1047 랩'); }
    finally { P._distProbe.setup(undefined, undefined, undefined, undefined); }   // ② 모듈 칸을 비운다(이 뒤 생활층 문이 제 세계를 꽂는다)
    if (mat && file) { try { fs.writeFileSync(file, JSON.stringify({ sig, mat: mat.map((r) => r.map((d) => (isFinite(d) ? d : null))) })); } catch (e) {} }
  }
  if (!mat || mat.length !== world.villages.length) { log(`  ⚠[T1047] 거리행렬을 못 세웠다 — 직선 그대로`); return null; }
  econ.setDistMatrix(world, mat);
  let pairs = 0, unreach = 0, sumR = 0;
  for (let i = 0; i < mat.length; i++) for (let j = i + 1; j < mat.length; j++) {
    const d = mat[i][j]; if (!isFinite(d)) { unreach++; continue; }
    pairs++; sumR += d / Math.max(1, Math.hypot(coords[i][0] - coords[j][0], coords[i][1] - coords[j][1]));
  }
  const st = { on: true, cached, sig, ms: Date.now() - t0, villages: mat.length, pairs, unreach, meanRatio: pairs ? +(sumR / pairs).toFixed(4) : null, bridges: BR.size };
  log(`  [T1047] 랩 교역 거리 = 서버 지형 행렬 — ${st.villages}마을 · 쌍 ${pairs} · 닿지 못함 ${unreach} · 직선 대비 평균 ×${st.meanRatio} · 다리 칸 ${BR.size} · ${cached ? '캐시' : '셈'} ${st.ms}ms`);
  return st;
}

module.exports = { T1047_LAB_DIST, inject };
