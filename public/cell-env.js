// === public/cell-env.js — 물 · 바위 칸의 **상자 거름**(T947 · 클라 렌더 쪽 · 정본 술어는 안 건드린다) ===============================
//
// ★왜 [T947 2026-10-27] — 첫 그림(T920 `_ld` welcome 처리 끝 → 첫 render) 안의 물 · 바위 **첫 조회**(칸 캐시에 없던 칸)는
//   정본 술어(`Terrain.isWaterCellLocal` · `isRockCellLocal`)가 칸마다 피처 선분을 훑어 낸다(보고/T947 §1 — 첫 그림 다음 1위).
//   술어는 콜라이더 정본이라 **느리다고 고치지 않는다**(인계/R1 "하지 말 것" · 배치 20 B · 10-r1-terrain `_mt3RockC` 주석)
//   ⇒ **덜 부른다**: 답이 거짓으로 정해진 칸은 정본을 부르지 않는다.
//
// ★무엇이 "거짓으로 정해진 칸"인가 — 정본 술어가 참을 낼 수 있는 곳을 **넉넉히 덮는 상자**들 밖의 칸이다.
//   · 물(`isWaterCellLocal`) = 호수 ∪ 강 ∪ 경계 이웃 존의 물(`t.seam.water` — 질의점을 이웃 로컬로 옮겨 묻는 그것).
//       호수 — `_isPointInLake` 의 조기 기각 상자 그대로(원 · 타원 · 여러 원: 중심 ± 반경 × 1.3 · 타원은 긴 반지름 × 1.3) + 1.
//       강 — 선분마다 두 끝점 상자 + 두 끝 폭 중 큰 쪽의 반 + 1(정본 `_bbox` 여유와 같은 꼴). 참은 "어떤 선분에서 반폭 안"이고
//            반폭은 두 끝 폭 사이 값이라 그 상자 밖 점은 그 선분으로 참이 될 수 없다.
//   · 바위(`isRockCellLocal`) = 능선 안(`inRidge`)일 때만 참이 될 수 있다 — 능선(제 것 + `t.seam.ridges`) 선분 상자 밖이면 거짓.
//   두 겹으로 본다(정본과 같은 차례): ① 피처 상자(마디 상자 + 가장 넓은 폭의 반 + 1 — 정본 `_bbox` 와 같은 식 · 선분 상자를 다 덮는다)
//   ② 그 안이면 그 피처의 선분 상자 — 선분 상자는 **처음 그 피처 상자 안을 물을 때** 짓는다(첫 그림이 피처 전부를 짓지 않게 ·
//   격자 칸 한 변 = 부르는 쪽이 주는 수 — 클라는 배치 20 B 강 구간 색인 `_segGrid.B` · `_buildSegGrid` 와 같은 등록).
//   상자는 존 로컬 px 로 적는다(이웃 것은 이웃 로컬 상자 − (dx, dy)). 여유 + 1 은 정본 `_bbox` 의 것 · 반올림(≪ 1px)을 덮는다. 새 수 0.
//   ⚠정본(terrain.js `_isPointInLake` · `_isPointInRiver` · `isWaterCellLocal` · `isRockCellLocal`)의 모양이 바뀌면 이 상자도 따라
//     바꿔야 한다 — 같은 값 자 `scripts/t947-cell-box-eq.js`(존 칸 전부 · 정본과 견줌)가 그 갈림을 잡는다.
//   ⚠자료에 수 아닌 값 · 유한하지 않은 상자(폭 Infinity 등)가 하나라도 있으면 그 갈래(물 · 바위)는 **늘 "모름"**(정본을 부른다) — 값이 갈릴 틈을 두지 않는다.
//
// 쓰는 법(클라 00-const `isWaterAtAbs` · `isRockAtAbs` — 손잡이 `T947_CELL_BOX` 켬일 때만 · ★T961 켬 기본 · 되돌림 `=0`):
//   const env = CellEnv.build(Terrain.ZONE_TERRAIN[zid], B);   // 지형 객체가 바뀌면 다시 짓는다
//   CellEnv.maybeWater(env, lx, ly) === false  ⇒  isWaterCellLocal(zid, lx, ly) === false   (참이면 정본을 부른다)
//   CellEnv.maybeRock(env, lx, ly)  === false  ⇒  isRockCellLocal(zid, lx, ly)  === false
(function () {
  'use strict';
  const K = 65536, OFF = 32768;   // 격자 칸 열쇠 = (gx + OFF) · K + (gy + OFF) — 정수 하나(문자열을 안 짓는다)
  const _num = (v) => typeof v === 'number';
  const _fin = (a, b, c, d) => isFinite(a) && isFinite(b) && isFinite(c) && isFinite(d);
  // 피처 하나(강 · 능선 — 정본 `_isPointInRiver` 의 좌표 · 폭 읽기 그대로) — 피처 상자만 먼저(선분 상자는 나중)
  //   돌려주는 값: null = 참이 될 수 없는 피처(마디 둘 미만 · 수가 다 NaN) · false = 상자를 못 짓는 자료("모름") · 그 밖 = 피처
  function _pathFeat(f, dx, dy) {
    const P = f && f.path;
    if (!P || P.length < 2) return null;   // 정본: 마디 둘 미만이면 거짓
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, mw = -Infinity;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const x = p.pos ? p.pos[0] : p[0], y = p.pos ? p.pos[1] : p[1];
      const w = (p.width != null) ? p.width : (f.width || 200);
      if (!_num(x) || !_num(y) || !_num(w)) return false;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (w > mw) mw = w;
    }
    if (!(x0 <= x1 && y0 <= y1 && mw === mw && mw > -Infinity)) return null;   // 좌표 · 폭이 다 NaN — 어느 선분도 참이 못 된다
    const m = mw / 2 + 1;
    const bx = [x0 - m - dx, x1 + m - dx, y0 - m - dy, y1 + m - dy];
    if (!_fin(bx[0], bx[1], bx[2], bx[3])) return false;
    if (bx[0] > bx[1] || bx[2] > bx[3]) return null;   // 폭이 음수라 뒤집힌 상자 — 반폭 < 0 이면 정본도 참이 못 된다
    return { box: bx, f, dx, dy, G: null };
  }
  // 피처의 선분 상자 격자(처음 피처 상자 안을 물을 때 한 번)
  function _segGrid(F, B) {
    const P = F.f.path, f = F.f, dx = F.dx, dy = F.dy, X = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p1 = P[i], p2 = P[i + 1];
      const x1 = p1.pos ? p1.pos[0] : p1[0], y1 = p1.pos ? p1.pos[1] : p1[1];
      const x2 = p2.pos ? p2.pos[0] : p2[0], y2 = p2.pos ? p2.pos[1] : p2[1];
      const w1 = (p1.width != null) ? p1.width : (f.width || 200);
      const w2 = (p2.width != null) ? p2.width : (f.width || 200);
      if (w1 !== w1 || w2 !== w2 || x1 !== x1 || y1 !== y1 || x2 !== x2 || y2 !== y2) continue;   // NaN 이 낀 선분은 정본에서도 참이 못 된다(거리 · 반폭 NaN)
      const m = (w1 > w2 ? w1 : w2) / 2 + 1;
      const a = (x1 < x2 ? x1 : x2) - m - dx, b = (x1 < x2 ? x2 : x1) + m - dx, c = (y1 < y2 ? y1 : y2) - m - dy, d = (y1 < y2 ? y2 : y1) + m - dy;
      if (a > b || c > d) continue;   // 뒤집힌 상자(반폭 < 0) — 참이 못 된다
      X.push(a, b, c, d);             // 유한함은 피처 상자가 이미 보였다(선분 상자 ⊂ 피처 상자)
    }
    const map = new Map(), n = X.length / 4, XA = new Float64Array(X);
    for (let i = 0; i < n; i++) {
      const gx0 = Math.floor(XA[4 * i] / B), gx1 = Math.floor(XA[4 * i + 1] / B), gy0 = Math.floor(XA[4 * i + 2] / B), gy1 = Math.floor(XA[4 * i + 3] / B);
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
        const k = (gx + OFF) * K + (gy + OFF);
        let arr = map.get(k); if (!arr) map.set(k, arr = []); arr.push(i);
      }
    }
    return { X: XA, map, n };
  }
  // 호수 — 정본 `_isPointInLake` 의 조기 기각 상자(이 상자 밖이면 정본이 바로 거짓을 낸다) · 상자 몇 개뿐이라 격자 없이 본다
  function _lakeFeat(L, dx, dy) {
    if (!L) return false;
    const bx = [];
    const one = (c, R) => {
      if (!c || !_num(c[0]) || !_num(c[1]) || !_num(R)) return false;
      if (R !== R || c[0] !== c[0] || c[1] !== c[1]) return true;   // NaN — 정본 비교가 다 거짓이라 참이 못 된다
      const a = c[0] - R - 1 - dx, b = c[0] + R + 1 - dx, e = c[1] - R - 1 - dy, g = c[1] + R + 1 - dy;
      if (!_fin(a, b, e, g)) return false;
      if (a <= b && e <= g) bx.push(a, b, e, g);   // 뒤집힌 상자(반경 < −1/1.3) — 정본은 늘 기각한다
      return true;
    };
    if (L.shape === 'multi') {
      if (!L.circles || typeof L.circles[Symbol.iterator] !== 'function') return false;
      for (const c of L.circles) { if (!c || !one(c.center, c.radius * 1.3)) return false; }
    } else if (L.shape === 'ellipse') { if (!one(L.center, (L.a > L.b ? L.a : L.b) * 1.3)) return false; }
    else if (!one(L.center, L.radius * 1.3)) return false;
    if (!bx.length) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < bx.length; i += 4) { if (bx[i] < x0) x0 = bx[i]; if (bx[i + 1] > x1) x1 = bx[i + 1]; if (bx[i + 2] < y0) y0 = bx[i + 2]; if (bx[i + 3] > y1) y1 = bx[i + 3]; }
    return { box: [x0, x1, y0, y1], lake: bx };
  }
  function _kind(list) {   // list: [{ feat: 결과 }] → { feats } 또는 null(모름)
    const feats = [];
    for (const F of list) { if (F === false) return null; if (F) feats.push(F); }
    return { feats, built: 0 };
  }
  function build(t, B) {
    const env = { B, w: null, r: null };
    if (!t || !(B > 0)) return env;
    const seam = (t.seam) || {};
    // ⚠이웃 것은 질의점에 (dx, dy) 를 더해 이웃 로컬로 묻는다 ⇒ 이 존 로컬 상자 = 이웃 상자 − (dx, dy).
    //   자료가 이상해 짓다 던지면(정본도 그 자리에서 던질 자료) 그 갈래는 "모름" — 정본을 그대로 부른다.
    try {
      const L = [];
      for (const lk of (t.lakes || [])) L.push(_lakeFeat(lk, 0, 0));
      for (const f of (t.rivers || [])) L.push(_pathFeat(f, 0, 0));
      for (const s of (seam.water || [])) L.push(s.lake ? _lakeFeat(s.f, s.dx, s.dy) : _pathFeat(s.f, s.dx, s.dy));
      env.w = _kind(L);
    } catch (e) { env.w = null; }
    try {
      const L = [];
      for (const f of (t.ridges || [])) L.push(_pathFeat(f, 0, 0));
      for (const s of (seam.ridges || [])) L.push(_pathFeat(s.f, s.dx, s.dy));
      env.r = _kind(L);
    } catch (e) { env.r = null; }
    return env;
  }
  function _maybe(Kd, B, x, y) {
    if (!Kd) return true;                               // 모름 — 정본을 부른다
    if (!(x === x && y === y)) return true;
    const fs = Kd.feats;
    for (let i = 0; i < fs.length; i++) {
      const F = fs[i], b = F.box;
      if (x < b[0] || x > b[1] || y < b[2] || y > b[3]) continue;   // 피처 상자 밖
      if (F.lake) { const L = F.lake; for (let j = 0; j < L.length; j += 4) if (x >= L[j] && x <= L[j + 1] && y >= L[j + 2] && y <= L[j + 3]) return true; continue; }
      let G = F.G; if (!G) { try { G = F.G = _segGrid(F, B); Kd.built++; } catch (e) { return true; } }
      const a = G.map.get((Math.floor(x / B) + OFF) * K + (Math.floor(y / B) + OFF));
      if (!a) continue;
      const X = G.X;
      for (let j = 0; j < a.length; j++) { const q = a[j] * 4; if (x >= X[q] && x <= X[q + 1] && y >= X[q + 2] && y <= X[q + 3]) return true; }
    }
    return false;
  }
  // 거짓 = 정본이 거짓을 낼 칸(정본을 안 불러도 된다) · 참 = 모름(정본을 부른다)
  function maybeWater(env, x, y) { return _maybe(env.w, env.B, x, y); }
  function maybeRock(env, x, y) { return _maybe(env.r, env.B, x, y); }
  function stats(env) {
    const s = (Kd) => (Kd ? { feats: Kd.feats.length, built: Kd.built, boxes: Kd.feats.reduce((a, F) => a + (F.G ? F.G.n : (F.lake ? F.lake.length / 4 : 0)), 0) } : null);
    return { B: env.B, w: s(env.w), r: s(env.r) };
  }
  const API = { build, maybeWater, maybeRock, stats };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.CellEnv = API;
})();
