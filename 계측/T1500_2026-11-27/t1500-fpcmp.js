#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1500 날 지문 중간 견줌 · 판 폴더만 읽는다)
// === 계측/T1500_2026-11-27/t1500-fpcmp.js — 도는 중인 두 판의 마디 파일(seg-0.*)로 날 지문을 견준다(끝난 판은 scripts/t1308-cmp.js) ===
//   node t1500-fpcmp.js <판 A> <판 B> — 마을 칸(t740 · 날마다 칸별 해시) · 몸 자리(t1308b) · econ(t650 — 판이 끝나야 써진다)
const fs = require('fs'), path = require('path');
const [A, B] = process.argv.slice(2);
const rd = (d, f) => { try { return JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch (e) { return null; } };
const S = (x) => JSON.stringify(x);
function cmp(a, b, key, val) {
  if (!a || !b) return null; const mb = new Map(b.map((r) => [key(r), r])); let both = 0, same = 0, first = null;
  for (const r of a) { const q = mb.get(key(r)); if (!q) continue; both++; if (S(val(r)) === S(val(q))) same++; else if (first == null) first = key(r); }
  return { both, same, first };
}
const f = (o) => (o ? `${o.same}/${o.both}${o.first != null ? ` · 첫 갈림 ${o.first}` : ''}` : '—');
const t740 = cmp((rd(A, 'seg-0.json.t740.json') || {}).days, (rd(B, 'seg-0.json.t740.json') || {}).days, (r) => r.d, (r) => r.f);
const body = cmp((rd(A, 'seg-0.t1308b.json') || {}).days, (rd(B, 'seg-0.t1308b.json') || {}).days, (r) => r.d, (r) => [r.n, r.h]);
const e = (d) => { const o = rd(d, 'seg-0.json.t650.json'); return o && o.days; };
const econ = cmp(e(A), e(B), (r) => r.d, (r) => { const o = Object.assign({}, r); delete o.ms; delete o.sites; delete o.cnt; return o; });
console.log(`| ${path.basename(A)} : ${path.basename(B)} | 마을 칸(t740) ${f(t740)} | 몸 자리(t1308b) ${f(body)} | econ(t650) ${f(econ)} |`);
