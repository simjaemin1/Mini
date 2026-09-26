#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T416 표 짜는 기계)
// =============================================================================
// T416 — `t17-metrics` 가 남긴 `T17_JSON` 들을 팔끼리 나란히 놓는다(새 계산 0 · 분류는 정본 술어 둘).
//   · 기준선 열: 인구·소멸·무기Q·확장셀·게시·도구Q·보존식·생곡·㉮·㉯
//   · 부족 사건(`short` · 의뢰는 부족 래치가 서 있는 동안만 걸린다 — `events.js syncRequests`)을
//     둘로 가른다: `economy-sim-v2.isSubsistenceFlow`(subs 등재 — 정본 술어) × **기준팔에도 부족이 난 품목인가**
//     (아니면 `T263_FOOD_CONS` 같은 팔이 **새로 연** 품목 — 표에서 읽는다 · 손 목록 0).
//   · T252 자(짝 Δ% · 부호 3/3 AND |평균| > 폭 → 가름 · 부호 3/3 → 방향만 · 나머지 못 가름).
//
// 쓰는 법: node scripts/t416-guard-table.js <dir> <기준팔> <팔> [<팔> …]    (dir/<팔>/j_<seed>.json)
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const _log = console.log; console.log = () => {};   // 정본 적재 배너를 표 밖으로
const V2 = R('sim/economy-sim-v2');
console.log = _log;
const [DIR, BASE, ...ARMS] = process.argv.slice(2);
const SEEDS = [1020, 7, 42];
const J = (arm, s) => JSON.parse(fs.readFileSync(path.join(DIR, arm, `j_${s}.json`), 'utf8'));
const COLS = [['인구', (j) => j.base.pop], ['무기Q', (j) => j.base.weapQ], ['확장셀', (j) => j.base.expand], ['게시', (j) => j.board.reqOpened],
  ['도구Q', (j) => j.tool.q], ['보존식', (j) => j.preserve.stock], ['생곡', (j) => j.eight.grain], ['㉮', (j) => j.eight.densAll], ['㉯', (j) => j.eight.densValue]];
const _baseShort = new Set(); for (const s of SEEDS) for (const r of Object.keys(J(BASE, s).short || {})) _baseShort.add(r);
const cls = (r) => (V2.isSubsistenceFlow(r) ? 'subs' : 'free') + '·' + (_baseShort.has(r) ? '기준팔에도' : '새로 연');
const out = { rows: [], delta: {}, shortCls: {}, shortTop: {} };
for (const arm of [BASE, ...ARMS]) {
  for (const s of SEEDS) {
    const j = J(arm, s);
    out.rows.push({ arm, seed: s, dead: `${j.base.dead}/${j.base.ever}`, ...Object.fromEntries(COLS.map(([k, f]) => [k, f(j)])) });
  }
  const agg = {}, top = {};
  for (const s of SEEDS) for (const [r, n] of Object.entries(J(arm, s).short || {})) { const c = cls(r); agg[c] = (agg[c] || 0) + n; top[r] = (top[r] || 0) + n; }
  out.shortCls[arm] = agg;
  out.shortTop[arm] = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 12);
}
for (const arm of ARMS) {
  out.delta[arm] = COLS.map(([k, f]) => {
    const d = SEEDS.map((s) => { const b = f(J(BASE, s)), a = f(J(arm, s)); return b ? (a - b) / b * 100 : 0; });
    const m = d.reduce((x, y) => x + y, 0) / 3, w = Math.max(...d) - Math.min(...d);
    const sg = d.every((x) => x > 0) || d.every((x) => x < 0);
    return { k, d: d.map((x) => +x.toFixed(2)), mean: +m.toFixed(2), width: +w.toFixed(2), verdict: sg && Math.abs(m) > w ? '가름' : (sg ? '방향만' : '못 가름') };
  });
}
console.log(JSON.stringify(out, null, 1));
