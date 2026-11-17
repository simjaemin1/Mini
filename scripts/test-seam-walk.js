#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// === scripts/test-seam-walk.js — 쇠재 · 한재 골짜기를 몸이 걸어서 넘는다 (T1311 · T1296 회부 3 · 4) ======================
//
// ★왜 [T1311] T1296 이 한반도 ↔ 닛폰 원 고개 둘(지름 115칸)을 폭 320(10칸) 골짜기로 바꿨다. `test-seam` ⑤ 는 땅(틈 · 꿰뚫음 · 거울)을 잰다.
//   이 하네스는 **몸 걸음**을 잰다 — 사람 한 걸음 정본(`sim/path-core.js localPath` · 4방 · 존 술어 = 바위 · 물 막힘 · 칸마다 그 칸의 주인 존)으로
//   골짜기 둘레 창(이음매 ±2,600px · 골짜기 y ±1,500px) 서쪽 끝 → 동쪽 끝, 동 → 서를 걷는다.
//   ① 두 골짜기 · 두 방향 다 길이 있다 · 길이 이음매를 **그 골짜기 안**(중심선 ±폭)에서 넘는다(창 안 다른 틈으로 돌지 않는다)
//   ② N틱 안에 넘는다 — 몸 걸음 `MOVE_SPEED`(zone.js · 64px/s) · `TICK_HZ` 30 으로 길 칸 수를 틱으로 · N = 직선 칸 × 1.25 의 틱
//   ③ 걸은 길의 가장 좁은 단면(길 칸에서 길에 수직인 열린 칸 줄) ≥ 정본 골짜기 폭 칸(한반도 골짜기 24 의 폭 · 10)
//   ④ 왕복 대칭 — 동 → 서 길 = 서 → 동 길의 뒤집기(path-core 정규화 계약 · 같은 복도)
//   ★미끼(자명 통과 금지 · 정본 json 을 고친 **새 술어 판**에서 같은 자를 돈다):
//     ⓐ 닛폰 골짜기 폭을 4칸(128)으로 줄인 사본 → ③ 빨강   ⓑ 한반도 짝 골짜기 끝(갈고리 · 이음매 쪽 마디)을 막은 사본 → ① 빨강
// 실행: node scripts/test-seam-walk.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const PC = require(path.join(ROOT, 'sim', 'path-core.js'));
const ZSRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const MOVE_SPEED = +((ZSRC.match(/^const MOVE_SPEED = (\d+)/m) || [])[1]);
const TICK_HZ = +((ZSRC.match(/^const TICK_HZ = (\d+)/m) || [])[1]);
const CELL = 32, NAMES = ['쇠재', '한재'];

