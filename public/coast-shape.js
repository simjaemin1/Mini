// =============================================================================
// public/coast-shape.js — 해안선 **구간 성격** 생성기(서버·클라 공용 1부) [T588 · 손잡이 `T588_COAST` · ★T604 추신3 기본 b(`0` = 지금 식)]
//
// ★왜 [재민 10-03 "해안선 모양 저번에 고증적으로 바꾼다 하지 않았나?" · 족보 480 · 541 · T549 추신 ⓪-c]
//   지금 띠(`server/chunk.js generateCoastlineWaterTiles`)는 고증 함수가 아니다 — "직사각 바다 경계에서의 거리 <
//   6,000 ± 5,000px × 값 노이즈 fBm(3200/960/320px)" 하나가 26존을 같은 꼴로 깎는다. 깊이를 **가장 가까운 바다점**에서
//   재니 해안선은 변을 따라가는 1차원 그래프이고, 그래프로는 D 를 올리려면 줄마다 해안이 튀어야 한다(톱니 · T549 149곳).
//   ⇒ 이 파일: 구간마다 성격(굴곡 차원 D · 굴곡 진폭 · 깊이 · 섬)을 표에서 읽어 **2차원 지형 잡음의 등고선**으로 깎는다.
//     · 바다 ⟺ d(p) < 깊이(p) — d = 셀 중심에서 가장 가까운 바다 존 사각까지 거리(지금과 같은 d) ·
//       깊이(p) = 존 띠 깊이 + Σₖ aₖ(p)·nₖ(p) — nₖ 는 **셀 자리**의 2차원 기울기 잡음(지금처럼 바다점이 아니라) ⇒
//       해안선 = 램프 − 잡음의 등고선 → 굽이·만·곶·섬이 같은 식에서 나온다(fBm 등고선의 D = 2 − H).
//     · 옥타브 진폭 aₖ = A·(λₖ/λ_max)^H (H = 2 − D) · λ 범위 = 그 D 를 잰 자 길이 범위(T589 — 미확인이라 지금 식의
//       320~3,200px 그대로) — 그보다 잔 옥타브는 없다(= 셀 단위 톱니의 뿌리를 뽑는다). 진폭 A = 굴곡 진폭(T589 — 미확인이라
//       두 안: ⓐ 지금 상수 `COASTLINE_NOISE` · ⓑ 구간 D 를 게임 자로 맞춘 유도값 — 손잡이 값 a/b · 아래 `AMP_B`).
//     · 구간 사이·구간 끝은 부드럽게 잇는다(무게 = 구간 상자의 매끈한 지시함수 · 합 1 · 남는 몫은 지금 식).
//     · 1셀 돌기(4방 셋 이상이 반대편)는 한 번 뒤집고, 존 테두리에 안 닿는 갇힌 바다(잡음의 웅덩이)는 뭍으로 메운다
//       — 둘 다 구간 무게가 있는 칸에서만(구간 밖은 지금 식 바이트 그대로).
//
// ★★손잡이 = `T588_COAST`(서버 env · 클라는 welcome `uiCfg.coast588`) — ★[T604 추신3 2026-10-03] **기본 b**(없음 = b · `a` · `0` = 지금 식 —
//   `0` 이면 이 파일은 안 불리고 지금 식 줄만 돈다 — 평행이동도 안 먹는다: 끔 = 지금 바이트(되돌림 한 손잡이 · 추신3 카드)).
//   켬이어도 **구간 표가 비어 있으면(성격 수 null) 지금 바이트 그대로**다 — 무게가 0 이면 지금 식만 돈다(하네스가 건다).
// ★★결정적 · 엔진 무관: 쓰는 연산은 + − × ÷ √ · Math.floor · Math.imul 뿐이다(전부 IEEE·명세가 비트까지 정한다).
//   `Math.pow`·`exp`·`sin` 은 엔진마다 끝자리가 다를 수 있어 안 쓴다 — 2^x 는 √ 사슬(`pow2`)로 · 회전은 피타고라스 수(3/5·4/5).
//   ⇒ 서버(node)와 클라(Safari·Chromium)가 같은 칸을 낸다.
// ★★솔기 0: 칸의 답은 **세계 좌표만의 함수**다(d · 무게 · 잡음 · 섬). 1셀 돌기 뒤집기도 이웃 칸을 같은 함수로 재고
//   (존 밖 칸도 같은 식), 갇힌 바다 메우기는 "존 테두리에 닿는 덩이는 둔다"라서 두 존이 같은 답을 낸다(T408 접합).
// ★새 수 0: 성격 수는 T589(세션11 · `설계/고증_해안선.md`) · 축척은 T589 축척 메모 · 그 밖은 지금 상수(`COASTLINE_BASE` ·
//   `COASTLINE_NOISE`)와 유도식이다. 표의 null = 미확인(지어내지 않는다) → 그 구간은 지금 식.
// ★★[T588 추신2 2026-10-03] **T591 띠 배수(`coastBandK` — 닛폰 0.298) 위에 얹는다**: 부르는 쪽이 배수 함수(`opts.bandK(존, x, y)` —
//   `chunk.js _coastBandKAt` · 클라 미러)를 넘기면, 칸을 품은 존의 배수 k 를 — 지금 식 몫엔 깊이 전체(지금 식 그대로 ⇒ 켬 + 빈 표 = 끔이
//   배수 존에서도 선다) · 구간 몫엔 **띠 바탕(+ 이동)과 바닥에만** 곱하고 굴곡(옥타브 잡음 · 진폭 A)은 **그 위에 그대로 얹는다**(카드 문구).
//   띠 몫은 바탕이 정한다(잡음 평균 0 — 닛폰 켬 띠 몫 ≈ T591 몫) · 굴곡 크기는 성격이 정한다(빌린 구간 D 가 닛폰에서도 큰 상자 자로 읽힌다).
//   (진폭까지 k 를 곱하면 닛폰 굴곡이 표준편차 6~11셀로 눌려 큰 상자 D 가 배수 1 판보다 0.11~0.16 낮다 · 대신 바닥 닿음 0 — 보고 ③-라 ·
//   이 판의 값은 바닥 닿음: 곶 끝이 k × 1,000px(닛폰 9셀) 바닥에 눌린 열 — 구간 몸통 0~29%.) 배수 존이 있는데 함수가 안 오면 던진다.
// ★★[T604 추신2 2026-10-03] 존별 **해안 평행이동** `coastShift`(셀 · zone-config · 기본 0) — 부르는 쪽 함수(`opts.bandShift(존, x, y)` → px ·
//   `chunk.js _coastShiftAt` · 클라 미러)가 준 값을 **마지막 깊이에서 빼고 0 아래는 0**(지금 식 몫 · 구간 몫 같은 자리 — 지금 식 줄과 같은 식).
//   뭍 이웃 변에서는 배수처럼 같은 비탈로 0 까지(이웃 존과 계단 0). 기본 후보 = b(재민 10-03 "b 가 낫다" — 손잡이 `1` = b).
// ★★[T604 추신3 2026-10-03] **경계 앞 바다 지킴** — 평행이동은 바다 존 경계 앞 바다를 핸드오프 겹침 띠 폭(`HANDOFF_COMMIT` — 정본 `zone-config.js` ·
//   256px = 8셀)보다 얇게 만들지 않는다: 깊이 d · 이동 s · 지킴 폭 K(부르는 쪽이 `opts.keepPx` 로 넘긴다 — 서버 `chunk.js` = zone-config 값 ·
//   클라 = `/zones` 의 `handoffCommit` · 박힌 수 0) → max(d − s, min(d, K)) (`shiftDepth` 한 자리). 이동 때문에 8셀보다 얇아지는 열은
//   8셀에서 멈춘다(재민 10-03) · 이동 0 이면 d 그대로(종전 바이트) · d 가 처음부터 K 보다 얕은 곳은 이동이 안 먹는다(얇게 만든 것이 이동이 아님).
//   열도 구간은 T589 미확인 → **빌려 씀**(추신2 · 표 `borrow`): 닛폰 서 ← 한반도 동(동해 매끈 ↔ 열도 동해 쪽) · 닛폰 남 ← 한반도 남
//   (남해 다도해 ↔ 규슈 서쪽) · 닛폰 동 = T589 참고치 1.2336(우와지마 · 확실도 약). 중원 동해안은 미확인 그대로(지금 식).
// =============================================================================
(function (root) {
  'use strict';

  // ── 구간 표(정본) ─────────────────────────────────────────────────────────────
  //   한 줄 = 해안 구간. **존 사각 변이 아니라 구간**이다(카드) — 자리는 zone-config 의 존 사각에서 유도한다(박힌 px 0):
  //     zone · side(N/S/E/W) · [from, to) = 그 변을 따라 잰 몫(서→동 · 북→남). 존 폭이 바뀌면(T591) 구간도 따라간다.
  //   ⚠이 세계의 바다 배치: 한반도는 **남변 하나**만 바다(동창해)에 닿고 서는 중원북 · 동은 닛폰(뭍)이다 · 닛폰은 남(남창해)·동(큰바다) ·
  //     중원북은 남동 **꼭짓점**으로만 바다에 닿고, 그 해안은 중원남 동변으로 이어진다(T588 ① 표).
  //     ⇒ 실제 해안 차례(황해 → 서해 → 남해 → 동해 → 대한해협·동해 쪽 → 열도 남 → 태평양)를 **이 세계의 한 줄 해안 길**에 차례로 놓는다.
  //   성격 칸(전부 T589 · `설계/고증_해안선.md` · 없는 칸 = 미확인 → 지어내지 않는다):
  //     D       해안선 프랙털 차원(박스 카운팅) — H = 2 − D · **이 칸이 있어야 그 구간이 선다**(없으면 지금 식)
  //     rulerKm [lo, hi] 그 D 를 잰 자 길이(km) → 옥타브 범위 · ★T589 ③ "미확인"(1:700,000 지도 이미지 · 자의 km 를 원문이 안 밝힘)
  //             ⇒ 없으면 **지금 식의 옥타브 범위 그대로**: 가장 잔 굴곡 `FINE_PX` 320px · 가장 큰 굴곡 `COARSE_PX` 3,200px(같은 수 —
  //               `chunk.js _coastFbm2D` 의 셋째·첫째 옥타브). 바뀌는 것은 범위 안 기울기(H)와 꼴(2차원 등고선)뿐이다.
  //     ampKm   굴곡 진폭(km) — ★미확인(해안선/직선 비도 미확인) ⇒ 두 안(아래 `AMP_B` · 손잡이 값 a/b)
  //     shiftKm 청동기 해안 이동(km) — ★T589 ② 방향만 있고 그 시점 수치 없음 ⇒ 0(지금 해안 · 재민 칸)
  //     isl     섬 뿌리기 { perKm2, bins: [[넓이 lo km², hi km², 몫], …] } — ★섬 **수**만 있다(동 169 · 남 2,244 · 서 892) ·
  //             구간 해안 길이·넓이 분포가 미확인이라 밀도로 못 옮긴다 ⇒ 없음(섬 뿌리기 0 · 등고선이 내는 섬만)
  //     ref     참고치(확실도 '약') — **기본 적재 안 함**(`opts.withRef` 로만 · 안 그림에서) · ★추신2 부터 쓰는 줄 0(닛폰 동 참고치는 적재)
  //     borrow  ★추신2 — 그 구간 T589 수가 비어 **다른 구간 성격을 빌려 쓴다**(D · ⓑ 진폭이 빌린 구간 것) · why = 빌린 까닭(카드 문구)
  //     표에만(생성기가 안 읽는 칸): type 해안 종류 · islands 섬 수 · tidalKm2 갯벌 면적 · tideM 조차 · src · conf
  //   ★구간 경계(한반도 남변 서·남·동 · 닛폰 남변 서·남)는 **같은 길이로 나눴다** — 구간별 해안 길이(직선)가 T589 에서 미확인이라
  //     나눌 근거가 없다(재민이 고를 자리 · 보고 회부).
  var THIRD = 1 / 3;
  var SECTIONS = [
    { id: 'jw_e', ko: '중원 동해안(황해 쪽)', zone: 'jungwon_s', side: 'E', from: 0, to: 1 },
    { id: 'jw_n', ko: '중원북 동해안(남동 꼭짓점)', zone: 'jungwon_n', corner: 'SE', as: 'jw_e' },
    { id: 'kr_w', ko: '한반도 서(서해)', zone: 'hanbando', side: 'S', from: 0, to: THIRD },
    { id: 'kr_s', ko: '한반도 남(남해)', zone: 'hanbando', side: 'S', from: THIRD, to: 2 * THIRD },
    { id: 'kr_e', ko: '한반도 동(동해)', zone: 'hanbando', side: 'S', from: 2 * THIRD, to: 1 },
    { id: 'jp_w', ko: '닛폰 서(대한해협·동해 쪽)', zone: 'nippon', side: 'S', from: 0, to: 0.5 },
    { id: 'jp_s', ko: '닛폰 남(세토·규슈)', zone: 'nippon', side: 'S', from: 0.5, to: 1 },
    { id: 'jp_e', ko: '닛폰 동(태평양 쪽)', zone: 'nippon', side: 'E', from: 0, to: 1 },
  ];
  var T589 = 'T589(세션11 · 가지 59628c5d · 설계/고증_해안선.md)';
  var KINPR = 'KINPR 40-4 「개선된 BC법과 해안선의 프랙탈 차원 계산」(glonav.org/upload/pdf/KINPR-40-4-207.pdf · Google 지도 1:700,000 · Canny · BC법)';
  var CHAR = {
    kr_w: { D: 1.241, type: '리아스식 침강 해안 · 넓은 간석지', islands: 892, tidalKm2: 2050.98, tideM: [3, 9],
      src: KINPR + ' · 위키백과 「한국의 해안」 · 해양환경정보포털 「한국의 갯벌」 — ' + T589, conf: '확실' },
    kr_s: { D: 1.273, type: '침강 리아스 · 다도해(갯벌은 서해보다 적다)', islands: 2244, tidalKm2: 392.11, tideM: [3, 9],
      src: KINPR + ' · 위키백과 「한국의 해안」 · 해양환경정보포털 「한국의 갯벌」 — ' + T589, conf: '확실' },
    kr_e: { D: 1.037, type: '이수(융기) 해안 · 사빈 · 사주·석호(강릉 이남)', islands: 169,
      src: KINPR + ' · 위키백과 「한국의 해안」 — ' + T589, conf: '확실' },
    // ★추신2 — 열도: T589 D 는 태평양쪽 참고치 하나 · 동해쪽·세토·규슈서쪽은 미확인 → 카드가 정한 짝으로 **빌려 씀**(지어내지 않는다)
    jp_w: { borrow: 'kr_e', why: '동해 매끈 ↔ 열도 동해 쪽(추신2)', type: '미확인(T589 — 일본 동해쪽 원문 못 엶)', conf: '빌려 씀(한반도 동)' },
    jp_s: { borrow: 'kr_s', why: '남해 다도해 ↔ 규슈 서쪽(추신2)', type: '미확인(T589 — 세토 내해 개황만 · 규슈 서쪽 미확인)', conf: '빌려 씀(한반도 남)' },
    jp_e: { D: 1.2336, type: '리아스식(우와지마 — 산리쿠 아님)',
      src: '우와지마히가시고 과학탐구보고서(uwajimahigashi-h.esnet.ed.jp/uploads/h292nen16.pdf · 고교 보고서) — ' + T589, conf: '약(참고치 · 고교 보고서)' },
  };
  // 축척(T589 ③ 게임 축척 메모 · 계산만): 한반도 동서 약 300km(영문 위키 「Geography of Korea」) ÷ 2,188셀 = 1셀 ≈ 137.1m
  //   — km 칸(ampKm·shiftKm·isl)을 px 로 옮길 때만 쓴다(지금 표엔 그런 칸이 없다). ⚠"32px = 1m"(zone.js 걸음) 과 137배 어긋남 — 재민 칸.
  var SCALE = { mPerCell: 300000 / 2188, src: 'T589 ③ — 한반도 동서 폭 약 300km ÷ 2,188셀' };
  // 자 범위가 미확인일 때의 옥타브 범위 = 지금 식(`chunk.js _coastFbm2D` · `00-const.js` 같은 식)의 잔·큰 옥타브와 **같은 수**(새 수 아님)
  var FINE_PX = 320, COARSE_PX = 3200;
  // ── 진폭 두 안(굴곡 진폭이 T589 에서 미확인이라 — 재민이 고른다 · 손잡이 값 `a` / `b`) ─────────────────────────
  //   ⓐ 진폭 = 지금 식의 진폭 `COASTLINE_NOISE`(Σaₖ = 5,000px — 지금 식의 ±끝값과 같은 뜻) — 구간마다 같은 진폭 · 기울기(H)만 다르다
  //   ⓑ "D 맞춤": 그 구간 성격(H · 옥타브 범위)으로 깎은 **긴 시험 해안**(8,192셀)을 T549 자로 잰 큰 상자 D(16~128셀)가 **고증 D** 가 되는 진폭
  //      — `scripts/t588-coast-fit.js <D> 3200 0 <dir> 320 --match-d` 의 할선법 값(유도값 · 보고 §②):
  //        서 1.241 → 6,904 · 남 1.273 → 7,406 · 동 1.037 → 3,849 · (참고 동 1.2336 → 6,813) — D 가 바뀌면 그 자로 다시 잰다
  var AMP_B = { kr_w: 6904, kr_s: 7406, kr_e: 3849, jp_e: 6813 };   // 빌려 쓴 구간은 빌린 구간 값(배수 1 틀 — 배수 k 가 띠째 줄인다)

  // ── 결정적 수학 ──────────────────────────────────────────────────────────────
  var _SQ = null;   // _SQ[j] = 2^(2^-j)
  function pow2(x) {   // 2^x — √ 사슬(엔진 무관 · 비트 동일)
    if (!_SQ) { _SQ = [2]; for (var j = 1; j <= 48; j++) _SQ[j] = Math.sqrt(_SQ[j - 1]); }
    var n = Math.floor(x), f = x - n, r = 1;
    for (var k = 1; k <= 48 && f > 0; k++) { f = f * 2; if (f >= 1) { r = r * _SQ[k]; f = f - 1; } }
    if (n > 0) for (var i = 0; i < n; i++) r = r * 2; else for (var i2 = 0; i2 < -n; i2++) r = r / 2;
    return r;
  }
  function hash(ix, iy, s) {   // 정수 셋 → uint32
    var h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(s | 0, 0x61c88647);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }
  var R2 = 0.7071067811865476;   // 1/√2 (리터럴 — 명세가 같은 비트로 읽는다)
  var GX = [1, -1, 0, 0, R2, -R2, R2, -R2], GY = [0, 0, 1, -1, R2, R2, -R2, -R2];
  function _g(ix, iy, s, dx, dy) { var k = hash(ix, iy, s) & 7; return GX[k] * dx + GY[k] * dy; }
  function _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  // 2차원 기울기 잡음(격자 단위 좌표) — 값역 약 [-1, 1]
  function gnoise(x, y, s) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    var u = _fade(fx), v = _fade(fy);
    var a = _g(ix, iy, s, fx, fy), b = _g(ix + 1, iy, s, fx - 1, fy);
    var c = _g(ix, iy + 1, s, fx, fy - 1), d = _g(ix + 1, iy + 1, s, fx - 1, fy - 1);
    var ab = a + (b - a) * u, cd = c + (d - c) * u;
    return (ab + (cd - ab) * v) * 1.4142135623730951;
  }
  // 옥타브 k 의 격자 정렬을 흩는 회전(피타고라스 3·4·5 — 정확한 유리수)과 자리 밀기(해시)
  function octave(xw, yw, lam, k) {
    var x = xw / lam, y = yw / lam, t;
    if (k & 1) { t = (3 * x - 4 * y) / 5; y = (4 * x + 3 * y) / 5; x = t; }
    if (k & 2) { t = (5 * x - 12 * y) / 13; y = (12 * x + 5 * y) / 13; x = t; }
    var o = hash(k, 0, 588);
    return gnoise(x + (o & 1023) / 64, y + ((o >>> 10) & 1023) / 64, 588 + k);
  }
  function smooth01(t) { return t <= 0 ? 0 : (t >= 1 ? 1 : t * t * (3 - 2 * t)); }
  // 매끈한 바닥 — t ≥ 2m 이면 t 그대로 · 0~2m 은 m + t²/4m(값·기울기 이어짐) · 0 아래는 m
  function _floor(t, m) { return t >= 2 * m ? t : (t <= 0 ? m : m + t * t / (4 * m)); }
  // ★[T604 추신3] 평행이동 + 경계 앞 바다 지킴 — 깊이 d(px) · 이동 s(px · 부르는 쪽 `bandShift`/`_coastShiftAt`) · 지킴 폭 k(px · `HANDOFF_COMMIT`) → 새 깊이(px).
  //   셀 중심 거리가 16 + 32j 라 깊이 ≥ k(256) 이면 경계 앞 8칸(j 0~7)이 바다. k 가 수가 아니면(0) 지킴 없음 = 추신2 식(max(0, d − s)).
  function shiftDepth(d, s, k) { if (s === 0) return d; var K = k > 0 ? k : 0; return Math.max(d - s, d < K ? d : K); }

  // ── 표 → 생성기 꼴(존 사각에서 유도 · 표·존이 같으면 캐시) ───────────────────────
  var _cache = { key: null, C: null };
  function _active(sec, ch, opts) {
    if (!ch || typeof ch.D !== 'number' || !(ch.D >= 1 && ch.D < 2)) return false;
    if (ch.ref && !(opts && opts.withRef)) return false;               // 참고치는 기본 적재 안 함
    return !!(sec.corner || (sec.from != null && sec.to != null && sec.to > sec.from));
  }
  function compile(zones, base, noise, opts) {
    opts = opts || {};
    var table = opts.sections || SECTIONS, chars = opts.chars || CHAR, scale = opts.scale || SCALE;
    var key = JSON.stringify([table, chars, scale, base, noise, !!opts.withRef, opts.fine || 0, opts.coarse || 0, opts.variant || 'a', opts.ampB || AMP_B, Object.keys(zones).sort().map(function (id) {
      var z = zones[id]; return [id, z.worldOffsetX, z.worldOffsetY, z.zoneWidth, z.zoneHeight, !!z.isOcean, z.coastBandK || 1, z.coastShift || 0]; })]);
    if (_cache.key === key) return _cache.C;
    var pxPerKm = scale && scale.mPerCell > 0 ? (1000 / scale.mPerCell) * 32 : 0;
    var secs = [], lamMax = 0, lamMin = Infinity;
    for (var i = 0; i < table.length; i++) {
      var s = table[i], key0 = s.as || s.id, ch0 = chars[key0], z = zones[s.zone];
      // 빌려 씀(추신2): 성격 수(D · ⓑ 진폭)는 빌린 구간 것 · 자리는 이 구간
      var ch = ch0 && ch0.borrow ? chars[ch0.borrow] : ch0, ampKey = ch0 && ch0.borrow ? ch0.borrow : key0;
      if (!z || z.isOcean || !_active(s, ch, opts)) continue;
      // 옥타브 범위: 자 범위(km)가 있으면 그것 · 없으면(T589 ③ 미확인) 구간 길이 ~ FINE_PX
      var hasRuler = ch.rulerKm && ch.rulerKm[0] > 0 && ch.rulerKm[1] > ch.rulerKm[0] && pxPerKm > 0;
      var H = 2 - ch.D, l0 = hasRuler ? ch.rulerKm[0] * pxPerKm : (opts.fine || FINE_PX), l1 = hasRuler ? ch.rulerKm[1] * pxPerKm : (opts.coarse || COARSE_PX);
      lamMax = Math.max(lamMax, l1); lamMin = Math.min(lamMin, l0);
      secs.push({ id: s.id, ko: s.ko, zone: s.zone, side: s.side, corner: s.corner, from: s.from, to: s.to, H: H, l0: l0, l1: l1,
        borrow: ch0 && ch0.borrow ? ch0.borrow : null, D: ch.D,
        A: (typeof ch.ampKm === 'number' && pxPerKm > 0 ? ch.ampKm * pxPerKm
          : (opts.variant === 'b' && (opts.ampB || AMP_B)[ampKey] > 0 ? (opts.ampB || AMP_B)[ampKey] : noise)),
        shift: (typeof ch.shiftKm === 'number' && pxPerKm > 0 ? ch.shiftKm * pxPerKm : 0), isl: (pxPerKm > 0 && ch.isl) || null });
    }
    // 옥타브 사다리 — **모든 구간 공용 · 바닥에 못 박는다**: λₖ = fine·2^k(k = 0 이 가장 잔 것). 무게로 섞으려면 같은 잡음장이어야 하고,
    //   바닥에 박아야 다른 자리 구간을 켜고 꺼도(사다리 위가 늘고 줄 뿐) 이 구간의 옥타브 자리·번호·잡음이 안 바뀐다.
    var lams = [], fine = opts.fine || FINE_PX;
    if (secs.length) for (var lam = fine; lam <= lamMax * 1.0000001; lam = lam * 2) lams.push(lam);
    for (var j = 0; j < secs.length; j++) {
      var S = secs[j], amp = [], sum = 0;
      // aₖ ∝ λₖ^H = 2^(k·H)·상수 — 상수는 정규화(Σ aₖ = A)에서 지워진다 ⇒ pow2(kH) 하나(엔진 무관)
      for (var k = 0; k < lams.length; k++) {
        var a = (lams[k] <= S.l1 * 1.0000001 && lams[k] >= S.l0 / 1.4142135623730951) ? pow2(k * S.H) : 0;
        amp.push(a); sum += a;
      }
      for (var k2 = 0; k2 < amp.length; k2++) amp[k2] = sum > 0 ? S.A * amp[k2] / sum : 0;   // Σ aₖ = A(지금 식의 ±NOISE 와 같은 뜻 — 끝값)
      S.amp = amp;
      // 구간 상자(세계 px): 변을 따라 [from, to) · 안쪽으로 띠 최대 깊이 + 섞임 폭
      var z2 = zones[S.zone], x0 = z2.worldOffsetX, y0 = z2.worldOffsetY, x1 = x0 + z2.zoneWidth, y1 = y0 + z2.zoneHeight;
      // 이만큼 안쪽까지 무게(띠가 닿는 끝 + 섞임 폭) — 배수 k 는 1 과 그 존 배수 사이(T591 비탈)라 큰 쪽으로 잡는다
      var reach = Math.max(1, _kOf(z2)) * (base + S.shift + S.A) + base;
      if (S.corner) {   // 꼭짓점 구간 — 그 꼭짓점을 가운데 둔 정사각(반변 = reach)
        var cx = S.corner.indexOf('E') >= 0 ? x1 : x0, cy = S.corner.indexOf('S') >= 0 ? y1 : y0;
        S.ax = cx - reach; S.bx = cx + reach; S.ay = cy - reach; S.by = cy + reach;
      } else if (S.side === 'S' || S.side === 'N') {
        S.ax = x0 + S.from * (x1 - x0); S.bx = x0 + S.to * (x1 - x0);
        S.ay = S.side === 'S' ? y1 - reach : y0 - base; S.by = S.side === 'S' ? y1 + base : y0 + reach;
      } else {
        S.ay = y0 + S.from * (y1 - y0); S.by = y0 + S.to * (y1 - y0);
        S.ax = S.side === 'E' ? x1 - reach : x0 - base; S.bx = S.side === 'E' ? x1 + base : x0 + reach;
      }
    }
    var maxD = base + noise;
    for (var m = 0; m < secs.length; m++) maxD = Math.max(maxD, Math.max(1, _kOf(zones[secs[m].zone])) * (base + secs[m].shift + secs[m].A));
    // 가장 얕은 바다 폭 = 지금 식이 지키는 그 폭(base − noise = 1,000px) — 곶이 바다 존 경계에 닿아 직선으로 잘리지 않게 매끈한 바닥(`_floor`)
    // 섬 뿌리기 — 구간 isl = { perKm2: 띠 바다 1km² 당 섬 수, bins: [[넓이 lo km², hi km², 몫], …] }(T589 섬 수 · 넓이 구간)
    //   공용 격자 G(세계 px): 가장 큰 섬 지름의 두 배 — 한 칸에 섬 하나(있을 확률 = 밀도 × G²) · 1 을 넘으면 칸을 줄인다(밀도의 역수 제곱근).
    //   ⚠넓이 → 반지름은 √(A/π) · 크기 뽑기는 구간 안 몫으로(누적 → 구간 안 고른 넓이) — pow·log 0(엔진 무관).
    var G = 0, rMaxAll = 0;
    for (var ii = 0; ii < secs.length; ii++) {
      var I = secs[ii].isl; if (!I || !(I.perKm2 > 0) || !I.bins || !I.bins.length) { secs[ii].isl = null; continue; }
      var bins = [], tot = 0, rmx = 0;
      for (var bi = 0; bi < I.bins.length; bi++) { var B = I.bins[bi]; if (!(B[1] >= B[0] && B[0] > 0 && B[2] > 0)) continue; tot += B[2];
        bins.push([B[0] * pxPerKm * pxPerKm, B[1] * pxPerKm * pxPerKm, tot]); rmx = Math.max(rmx, Math.sqrt(B[1] * pxPerKm * pxPerKm / Math.PI)); }
      if (!bins.length) { secs[ii].isl = null; continue; }
      for (var bj = 0; bj < bins.length; bj++) bins[bj][2] = bins[bj][2] / tot;
      secs[ii].isl = { dens: I.perKm2 / (pxPerKm * pxPerKm), bins: bins, rMax: rmx };
      rMaxAll = Math.max(rMaxAll, rmx);
      var g = 4 * rmx, gD = 1 / Math.sqrt(secs[ii].isl.dens); if (gD < g) g = gD;
      G = G === 0 ? g : Math.min(G, g);
    }
    // 배수 존(T591 `coastBandK` ≠ 1 인 뭍 존) — 칸을 품은 존을 찾아 부르는 쪽 배수 함수에 넘긴다(세계 좌표 함수 · 솔기 0)
    var kz = []; for (var zid in zones) { var zk = zones[zid]; if (!zk.isOcean && (_kOf(zk) !== 1 || _sOf(zk) > 0)) kz.push(zk); }   // 배수 존 · 평행이동 존
    var C = { secs: secs, lams: lams, T: base, base: base, noise: noise, maxD: maxD, zones: zones, m: base - noise, kz: kz, G: G, rMax: rMaxAll };
    _cache.key = key; _cache.C = C;
    return C;
  }

  // 구간 무게 — 상자의 매끈한 지시함수(섞임 폭 T: 상자 경계 양쪽 T/2) · 이웃 구간끼리 합 1(smooth01(t) + smooth01(1−t) = 1)
  function weightsAt(C, x, y, w) {
    var sum = 0, T = C.T;
    for (var i = 0; i < C.secs.length; i++) {
      var S = C.secs[i];
      var sx = smooth01((x - S.ax + T / 2) / T) * (1 - smooth01((x - S.bx + T / 2) / T));
      var sy = smooth01((y - S.ay + T / 2) / T) * (1 - smooth01((y - S.by + T / 2) / T));
      w[i] = sx * sy; sum += w[i];
    }
    return sum;
  }
  // 띠 배수(T591 · ★추신2) — 칸 (x, y)를 품은 뭍 존의 배수. 식은 부르는 쪽 함수(`chunk.js _coastBandKAt` · 클라 미러 — 사본 0) ·
  //   존 찾기는 세계 좌표만으로(존 사각은 겹치지 않는다) ⇒ 존 밖 이웃 칸(1셀 돌기 뒤집기)도 그 칸 존의 배수 — 두 존이 같은 답.
  function _kOf(z) { return (z && typeof z.coastBandK === 'number' && z.coastBandK > 0 && z.coastBandK !== 1) ? z.coastBandK : 1; }
  function _sOf(z) { return (z && typeof z.coastShift === 'number' && z.coastShift > 0) ? z.coastShift : 0; }   // ★T604 추신2 평행이동(셀)
  // 칸 (x, y)를 품은 배수·평행이동 존(없으면 null — 그 칸은 배수 1 · 이동 0)
  function kzAt(C, x, y) {
    for (var i = 0; i < C.kz.length; i++) {
      var z = C.kz[i];
      if (x >= z.worldOffsetX && x < z.worldOffsetX + z.zoneWidth && y >= z.worldOffsetY && y < z.worldOffsetY + z.zoneHeight) return z;
    }
    return null;
  }

  // ── 칸 하나의 날 답(세계 좌표만의 함수) ─────────────────────────────────────────
  //   ret: 0 = 뭍 · 1 = 바다(구간 무게 0 — 지금 식) · 2 = 바다(구간 무게 있음) · 3 = 뭍(구간 무게 있음)
  //   ⚠존 밖 칸(1셀 돌기 뒤집기가 이웃을 볼 때)도 같은 식 — 바다 존 안이면 d = 0 이라 늘 바다다.
  function rawAt(C, ax, ay, oceanRects, oldDepth, w) {
    var maxD2 = C.maxD * C.maxD, bd2 = maxD2, bnx = 0, bny = 0, hit = false;
    for (var oi = 0; oi < oceanRects.length; oi++) {
      var O = oceanRects[oi];
      var nx = ax < O.x0 ? O.x0 : (ax > O.x1 ? O.x1 : ax);
      var ny = ay < O.y0 ? O.y0 : (ay > O.y1 ? O.y1 : ay);
      var dx = ax - nx, dy = ay - ny, d2 = dx * dx + dy * dy;
      if (d2 < bd2) { bd2 = d2; bnx = nx; bny = ny; hit = true; }
    }
    if (!hit) return 0;
    var dist = Math.sqrt(bd2);
    var ws = weightsAt(C, ax, ay, w);
    // T591 배수(★추신2) k — 지금 식 몫은 깊이 전체 × k(지금 식 그대로) · 구간 몫은 **띠 바탕(+ 이동)·바닥만 × k, 굴곡(옥타브 잡음)은 그 위에 그대로**
    //   (카드: "이 깊이 위에 구간 성격만 얹는다") — 띠 몫은 바탕이 정하고(잡음 평균 0) 굴곡 크기는 성격이 정한다. k = 1 이면 × 1 = 비트 그대로.
    var kb = 1, sb = 0;   // ★T604 추신2 — sb = 평행이동(px · 부르는 쪽 함수) · 마지막 깊이에서 뺀다 · ★추신3 경계 앞 8셀에서 멈춤(`shiftDepth`)
    if (C.kz.length) { var zc = kzAt(C, ax, ay); if (zc) { if (_kOf(zc) !== 1) kb = C.bandK(zc, ax, ay); if (_sOf(zc) > 0) sb = C.bandShift(zc, ax, ay); } }
    if (ws <= 0) {   // 구간 밖 — 지금 식 그대로(같은 d · 같은 바다점 · 같은 거르기 · 같은 곱 · 같은 평행이동)
      if (!(bd2 < C.mx2)) return 0;
      var d0 = oldDepth(bnx, bny) * kb;
      return dist < (sb === 0 ? d0 : API.shiftDepth(d0, sb, C.keepPx)) ? 1 : 0;   // 내보낸 자리를 부른다(하네스 ⑨ 돌연변이가 갈아 끼운다)
    }
    var norm = ws > 1 ? ws : 1, w0 = ws < 1 ? 1 - ws : 0, nAmp = 0, mk = kb * C.m;
    // 잡음 없이 가르는 두 경계(속도 — 답은 같다): 지금 식 깊이 ∈ k·[base−noise, base+noise] · 새 깊이 ∈ [k·m, k·(띠+이동) + A] — 둘 다 − 평행이동
    var hiN = 0;
    for (var h = 0; h < C.secs.length; h++) if (w[h] > 0) hiN += (w[h] / norm) * (kb * (C.base + C.secs[h].shift) + C.secs[h].A);
    var hiNew = hiN / (1 - w0); if (hiNew < mk) hiNew = mk;
    var hiB = w0 * kb * (C.base + C.noise) + (1 - w0) * hiNew, loB = w0 * kb * (C.base - C.noise) + (1 - w0) * mk;
    if (sb !== 0) { hiB = API.shiftDepth(hiB, sb, C.keepPx); loB = API.shiftDepth(loB, sb, C.keepPx); }   // shiftDepth 는 d 에 대해 줄지 않는다 ⇒ 두 경계도 그대로 경계
    if (dist >= hiB) return 3;
    if (dist < loB) return islandAt(C, ax, ay, dist, w, norm) ? 3 : 2;
    var depth = w0 > 0 ? w0 * (oldDepth(bnx, bny) * kb) : 0;
    var dB = 0;
    for (var i = 0; i < C.secs.length; i++) if (w[i] > 0) dB += (w[i] / norm) * (C.base + C.secs[i].shift);
    var dNew = kb * dB;
    for (var k = 0; k < C.lams.length; k++) {
      var a = 0;
      for (var j = 0; j < C.secs.length; j++) if (w[j] > 0) a += (w[j] / norm) * C.secs[j].amp[k];
      if (a > 0) { dNew += a * octave(ax, ay, C.lams[k], k); nAmp += a; }
    }
    depth += (1 - w0) * _floor(dNew / (1 - w0), mk);
    if (sb !== 0) depth = API.shiftDepth(depth, sb, C.keepPx);
    var sea = dist < depth;
    if (sea && islandAt(C, ax, ay, dist, w, norm)) sea = false;
    return sea ? 2 : 3;
  }

  // ── 섬 뿌리기(구간 isl · 없으면 0) ────────────────────────────────────────────
  //   (T589 섬 수를 받으면 채운다 — 자리 = 세계 격자 해시 · 크기 = 표 넓이 범위 · 존 경계를 넘는 섬도 두 존이 같은 답)
  //   칸 p 가 섬인가: p 둘레 격자 칸(3×3 · G ≥ 2 rMax 일 때 · 밀면 더)의 섬 하나씩 —
  //     · 있나 = 해시 < (그 격자 중심의 구간 무게로 섞은 밀도 × G²)
  //     · 자리 = 격자 칸 안 해시 · 넓이 = 구간 몫 누적에서 해시로 고른 구간 안 고른 값 · 반지름 √(A/π)
  //     · 꼴 = |p − c| < r + Σ(지름보다 잔 옥타브 aₖ·nₖ(p)) — 본토 해안과 **같은 잡음·같은 진폭**(섬 해안도 같은 D)
  //     · 존 안쪽에만: 섬 중심이 바다 존 경계에서 r + m 넘게(곶처럼 존 경계에 잘린 직선 섬 0)
  function islandAt(C, ax, ay, dist, w, norm) {
    if (!C.G) return false;
    var G = C.G, gx0 = Math.floor(ax / G), gy0 = Math.floor(ay / G), reach = Math.ceil((C.rMax * 1.5) / G);
    if (!C.isl) C.isl = new Map();
    for (var gy = gy0 - reach; gy <= gy0 + reach; gy++) for (var gx = gx0 - reach; gx <= gx0 + reach; gx++) {
      var key = gx * 1048576 + gy, I = C.isl.get(key);
      if (I === undefined) { I = _islandOf(C, gx, gy); C.isl.set(key, I); }   // 격자 칸 하나의 섬(없으면 null) — 순수 함수의 메모
      if (!I) continue;
      var cx = I[0], cy = I[1], r = I[2], bi = I[3];
      var dx = ax - cx, dy = ay - cy, dd = dx * dx + dy * dy, R = r + C.rMax;
      if (dd > R * R) continue;
      var e = r;
      for (var k = 0; k < C.lams.length; k++) if (C.lams[k] <= 2 * r) e += C.secs[bi].amp[k] * octave(ax, ay, C.lams[k], k);
      if (e > 0 && dd < e * e) return true;
    }
    return false;
  }
  function _islandOf(C, gx, gy) {
    var G = C.G, wl = new Float64Array(C.secs.length + 1);
    var ws = weightsAt(C, (gx + 0.5) * G, (gy + 0.5) * G, wl); if (ws <= 0) return null;
    var nm = ws > 1 ? ws : 1, dens = 0;
    for (var i = 0; i < C.secs.length; i++) if (wl[i] > 0 && C.secs[i].isl) dens += (wl[i] / nm) * C.secs[i].isl.dens;
    if (dens <= 0) return null;
    var h1 = hash(gx, gy, 5881), h2 = hash(gx, gy, 5882), h3 = hash(gx, gy, 5883), h4 = hash(gx, gy, 5884);
    if (h1 / 4294967296 >= dens * G * G) return null;
    var cx = (gx + h2 / 4294967296) * G, cy = (gy + h3 / 4294967296) * G;
    // 크기: 이 격자 중심에서 무게가 가장 큰 구간의 넓이 표(섞인 자리는 한쪽 표 — 섬 하나는 한 구간의 섬)
    var bi = -1, bw = 0; for (var i2 = 0; i2 < C.secs.length; i2++) if (wl[i2] > bw && C.secs[i2].isl) { bw = wl[i2]; bi = i2; }
    if (bi < 0) return null;
    var bins = C.secs[bi].isl.bins, u = (h4 & 0xffff) / 65536, v = (h4 >>> 16) / 65536, A = bins[bins.length - 1][1];
    for (var b = 0; b < bins.length; b++) if (u < bins[b][2]) { A = bins[b][0] + v * (bins[b][1] - bins[b][0]); break; }
    var r = Math.sqrt(A / Math.PI);
    // 존 안쪽 조건(섬 중심의 바다 존 거리) — 세계 좌표 함수라 두 존이 같은 답
    if (_seaDist(C, cx, cy) <= r + C.m) return null;
    return [cx, cy, r, bi];
  }
  function _seaDist(C, x, y) {
    var best = Infinity, O = C.oceans; if (!O) return best;
    for (var i = 0; i < O.length; i++) { var o = O[i];
      var nx = x < o.x0 ? o.x0 : (x > o.x1 ? o.x1 : x), ny = y < o.y0 ? o.y0 : (y > o.y1 ? o.y1 : y);
      var d2 = (x - nx) * (x - nx) + (y - ny) * (y - ny); if (d2 < best) best = d2; }
    return Math.sqrt(best);
  }

  // ── 존 하나의 띠 물칸(Set "tx_ty" · 생성기 정본 꼴 · 행 우선 순서 — zone.js 비트 창이 그 순서를 믿는다) ─────────
  //   zone: 존 사각 · tileSize: 32 · oceanRects: [{x0,y0,x1,y1}] · zones: id → 존(구간 상자·배수 유도용) ·
  //   oldDepth(bnx, bny): 지금 식의 깊이(부르는 쪽 — chunk.js / 00-const.js — 의 함수를 그대로 넘긴다 · 사본 0)
  function generate(zone, tileSize, oceanRects, zones, base, noise, oldDepth, opts) {
    var out = new Set();
    if (zone.isOcean || !oceanRects || !oceanRects.length) return out;
    var C = compile(zones, base, noise, opts);
    C.oceans = oceanRects; C.isl = null; C.bandK = (opts && opts.bandK) || null; C.bandShift = (opts && opts.bandShift) || null; C.mx2 = (base + noise) * (base + noise);
    C.keepPx = (opts && typeof opts.keepPx === 'number') ? opts.keepPx : null;   // ★[T604 추신3] 경계 앞 바다 지킴 폭(px · `HANDOFF_COMMIT`)
    for (var zi = 0; zi < C.kz.length; zi++) {
      var zq = C.kz[zi];
      if (_kOf(zq) !== 1 && !C.bandK) throw new Error('coast-shape: 배수 존(coastBandK) ' + (zq.id || zq.displayName || '?') + ' — opts.bandK(T591 배수 함수)를 넘겨야 한다');
      if (_sOf(zq) > 0 && !C.bandShift) throw new Error('coast-shape: 평행이동 존(coastShift) ' + (zq.id || zq.displayName || '?') + ' — opts.bandShift(T604 평행이동 함수)를 넘겨야 한다');
      if (_sOf(zq) > 0 && C.keepPx === null) throw new Error('coast-shape: 평행이동 존(coastShift) ' + (zq.id || zq.displayName || '?') + ' — opts.keepPx(경계 앞 바다 지킴 폭 = HANDOFF_COMMIT)를 넘겨야 한다');
    }
    var cols = Math.ceil(zone.zoneWidth / tileSize), rows = Math.ceil(zone.zoneHeight / tileSize);
    var W = cols + 2, Hh = rows + 2;                 // 한 칸 테두리(존 밖 이웃) 포함
    var raw = new Uint8Array(W * Hh);
    var w = new Float64Array(C.secs.length + 1);
    var maxD = C.maxD, any = false;
    for (var ty = -1; ty <= rows; ty++) {
      var absY = zone.worldOffsetY + ty * tileSize, distN = ty * tileSize, distS = (rows - 1 - ty) * tileSize;
      for (var tx = -1; tx <= cols; tx++) {
        var absX = zone.worldOffsetX + tx * tileSize, distW = tx * tileSize, distE = (cols - 1 - tx) * tileSize;
        if (Math.min(distW, distE, distN, distS) > maxD) continue;   // 변 근처가 아니면 뭍(지금 식과 같은 거르기)
        var r = rawAt(C, absX + tileSize / 2, absY + tileSize / 2, oceanRects, oldDepth, w);
        raw[(ty + 1) * W + (tx + 1)] = r; if (r >= 2) any = true;
      }
    }
    var fin = new Uint8Array(cols * rows);
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
      var v = raw[(y + 1) * W + (x + 1)], sea = (v === 1 || v === 2);
      if (v >= 2) {   // 구간 무게 칸만 1셀 돌기 뒤집기(4방 셋 이상이 반대편)
        var n = 0, c0 = (y + 1) * W + (x + 1);
        var nb = [raw[c0 - 1], raw[c0 + 1], raw[c0 - W], raw[c0 + W]];
        for (var q = 0; q < 4; q++) { var sv = (nb[q] === 1 || nb[q] === 2); if (sv !== sea) n++; }
        if (n >= 3) sea = !sea;
      }
      fin[y * cols + x] = sea ? (v >= 2 ? 2 : 1) : (v >= 2 ? 3 : 0);
    }
    if (any && !(opts && opts.keepPockets)) _fillPockets(fin, cols, rows);   // keepPockets: 자 전용(솔기 자가 존 사각에 기대는 메우기 없이 세계 좌표 몫만 견준다)
    for (var yy = 0; yy < rows; yy++) for (var xx = 0; xx < cols; xx++) {
      var f = fin[yy * cols + xx]; if (f === 1 || f === 2) out.add(xx + '_' + yy);
    }
    return out;
  }
  // 갇힌 바다 메우기 — 4방 덩이가 존 테두리에 안 닿고 구간 무게 칸(2)을 하나라도 품으면 뭍(3)
  function _fillPockets(fin, cols, rows) {
    var N = cols * rows, seen = new Uint8Array(N), stack = new Int32Array(N);
    var isSea = function (i) { var f = fin[i]; return f === 1 || f === 2; };
    var sp = 0;
    for (var x = 0; x < cols; x++) { if (isSea(x)) { seen[x] = 1; stack[sp++] = x; } var b = (rows - 1) * cols + x; if (isSea(b) && !seen[b]) { seen[b] = 1; stack[sp++] = b; } }
    for (var y = 0; y < rows; y++) { var l = y * cols, r = y * cols + cols - 1; if (isSea(l) && !seen[l]) { seen[l] = 1; stack[sp++] = l; } if (isSea(r) && !seen[r]) { seen[r] = 1; stack[sp++] = r; } }
    var flood = function () { while (sp > 0) { var i = stack[--sp], xi = i % cols, yi = (i - xi) / cols;
      if (xi > 0 && !seen[i - 1] && isSea(i - 1)) { seen[i - 1] = 1; stack[sp++] = i - 1; }
      if (xi < cols - 1 && !seen[i + 1] && isSea(i + 1)) { seen[i + 1] = 1; stack[sp++] = i + 1; }
      if (yi > 0 && !seen[i - cols] && isSea(i - cols)) { seen[i - cols] = 1; stack[sp++] = i - cols; }
      if (yi < rows - 1 && !seen[i + cols] && isSea(i + cols)) { seen[i + cols] = 1; stack[sp++] = i + cols; } } };
    flood();
    // 테두리에서 못 닿은 바다 = 갇힌 덩이 — 덩이마다 구간 칸이 있나 보고 메운다
    for (var s0 = 0; s0 < N; s0++) {
      if (seen[s0] || !isSea(s0)) continue;
      var comp = [], hasSec = false; seen[s0] = 1; stack[sp++] = s0;
      while (sp > 0) { var i2 = stack[--sp]; comp.push(i2); if (fin[i2] === 2) hasSec = true;
        var x2 = i2 % cols, y2 = (i2 - x2) / cols;
        if (x2 > 0 && !seen[i2 - 1] && isSea(i2 - 1)) { seen[i2 - 1] = 1; stack[sp++] = i2 - 1; }
        if (x2 < cols - 1 && !seen[i2 + 1] && isSea(i2 + 1)) { seen[i2 + 1] = 1; stack[sp++] = i2 + 1; }
        if (y2 > 0 && !seen[i2 - cols] && isSea(i2 - cols)) { seen[i2 - cols] = 1; stack[sp++] = i2 - cols; }
        if (y2 < rows - 1 && !seen[i2 + cols] && isSea(i2 + cols)) { seen[i2 + cols] = 1; stack[sp++] = i2 + cols; } }
      if (hasSec) for (var c = 0; c < comp.length; c++) fin[comp[c]] = 3;
    }
  }

  var API = { SECTIONS: SECTIONS, CHAR: CHAR, SCALE: SCALE, FINE_PX: FINE_PX, COARSE_PX: COARSE_PX, AMP_B: AMP_B, generate: generate, compile: compile, pow2: pow2, hash: hash, gnoise: gnoise,
    weightsAt: weightsAt, kOf: _kOf, sOf: _sOf, _active: _active, shiftDepth: shiftDepth };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.CoastShape = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
