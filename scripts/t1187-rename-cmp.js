#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1187 자 · 판정 0)
// === scripts/t1187-rename-cmp.js — 이름 바꾼 판이 같은가: 두 서버 기준선 파일(`server-baseline-check --make`)을 **마을마다 해시**로 견준다 ===
//   node scripts/t1187-rename-cmp.js <옛 이름 판.json> <새 이름 판.json>
//   날 해시(`days[i][2]`)는 마을 이름을 품는다(이름이 바뀌면 늘 갈린다) — 이름 없는 칸만 견준다:
//     날마다 마을마다 칸 넷(곳간 · 사람 · 집 · 금고)의 해시(`days[i][3]` · 이름 무관 · 같은 차례) + 그 판의 해체 · 빈 마을 · 여덟 수(`eight` · 이름 없는 수만)
//   같음 = 모든 시드 · 모든 날 · 모든 마을 칸이 같다. 다름이면 첫 갈림 날 · 마을(옛 이름 → 새 이름)을 적는다.
const fs = require('fs');
const [A, B] = process.argv.slice(2).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const res = [];
for (const s of Object.keys(A.byseed || {})) {
  const a = A.byseed[s], b = (B.byseed || {})[s];
  if (!b) { res.push({ seed: s, same: false, why: '판 없음' }); continue; }
  let first = null;
  const n = Math.max(a.days.length, b.days.length);
  for (let i = 0; i < n && !first; i++) {
    const da = a.days[i], db = b.days[i];
    if (!da || !db || da[0] !== db[0]) { first = { i, why: '날 줄이 다르다' }; break; }
    const va = da[3] || [], vb = db[3] || [];
    if (va.length !== vb.length) { first = { day: da[0], why: `마을 수 ${va.length} ↔ ${vb.length}` }; break; }
    for (let j = 0; j < va.length; j++) if (va[j] !== vb[j]) { first = { day: da[0], v: `${(a.names || [])[j]} → ${(b.names || [])[j]}`, why: '칸 해시' }; break; }
  }
  const sideSame = JSON.stringify([a.dissolved, a.empty]) === JSON.stringify([b.dissolved, b.empty]);
  const renamed = (a.names || []).filter((x, j) => x !== (b.names || [])[j]).length;
  res.push({ seed: s, same: !first && sideSame, days: a.days.length, villages: (a.names || []).length, renamed, first, dissolved: [a.dissolved, b.dissolved], empty: [a.empty, b.empty] });
}
const k = res.filter((r) => r.same).length;
console.log(JSON.stringify(res, null, 1));
console.log(`=== 이름 바꾼 판 ${k === res.length ? '같음' : '다름'} ${k}/${res.length} ===`);
