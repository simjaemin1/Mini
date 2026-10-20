#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T825 표 · 판 JSON 만 읽는다)
// === scripts/t825-table.js — 굶는 마을이 먹을 것을 내다 파나: 판 넷(끔 · 켬 · 끔 갈림 대조 · 켬 갈림 대조) × 3시드 ====================
//   쓰는 법: node scripts/t825-table.js <판 뿌리>   (뿌리 아래 run-off · run-on · run-off-skip1 · run-on-skip1 / base-<시드>.json · base-<시드>.t825.json)
//   굶는 날 = 출발 마을의 곳간 식량 환산 < 인구(하루치 · T796 의 "곳간 바닥") · 하한 = 잉여 셈의 식량류 하한(인구 × 30 × 1.2 = 36일치)
'use strict';
const fs = require('fs');
const path = require('path');
const D = process.argv[2];
if (!D) { console.error('쓰는 법: node scripts/t825-table.js <판 뿌리>'); process.exit(2); }
const SEEDS = [1020, 7, 42];
const ARMS = [['끔', 'off'], ['켬', 'on'], ['끔 ⓩ', 'off-skip1'], ['켬 ⓩ', 'on-skip1']];
const FOODR = new Set(['food', 'fish', 'meat', 'cooked_food']);
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const R = {};
for (const [k, t] of ARMS) for (const s of SEEDS) { const o = rd(path.join(D, 'run-' + t, `base-${s}.json`)), ob = rd(path.join(D, 'run-' + t, `base-${s}.t825.json`)); if (o && ob) R[k + '|' + s] = { o, ob }; }
const have = (k) => SEEDS.every((s) => R[k + '|' + s]);
const f0 = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1));

console.log('\n## 판마다 — 먹을 것을 실은 leg(3시드 합 · 800일)\n');
console.log('| 판 | 먹을 것 leg(식량류 넷 밖) | 그중 굶는 날(곳간 < 하루치) · 식량 환산 | 그중 하한 밑으로 내려감 · 식량 환산 | 굶는 날 품목(식량 환산 큰 순) | 굶는 날 출발이 사 온 식량류(교역 기록) | 굶는 마을-날 | 빈 마을(시드별) | 해체 없이 굶어 빔 | 인구 800일(시드별) |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
const OUT = {};
for (const [k] of ARMS) { if (!have(k)) continue;
  let n = 0, ns = 0, fs_ = 0, nl = 0, fl = 0, buyF = 0, starveDays = 0; const byRes = {}; const em = [], st = [], pop = [];
  for (const s of SEEDS) { const { o, ob } = R[k + '|' + s];
    for (const l of ob.legs) { if (FOODR.has(l[2])) continue; n++;
      const before = l[6] + l[3] * l[4];
      if (before < l[5]) { ns++; fs_ += l[3] * l[4]; byRes[l[2]] = (byRes[l[2]] || 0) + l[3] * l[4]; }
      if (l[6] < l[5] * 36 - 1e-6) { nl++; fl += l[3] * l[4]; } }
    for (const b of ob.buys) if (FOODR.has(b[4])) buyF += b[5];
    for (const [, row] of ob.days) for (const v of row) if (v && v[0] > 0 && v[1] < v[0]) starveDays++;
    const last = o.rows[o.rows.length - 1][1];
    em.push(o.empty); st.push(o.names.filter((x, i) => last[i] === 0 && o.bdtDay[i] == null).length); pop.push(o.eight ? o.eight.pop : '—'); }
  const top = Object.entries(byRes).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([r, v]) => `${r} ${f0(v)}`).join(' · ');
  OUT[k] = { n, ns, fs: fs_, nl, fl, buyF, starveDays, em, st, pop, byRes };
  console.log(`| ${k} | ${n} | ${ns} · ${f0(fs_)} | ${nl} · ${f0(fl)} | ${top || '—'} | ${f0(buyF)} | ${starveDays} | ${em.join(' / ')} (${em.reduce((a, b) => a + b, 0)}) | ${st.reduce((a, b) => a + b, 0)} | ${pop.join(' / ')} |`);
}

// ① 마을 하루 표 — 끔 판에서 굶는 날 먹을 것을 가장 많이 내보낸 마을(시드마다 하나) · 그 마을이 내보낸 날
if (have('끔')) {
  console.log('\n## ① 마을 하루 표 — 끔 판 · 굶는 날 먹을 것을 가장 많이 실은 마을(시드마다)\n');
  for (const s of SEEDS) { const { ob } = R['끔|' + s];
    const tot = {}; for (const l of ob.legs) { if (FOODR.has(l[2])) continue; const before = l[6] + l[3] * l[4]; if (before < l[5]) tot[l[1]] = (tot[l[1]] || 0) + l[3] * l[4]; }
    const top = Object.entries(tot).sort((a, b) => b[1] - a[1])[0]; if (!top) continue;
    const vi = +top[0], name = ob.names[vi];
    console.log(`### ${s} ${name} — 굶는 날 실은 식량 환산 ${f0(top[1])}\n`);
    console.log('| 날 | 인구 | 곳간 식량 환산(싣기 전) | 하한(36일치) | 실은 품목 · 단위 · 식량 환산 | 그 품목 남은 곳간 | 생곡 곳간(쌀 · 밀 · 보리 — 그날 끝) | 같은 날 사 온 것 |');
    console.log('|---|---|---|---|---|---|---|---|');
    const byDay = new Map(ob.days.map((d) => [d[0], d[1]]));
    const rows = ob.legs.filter((l) => l[1] === vi && !FOODR.has(l[2]) && (l[6] + l[3] * l[4]) < l[5]).slice(0, 14);
    for (const l of rows) { const dr = byDay.get(l[0]) || byDay.get(l[0] + 1); const g = dr && dr[vi] ? dr[vi][2] : ['—', '—', '—'];
      const b = ob.buys.filter((x) => x[1] === vi && Math.abs(x[0] - l[0]) <= 0).map((x) => `${x[4] || '빈손'} ${x[5]}`).join(' · ');
      console.log(`| ${l[0]} | ${l[5]} | ${f0(l[6] + l[3] * l[4])} | ${l[5] * 36} | ${l[2]} · ${f0(l[3])} · ${f0(l[3] * l[4])} | ${f0(l[7])} | ${g.join(' · ')} | ${b || '—'} |`); }
    console.log('');
  }
}
if (process.argv.includes('--json')) fs.writeFileSync(process.argv[process.argv.indexOf('--json') + 1], JSON.stringify(OUT));
