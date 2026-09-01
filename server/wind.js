// === server/wind.js — 바람 노출 모델 ============================================
//
// ★★[재민 확정 2026-09-01 ④] 이 모듈이 있는 이유 한 줄:
//   **"같은 고도라도 능선은 골짜기보다 춥다."**
//   추위 2차가 고도 감률(−6.5℃/km)을 되살렸지만 이 세계의 산은 35m 고 바위 셀은 통행 불가라
//   `elevKmAt()` 이 **언제나 0** 이다(그건 거짓말이 아니라 세계의 사실이다 — `zone.js` 주석 참조).
//   ⇒ 고도가 아니라 **노출**로 산을 춥게 만든다. 둘은 **독립**이다: 감률은 그대로 두고
//     목표점에 항 **하나**를 더한다(`t *= 1 + KX·X`). 새 온도 곡선을 만들지 않는다.
//
// ★★★사본 금지 ★★★
//   · 계절은 econ `temperatureAt` 정본에서 **유도**한다(`weather.anchors()` 경유).
//     여기에 90/180/270/315/365 같은 날짜 상수를 적지 마라 — `weather.js` 와 같은 규약이고
//     `test-body ⑯㉠` 이 정규식으로 매번 못 박는다.
//   · 지형은 **주입**받는다(`bindTerrain`). 이 모듈은 산맥 좌표를 스스로 읽지 않는다 —
//     정본 술어(`zone.js isRockTileLocal` → `terrain.isRockCellLocal`)를 그대로 부른다.
//     (족보 ㊻: 계측기도 사본 금지. 지형을 직접 파싱한 스크립트가 광맥 362개를 놓친 전례가 있다.)
//
// ★★주사위 금지(`durango-consistency-principle`) — 바람은 **지형과 계절의 결정론 함수**다.
//   같은 셀·같은 날이면 언제 물어도 같은 값이다. 여기에 난수가 들어오면 그건 다른 모듈이다.
//
// ── 모델 ─────────────────────────────────────────────────────────────────────
//
// ★★§0 실측이 모델의 모양을 정했다 — 이 세계엔 **걸을 수 있는 능선이 없다.**
//   `hanbando-terrain.json` 에 높이맵이 없다(rivers/lakes/ridges/passes/forests/ores/villages/
//   valleys/groves — 스칼라 고도 필드가 아예 없다). 산맥은 폴리라인이고 그 안은 **통행 불가**,
//   고개(`passes`)는 한반도에 **0개**다. ⇒ 플레이어가 설 수 있는 자리는 전부 산기슭과 평지다.
//   ⇒ 그래서 "능선"을 지어내지 않는다. 이 세계에서 가장 노출된 걸을 수 있는 자리는
//     **풍상(風上) 산기슭** — 바람이 오는 쪽은 트여 있고 가는 쪽에 산이 선 자리다.
//     (걸을 수 있는 고지가 생기는 날, 고치는 것은 `zone.js elevKmAt` 하나다. 여기가 아니다.)
//
//   기울기 벡터를 높이맵 없이 낸다 — **두 개의 레이**로:
//     · 풍상이 트였는가  openUp   = 1 − (바람이 오는 쪽 레이의 바위 막힘)
//     · 풍하가 막혔는가  blockDn  =      (바람이 가는 쪽 레이의 바위 막힘)
//   두 값의 곱이 곧 "풍상 사면"이다. 부호가 저절로 맞는다:
//     평지        둘 다 트임 → blockDn 0        → X 0   ← ★기존 기준선이 여기서 보존된다
//     풍하 기슭   풍상이 막힘 → openUp  0        → X 0
//     골짜기      양쪽 다 막힘 → openUp 0        → X 0
//     풍상 기슭   풍상 트임 · 풍하 막힘          → X 큼
//   ⇒ **평지 = 0** 이 이 모델의 앵커다. 노출은 **더하기만** 한다. 그래서 추위 2차가 재 둔
//     "한겨울 야생 밤 옷 티어 계단"이 평지에서 **한 자리도 안 움직인다**(하네스가 확인한다).
//     골짜기를 평지보다 **따뜻하게** 하는 음(−)의 항은 넣지 않았다 — 그건 기준선 갱신을
//     동반하는 별도 판단이라 회부한다.
//
// ★계절 탁월풍(한반도 고증) — 겨울 북서 · 여름 남동.
//   두 방향은 **정확히 반대**라 각도 보간이 성립하지 않는다(어느 쪽으로 도는지가 정의되지 않는다).
//   ⇒ 방향이 아니라 **부호 붙은 세기** s(day) ∈ [−1, +1] 로 잇는다:
//     s=+1 최한일(북서풍 최대) · s=−1 최난일(남동풍 최대) · s=0 봄가을 중간(탁월풍 없음).
//   봄가을엔 세기가 0 을 지나므로 방향이 뒤집히는 순간의 X 도 0 이다 ⇒ **계단이 없다**.
//   그리고 s 는 econ 연주기 코사인 그 자체라 날짜 상수가 필요 없다.
//
// ★좌표계 — **북 = −y · 동 = +x**(화면 관례). 근거: `village-layout.js:277`
//   *"평지엔 강 방향이라는 개념이 없으므로 남북(0,1)을 결정론 폴백으로 쓴다"* — y 축이 남북이다.
//   한울대간이 (54400, 1500) 에서 남동으로 내려가는 것도 이 관례와 맞는다(백두대간 주향).
'use strict';

