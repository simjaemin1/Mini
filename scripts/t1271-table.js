'use strict';
// (@regress 없음 — 러너 밖 · T1271 표 자 · 읽기만)
// === scripts/t1271-table.js — T1271 판 셋(끔 · T1266 · T1266 + T1271 자리)의 관찰기 JSON 에서 10날 표 · 판 요약 ==========
//   쓰는 법: node scripts/t1271-table.js <끔 머리> <T1266 머리> <+자리 머리> [표.md] [요약.json]   (머리 = 판 JSON 경로에서 `.json` 을 뗀 것)
//   칸 셈은 `t1266-table.js` 의 함수 그대로(사본 0) — 이 파일은 셋을 나란히 놓고 T1271 칸(어촌14 광부 · 닿는 광맥 셀 · 걸음 몫 · 쉰 사람-날)을 더한다.
const fs = require('fs');
const T = require('./t1266-table.js');
const [offH, bodyH, capH, outMd, outJson] = process.argv.slice(2);
if (!offH || !bodyH || !capH) { console.error('쓰는 법: node scripts/t1271-table.js <끔 머리> <T1266 머리> <+자리 머리> [표.md] [요약.json]'); process.exit(2); }
const ARMS = [['끔', T.load(offH)], ['T1266', T.load(bodyH)], ['+자리', T.load(capH)]];
const DAYS = [10, 20, 30, 40, 50, 60];
const sum = (a) => a.reduce((s, x) => s + (+x || 0), 0);
const tot = (X, d, i, vname) => { const B = (X.b.g[d] || {}).tot; if (!B) return null; return vname ? (B[vname] ? B[vname][i] : null) : sum(Object.values(B).map((t) => t[i])); };
const out = [];
out.push('| 칸(' + ARMS.map((a) => a[0]).join(' : ') + ') | ' + DAYS.map((d) => '날 ' + d).join(' | ') + ' |');
out.push('|---|' + DAYS.map(() => '---:').join('|') + '|');
const row = (name, fn) => out.push('| ' + name + ' | ' + DAYS.map((d) => ARMS.map(([, X]) => { const c = T.cells(X, d); return c ? fn(c, X, d) : '—'; }).join(' : ')).join(' | ') + ' |');
row('광부 econ(광산 마을 11)', (c) => c.miners);
row('어촌14 econ 광부', (c, X, d) => { const q = tot(X, d, 4, '어촌14'); return q == null ? '—' : q; });
row('광부 몸 채광 · 쉼 %(10날 표본)', (c) => c.st ? T.pc(c.st.mine) + ' · ' + T.pc(c.st.rest) : '—');
row('친 횟수(10날)', (c) => T.f0(c.sw));
row('몸 원석 곳간 kg/날(10날)', (c) => T.f1(c.kgDay));
row('원석 재고(단위)', (c) => T.f1(c.oreStock));
row('노 녹임 누계(원석 단위)', (c) => T.f1(c.smelt));
row('청동 무기 누계', (c) => T.f2(c.bronze));
row('원석 시세(광산 마을 · 품목 평균)', (c) => T.f2(c.px));
row('광산 마을 인구', (c) => T.f0(c.popM));
row('한 시간 값 물음 · 멈춤(10날)', (c) => c.hours == null ? '—' : T.f0(c.hours) + ' · ' + T.f0(c.stop));
row('보존 참(누계 두 줄)', (c) => c.noSwingIn);
row('하루 CPU 초(10날 가운데)', (c) => T.f1(c.cpu));
const md = out.join('\n');
function extra(X) {
  const S = T.summary(X), L = S.last, g = X.b.g[L] || {}, t66 = g.t66 || {};
  const ds = Object.keys(X.b.g).map(Number).sort((a, b) => a - b);
  const m14 = ds.map((d) => tot(X, d, 4, '어촌14')).filter((q) => q != null);
  let restSum = 0, restN = 0; for (const d of ds) { const B = X.b.g[d].tot || {}; for (const t of Object.values(B)) if (t[6] != null) { restSum += t[6]; restN++; } }
  const cpu = X.c && X.c.cpu ? X.c.cpu.map((r) => r[1]).sort((a, b) => a - b) : [];
  return { ...S, j: undefined, m14First: m14.length ? m14[0] : null, m14Max: m14.length ? Math.max(...m14) : null, m14Last: m14.length ? m14[m14.length - 1] : null,
    minersL: tot(X, L, 4), walkF: t66.walkN ? t66.walkF / t66.walkN : null, noGran: t66.noGran || 0, restDays: t66.restDays || 0, restVilDays: restN, restSum,
    t71: g.t71 || null, cpuMed: cpu.length ? cpu[cpu.length >> 1] : null, cpuLast: X.c && X.c.cpu && X.c.cpu.length ? X.c.cpu[X.c.cpu.length - 1][1] : null };
}
const SUM = {}; for (const [n, X] of ARMS) SUM[n] = extra(X);
console.log(md);
for (const n in SUM) console.log('\n요약 ' + n + ':', JSON.stringify(SUM[n]));
if (outMd) fs.writeFileSync(outMd, md + '\n');
if (outJson) fs.writeFileSync(outJson, JSON.stringify(SUM, null, 1));
