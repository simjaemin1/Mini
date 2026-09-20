// =============================================================================
// 타일 지형 판정 메모 — 게임일 틱 멎음 수리 [2026-08-31 · 기본 꺼짐]
// =============================================================================
// ★왜 필요한가 (측정 근거, 로컬 18마을/607 NPC 재현):
//   V8 CPU 프로파일에서 멎은 구간의 95.5%가 `onGameTick`(villages.js:2586),
//   그 안의 76.7%가 생활층 `_lifeDaily` → 49.2%가 신축 터 탐색 `_lifeAddHouseSite`.
//   말단에서 시간을 쓴 건 A*(10.1%)가 아니라 `_pointToSegmentDist`(terrain.js:138) —
//   즉 **지형 통행 판정**이었다. 계수: 게임일 1일당 지형 질의 33,000~89,000회 ·
//   756~2,471ms(= 그날 멎음의 80% 이상). 1회 ≈ 50µs.
//
// ★왜 그렇게 비싼가:
//   `_isPointInRiver`는 bbox 조기기각 뒤 path 를 **선형 주사**한다. v7 스무딩으로
//   강 55개 4,241점·산맥 11개 2,140점이라, bbox 안에 든 점 하나가 수백 개 선분과
//   거리 계산을 한다. 그리고 같은 셀을 다시 물어도 처음부터 다시 센다 — 캐시가 없었다.
//   실측 재질문 비율: 한 게임일 안에서만 27~71%(날마다 같은 영토를 다시 훑으므로
//   날을 건너면 사실상 전부 재질문이다).
//
// ★왜 이 자리인가 (등가성의 근거):
//   zone.js 의 `isWaterTileLocal`/`isRockTileLocal`은 입력을 이미 타일로 양자화한 뒤
//   그 타일의 **중심 한 점**만 terrain 에 묻는다. 곧 `(tx, ty)` 의 순수 함수다.
//   지형 원천(terrain.js `_getZoneTerrain`)은 기동 시 1회 적재 후 런타임에 바뀌지 않는다
//   ⇒ 무효화 규약이 필요 없다.
//   ★terrain.js 안쪽(`isWaterCellLocal` 자체)에 걸면 안 된다: chunk.js:447 이 `x±D`
//     오프셋 점을, fishing.js 가 임의 점을 묻는다. 거기서 양자화하면 **답이 달라진다**.
//     그래서 캐시는 '이미 양자화된 두 호출자'에만 건다.
//
// ★기본 꺼짐: 원인은 확정됐지만 운영 켜기는 사용자 판단 몫(env TERRAIN_TILE_CACHE=1).
//   끄면 배열조차 만들지 않고 종전 경로를 그대로 탄다.

function makeTileCache(tilesW, tilesH) {
  // 한 타일당 4비트: bit0 물-계산됨 · bit1 물-값 · bit2 바위-계산됨 · bit3 바위-값
  const memo = new Uint8Array(tilesW * tilesH);
  let hitW = 0, missW = 0, hitR = 0, missR = 0;
  return {
    tilesW, tilesH, bytes: memo.length,
    water(tx, ty, compute) {
      const i = ty * tilesW + tx, m = memo[i];
      if (m & 1) { hitW++; return (m & 2) !== 0; }
      missW++;
      const v = compute();
      memo[i] = m | 1 | (v ? 2 : 0);
      return v;
    },
    rock(tx, ty, compute) {
      const i = ty * tilesW + tx, m = memo[i];
      if (m & 4) { hitR++; return (m & 8) !== 0; }
      missR++;
      const v = compute();
      memo[i] = m | 4 | (v ? 8 : 0);
      return v;
    },
    // ★★★[T333 2026-09-20] **상자 하나를 통째로 굽는다** — "처음 밟는 셀" 을 없앤다.
    //   T324 실측: 메모를 켠 뒤에도 틱의 17.9%가 지형에 남았고, 그 90%가 **적중 실패**였다
    //   (주민이 영토를 계속 새로 밟는다 — 마을당 영토 약 5,000셀 × 51마을).
    //   ⇒ 걷기 전에 그 상자를 미리 채운다. 계산하는 함수는 **그대로**이므로 값은 정의상 같다 —
    //     달라지는 것은 **언제 내느냐**뿐이다(런타임 산발 → 부팅 한 번).
    //   ⚠이미 계산된 칸은 건너뛴다(두 번 안 센다) · 격자 밖은 무시한다.
    prebake(tx0, ty0, tx1, ty1, computeWater, computeRock) {
      const x0 = Math.max(0, tx0 | 0), y0 = Math.max(0, ty0 | 0);
      const x1 = Math.min(tilesW - 1, tx1 | 0), y1 = Math.min(tilesH - 1, ty1 | 0);
      let baked = 0;
      for (let ty = y0; ty <= y1; ty++) {
        const row = ty * tilesW;
        for (let tx = x0; tx <= x1; tx++) {
          const i = row + tx, m = memo[i];
          if (!(m & 1)) { missW++; const v = computeWater(tx, ty); memo[i] |= 1 | (v ? 2 : 0); baked++; }
          if (!(memo[i] & 4)) { missR++; const v = computeRock(tx, ty); memo[i] |= 4 | (v ? 8 : 0); baked++; }
        }
      }
      return baked;
    },
    stats() {
      let filled = 0;
      for (let i = 0; i < memo.length; i++) if (memo[i]) filled++;
      return { hitW, missW, hitR, missR, filled,
               hitRate: (hitW + hitR) / Math.max(1, hitW + hitR + missW + missR) };
    },
    _memo: memo,   // 하네스 전용
  };
}

module.exports = { makeTileCache };
