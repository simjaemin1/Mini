#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1325 판 자 · 읽기만)
// === scripts/t1325-metrics.js — 카드 T1325 판 세 수 + 농부로 든 곳 ===
//   쓰는 법: node scripts/t1325-metrics.js 이름=<t1325 관찰기 JSON(gz 도)>[,<t1307 관찰기 JSON(gz 도)>] …
//            (t1307 을 안 주면 같은 자리 `.t1325.` → `.t1307.` 로 찾는다 · 몸 판 이어 돌리기 마디 파일은 먼저 하나로 합쳐 준다)
//   · 농부 끌어당김 = 농부 날 90 − 날 70(t1325 날 줄)
//   · 날 90 ~ 120 출생 10날 = t1307 `born` 날 91 ~ 120 합 ÷ 3
//   · 곳간 목재 바닥 날 = 세계 합 곳간 목재(t1325 `woodSt` · 틱 뒤) < 50 인 날 수(날 1 ~ 120)
//   · 농부로 든 곳(날 71 ~ 90) = t1307 `flows` 의 `<전>>farmer` 합(`+` = 새로 난 사람 첫 직업)
const fs = require('fs');
const zlib = require('zlib');
const read = (f) => { let b = fs.readFileSync(f); if (/\.gz$/.test(f)) b = zlib.gunzipSync(b); return JSON.parse(b.toString('utf8')); };
const byDay = (j) => { const m = new Map(); for (const r of j.rows) { const o = {}; j.cols.forEach((c, i) => { o[c] = r[i]; }); m.set(o.day, o); } return m; };
const WOOD_FLOOR = 50;
for (const a of process.argv.slice(2)) {
  const i = a.indexOf('='); if (i < 0) continue;
  const name = a.slice(0, i); const [f25, f07in] = a.slice(i + 1).split(',');
  const f07 = f07in || f25.replace('.t1325.', '.t1307.');
  const T = byDay(read(f25)); const J7 = read(f07); const B = byDay(J7);
  const g = (d, k) => (T.get(d) ? T.get(d)[k] : NaN);
  let born = 0; for (const [d, o] of B) if (d > 90 && d <= 120) born += o.born;
  let wb = 0; for (const [d, o] of T) if (d >= 1 && d <= 120 && o.woodSt < WOOD_FLOOR) wb++;
  let inn = 0, out = 0; const from = {};
  for (const [d, o] of (J7.flows || [])) {
    if (d <= 70 || d > 90) continue;
    for (const [k, v] of Object.entries(o)) { const [x, y] = k.split('>'); if (y === 'farmer') { inn += v; from[x] = (from[x] || 0) + v; } if (x === 'farmer') out += v; }
  }
  const src = Object.entries(from).sort((p, q) => q[1] - p[1]).slice(0, 6).map(([k, v]) => `${k === '+' ? '새로 남' : k} ${v}`).join(' · ');
  console.log(`${name}: 농부 날 70 → 90 ${g(70, 'farmer')} → ${g(90, 'farmer')} = +${g(90, 'farmer') - g(70, 'farmer')} · 날 90 ~ 120 출생 10날 ${(born / 3).toFixed(1)}(합 ${born}) · 곳간 목재 바닥 날(< ${WOOD_FLOOR}) ${wb} · 농부로 듦 ${inn}(${src}) · 나감 ${out}`);
}
