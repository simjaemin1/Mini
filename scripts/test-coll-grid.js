#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-coll-grid.js — 벽 질의의 격자에는 밭이 없다 (T449 ③ · 캐논 "밭은 벽이 아니다") ======================
//
// ★왜 [지시 T449 ③ · T432 ⓑ] 청크를 켜면 사람당 22.4µs 의 주인 하나가 **A* 안 벽 질의**(18~25 %)였고, 그 격자(`qtBuildings`)의
//   73 %가 마을 **밭·마당 타일**(`vb` — Stage 4A `249ca5c0` 가 "기존 경로와 동일하게(추가 코드 없음)" 넣었다)이었다. 벽 질의는
//   종류를 걸러 버리니 답은 같고 값만 낸다. ⇒ 제품은 벽 질의 넷에 **그 종류만 든 격자**(`qtColl`)를 준다 — 이 하네스가 지킨다:
//     ① 글자 — 종류 집합 한 줄 · 넷이 거르는 이름 ⊆ 그 집합 · 넷이 `qtColl` 을 본다 · 새 격자는 `qtBuildings` 를 세우는 **그 자리**에서 같이 선다
//     ② 답 비트 동일 — 제품의 술어 글자를 **그대로** 떠서 옛 격자(전부) ↔ 새 격자(그 종류)로 돌린다: 걸음 막힘 · 바닥 · 울타리 · 받침 ·
//        **A\* 길**(`server/pathfind.js` 정본) — 무엇이 나오나 한 글자까지
//     ③ 증분(T421) — 격자를 **그대로 두는 판**과 **통째로 세우는 판**이 같은 새 격자를 낸다 · 되돌림 판(끔 — 옛 격자)과 **벽 질의 종류의 답이 같다**(청크·건물이 들고 나도)
//     (자명 통과 금지 — ②·③ 안에서) 옛 격자 질의에 밭이 **실제로 섞였다** · 미끼(새 격자에서 벽을 빼면 · 통째로 세울 때 안 채우면) 답이 **갈린다**
// ⚠존을 부팅하지 않는다 — 존 소스는 글자로 떠서 함수로 돌린다(test-move-soa ⑭ 와 같은 문법 · 사본 0).
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const { Quadtree, QuadtreeInc } = require(path.join(ROOT, 'server', 'quadtree.js'));
const { findPath } = require(path.join(ROOT, 'server', 'pathfind.js'));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const codeOnly = require('./code-only.js');   // ★정본 하나(`test-harness-lint ⑦a`)
const body = (name, indent = '') => (Z.match(new RegExp('\\n' + indent + 'function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n' + indent + '\\}')) || [''])[0];
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

console.log('\n=== 벽 질의의 격자에는 밭이 없다 (T449 ③) ===');

