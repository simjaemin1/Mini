// =============================================================================
// public/soil-base.js — 정적 지형 파생 **기준 토양치**(서버·클라 공용 1부) [배치 20 B]
//
// ★사본 금지: 서버는 `require('../public/soil-base.js')` 로 **이 파일 자체**를 읽는다.
//   기준값이 두 벌이면 서버의 "만땅 회복 → 레코드 삭제" 판정과 클라가 그리는 그림이
//   어긋난다(행은 지워졌는데 화면은 파인 채로 남거나, 그 반대).
//
// ★지형 데이터 무접촉: 이 파일은 `hanbando-terrain.json` 도 `terrain.js` 도 읽지 않는다.
//   호출자가 **이미 정본으로 판정한** 지형 종류(kind)만 넘긴다. 그래서 이 파일이 바뀌어도
//   콜라이더·자원 스폰·econ 기준선은 한 비트도 움직이지 않는다.
//
// 좌표는 셀(1셀 = 32 world px). 값역 0..1000(SOIL_MAX) — mined_cells.prosperity 와 같은 눈금.
// =============================================================================
(function (root) {
  'use strict';

  var SOIL_MAX = 1000;
  var RUIN_SOIL = 800;        // ★재민 확정: 산 파괴 셀은 토양치 800 에서 시작한다
  var REGEN_PER_DAY = 12;     // 리젠 — 게임일당 회복량(파인 셀이 기준선까지 돌아오는 속도)

  // 셀 해시 — client.js `_cellHash` · mock-fertility-gradient 시안과 **같은 상수**(문법 통일)
  function hash(cx, cy, salt) {
    var h = (Math.imul(cx | 0, 374761393) + Math.imul(cy | 0, 668265263) + Math.imul(salt | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // 64칸 격자 값 노이즈 — 이웃 셀이 상관되어야 **뙈기**로 번진다(셀마다 독립이면 소금후추).
  //   시안 정본(mock-fertility-gradient.js)의 vnoise 와 동일 구조·동일 시드(777).
  var NG = 64, _lat = null;
  function _lattice() {
    if (_lat) return _lat;
    _lat = new Float32Array(NG * NG);
    for (var j = 0; j < NG; j++) for (var i = 0; i < NG; i++) _lat[j * NG + i] = hash(i, j, 777);
    return _lat;
  }
  function vnoise(u, v) {
    var L = _lattice();
    u = ((u % NG) + NG) % NG; v = ((v % NG) + NG) % NG;
    var i0 = u | 0, j0 = v | 0, i1 = (i0 + 1) % NG, j1 = (j0 + 1) % NG, fu = u - i0, fv = v - j0;
    var su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
    var a = L[j0 * NG + i0], b = L[j0 * NG + i1], c = L[j1 * NG + i0], d = L[j1 * NG + i1];
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  }

  // 기준 토양치 — kind: 'water' | 'rock' | 'land'
  //   · water : 0    (물밑은 진흙 — 식생 축이 없다)
  //   · rock  : 낮음 (암반. 산터 램프의 바닥값 — 여기서 이끼가 시작한다)
  //   · land  : 620~950 저주파 얼룩 — **대부분은 풀밭이되 균질하지 않다**.
  //     ★값역을 이렇게 높게 둔 이유: 이 값이 곧 지금 라이브의 기본 그림이다. 아래로 넓게
  //       잡으면 손 안 댄 세계가 통째로 메마른 땅이 된다(디자인 변경이 아니라 사고).
  function baseAt(kind, cx, cy) {
    if (kind === 'water') return 0;
    if (kind === 'rock') return 90 + 90 * vnoise(cx / 6.5 + 311, cy / 6.5 + 97);
    var lo = vnoise(cx / 11.0, cy / 11.0);            // 저주파 — 들판 규모의 비옥/척박
    var hi = vnoise(cx / 3.3 + 53, cy / 3.3 + 17);    // 고주파 — 뙈기 가장자리를 뜯는다
    var v = 620 + 330 * lo + 60 * (hi - 0.5);
    return v < 0 ? 0 : (v > SOIL_MAX ? SOIL_MAX : v);
  }

  // 접근 시 게으른 리젠(roads.js `_get` 과 같은 사고방식 — 일괄 패스 금지).
  //   기준선을 넘겨받아 **위로만** 회복한다. 반환 ≥ base 면 호출자가 레코드를 지운다(희소 유지).
  function regen(v, days, base) {
    if (days <= 0) return v;
    var n = v + REGEN_PER_DAY * days;
    return n > base ? base : n;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 바이옴 × 지질 램프 표 — "비옥도가 그 땅에서 **무엇으로 보이는가**"
  //
  // ★존마다 groundColor/tintColor 는 이미 다르다(색조). 여기서 정하는 건 그게 아니라
  //   **비옥도 축이 식생으로 번역되는 방식**이다. 같은 토양치 800 이라도
  //   정글이면 빽빽한 초록, 사바나면 마른 풀, 사막이면 여전히 모래여야 한다.
  //
  // 항목:
  //   dry  [a,b] : 마른 흙이 드러나기 시작/가득 차는 토양치(낮을수록 빨리 메마른다)
  //   grass[a,b] : 풀이 돋기 시작/가득 차는 토양치(높을수록 풀 되기 어렵다)
  //   capG       : 풀 알파 **상한** — 이 바이옴에서 아무리 비옥해도 넘지 않는 초록
  //                (사막이 토양치 1000 이라고 초원이 되면 안 된다 — 산터 램프와 같은 사고)
  //   tint/tintA : 램프 층 위에 얹는 바이옴 색조(존 groundColor 와 별개의 식생 색)
  //   propG      : 풀포기 색 3종 · propR : 자갈 색
  //   rock [a,b] : 산터(암반) 위 이끼가 시작/가득 차는 토양치
  //
  // ⚠한반도(forest)만 라이브다. 나머지는 실게임에서 볼 수 없으므로 시안 대조표
  //   (`scripts/mock-biome-ramps.js`)로 판단받아야 한다 — 눈으로 못 본 값을 확정하지 마라.
  var BIOME = {
    // ★forest 는 **라이브 존(한반도)** 이다. 문턱·색을 배치 19~21 이 검증한 값 그대로 두고
    //   식생 색조도 0 으로 둔다 ⇒ 이 표를 들여도 **라이브 그림은 픽셀 단위로 안 바뀐다.**
    //   (존 groundColor/tintColor 가 이미 그 몫을 하고 있다. 검증된 그림을 뜻 없이 흔들지 않는다.)
    forest:      { dry: [120, 620], grass: [430, 980], capG: 1.00, tint: '#6f8a4a', tintA: 0.00,
                   propG: ['#4e7a3c', '#5d8a46', '#6b8f4e'], propR: '#7a7268', rock: [400, 950] },
    plains:      { dry: [160, 660], grass: [380, 900], capG: 0.95, tint: '#8a8a52', tintA: 0.12,
                   propG: ['#6b8f4e', '#7d9450', '#8a9a58'], propR: '#8a8070', rock: [430, 960] },
    jungle:      { dry: [40, 380],  grass: [250, 780], capG: 1.00, tint: '#2f6a28', tintA: 0.20,
                   propG: ['#2f6a28', '#3d7a30', '#4a8a38'], propR: '#5e6a52', rock: [250, 700] },
    savanna:     { dry: [260, 780], grass: [600, 1000], capG: 0.62, tint: '#a2965a', tintA: 0.16,
                   propG: ['#8a8a52', '#9a9058', '#a89a60'], propR: '#9a8e74', rock: [520, 990] },
    taiga:       { dry: [140, 640], grass: [450, 950], capG: 0.88, tint: '#4a6a42', tintA: 0.14,
                   propG: ['#3d6a38', '#4a7a42', '#587a48'], propR: '#6e7268', rock: [360, 880] },
    tundra:      { dry: [200, 700], grass: [700, 1000], capG: 0.48, tint: '#7a8a80', tintA: 0.16,
                   propG: ['#6a8a70', '#7a9078', '#88968a'], propR: '#8a9090', rock: [300, 820] },
    desert:      { dry: [0, 220],   grass: [880, 1000], capG: 0.22, tint: '#c9ad72', tintA: 0.18,
                   propG: ['#9a9a5a', '#a8a068', '#b0a870'], propR: '#c0ab80', rock: [820, 1000] },
    mountain:    { dry: [180, 700], grass: [600, 980], capG: 0.72, tint: '#6a7a52', tintA: 0.12,
                   propG: ['#5a7a48', '#688050', '#748a58'], propR: '#7e7a72', rock: [380, 900] },
    archipelago: { dry: [120, 600], grass: [420, 940], capG: 0.92, tint: '#4a8a5a', tintA: 0.14,
                   propG: ['#3f8a52', '#4d9058', '#5c9862'], propR: '#a09880', rock: [420, 940] },
    // 바다 존은 지면이 거의 없다(isOcean) — 자리만 두되 뭍이 나오면 도서 규칙을 쓴다.
    ocean:       { dry: [120, 600], grass: [420, 940], capG: 0.92, tint: '#4a8a5a', tintA: 0.14,
                   propG: ['#3f8a52', '#4d9058', '#5c9862'], propR: '#a09880', rock: [420, 940] },
  };
  function biomeOf(name) { return BIOME[name] || BIOME.forest; }

  var API = { SOIL_MAX: SOIL_MAX, RUIN_SOIL: RUIN_SOIL, REGEN_PER_DAY: REGEN_PER_DAY, hash: hash, vnoise: vnoise, baseAt: baseAt, regen: regen, BIOME: BIOME, biomeOf: biomeOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.SoilBase = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
