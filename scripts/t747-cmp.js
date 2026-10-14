#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T747 계측기 · 제품 무변)
// === scripts/t747-cmp.js — `t747-real` 의 save.json(종료 저장 순간) ↔ ready.json(다시 뜬 첫 틱) 몸 칸 견주기 ===
//   node scripts/t747-cmp.js <판 디렉터리> [--fields]   ⇒ 칸마다 갈린 몸 수 · 손 합(마을 · 품목) 전 → 후 · 클레임 그림자 · cmp.json
'use strict';
const fs = require('fs');
const path = require('path');
const D = process.argv[2];
const S = JSON.parse(fs.readFileSync(path.join(D, 'save.json'), 'utf8'));
const Rd = JSON.parse(fs.readFileSync(path.join(D, 'ready.json'), 'utf8'));
const per = {};   // 칸 → { n(둘 다 있는 몸), diff, onlyS, onlyR }
let bodies = 0, bodyDiff = 0;
const hand = (rows) => { const t = {}; for (const r of rows) { if (!r || !r.inventory) continue; let inv; try { inv = JSON.parse(r.inventory); } catch (e) { continue; } for (const k in inv) if (typeof inv[k] === 'number' && inv[k] > 0) t[k] = (t[k] || 0) + inv[k]; } return t; };
const H = { save: {}, ready: {}, vils: 0, vilDiff: 0 }, claims = [];
for (const name of Object.keys(S.vils)) {
  const a = S.vils[name], b = Rd.vils[name]; if (!b) continue;
  const n = Math.min(a.rows.length, b.rows.length);
  for (let i = 0; i < n; i++) {
    const x = a.rows[i], y = b.rows[i]; if (!x || !y) continue;
    bodies++; let any = false;
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) {
      const P = per[k] || (per[k] = { n: 0, diff: 0, onlyS: 0, onlyR: 0, ex: null });
      if (!(k in y)) { P.onlyS++; any = true; continue; }
      if (!(k in x)) { P.onlyR++; any = true; continue; }
      P.n++;
      const nz = (v) => (v === '"u"' ? 'null' : v);   // 없음(undefined) = null — 몸 칸을 읽는 자리는 둘을 같게 본다(`!x` · `== null`)
      if (nz(x[k]) !== nz(y[k])) { P.diff++; any = true; if (!P.ex) P.ex = [name, i, String(x[k]).slice(0, 120), String(y[k]).slice(0, 120)]; }
    }
    if (any) bodyDiff++;
  }
  const hs = hand(a.rows), hr = hand(b.rows);
  { const ks = new Set([...Object.keys(hs), ...Object.keys(hr)]); let d = false; for (const k of ks) if (Math.abs((hs[k] || 0) - (hr[k] || 0)) > 1e-9) d = true; if (d) H.vilDiff = (H.vilDiff || 0) + 1; H.vils = (H.vils || 0) + 1; }
  for (const k in hs) H.save[k] = (H.save[k] || 0) + hs[k];
  for (const k in hr) H.ready[k] = (H.ready[k] || 0) + hr[k];
  claims.push([name, a.n, b.n, a.claim, b.claim, a.clearCrew, b.clearCrew, a.buildCrew, b.buildCrew, a.cropClaim, b.cropClaim]);
}
const rnd = (o) => { const r = {}; for (const k of Object.keys(o).sort()) r[k] = +o[k].toFixed(4); return r; };
const out = { bodies, bodyDiff, fields: Object.keys(per).length,
  changed: Object.entries(per).filter(([, v]) => v.diff || v.onlyS || v.onlyR).sort((p, q) => (q[1].diff + q[1].onlyS) - (p[1].diff + p[1].onlyS)).map(([k, v]) => [k, v.n, v.diff, v.onlyS, v.onlyR, v.ex]),
  same: Object.entries(per).filter(([, v]) => !(v.diff || v.onlyS || v.onlyR)).map(([k]) => k).sort(),
  hands: { save: rnd(H.save), ready: rnd(H.ready), vils: H.vils, vilDiff: H.vilDiff },
  claims: claims.filter((c) => c[3] !== c[4] || c[5] !== c[6] || c[7] !== c[8] || c[9] !== c[10] || c[1] !== c[2]) };
fs.writeFileSync(path.join(D, 'cmp.json'), JSON.stringify(out, null, 1));
console.log(`몸 ${bodies} · 갈린 몸 ${bodyDiff} · 칸 ${out.fields} · 갈린 칸 ${out.changed.length} · 같은 칸 ${out.same.length}`);
for (const c of out.changed) console.log(`  ${c[0].padEnd(14)} 둘다 ${c[1]} · 다름 ${c[2]} · 저장에만 ${c[3]} · 다시뜬데만 ${c[4]}` + (process.argv.includes('--fields') && c[5] ? `  예 ${JSON.stringify(c[5])}` : ''));
console.log(`손 합 갈린 마을 ${out.hands.vilDiff}/${out.hands.vils}`); console.log('손 합 저장 →', JSON.stringify(out.hands.save)); console.log('손 합 다시 →', JSON.stringify(out.hands.ready));
console.log('클레임 그림자 갈린 마을', out.claims.length, JSON.stringify(out.claims.slice(0, 6)));
