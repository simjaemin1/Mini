// === scripts/t285-arm.js — T285: 죽은 다리와 자리 상한을 **세기만** 하는 프리로드 ========
//
// ⚠**제품 파일을 한 글자도 안 건드린다.** `sim/economy-sim.js` 의 **소스 텍스트**를 읽어
//   센 칸만 얹은 사본을 `require.cache` 에 심는다(T196·T204·T253·T264·T275 가 쓴 그 문법).
//   `node -r ./scripts/t285-arm.js scripts/t176-ab.js 800 <시드>` 로 **재는 자보다 먼저** 앉는다.
//
// ★왜 [지시 T285]
//   T275 가 잡은 것: 옛 `pickDeficitJob` 의 `wood < N*5` 줄이 `picker:'rational'` 세계에서 **한 번도 안 돈다**.
//   이 카드는 그 다음 둘을 센다 —
//     ⓑ **함수 전체가 죽은 다리인가**: 두 picker 의 **진입 횟수**를 따로 센다(0 이면 통째로 안 돈다).
//     ⓒ **`hasSlot` 이 막는 자리**: 살아 있는 위기 충원 줄(`:3800`)에서 막힐 때
//        그 순간의 **자리 상한**(`cap.lumberjack`)과 **현원**(`counts.lumberjack`)을 같이 남긴다.
//        정본은 `jobCapacity`(`:1385`)의 `floor(땅크기 × land.wood × 0.30)` 하나다 — 도구도 건물도 아니다.
//
// ★행동 0: 넣은 것은 **누계 증가와 값 남기기**뿐이고, 단축평가 순서와 반환은 원본과 같다.
//   끔 팔이 T275 기준과 비트 동일이면 그게 증거다.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

if (process.env.T285_ARM === '1') {
  const ECON = path.join(__dirname, '..', 'sim', 'economy-sim.js');
  let src = fs.readFileSync(ECON, 'utf8');
  const hits = [];
  const sub = (what, a, b) => {
    const n = src.split(a).length - 1;
    if (n !== 1) { console.error(`[t285-arm] ★치환 대상이 ${n}개다(정확히 1이어야 한다): ${what}`); process.exit(3); }
    src = src.replace(a, b); hits.push(what);
  };

  // ① 두 picker 의 **진입 횟수** — 마을 객체에 센다(첫 줄에 얹어 조기 반환도 다 잡는다)
  sub('옛 picker 진입 카운트',
    'function pickDeficitJob(v) {',
    'function pickDeficitJob(v) {\n  v._legacyPick = (v._legacyPick || 0) + 1;   // ★[T285 ⓑ] 진입 횟수(관측 전용)');
  sub('rational picker 진입 카운트',
    'function pickDeficitJob_rational(v, world) {',
    'function pickDeficitJob_rational(v, world) {\n  v._ratPick = (v._ratPick || 0) + 1;   // ★[T285 ⓑ] 진입 횟수(관측 전용)');

  // ② 살아 있는 위기 충원 줄 — 조건 참 · 충원 · 막힘 + **막힌 순간의 자리 상한·현원**
  sub('위기 충원 세 칸 + 자리 상한',
    "  if (v.housing !== undefined && N >= v.housing * 0.95 && (v.storage.wood || 0) < N * 2 && hasSlot(v, 'lumberjack', cap, counts)) return 'lumberjack';",
    "  if (v.housing !== undefined && N >= v.housing * 0.95 && (v.storage.wood || 0) < N * 2) {   // ★[T285 ⓒ] 단축평가 순서·반환 동일(행동 0)\n"
    + "    v._rpTry = (v._rpTry || 0) + 1;\n"
    + "    v._ljCap = (cap.lumberjack || 0); v._ljCnt = (counts.lumberjack || 0);   // 그 순간의 자리 상한 · 현원\n"
    + "    if (hasSlot(v, 'lumberjack', cap, counts)) { v._rpHit = (v._rpHit || 0) + 1; return 'lumberjack'; }\n"
    + "    v._rpBlock = (v._rpBlock || 0) + 1;\n"
    + "  }");

  // ③ 옛 줄도 같은 꼴로(둘을 나란히 놓아야 "0 이다"가 자명 통과가 아니게 된다)
  sub('옛 위기 충원 세 칸',
    "  if (v.storage.wood < N * 5 && hasSlot(v, 'lumberjack', cap, counts)) return 'lumberjack';",
    "  if (v.storage.wood < N * 5) {   // ★[T285 ⓑ] 옛 줄 — 같은 꼴로 센다(행동 0)\n"
    + "    v._pkTry = (v._pkTry || 0) + 1;\n"
    + "    if (hasSlot(v, 'lumberjack', cap, counts)) { v._pkHit = (v._pkHit || 0) + 1; return 'lumberjack'; }\n"
    + "    v._pkBlock = (v._pkBlock || 0) + 1;\n"
    + "  }");

  const m = new Module(ECON, null);
  m.filename = ECON; m.paths = Module._nodeModulePaths(path.dirname(ECON));
  require.cache[ECON] = m; m._compile(src, ECON); m.loaded = true;
  console.log(`[t285-arm] 관측 ${hits.length}자리(${hits.join(' · ')}) · 행동 0`);
}