const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const _int = (k, d) => { const v = parseInt(process.env[k], 10); return Number.isFinite(v) ? v : d; };

const CFG = {
  // ── 레이 ────────────────────────────────────────────────────────────────
  //   REACH_PX: 산이 바람을 막아 준다고 보는 거리. 산맥 폭이 ~1,200px 이라 그 언저리.
  //   SAMPLES : 레이 표본 수. 가까운 표본에 가중(w_i = 1/i) — 코앞의 산이 더 막는다.
  REACH_PX: _num('WIND_REACH_PX', 1600),
  SAMPLES: _int('WIND_SAMPLES', 10),

  // ── 숲 ──────────────────────────────────────────────────────────────────
  //   `terrain.getForestMultiplier` 는 1.0(민둥) ~ 3.2(덕미수해) 를 낸다.
  //   FOREST_FULL 에서 숲 차폐가 최대(FOREST_W)가 된다.
  FOREST_W: _num('WIND_FOREST_W', 0.75),
  FOREST_FULL: _num('WIND_FOREST_FULL', 3.0),

  // ── 캐시 ────────────────────────────────────────────────────────────────
  CACHE_MAX: _int('WIND_CACHE_MAX', 200000),
};

// ── ★지형 주입구 — 이 모듈은 지형 파일을 직접 열지 않는다 ────────────────────
//   ctx: { isRock(x, y) → bool, forestMult(x, y) → 1.0.. }
//   못 물면 `available()` 이 false 가 되고 `exposureAt` 은 **0** 을 낸다
//   (= 노출 항이 통째로 1 이 되어 종전 동작 그대로다 — 없는 지형을 지어내지 않는다).
let _T = null;
function bindTerrain(ctx) {
  _T = (ctx && typeof ctx.isRock === 'function') ? ctx : null;
  _cache.clear();
  _sw = { k: null, v: 0 };
  return available();
}
function available() { return !!_T; }

// ── ★계절 탁월풍 — econ 기온 정본에서 유도(날짜 상수 0) ──────────────────────
let _W;
function _weather() {
  if (_W === undefined || _W === null) {
    try { _W = require('./weather'); } catch (e) { _W = false; }
  }
  return _W || null;
}
/**
 * 그날의 부호 붙은 탁월풍 세기. +1 = 한겨울 북서풍 최대 · −1 = 한여름 남동풍 최대 · 0 = 탁월풍 없음.
 * ★econ 연주기 코사인 그 자체다 — 최한일에 +1, 최난일에 −1 이 되도록 **정규화만** 한다.
 *   (그래서 여기에 315·365 가 없다. econ 이 위상을 바꾸면 바람도 따라간다.)
 */
