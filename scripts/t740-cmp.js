#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T740 계측기)
// === scripts/t740-cmp.js — 두 판(t740-run)의 econ 지문 + 서버 마을 칸 지문을 날마다 견준다 ======================================
//   node scripts/t740-cmp.js <판 A 폴더> <판 B 폴더> [--from 0] [--ignore k1,k2]
//   ⇒ econ 첫 갈림 날 · 마을 칸 첫 갈림 날 · 칸마다(처음 갈린 날 · 갈린 날 수 · 그 날 갈린 마을 수)
'use strict';
const fs = require('fs');
const path = require('path');
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const FROM = +opt('from', '0');
const IGN = new Set(String(opt('ignore', '')).split(',').filter(Boolean));
const rd = (d, f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
const crypto = require('crypto');
const H6 = (x) => crypto.createHash('sha1').update(x).digest('hex').slice(0, 6);
//   '빈' = 칸 없음 · null · undefined — 캐시가 아직 안 선 것(다시 셈 칸)과 값이 다른 것을 가른다
const EMPTY = new Set(['∅', 'null', '"u"'].map(H6));
function cmp(A, B) {
  const EA = rd(A, 'all.t650.json'), EB = rd(B, 'all.t650.json');
  const mb = new Map(EB.days.map((r) => [r.d, r]));
  let econFirst = null, econN = 0, both = 0, econVil = [];
  const strip = (r) => JSON.stringify([r.seed, r.wd, r.car, r.vil, r.tl]);
  for (const r of EA.days) { if (r.d < FROM) continue; const s = mb.get(r.d); if (!s) continue; both++;
    if (strip(r) !== strip(s)) { econN++; if (econFirst == null) { econFirst = r.d; econVil = r.vil.filter((v, i) => JSON.stringify(v) !== JSON.stringify(s.vil[i])).map((v) => v[0]); } } }
  const SA = rd(A, 'all.t740.json'), SB = rd(B, 'all.t740.json');
  const sb = new Map(SB.days.map((r) => [r.d, r]));
  const per = {}, empt = {}; let sideFirst = null, sideBoth = 0;
  for (const r of SA.days) { if (r.d < FROM) continue; const s = sb.get(r.d); if (!s) continue; sideBoth++;
    const ks = new Set([...Object.keys(r.f), ...Object.keys(s.f)]);
    for (const k of ks) { if (IGN.has(k)) continue; const x = r.f[k] || '', y = s.f[k] || '';
      if (x === y) continue;
      let nv = 0, ne = 0; const n = Math.max(x.length, y.length) / 6;
      for (let i = 0; i < n; i++) { const hx = x.substr(i * 6, 6) || H6('∅'), hy = y.substr(i * 6, 6) || H6('∅'); if (hx === hy) continue; if (EMPTY.has(hx) || EMPTY.has(hy)) ne++; else nv++; }
      if (!nv) { const q = empt[k] || (empt[k] = { first: r.d, days: 0, vMax: 0 }); q.days++; if (ne > q.vMax) q.vMax = ne; continue; }
      const p = per[k] || (per[k] = { first: r.d, days: 0, vMax: 0, vFirst: nv }); p.days++; if (nv > p.vMax) p.vMax = nv;
      if (sideFirst == null || r.d < sideFirst) sideFirst = r.d; } }
  return { econ: { both, first: econFirst, n: econN, vil: econVil.slice(0, 8) }, side: { both: sideBoth, first: sideFirst, fields: per, empty: empt } };
}
module.exports = { cmp };
if (require.main === module) {
  const R = cmp(a[0], a[1]);
  console.log(`econ 지문: 견준 날 ${R.econ.both} · 첫 갈림 ${R.econ.first == null ? '없음(바이트 같음)' : R.econ.first + ` · 갈린 날 ${R.econ.n} · 그 날 마을 ${R.econ.vil.join(',')}`}`);
  const F = Object.entries(R.side.fields).sort((x, y) => x[1].first - y[1].first || x[0].localeCompare(y[0]));
  console.log(`마을 칸 지문: 견준 날 ${R.side.both} · 첫 갈림 ${R.side.first == null ? '없음(바이트 같음)' : R.side.first} · 갈린 칸 ${F.length}`);
  for (const [k, p] of F) console.log(`  ${k.padEnd(18)} 첫 ${p.first} · 갈린 날 ${p.days} · 첫날 마을 ${p.vFirst} · 최대 ${p.vMax}`);
  const E = Object.entries(R.side.empty).filter(([k]) => !R.side.fields[k]);
  if (E.length) console.log(`  (값은 같고 한쪽이 빈 칸 — 캐시가 아직 안 섰다: ${E.map(([k, q]) => `${k} ${q.days}날`).join(' · ')})`);
  if (a.includes('--json')) console.log(JSON.stringify(R));
}