// ── ① 글자 ─────────────────────────────────────────────────────────────────────
console.log('\n① 글자 — 종류 집합 한 줄 · 넷이 `qtColl` · 세우는 자리는 `qtBuildings` 와 같은 줄');
const COLLDEF = (Z.match(/^const COLL_TYPES = new Set\(\[([^\]]*)\]\);$/m) || ['', '']);
const COLL = COLLDEF[1].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean);
ok(COLL.join() === 'wall,door,fence,floor,stair' && (Z.match(/const COLL_TYPES = /g) || []).length === 1, '① ★종류 집합은 **한 줄**(벽·문·울타리·바닥·계단)', COLL.join('·'));
const PRED = { _edgeScan: body('_edgeScan'), findCellFence: body('findCellFence'), findFloorTile: body('findFloorTile'), hasFloorSupportAt: body('hasFloorSupportAt', '  ') };
ok(Object.values(PRED).every((b) => b.length > 150), '① [전제] 제품의 벽 질의 넷을 떴다', Object.entries(PRED).map(([k, v]) => `${k} ${v.length}`).join(' · '));
const names = (b) => [...codeOnly(b).matchAll(/b\.type !== '(\w+)'/g)].map((m) => m[1]);
const want = { _edgeScan: ['wall', 'door'], findCellFence: ['fence'], findFloorTile: ['floor'], hasFloorSupportAt: ['floor', 'stair'] };
let sub = true; for (const k in want) { const n = names(PRED[k]); if (n.join() !== want[k].join() || !n.every((t) => COLL.includes(t))) sub = false; }
ok(sub, '① ★★넷이 거르는 이름이 **그 집합 안**이다(술어가 새 종류를 보기 시작하면 여기가 빨개진다)', Object.keys(want).map((k) => `${k}=${names(PRED[k]).join('+')}`).join(' · '));
ok(Object.values(PRED).every((b) => /\bqtColl \? qtColl\.queryCircle\(/.test(b) && !/qtBuildings/.test(codeOnly(b))), '① ★넷이 `qtColl` 을 본다(옛 `qtBuildings` 0) · 격자가 아직 없으면 종전 폴백 그대로');
ok((codeOnly(Z).match(/qtColl\.queryCircle\(/g) || []).length === 4, '① `qtColl` 을 묻는 자리는 그 넷뿐이다');
const RS = body('rebuildSpatialIndex'), RI = body('_rebuildSpatialInc');
ok(/qtBuildings\.insert\(e\); S\.bld\.push\(e\); if \(COLL_TYPES\.has\(b\.type\)\) qtColl\.insert\(\{ x: b\.x, y: b\.y, ref: b \}\);/.test(RI),
  '① ★★새 격자는 `qtBuildings` 를 **통째로 세우는 그 줄**에서 같이 선다(T421 증분 — 같은 활성 청크 · 같은 차례에서 거른 것)');
//   ★되돌림 판(T421 끔 — 매 틱 통째로)은 **옛 몸통 그대로** — 벽 질의도 옛 격자다(새 격자를 매 틱 한 번 더 세우는 값이 절약을 먹는다 · 보고 §3-ⓓ)
ok(/for \(const b of c\.buildings\.values\(\)\) qtBuildings\.insert\(\{ x: b\.x, y: b\.y, ref: b \}\); \}\n\s*qtColl = qtBuildings;/.test(RS) && !/COLL_TYPES/.test(codeOnly(RS)),
  '① ★되돌림 판(`T421_SPATIAL_INC=0`)은 옛 몸통 한 글자도 안 바뀐 채 · 벽 질의 격자 = 옛 격자(`qtColl = qtBuildings` 한 줄)');
//   ★[T537 ⓪] 열한째 = 우물 칸(`_wellCellAt` · T509 — 완공 우물 발자국을 **건물 격자**에서 찾는다 · 벽 질의가 아니다 ⇒ `qtColl` 넷과 무관).
ok((codeOnly(Z).match(/qtBuildings\.queryCircle\(/g) || []).length === 11 && /function _wellCellAt\([^)]*\) \{[\s\S]{0,300}qtBuildings\.queryCircle\(/.test(codeOnly(Z)), '① `qtBuildings` 를 묻는 자리는 **열하나**(자리 검사 다섯·공격·모닥불·농지 셋 + 우물 칸 `_wellCellAt`(T509) — 마을 땅엔 못 짓는다는 그 격자)',
  `${(codeOnly(Z).match(/qtBuildings\.queryCircle\(/g) || []).length}곳`);

// ── 판 — 마을 셋(움집: 벽 사각 + 문 한 칸 · 바닥 · 2층 바닥 + 계단 · 울타리) + 그 둘레 밭·마당 타일(한 칸 하나) ──────────
const W = 8192, H = 8192, SZ = 32;
const mkWorld = (seed) => {
  const r = rng(seed), bl = []; let id = 0;
  const add = (type, x, y, data, floor) => { const b = { id: 'b' + (id++), type, x, y, data: data || {}, floor: floor || 0 }; bl.push(b); return b; };
  for (let v = 0; v < 3; v++) {
    const vx = 40 + Math.floor(r() * 150), vy = 40 + Math.floor(r() * 150);
    for (let dx = -14; dx <= 14; dx++) for (let dy = -14; dy <= 14; dy++) {           // 둘레 밭·마당(`vb` — 한 칸 하나 · 벽이 아니다)
      if (Math.abs(dx) <= 6 && Math.abs(dy) <= 6) continue;
      const cx = vx + dx, cy = vy + dy;
      add(r() < 0.6 ? 'farmland' : 'vtile', cx * SZ + SZ / 2, cy * SZ + SZ / 2, { sim: 1 }).sim = true;
    }
    for (let h = 0; h < 4; h++) {                                                      // 움집 넷(5×4) — 벽 가장자리 · 남벽에 문
      const x0 = vx - 6 + (h % 2) * 7, y0 = vy - 6 + Math.floor(h / 2) * 7, x1 = x0 + 4, y1 = y0 + 3;
      for (let x = x0; x <= x1; x++) { add('wall', x * SZ, y0 * SZ, { side: 'N' }); if (x === x0 + 2) add('door', x * SZ, (y1 + 1) * SZ, { side: 'N', open: h % 2 === 0 }); else add('wall', x * SZ, (y1 + 1) * SZ, { side: 'N' }); }
      for (let y = y0; y <= y1; y++) { add('wall', (x0 - 1) * SZ, y * SZ, { side: 'E' }); add('wall', x1 * SZ, y * SZ, { side: 'E' }); }
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) add('floor', x * SZ + SZ / 2, y * SZ + SZ / 2, {}, 0);
      if (h === 1) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y0 + 1; y++) add('floor', x * SZ + SZ / 2, y * SZ + SZ / 2, {}, 1);
        add('stair', (x0 + 1) * SZ + SZ / 2, (y1) * SZ + SZ / 2, { dir: 'N' }, 0); }
    }
    for (let k = 0; k < 10; k++) add('fence', (vx + 8 + k) * SZ + SZ / 2, (vy + 7) * SZ + SZ / 2);   // 울타리 한 줄
    add('campfire', vx * SZ + SZ / 2, vy * SZ + SZ / 2);                                             // 벽 아닌 건물(격자 밖 종류)
  }
  return bl;
};
// 제품 글자 그대로 — 술어 여섯 + A* 는 `server/pathfind.js`
const SRC = [body('_edgeScan'), body('findEdgeWall'), body('findFloorTile'), body('findCellFence'), body('edgeBlockedStep'), body('isBlockedByWall'), body('straightPathClear'),
  body('hasFloorSupportAt', '  '), body('dirVec', '  ')].join('\n');
