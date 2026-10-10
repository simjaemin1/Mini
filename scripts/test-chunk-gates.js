#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-chunk-gates.js — T678 청크 문 그래프 1단계 · T679 2단계(회랑 BFS · 표 상한)(`server/chunk-gates.js`) ==============
//
// 합성 세계(강 셋 · 다리 · 바위 · 벽 변 · 한 방향 벽) 위에서:
//   ① 닿는가 — 문 그래프의 답 = **창(청크 상자) 안 전수 BFS** 의 답(건전 · 완전) · 칸 A*(`pathfind.findPath` 예산 없음 · 반경 64)와의 차표
//   ② 문 길이 **걸을 수 있는 길**이다(이웃 칸 · 통행 · 간선 열림 · 목표에서 끝) · 길이 ÷ 최단(창 BFS) 분포
//   ③ 조각 짓기 = 한 번에 짓기(표 비트 같음) · 한 틱 예산 안
//   ④ 무효화 — 벽을 놓으면 그 청크(와 이웃)만 낡고, 낡은 표는 다시 지어질 때까지 쓰이며, 다시 지은 뒤 답이 새 벽을 따른다 · 지형 판 전부
//   ⑤ 자명 통과 금지 — 간선 비트를 망가뜨리면 ② 가 문다 · 건너기 통행 확인을 빼면 ② 가 문다 · 구간 끊기 규칙을 빼면 ① 이 문다
//   ⑥ [T679] 표 상한(LRU) — 상한을 넘지 않는다 · 버린 청크는 다시 물으면 `unknown` → 다시 지은 뒤 답이 같다 · 창 청크 수
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const G = require(path.join(ROOT, 'server', 'chunk-gates.js'));
const PF = require(path.join(ROOT, 'server', 'pathfind.js'));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

let rs = 678; const rnd = () => { rs = (rs * 1103515245 + 12345) >>> 0; return rs / 4294967296; };
const CW = 224, CH = 192, C = 32, R = 64;
function makeWorld(seed) {
  rs = seed;
  const blk = new Uint8Array(CW * CH), wallE = new Uint8Array(CW * CH), wallS = new Uint8Array(CW * CH), oneWay = new Set();
  for (const rx of [40, 110, 170]) for (let y = 0; y < CH; y++) { const w = 3 + ((y / 17) | 0) % 3; for (let x = rx; x < rx + w; x++) blk[y * CW + x] = 1; }
  for (let i = 0; i < 9; i++) { const by = (rnd() * CH) | 0; for (let x = 0; x < CW; x++) if (blk[by * CW + x]) blk[by * CW + x] = 0; }   // 다리
  for (let i = 0; i < 1600; i++) blk[((rnd() * CH) | 0) * CW + ((rnd() * CW) | 0)] = 1;   // 바위
  for (let i = 0; i < 2500; i++) { const c = ((rnd() * CH) | 0) * CW + ((rnd() * CW) | 0); (rnd() < 0.5 ? wallE : wallS)[c] = 1; }   // 벽 변
  for (let i = 0; i < 40; i++) { const x = 30 + ((rnd() * 160) | 0), y = 10 + ((rnd() * 170) | 0); for (let k = 0; k < 12; k++) wallE[(y + k) * CW + x] = 1; }   // 긴 벽(청크 경계에 걸리는 것 포함)
  for (let i = 0; i < 60; i++) oneWay.add(((rnd() * CH) | 0) * CW + ((rnd() * CW) | 0));   // 한 방향(동→서 막힘)
  const P = (cx, cy) => cx >= 0 && cy >= 0 && cx < CW && cy < CH && !blk[cy * CW + cx];
  const S = (fx, fy, tx, ty) => {   // 열렸나(fx,fy → tx,ty · 이웃)
    if (tx < 0 || ty < 0 || tx >= CW || ty >= CH) return false;
    if (tx === fx + 1) { if (wallE[fy * CW + fx]) return false; }
    else if (tx === fx - 1) { if (wallE[ty * CW + tx] || oneWay.has(fy * CW + fx)) return false; }
    else if (ty === fy + 1) { if (wallS[fy * CW + fx]) return false; }
    else if (ty === fy - 1) { if (wallS[ty * CW + tx]) return false; }
    return true;
  };
  return { blk, wallE, wallS, P, S };
}
// 창 안 전수 BFS(앞으로 가는 간선 · 노드 통행) — 최단 걸음 수 · 못 닿으면 -1
function bfsWin(Wd, sx, sy, gx, gy) {
  const X0 = Math.max(0, Math.floor((sx - R) / C)) * C, X1 = Math.min(CW, (Math.floor((sx + R) / C) + 1) * C);
  const Y0 = Math.max(0, Math.floor((sy - R) / C)) * C, Y1 = Math.min(CH, (Math.floor((sy + R) / C) + 1) * C);
  const W = X1 - X0, H = Y1 - Y0, D = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H);
  if (!Wd.P(sx, sy) || !Wd.P(gx, gy)) return -1;
  let qh = 0, qt = 0; D[(sy - Y0) * W + sx - X0] = 0; q[qt++] = (sy - Y0) * W + sx - X0;
  while (qh < qt) { const u = q[qh++], ux = u % W + X0, uy = ((u / W) | 0) + Y0;
    if (ux === gx && uy === gy) return D[u];
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const vx = ux + dx, vy = uy + dy;
      if (vx < X0 || vy < Y0 || vx >= X1 || vy >= Y1) continue; const v = (vy - Y0) * W + vx - X0;
      if (D[v] >= 0 || !Wd.P(vx, vy) || !Wd.S(ux, uy, vx, vy)) continue; D[v] = D[u] + 1; q[qt++] = v; } }
  return -1;
}
const mkG = (Wd) => G.create({ chunkCells: C, cellsW: CW, cellsH: CH, pass: Wd.P, step: Wd.S });
const validPath = (Wd, sx, sy, gx, gy, cells) => { let x = sx, y = sy;
  for (const [cx, cy] of cells) { if (Math.abs(cx - x) + Math.abs(cy - y) !== 1 || !Wd.P(cx, cy) || !Wd.S(x, y, cx, cy)) return false; x = cx; y = cy; }
  return x === gx && y === gy; };
