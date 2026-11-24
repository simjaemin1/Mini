// node sw.js <arm-seed>... — 남는 시간 일 몸 사람-날(낮 175 ms = 1) · 철 × (농부 / 그 밖) × 일 × (현장 · 걸음)
const DL = 250 * 0.7, S = ['봄', '여름', '가을', '겨울'];
for (const n of process.argv.slice(2)) { let r; try { r = require('/tmp/t1444/srv/' + n + '/' + n + '.t1422.json'); } catch (e) { continue; } if (!r.sw) { console.log(n, 'sw 없음'); continue; }
  const rows = [];
  for (const s of S) { const a = r.sw[s] || {}; const g = {}; for (const j in a) for (const k in a[j]) { const key = (j === 'farmer' ? '농부' : '그 밖') + '·' + k; const o = g[key] || (g[key] = [0, 0, 0]); for (let i = 0; i < 3; i++) o[i] += a[j][k][i]; }
    rows.push(s + ' ' + Object.entries(g).sort().map(([k, v]) => k + ' ' + Math.round(v[0] / DL) + '/' + Math.round(v[1] / DL)).join(' · ')); }
  console.log(n + ' (현장/걸음 사람-날)\n  ' + rows.join('\n  '));
}