const scope = (bl, qt) => {
  const buildings = new Map(bl.map((b) => [b.id, b]));
  return new Function('qtColl', 'buildings', 'BUILDING_SIZE', 'ghostBuildings', 'ZONE', '_walk', 'DEBUG_COLLIDER', 'ZONE_ID', 'isBlockedByStairSide', 'isTerrainBlockedLocal',
    SRC + '\nreturn { isBlockedByWall, findFloorTile, findCellFence, hasFloorSupportAt, straightPathClear };')(
    qt, buildings, SZ, new Map(), { worldOffsetX: 0, worldOffsetY: 0 }, { wallQ: 0 }, false, 't', () => false, () => false);
};
const tree = (bl, keep) => { const q = new Quadtree(0, 0, W, H); for (const b of bl) if (keep(b)) q.insert({ x: b.x, y: b.y, ref: b }); return q; };

// ── ② 답 비트 동일 ─────────────────────────────────────────────────────────────
console.log('\n② 답 비트 동일 — 옛 격자(전부) ↔ 새 격자(그 종류) · 제품 술어 글자 그대로 · A\\* 길까지');
const COLLS = new Set(COLL);
const bl = mkWorld(449);
const qOld = tree(bl, () => true), qNew = tree(bl, (b) => COLLS.has(b.type)), qBait = tree(bl, (b) => COLLS.has(b.type) && b.type !== 'wall');
const A = scope(bl, qOld), B = scope(bl, qNew), X = scope(bl, qBait);
const r = rng(0x449);
const cells = bl.filter((b) => b.type === 'wall' || b.type === 'floor').map((b) => [Math.floor(b.x / SZ), Math.floor(b.y / SZ)]);
let nW = 0, dW = 0, dWb = 0, blocked = 0, nF = 0, dF = 0, nS = 0, dS = 0, nP = 0, dP = 0, dPb = 0, found = 0, farmMix = 0, refOld = 0, refNew = 0;
for (let i = 0; i < 40000; i++) {
  const [cx, cy] = cells[Math.floor(r() * cells.length)];
  const x0 = cx * SZ + r() * SZ, y0 = cy * SZ + r() * SZ;
  const ang = r() * Math.PI * 2, len = [3, 12, 40, 90][i % 4];
  const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len, fl = (i % 17 === 0) ? 1 : 0;
  const a = A.isBlockedByWall(x1, y1, x0, y0, fl), b = B.isBlockedByWall(x1, y1, x0, y0, fl), c = X.isBlockedByWall(x1, y1, x0, y0, fl);
  nW++; if (a !== b) dW++; if (a !== c) dWb++; if (a) blocked++;
  if (i % 4 === 0) { const f0 = A.findFloorTile(cx, cy, fl), f1 = B.findFloorTile(cx, cy, fl); nF++; if ((f0 && f0.id) !== (f1 && f1.id)) dF++;
    const s0 = A.hasFloorSupportAt(x0, y0, 1), s1 = B.hasFloorSupportAt(x0, y0, 1); nS++; if (s0 !== s1) dS++;
    const fc0 = A.findCellFence(cx + 9, cy + 8, 0), fc1 = B.findCellFence(cx + 9, cy + 8, 0); if (fc0 !== fc1) dF++;
    const o = qOld.queryCircle(cx * SZ, cy * SZ, SZ * 2), n = qNew.queryCircle(cx * SZ, cy * SZ, SZ * 2);
    refOld += o.length; refNew += n.length; if (o.some((q) => q.sim)) farmMix++; }
}
for (let i = 0; i < 1500; i++) {
  const [sx, sy] = cells[Math.floor(r() * cells.length)], [tx, ty] = cells[Math.floor(r() * cells.length)];
  if (Math.abs(sx - tx) > 40 || Math.abs(sy - ty) > 40) { i--; continue; }
  const o = { floor: 0, isWaterFn: () => false, maxCells: 1500, searchRadiusCells: 64 };
  const pa = findPath(sx * SZ + 16, sy * SZ + 16, tx * SZ + 16, ty * SZ + 20, Object.assign({ isBlockedFn: A.isBlockedByWall }, o));
  const pb = findPath(sx * SZ + 16, sy * SZ + 16, tx * SZ + 16, ty * SZ + 20, Object.assign({ isBlockedFn: B.isBlockedByWall }, o));
  const pc = findPath(sx * SZ + 16, sy * SZ + 16, tx * SZ + 16, ty * SZ + 20, Object.assign({ isBlockedFn: X.isBlockedByWall }, o));
  nP++; if (JSON.stringify(pa) !== JSON.stringify(pb)) dP++; if (JSON.stringify(pa) !== JSON.stringify(pc)) dPb++; if (pa) found++;
}
ok(nW === 40000 && blocked > 2000 && farmMix > nF * 0.3, '② [전제 · 자명 통과 금지] 걸음이 **실제로 막힌다** · 옛 격자 질의의 셋에 하나 넘게에 **밭·마당이 섞였다**', `막힘 ${blocked}/${nW} · 밭 섞임 ${farmMix}/${nF}`);
ok(dW === 0, '② ★★★걸음 막힘(`isBlockedByWall` — A\\*·이동·직선 판정이 부르는 그 술어) **4만 번 비트 동일**', `다름 ${dW}`);
ok(dF === 0 && dS === 0, '② ★★바닥(`findFloorTile` — 무엇이 나오나) · 울타리 · 받침(2층) **비트 동일**', `바닥·울타리 다름 ${dF} · 받침 다름 ${dS}/${nS}`);
ok(nP === 1500 && found > 400 && dP === 0, '② ★★★A\\* 길(`pathfind.js` 정본) **1,500쌍 웨이포인트까지 비트 동일** ⇒ 도착도 같다', `찾음 ${found} · 다름 ${dP}`);
ok(dWb > 0 && dPb > 0, '② ★미끼 — 새 격자에서 **벽을 빼면** 걸음·길이 **갈린다**(자가 벽을 실제로 본다)', `걸음 ${dWb} · 길 ${dPb}`);
const cut = refOld ? (1 - refNew / refOld) * 100 : 0;
ok(refNew < refOld, '② [값] 같은 질의가 내는 항목 수 — 옛 격자 ↔ 새 격자', `${refOld.toLocaleString()} → ${refNew.toLocaleString()}(−${cut.toFixed(1)} %)`);