const pairs = (n, seed) => { rs = seed; const a = []; while (a.length < n) { const sx = (rnd() * CW) | 0, sy = (rnd() * CH) | 0; const gx = Math.min(CW - 1, Math.max(0, sx + ((rnd() - 0.5) * 2 * R) | 0)), gy = Math.min(CH - 1, Math.max(0, sy + ((rnd() - 0.5) * 2 * R) | 0));
  if (Math.abs(gx - sx) + Math.abs(gy - sy) <= R) a.push([sx, sy, gx, gy]); } return a; };

console.log('\n① 닿는가 — 문 그래프 = 창 안 전수 BFS · 칸 A*(예산 없음) 와의 차');
const W1 = makeWorld(11), G1 = mkG(W1);
G1.enqueueAll(); G1.tick(Infinity);
const st1 = G1.stats();
ok(st1.recs === Math.ceil(CW / C) * Math.ceil(CH / C) && st1.gates > 0, '① [전제] 청크 전부 지었다 · 문이 있다', `청크 ${st1.recs} · 문 ${st1.gates} · ${st1.memMB}MB`);
const PS = pairs(3000, 99);
let agree = 0, n = 0, found = 0, bad = 0, ratio = [], ratioOld = [], pfAgree = 0, pfN = 0, gOnlyPf = 0, pfOnly = 0;
for (const [sx, sy, gx, gy] of PS) {
  const r = G1.route(sx, sy, gx, gy, R), b = bfsWin(W1, sx, sy, gx, gy);
  const gr = r.res === 'found', br = b >= 0; n++;
  if (gr === br) agree++;
  if (gr) { found++; if (!validPath(W1, sx, sy, gx, gy, r.cells)) bad++; else if (b > 0) ratio.push(r.cells.length / b);
    if (b > 0 && found <= 1500) { const o = G1.route(sx, sy, gx, gy, R, true); if (o.cellsOld && validPath(W1, sx, sy, gx, gy, o.cellsOld)) ratioOld.push(o.cellsOld.length / b); } }
  if (pfN < 600) {   // 칸 A*(종전 정본 · 예산 없음 · 같은 반경) — 벽 술어는 pathfind 가 (from → to) 로 부른다
    const wp = PF.findPath(sx * 32 + 16, sy * 32 + 16, gx * 32 + 16, gy * 32 + 16, { maxCells: Infinity, searchRadiusCells: R,
      isBlockedFn: (ax, ay, bx2, by2) => !W1.S(Math.floor(ax / 32), Math.floor(ay / 32), Math.floor(bx2 / 32), Math.floor(by2 / 32)), isWaterFn: (x, y) => !W1.P(Math.floor(x / 32), Math.floor(y / 32)) });
    pfN++; if (!!wp === gr) pfAgree++; else if (gr) gOnlyPf++; else pfOnly++;
  }
}
ok(agree === n, '① ★닿는가 — 문 그래프 = 창(청크 상자) 안 전수 BFS(건전 · 완전 · 한 방향 벽 · 청크 경계에 걸친 긴 벽)', `${agree}/${n} · 닿음 ${found}`);
ok(pfOnly === 0, '① 칸 A*(예산 없음 · 반경 64)가 닿는데 문 그래프가 못 닿는 쌍 0(문 그래프가 "못 닿음"이라 null 을 내는 자리가 A* 보다 넓지 않다)', `일치 ${pfAgree}/${pfN} · 문만 닿음 ${gOnlyPf}(창은 청크 상자 — 반경 밖 우회) · A* 만 ${pfOnly}`);

