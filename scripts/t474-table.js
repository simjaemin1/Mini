#!/usr/bin/env node
// === scripts/t474-table.js — T474 ③ 유도 팔 3시드 표(T252 자 — 팔 대 팔 짝 Δ) ===
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다.
//   `scripts/t474-arm.js` 가 남긴 판(끔 `off-<시드>.json`·`arm-off-<시드>.json` · 켬 `on-<시드>.json`·`arm-on-<시드>.json`)을
//   읽어 수마다 시드별 짝 Δ% 와 T252 가름(`인계/공통.md` §3: 부호 3/3 그리고 |평균| > 폭(최대−최소) → 가름 ·
//   부호 3/3 · |평균| ≤ 폭 → 방향만 · 부호 갈림 → 못 가름 · 소멸은 0/51 이라 한 곳만 나도 유의)을 낸다. 판정 규칙은 그 문장 그대로다(새 규칙 0).
//   ⚠교역 기록(`tradeLog`)은 **최근 5,000건 상한**이다(`economy-sim-v2.js` `splice(0, len − 5000)`) — 켬은 캐러밴이 ×3 이라 같은 5,000건이
//     더 짧은 날을 덮는다. 그래서 기록에서 세는 **건수**(재routing·보존식 유통 · t17 `거래` 열 = 5,000 고정)는 두 팔을 못 견준다 — 표에 안 넣는다.
//     교역 빈도는 **띄운 수**(`_caravanIdCounter` · 상한 없음)로 · 날 수는 기록 표본의 **한 건당 값**(창 길이와 무관)으로 읽는다.
//
// 실행: node scripts/t474-table.js <판 폴더> [시드…]      (기본 시드 1020 7 42)
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] || '/tmp/t474/runs';
const SEEDS = process.argv.length > 3 ? process.argv.slice(3).map(Number) : [1020, 7, 42];
const rd = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const ROWS = [
  ['캐러밴 띄운 수(800일)', 'arm', 'caravan.launched'],
  ['캐러밴 날 평균(최근 5,000건)', 'arm', 'caravan.travelDays.mean'],
  ['캐러밴 날 p50(최근 5,000건)', 'arm', 'caravan.travelDays.p50'],
  ['소문 — 7일 안 닿는 마을(사건당 p50)', 'arm', 'rumor.in7.p50'],
  ['소문 — 평균 지연(일)', 'arm', 'rumor.meanDelay'],
  ['소문 — 판 끝까지 들은 몫', 'arm', 'rumor.heardByEnd'],
  ['인구', 't17', 'base.pop'],
  ['소멸', 't17', 'base.dead'],
  ['무기Q', 't17', 'base.weapQ'],
  ['확장셀', 't17', 'base.expand'],
  ['게시(의뢰)', 't17', 'board.reqOpened'],
  ['도구Q', 't17', 'tool.q'],
  ['보존식', 't17', 'preserve.stock'],
  ['생곡', 't17', 'eight.grain'],
  ['사건', 't17', 'board.emitted'],
  ['밀도 ㉮(일/건)', 't17', 'eight.densAll'],
  ['밀도 ㉯(일/건)', 't17', 'eight.densValue'],
  ['소금 내륙/해안 값 비', 't17', 'salt.gap'],
];
const out = [];
out.push(`| 수 | ${SEEDS.map((s) => `끔 ${s}`).join(' | ')} | ${SEEDS.map((s) => `켬 ${s}`).join(' | ')} | 짝 Δ% | 부호 | 평균 | 폭 | T252 |`);
out.push(`|---|${SEEDS.map(() => '---:').join('|')}|${SEEDS.map(() => '---:').join('|')}|---|---|---:|---:|---|`);
const res = {};
for (const [name, src, key] of ROWS) {
  const A = SEEDS.map((s) => get(rd(src === 'arm' ? `arm-off-${s}.json` : `off-${s}.json`), key));
  const B = SEEDS.map((s) => get(rd(src === 'arm' ? `arm-on-${s}.json` : `on-${s}.json`), key));
  let verdict, dStr, mean = null, width = null, sign = '';
  if (key === 'base.dead') {
    verdict = B.some((x) => x > 0) || A.some((x) => x > 0) ? (B.reduce((a, b) => a + b, 0) > A.reduce((a, b) => a + b, 0) ? '유의(소멸 늘었다)' : '유의') : '0 = 0';
    dStr = SEEDS.map((_, i) => `${A[i]}→${B[i]}`).join(' · ');
  } else {
    const d = SEEDS.map((_, i) => (A[i] ? (B[i] - A[i]) / Math.abs(A[i]) * 100 : (B[i] === A[i] ? 0 : Infinity)));
    const pos = d.filter((x) => x > 0).length, neg = d.filter((x) => x < 0).length;
    mean = d.reduce((a, b) => a + b, 0) / d.length; width = Math.max(...d) - Math.min(...d);
    sign = `${Math.max(pos, neg)}/${d.length}${pos > neg ? '+' : neg > pos ? '−' : ''}`;
    verdict = (pos === d.length || neg === d.length) ? (Math.abs(mean) > width ? '가름' : '방향만') : '못 가름';
    dStr = d.map((x) => (isFinite(x) ? (x >= 0 ? '+' : '') + x.toFixed(1) : '∞')).join(' · ');
  }
  res[name] = { A, B, verdict, mean, width };
  const f = (x) => (x == null ? '—' : (typeof x === 'number' ? (Number.isInteger(x) ? String(x) : x.toFixed(3)) : String(x)));
  out.push(`| ${name} | ${A.map(f).join(' | ')} | ${B.map(f).join(' | ')} | ${dStr} | ${sign} | ${mean == null ? '—' : (mean >= 0 ? '+' : '') + mean.toFixed(1)} | ${width == null ? '—' : width.toFixed(1)} | ${verdict} |`);
}
console.log(out.join('\n'));
if (process.env.T474_TABLE_JSON) fs.writeFileSync(process.env.T474_TABLE_JSON, JSON.stringify(res, null, 1));
