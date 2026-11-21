// (@regress 없음 — 러너 밖 · T1406 다리 놓기 자 · 제품 무변 · 읽기만 · `audit-walk-map.js --place` 가 부른다)
// === scripts/audit-walk-place.js — 걸음 ÷ 곧은 거리가 큰 이웃 쌍을 다리로 푼다(욕심 차례 · 가장 적은 수) =================
//   규약 = `plan-bridges-v2` 그대로: 축 4방 직선 · 대각 0 · 폭 2칸 · 두 끝 뭍(k = 0..len+1) · 물 칸 200 안.
//   자리 품질 = `audit-bridge-sites` 잣대 그대로(사본 — 그 자는 맨 위에서 돈다): ① 12칸 안에 다른 강(합류부) 0 ② 두 교두보 뭍(반경 40 · 4방 BFS)이 최대(81²)의 10% 넘음.
//   차례: 과녁 넘는 쌍(`--place-target` 기본 3)을 가장 많이 과녁 안으로 들이는 다리 → 같으면 줄인 걸음 합 → 같으면 짧은 다리. 하나 놓을 때마다 51 마을 걸음을 다시 잰다.
//   다리 하나 빼기(`--drop-check`): 있는 다리 + 놓은 다리를 4방 덩이로 묶어 하나씩 지우고 못 닿는 마을을 센다.
'use strict';
const fs = require('fs');

