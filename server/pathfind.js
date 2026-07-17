// === server/pathfind.js — 로컬 A* pathfinding (탐색 본체 = sim/path-core.js 정본 위임) ===
// Phase 14.49-b → ★[경로 통일 2026-07-17, 사용자 지시 "무조건 통일"] 자체 A*(맨해튼 — 동률이 계단로 갈라짐)를
//   랩·서버 공용 정본 path-core.localPath로 교체. 길이는 동일 최단, 동률 해소만 ★직선 편향(랩 bfsPath와 동일 모양)으로 통일.
// 계약 유지(호출측 무변):
//   32px cell grid. NPC 주변 searchRadiusCells(기본 64) 범위 안에서만 탐색.
//   walkability: 같은 cell 안 이동 항상 가능(wall은 edge에만) · 인접 cell 이동 = isBlockedFn(edge 판정)+isWaterFn.
//   결과: waypoint 배열 [{x,y}] (cell 중심 좌표, 첫 웨이포인트=현재 셀 제거, 마지막은 실제 endX/Y). 실패 null.
//   4방향(대각 벽 edge 판정 복잡 — 기존 TODO 동결. 대각 이동감은 호출측 직선 보간이 담당).
// 신규(선택): opts.isBridgeFn(x,y) — ★통일 규칙 "물=차단+다리 칸만 통행"(다리는 맵에 만들어두는 사물).
//   물이라도 다리면 통행. 미제공 = 기존과 완전 동일(현재 zone.js는 미주입 — 다리 층 생기면 주입).

const CELL = 32; // BUILDING_SIZE와 동일
const PathCore = require('../sim/path-core.js');

// A* — startX/Y, endX/Y는 픽셀 좌표
// opts: { floor, isBlockedFn(oldX,oldY,newX,newY,floor), isWaterFn(x,y), isBridgeFn(x,y)?, maxCells=4096, searchRadiusCells=64 }
// 반환: 성공 시 [{x,y}] 배열 (waypoint 픽셀 좌표), 실패 시 null
function findPath(startX, startY, endX, endY, opts = {}) {
  const isBlocked = opts.isBlockedFn || (() => false);
  const isWater = opts.isWaterFn || (() => false);
  const isBridge = opts.isBridgeFn || null;
  const preferFn = opts.preferFn || null;   // (x,y px)→길 등급(>0=길) — ★답압 수렴(랩 동형, 등거리 대안이 길로 스냅). 미주입=무효과.
  const floor = opts.floor || 0;
  const maxCells = opts.maxCells || 4096;
  const searchRadius = opts.searchRadiusCells || 64;

  const startCx = Math.floor(startX / CELL), startCy = Math.floor(startY / CELL);
  const endCx = Math.floor(endX / CELL), endCy = Math.floor(endY / CELL);

  // 시작 == 목적지 cell — waypoint 없이 바로 갈 수 있음
  if (startCx === endCx && startCy === endCy) return [{ x: endX, y: endY }];

  // 거리가 너무 멀면 search 안 함 (호출 측이 부분 path 처리)
  const cellDist = Math.abs(endCx - startCx) + Math.abs(endCy - startCy);
  if (cellDist > searchRadius) return null;

  const cpx = (c) => c * CELL + CELL / 2;
  // 간선(edge) 차단 판정 — 정본 blockedStep 시그니처에 기존 wall-edge + 물(다리 예외) 규칙을 그대로 싣는다.
  const blockedStep = (fx, fy, tx, ty) => {
    const fX = cpx(fx), fY = cpx(fy), tX = cpx(tx), tY = cpx(ty);
    if (isBlocked(fX, fY, tX, tY, floor)) return true;
    if (isWater(tX, tY) && !(isBridge && isBridge(tX, tY))) return true;
    return false;
  };
  const nodes = PathCore.localPath(startCx, startCy, endCx, endCy, {
    blockedStep, maxNodes: maxCells, radius: searchRadius,
    prefer: preferFn ? ((x, y) => preferFn(cpx(x), cpx(y))) : null,
  });
  if (!nodes) return null; // 못 찾음

  const waypoints = nodes.map(n => ({ x: cpx(n.x), y: cpx(n.y) }));
  waypoints.shift(); // 첫 waypoint는 NPC 현재 위치 — 제거
  if (waypoints.length > 0) waypoints[waypoints.length - 1] = { x: endX, y: endY }; // 마지막은 실제 endX/Y로 교체
  else waypoints.push({ x: endX, y: endY });
  return waypoints;
}

module.exports = { findPath, CELL };
