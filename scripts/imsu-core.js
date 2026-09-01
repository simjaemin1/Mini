// === scripts/imsu-core.js — 임수(臨水) 판정 정본 [재민 확정 2026-09-01 · T14] ==========
//
// ★왜 이 파일이 생겼나 — **감사가 임수를 한 번도 재지 않고 있었다.**
//   `audit-village-forage.js` 의 ④ 식수 항목은 반경 안의 `water_pool` **개체**를 세는데,
//   `water_pool` 은 마을 어귀에 심은 둠벙만이 아니다: `chunk.pickResourceType` 이
//   **모든 biome 에서 굴림 상위 1~5%** 로 야생 물웅덩이를 깐다(plains 0.99↑ · forest 0.98↑ …).
//   ⇒ 지도 어디에 마을이 있든 반경 960px 안에 웅덩이 하나쯤은 걸리고, 그래서
//     **강에서 10.8km 떨어진 광산1 이 "식수 합격"으로 통과했다.**
//   그건 `인계/공통.md` §2 가 금지한 **자명 통과**다 — 자기가 못 떨어질 판정을 세워 놓고 합격이라 부른 것.
//
// ★그래서 항목을 **둘로 가른다**(기존 항목을 고치지 않는다 — 뜻이 다르다):
//     식수(飮水)  = 마실 것이 있는가.  야생 웅덩이도 센다. **기존 그대로** — 51/51 불변.
//     임수(臨水)  = **마을이 물가에 섰는가.**  야생 웅덩이는 **증거가 아니다**.
//                   인정하는 것 둘뿐: ⓐ 지형 민물(강·호수 = `terrain.isWaterCellLocal`)
//                                     ⓑ **마을 샘**(`groves` 로 심은 물 — seedKey `gv*`)
//
// ★바다는 임수가 아니다. 청동기 마을은 바닷물을 마시지 않는다.
//   바다 술어는 **자염 배치(T3)의 정본과 같은 식**이다 — 해안선 띠(`generateCoastlineWaterTiles`)이면서
//   강·호수가 아닌 칸(`zone.js isSeaTileLocal` 의 차집합). 사본이 아니라 같은 정의를 여기 한 번 적는다
//   (zone.js 를 적재하면 HTTP 서버가 같이 뜨므로 계측기는 그걸 못 부른다 — 그 제약 때문에 옮겨 적는다).
//
// 쓰는 곳 셋: `audit-village-forage.js`(감사) · `plan-village-forage.js`(처방) · `test-imsu.js`(하네스).
//   **셋이 같은 함수를 부른다** — 감사와 처방이 다른 셈을 쓰면 처방이 감사를 못 맞춘다(2026-08-29 가 그랬다).
'use strict';

const CELL = 32;
const MOVE_SPEED = 64;                                   // px/s — zone.js 정본과 같은 수(빈손 배수 1.0)

function walkSec() { return parseFloat(process.env.AUDIT_WALK_SEC || '15'); }
function radius() { return Math.round(MOVE_SPEED * walkSec()); }   // 960px = 30셀