console.log('\n② 문 길은 걸을 수 있는 길 · 길이 ÷ 최단');
const qa = (a, p) => { const t = a.slice().sort((x, y) => x - y); return t.length ? +t[Math.min(t.length - 1, Math.floor(t.length * p))].toFixed(3) : null; };
const qq = (p) => qa(ratio, p);
ok(bad === 0 && found > 500, '② ★문 길 전부 — 이웃 칸 · 통행 · 간선 열림 · 목표에서 끝', `틀린 길 ${bad}/${found}`);
console.log(`    ↳ 길이 ÷ 최단(창 BFS): 회랑(T679) p50 ${qq(0.5)} · p95 ${qq(0.95)} · 최대 ${qq(1)} ‖ 내려가기(T678) p50 ${qa(ratioOld, 0.5)} · p95 ${qa(ratioOld, 0.95)} · 최대 ${qa(ratioOld, 1)}(${ratioOld.length}쌍)`);
ok(qq(0.5) === 1 && qq(0.95) <= 1.15, '② ★[T679] 길이 — 회랑 BFS 길 ÷ 창 최단 p50 1 · p95 ≤ 1.15(카드 목표)', `p50 ${qq(0.5)} · p95 ${qq(0.95)}`);
ok(ratio.every((x) => x >= 1), '② 회랑 길은 창 최단보다 짧지 않다(최단이 정말 최단 — 자 확인)', `최소 ${qa(ratio, 0)}`);
ok(ratioOld.length > 500 && qa(ratioOld, 0.95) > qq(0.95), '② [대조] 종전 내려가기 길(대표 칸 들름)은 꼬리가 더 길다 — 같은 쌍', `내려가기 p95 ${qa(ratioOld, 0.95)} > 회랑 ${qq(0.95)}`);

console.log('\n③ 조각 짓기 = 한 번에 짓기 · 한 틱 예산');
const G3 = mkG(W1); let ticks = 0, maxUsed = 0;
{ let calls = 0; const P0 = W1.P, S0 = W1.S;
  const G3b = G.create({ chunkCells: C, cellsW: CW, cellsH: CH, pass: (a, b) => { calls++; return P0(a, b); }, step: (a, b, c, d) => { calls++; return S0(a, b, c, d); } });
  for (const [sx, sy, gx, gy] of PS.slice(0, 50)) G3b.route(sx, sy, gx, gy, R);   // 물어서 줄을 세운다
  while (G3b.stats().queue > 0 || ticks === 0) { const c0 = calls; G3b.tick(1500); ticks++; maxUsed = Math.max(maxUsed, calls - c0); if (ticks > 100000) break; }
  let same = 0, tot = 0;
  for (const [ci, r] of G3b._recs) { const r1 = G1._recs.get(ci); tot++;
    const eq = r1 && Buffer.compare(Buffer.from(r.pass), Buffer.from(r1.pass)) === 0 && Buffer.compare(Buffer.from(r.open), Buffer.from(r1.open)) === 0 && r.gates.length === r1.gates.length
      && r.gates.every((g, i) => g.key === r1.gates[i].key && g.c === r1.gates[i].c && Buffer.compare(Buffer.from(g.T.buffer), Buffer.from(r1.gates[i].T.buffer)) === 0);
    if (eq) same++; }
  ok(same === tot && tot > 0, '③ ★조각(틱당 1,500)으로 지은 표 = 한 번에 지은 표(통행 · 간선 · 문 · 거리 표 비트)', `${same}/${tot} 청크 · ${ticks} 틱`);
  ok(maxUsed <= 1500 + 4, '③ 한 틱 술어 부름 ≤ 예산(1,500 + 한 단계 덧 ≤ 4)', `최대 ${maxUsed}`);
}
void G3;

