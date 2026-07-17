// === sim/_path-core-test.js — path-core 정본 검증 (형태·최단성·계약) ===
'use strict';
const PC = require('./path-core.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ FAIL:', m); } };
const shape = p => { let s = ''; for (let i = 1; i < p.length; i++) { const dx = p[i].x - p[i-1].x, dy = p[i].y - p[i-1].y; s += dx>0?(dy>0?'↘':dy<0?'↗':'E'):dx<0?(dy>0?'↙':dy<0?'↖':'W'):(dy>0?'S':'N'); } return s.replace(/(.)\1*/g, m => m[0] + (m.length>1?m.length:'')); };

// [1] localPath 열린 지형: 최단(맨해튼+1 노드) + 직선 편향(계단 고른 분포 — 최대 연속 직진 ≤ ceil(장축/(단축+1))+1)
{
  const p = PC.localPath(5, 5, 12, 10, { blockedStep: () => false });
  ok(p && p.length === 7 + 5 + 1, 'local 최단 노드수: ' + (p && p.length));
  const runs = shape(p).match(/[ESWN](\d*)/g).map(t => +(t.slice(1) || 1));
  ok(Math.max(...runs) <= 3, 'local 직선편향 분포(최대 연속 ' + Math.max(...runs) + '): ' + shape(p));
  console.log('  local (5,5)->(12,10):', shape(p));
}
// [2] localPath 최단성 보존: 랜덤 장애물 200케이스 — 참조 BFS와 길이 동일
{
  let mism = 0;
  for (let t = 0; t < 200; t++) {
    const W = 24, blk = new Set(); const rnd = (() => { let s = t * 7919 + 13; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
    for (let i = 0; i < 90; i++) blk.add(((rnd() * W) | 0) + ',' + ((rnd() * W) | 0));
    const sx = 1, sy = 1, gx = W - 2, gy = W - 2; blk.delete(sx + ',' + sy); blk.delete(gx + ',' + gy);
    const bs = (fx, fy, tx, ty) => tx < 0 || ty < 0 || tx >= W || ty >= W || blk.has(tx + ',' + ty);
    const p = PC.localPath(sx, sy, gx, gy, { blockedStep: bs });
    // 참조 BFS(구 랩 bfsPath 동형)
    const prev = new Map([[sx + ',' + sy, null]]), q = [[sx, sy]]; let h = 0, found = null;
    while (h < q.length) { const [x, y] = q[h++]; if (x === gx && y === gy) { found = x + ',' + y; break; }
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x+dx, ny = y+dy, k = nx+','+ny; if (bs(x,y,nx,ny) || prev.has(k)) continue; prev.set(k, x+','+y); q.push([nx,ny]); } }
    let bl = null; if (found) { bl = 0; let c = found; while (prev.get(c) !== null) { bl++; c = prev.get(c); } }
    if ((p === null) !== (bl === null)) mism++;
    else if (p && p.length - 1 !== bl) mism++;
  }
  ok(mism === 0, 'local 최단성 200케이스 불일치 ' + mism);
}
// [3] routePath 열린 지형: 45°=순수 대각, 비스듬=대각·직진 직선 추종 혼합
{
  const p1 = PC.routePath(5, 5, 25, 25, { });
  ok(p1 && shape(p1) === '↘20', 'route 45° 순수대각: ' + (p1 && shape(p1)));
  const p2 = PC.routePath(5, 5, 20, 12, { });
  const s2 = shape(p2);
  ok(p2 && p2.length - 1 === 15, 'route 비스듬 스텝수(체비쇼프15): ' + (p2 && p2.length - 1));
  console.log('  route (5,5)->(20,12):', s2);
}
// [4] routePath 비용 최적성: 랜덤 장애물 120케이스 — 참조 다익스트라와 비용 동일(편향은 동률만 가름)
{
  let mism = 0;
  for (let t = 0; t < 120; t++) {
    const W = 20, blk = new Set(); const rnd = (() => { let s = t * 104729 + 7; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
    for (let i = 0; i < 60; i++) blk.add(((rnd() * W) | 0) + ',' + ((rnd() * W) | 0));
    const sx = 0, sy = 0, gx = W - 1, gy = W - 1; blk.delete('0,0'); blk.delete(gx + ',' + gy);
    const B = (x, y) => x < 0 || y < 0 || x >= W || y >= W || blk.has(x + ',' + y);
    const p = PC.routePath(sx, sy, gx, gy, { blocked: B });
    const cost = p ? (() => { let c = 0; for (let i = 1; i < p.length; i++) c += (p[i].x !== p[i-1].x && p[i].y !== p[i-1].y) ? 140 : 100; return c; })() : null;
    // 참조 다익스트라(같은 규칙: 100/140·코너컷 금지)
    const dist = new Map([[sx + ',' + sy, 0]]); const pq = [[0, sx, sy]];
    while (pq.length) { pq.sort((a, b) => a[0] - b[0]); const [d, x, y] = pq.shift(); if (d > dist.get(x + ',' + y)) continue;
      for (const [dx, dy, w] of [[1,0,100],[-1,0,100],[0,1,100],[0,-1,100],[1,1,140],[1,-1,140],[-1,1,140],[-1,-1,140]]) {
        const nx = x + dx, ny = y + dy; if (B(nx, ny)) continue;
        if (dx && dy && (B(x + dx, y) || B(x, y + dy))) continue;
        const nd = d + w, k = nx + ',' + ny;
        if (nd < (dist.has(k) ? dist.get(k) : Infinity)) { dist.set(k, nd); pq.push([nd, nx, ny]); } } }
    const ref = dist.has(gx + ',' + gy) ? dist.get(gx + ',' + gy) : null;
    if ((cost === null) !== (ref === null)) mism++;
    else if (cost !== null && cost !== ref) mism++;
  }
  ok(mism === 0, 'route 비용 최적성 120케이스 불일치 ' + mism);
}
// [5] 물·다리 계약: 물 차단 + 다리 칸만 통행(강 x=10, 다리 y=7)
{
  const B = (x, y) => x < 0 || y < 0 || x >= 20 || y >= 20 || (x === 10 && y !== 7);
  const p = PC.routePath(3, 3, 17, 12, { blocked: B });
  ok(p && p.some(n => n.x === 10 && n.y === 7), '다리 경유: ' + (p ? '경유 ' + p.filter(n => n.x === 10).map(n => n.y) : 'null'));
  const B2 = (x, y) => x < 0 || y < 0 || x >= 20 || y >= 20 || x === 10;   // 다리 없는 강 = 불능
  ok(PC.routePath(3, 3, 17, 12, { blocked: B2 }) === null, '무다리 강 = 도달불능');
}
// [6] 코너컷 금지: 대각 틈새 통과 불가
{
  const B = (x, y) => x < 0 || y < 0 || x >= 10 || y >= 10 || (x === 5 && y <= 4) || (y === 5 && x >= 6);   // ㄱ자 벽 — (5,5)↔(6,4) 대각 틈
  const p = PC.routePath(2, 2, 8, 8, { blocked: B });
  let cut = false;
  if (p) for (let i = 1; i < p.length; i++) { const dx = p[i].x - p[i-1].x, dy = p[i].y - p[i-1].y; if (dx && dy && (B(p[i-1].x + dx, p[i-1].y) || B(p[i-1].x, p[i-1].y + dy))) cut = true; }
  ok(p && !cut, '코너컷 금지 준수');
}
// [7] scratch(타이프트) 모드 = Map 모드 동일 결과 + 재사용(gen) 무오염
{
  const W = 60, Hh = 60, blkA = new Set(); const rnd = (() => { let s = 42; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  for (let i = 0; i < 500; i++) blkA.add(((rnd() * W) | 0) + ',' + ((rnd() * Hh) | 0));
  blkA.delete('2,2'); blkA.delete('55,50');
  const B = (x, y) => x < 0 || y < 0 || x >= W || y >= Hh || blkA.has(x + ',' + y);
  const sc = { w: W, h: Hh, g: new Int32Array(W * Hh), came: new Int32Array(W * Hh), stamp: new Int32Array(W * Hh), gen: 0 };
  const pm = PC.routePath(2, 2, 55, 50, { blocked: B });
  const pt1 = PC.routePath(2, 2, 55, 50, { blocked: B, scratch: sc });
  const pt2 = PC.routePath(2, 2, 55, 50, { blocked: B, scratch: sc });   // 2회째(gen 재사용)
  const eq = (a, b) => a && b && a.length === b.length && a.every((n, i) => n.x === b[i].x && n.y === b[i].y);
  ok(eq(pm, pt1) && eq(pt1, pt2), 'scratch=Map 동일 + gen 재사용 무오염');
}
// [8] costMul(답압 할인) 계약: g에 배율 정확 적용 + 근접 동률에서 할인 쪽 선택.
//     (멀리 떨어진 할인 회랑 유인은 의도적 미보장 — h가 무할인 octile이라 소폭 비허용 = 서버 §16 '근사로 충분' 계약 승계)
{
  const B = (x, y) => x < 0 || y < 0 || x >= 30 || y >= 30;
  const mul = (x, y) => (y === 5 ? 0.5 : 1);   // 직선 위가 반값 길
  const p = PC.routePath(0, 5, 29, 5, { blocked: B, costMul: mul });
  const cost = p ? (() => { let c = 0; for (let i = 1; i < p.length; i++) c += Math.round(((p[i].x !== p[i-1].x && p[i].y !== p[i-1].y) ? 140 : 100) * mul(p[i].x, p[i].y)); return c; })() : null;
  ok(p && p.every(n => n.y === 5) && cost === 29 * 50, '할인 g 적용(직선 유지·비용 ' + cost + '=1450)');
  // 이웃 동률: 벽으로 두 틈(위 y=4·아래 y=6, 등거리) — 아래만 할인 → 아래 틈 선택
  const B2 = (x, y) => x < 0 || y < 0 || x >= 20 || y >= 20 || (x === 10 && y !== 4 && y !== 6);
  const mul2 = (x, y) => (y >= 6 ? 0.9 : 1);
  const p2 = PC.routePath(2, 5, 18, 5, { blocked: B2, costMul: mul2 });
  ok(p2 && p2.some(n => n.x === 10 && n.y === 6), '근접 동률서 할인 틈 선택: ' + (p2 ? p2.filter(n => n.x === 10).map(n => n.y) : 'null'));
}
// [9] localPath prefer(답압 수렴 — 전쟁실험실 평행길 교정 승계): 등거리 대안이 길로 스냅, 최단성 유지
{
  const p0 = PC.localPath(0, 0, 10, 4, { blockedStep: () => false });
  const pr = PC.localPath(0, 0, 10, 4, { blockedStep: () => false, prefer: (x, y) => (y === 0 ? 1 : 0) });   // y=0 행이 길
  ok(p0 && pr && p0.length === pr.length && pr.length === 15, 'prefer 최단 유지(' + (pr && pr.length) + '노드)');
  const onRoad = pr ? pr.filter(n => n.y === 0).length : 0, onRoad0 = p0 ? p0.filter(n => n.y === 0).length : 0;
  ok(onRoad >= 9 && onRoad > onRoad0, '길 스냅(길 위 ' + onRoad0 + '→' + onRoad + '노드): ' + shape(pr));
}
console.log(fail === 0 ? `PASS ${pass}/${pass + fail}` : `FAIL ${fail}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