// ★[T1320] 몸 길 바위 — 아이 판(손잡이 `T1320_ROCK_PATH` 는 모듈을 실을 때 읽는다 ⇒ 켬 · 끔을 프로세스로 가른다).
//   ⓐ 교역로 마디: 두 끝점이 열린 칸인데 마디가 바위 칸을 깎는 실제 자리(가상 시계 두 존 판이 잡은 한반도 교차 존 교역로 마디 (57680, 4176) → (57552, 4176) — 칸 중심 기준 바위 칸 셋을 가로지른다)
//   ⓑ 다시 붙기: 길 밖(한반도 쇠재 골짜기 서쪽 뭍 (68500, 39500))에 선 몸이 골짜기 안 닻(69157, 39973)으로 붙는다 — 곧은 줄이 능선을 가로지르는 자리
//   ⓒ 꼭짓점: 교역로 꼭짓점(코스 마디 중심)이 다리 옆 물 칸에 선 실제 자리(한반도 (52560, 12368) · (52560, 12496)) — 판의 막힌 걸음 대부분이 이 꼴(보고/T1320 §2)
//   ⓓ 같은 배열 계약(`_t1320ChainOf`) — 몸 길 · 장부 길 같음 검사(`T.path.pts === body.pts`)가 켬에서도 종전처럼 서야 한다
//   미끼 ⓐ = 다시 붙기만 곧은 줄로 되돌린 villages.js 사본(`T1320_BAIT=rejoin` · 손잡이 켬) · ⓑ = 손잡이 끔 · ⓒ = 고친 줄이 늘 새 배열인 사본(`T1320_BAIT=ident`)
//   몸은 존 정본 걸음 문(`_caravanBodyProbe.pts` = setBodyPts · `.walk` = _t1182Walk)으로 걷고, 길 도장(8px 걸음마다)을 존 술어(바위 · 물)로 센다.
// ★[T1327] 길 층 — 아이 판(손잡이 `T1327_ROUTE_FIX` 는 모듈을 실을 때 읽는다). 한반도 실지형(다리 칸 열림) 위 교역로 정본 A*(`computeRoutePts`)를 판다.
//   ⓐ 꼭짓점: 다리로 구제된 코스 노드(가운데 칸이 물)를 지나는 길 — 정적 전 쌍의 막힌 마디 대부분(보고/T1327 §1)
//   ⓑ 건널목: 코스 이웃 잇기가 다리 없는 강을 뛰어넘는 자리(63184, 56784 → 56656) — 켬이면 몸이 이을 수 있는 이음만(돌아간다)
//   ⓒ 도랑: 열린 땅 곧은 길을 가로지르는 도랑 줄(61칸)을 판 중에 놓고 `distBasisRefresh`(= zone.js `refreshDitchCells` 끝) — 그 칸을 지나던 길은 캐시에서 빠지고 다시 판 길은 도랑 0
//   ⓓ 정적 표본: 정적 전 쌍 감사에서 막힌 마디가 있던 실제 마을 쌍 여섯
//   ⓕ 모서리 깎기: 막힌 칸 모서리를 3px 만 깎는 곧은 몸 마디 — 켬은 표본이 아니라 지나는 칸 전부로 본다
//   ⓔ 몸 길: 환호 둘레 안 → 밖 마디(교차 존 합친 길이 지형만 보고 낸 마디의 꼴) — T1320 몸 잇기의 재경로 상한을 넘는 돌기는 상자 BFS(켬)
//   미끼(villages.js 사본 · 제자리 경로로 싣는다 · 파일 손 0): `T1327_BAIT=ditch` = 도랑 다시 굽기를 뺀 사본 · `edge` = 코스 이음 거름을 뺀 사본
if (process.argv[2] === '--routechild') {
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const TT = require(path.join(ROOT, 'server', 'terrain')); TT.setZonesMeta(ZONES);
  const BAITS = { ditch: ['  if (T1327_ROUTE_FIX) _t1327DitchRedig();', ''], edge: ['const _T598E = T598_ROUTE_EDGE || T1327_ROUTE_FIX;', 'const _T598E = T598_ROUTE_EDGE;'] };
  let V;
  if (BAITS[process.env.T1327_BAIT]) {
    const Module = require('module'), vf = require.resolve(path.join(ROOT, 'server', 'villages'));
    const SRC = fs.readFileSync(vf, 'utf8'), [A0, A1] = BAITS[process.env.T1327_BAIT];
    if (SRC.split(A0).length !== 2) { console.log('@@' + JSON.stringify({ err: '미끼 자리 못 찾음' })); process.exit(0); }
    const m = new Module(vf, module); m.filename = vf; m.paths = Module._nodeModulePaths(path.dirname(vf));
    require.cache[vf] = m; m._compile(SRC.replace(A0, A1), vf); m.loaded = true; V = m.exports;
  } else V = require(path.join(ROOT, 'server', 'villages'));
  const B3 = V.__p3Bind({}), S = B3.state, Z = 'hanbando', ZONE = ZONES[Z], BR = new Set();
  { const bl = ZONE.bridges || []; for (let i = 0; i + 1 < bl.length; i += 2) BR.add(bl[i] + '_' + bl[i + 1]); }
  const cached = (f) => { const MEMO = new Map(); return (x, y) => { const k = Math.floor(x / CELL) * 65536 + Math.floor(y / CELL); let v = MEMO.get(k); if (v === undefined) { v = f(x, y); MEMO.set(k, v); } return v; }; };   // 술어마다 제 메모
  const ctr = (x) => Math.floor(x / CELL) * CELL + 16;
  const isW = cached((x, y) => { try { return !!TT.isWaterCellLocal(Z, ctr(x), ctr(y)); } catch (e) { return false; } });
  const blk0 = cached((x, y) => x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight || !!TT.isRockCellLocal(Z, ctr(x), ctr(y)) || isW(x, y));
  const DIT = new Set(), blk = (x, y) => DIT.has(Math.floor(x / CELL) * 65536 + Math.floor(y / CELL)) || blk0(x, y);
  S.zoneId = Z;
  const ta = V.__labProbe.makeTerrainAdapter(TT, ZONE, { isTerrainBlockedLocal: blk, isWaterTileLocal: isW, isBridgeLocal: (x, y) => BR.has(Math.floor(x / CELL) + '_' + Math.floor(y / CELL)) });
  S._distCtx = { ta, ZONE }; S.routeCache = new Map();
  const walk = (pts) => { if (!pts) return null; let L = 0, b = 0; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], c = pts[i], d = Math.hypot(c.x - a.x, c.y - a.y); L += d;
    const k = Math.max(1, Math.ceil(d / 8)); for (let q = 1; q <= k; q++) if (ta.isBlocked(Math.floor((a.x + (c.x - a.x) * q / k) / CELL), Math.floor((a.y + (c.y - a.y) * q / k) / CELL))) b++; } return { L: Math.round(L), b, n: pts.length }; };
  const open = (x, y, dy) => { while (blk(x, y)) y += dy; return [x, y]; };
  const R = { on: V.t1327On ? V.t1327On() : null };
  { const a = open(15184, 56400 + 768, 32), b = open(15184, 56272 - 768, -32); R.vtxAt = [a, b]; R.vtx = walk(B3.computeRoutePts(a[0], a[1], b[0], b[1])); }
  { const a = [63184, 56784 + 512], b = [63184, 56656 - 512]; R.fordStraight = (() => { let n = 0; for (let y = b[1]; y <= a[1]; y += 8) if (blk(a[0], y)) n++; return n; })(); R.ford = walk(B3.computeRoutePts(a[0], a[1], b[0], b[1])); }
  { const A = [30000, 40000], Bp = [30000, 41600], r0 = B3.computeRoutePts(A[0], A[1], Bp[0], Bp[1]); R.ditchPre = walk(r0); S.routeCache.set('d', r0);
    const wy = Math.floor(40800 / CELL), cells = []; for (let cx = Math.floor(30000 / CELL) - 30; cx <= Math.floor(30000 / CELL) + 30; cx++) { DIT.add(cx * 65536 + wy); cells.push({ cx, cy: wy }); }
    S.villages = [{ _ditch: cells }]; V.distBasisRefresh();
    R.ditchDropped = !S.routeCache.has('d'); R.ditchPost = walk(B3.computeRoutePts(A[0], A[1], Bp[0], Bp[1])); }
  // ⓓ 정적 표본 — 정적 전 쌍 감사(`scripts/t1327-route-audit.js` · 부팅이 판 1,275쌍)에서 막힌 마디가 있던 실제 마을 쌍 여섯(바위 · 물 짧은 길 넷 · 건널목)
  //   마을 칸 = 정본 시드 한반도(`계측/T1327_2026-11-15/정적_*.json` 의 vil) · 길 = 같은 A* 문(캐시 0)
  R.sample = [['2_15', 2007, 218, 982, 684], ['31_49', 405, 3316, 428, 3489], ['26_37', 61, 1797, 161, 1667], ['20_44', 685, 732, 428, 939], ['9_17', 1655, 375, 1537, 554], ['1_3', 2120, 2117, 1425, 794]]
    .map(([k, ax, ay, bx, by]) => [k, walk(B3.computeRoutePts(ax * CELL + 16, ay * CELL + 16, bx * CELL + 16, by * CELL + 16))]);
  // ⓔ 몸 길(`setBodyPts` · T1320 몸 잇기 켬): 환호 둘레(반지름 30칸 · 출입구 서쪽 3칸) 안 마을 가운데 → 둘레 밖 동쪽 — 재경로 상한(900칸)을 넘는 돌기
  { DIT.clear(); const cx0 = Math.floor(30000 / CELL), cy0 = Math.floor(52000 / CELL), ring = [];
    for (let y = cy0 - 32; y <= cy0 + 32; y++) for (let x = cx0 - 32; x <= cx0 + 32; x++) { const d = Math.hypot(x - cx0, y - cy0); if (d >= 29.5 && d < 31 && !(x < cx0 && Math.abs(y - cy0) <= 1)) { DIT.add(x * 65536 + y); ring.push({ cx: x, cy: y }); } }
    Object.assign(S, { deps: { isTerrainBlockedLocal: blk, isBlockedByWall: () => false, players: new Map() } }); S.villages = [{ _ditch: ring }];
    const body = {}; V.__labProbe._caravanBodyProbe.pts(body, [{ x: cx0 * CELL + 16, y: cy0 * CELL + 16 }, { x: (cx0 + 45) * CELL + 16, y: cy0 * CELL + 16 }]);
    R.ringOpen = !blk(cx0 * CELL + 16, cy0 * CELL + 16) && !blk((cx0 + 45) * CELL + 16, cy0 * CELL + 16); R.ring = walk(body.pts); R.t1320 = V.t1320Stat ? V.t1320Stat() : null; }
  // ⓕ 모서리 깎기: 막힌 칸 하나의 모서리를 3px 만 깎는 곧은 몸 마디(SZ/4 표본 사이로 빠지는 꼴) — 1px 마다 잰다
  { DIT.clear(); const X = Math.floor(30000 / CELL) * CELL, Y = Math.floor(56000 / CELL) * CELL; DIT.add((X / CELL) * 65536 + Y / CELL); S.villages = [];
    const P0 = { x: X - 103, y: Y + 29 - 103 }, P1 = { x: X + 100, y: Y + 29 + 100 }, body = {}; V.__labProbe._caravanBodyProbe.pts(body, [P0, P1]);
    const w1 = (pts) => { let b = 0; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], c = pts[i], k = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.y - a.y))); for (let q = 0; q <= k; q++) if (blk(a.x + (c.x - a.x) * q / k, a.y + (c.y - a.y) * q / k)) b++; } return b; };
    R.cornerStraight = w1([P0, P1]); R.corner = w1(body.pts); R.cornerN = body.pts.length; }
  R.stat = V.t1327Stat ? V.t1327Stat() : null;
  console.log('@@' + JSON.stringify(R));
  process.exit(0);
}
if (process.argv[2] === '--rockchild') {
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const TT = require(path.join(ROOT, 'server', 'terrain')); TT.setZonesMeta(ZONES);
  // ★미끼 사본(`T1320_BAIT=rejoin`): 다시 붙기만 곧은 줄로 되돌린 villages.js 글자를 제자리 경로로 싣는다(파일 손 0)
  let V;
  //   `T1320_BAIT=ident`: 고친 줄이 늘 새 배열(같은 배열 계약을 깬 사본 — 장부 길 · 몸 길 같음 검사가 갈린다)
  const BAITS = { rejoin: ['T1320_ROCK_PATH ? _t1320Link({x:p.x,y:p.y},anchor) : [{x:p.x,y:p.y},anchor]', '[{x:p.x,y:p.y},anchor]'],
    ident: ['ch.every((q, i) => q.x === pts[i].x && q.y === pts[i].y)) ? pts : ch;', 'ch.every((q, i) => q.x === pts[i].x && q.y === pts[i].y)) ? ch : ch;'] };
  if (BAITS[process.env.T1320_BAIT]) {
    const Module = require('module'), vf = require.resolve(path.join(ROOT, 'server', 'villages'));
    const SRC = fs.readFileSync(vf, 'utf8'), [A0, A1] = BAITS[process.env.T1320_BAIT];
    if (SRC.split(A0).length !== 2) { console.log('@@' + JSON.stringify({ err: '미끼 자리 못 찾음' })); process.exit(0); }
    const m = new Module(vf, module); m.filename = vf; m.paths = Module._nodeModulePaths(path.dirname(vf));
    require.cache[vf] = m; m._compile(SRC.replace(A0, A1), vf); m.loaded = true; V = m.exports;
  } else V = require(path.join(ROOT, 'server', 'villages'));
  const P = V.__labProbe._caravanBodyProbe, B3 = V.__p3Bind({}), S = B3.state;
  const Z = 'hanbando', BR = new Set(); { const bl = ZONES[Z].bridges || []; for (let i = 0; i + 1 < bl.length; i += 2) BR.add(bl[i] + '_' + bl[i + 1]); }
  // 존 걸음 정본(`zone.js _terrBlocked0`)과 같은 뜻 — 바위 칸 · 물 칸(다리 칸은 열림)
  const blk = (x, y) => { const tx = Math.floor(x / CELL), ty = Math.floor(y / CELL), cx = tx * CELL + 16, cy = ty * CELL + 16; return TT.isRockCellLocal(Z, cx, cy) || (TT.isWaterCellLocal(Z, cx, cy) && !BR.has(tx + '_' + ty)); };
  const W = require(path.join(ROOT, 'server', 'zone-config')).WORLD;
  const straightRock = (a, b) => { let n = 0; const L = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8); for (let i = 0; i <= L; i++) if (blk(a.x + (b.x - a.x) * i / L, a.y + (b.y - a.y) * i / L)) n++; return n; };
  const run = (pts, start, target) => {
    const p = { pid: 'm', x: start.x, y: start.y, hp: 100 }, steps = [];
    Object.assign(S, { deps: { players: new Map([[p.pid, p]]), moveSpeed: 64, isPositionActive: () => true, isBlockedByWall: () => false, isTerrainBlockedLocal: blk }, dayMs: W.dayLengthMs,
      roads: { stampEntityPx: (who, x, y) => steps.push([x, y]) } });
    const body = { pid: p.pid, _t1182: true, escorts: [] }; P.pts(body, pts.map((q) => ({ x: q.x, y: q.y })));
    body.prog = target === 'end' ? 0 : target;
    const goal = target === 'end' ? body.len : target, anchorPt = target === 'end' ? body.pts[body.pts.length - 1] : { x: target === 'end' ? 0 : pts[1].x, y: pts[1].y };
    for (let i = 0; i < 20000; i++) { const want = target === 'end' ? Math.min(body.len, body.prog + 64 * 33.3 / 1000) : body.prog; P.walk(body, p, want, 33.3); if (Math.hypot(p.x - anchorPt.x, p.y - anchorPt.y) < 0.5 && (target !== 'end' || body.prog >= body.len - 0.5)) break; }
    return { steps: steps.length, rock: steps.filter(([x, y]) => blk(x, y)).length, end: [Math.round(p.x), Math.round(p.y)], reached: Math.hypot(p.x - anchorPt.x, p.y - anchorPt.y) < 0.5 };
  };
  const segA = [{ x: 57680, y: 4176 }, { x: 57552, y: 4176 }];
  const R = { on: V.t1320On ? V.t1320On() : null, stat: null, segStraightRock: straightRock(segA[0], segA[1]),
    seg: run(segA, segA[0], 'end') };
  const route = [{ x: 68720, y: 39952 }, { x: 69157, y: 39973 }, { x: 69595, y: 39995 }, { x: 70000, y: 40015 }];
  R.rejoinStraightRock = straightRock({ x: 68500, y: 39500 }, route[1]);
  R.rejoin = run(route, { x: 68500, y: 39500 }, Math.hypot(437, 21));
  // ⓒ 꼭짓점: 교역로 꼭짓점(코스 마디 중심)이 다리 옆 물 칸에 선 실제 자리(한반도 (52560, 12368) · (52560, 12496) — 다리는 서쪽 두 칸 줄)
  const vtx = [{ x: 52560, y: 12240 }, { x: 52560, y: 12368 }, { x: 52560, y: 12496 }, { x: 52560, y: 12624 }];
  R.vtxBlocked = vtx.filter((q) => blk(q.x, q.y)).length; R.vtxStraightRock = straightRock(vtx[0], vtx[3]);
  R.vtx = run(vtx, vtx[0], 'end');
  // ⓓ 같은 배열 계약: 고칠 것 없는 길 = 들어온 배열 그대로 · 같은 배열 두 번 = 같은 결과 배열 · 고친 배열을 다시 = 그대로(장부 길 `T.path.pts === body.pts` 검사가 종전처럼 선다)
  { const open = route.map((q) => ({ x: q.x, y: q.y })), fixIn = segA.map((q) => ({ x: q.x, y: q.y })), b0 = {}, b1 = {}, b2 = {}, b3 = {};
    P.pts(b0, open); P.pts(b1, fixIn); P.pts(b2, fixIn); P.pts(b3, b1.pts);
    R.ident = { open: b0.pts === open, twice: b1.pts === b2.pts, again: b3.pts === b1.pts, changed: b1.pts !== fixIn }; }
  R.stat = V.t1320Stat ? V.t1320Stat() : null;
  console.log('@@' + JSON.stringify(R));
  process.exit(0);
}
const GAME = path.join(ROOT, 'server', 'hanbando-terrain.json');