console.log('\n④ 무효화 — 벽 하나 · 지형 판');
{
  const W4 = makeWorld(11), G4 = mkG(W4); G4.enqueueAll(); G4.tick(Infinity);
  // 닿는 쌍 하나를 골라 그 길 한가운데 칸을 둘러싼다(사방 벽) — 그 칸을 지나는 길은 못 쓴다
  let pick = null;
  for (const [sx, sy, gx, gy] of PS) { const r = G4.route(sx, sy, gx, gy, R); if (r.res === 'found' && r.cells.length > 20) { pick = { sx, sy, gx, gy, r }; break; } }
  const [mx, my] = pick.r.cells[(pick.r.cells.length / 2) | 0];
  W4.blk[my * CW + mx] = 1;   // 그 칸을 바위로
  const ci = G4.chunkOf(mx, my);
  G4.invalidateAll();   // 지형이 바뀌었다(다리·환호 꼴) — 전부 낡는다
  const stale = G4.route(pick.sx, pick.sy, pick.gx, pick.gy, R);
  const usedStale = stale.res === 'found' && stale.cells.some(([x, y]) => x === mx && y === my);
  const q0 = G4.stats().queue;
  while (G4.stats().queue > 0) G4.tick(1500);
  const fresh = G4.route(pick.sx, pick.sy, pick.gx, pick.gy, R);
  const avoids = fresh.res !== 'found' || !fresh.cells.some(([x, y]) => x === mx && y === my);
  const truth = bfsWin(W4, pick.sx, pick.sy, pick.gx, pick.gy);
  ok(usedStale && q0 > 0, '④ 낡은 표는 다시 지어질 때까지 **그대로 쓰인다**(그 사이 길은 옛 길 — 걸음은 콜라이더가 막고 막힘 감지가 다시 묻는다) · 물은 청크는 다시 짓기 줄에 선다', `옛 길이 그 칸 지남 ${usedStale} · 줄 ${q0}`);
  ok(avoids && ((fresh.res === 'found') === (truth >= 0)) && (fresh.res !== 'found' || validPath(W4, pick.sx, pick.sy, pick.gx, pick.gy, fresh.cells)), '④ ★다시 지은 뒤 — 새 바위를 피한 길(또는 못 닿음) = 창 BFS 의 답', `${fresh.res} · 최단 ${truth}`);
  // 건물 서명 쓸기 — 서명이 바뀐 청크와 이웃 넷만 낡는다
  const sigs = new Map(); const sigOf = (X, Y) => [sigs.get(X + ',' + Y) || 's0', 1];
  G4.sweep(Infinity, sigOf);
  const cx = Math.floor(mx / C), cy = Math.floor(my / C); sigs.set(cx + ',' + cy, 's1');
  G4.sweep(Infinity, sigOf);
  let dirty = 0; for (const r of G4._recs.values()) if (r.dirty) dirty++;
  const nb = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => G4._recs.has((cy + dy) * Math.ceil(CW / C) + cx + dx) && cx + dx >= 0 && cx + dx < Math.ceil(CW / C)).length;
  ok(dirty === nb && ci === cy * Math.ceil(CW / C) + cx, '④ 건물 서명이 바뀐 청크는 **그 청크와 이웃 넷만** 낡는다(경계 간선이 이웃 건물에도 기댄다)', `낡음 ${dirty} = ${nb}`);
}