//   ★한 틱의 모든 플레이어가 **같은 day** 를 묻는다 ⇒ 한 칸 메모로 적중률이 사실상 100%다
//     (`weather.outdoorCold` 의 메모와 같은 규약 — 순수 함수라 결과가 같다).
let _sw = { k: null, v: 0 };
function seasonWind(day) {
  if (_sw.k === day) return _sw.v;
  let out = 0;
  const W = _weather();
  const a = (W && W.available()) ? W.anchors() : null;
  if (a) {
    let E = null;
    try { E = require('../sim/economy-sim-v2.js'); } catch (e) { E = null; }
    if (E && typeof E.temperatureAt === 'function') {
      const T = (d) => E.temperatureAt(d, null, 0);      // 그날의 **일평균** ℃(고도 0)
      const tw = T(a.winterMid), ts = T(a.summerMid);
      const half = (ts - tw) / 2;
      if (half > 0) {
        const mid = (ts + tw) / 2;
        out = Math.max(-1, Math.min(1, (mid - T(day)) / half));   // 최한 +1 · 최난 −1
      }
    }
  }
  _sw = { k: day, v: out };
  return out;
}
/** 그날의 바람 벡터(화면 좌표 · 북=−y). 겨울(s>0)엔 북서에서 불어 **남동으로** 간다. */
function windVec(day) {
  const s = seasonWind(day);
  const k = s / Math.SQRT2;
  return { x: k, y: k, s, strength: Math.abs(s) };        // s>0 → (+,+) = 남동향 = 북서풍
}

// ── ★레이 막힘 — 그 방향으로 바위가 얼마나 서 있는가(0 트임 … 1 꽉 막힘) ────
//   가중치 w_i = 1/i. 정규화하므로 표본 수를 바꿔도 스케일이 안 흔들린다.
//   ⚠지도 밖은 **트인 것**으로 센다(존 경계 너머는 바다·다른 존이지 벽이 아니다).
function _blockage(x, y, dx, dy) {
  const N = Math.max(1, CFG.SAMPLES), step = CFG.REACH_PX / N;
  let num = 0, den = 0;
  for (let i = 1; i <= N; i++) {
    const w = 1 / i;
    den += w;
    if (_T.isRock(x + dx * step * i, y + dy * step * i)) num += w;
  }
  return den > 0 ? num / den : 0;
}

// ── ★셀 캐시 — 계절과 무관한 몫만 담는다(틱 비용 0) ──────────────────────────
//   ★탁월풍 축이 **하나**(북서↔남동)라 방향별 표본이 딱 둘이면 된다.
//     방향이 연속 회전하는 모델로 바뀌는 날엔 여기에 방향 빈(bin)을 늘려라 —
//     그때도 시즌 항은 질의 시각에 곱하는 것이 규약이다.
//   담는 것: bNW(북서 레이 막힘) · bSE(남동 레이 막힘) · fsh(숲 차폐 0..1).
const _cache = new Map();
let _hit = 0, _miss = 0, _usec = 0;
const _NW = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };   // 북서 = (−x, −y)
const _SE = { x: Math.SQRT1_2, y: Math.SQRT1_2 };