// 새 술어 판 — 정본 json 객체에 `mut` 를 건 뒤 terrain.js 를 새로 싣는다(술어가 처음 물을 때 json 을 굳힌다 · 미끼가 본판을 더럽히지 않게 판마다 새로)
function freshTerrain(mut) {
  for (const k of Object.keys(require.cache)) if (/server[\/\\](terrain|terrain-gen|zone-config|hanbando-terrain)/.test(k)) delete require.cache[k];
  const J = require(GAME);
  if (mut) mut(J);
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const T = require(path.join(ROOT, 'server', 'terrain'));
  T.setZonesMeta(ZONES);
  T.isRockCellLocal('nippon', 16, 16);   // 지금 굳힌다
  return { J, T, ZONES };
}

// 한 판 — 골짜기마다 서 → 동 · 동 → 서 몸 걸음
function walkAll(F) {
  const { J, T, ZONES } = F, HB = ZONES.hanbando, NP = ZONES.nippon, SX = NP.worldOffsetX;
  const blockedW = (wx, wy) => {
    const zid = wx < SX ? 'hanbando' : 'nippon', Z = ZONES[zid], lx = wx - Z.worldOffsetX, ly = wy - Z.worldOffsetY;
    if (lx < 0 || ly < 0 || lx >= Z.zoneWidth || ly >= Z.zoneHeight) return true;
    return !!(T.isWaterCellLocal(zid, lx, ly) || T.isRockCellLocal(zid, lx, ly));
  };
  const W0 = Math.max(...(J.hanbando.valleys || []).flatMap((v) => v.path.map((p) => p.width)));   // 정본 골짜기 폭(한반도 · px)
  const out = [];
  for (const nm of NAMES) {
    const v = (J.nippon.valleys || []).find((x) => x.name === nm);
    if (!v) { out.push({ nm, none: true }); continue; }
    // 이음매(닛폰 x 0)에서 골짜기 중심선 y(세계)
    const P = v.path.map((p) => p.pos); let ly = null;
    for (let i = 0; i + 1 < P.length; i++) { const [ax, ay] = P[i], [bx, by] = P[i + 1]; if ((ax <= 0 && bx >= 0) || (bx <= 0 && ax >= 0)) { ly = ay + (by - ay) * (ax === bx ? 0 : (0 - ax) / (bx - ax)); break; } }
    if (ly == null) ly = P[0][1];
    const vy = ly + NP.worldOffsetY, wmax = Math.max(...v.path.map((p) => p.width));
    // 창(칸) — 원점 = 창 왼쪽 위 세계 px
    const x0 = SX - 2600, y0 = Math.round(vy - 1500), NX = Math.ceil(5200 / CELL), NY = Math.ceil(3000 / CELL);
    const B = new Uint8Array(NX * NY); for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) B[j * NX + i] = blockedW(x0 + i * CELL + 16, y0 + j * CELL + 16) ? 1 : 0;
    const blk = (i, j) => (i < 0 || j < 0 || i >= NX || j >= NY) ? true : B[j * NX + i] === 1;
    const openNear = (i) => { const jc = Math.round((vy - y0) / CELL); for (let d = 0; d < NY; d++) for (const s of [1, -1]) { const j = jc + s * d; if (!blk(i, j)) return j; } return null; };
    const iW = 1, iE = NX - 2, jW = openNear(iW), jE = openNear(iE);
    const opts = { blockedStep: (fx, fy, tx, ty) => blk(tx, ty), maxNodes: NX * NY + 16 };
    const we = (jW != null && jE != null) ? PC.localPath(iW, jW, iE, jE, opts) : null;
    const ew = (jW != null && jE != null) ? PC.localPath(iE, jE, iW, jW, opts) : null;
    const r = { nm, vy, wmax, W0, start: [iW, jW], goal: [iE, jE], we: !!we, ew: !!ew };
    if (we) {
      // 이음매를 넘는 칸 — 길 칸 중 세계 x 가 이음매를 넘는 첫 마디
      let cross = null; for (let k = 1; k < we.length; k++) { const xa = x0 + we[k - 1].x * CELL + 16, xb = x0 + we[k].x * CELL + 16; if (xa < SX && xb >= SX) { cross = y0 + we[k].y * CELL + 16; break; } }
      r.crossY = cross; r.inValley = cross != null && Math.abs(cross - vy) <= wmax;
      r.cells = we.length - 1; r.straight = iE - iW + Math.abs(jE - jW);
      r.ticks = Math.ceil(r.cells * CELL / (MOVE_SPEED / TICK_HZ)); r.N = Math.ceil(r.straight * 1.25 * CELL / (MOVE_SPEED / TICK_HZ));
      // 가장 좁은 단면 — 길 마디마다 걸음 방향에 수직(가로 걸음이면 세로 · 세로 걸음이면 가로)으로 열린 칸 줄 · 넓은 뭍(창 끝까지 열림 · 40칸 넘음)은 안 센다
      let narrow = Infinity, at = null;
      for (let k = 1; k < we.length; k++) {
        const a = we[k - 1], b = we[k], vert = a.x !== b.x;   // 가로로 걸었으면 세로 단면
        let n = 1;
        if (vert) { for (let j = b.y - 1; !blk(b.x, j) && n <= 40; j--) n++; for (let j = b.y + 1; !blk(b.x, j) && n <= 40; j++) n++; }
        else { for (let i = b.x - 1; !blk(i, b.y) && n <= 40; i--) n++; for (let i = b.x + 1; !blk(i, b.y) && n <= 40; i++) n++; }
        if (n <= 40 && n < narrow) { narrow = n; at = x0 + b.x * CELL + 16 - SX; }
      }
      r.narrow = narrow === Infinity ? null : narrow; r.narrowAt = at;
      r.sym = !!ew && ew.length === we.length && ew.every((p, k) => p.x === we[we.length - 1 - k].x && p.y === we[we.length - 1 - k].y);
    }
    out.push(r);
  }
  return out;
}
const fmt = (r) => r.we ? `이음매 y ${Math.round(r.crossY - 49984)}(한반도 로컬 · 골짜기 ${Math.round(r.vy - 49984)}) · ${r.cells}칸 · ${r.ticks}틱 ≤ ${r.N} · 가장 좁은 단면 ${r.narrow}칸 @이음매 ${r.narrowAt}px` : '길 없음';

