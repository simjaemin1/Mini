#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T682 자 · 제품 무변)
// 교역로 코스 격자의 4방 연결 성분(`coarseOpen` 과 같은 열림 · `_routeBegin` 과 같은 나선 스냅 — **독립으로 다시 짠 것**)으로
//   T662 쌍별 표(`t662-geo-anatomy.js pairs` 의 out)의 못 판 쌍을 ⓐ 다른 성분 / ⓑ 같은 성분으로 가른다(제품 `_routeComp` 의 대조).
// 쓰는 법: node scripts/t682-comp-split.js <T524 dir> <pairs.json>
const path = require('path'), fs = require('fs');
const G = require(path.join(__dirname, '..', 'server', 'xzone-geo.js'));
const { ZONES, P, SZ } = G._mods();
const ros = (z) => JSON.parse(fs.readFileSync(path.join(process.argv[2], `${z}.json`), 'utf8')).vills.filter((v) => v.seeded).map((v) => ({ name: v.name, cx: v.ccx, cy: v.ccy }));
const A = 'hanbando', B = 'nippon', rA = ros(A), rB = ros(B);
const t0 = Date.now();
const U = G.unionAdapter([A, B], { coast: true });
const ta = U.ta, DS = 4, half = 2;
const cw = Math.ceil(U.ZONE.zoneWidth / SZ), ch = Math.ceil(U.ZONE.zoneHeight / SZ);
const gw = Math.ceil(cw / DS), gh = Math.ceil(ch / DS);
const blk = new Int8Array(gw * gh);
const open = (gx, gy) => { const i = gy * gw + gx; if (!blk[i]) {
  const bx = gx * DS, by = gy * DS; let v = !ta.isBlocked(bx + half, by + half);
  if (!v) { for (let dy = 0; dy < DS && !v; dy++) for (let dx = 0; dx < DS; dx++) if (ta.isBridgeCell(bx + dx, by + dy) && !ta.isBlocked(bx + dx, by + dy)) { v = true; break; } }
  blk[i] = v ? 1 : 2; } return blk[i] === 1; };
const lab = new Int32Array(gw * gh).fill(-1); let nc = 0; const Q = new Int32Array(gw * gh);
const sizes = [];
for (let s = 0; s < gw * gh; s++) { if (lab[s] >= 0 || !open(s % gw, (s / gw) | 0)) continue;
  let h = 0, t = 0; Q[t++] = s; lab[s] = nc; let n = 0;
  while (h < t) { const i = Q[h++]; n++; const x = i % gw, y = (i / gw) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue; const j = ny * gw + nx; if (lab[j] < 0 && open(nx, ny)) { lab[j] = nc; Q[t++] = j; } } }
  sizes.push(n); nc++; }
const tl = Date.now() - t0;
const offA = { x: ZONES[A].worldOffsetX - U.x0, y: ZONES[A].worldOffsetY - U.y0 }, offB = { x: ZONES[B].worldOffsetX - U.x0, y: ZONES[B].worldOffsetY - U.y0 };
const vil = rA.map((v) => ({ ux: v.cx + offA.x / SZ, uy: v.cy + offA.y / SZ })).concat(rB.map((v) => ({ ux: v.cx + offB.x / SZ, uy: v.cy + offB.y / SZ })));
const snap = (px, py) => { const gx0 = Math.min(gw - 1, Math.max(0, Math.round(px / SZ / DS))), gy0 = Math.min(gh - 1, Math.max(0, Math.round(py / SZ / DS)));
  if (open(gx0, gy0)) return gy0 * gw + gx0;
  for (let r = 1; r <= 6; r++) for (let a = 0; a < 16; a++) { const nx = Math.round(gx0 + Math.cos(a / 16 * 2 * Math.PI) * r), ny = Math.round(gy0 + Math.sin(a / 16 * 2 * Math.PI) * r);
    if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && open(nx, ny)) return ny * gw + nx; } return -1; };
const node = vil.map((v) => snap((v.ux + 0.5) * SZ, (v.uy + 0.5) * SZ));
const prof = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).rows;
let a = 0, b = 0, snapFail = 0; const okDiff = [];
const compOf = (k) => (node[k] < 0 ? -1 : lab[node[k]]);
for (const r of prof) { if (r.d == null) continue; const ci = compOf(r.i), cj = compOf(r.j);
  if (!r.ok) { if (ci < 0 || cj < 0) snapFail++; else if (ci !== cj) a++; else b++; }
  else if (ci !== cj) okDiff.push(r); }
const big = sizes.slice().sort((x, y) => y - x).slice(0, 5);
console.log(JSON.stringify({ grid: [gw, gh], comps: nc, top5: big, labelMs: tl, failed: a + b + snapFail, a_diffComp: a, b_sameComp: b, snapFail, okButDiff: okDiff.length,
  villComps: [...new Set(node.map((n) => lab[n]))].map((c) => [c, sizes[c]]) }));