// ── ③ 증분(T421) — 그대로 두는 판 ↔ 통째로 세우는 판이 같은 새 격자를 낸다 ──────────────────────
console.log('\n③ 증분(T421) — 켬(그대로 두기 · 통째로) ↔ 끔(되돌림 — 옛 격자) · 벽 질의 종류의 답이 같다(청크·건물이 들고 나도)');
{
  const SPDEF = (Z.match(/const _spInc = \{[^\n]*\};/) || [''])[0];
  const src = ['rebuildSpatialIndex', '_rebuildSpatialInc', '_spKeep', '_rebuildResources'].map((n) => body(n)).join('\n');
  ok(src.length > 3000 && SPDEF.length > 50, '③ [전제] 제품의 격자 글자 넷 + 상태 한 줄을 떴다');
  const CS = 512;
  const mk = (on, w, twist) => new Function('players', 'mobs', 'resources', 'chunkManager', 'Quadtree', 'QuadtreeInc', 'ZONE', 'T421_SPATIAL_INC', '_inputTOStep',
    'let activeChunkKeys = new Set(), qtPlayers = null, qtMobs = null, qtBuildings = null, qtResources = null, qtColl = null, resourcesDirty = true, _lastResRebuild = 0, _WW = null, _wwRes = null;\n' +   // ★[T537 ⓪] T461 커널 두 칸(끔 = null — 제품 선언 그대로 · `_rebuildResources` 가 읽는다)
    
    SPDEF + '\n' + COLLDEF[0] + '\n' + (twist ? src.replace('S.bld.push(e); if (COLL_TYPES.has(b.type)) qtColl.insert({ x: b.x, y: b.y, ref: b });', 'S.bld.push(e);') : src) + '\nreturn { setKeys: (s) => { activeChunkKeys = s; }, rebuild: () => rebuildSpatialIndex(undefined), coll: () => qtColl, bld: () => qtBuildings, S: _spInc };')(
    new Map(), new Map(), new Map(), w.cm, Quadtree, QuadtreeInc, { zoneWidth: W, zoneHeight: H }, on, () => {});
  const w = { cm: { chunkSize: CS, keyOf: (cx, cy) => `${cx}_${cy}`, chunks: new Map() } };
  for (let cx = 0; cx < W / CS; cx++) for (let cy = 0; cy < H / CS; cy++) w.cm.chunks.set(`${cx}_${cy}`, { buildings: new Map() });
  const put = (b) => w.cm.chunks.get(`${Math.floor(b.x / CS)}_${Math.floor(b.y / CS)}`).buildings.set(b.id, b);
  for (const b of mkWorld(4210)) put(b);
  const I0 = mk(false, w), I1 = mk(true, w), IX = mk(true, w, 'stale'), rr = rng(0x421);
  const pts = []; for (const c of w.cm.chunks.values()) for (const b of c.buildings.values()) pts.push([b.x, b.y]);
  let nQ = 0, dQ = 0, nonEmpty = 0, extra = 0, dX = 0, farmIn = 0, offSame = true;
  const COLLS = new Set(COLL);
  for (let t = 0; t < 900; t++) {
    //   관측자 둘 — 앞 40틱은 가만히(활성 집합이 같다 ⇒ 그대로 두는 길) · 뒤 20틱은 판 위를 옮겨 다닌다(통째로 세우는 길)
    const keys = new Set(); const ph = t % 60 < 40, mv = Math.floor(t / 60);
    for (const [ox, oy] of [[3 + (mv % 5), 3 + (mv % 7)], [8 + (mv % 4), 6 + (mv % 5)]]) for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      const cx = ox + dx + (ph ? 0 : (t % 3)), cy = oy + dy; if (cx >= 0 && cy >= 0 && cx < W / CS && cy < H / CS) keys.add(`${cx}_${cy}`); }
    if (t % 97 === 5) { const b = { id: 'x' + (extra++), type: t % 2 ? 'wall' : 'farmland', x: Math.floor(rr() * 200) * SZ, y: Math.floor(rr() * 200) * SZ, data: { side: 'N' }, floor: 0 }; put(b); }
    if (t % 131 === 9) { const c = w.cm.chunks.get([...keys][0]); const it = c && [...c.buildings.keys()].find((k) => c.buildings.get(k).type === 'wall'); if (it) c.buildings.delete(it); }
    I0.setKeys(keys); I1.setKeys(keys); IX.setKeys(keys); I0.rebuild(); I1.rebuild(); IX.rebuild();
    const a = I0.coll(), b = I1.coll(), bx = IX.coll();
    if (a !== I0.bld()) offSame = false;   // 되돌림 판의 벽 질의 격자 = 옛 격자 그 물건
    //   ★벽 질의 종류만 · 이름 순 — 되돌림 판은 옛 격자(밭 섞임)를 물으니 **종류로 걸러** 견준다(술어가 하는 일 그대로 · 원 안은 `queryCircle` 이 거리로 자른다)
    const key = (q) => q.filter((x) => COLLS.has(x.type)).map((x) => x.id).sort().join();
    for (let k = 0; k < 60; k++) { const pt = pts[Math.floor(rr() * pts.length)], cx = pt[0] + (rr() - 0.5) * 200, cy = pt[1] + (rr() - 0.5) * 200, rad = 20 + rr() * 300;
      const qa = a.queryCircle(cx, cy, rad), ra = key(qa), rb = key(b.queryCircle(cx, cy, rad));
      nQ++; if (ra !== rb) dQ++; if (ra.length) nonEmpty++; if (qa.some((x) => !COLLS.has(x.type))) farmIn++;
      if (key(bx.queryCircle(cx, cy, rad)) !== ra) dX++; }
  }
  ok(nonEmpty > nQ * 0.1 && I1.S.kept.bld > 200 && I1.S.rebuilt.bld > 20, '③ [상황] 질의가 실제로 걸렸고 켬 판이 **두 길을 다 밟았다**(그대로 둔 판 · 통째로 세운 판)',
    `빈 답 아님 ${nonEmpty}/${nQ} · 둠 ${I1.S.kept.bld} · 세움 ${I1.S.rebuilt.bld}`);
  ok(dX > 0, '③ ★미끼 — 켬 판이 통째로 세울 때 새 격자를 **안 채우면** 답이 갈린다(같은 줄에서 같이 선다는 것이 이 절의 뜻)', `다름 ${dX}`);
  ok(offSame && farmIn > 0, '③ 되돌림 판(끔)의 벽 질의 격자는 **옛 격자 그 물건**이다(밭·마당이 섞여 나온다 — 옛 몸통 그대로)', `밭 섞인 질의 ${farmIn}/${nQ}`);
  ok(dQ === 0, '③ ★★★켬(새 격자 · 그대로 두기/통째로) ↔ 끔(옛 격자) — 벽 질의 종류의 답 **무엇이** 비트 동일(술어는 종류로 거르고 칸마다 하나라 차례는 안 문다 — ② 가 술어 글자로 견줬다)', `다름 ${dQ}/${nQ}`);
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