console.log('\n=== 쇠재 · 한재 골짜기 몸 걸음 (T1311) ===');
ok(MOVE_SPEED > 0 && TICK_HZ > 0, '전제 — 몸 걸음 · 틱(zone.js 정본 글자)', `MOVE_SPEED ${MOVE_SPEED}px/s · TICK_HZ ${TICK_HZ}`);
const base = walkAll(freshTerrain(null));
for (const r of base) {
  if (r.none) { ok(false, `${r.nm} — 닛폰 골짜기가 있다`); continue; }
  ok(r.we && r.ew, `① ${r.nm} — 서 → 동 · 동 → 서 몸 길이 있다(걸음 정본 · 4방 · 바위 · 물 막힘)`, fmt(r));
  ok(r.we && r.inValley, `① ${r.nm} — 길이 이음매를 그 골짜기 안(중심선 ±${r.wmax}px)에서 넘는다`, r.we ? `넘는 y 차 ${Math.round(Math.abs(r.crossY - r.vy))}px` : '');
  ok(r.we && r.ticks <= r.N, `② ${r.nm} — N틱 안에 넘는다(직선 칸 × 1.25)`, r.we ? `${r.ticks}틱 · N ${r.N}` : '');
  ok(r.we && r.narrow != null && r.narrow >= Math.round(r.W0 / CELL), `③ ${r.nm} — 걸은 길 가장 좁은 단면 ≥ 정본 골짜기 폭(${Math.round(r.W0 / CELL)}칸)`, r.we ? `${r.narrow}칸` : '');
  ok(r.we && r.sym, `④ ${r.nm} — 동 → 서 길 = 서 → 동 길 뒤집기(같은 복도)`, '');
}
// ★미끼 ⓐ — 닛폰 골짜기 둘 폭 128(4칸)
const bA = walkAll(freshTerrain((J) => { for (const v of J.nippon.valleys) if (NAMES.includes(v.name)) for (const p of v.path) p.width = 128; }));
ok(bA.every((r) => r.we && r.narrow != null && r.narrow < Math.round(r.W0 / CELL)), '★미끼 ⓐ 닛폰 골짜기 폭을 4칸으로 줄인 사본 → ③ 빨강(좁은 단면 < 정본 폭)', bA.map((r) => `${r.nm} ${r.we ? r.narrow + '칸' : '길 없음'}`).join(' · '));
// ★미끼 ⓑ — 한반도 짝 골짜기의 이음매 쪽 마디(갈고리 · 끝 둘)를 걷어 그 골짜기가 산 띠 안에서 끝나게
const bB = walkAll(freshTerrain((J) => { for (const v of J.hanbando.valleys) if (NAMES.includes(v.name)) v.path = v.path.slice(0, 2); }));
ok(bB.every((r) => !r.we || !r.inValley), '★미끼 ⓑ 한반도 짝 골짜기 끝(갈고리)을 막은 사본 → ① 빨강(길 없음 또는 다른 틈)', bB.map((r) => `${r.nm} ${r.we ? '다른 틈 y ' + Math.round(r.crossY - 49984) : '길 없음'}`).join(' · '));
// ⑤ [T1320] 몸 길 바위 — 손잡이 켬이면 바위 위 걸음 0 · ★미끼 = 끔(곧은 줄 그대로)이면 빨강
{
  const { spawnSync } = require('child_process');
  const kid = (on, bait) => { const r = spawnSync(process.execPath, [__filename, '--rockchild'], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { T1320_ROCK_PATH: on ? '1' : '0', T1320_BAIT: bait || '' }), maxBuffer: 1 << 24 });
    const l = (r.stdout || '').split('\n').find((x) => x.startsWith('@@')); return l ? JSON.parse(l.slice(2)) : { err: (r.stderr || '').slice(-300) }; };
  const ON = kid(true), OFF = kid(false), BAIT = kid(true, 'rejoin'), BAIT2 = kid(true, 'ident');
  ok(ON.segStraightRock > 0 && ON.rejoinStraightRock > 0, '⑤ 전제 [T1320] — 두 자리의 곧은 줄이 바위 칸을 지난다(자명 통과 금지)', `교역로 마디 ${ON.segStraightRock} · 다시 붙기 ${ON.rejoinStraightRock}점`);
  ok(ON.on === true && ON.seg && ON.seg.rock === 0 && ON.seg.reached, '⑤a [T1320] 손잡이 켬 — 교역로 마디가 바위를 깎는 자리에서 몸 걸음 바위 0 · 끝에 닿는다', JSON.stringify(ON.seg || ON));
  ok(ON.rejoin && ON.rejoin.rock === 0 && ON.rejoin.reached, '⑤b [T1320] 손잡이 켬 — 길 밖 몸의 다시 붙기 걸음 바위 0 · 닻에 닿는다', JSON.stringify(ON.rejoin || ON));
  ok(ON.vtxBlocked > 0 && ON.vtx && ON.vtx.rock === 0 && ON.vtx.reached, '⑤c [T1320] 손잡이 켬 — 교역로 꼭짓점이 다리 옆 물 칸에 선 자리에서 몸 걸음 막힌 칸 0 · 끝에 닿는다', `막힌 꼭짓점 ${ON.vtxBlocked} · ${JSON.stringify(ON.vtx || ON)}`);
  ok(ON.ident && ON.ident.open && ON.ident.twice && ON.ident.again && ON.ident.changed, '⑤d [T1320] 손잡이 켬 — 같은 배열 계약(고칠 것 없음 = 그 배열 · 같은 배열 두 번 = 같은 결과 · 고친 배열 다시 = 그대로)', JSON.stringify(ON.ident || ON));
  ok(OFF.ident && OFF.ident.open && OFF.ident.twice && OFF.ident.again && !OFF.ident.changed, '⑤d′ [T1320] 손잡이 끔 — 몸 길 = 들어온 배열 그대로(종전 글자)', JSON.stringify(OFF.ident || OFF));
  ok(BAIT.on === true && BAIT.seg && BAIT.seg.rock === 0 && BAIT.rejoin && BAIT.rejoin.rock > 0, '⑤★미끼 ⓐ — 다시 붙기만 곧은 줄로 되돌린 사본(손잡이 켬)이면 다시 붙기 바위 걸음이 선다(빨강)', `마디 ${BAIT.seg && BAIT.seg.rock} · 다시 붙기 ${BAIT.rejoin && BAIT.rejoin.rock}${BAIT.err ? ' · ' + BAIT.err : ''}`);
  ok(BAIT2.ident && !(BAIT2.ident.open && BAIT2.ident.twice && BAIT2.ident.again), '⑤★미끼 ⓒ — 고친 줄이 늘 새 배열인 사본이면 ⑤d 가 빨강', JSON.stringify(BAIT2.ident || BAIT2));
  ok(OFF.on === false && OFF.seg && OFF.seg.rock > 0 && OFF.rejoin && OFF.rejoin.rock > 0 && OFF.vtx && OFF.vtx.rock > 0, '⑤★미끼 ⓑ — 끔(곧은 줄 그대로)이면 세 자리 다 막힌 칸 걸음이 선다(빨강)', `마디 ${OFF.seg && OFF.seg.rock} · 다시 붙기 ${OFF.rejoin && OFF.rejoin.rock} · 꼭짓점 ${OFF.vtx && OFF.vtx.rock}`);
}
// ⑥ [T1327] 길 층 — 손잡이 켬이면 교역로가 막힌 칸을 안 지난다(꼭짓점 · 건널목 · 판 중 도랑) · ★미끼: 도랑 다시 굽기 뺀 사본 · 코스 이음 거름 뺀 사본 · 끔
{
  const { spawnSync } = require('child_process');
  const kid = (on, bait) => { const r = spawnSync(process.execPath, [__filename, '--routechild'], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { T1327_ROUTE_FIX: on ? '1' : '0', T1320_ROCK_PATH: '1', T1327_BAIT: bait || '' }), maxBuffer: 1 << 24 });
    const l = (r.stdout || '').split('\n').find((x) => x.startsWith('@@')); return l ? JSON.parse(l.slice(2)) : { err: (r.stderr || '').slice(-300) }; };
  const ON = kid(true), OFF = kid(false), BD = kid(true, 'ditch'), BE = kid(true, 'edge');
  const b = (w) => (w ? w.b : null);
  ok(OFF.on === false && b(OFF.vtx) > 0 && b(OFF.ford) > 0 && OFF.fordStraight > 0 && b(OFF.ditchPre) === 0 && b(OFF.ditchPost) > 0, '⑥ 전제 [T1327] — 끔이면 세 자리 다 교역로가 막힌 칸을 지난다(자명 통과 금지)', `꼭짓점 ${b(OFF.vtx)} · 건널목 ${b(OFF.ford)} · 도랑 앞 ${b(OFF.ditchPre)} → 뒤 ${b(OFF.ditchPost)}`);
  ok(ON.on === true && ON.vtx && ON.vtx.b === 0, '⑥a [T1327] 켬 — 다리로 구제된 코스 노드를 지나는 길이 막힌 칸 0(꼭짓점 = 몸 칸)', JSON.stringify(ON.vtx || ON));
  ok(ON.ford && ON.ford.b === 0 && OFF.ford && ON.ford.L > OFF.ford.L, '⑥b [T1327] 켬 — 다리 없는 건널목을 안 뛰어넘는다(막힌 칸 0 · 돌아간다)', `${JSON.stringify(ON.ford)} ← 끔 ${JSON.stringify(OFF.ford)}`);
  ok(ON.ditchDropped === true && ON.ditchPost && ON.ditchPost.b === 0, '⑥c [T1327] 켬 — 판 중 도랑이 실리면 그 칸을 지나던 길이 캐시에서 빠지고 다시 판 길은 도랑 0', `빠짐 ${ON.ditchDropped} · ${JSON.stringify(ON.ditchPost)}`);
  const sb = (X) => (X.sample || []).map(([k, w]) => (w ? w.b : -1));
  ok(sb(OFF).length === 6 && sb(OFF).every((x) => x > 0) && sb(ON).length === 6 && sb(ON).every((x) => x === 0), '⑥d [T1327] 정적 표본 — 막힌 마디가 있던 실제 마을 쌍 여섯이 켬이면 막힌 칸 0(끔은 모두 > 0 · 다 닿음)', `끔 ${sb(OFF).join(' · ')} → 켬 ${sb(ON).join(' · ')}`);
  ok(ON.ringOpen && OFF.ring && OFF.ring.b > 0 && ON.ring && ON.ring.b === 0, '⑥e [T1327] 켬 — 몸 길(T1320 몸 잇기 켬)이 환호 둘레 안 → 밖 마디를 출입구로 돈다(재경로 상한 밖 · 막힌 칸 0 · 끔은 둘레를 밟는다)', `켬 ${JSON.stringify(ON.ring)} · 끔 ${JSON.stringify(OFF.ring)}`);
  ok(ON.cornerStraight > 0 && ON.corner === 0 && OFF.corner > 0, '⑥f [T1327] 켬 — 막힌 칸 모서리를 표본 사이로 깎는 곧은 몸 마디도 잡는다(지나는 칸 전부 · 1px 잼 0 · 끔은 깎는다)', `곧은 줄 ${ON.cornerStraight}px · 켬 ${ON.corner}px(점 ${ON.cornerN}) · 끔 ${OFF.corner}px`);
  ok(BD.on === true && !(BD.ditchDropped === true && BD.ditchPost && BD.ditchPost.b === 0), '⑥★미끼 ⓐ — 도랑 다시 굽기를 뺀 사본(켬)이면 ⑥c 빨강', `빠짐 ${BD.ditchDropped} · ${JSON.stringify(BD.ditchPost)}${BD.err ? ' · ' + BD.err : ''}`);
  ok(BE.on === true && !(BE.ford && BE.ford.b === 0), '⑥★미끼 ⓑ — 코스 이음 거름을 뺀 사본(켬)이면 ⑥b 빨강', `${JSON.stringify(BE.ford)}${BE.err ? ' · ' + BE.err : ''}`);
}
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
