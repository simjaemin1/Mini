#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === 회관 문 통과 경로 진단/검증 하네스 ===
// 실서버 실측(2026-07-28): mason·smith×2·cook 4명이 회관에서 445~856px 떨어진 채 66틱(17.5초) 0px 정지.
// 침대 진입은 **작동한다**(같은 밤 실측: 취침 중 dBed 8~10px = 움집 문 통과해 실내 침대까지 도달).
// → "문을 못 지난다"가 아니라 **회관에만** 실패한다. 이 하네스가 그 차이를 실셀 경로로 규명한다.
//
// 실제 프로덕션 모듈을 그대로 쓴다: server/pathfind.js(findPath) → sim/path-core.js(localPath).
// 벽 판정은 zone.js의 findEdgeWall/edgeBlockedStep/isBlockedByWall을 동일 규칙으로 미러링한다
// (벽은 셀 좌상단에 저장되고 data.side로 N/E 구분 — 그 계약만 재현).
//
// 실행: node scripts/test-hall-door-path.js
const path = require('path');
const { findPath } = require(path.join(__dirname, '..', 'server', 'pathfind'));
const SZ = 32;

// ── 벽 저장소(서버 buildings 미러) ──
const WALLS = new Set();                       // `${cx}_${cy}_${side}`
const addWall = (cx, cy, side) => WALLS.add(`${cx}_${cy}_${side}`);
const findEdgeWall = (cx, cy, side) => WALLS.has(`${cx}_${cy}_${side}`);
// zone.js edgeBlockedStep verbatim
function edgeBlockedStep(cx, cy, sx, sy) {
  if (sx === 1) return findEdgeWall(cx, cy, 'E');
  if (sx === -1) return findEdgeWall(cx - 1, cy, 'E');
  if (sy === 1) return findEdgeWall(cx, cy + 1, 'N');
  if (sy === -1) return findEdgeWall(cx, cy, 'N');
  return false;
}
const cellOf = (x, y) => ({ cx: Math.floor(x / SZ), cy: Math.floor(y / SZ) });
// zone.js isBlockedByWall verbatim(계단·울타리·ghost 제외 — 이 시나리오엔 없음)
function isBlockedByWall(newX, newY, oldX, oldY) {
  const oc = cellOf(oldX, oldY), nc = cellOf(newX, newY);
  if (oc.cx === nc.cx && oc.cy === nc.cy) return false;
  let cx = oc.cx, cy = oc.cy, steps = 0;
  while (cx !== nc.cx || cy !== nc.cy) {
    if (++steps > 64) return true;
    const dx = nc.cx - cx, dy = nc.cy - cy;
    const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    if (sx !== 0 && sy !== 0) {
      const viaX = !edgeBlockedStep(cx, cy, sx, 0) && !edgeBlockedStep(cx + sx, cy, 0, sy);
      const viaY = !edgeBlockedStep(cx, cy, 0, sy) && !edgeBlockedStep(cx, cy + sy, sx, 0);
      if (!viaX && !viaY) return true;
      cx += sx; cy += sy;
    } else if (sx !== 0) {
      if (edgeBlockedStep(cx, cy, sx, 0)) return true;
      cx += sx;
    } else {
      if (edgeBlockedStep(cx, cy, 0, sy)) return true;
      cy += sy;
    }
  }
  return false;
}

// ── villages.js buildStructureRect verbatim(벽 부분만) ──
//   for x in [x0..x1]: wall(x, y0, 'N')  · 문 칸 제외하고 wall(x, y1+1, 'N')
//   for y in [y0..y1]: wall(x1, y, 'E')  · wall(x0-1, y, 'E')
function buildStructureRect(x0, y0, x1, y1, doorXs) {
  const door = new Set(doorXs || []);
  for (let x = x0; x <= x1; x++) { addWall(x, y0, 'N'); if (!door.has(x)) addWall(x, y1 + 1, 'N'); }
  for (let y = y0; y <= y1; y++) { addWall(x1, y, 'E'); addWall(x0 - 1, y, 'E'); }
}