console.log('\n⑤ 자명 통과 금지');
{
  const W5 = makeWorld(11), G5 = mkG(W5); G5.enqueueAll(); G5.tick(Infinity);
  // 간선 비트 망가뜨리기 — 청크 안 칸마다 막힌 이웃 쪽 비트를 연다(회랑 BFS 는 청크 안 이웃 통행을 비트에 맡긴다)
  let corrupt = 0;
  for (const r of G5._recs.values()) for (let c = 0; c < r.pass.length; c++) { if (!r.pass[c]) continue; const x = c % r.w, y = (c / r.w) | 0;
    if (x + 1 < r.w && r.pass[c + 1] && !(r.open[c] & 1)) { r.open[c] |= 1; corrupt++; } }   // 벽 변으로 닫힌 동쪽을 연다(지름길)
  let badN = 0, fN = 0;
  for (const [sx, sy, gx, gy] of PS.slice(0, 1500)) { const r = G5.route(sx, sy, gx, gy, R); if (r.res === 'found') { fN++; if (!validPath(W5, sx, sy, gx, gy, r.cells)) badN++; } else if (bfsWin(W5, sx, sy, gx, gy) >= 0) badN++; }
  ok(corrupt > 0 && badN > 0, '⑤ 간선 비트를 망가뜨리면(벽 변으로 닫힌 쪽을 연다) ② 가 문다(벽을 뚫는 길)', `연 비트 ${corrupt} · 걸린 쌍 ${badN}/${fN}`);
  const fs = require('fs'), src = fs.readFileSync(path.join(ROOT, 'server', 'chunk-gates.js'), 'utf8');
  // 간선 비트 확인을 뺀 판 — 회랑 BFS 가 벽 변을 안 보면 ② 가 문다(청크 안 · 경계 건너기 둘 다 그 한 줄이다)
  const edge = 'if (!(o & (1 << d))) continue;';
  ok(src.includes(edge), '⑤ [전제] 간선 비트 확인 글자가 있다');
  { const M2 = { exports: {} }; new Function('module', 'exports', 'require', src.replace(edge, ''))(M2, M2.exports, require);
    const W6 = makeWorld(11), Gx = M2.exports.create({ chunkCells: C, cellsW: CW, cellsH: CH, pass: W6.P, step: W6.S }); Gx.enqueueAll(); Gx.tick(Infinity);
    let b6 = 0; for (const [sx, sy, gx, gy] of PS.slice(0, 1500)) { const r = Gx.route(sx, sy, gx, gy, R); if (r.res === 'found' && !validPath(W6, sx, sy, gx, gy, r.cells)) b6++; }
    ok(b6 > 0, '⑤ 간선 비트 확인을 빼면 ② 가 **문다**(벽 변 · 물·바위로 걷는다)', `틀린 길 ${b6}`); }
  // 구간 끊기 규칙을 뺀 판(글자를 바꿔 다시 적재) — 완전성이 깨지는 쌍이 생긴다
  const cut = '&& inLink(e) && b.bAlong[s][e]) e++;';
  ok(src.includes(cut), '⑤ [전제] 구간 끊기 글자가 있다');
  const M = { exports: {} }; new Function('module', 'exports', 'require', src.replace(cut, ') e++;'))(M, M.exports, require);
  // 빚은 세계 — 청크 경계(x 31|32) 바로 동쪽에 주머니(x 32..40 · y 10..20)를 벽으로 두르고 y 14|15 에서 둘로 가른다(경계 쪽만 열림).
  //   위 주머니(y 10..14)의 목표는 경계를 y 10..14 로 건너야 닿는다 — 구간을 안 끊으면 대표 칸(y 15)이 아래 주머니라 "못 닿음"이 된다.
  const Wb = makeWorld(5); Wb.blk.fill(0); Wb.wallE.fill(0); Wb.wallS.fill(0);
  for (let x = 32; x <= 40; x++) { Wb.wallS[9 * CW + x] = 1; Wb.wallS[20 * CW + x] = 1; Wb.wallS[14 * CW + x] = 1; }
  for (let y = 10; y <= 20; y++) Wb.wallE[y * CW + 40] = 1;
  let mis = 0; const probe = [[20, 12, 36, 11], [20, 18, 36, 18], [10, 5, 35, 12]];
  for (const mk of [M.exports.create, G.create]) {
    const Gx = mk({ chunkCells: C, cellsW: CW, cellsH: CH, pass: Wb.P, step: Wb.S }); Gx.enqueueAll(); Gx.tick(Infinity);
    let m = 0; for (const [sx, sy, gx, gy] of probe) { const r = Gx.route(sx, sy, gx, gy, R); const b = bfsWin(Wb, sx, sy, gx, gy); if ((r.res === 'found') !== (b >= 0)) m++; }
    if (mk === G.create) ok(m === 0, '⑤ [대조] 같은 빚은 세계에서 제품(구간 끊기 있음)은 맞는다', `어긋남 ${m}/${probe.length}`); else mis = m;
  }
  ok(mis > 0, '⑤ 구간 끊기(안쪽 줄 · 바깥 줄이 둘 다 이어질 때만 늘인다)를 빼면 ① 이 **문다**(빚은 주머니 세계)', `어긋난 쌍 ${mis}/3`);
}

