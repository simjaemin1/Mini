// === scripts/t275-arm.js — T275: 주거 처방 후보 셋을 사본으로 심는 프리로드 ============
//
// ⚠**제품 파일을 한 글자도 안 건드린다.** `sim/economy-sim.js` 의 **소스 텍스트**를 읽어
//   지정한 줄만 바꾼 사본을 `require.cache` 에 심는다(T196·T204·T253·T264 가 쓴 그 문법).
//   `node -r ./scripts/t275-arm.js scripts/t176-ab.js 800 <시드>` 로 **재는 자보다 먼저** 앉는다.
//
// ★왜 [지시 T275]
//   T264 가 세운 것: 목재 재고를 읽는 넷 중 **건축(`built`)** 하나가 죽음을 만든다.
//   그 셋째 항 `N × HOUSE_BUILD_MAX × slack` 이 처방의 자리다. 꼴 후보 셋을 표로 잰다:
//     ⓐ 절대 캡     — 마을 크기에 무관한 하루 상한 하나(끔 팔 실측 **중앙**. T264 는 마을별 **최대**였다)
//     ⓑ slack 재정의 — 지금은 **곳간 식량등가**를 읽는다(`:3101`). 그걸 **어제의 인구 증가율**로 바꾼다
//                      (정본 `_dpDebug.dP`(`:3173`) ÷ N · 단계 값 1.0/0.5/0.15 과 문턱 `POP_GROWTH_RATE` 는
//                       **정본 그대로** — 새 수 0. 빨리 크는 마을이 집을 빨리 못 짓게 하는 꼴이다)
//     ⓒ 재고 의존 완화 — 둘째 항 `재고/HOUSE_WOOD` 를 **짚이 아낀 몫을 뺀 재고**로 읽는다
//                      (절약분은 연료로만 세고 집으로는 안 세는 꼴 · 짚 이월을 끄면 누계가 0 이라 **종전과 같다**)
//
// ★모든 팔이 같이 받는 **관측 한 줄**(행동 0): picker 의 "위기 충원" 줄(`:3328`)을 세 칸으로 센다 —
//   조건이 참이었던 날(`_pkTry`) · 실제로 나무꾼을 부른 날(`_pkHit`) · `hasSlot` 이 막은 날(`_pkBlock`).
//   단축평가 순서와 반환이 원본과 **같다** ⇒ 짚 이월 끈 ⓒ 팔이 장부 팔과 비트 동일이면 그게 증거다.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ARM = (process.env.T275_ARM || '').trim();
if (ARM) {
  const ECON = path.join(__dirname, '..', 'sim', 'economy-sim.js');
  let src = fs.readFileSync(ECON, 'utf8');
  const hits = [];
  const sub = (what, a, b) => {
    const n = src.split(a).length - 1;
    if (n !== 1) { console.error(`[t275-arm] ★치환 대상이 ${n}개다(정확히 1이어야 한다): ${what}`); process.exit(3); }
    src = src.replace(a, b);
    hits.push(what);
  };

  // ── 관측 — picker 위기 충원 세 칸 × **둘** (모든 팔 공통 · 행동 0) ──────────
  //   ⚠**이 세계가 쓰는 picker 는 `pickDeficitJob_rational` 이다**(`t176-ab.js:252` 가
  //     `picker: 'rational'` 로 세계를 세운다 · `:3193`/`:3917` 이 그걸로 갈린다).
  //     그래서 옛 `pickDeficitJob` 의 `wood < N*5` 줄(`:3328`)은 **이 세계에서 안 돈다** —
  //     세 칸이 800일 내내 0 인 것이 그 증거다(T264 가 "포화"라고 읽은 것의 진짜 이유).
  //     실제 "위기 충원" 줄은 rational 쪽 `:3800`(주거 목재 안전망)이다 — 둘 다 센다.
  sub('관측(rational picker 세 칸)',
    "  if (v.housing !== undefined && N >= v.housing * 0.95 && (v.storage.wood || 0) < N * 2 && hasSlot(v, 'lumberjack', cap, counts)) return 'lumberjack';",
    "  if (v.housing !== undefined && N >= v.housing * 0.95 && (v.storage.wood || 0) < N * 2) {   // ★[T275 ②] 살아 있는 위기 충원 줄\n"
    + "    v._rpTry = (v._rpTry || 0) + 1;\n"
    + "    if (hasSlot(v, 'lumberjack', cap, counts)) { v._rpHit = (v._rpHit || 0) + 1; return 'lumberjack'; }\n"
    + "    v._rpBlock = (v._rpBlock || 0) + 1;\n"
    + "  }");
  sub('관측(옛 picker 세 칸)',
    "  if (v.storage.wood < N * 5 && hasSlot(v, 'lumberjack', cap, counts)) return 'lumberjack';",
    "  if (v.storage.wood < N * 5) {   // ★[T275 관측] 조건·충원·막힘을 센다(단축평가 순서·반환 동일 — 행동 0)\n"
    + "    v._pkTry = (v._pkTry || 0) + 1;\n"
    + "    if (hasSlot(v, 'lumberjack', cap, counts)) { v._pkHit = (v._pkHit || 0) + 1; return 'lumberjack'; }\n"
    + "    v._pkBlock = (v._pkBlock || 0) + 1;\n"
    + "  }");

  if (ARM === 'a') {
    // ★절대 캡 — 마을 크기에 무관한 하루 상한 하나(끔 팔 실측 중앙 · `T275_ABSCAP`).
    //   T264 는 **마을별 최대**로 묶었다. 이 팔은 **하나의 수**로 묶는다(꼴이 다르다).
    sub('절대 캡',
      "      built *= 0.3 + 0.7 * stoneFrac;   // 석재 0 → 30% 속도, 충분 → 100%",
      "      built *= 0.3 + 0.7 * stoneFrac;   // 석재 0 → 30% 속도, 충분 → 100%\n"
      + "      { const _ac = global.__T275_ABSCAP;   // ★[T275 ⓐ] 끔 팔 실측 중앙(마을 무관 · 새 수 0)\n"
      + "        if (_ac != null && built > _ac) built = _ac; }");
  } else if (ARM === 'b') {
    // ★slack 재정의 — 곳간이 아니라 **어제의 인구 증가율**을 읽는다.
    //   단계 값(1.0 · 0.5 · 0.15)과 문턱(`POP_GROWTH_RATE`)은 **정본 그대로** — 새 수 0.
    sub('slack 재정의',
      "    const slack = _fe > N * 40 ? 1.0 : (_fe > N * 25 ? 0.5 : 0.15);",
      "    const _g275 = (v._dpDebug && N > 0) ? ((v._dpDebug.dP || 0) / N) : 0;   // ★[T275 ⓑ] 어제의 인구 증가율(정본 `_dpDebug.dP`)\n"
      + "    const slack = _g275 <= 0 ? 1.0 : (_g275 < POP_GROWTH_RATE ? 0.5 : 0.15);   // 단계 값·문턱 전부 정본(새 수 0)");
  } else if (ARM === 'c') {
    // ★재고 의존 완화 — 짚이 아낀 몫은 **연료로만** 세고 집으로는 안 센다.
    sub('절약 누계',
      "  v._strawPend = avail - burn;",
      "  v._strawPend = avail - burn;\n"
      + "  v._strawSaveCum = (v._strawSaveCum || 0) + Math.max(0, burn - Math.min(cap, raw > 0 ? raw : 0));   // ★[T275 ⓒ] 짚이 아낀 목재 누계");
    sub('재고 의존 완화',
      "    let built = Math.min(houseTarget - v.housing, (v.storage.wood || 0) / HOUSE_WOOD, N * HOUSE_BUILD_MAX * slack);   // 목재 필수 + 여유노동 제약",
      "    let built = Math.min(houseTarget - v.housing, Math.max(0, (v.storage.wood || 0) - (v._strawSaveCum || 0)) / HOUSE_WOOD, N * HOUSE_BUILD_MAX * slack);   // ★[T275 ⓒ] 짚 절약분은 집으로 안 센다(끄면 누계 0 ⇒ 종전과 같다)");
  } else if (ARM !== 'obs') {
    console.error(`[t275-arm] ★모르는 팔: ${ARM}`);
    process.exit(3);
  }

  if (process.env.T275_ABSCAP) global.__T275_ABSCAP = Number(process.env.T275_ABSCAP);

  const m = new Module(ECON, null);
  m.filename = ECON;
  m.paths = Module._nodeModulePaths(path.dirname(ECON));
  require.cache[ECON] = m;
  m._compile(src, ECON);
  m.loaded = true;
  console.log(`[t275-arm] 팔=${ARM} · 치환 ${hits.length}자리(${hits.join(' · ')})`
    + (global.__T275_ABSCAP != null ? ` · 절대캡 ${global.__T275_ABSCAP}` : ''));
}
