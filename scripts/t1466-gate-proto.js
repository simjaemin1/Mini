// (@regress 없음 — 러너 밖 · T1466 팔 ㉯ 재기 시제품 · 제품 무변 · `scripts/t1466-judge-probe.js` 가 그림자 팔 'b' 로만 싣는다)
// === scripts/t1466-gate-proto.js — ㉯ 구역 · 관문 그래프(코스 격자를 C×C 구역으로 · 구역 경계의 열린 건넘마다 관문 · 구역 안 관문끼리 거리를 굽는다) ===
//   굽기: 걸음(1 · 2)마다 지도 전체 — 경계 건넘(두 방향 다 열린 칸이 잇달은 줄 = 들목 하나 · 짧으면 가운데 하나 · 길면(≥ 6) 두 끝) · 구역 안 다익스트라(관문마다).
//   물음: 조각이 닿은 구역(조각 상자 ± 코스 한 칸)과 그 이웃을 조각을 넣은 채 다시 굽고(덧판) · 떠난 마을 · 목적 마을은 제 구역 안에서 관문까지 · 관문 그래프 다익스트라 ·
//     고른 관문 사이를 구역 안에서 다시 이어(같은 코스 걸음 · 같은 칸 값) 코스 칸 줄 → 같은 몸 칸 잇기(`_routeFinish`) · 같은 줄 검사(`clearRoute`).
//   답은 근사다(관문을 지나야 하는 길 — 가장 싼 길보다 조금 길 수 있다) — 재기는 그 차이를 T1440 · ㉮ 와 견준다.
//   세계가 바뀌면(구조물 · 지형 칸 — 존 DB 문이 메모를 비우는 자리) 그 구역을 더럽힌다 · 답압 등급 지도가 바뀌면(`coarseGen`) 통째로 다시 굽는다(그 칸 목록을 안 받는 시제품).
'use strict';
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1], W = [100, 100, 100, 100, 140, 140, 140, 140];
const cpuMs = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
function heap() {   // 작은 쌓기(키 · 값) — 낡은 항목은 꺼낼 때 거른다
  const k = [], v = [];
  return {
    get n() { return k.length; },
    push(key, val) { let j = k.length; k.push(key); v.push(val); while (j > 0) { const p = (j - 1) >> 1; if (k[p] <= key) break; k[j] = k[p]; v[j] = v[p]; j = p; } k[j] = key; v[j] = val; },
    pop() { const tk = k[0], tv = v[0], lk = k.pop(), lv = v.pop(); const n = k.length; if (n) { let j = 0; for (;;) { let l = 2 * j + 1; if (l >= n) break; if (l + 1 < n && k[l + 1] < k[l]) l++; if (k[l] >= lk) break; k[j] = k[l]; v[j] = v[l]; j = l; } k[j] = lk; v[j] = lv; } return [tk, tv]; },
  };
}
module.exports = function makeGate(G, C) {
  C = C || 16;
  const base = {}, st = { bake: [], rebake: [], q: 0, qCpu: [], full: [], dirtyMarks: 0, fullRebake: 0 };
  let dirty = new Set(), allDirty = false, gen0 = null;
  const cidOf = (x, y, CW) => ((y / C) | 0) * CW + ((x / C) | 0);
  //   구역 안 다익스트라 — rev = 거꾸로(그 칸으로 드는 걸음) · 돌려줌 Map(칸 → [거리, 앞칸])
  function local(X, cid, CW, s, rev) {
    const { gw, step, cost } = X, out = new Map([[s, [0, -1]]]), H = heap(); H.push(0, s);
    const cx = (cid % CW) * C, cy = ((cid / CW) | 0) * C;
    while (H.n) {
      const [d, u] = H.pop(); const e = out.get(u); if (!e || e[0] !== d || e[2]) continue; e[2] = 1;
      const ux = u % gw, uy = (u / gw) | 0;
      for (let k = 0; k < 8; k++) {
        const vx = rev ? ux - DX[k] : ux + DX[k], vy = rev ? uy - DY[k] : uy + DY[k];
        if (vx < cx || vy < cy || vx >= cx + C || vy >= cy + C || vx >= gw || vy >= X.gh) continue;
        if (rev ? !(X.open(vx, vy) && step(vx, vy, DX[k], DY[k])) : !step(ux, uy, DX[k], DY[k])) continue;
        const v = vy * gw + vx, nd = d + Math.round(W[k] * (rev ? cost(ux, uy) : cost(vx, vy)));
        const o = out.get(v); if (!o || (!o[2] && nd < o[0])) { out.set(v, [nd, u]); H.push(nd, v); }
      }
    }
    return out;
  }
  //   경계 건넘(구역 a 의 동쪽 · 남쪽) — 두 방향 다 되는 칸이 잇달은 줄마다 관문 짝
  function border(X, a, CW, CH, side) {
    const { gw, gh, step } = X, ax = a % CW, ay = (a / CW) | 0, out = [];
    if (side === 'E') { if (ax + 1 >= CW) return out; const x = (ax + 1) * C - 1; if (x + 1 >= gw) return out; let run = [];
      const flush = () => { if (run.length) { const picks = run.length >= 6 ? [run[0], run[run.length - 1]] : [run[run.length >> 1]]; for (const y of picks) out.push([y * gw + x, y * gw + x + 1]); run = []; } };
      for (let y = ay * C; y < Math.min(gh, (ay + 1) * C); y++) { if (step(x, y, 1, 0) && step(x + 1, y, -1, 0)) run.push(y); else flush(); } flush(); }
    else { if (ay + 1 >= CH) return out; const y = (ay + 1) * C - 1; if (y + 1 >= gh) return out; let run = [];
      const flush = () => { if (run.length) { const picks = run.length >= 6 ? [run[0], run[run.length - 1]] : [run[run.length >> 1]]; for (const x of picks) out.push([y * gw + x, (y + 1) * gw + x]); run = []; } };
      for (let x = ax * C; x < Math.min(gw, (ax + 1) * C); x++) { if (step(x, y, 0, 1) && step(x, y + 1, 0, -1)) run.push(x); else flush(); } flush(); }
    return out;
  }
  //   구역 묶음 굽기 — bd(경계 열쇠 → 짝) · cl(구역 → { g: 관문 칸들, adj: Map(칸 → [[칸, 값], …]) })
  function build(X, B, set) {
    const { CW, CH } = B, nb = new Set(set);
    for (const c of set) { const cx = c % CW, cy = (c / CW) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx >= 0 && ny >= 0 && nx < CW && ny < CH) nb.add(ny * CW + nx); } }
    for (const c of set) {
      const cx = c % CW, cy = (c / CW) | 0;
      B.bd.set(c + 'E', border(X, c, CW, CH, 'E')); B.bd.set(c + 'S', border(X, c, CW, CH, 'S'));
      if (cx > 0) B.bd.set((c - 1) + 'E', border(X, c - 1, CW, CH, 'E'));
      if (cy > 0) B.bd.set((c - CW) + 'S', border(X, c - CW, CW, CH, 'S'));
    }
    for (const c of nb) {
      const cx = c % CW, cy = (c / CW) | 0, g = new Map();   // 칸 → 건넘 [[이웃 칸, 값]]
      const add = (u, v) => { let L = g.get(u); if (!L) g.set(u, L = []); L.push([v, Math.round(100 * X.cost(v % X.gw, (v / X.gw) | 0))]); };
      for (const [u, v] of B.bd.get(c + 'E') || []) add(u, v);
      for (const [u, v] of B.bd.get(c + 'S') || []) add(u, v);
      if (cx > 0) for (const [u, v] of B.bd.get((c - 1) + 'E') || []) add(v, u);
      if (cy > 0) for (const [u, v] of B.bd.get((c - CW) + 'S') || []) add(v, u);
      const adj = new Map();
      for (const [u, L] of g) { const row = L.slice(); const D = local(X, c, CW, u, false); for (const w of g.keys()) if (w !== u && D.has(w)) row.push([w, D.get(w)[0]]); adj.set(u, row); }
      B.cl[c] = { g: [...g.keys()], adj };
    }
  }
  function size(B) { let n = 0, e = 0; for (const r of B.cl) if (r) { n += r.g.length; for (const L of r.adj.values()) e += L.length; } return { nodes: n, edges: e, mb: +((n * 4 + e * 8) / 1e6).toFixed(2) }; }
  function bake(mode) {
    const c0 = cpuMs(), h0 = process.memoryUsage().heapUsed;
    const B = G.mode(mode, () => { const X = G.ctx(); const CW = Math.ceil(X.gw / C), CH = Math.ceil(X.gh / C), B = { CW, CH, cl: new Array(CW * CH), bd: new Map() }; const all = []; for (let i = 0; i < CW * CH; i++) all.push(i); build(X, B, all); return B; });
    base[mode] = B; const z = size(B);
    st.bake.push({ mode, ms: +(cpuMs() - c0).toFixed(0), heapMB: +((process.memoryUsage().heapUsed - h0) / 1e6).toFixed(1), ...z });
  }
  //   세계 판(구조물 표 · 등급 지도) — 바뀌었으면 더럽힘을 굽는다(등급이 바뀌면 통째로)
  function fresh(mode) {
    const g = G.gen();
    if (Object.keys(base).length && ((gen0 && g.cg !== gen0.cg) || allDirty)) { st.fullRebake++; st.full.push(allDirty ? 'all' : 'cg'); for (const m of Object.keys(base)) delete base[m]; dirty.clear(); }
    allDirty = false; gen0 = g;
    if (dirty.size) {
      const c0 = cpuMs(), set = [...dirty];
      for (const m of Object.keys(base)) G.mode(m, () => build(G.ctx(), base[m], set));
      st.rebake.push({ n: set.length, ms: +(cpuMs() - c0).toFixed(1) }); dirty.clear();
    }
    if (!base[mode]) bake(mode);
  }
  function mark(x0, y0, x1, y1) {   // 칸 좌표(셀) → 구역 더럽힘
    st.dirtyMarks++;
    const B = base['1'] || base['2']; if (!B) return;
    const D = 4;   // 셀 → 코스 칸(DIST_STEP)
    for (let gy = Math.max(0, Math.floor(y0 / D) - 1); gy <= Math.floor(y1 / D) + 1; gy++) for (let gx = Math.max(0, Math.floor(x0 / D) - 1); gx <= Math.floor(x1 / D) + 1; gx++) dirty.add(cidOf(gx, gy, B.CW));
  }
  //   물음 — 그 걸음 · 조각을 넣은 채 · src · tgts(T1466 multiBegin 꼴) → out(목적 id → pts | null)
  function query(piece, M, src, tgts) {
    const mode = M === G.RoadRule.M1 ? '1' : (M === G.RoadRule.M2 ? '2' : null);
    const out = new Map(); if (!mode) { for (const t of tgts) out.set(t.id, null); return { out, cpu: 0 }; }
    fresh(mode);
    const c0 = cpuMs(), B = base[mode];
    G.RoadRule.sAdd('__t1440tmp', piece, 'V'); G.forget(piece);
    try {
      G.mode(mode, () => {
        const X = G.ctx(), { gw } = X, CW = B.CW;
        //   덧판 — 조각 상자 ± 코스 한 칸이 든 구역(과 그 이웃)을 조각을 넣은 채 다시
        const b = G.RoadRule.pieceBox(piece), D = 4, set = new Set();
        for (let gy = Math.floor(b[1] / D) - 1; gy <= Math.floor(b[3] / D) + 1; gy++) for (let gx = Math.floor(b[0] / D) - 1; gx <= Math.floor(b[2] / D) + 1; gx++) if (gx >= 0 && gy >= 0 && gx < gw && gy < X.gh) set.add(cidOf(gx, gy, CW));
        const O = { CW, CH: B.CH, cl: B.cl.slice(), bd: new Map(B.bd) };
        build(X, O, [...set]);
        const si = X.snap(src.x, src.y); if (si < 0) { for (const t of tgts) out.set(t.id, null); return; }
        const sc = cidOf(si % gw, (si / gw) | 0, CW);
        //   목적 — 제 구역 안 거꾸로(관문 → 목적)
        const tin = new Map();   // 관문 칸 → [[목적 칸, 값]]
        const tn = new Map();
        for (const t of tgts) {
          const ti = X.snap(t.x, t.y); t._ti = ti; if (ti < 0) { out.set(t.id, null); continue; }
          if (tn.has(ti)) { tn.get(ti).push(t); continue; } tn.set(ti, [t]);
          const c = cidOf(ti % gw, (ti / gw) | 0, CW), R = local(X, c, CW, ti, true), rec = O.cl[c];
          for (const g of (rec ? rec.g : [])) if (R.has(g)) { let L = tin.get(g); if (!L) tin.set(g, L = []); L.push([ti, R.get(g)[0]]); }
          if (c === sc && R.has(si)) { let L = tin.get(si); if (!L) tin.set(si, L = []); L.push([ti, R.get(si)[0]]); }
        }
        //   관문 그래프 다익스트라(떠난 칸 → 제 구역 관문은 구역 안 앞으로)
        const dist = new Map(), prev = new Map(), H = heap();
        dist.set(si, 0); prev.set(si, -1); H.push(0, si);
        const S0 = local(X, sc, CW, si, false), srec = O.cl[sc];
        let left = tn.size;
        const relax = (u, v, nd) => { const o = dist.get(v); if (o === undefined || nd < o) { dist.set(v, nd); prev.set(v, u); H.push(nd, v); } };
        const done = new Set();
        while (H.n && left > 0) {
          const [d, u] = H.pop(); if (done.has(u) || dist.get(u) !== d) continue; done.add(u);
          if (tn.has(u)) left--;
          if (u === si) { for (const g of (srec ? srec.g : [])) if (S0.has(g) && g !== si) relax(si, g, S0.get(g)[0]); }
          const c = cidOf(u % gw, (u / gw) | 0, CW), rec = O.cl[c];
          if (rec && rec.adj.has(u)) for (const [v, w] of rec.adj.get(u)) relax(u, v, d + w);
          const L = tin.get(u); if (L) for (const [ti, w] of L) relax(u, ti, d + w);
        }
        //   다듬기 — 관문 줄을 구역 안 길로 잇는다
        for (const [ti, ts] of tn) {
          let pts = null;
          if (done.has(ti)) {
            const chain = []; for (let v = ti; v >= 0; v = prev.get(v)) chain.push(v); chain.reverse();
            const nodes = [chain[0]];
            for (let i = 1; i < chain.length; i++) {
              const a = chain[i - 1], z = chain[i], ax = a % gw, ay = (a / gw) | 0, zx = z % gw, zy = (z / gw) | 0;
              if (Math.max(Math.abs(ax - zx), Math.abs(ay - zy)) <= 1 && cidOf(ax, ay, CW) !== cidOf(zx, zy, CW)) { nodes.push(z); continue; }
              const c = cidOf(zx, zy, CW), L = local(X, c, CW, a, false); if (!L.has(z)) { nodes.length = 0; break; }
              const seg = []; for (let v = z; v !== a; v = L.get(v)[1]) seg.push(v); seg.reverse(); for (const v of seg) nodes.push(v);
            }
            if (nodes.length) {
              for (const t of ts) {
                const ns = nodes.map((v) => ({ x: v % gw, y: (v / gw) | 0 })); if (t.rev) ns.reverse();   // 줄은 떠난 마을 → 목적 · 열쇠 앞이 목적 쪽이면 뒤집는다(`_t1466Run` 과 같은 차례)
                const A = t.rev ? t : src, Bv = t.rev ? src : t;
                let p = X.finish(A, Bv, ns); if (p && !G.RoadRule.clearRoute(p, null, M)) p = null;
                out.set(t.id, p);
              }
              continue;
            }
          }
          for (const t of ts) out.set(t.id, pts);
        }
      });
    } finally { G.RoadRule.sDel('__t1440tmp'); G.forget(piece); }
    const cpu = cpuMs() - c0; st.q++; st.qCpu.push(+cpu.toFixed(1));
    return { out, cpu };
  }
  return { query, mark, all: () => { allDirty = true; }, st, base };
};