// ── 정본 묶음 만들기 ─────────────────────────────────────────────────────────
//   deps: { ZID, ZONES, terrain, chunk } — 전부 호출측이 이미 require 한 정본을 넘긴다(재-require 금지).
function create(deps) {
  const { ZID, ZONES, terrain: T, chunk: CH } = deps;
  const Z = ZONES[ZID];
  const R = radius();

  const inBounds = (x, y) => x >= 0 && y >= 0 && x < Z.zoneWidth && y < Z.zoneHeight;
  const isFresh = (x, y) => T.isWaterCellLocal(ZID, x, y);

  // 바다 — 첫 호출에만 해안선 띠를 만든다(38만 타일 · 수 초). 안 물어보면 안 만든다.
  let _seaTiles = null;
  function seaTiles() {
    if (_seaTiles) return _seaTiles;
    const findZoneAt = (ax, ay) => {
      for (const [id, z] of Object.entries(ZONES)) {
        if (ax >= z.worldOffsetX && ax < z.worldOffsetX + z.zoneWidth &&
            ay >= z.worldOffsetY && ay < z.worldOffsetY + z.zoneHeight) return Object.assign({}, z, { id });
      }
      return null;
    };
    const oceanRects = Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({
      x0: z.worldOffsetX, y0: z.worldOffsetY,
      x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight,
    }));
    _seaTiles = CH.generateCoastlineWaterTiles(Object.assign({}, Z, { id: ZID }), CELL, findZoneAt, oceanRects);
    return _seaTiles;
  }
  // zone.js `isSeaTileLocal` 과 같은 식: 해안선 띠 ∧ ¬(강·호수). 강어귀는 민물이다.
  function isSea(x, y) {
    if (Z.isOcean) return true;
    if (!inBounds(x, y)) return false;
    const tx = Math.floor(x / CELL), ty = Math.floor(y / CELL);
    if (!seaTiles().has(`${tx}_${ty}`)) return false;
    return !isFresh(tx * CELL + CELL / 2, ty * CELL + CELL / 2);
  }

  // 링 스캔 최근접 — 각 반지름에서 원주를 셀 간격으로 훑는다(반지름이 크면 각도를 늘린다).
  //   ⚠48각 고정으로 훑으면 반지름 2,500px 에서 표본 간격이 327px 라 폭 100px 짜리 지류를 통째로 넘긴다.
  //     그래서 각도 수를 반지름에 비례시킨다 — 감사와 처방이 **같은 수**를 보게 하는 조건이다.
  function nearest(x0, y0, pred, maxR) {
    for (let r = CELL; r <= maxR; r += CELL) {
      const steps = Math.max(48, Math.round(2 * Math.PI * r / CELL));
      for (let a = 0; a < steps; a++) {
        const th = a * 2 * Math.PI / steps;
        const x = x0 + Math.cos(th) * r, y = y0 + Math.sin(th) * r;
        if (inBounds(x, y) && pred(x, y)) return r;
      }
    }
    return Infinity;
  }

  // 마을 샘 — `groves` 의 물 군락. 개체가 아니라 **데이터**를 본다(청크 생성 없이도 판정된다).
  //   군락은 중심에서 반경 r 안에 흩어지므로, 가장 가까운 점까지의 거리는 `dist(center) − r` 이상이다.
  //   ★보수적으로 **중심 거리**로 재지 않고 `max(0, dist − r)` 로 잰다 — 실체화된 개체와 같은 쪽으로 기운다.
  function groveWater() {
    const t = T.ZONE_TERRAIN ? T.ZONE_TERRAIN[ZID] : null;
    return ((t && t.groves) || []).filter((g) => g && g.center && (g.kind || 'berry_bush') === 'water_pool');
  }
  function nearestGroveWater(x0, y0, extra) {
    let best = Infinity;
    for (const g of groveWater().concat(extra || [])) {
      const d = Math.max(0, Math.hypot(g.center[0] - x0, g.center[1] - y0) - (g.r || 40));
      if (d < best) best = d;
    }
    return best;
  }

  // ── 임수 판정 ──────────────────────────────────────────────────────────────
  //   extraGroves: 아직 데이터에 안 적힌 후보 군락(처방 스크립트가 자기가 심을 것을 미리 세어 볼 때).
  function imsuOf(v, opts) {
    const o = opts || {};
    const far = o.far || 4000;
    const fresh = nearest(v.x, v.y, isFresh, far);
    const spring = nearestGroveWater(v.x, v.y, o.extraGroves);
    const sea = o.withSea ? nearest(v.x, v.y, isSea, far) : undefined;
    return {
      fresh, spring, sea,
      okFresh: fresh <= R,
      okSpring: spring <= R,
      ok: (fresh <= R) || (spring <= R),
    };
  }

  return { R, CELL, isFresh, isSea, nearest, groveWater, nearestGroveWater, imsuOf, inBounds };
}

module.exports = { create, radius, walkSec, CELL, MOVE_SPEED };
