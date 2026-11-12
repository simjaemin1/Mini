'use strict';
// (@regress 없음 — 러너 밖 · T1277 표 자 · 읽기만)
// === scripts/t1277-shape.js — 몸 모양 셈(`t1277-observe.js` ④)에서 날마다 모양 수 · 새로 선 모양의 열쇠 차(가장 흔한 모양과) ==========
//   쓰는 법: node scripts/t1277-shape.js <판 머리> [날 from] [날 to]
const fs = require('fs');
const [h, fromA, toA] = process.argv.slice(2);
if (!h) { console.error('쓰는 법: node scripts/t1277-shape.js <판 머리> [날 from] [날 to]'); process.exit(2); }
const X = JSON.parse(fs.readFileSync(h + '.t1277.json', 'utf8'));
const from = +(fromA || 1), to = +(toA || 1e9);
const days = Object.keys(X.shape || {}).map(Number).sort((a, b) => a - b).filter((d) => d >= from && d <= to);
const K = X.shapeKeys || {};
let prev = null;
for (const d of days) {
  const H = X.shape[d]; const ent = Object.entries(H).sort((a, b) => b[1] - a[1]); const n = ent.reduce((s, x) => s + x[1], 0);
  const top = ent[0] ? K[ent[0][0]] : null, topSet = new Set(top ? top.keys : []);
  const born = ent.filter(([k]) => K[k] && K[k].day === d);
  const npcShapes = ent.filter(([k]) => K[k] && K[k].npc).length;
  console.log(`날 ${d}: 몸 ${n} · 모양 ${ent.length}(npc 모양 ${npcShapes}) · 가장 흔한 ${ent.slice(0, 5).map(([k, c]) => `${c}`).join('/')}` + (born.length ? ` · 새 모양 ${born.length}` : ''));
  for (const [k, c] of born) { const S = K[k], ks = S.keys, set = new Set(ks); const add = ks.filter((x) => !topSet.has(x)), miss = [...topSet].filter((x) => !set.has(x));
    // 같은 열쇠 모임인데 차례만 다르면 차례 첫 차를 보인다
    let ord = ''; if (!add.length && !miss.length && top) { for (let i = 0; i < ks.length; i++) if (ks[i] !== top.keys[i]) { ord = ` · 차례 갈림 ${i}: ${ks[i]} ↔ ${top.keys[i]}`; break; } }
    console.log(`    + ${k} × ${c} · ${S.npc ? 'npc' : '—'} ${S.job || ''} · 열쇠 ${S.n} · 더 ${add.slice(0, 12).join(',') || '—'} · 덜 ${miss.slice(0, 12).join(',') || '—'}${ord}`); }
  prev = H;
}
