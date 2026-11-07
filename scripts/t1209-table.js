#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1209 표 기계 · 판정 0)
// === scripts/t1209-table.js — 관찰기(`t1209-observe.js`) 판 JSON 묶음 → "왜 굶나" 표 ===
//   쓰는 법: node scripts/t1209-table.js <이름>=<관찰 JSON>[,…] … [--json <출력>]
//   판마다:
//     끝 인구 · 빈 마을 · 굶어 죽음 · 죽음 전체 · 이탈 · 새 사람
//     곳간 빈 마을-날(사람 있는데 곳간 식량 환산 < 0.5) · 사흘 넘게 이은 빈 곳간 수 · 가장 긴 빈 곳간
//     못 먹은 몫 ÷ 제 몫(전체 · 철마다) · 생산 ÷ 제 몫(철마다 — 관찰기 `prod` 칸이 있는 판만)
//     굶어 죽음을 그 마을 앞 엿새 곳간으로 가른 셋 — 비었다(엿새 내내 < 0.5) · 조금(인구 아래) · 넉넉(한 날이라도 ≥ 인구)
//     한꺼번에 죽음 — 한 마을 하루 다섯 넘게 굶어 죽은 날의 몫(같은 게이지로 함께 내려간 죽음)
'use strict';
const fs = require('fs');
const args = process.argv.slice(2);
const jOut = args.indexOf('--json') >= 0 ? args[args.indexOf('--json') + 1] : null;
function one(file) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const R = d.rows, C = {}; d.cols.forEach((c, i) => { C[c] = i; });
  const g = (x, c) => (C[c] != null && C[c] < x.length ? x[C[c]] : 0);
  const n = R.length, last = R[n - 1], first = R[0];
  let emptyVD = 0, need = 0, short = 0, born = 0, big = 0, starvedEv = 0;
  const seas = {}, cls = { empty: 0, some: 0, plenty: 0 };
  const runs = [];
  const cur = new Array(d.names.length).fill(0);
  for (let i = 0; i < n; i++) {
    const r = R[i], s = r[1]; const S = seas[s] || (seas[s] = { need: 0, short: 0, prod: 0 });
    r[2].forEach((x, j) => {
      if (x[0] > 0) { need += g(x, 'need'); short += g(x, 'short'); S.need += g(x, 'need'); S.short += g(x, 'short'); S.prod += g(x, 'prod'); born += g(x, 'born'); }
      if (x[0] > 0 && g(x, 'tfe') < 0.5) { emptyVD++; cur[j]++; } else { if (cur[j] >= 3) runs.push(cur[j]); cur[j] = 0; }
      if (!i) return;
      const dd = g(x, 'fdDead') - g(R[i - 1][2][j], 'fdDead');
      if (dd <= 0) return;
      starvedEv += dd; if (dd > 5) big += dd;
      let allEmpty = true, plenty = false;
      for (let k = Math.max(0, i - 6); k < i; k++) { const y = R[k][2][j]; if (g(y, 'tfe') >= 0.5) allEmpty = false; if (g(y, 'tfe') >= y[0]) plenty = true; }
      cls[allEmpty ? 'empty' : plenty ? 'plenty' : 'some'] += dd;
    });
  }
  for (const c of cur) if (c >= 3) runs.push(c);
  const sum = (r, c) => r[2].reduce((a, x) => a + g(x, c), 0);
  const bySeason = {}; for (const [s, v] of Object.entries(seas)) bySeason[s] = { short: v.need ? +(v.short / v.need).toFixed(4) : 0, prod: v.need && v.prod ? +(v.prod / v.need).toFixed(3) : null };
  return {
    file, days: n, pop: sum(last, 'pop'), empty: last[2].filter((x) => x[0] === 0).length, villages: last[2].length,
    starved: sum(last, 'fdDead') - sum(first, 'fdDead'), dead: sum(last, 'deadTot') - sum(first, 'deadTot'), emig: sum(last, 'emig'), born,
    emptyVD, runs3: runs.length, maxRun: runs.length ? Math.max(...runs) : 0, shortShare: need ? +(short / need).toFixed(4) : 0, bySeason,
    starvedBy: cls, massShare: starvedEv ? +(big / starvedEv).toFixed(3) : 0,
  };
}
const out = {};
for (const a of args) { if (a === '--json' || a === jOut) continue; const k = a.indexOf('='); const name = a.slice(0, k), list = a.slice(k + 1); out[name] = list.split(',').filter(Boolean).map((f) => { try { return one(f); } catch (e) { return { file: f, err: e.message }; } }); }
for (const [name, rs] of Object.entries(out)) {
  console.log(`\n## ${name}`);
  console.log('| 판 | 인구 | 빈 마을 | 굶어 죽음 | 죽음 | 이탈 | 새 사람 | 빈 곳간 마을-날 | 사흘+ 이은 빈 곳간 · 가장 긴 | 못 먹은 몫 | 철(못 먹은 몫 · 생산/제 몫) | 굶어 죽음: 빈 · 조금 · 넉넉 | 한꺼번에 몫 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rs) {
    if (r.err) { console.log(`| ${r.file} | 실패 ${r.err} |`); continue; }
    const se = ['spring', 'summer', 'autumn', 'winter'].filter((s) => r.bySeason[s]).map((s) => `${s[0]} ${r.bySeason[s].short}${r.bySeason[s].prod != null ? '/' + r.bySeason[s].prod : ''}`).join(' · ');
    console.log(`| ${r.file.split('/').pop()} | ${r.pop} | ${r.empty}/${r.villages} | ${r.starved} | ${r.dead} | ${r.emig} | ${r.born} | ${r.emptyVD} | ${r.runs3} · ${r.maxRun} | ${r.shortShare} | ${se} | ${r.starvedBy.empty} · ${r.starvedBy.some} · ${r.starvedBy.plenty} | ${r.massShare} |`);
  }
}
if (jOut) fs.writeFileSync(jOut, JSON.stringify(out, null, 1));
