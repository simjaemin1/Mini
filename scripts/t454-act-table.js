#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T454 표 기계)
// =============================================================================
// T454 — `t176-ab` 가 남긴 `T17_JSON`(j) · `T176_JSON`(x) 을 팔끼리 나란히 놓는다(새 계산 0).
//   · 여덟 수 + ㉮㉯ + 소멸 · 기준팔 대비 짝 Δ%(T252 자)
//   · 인구 궤적 — 마을 표의 `traj`(20일 간격 · 마을별 N)를 날마다 합친다 · 기준팔과 **처음 갈린 날**
//   · 200일 인구(같은 궤적의 d=200 합 — T368 의 200일 판과 견줄 칸)
//   · 바닥 마을 표(ⓛ) — 줄 수 · 칼날 위
//   · 기준팔과 JSON 바이트가 같은가(손잡이가 이 자에서 **안 닿는** 팔을 가른다)
// 쓰는 법: node scripts/t454-act-table.js <dir> <기준팔> <팔> …
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const [DIR, BASE, ...ARMS] = process.argv.slice(2);
const SEEDS = [1020, 7, 42];
const rd = (a, k, s) => fs.readFileSync(path.join(DIR, a, `${k}_${s}.json`), 'utf8');
const J = (a, s) => JSON.parse(rd(a, 'j', s));
const X = (a, s) => JSON.parse(rd(a, 'x', s));
const O = (a, s) => fs.readFileSync(path.join(DIR, a, `o_${s}.txt`), 'utf8');
const COLS = [['인구', (j) => j.base.pop], ['무기Q', (j) => j.base.weapQ], ['확장셀', (j) => j.base.expand], ['게시', (j) => j.board.reqOpened],
  ['도구Q', (j) => j.tool.q], ['보존식', (j) => j.preserve.stock], ['생곡', (j) => j.eight.grain], ['㉮', (j) => j.eight.densAll], ['㉯', (j) => j.eight.densValue]];
const traj = (x) => { const m = new Map(); for (const p of x.per) for (const t of (p.traj || [])) m.set(t.d, (m.get(t.d) || 0) + (t.N || 0)); return [...m.entries()].sort((a, b) => a[0] - b[0]); };
const floorOf = (o) => { const m = o.match(/칼날 위 (\d+)곳 \/ 바닥 마을 (\d+)곳/); return m ? { edge: +m[1], floor: +m[2] } : null; };
const out = { arms: {} };
for (const a of [BASE, ...ARMS]) {
  const rows = SEEDS.map((s) => {
    const j = J(a, s), x = X(a, s), tr = traj(x);
    const d200 = (tr.find(([d]) => d === 200) || [0, null])[1];
    return { seed: s, dead: `${j.base.dead}/${j.base.ever}`, ...Object.fromEntries(COLS.map(([k, f]) => [k, f(j)])), pop200: d200,
      floor: floorOf(O(a, s)), sameAsBase: a !== BASE && rd(a, 'j', s) === rd(BASE, 'j', s) && rd(a, 'x', s) === rd(BASE, 'x', s),
      traj: tr, firstDiff: null };
  });
  out.arms[a] = { rows };
}
for (const a of ARMS) {
  out.arms[a].rows.forEach((r, i) => {
    const b = out.arms[BASE].rows[i].traj;
    const hit = r.traj.find(([d, n], k) => !b[k] || b[k][1] !== n);
    r.firstDiff = hit ? hit[0] : null;
  });
  out.arms[a].delta = COLS.map(([k]) => {
    const d = out.arms[a].rows.map((r, i) => { const b = out.arms[BASE].rows[i][k]; return b ? (r[k] - b) / b * 100 : 0; });
    const m = d.reduce((x, y) => x + y, 0) / 3, w = Math.max(...d) - Math.min(...d);
    const sg = d.every((x) => x > 0) || d.every((x) => x < 0);
    return { k, d: d.map((x) => +x.toFixed(2)), mean: +m.toFixed(2), width: +w.toFixed(2), verdict: sg && Math.abs(m) > w ? '가름' : (sg ? '방향만' : '못 가름') };
  });
}
for (const a of Object.keys(out.arms)) for (const r of out.arms[a].rows) r.traj = r.traj.filter(([d]) => d % 100 === 0);   // 표엔 100일 간격만 남긴다
console.log(JSON.stringify(out, null, 1));
