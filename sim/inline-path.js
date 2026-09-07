// === sim/inline-path.js — path-core 정본을 랩 2종에 인라인(마커 치환) ===
// 사용: node sim/inline-path.js            → ../../마을실험실.html · ../../전쟁실험실.html 갱신
//       node sim/inline-path.js <파일...>  → 지정 파일만
//       node sim/inline-path.js --check    → **갱신하지 않고** 신선도만 보고(exit 1 = 낡음)
// ★econ 번들 inline-engine.js(마을실험실만)와 달리 이 도구는 **양 랩 모두** 갱신 — path-core는 양 랩 공통 코어.
//   path-core.js 수정·커밋 후 반드시 재실행(안 하면 랩이 구 경로탐색으로 돈다 — econ 3사본 규약과 동일).
// 마커 사이 치환, 마커 없으면 'function bfsPath(' 직전에 신설. </script> 이스케이프(econ 규약 동일).
//
// ★★[T89 2026-09-04 재민 확정] `--check` 를 더했다 — **잴 수 없어서 어긋난 채로 있었다.**
//   T85 가 `path-core.js` 를 고치고 재인라인을 회부로 남겼는데, 그 어긋남을 **아무도 못 쟀다**:
//   `inline-engine.js` 에는 `--check` 가 있어 `lab-wiring-check [G]` 가 매번 재는데,
//   이 도구엔 그 문이 없어서 배선 검사가 **엔진만** 보고 path-core 는 안 봤다.
//   실측(T89 §0-ⓐ): 랩 사본은 T85 **전** 판이었다 — 정본 247줄 vs 사본 180줄(추가 84 · 삭제 17).
//   ⇒ 재인라인이 늦은 게 아니라 **검사기가 없었다**. 도구 하나에 문이 있으면 다른 하나에도 있어야 한다.
'use strict';
const fs = require('fs'), path = require('path');
const CORE = fs.readFileSync(path.join(__dirname, 'path-core.js'), 'utf8').replace(/<\/script>/g, '<\\/script>').trimEnd();
const MS = '// ===== PATH-CORE-START (sim/path-core.js 인라인 — node durango-mini/sim/inline-path.js 재생성. 직접 수정 금지) =====';
const ME = '// ===== PATH-CORE-END =====';
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const named = argv.filter((a) => !a.startsWith('--'));
const files = named.length ? named
  // ★[T123 2026-09-05] 랩이 레포 안(`lab/`)으로 들어왔다(PM c7778a49) — 기본 대상을 거기로.
  //   종전 기본값은 저장소 **밖**이라 컨테이너에선 언제나 "없음 — 건너뜀"이었고, 이 파일이
  //   스스로 적어 둔 대로 **건너뜀은 검사가 아니다**.
  : [path.join(__dirname, '..', 'lab', '마을실험실.html'), path.join(__dirname, '..', 'lab', '전쟁실험실.html')];

let stale = 0, missing = 0, fresh = 0;
for (const fp of files) {
  const name = path.basename(fp);
  let h;
  try { h = fs.readFileSync(fp, 'utf8'); } catch (e) {
    if (CHECK) { console.log(`[path] ⚠ 없음: ${fp}`); missing++; continue; }
    console.error(fp + ': 읽기 실패 — 건너뜀 (' + e.message + ')'); continue;
  }
  const si = h.indexOf(MS), ei = h.indexOf(ME);
  if (CHECK) {
    // ★마커가 없으면 "낡음"이 아니라 **아직 안 박혔다** — 둘을 갈라 말한다(같은 exit 1 이지만 원인이 다르다).
    if (!(si >= 0 && ei > si)) { console.log(`[path] ❌ 마커 없음: ${name} — 아직 인라인 안 됐다`); stale++; continue; }
    const blk = h.slice(si + MS.length, ei).replace(/^\n/, '').replace(/\n$/, '');
    if (blk === CORE) { console.log(`[path] ${name}: 최신 ✅`); fresh++; }
    else {
      const a = CORE.split('\n'), b = blk.split('\n');
      console.log(`[path] ❌ 낡음: ${name} — 정본 ${a.length}줄 vs 사본 ${b.length}줄`);
      stale++;
    }
    continue;
  }
  if (si >= 0 && ei > si) {
    h = h.slice(0, si) + MS + '\n' + CORE + '\n' + h.slice(ei);
    console.log(name + ': PATH-CORE 마커 치환(갱신)');
  } else {
    const at = h.indexOf('function bfsPath(');
    if (at < 0) { console.error(name + ': bfsPath 앵커 없음 — 건너뜀'); continue; }
    h = h.slice(0, at) + MS + '\n' + CORE + '\n' + ME + '\n' + h.slice(at);
    console.log(name + ': PATH-CORE 마커 신설+인라인');
  }
  fs.writeFileSync(fp, h);
}
if (CHECK) {
  // ★없는 파일은 실패가 아니다(디바이스 파일이라 컨테이너엔 없을 수 있다) — 그러나 **말은 한다**.
  if (stale) { console.log(`[path] 낡은 랩 ${stale}개 — node durango-mini/sim/inline-path.js 로 갱신해라`); process.exit(1); }
  if (!fresh && missing) console.log('[path] 잰 랩이 하나도 없다(전부 없음) — 검사가 아니라 건너뜀이다');
}
