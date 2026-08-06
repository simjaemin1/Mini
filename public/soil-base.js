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

  var API = { SOIL_MAX: SOIL_MAX, RUIN_SOIL: RUIN_SOIL, REGEN_PER_DAY: REGEN_PER_DAY, hash: hash, vnoise: vnoise, baseAt: baseAt, regen: regen };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.SoilBase = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