module.exports = function place(c) {
  const { ZID, NX, NY, N, SZ, kind, BRIDGE, terrain, blk, dij, dist, INF, vs, pairs, straight, opt, argv } = c;
  const V = vs.length, TGT = +opt('place-target', '3'), MAXB = +opt('place-max', '30'), SPAN = +opt('span', '200');
  const t0 = Date.now();
  const allW = () => { const W = Array.from({ length: V }, () => new Float64Array(V).fill(Infinity)); for (const a of vs) { dij([a.a], null, a.i, null, null); for (const b of vs) W[a.i][b.i] = dist[b.a] >= INF ? Infinity : dist[b.a] / 5; } return W; };
  const ratioOf = (W, p) => { const s = straight(vs[p.i], vs[p.j]), w = Math.min(W[p.i][p.j], W[p.j][p.i]); return Number.isFinite(w) && s > 0 ? w / s : Infinity; };
  const PL = [...pairs.values()];

  //   품질 — 사본(`audit-bridge-sites.js` headArea · riversAt · mainRiverAt)
  const isW = (x, y) => kind(x, y) === 2, isLand = (x, y) => kind(x, y) === 1;
  const BFS_R = 40, CAP = (BFS_R * 2 + 1) ** 2;
  function headArea(cx, cy) {
    if (!isLand(cx, cy)) return 0;
    const vis = new Set([cy * NX + cx]); const q = [cy * NX + cx]; let n = 0;
    while (q.length) { const i = q.pop(); n++; const x = i % NX, y = (i / NX) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (Math.abs(nx - cx) > BFS_R || Math.abs(ny - cy) > BFS_R) continue; if (!isLand(nx, ny)) continue; const j = ny * NX + nx; if (vis.has(j)) continue; vis.add(j); q.push(j); } }
    return n;
  }
  const TR = (terrain.ZONE_TERRAIN && terrain.ZONE_TERRAIN[ZID]) || {};
  function segD(rv, cx, cy, withW) {
    let best = Infinity; const p = rv.path || [];
    for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; const ax = a.pos[0], ay = a.pos[1], vx = b.pos[0] - ax, vy = b.pos[1] - ay; const L2 = vx * vx + vy * vy || 1;
      let t = ((cx * SZ - ax) * vx + (cy * SZ - ay) * vy) / L2; t = Math.max(0, Math.min(1, t));
      const w1 = a.width != null ? a.width : (rv.width || 200), w2 = b.width != null ? b.width : (rv.width || 200);
      const d = Math.hypot(cx * SZ - (ax + vx * t), cy * SZ - (ay + vy * t)) - (withW ? (w1 + (w2 - w1) * t) / 2 : 0); if (d < best) best = d; }
    return best;
  }
  function junction(cx, cy) {
    const rs = TR.rivers || []; if (!rs.length) return [];
    let main = null, md = Infinity; for (const rv of rs) { const d = segD(rv, cx, cy, false); if (d < md) { md = d; main = rv.name; } }
    return rs.filter((rv) => rv.name !== main && segD(rv, cx, cy, true) < 12 * SZ).map((rv) => rv.name);
  }

  //   후보 — 축 4방 직선 물길(물 칸만 · 두 끝 뭍 · SPAN 안) · 폭 2칸 띠(둘째 줄에 바위 0 · 둘째 줄 두 끝도 뭍/물)
  const runs = [];
  const strip = (r) => { const [e1, e2, , ax] = r; const x1 = e1 % NX, y1 = (e1 / NX) | 0, x2 = e2 % NX, y2 = (e2 / NX) | 0; const out = [];
    for (let k = 0; k <= Math.max(x2 - x1, y2 - y1); k++) for (let w = 0; w < 2; w++) { const x = ax === 'h' ? x1 + k : x1 + w, y = ax === 'h' ? y1 + w : y1 + k; out.push([x, y]); } return out; };
  const okStrip = (r) => strip(r).every(([x, y]) => x >= 0 && y >= 0 && x < NX && y < NY && kind(x, y) !== 3);
  for (let y = 0; y < NY - 1; y++) { let x = 0; while (x < NX) { if (blk[y * NX + x] && kind(x, y) === 2) { let e = x; while (e < NX && blk[y * NX + e] && kind(e, y) === 2) e++; const L = e - x; if (x > 0 && e < NX && L <= SPAN && !blk[y * NX + x - 1] && !blk[y * NX + e]) runs.push([y * NX + x - 1, y * NX + e, L, 'h']); x = e; } else x++; } }
  for (let x = 0; x < NX - 1; x++) { let y = 0; while (y < NY) { if (blk[y * NX + x] && kind(x, y) === 2) { let e = y; while (e < NY && blk[e * NX + x] && kind(x, e) === 2) e++; const L = e - y; if (y > 0 && e < NY && L <= SPAN && !blk[(y - 1) * NX + x] && !blk[e * NX + x]) runs.push([(y - 1) * NX + x, e * NX + x, L, 'v']); y = e; } else y++; } }

  let W = allW();
  const before = PL.map((p) => ratioOf(W, p));
  const placed = [], qualSkip = new Map();
  for (let it = 0; it < MAXB; it++) {
    const bad = PL.filter((p) => ratioOf(W, p) > TGT);
    if (!bad.length) break;
    const vset = new Set(); for (const p of bad) { vset.add(p.i); vset.add(p.j); }
    const F = new Map(); for (const v of vset) { dij([vs[v].a], null, v, null, null); F.set(v, Int32Array.from(dist)); }
    const scored = [];
    for (const r of runs) {
      const [e1, e2, L] = r; let solved = 0, gain = 0, worstGain = 0;
      for (const p of bad) { const fa = F.get(p.i), fb = F.get(p.j); const d1 = fa[e1] + fb[e2], d2 = fa[e2] + fb[e1]; const via = Math.min(d1, d2) / 5 + L + 1; const w = Math.min(W[p.i][p.j], W[p.j][p.i]);
        if (via < w) { gain += w - via; const s = straight(vs[p.i], vs[p.j]); if (via / s <= TGT) solved++; } }
      if (gain > 0) scored.push({ r, solved, gain });
    }
    scored.sort((x, y) => y.solved - x.solved || y.gain - x.gain || x.r[2] - y.r[2]);
    let pick = null;
    for (const s of scored.slice(0, 400)) {
      if (!okStrip(s.r)) { qualSkip.set('바위', (qualSkip.get('바위') || 0) + 1); continue; }
      const [e1, e2, L, ax] = s.r; const x1 = e1 % NX, y1 = (e1 / NX) | 0, x2 = e2 % NX, y2 = (e2 / NX) | 0;
      const A1 = headArea(x1, y1), A2 = headArea(x2, y2);
      if (Math.min(A1, A2) < CAP * 0.10) { qualSkip.set('쐐기', (qualSkip.get('쐐기') || 0) + 1); continue; }
      const mid = [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)], jn = junction(mid[0], mid[1]);
      if (jn.length) { qualSkip.set('합류부', (qualSkip.get('합류부') || 0) + 1); continue; }
      pick = { ...s, A1, A2, mid, ends: [[x1, y1], [x2, y2]], span: L, axis: ax === 'h' ? '동서' : '남북' }; break;
    }
    if (!pick || (!pick.solved && pick.gain < 1)) break;
    //   놓는다 — 물 칸만 열린다(뭍 칸은 원래 열림 · BRIDGE 집합에는 띠 전부 = plan-bridges-v2 와 같은 꼴)
    const cells = strip(pick.r), flat = [];
    for (const [x, y] of cells) { BRIDGE.add(x + '_' + y); flat.push(x, y); if (kind(x, y) === 2) blk[y * NX + x] = 0; }
    const W0 = W; W = allW();
    const solvedNames = bad.filter((p) => ratioOf(W, p) <= TGT).map((p) => `${vs[p.i].name}–${vs[p.j].name}`);
    const helps = PL.filter((p) => { const a = Math.min(W0[p.i][p.j], W0[p.j][p.i]), b = Math.min(W[p.i][p.j], W[p.j][p.i]); return b < a * 0.9; }).map((p) => { const a = Math.min(W0[p.i][p.j], W0[p.j][p.i]), b = Math.min(W[p.i][p.j], W[p.j][p.i]); return `${vs[p.i].name}–${vs[p.j].name} ${a.toFixed(0)}→${b.toFixed(0)}`; });
    //   가장 가까운 마을(이름표)
    let nearV = null, nd = Infinity; for (const v of vs) { const d = Math.hypot(v.ax - pick.mid[0], v.ay - pick.mid[1]); if (d < nd) { nd = d; nearV = v.name; } }
    placed.push({ n: placed.length + 1, near: nearV, nearD: Math.round(nd), axis: pick.axis, span: pick.span, at: pick.mid, ends: pick.ends, heads: [pick.A1, pick.A2], cellsN: cells.length, solved: solvedNames, helpsN: helps.length, helps: helps.slice(0, 12), cells: flat });
    console.log(`  다리 ${placed.length} · ${nearV} 곁(${Math.round(nd)}칸) · ${pick.axis} ${pick.span}칸 @(${pick.mid}) · 교두보 ${pick.A1}/${pick.A2} · 푼 쌍 ${solvedNames.length}: ${solvedNames.join(' ')} · 10% 넘게 준 이웃 쌍 ${helps.length} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  const after = PL.map((p) => ratioOf(W, p));
  const cnt = (arr, t) => arr.filter((x) => x > t).length;
  const left = PL.filter((p) => ratioOf(W, p) > TGT).map((p) => `${vs[p.i].name}–${vs[p.j].name} ×${ratioOf(W, p).toFixed(2)}`);

  //   다리 하나 빼기 — 4방 덩이마다 지우고 닻 하나에서 다시 잰다(못 닿는 마을 수)
  let drop = null;
  if (argv.includes('--drop-check')) {
    const cellsAll = [...BRIDGE].map((k) => k.split('_').map(Number)).filter(([x, y]) => kind(x, y) === 2);
    const idx = new Map(cellsAll.map(([x, y], n) => [y * NX + x, n])); const gid = new Int32Array(cellsAll.length).fill(-1); const groups = [];
    for (let n = 0; n < cellsAll.length; n++) { if (gid[n] >= 0) continue; const g = []; const st = [n]; gid[n] = groups.length;
      while (st.length) { const m = st.pop(); g.push(m); const [x, y] = cellsAll[m]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const j = idx.get((y + dy) * NX + x + dx); if (j != null && gid[j] < 0) { gid[j] = groups.length; st.push(j); } } }
      groups.push(g); }
    const a0 = vs.find((v) => v.a >= 0); const cutBy = [];
    dij([a0.a], null, a0.i, null, null); const base = vs.filter((v) => v.a >= 0 && dist[v.a] >= INF).length;
    for (const g of groups) { for (const m of g) { const [x, y] = cellsAll[m]; blk[y * NX + x] = 1; }
      dij([a0.a], null, a0.i, null, null); const lost = vs.filter((v) => v.a >= 0 && dist[v.a] >= INF).length - base;
      for (const m of g) { const [x, y] = cellsAll[m]; blk[y * NX + x] = 0; }
      if (lost > 0) { const [x, y] = cellsAll[g[0]]; cutBy.push({ at: [x, y], cells: g.length, lost }); } }
    drop = { groups: groups.length, base, cutting: cutBy.length, list: cutBy };
    console.log(`  다리 하나 빼기 — 덩이 ${groups.length} · 빼면 못 닿는 마을이 생기는 다리 ${cutBy.length}${cutBy.length ? ' ' + cutBy.map((d) => `@(${d.at}) −${d.lost}`).join(' ') : ''}`);
  }
  const res = { zone: ZID, target: TGT, placed: placed.length, over: { before: cnt(before, TGT), after: cnt(after, TGT) }, over3: { before: cnt(before, 3), after: cnt(after, 3) }, over2: { before: cnt(before, 2), after: cnt(after, 2) },
    max: { before: +Math.max(...before.filter(Number.isFinite)).toFixed(3), after: +Math.max(...after.filter(Number.isFinite)).toFixed(3) }, left, qualSkip: Object.fromEntries(qualSkip), runs: runs.length, bridges: placed, drop, ms: Date.now() - t0 };
  const flat = []; for (const b of placed) flat.push(...b.cells); res.flat = flat;
  const of = opt('place-out', null); if (of) fs.writeFileSync(of, JSON.stringify(res, null, 1));
  console.log(`[다리 놓기] ${ZID} · 놓은 다리 ${placed.length}(${flat.length / 2}칸) · ${TGT}배 넘는 이웃 쌍 ${res.over.before} → ${res.over.after} · 가장 큼 ×${res.max.before} → ×${res.max.after} · 2배 넘음 ${res.over2.before} → ${res.over2.after}${left.length ? ' · 남음 ' + left.join(' ') : ''} · 품질로 건넌 후보 ${JSON.stringify(res.qualSkip)}`);
  return res;
};