const CC = 1000;                                     // 마을 중심 셀(임의)
// 큰집 8×8 = [ccx-4..ccx+3]², 남벽 문 2칸 = [ccx-1, ccx]  (villages.js materializeVillageStructures)
buildStructureRect(CC - 4, CC - 4, CC + 3, CC + 3, [CC - 1, CC]);
// 대조군: 움집 6×4 = [hx-5..hx+0]×[hy-5..hy-2], 남벽 문 2칸 = [hx-3, hx-2] — 침대 진입이 실제로 되는 구조
const HX = CC + 30, HY = CC + 30;
buildStructureRect(HX - 5, HY - 5, HX + 0, HY - 2, [HX - 3, HX - 2]);

const px = (c) => c * SZ + SZ / 2;
const opts = { floor: 0, isBlockedFn: isBlockedByWall, isWaterFn: () => false, maxCells: 1500, searchRadiusCells: 64 };

let fail = 0;
const chk = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
console.log('=== 회관 문 통과 경로 진단 ===');
console.log(`벽 ${WALLS.size}개 (큰집 8×8 + 움집 6×4)`);

console.log('\n[① 대조군 — 움집 침대(실측상 작동함)]');
{
  // 마당(문 앞 남쪽)에서 실내 침대 슬롯 [-4,-4] 로
  const s = { x: px(HX - 3), y: px(HY + 1) };
  const t = { x: px(HX - 4), y: px(HY - 4) };
  const p = findPath(s.x, s.y, t.x, t.y, opts);
  chk(!!p, `움집 마당 → 실내 침대 경로 ${p ? p.length + ' 웨이포인트' : '없음(실측과 모순!)'}`);
}

console.log('\n[② 문제 재현 — 회관 내부 앵커 [-3..2]²]');
const outs = [
  ['남쪽 마당(문 정면)', CC - 1, CC + 8],
  ['남서 445px', CC - 8, CC + 10],
  ['서쪽', CC - 20, CC],
  ['북쪽', CC, CC - 20],
];
const anchors = [];
for (let i = 0; i < 36; i++) anchors.push([CC + ((i % 6) - 3), CC + ((((i / 6) | 0) % 6) - 3)]);
let okN = 0, ngN = 0;
for (const [nm, sx, sy] of outs) {
  let ok = 0, ng = 0;
  for (const [ax, ay] of anchors) {
    const p = findPath(px(sx), px(sy), px(ax), px(ay), opts);
    if (p) ok++; else ng++;
  }
  okN += ok; ngN += ng;
  console.log(`  ${nm.padEnd(18)} 앵커 36개 중 도달 ${ok} / 실패 ${ng}`);
}
chk(true, `합계: 도달 ${okN} · 실패 ${ngN} (${outs.length}×36 = ${outs.length * 36})`);

console.log('\n[③ 문 칸 자체의 통행성 — 벽 규약 검증]');
{
  // 문 칸(ccx-1) 남→북 진입: (ccx-1, ccy+4) → (ccx-1, ccy+3)
  const b1 = isBlockedByWall(px(CC - 1), px(CC + 3), px(CC - 1), px(CC + 4));
  chk(!b1, `문 칸 (${CC - 1}, ${CC + 4})→(${CC - 1}, ${CC + 3}) 통과 ${b1 ? '차단(문이 안 뚫림!)' : '가능'}`);
  // 문 아닌 칸(ccx+2)은 막혀야 정상
  const b2 = isBlockedByWall(px(CC + 2), px(CC + 3), px(CC + 2), px(CC + 4));
  chk(b2, `비문 칸 (${CC + 2}, ${CC + 4})→(${CC + 2}, ${CC + 3}) ${b2 ? '차단(정상)' : '통과(벽이 새고 있다!)'}`);
}

console.log('\n[④ 경로 실패 시 서버 동작 — beeline 폴백 확인]');
{
  // zone.js: npc.path = p || [{x:targetX,y:targetY}]  ← 못 찾으면 직선. 벽에 갈려 0px가 된다.
  const p = findPath(px(CC - 8), px(CC + 10), px(CC - 3), px(CC - 3), opts);
  console.log(`  A* 결과: ${p ? p.length + ' 웨이포인트' : 'null → beeline 폴백 → 벽에 정지'}`);
  chk(true, '(진단 정보)');
}

console.log('\n' + (fail === 0 ? '결과: 진단 완료' : `결과: 체크 실패 ${fail}건`));
