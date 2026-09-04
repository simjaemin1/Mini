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
// [10] ★왕복 대칭(질의 정규화 — 사용자 지적): a→b == reverse(b→a) 완전 일치, 랜덤 장애물 지형 포함
{
  let mism = 0;
  for (let t = 0; t < 150; t++) {
    const W = 26, blk = new Set(); const rnd = (() => { let s = t * 48611 + 3; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
    for (let i = 0; i < 100; i++) blk.add(((rnd() * W) | 0) + ',' + ((rnd() * W) | 0));
    const ax = 1 + ((rnd() * 5) | 0), ay = 1 + ((rnd() * 5) | 0), bx = W - 2 - ((rnd() * 5) | 0), by = W - 2 - ((rnd() * 5) | 0);
    blk.delete(ax + ',' + ay); blk.delete(bx + ',' + by);
    const bs = (fx, fy, tx, ty) => tx < 0 || ty < 0 || tx >= W || ty >= W || blk.has(tx + ',' + ty);
    const B = (x, y) => x < 0 || y < 0 || x >= W || y >= W || blk.has(x + ',' + y);
    const eq = (p, q) => (p === null && q === null) || (p && q && p.length === q.length && p.every((n, i) => n.x === q[i].x && n.y === q[i].y));
    const rev = p => p ? p.slice().reverse() : null;
    if (!eq(PC.localPath(ax, ay, bx, by, { blockedStep: bs }), rev(PC.localPath(bx, by, ax, ay, { blockedStep: bs })))) mism++;
    if (!eq(PC.routePath(ax, ay, bx, by, { blocked: B }), rev(PC.routePath(bx, by, ax, ay, { blocked: B })))) mism++;
  }
  ok(mism === 0, '왕복 대칭 300쌍 불일치 ' + mism);
  const go = PC.localPath(0, 0, 5, 5, { blockedStep: () => false }), back = PC.localPath(5, 5, 0, 0, { blockedStep: () => false });
  const ks = p => new Set(p.map(n => n.x + ',' + n.y));
  let common = 0; for (const x of ks(go)) if (ks(back).has(x)) common++;
  ok(common === go.length, '45° 왕복 완전 동일 칸(' + common + '/' + go.length + ')');
}
// [11] smoothPath(이동 직선화): 열린 지형 1세그먼트·장애물 꺾임 보존·앵커 경유·왕복 대칭·통행 합법성
{
  const open4 = (x, y) => false;
  const pass_ = (blk) => (ax, ay, bx, by) => { const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) | 0; for (let i = 1; i <= n; i++) { const x = Math.round(ax + (bx - ax) * i / n), y = Math.round(ay + (by - ay) * i / n); if (blk(x, y)) return false; } return true; };
  // 열린 지형: (0,0)→(3,6) 계단 → 웨이포인트 2개(직선 하나)
  const st = PC.localPath(0, 0, 3, 6, { blockedStep: () => false });
  const sm = PC.smoothPath(st, pass_(() => false));
  ok(sm.length === 2 && sm[0].x === 0 && sm[1].x === 3 && sm[1].y === 6, '열린 지형 1세그먼트(' + sm.length + '웨이포인트)');
  // 장애물: 세로벽 x=5(y<=8 틈 y=9) — 꺾임 보존 + 각 세그먼트 통행 합법
  const blk = (x, y) => x === 5 && y <= 8;
  const st2 = PC.localPath(0, 0, 10, 0, { blockedStep: (f, fy, tx, ty) => tx < -2 || ty < -2 || tx > 14 || ty > 14 || blk(tx, ty) });
  const cp = pass_((x, y) => blk(x, y));
  const sm2 = PC.smoothPath(st2, cp);
  let legal = sm2.length >= 3;
  for (let i = 1; i < sm2.length; i++) if (!cp(sm2[i - 1].x, sm2[i - 1].y, sm2[i].x, sm2[i].y)) legal = false;
  ok(legal && sm2.length < st2.length, '장애물 꺾임 보존·세그먼트 합법(' + st2.length + '→' + sm2.length + ')');
  // 앵커(길): y=0 행 길 → 길 노드 전부 보존
  const st3 = PC.localPath(0, 0, 8, 0, { blockedStep: () => false, prefer: (x, y) => (y === 0 ? 1 : 0) });
  const sm3 = PC.smoothPath(st3, pass_(() => false), { keep: (x, y) => y === 0 });
  ok(sm3.length === st3.length, '길 앵커 전부 경유(밀집 유지 ' + sm3.length + '=' + st3.length + ')');
  // 왕복 대칭: smooth(a→b) == reverse(smooth(b→a))
  const f1 = PC.smoothPath(st2, cp), b1 = PC.smoothPath(st2.slice().reverse(), cp);
  const eqr = f1.length === b1.length && f1.every((n, i) => n.x === b1[b1.length - 1 - i].x && n.y === b1[b1.length - 1 - i].y);
  ok(eqr, 'smooth 왕복 대칭');
}

// ── ★★[T85 2026-09-03] 재개 가능 A* — **답은 비트 동일, 예산은 언제 쉬는가만 정한다** ────────
//   ★왜 이 검사가 이 카드의 전부인가: 재개형이 답을 조금이라도 바꾸면 교역로가 바뀌고,
//     그러면 econ 기준선이 통째로 흔들린다. "빨라졌다"는 그 다음 문제다.
//   ★자명 통과 금지: 열린 지형만 재면 경로가 하나뿐이라 무엇을 해도 같다 ⇒ **장애물 난수 세계**에서
//     재고, 경로가 실제로 꺾이는지(직선 아님)와 탐색이 실제로 컸는지(pops>0)를 함께 assert 한다.
{
  console.log('\n[T85] 재개 가능 A* — 비트 동일');
  const W = 90, H = 70;
  let sd = 987654321;
  const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
  const grid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) grid[i] = rnd() < 0.24 ? 1 : 0;
  const B = (x, y) => (x < 0 || y < 0 || x >= W || y >= H || grid[y * W + x] === 1);
  const mkSc = () => ({ w: W, h: H, g: new Int32Array(W * H), came: new Int32Array(W * H), stamp: new Int32Array(W * H), gen: 0 });
  // 실제로 풀리는 케이스만 모은다(도달 불능은 아래 ⑤ 가 따로 잰다)
  const cases = [];
  for (let k = 0; cases.length < 30 && k < 4000; k++) {
    const a = [(rnd() * W) | 0, (rnd() * H) | 0], b = [(rnd() * W) | 0, (rnd() * H) | 0];
    if (B(a[0], a[1]) || B(b[0], b[1])) continue;
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 40) continue;
    if (PC.routePath(a[0], a[1], b[0], b[1], { blocked: B })) cases.push([a, b]);
  }
  ok(cases.length === 30, `[상황] 풀리는 케이스 30개를 세웠다(${cases.length})`);
  let bent = 0, maxPops = 0;
  let eqFull = 0, eq1 = 0, eqMix = 0;
  for (const [a, b] of cases) {
    const sync = PC.routePath(a[0], a[1], b[0], b[1], { blocked: B, scratch: mkSc() });
    // ⓐ 완주 스텝(예산 무제한)
    let S = PC.routePathBegin(a[0], a[1], b[0], b[1], { blocked: B, scratch: mkSc() });
    const full = PC.pathStep(S, 0);
    if (JSON.stringify(full.path) === JSON.stringify(sync)) eqFull++;
    if (S.pops > maxPops) maxPops = S.pops;
    // ⓑ **예산 1노드** — 한 노드마다 놓았다 이어 간다(순서 보존의 가장 센 증거)
    S = PC.routePathBegin(a[0], a[1], b[0], b[1], { blocked: B, scratch: mkSc() });
    let r; do { r = PC.pathStep(S, 1); } while (!r.done);
    if (JSON.stringify(r.path) === JSON.stringify(sync)) eq1++;
    // ⓒ 들쭉날쭉한 예산(1·7·113·2 …) — 경계에 특별한 값이 없다는 증거
    S = PC.routePathBegin(a[0], a[1], b[0], b[1], { blocked: B, scratch: mkSc() });
    const budgets = [1, 7, 113, 2, 999, 3];
    let i2 = 0; do { r = PC.pathStep(S, budgets[i2++ % budgets.length]); } while (!r.done);
    if (JSON.stringify(r.path) === JSON.stringify(sync)) eqMix++;
    // 상황 — 이 경로가 직선이 아니다(꺾인다)
    if (sync && sync.length > 2) {
      const dx0 = sync[1].x - sync[0].x, dy0 = sync[1].y - sync[0].y;
      for (let i = 2; i < sync.length; i++) { if (sync[i].x - sync[i - 1].x !== dx0 || sync[i].y - sync[i - 1].y !== dy0) { bent++; break; } }
    }
  }
  ok(bent >= 25, `[상황] 경로가 실제로 꺾인다 — 직선만 재면 자명 통과다(${bent}/30)`);
  ok(maxPops > 500, `[상황] 탐색이 실제로 컸다(최대 pops ${maxPops})`);
  ok(eqFull === 30, `★★① 완주 스텝 = 동기 문 (비트 동일 ${eqFull}/30)`);
  ok(eq1 === 30, `★★② **예산 1노드**로 쪼개도 같다 — 꺼내는 순서가 보존된다 (${eq1}/30)`);
  ok(eqMix === 30, `★★③ 들쭉날쭉한 예산으로 쪼개도 같다 (${eqMix}/30)`);

  // ④ **두 탐색을 번갈아** — Map 백엔드(scratch 없음)는 상태가 S 안에만 있어 안전해야 한다.
  //   ⚠scratch 를 **공유**하면 깨진다(gen-스탬프가 하나) — 그건 호출측 계약(`villages.js` 슬롯 하나)이고,
  //     여기서는 "그 계약이 필요한 이유"를 실측으로 남긴다: 같은 scratch 로 번갈아 돌리면 **틀린다**.
  {
    const [a1, b1] = cases[0], [a2, b2] = cases[1];
    const s1 = PC.routePath(a1[0], a1[1], b1[0], b1[1], { blocked: B });
    const s2 = PC.routePath(a2[0], a2[1], b2[0], b2[1], { blocked: B });
    let A = PC.routePathBegin(a1[0], a1[1], b1[0], b1[1], { blocked: B });
    let C = PC.routePathBegin(a2[0], a2[1], b2[0], b2[1], { blocked: B });
    let ra = null, rc = null;
    while (!ra || !rc) {
      if (!ra) { const t = PC.pathStep(A, 5); if (t.done) ra = t; }
      if (!rc) { const t = PC.pathStep(C, 5); if (t.done) rc = t; }
    }
    ok(JSON.stringify(ra.path) === JSON.stringify(s1) && JSON.stringify(rc.path) === JSON.stringify(s2),
      '★★④ Map 백엔드는 **번갈아 돌려도** 둘 다 같다(상태가 S 안에만 있다)');
    // ★같은 scratch 를 공유하면 **틀린다** — 그래서 호출측이 슬롯 하나를 쓴다(자명 통과 방지의 반대편)
    const shared = mkSc();
    let A2 = PC.routePathBegin(a1[0], a1[1], b1[0], b1[1], { blocked: B, scratch: shared });
    let C2 = PC.routePathBegin(a2[0], a2[1], b2[0], b2[1], { blocked: B, scratch: shared });
    let ra2 = null, rc2 = null, guard = 0;
    while ((!ra2 || !rc2) && ++guard < 200000) {
      if (!ra2) { const t = PC.pathStep(A2, 5); if (t.done) ra2 = t; }
      if (!rc2) { const t = PC.pathStep(C2, 5); if (t.done) rc2 = t; }
    }
    const broke = !ra2 || !rc2 || JSON.stringify(ra2.path) !== JSON.stringify(s1) || JSON.stringify(rc2.path) !== JSON.stringify(s2);
    ok(broke, '★★④b scratch 를 **공유**해 번갈아 돌리면 실제로 깨진다 — 슬롯 하나 계약의 근거');
  }

  // ⑤ 도달 불능 · 끝점 차단 — 두 문이 **같이** null
  {
    const G2 = (x, y) => (x < 0 || y < 0 || x >= 20 || y >= 20 || x === 10);   // 세로 벽으로 완전 분리
    ok(PC.routePath(2, 2, 15, 15, { blocked: G2 }) === null, '⑤ 동기 문: 도달 불능 = null');
    const S5 = PC.routePathBegin(2, 2, 15, 15, { blocked: G2 });
    let r5; do { r5 = PC.pathStep(S5, 3); } while (!r5.done);
    ok(r5.path === null, '⑤ 재개형 문: 도달 불능 = null(같은 판정)');
    ok(PC.routePathBegin(10, 2, 15, 15, { blocked: G2 }) === null, '⑤ 끝점이 막혔으면 재개형도 시작조차 안 한다');
  }

  // ⑥ 왕복 대칭이 재개형에서도 산다(정규화가 재귀에서 플래그로 바뀐 자리)
  {
    const [a, b] = cases[2];
    const S6 = PC.routePathBegin(b[0], b[1], a[0], a[1], { blocked: B });
    let r6; do { r6 = PC.pathStep(S6, 11); } while (!r6.done);
    const fwd = PC.routePath(a[0], a[1], b[0], b[1], { blocked: B });
    const rev = r6.path.slice().reverse();
    ok(JSON.stringify(rev) === JSON.stringify(fwd), '★⑥ 재개형도 왕복 대칭 — reverse(b→a) == a→b');
  }

  // ⑦ ★자명 통과 금지 — **일부러 깨면 잡는가.** 양보가 반복 하나를 **먹는** 재개형(=버그난 스텝 커널)을
  //   흉내 낸다: 재개 사이에 힙에서 하나를 빼면 그 노드는 영영 안 꺼내진다.
  //   ⚠한 케이스만 보면 안 된다 — A* 는 한 노드쯤 잃어도 다른 부모로 같은 답에 닿는 수가 있다
  //     (실측: 30개 중 1개가 그랬다. 그 하나를 골랐다가 이 검사가 헛되이 빨개졌다).
  //   ⇒ 30개 전부에 심고 **대부분이 달라지는지**를 본다.
  {
    let diff = 0, poked = 0;
    for (const [a, b] of cases) {
      const sync = PC.routePath(a[0], a[1], b[0], b[1], { blocked: B });
      const S7 = PC.routePathBegin(a[0], a[1], b[0], b[1], { blocked: B });
      let r7;
      do {
        r7 = PC.pathStep(S7, 9);
        if (!r7.done && S7.open.size > 2) { S7.open.pop(); poked++; }
      } while (!r7.done);
      if (JSON.stringify(r7.path) !== JSON.stringify(sync)) diff++;
    }
    ok(poked > 0, `⑦ [상황] 돌연변이를 실제로 심었다(양보마다 힙에서 하나 뺐다 · ${poked}회)`);
    ok(diff >= 25, `★⑦ 자명 통과 금지 — 양보가 반복을 먹으면 **답이 달라진다**(${diff}/30) ⇒ ①②③ 의 초록은 진짜다`);
  }
}

console.log(fail === 0 ? `PASS ${pass}/${pass + fail}` : `FAIL ${fail}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
