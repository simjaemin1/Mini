'use strict';
// (@regress 없음 — 러너 밖 · T1266 표 자 · 읽기만)
// === scripts/t1266-table.js — T1266 판 둘(켬 · 끔)의 관찰기 JSON(t1256 · t1266 · t1243)에서 10날 표 · 판 요약을 낸다 ==========
//   쓰는 법: node scripts/t1266-table.js <켬 머리> <끔 머리> [표.md] [요약.json]   (머리 = 판 JSON 경로에서 `.json` 을 뗀 것)
//   날 d 칸 = 날 d 머리(econ 틱 앞)의 값 · 흐름 칸은 그 앞 10날(d−9 … d 머리 줄 = d−10 … d−1 몫)의 합 · 평균.
//   몸 상태(t1256 `stateOf`) → 채광(mine) · 걸음(walk) · 쉼(rest + wander) · 잠(sleep) · 그 밖(eat · work · other).
//   ★미끼 칸(`noSwingIn`): 몸이 안 친 마을-날(`_t724Walk` 0)에 몸 원석이 곳간에 든 마을-날 수 — 0 이어야 한다(켬 판 · 끔 판 둘 다).
const fs = require('fs');
const [onH, offH, outMd, outJson] = process.argv.slice(2);
if (!onH || !offH) { console.error('쓰는 법: node scripts/t1266-table.js <켬 머리> <끔 머리> [표.md] [요약.json]'); process.exit(2); }
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const load = (h) => ({ a: rd(h + '.t1256.json'), b: rd(h + '.t1266.json'), c: rd(h + '.t1243.json'), j: rd(h + '.json') });
const R = { on: load(onH), off: load(offH) };
const sum = (a) => a.reduce((s, x) => s + (+x || 0), 0);
const f1 = (x) => x == null ? '—' : (+x).toFixed(1), f2 = (x) => x == null ? '—' : (+x).toFixed(2), f0 = (x) => x == null ? '—' : Math.round(+x).toLocaleString('en-US');
const pc = (x) => x == null ? '—' : (100 * x).toFixed(1);
const lastDay = (X) => Math.max(...Object.keys(X.a.day).map(Number));
const SMAP = { mine: 'mine', walk: 'walk', rest: 'rest', wander: 'rest', sleep: 'sleep', eat: 'other', work: 'other', other: 'other' };
function states(X, d0, d1, vname) {   // 날 d0 … d1(포함) 표본 몫
  const o = { mine: 0, walk: 0, rest: 0, sleep: 0, other: 0 }; let n = 0;
  for (let d = d0; d <= d1; d++) { const S = X.b.st[d]; if (!S) continue; for (const [vn, m] of Object.entries(S.v)) { if (vname && vn !== vname) continue; for (const [k, q] of Object.entries(m)) { o[SMAP[k] || 'other'] += q; n += q; } } }
  if (!n) return null; for (const k in o) o[k] /= n; o.n = n; return o;
}
function cells(X, d) {
  const A = X.a, I = (n) => A.dcols.indexOf(n), kgU = A.kgU || 5, head = A.day[d]; if (!head) return null;
  const at = (k) => sum(head.map((r) => r[I(k)]));
  let bodyU = 0, nW = 0, noSwingIn = 0;
  for (let k = d - 9; k <= d; k++) { const rows = A.day[k]; if (!rows) continue; nW++; for (const r of rows) { const u = sum(Object.values(r[I('bodyInY')] || {})); bodyU += u; if (u > 1e-9 && !(r[I('walkY')] > 0)) noSwingIn++; } }
  const g = A.g[d] && A.g[d].t724, g0 = A.g[d - 10] && A.g[d - 10].t724;
  const sw = g ? (g.sw || 0) - ((g0 && g0.sw) || 0) : null;
  const st = states(X, d - 10, d - 1);
  const B = X.b.g[d] || {}; let pxS = 0, pxN = 0; for (const o of Object.values(B.px || {})) for (const q of Object.values(o)) { pxS += q; pxN++; }
  const popM = B.tot ? sum(Object.values(B.tot).map((t) => t[3])) : null;
  const cpu = X.c && X.c.cpu ? X.c.cpu.filter((r) => r[0] > d - 10 && r[0] <= d).map((r) => r[1]) : [];
  const t66 = B.t66 || null, t660 = (X.b.g[d - 10] || {}).t66 || null;
  return { d, miners: at('eMiner'), bMiner: at('bMiner'), oreStock: at('oreStock'), kgDay: bodyU * kgU / (nW || 1), sw, st, bronze: at('bronzeW'), smelt: at('smeltTot'), px: pxN ? pxS / pxN : null, popM, cpu: cpu.length ? cpu.sort((a, b) => a - b)[cpu.length >> 1] : null, noSwingIn,
    hours: t66 ? t66.hours - ((t660 && t660.hours) || 0) : null, stop: t66 ? t66.stop - ((t660 && t660.stop) || 0) : null };
}
function art(X) {   // 대장장이 작업표 — 몸 · 이튿날 일괄 · 사흘 넘김 · 선 것(명목) · 원석 재료(녹임) · 무기(청동) 낸 것
  const o = {}; for (const kind of ['body', 'batch', 'late', 'made']) o[kind] = { n: 0, ore: 0, weapon: 0 };
  for (const D of Object.values(X.b.art)) for (const V of Object.values(D)) for (const [kind, J] of Object.entries(V)) { const s = J.smith; if (!s || !o[kind]) continue; o[kind].n += s.n; for (const [k, q] of Object.entries(s.take)) if (/^ore(_|$)/.test(k)) o[kind].ore += q; o[kind].weapon += s.give.weapon || 0; }
  return o;
}
function pick(X, name) {   // 마을 하나의 셀 고르기 까닭(끝 날 누계)
  const ds = Object.keys(X.b.g).map(Number).sort((a, b) => a - b); for (let i = ds.length - 1; i >= 0; i--) { const pk = X.b.g[ds[i]].pk; if (pk && pk[name]) return pk[name]; } return null;
}
function summary(X) {
  const L = lastDay(X), A = X.a, I = (n) => A.dcols.indexOf(n), kgU = A.kgU || 5;
  let bodyU = 0, nD = 0, noSwingIn = 0, mvDays = 0; const byV = {};
  for (let k = 2; k <= L; k++) { const rows = A.day[k]; if (!rows) continue; nD++; for (const r of rows) { const u = sum(Object.values(r[I('bodyInY')] || {})); bodyU += u; byV[r[0]] = (byV[r[0]] || 0) + u * kgU; if (u > 1e-9 && !(r[I('walkY')] > 0)) noSwingIn++; if (r[I('walkY')] > 0) mvDays++; } }
  const st = states(X, 11, L - 1), t66 = (X.b.g[L] || {}).t66, g = (A.g[L] || {}).t724 || {};
  const head = A.day[L];
  return { last: L, kgDay: bodyU * kgU / (nD || 1), bodyKg: bodyU * kgU, byV, st, noSwingIn, mineVillageDays: mvDays, sw: g.sw, done: g.done, none: g.none, bronze: head ? sum(head.map((r) => r[I('bronzeW')])) : null, smelt: head ? sum(head.map((r) => r[I('smeltTot')])) : null,
    oreStock: head ? sum(head.map((r) => r[I('oreStock')])) : null, t66, art: art(X), pick14: pick(X, '어촌14'), st14: states(X, 11, L - 1, '어촌14'), pop: X.j && X.j.pop != null ? X.j.pop : null, j: X.j };
}
const S = { on: summary(R.on), off: summary(R.off) };
const out = [];
out.push('| 칸(켬 : 끔) | ' + [10, 20, 30, 40, 50, 60].map((d) => '날 ' + d).join(' | ') + ' |');
out.push('|---|' + [10, 20, 30, 40, 50, 60].map(() => '---:').join('|') + '|');
const row = (name, fn) => out.push('| ' + name + ' | ' + [10, 20, 30, 40, 50, 60].map((d) => { const a = cells(R.on, d), b = cells(R.off, d); return (a ? fn(a) : '—') + ' : ' + (b ? fn(b) : '—'); }).join(' | ') + ' |');
row('광부 econ · 몸', (c) => c.miners + ' · ' + c.bMiner);
row('광부 몸 채광 · 걸음 · 쉼 · 잠 · 그 밖 %(10날 표본)', (c) => c.st ? [pc(c.st.mine), pc(c.st.walk), pc(c.st.rest), pc(c.st.sleep), pc(c.st.other)].join(' · ') : '—');
row('친 횟수(10날)', (c) => f0(c.sw));
row('몸 원석 곳간 kg/날(10날)', (c) => f1(c.kgDay));
row('원석 재고(단위)', (c) => f1(c.oreStock));
row('노 녹임 누계(원석 단위)', (c) => f1(c.smelt));
row('청동 무기 누계', (c) => f2(c.bronze));
row('원석 시세(광산 마을 · 품목 평균 `_priceCache`)', (c) => f2(c.px));
row('광산 마을 인구', (c) => f0(c.popM));
row('한 시간 값 물음 · 멈춤(10날 · 켬만)', (c) => c.hours == null ? '—' : f0(c.hours) + ' · ' + f0(c.stop));
row('미끼 칸: 몸이 안 친 날 원석 든 마을-날(10날)', (c) => String(c.noSwingIn));
row('하루 CPU 초(10날 가운데)', (c) => f1(c.cpu));
const md = out.join('\n');
console.log(md);
console.log('\n요약 켬:', JSON.stringify({ ...S.on, j: undefined }));
console.log('요약 끔:', JSON.stringify({ ...S.off, j: undefined }));
if (outMd) fs.writeFileSync(outMd, md + '\n');
if (outJson) fs.writeFileSync(outJson, JSON.stringify({ on: { ...S.on, j: undefined }, off: { ...S.off, j: undefined } }, null, 1));
