(() => { const req = globalThis.process.mainModule.require; const st = req('/root/minirepo/server/villages.js').__t740();
  let srch = 0, road = 0, pops = [], keys = new Map(), units = 0, groups = 0, f = 0, ff = 0, p804 = 0;
  const seen = new Set();
  const look = (m) => { units++; const J = m._t821s; if (J && J.S) { srch++; pops.push(J.S.pops | 0); keys.set(J.key, (keys.get(J.key) || 0) + 1); } if (m._t804f != null) f++; if (m._t804p) p804++;
    const R = m._t804r; if (R) { if (R._t821s && R._t821s.S) { road++; pops.push(R._t821s.S.pops | 0); keys.set('r' + R._t821s.key, (keys.get('r' + R._t821s.key) || 0) + 1); } if (R._t804f != null) ff++; } };
  const scan = (o, d) => { if (!o || typeof o !== 'object' || seen.has(o) || d > 4) return; seen.add(o);
    if (Array.isArray(o.units) && o.units.length && typeof o.units[0] === 'object') { groups++; for (const u of o.units) if (u) look(u); return; }
    for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === 'object') { if (Array.isArray(v)) { for (const x of v.slice(0, 50)) scan(x, d + 1); } else if (!(v instanceof Map) && !(v instanceof Set)) scan(v, d + 1); } } };
  const WB = st.warBodies; if (WB) for (const b of WB.values()) scan(b, 0);
  pops.sort((a, b) => b - a);
  const W = st.war && st.war.WARS ? st.war.WARS.map((w) => [w.id, w.phase, w.att && w.att.name, w.def && w.def.name]) : null;
  return { groups, units, searching: srch, roadSearching: road, failMem: f, roadFailMem: ff, following: p804, popsTop: pops.slice(0, 8), popsSum: pops.reduce((a, b) => a + b, 0), distinctTargets: keys.size, topTargets: [...keys].sort((a, b) => b[1] - a[1]).slice(0, 5), wars: W };
})()
