(() => { const req = globalThis.process.mainModule.require; const V = req('/root/minirepo/server/villages.js'); const st = V.__t740(); const B = V.__p3Bind({})._warBlockedCell;
  const goals = new Map(); const seen = new Set();
  const add = (k, u, kind) => { if (k == null) return; const g = goals.get(k) || { n: 0, kind, starts: [] }; g.n++; if (g.starts.length < 3) g.starts.push([Math.floor(u.x), Math.floor(u.y)]); goals.set(k, g); };
  const scan = (o, d) => { if (!o || typeof o !== 'object' || seen.has(o) || d > 4) return; seen.add(o);
    if (Array.isArray(o.units) && o.units.length && typeof o.units[0] === 'object') { for (const u of o.units) if (u) { if (u._t804f != null) add(u._t804f, u, 'fail'); if (u._t821s) add(u._t821s.key, u, 'srch'); } return; }
    for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === 'object' && !(v instanceof Map) && !(v instanceof Set)) { if (Array.isArray(v)) { for (const x of v.slice(0, 50)) scan(x, d + 1); } else scan(v, d + 1); } } };
  for (const b of st.warBodies.values()) scan(b, 0);
  const out = [];
  for (const [k, g] of goals) { const gx = Math.floor(k / 65536), gy = k % 65536;
    const q = [gx, gy], vis = new Set([gx * 65536 + gy]); let i = 0, cap = false; const S = new Set(g.starts.map(([x, y]) => x * 65536 + y)); let hit = 0;
    while (i < q.length) { const x = q[i++], y = q[i++]; if (S.has(x * 65536 + y)) hit++; if (vis.size > 300000) { cap = true; break; }
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy, kk = nx * 65536 + ny; if (vis.has(kk)) continue; if (B(nx, ny)) continue; vis.add(kk); q.push(nx, ny); } }
    out.push({ g: [gx, gy], kind: g.kind, units: g.n, goalBlocked: B(gx, gy), comp: vis.size, capped: cap, startsInComp: hit, starts: g.starts }); }
  return out.sort((a, b) => b.units - a.units).slice(0, 25);
})()