console.log('\n⑥ [T679] 표 상한(LRU)');
{
  const W7 = makeWorld(11), base = mkG(W7);
  ok(base.windowChunks(R) === 25, '⑥ 묻기 창 청크 수 = (2⌈R/C⌉+1)² = 25(R 64 · C 32)', `${base.windowChunks(R)}`);
  const CAP = base.windowChunks(R) + 5;   // 하네스 상한(창 하나 + 조금) — 버림이 자주 나게
  const G7 = G.create({ chunkCells: C, cellsW: CW, cellsH: CH, pass: W7.P, step: W7.S, cap: () => CAP });
  let maxRecs = 0, wrong = 0, ans = 0, unk = 0;
  for (const [sx, sy, gx, gy] of PS.slice(0, 400)) {
    let r = G7.route(sx, sy, gx, gy, R);
    if (r.res === 'unknown') { unk++; let t = 0; while (G7.stats().queue > 0 && t++ < 100000) { G7.tick(1500); maxRecs = Math.max(maxRecs, G7.size()); } r = G7.route(sx, sy, gx, gy, R); }
    if (r.res === 'unknown') continue;   // 창(25) 이 상한 안이므로 다시 지으면 답한다 — 아니면 아래 ans 가 모자란다
    ans++;
    const b = bfsWin(W7, sx, sy, gx, gy);
    if ((r.res === 'found') !== (b >= 0) || (r.res === 'found' && !validPath(W7, sx, sy, gx, gy, r.cells))) wrong++;
  }
  const s7 = G7.stats();
  ok(maxRecs <= CAP && s7.recs <= CAP, '⑥ ★표 수가 상한을 넘지 않는다(짓는 순간마다)', `최대 ${maxRecs} ≤ ${CAP}`);
  ok(s7.evicted > 0 && unk > 0, '⑥ [전제] 버림이 실제로 났다 · 버린 청크를 다시 물으면 unknown(→ 종전 A*)', `버림 ${s7.evicted} · unknown ${unk}`);
  ok(wrong === 0 && ans >= 390, '⑥ ★버리고 다시 지은 뒤 답 = 창 BFS(닿음 · 길 유효)', `어긋남 ${wrong}/${ans}`);
  // 버림 차례 — 가장 오래 안 물은 표부터(상한 = 창 하나 25)
  const G8 = G.create({ chunkCells: C, cellsW: CW, cellsH: CH, pass: W7.P, step: W7.S, cap: () => base.windowChunks(R) });
  const A = [20, 20, 30, 30], B = [190, 160, 200, 170], E = [20, 160, 30, 170];   // 창 A 9 · B 12 · E 9 청크(서로 안 겹침)
  const fill = (p) => { G8.route(...p, R); while (G8.stats().queue > 0) G8.tick(1500); return G8.route(...p, R).res; };
  fill(A); fill(B); G8.route(...A, R);   // A 를 다시 물어 B 보다 새것으로
  fill(E);   // 9 + 12 + 9 = 30 > 25 → 가장 오래된 B 쪽이 버려진다
  const ra = G8.route(...A, R).res, rb = G8.route(...B, R).res;
  ok(ra !== 'unknown' && rb === 'unknown', '⑥ LRU 차례 — 최근에 물은 창(A)은 남고 오래된 창(B)이 버려진다', `A ${ra} · B ${rb} · 버림 ${G8.stats().evicted}`);
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
