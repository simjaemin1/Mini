// === sim/inline-path.js — path-core 정본을 랩 2종에 인라인(마커 치환) ===
// 사용: node sim/inline-path.js            → ../../마을실험실.html · ../../전쟁실험실.html 갱신
//       node sim/inline-path.js <파일...>  → 지정 파일만
// ★econ 번들 inline-engine.js(마을실험실만)와 달리 이 도구는 **양 랩 모두** 갱신 — path-core는 양 랩 공통 코어.
//   path-core.js 수정·커밋 후 반드시 재실행(안 하면 랩이 구 경로탐색으로 돈다 — econ 3사본 규약과 동일).
// 마커 사이 치환, 마커 없으면 'function bfsPath(' 직전에 신설. </script> 이스케이프(econ 규약 동일).
'use strict';
const fs = require('fs'), path = require('path');
const CORE = fs.readFileSync(path.join(__dirname, 'path-core.js'), 'utf8').replace(/<\/script>/g, '<\\/script>').trimEnd();
const MS = '// ===== PATH-CORE-START (sim/path-core.js 인라인 — node durango-mini/sim/inline-path.js 재생성. 직접 수정 금지) =====';
const ME = '// ===== PATH-CORE-END =====';
const files = process.argv.length > 2 ? process.argv.slice(2)
  : [path.join(__dirname, '..', '..', '마을실험실.html'), path.join(__dirname, '..', '..', '전쟁실험실.html')];
for (const fp of files) {
  let h;
  try { h = fs.readFileSync(fp, 'utf8'); } catch (e) { console.error(fp + ': 읽기 실패 — 건너뜀 (' + e.message + ')'); continue; }
  const si = h.indexOf(MS), ei = h.indexOf(ME);
  if (si >= 0 && ei > si) {
    h = h.slice(0, si) + MS + '\n' + CORE + '\n' + h.slice(ei);
    console.log(path.basename(fp) + ': PATH-CORE 마커 치환(갱신)');
  } else {
    const at = h.indexOf('function bfsPath(');
    if (at < 0) { console.error(path.basename(fp) + ': bfsPath 앵커 없음 — 건너뜀'); continue; }
    h = h.slice(0, at) + MS + '\n' + CORE + '\n' + ME + '\n' + h.slice(at);
    console.log(path.basename(fp) + ': PATH-CORE 마커 신설+인라인');
  }
  fs.writeFileSync(fp, h);
}
