#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T740 계측기)
// === scripts/t740-moment.js — 멈춘 순간(stop.json) ↔ 다시 뜬 순간(resume.json · 첫 틱 전) 서버 마을 칸 견줌(Map · Set 풀어서) ==========
//   node scripts/t740-moment.js <판 폴더> [--show 칸]   ⇒ 칸마다 갈린 마을 수 · 크기(멈춤 → 다시 뜸)
'use strict';
const fs = require('fs');
const path = require('path');
const a = process.argv.slice(2);
const D = a[0];
const S = JSON.parse(fs.readFileSync(path.join(D, 'stop.json'), 'utf8')).side;
const R = JSON.parse(fs.readFileSync(path.join(D, 'resume.json'), 'utf8')).side;
const size = (j) => { if (j == null || j === '∅') return '∅'; try { const x = JSON.parse(j); if (Array.isArray(x) && (x[0] === 'M' || x[0] === 'S') && Array.isArray(x[1])) return x[0] + x[1].length; if (Array.isArray(x)) return 'A' + x.length; if (x && typeof x === 'object') return 'O' + Object.keys(x).length; return JSON.stringify(x).slice(0, 14); } catch (e) { return '…' + j.length; } };
const keys = [...new Set([...Object.keys(S.f), ...Object.keys(R.f)])].sort();
const rows = [];
for (const k of keys) {
  const x = S.f[k] || '', y = R.f[k] || '';
  const n = S.names.length; let nv = 0; const ex = [];
  for (let i = 0; i < n; i++) if (x.substr(i * 6, 6) !== y.substr(i * 6, 6)) { nv++; if (ex.length < 2) ex.push(S.names[i]); }
  let sS = 0, sR = 0, cS = '', cR = '';
  for (const nm of S.names) { const p = size(S.raw[nm] ? S.raw[nm][k] : '∅'), q = size(R.raw[nm] ? R.raw[nm][k] : '∅');
    const m1 = /^[MSAO](\d+)$/.exec(p), m2 = /^[MSAO](\d+)$/.exec(q); if (m1) sS += +m1[1]; if (m2) sR += +m2[1]; if (!cS) cS = p; if (!cR) cR = q; }
  rows.push({ k, nv, ex, sS, sR, cS, cR, inS: k in S.f, inR: k in R.f });
}
for (const r of rows) console.log(`${r.nv ? '✗' : '○'} ${r.k.padEnd(16)} 갈린 마을 ${String(r.nv).padStart(2)}/${S.names.length} · 크기 합 ${r.sS} → ${r.sR}${!r.inR ? ' · 다시 뜬 쪽에 칸 없음' : ''}${!r.inS ? ' · 멈춘 쪽에 칸 없음' : ''}${r.nv ? ' · 예 ' + r.ex.join(',') : ''}`);
const sh = a.indexOf('--show'); if (sh >= 0) { const k = a[sh + 1]; const nm = a[sh + 2] || S.names.find((n) => S.f[k] && (S.raw[n] || {})[k] !== (R.raw[n] || {})[k]);
  console.log(`\n${k} @ ${nm}\n 멈춤: ${String((S.raw[nm] || {})[k]).slice(0, 1500)}\n 다시: ${String((R.raw[nm] || {})[k]).slice(0, 1500)}`); }
if (a.includes('--json')) console.log(JSON.stringify(rows));