function cellTerms(tx, ty) {
  const key = ty * 65536 + tx;
  const c = _cache.get(key);
  if (c) { _hit++; return c; }
  _miss++;
  const t0 = process.hrtime.bigint();
  const x = tx * 32 + 16, y = ty * 32 + 16;
  const bNW = _blockage(x, y, _NW.x, _NW.y);
  const bSE = _blockage(x, y, _SE.x, _SE.y);
  let fm = 1;
  try { fm = (_T.forestMult ? _T.forestMult(x, y) : 1) || 1; } catch (e) { fm = 1; }
  const fsh = Math.max(0, Math.min(1, (fm - 1) / Math.max(1e-6, CFG.FOREST_FULL - 1)));
  const v = { bNW: +bNW.toFixed(4), bSE: +bSE.toFixed(4), fsh: +fsh.toFixed(4) };
  _usec += Number(process.hrtime.bigint() - t0) / 1000;
  if (_cache.size >= CFG.CACHE_MAX) _cache.clear();      // 지형은 불변이라 통째로 버려도 안전하다
  _cache.set(key, v);
  return v;
}

/**
 * 그 자리·그 날의 **바람 노출도** X ∈ [0, 1].
 *   X = |s| · 풍상 트임 · 풍하 막힘 · (1 − 숲 차폐) · (1 − 마을 완충)
 *
 * ★마을은 **기존 완충 하나가 소유한다**(이중 적용 금지 — 지시 ④).
 *   여기서 마을은 감액을 새로 만들지 않고 **노출을 사그라들게** 할 뿐이다:
 *   마을 한복판에서 X→0 이면 노출 항은 정확히 1(=무영향)이 되고, 추위를 깎는 일은
 *   종전 `COLD_VILLAGE_SHELTER` 한 곳이 계속 혼자 한다.
 *
 * @param {number} x, y   존 지역 좌표(px)
 * @param {number} day    게임일
 * @param {number} shelter 마을 완충 0..1 (`SimVillages.shelterAt`)
 */
function exposureAt(x, y, day, shelter) {
  if (!_T || !Number.isFinite(day)) return 0;
  const w = windVec(day);
  if (!(w.strength > 0)) return 0;                       // 봄가을 한가운데 = 탁월풍 없음
  const t = cellTerms(Math.floor(x / 32), Math.floor(y / 32));
  // 겨울(s>0): 북서에서 온다 ⇒ 풍상 = NW · 풍하 = SE. 여름(s<0)은 정확히 뒤집힌다.
  const bUp = w.s > 0 ? t.bNW : t.bSE;
  const bDn = w.s > 0 ? t.bSE : t.bNW;
  const openUp = 1 - bUp;
  const sh = Math.max(0, Math.min(1, Number(shelter) || 0));
  const x0 = w.strength * openUp * bDn
    * (1 - CFG.FOREST_W * t.fsh)
    * (1 - sh);
  return +Math.max(0, Math.min(1, x0)).toFixed(4);
}

/** 진단용 분해 — 하네스·`/perf` 가 "왜 이 값인지"를 물을 수 있어야 한다. */
function explain(x, y, day, shelter) {
  const w = windVec(day);
  const t = _T ? cellTerms(Math.floor(x / 32), Math.floor(y / 32)) : { bNW: 0, bSE: 0, fsh: 0 };
  return {
    s: +w.s.toFixed(4), strength: +w.strength.toFixed(4),
    bNW: t.bNW, bSE: t.bSE, fsh: t.fsh,
    openUp: +(1 - (w.s > 0 ? t.bNW : t.bSE)).toFixed(4),
    blockDn: w.s > 0 ? t.bSE : t.bNW,
    shelter: +(Number(shelter) || 0).toFixed(4),
    X: exposureAt(x, y, day, shelter),
  };
}

function stats() {
  return { size: _cache.size, hit: _hit, miss: _miss,
    hitRate: +(_hit / Math.max(1, _hit + _miss)).toFixed(4),
    usecPerMiss: +(_usec / Math.max(1, _miss)).toFixed(1) };
}
function _reset() { _cache.clear(); _hit = 0; _miss = 0; _usec = 0; _sw = { k: null, v: 0 }; }

module.exports = { CFG, bindTerrain, available, seasonWind, windVec, exposureAt, explain, stats, _reset, _internals: { _blockage, cellTerms } };
