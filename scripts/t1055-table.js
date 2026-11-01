#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1055 표 기계 · 관찰기 JSON 만 읽는다 · 산수뿐 · 판정 0)
// === scripts/t1055-table.js — 첫 90날 성장: 서버 판 자 띠 ↔ 랩 띠, 마을마다 · 날마다 ===
//   node scripts/t1055-table.js --srv <run 디렉터리 여럿 쉼표> --lab <랩 디렉터리>:<접두 여럿 쉼표>
//        [--arm <이름>=<run 디렉터리 여럿 쉼표> …] [--arm <이름>=lab:[<랩 디렉터리>:]<접두 여럿 쉼표> …] [--top 5] [--json <파일>]
//     서버 판 파일 = <run>/base-<시드>.t1055.json · 랩 판 파일 = <랩 디렉터리>/<접두>-<시드>.t1055.json (관찰기 `scripts/t1055-observe.js`)
//   ① 세계 합 인구 90(날 89 · 3시드 합) — 판마다 · 띠(판 넷의 최소 ~ 최대)
//   ② 마을마다(3시드 합): 인구 90 띠 · 차 · 틈 ÷ 큰 띠 폭 + 판 평균 칸(출생 · 나간 몸 · 굶어 죽음 · 주거 · 침상 · 지은 칸 · 식량 환산 · 크루-날 · 꺼낸 목재 · 단계 · 기다린 날 · 게이트 날 · 목재 수입) + 직업(날 89)
//   ③ 차 1위 다섯(안 겹침 먼저 · |띠 가운데 차| 큰 순)의 해부 — 마을-날을 출생 문 상태로 가른다:
//        열림(dP > 0 · 게이트 아님) · 게이트-침상(N ≥ 침상 ≤ 주거) · 게이트-주거(N ≥ 주거 < 침상) · 닫힘-식량(굶주림 항이 가장 큰 음수) · 닫힘-K(로지스틱 ≤ 0) · 닫힘-행복(행복 + 건강 항이 가장 큰 음수)
//      집 크루: 집 한 채 시공 날(단계가 오른 날 ÷ 지은 채) · 기다린 날(목재 없음) · 게이트인데 집터 없는 날 · 걷기 몫(Σ걸음 초 ÷ Σ낮 초 — 서버만)
//      땔감: 덮음 < 1 인 날 · 목재 0 인 날 · 목재 수입 누계(날 89) · n 번째 새 집 완공 날(판 하나 ↔ 판 하나 · 시드마다)
//   ④ 갈래 판(--arm): 인구 90 · 메운 몫 = (갈래 − 서버 띠 가운데) ÷ (랩 띠 가운데 − 서버 띠 가운데) · 마을 1위 다섯의 값
'use strict';
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const SEEDS = [1020, 7, 42];
const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const TOP = parseInt(get('--top') || '5', 10);
const JOUT = get('--json');
function srvRun(dir) { return { name: path.basename(dir), files: SEEDS.map((s) => J(path.join(dir, `base-${s}.t1055.json`))) }; }
function labRuns(spec) { const [dir, pre] = spec.split(':'); return pre.split(',').map((p) => ({ name: `lab:${p}`, files: SEEDS.map((s) => J(path.join(dir, `${p}-${s}.t1055.json`))) })); }
const SRV = (get('--srv') || '').split(',').filter(Boolean).map(srvRun);
const LAB = labRuns(get('--lab') || ':');
const LABDIR = (get('--lab') || ':').split(':')[0];
const ARMS = []; argv.forEach((x, i) => { if (x !== '--arm') return; const [n, d] = argv[i + 1].split('='); ARMS.push({ name: n, runs: d.startsWith('lab:') ? labRuns(d.slice(4).includes(':') ? d.slice(4) : LABDIR + ':' + d.slice(4)) : d.split(',').map(srvRun) }); });
for (const R of [...SRV, ...LAB, ...ARMS.flatMap((a) => a.runs)]) R.files.forEach((f, k) => { if (!f) throw new Error(`판 파일 없음: ${R.name} 시드 ${SEEDS[k]}`); });
// ── 칸 읽기 ──
const col = (o, k) => o.fields.indexOf(k) + 1;
const rowAt = (A, d) => { let r = null; for (const x of A) { if (x[0] <= d) r = x; else break; } return r; };
const D89 = 89;
const val = (o, A, k, d) => { const r = rowAt(A, d); const c = col(o, k); return r && c > 0 ? (r[c] || 0) : 0; };
const tot = (o, A, k) => { const c = col(o, k); return c > 0 ? A.reduce((x, r) => x + (r[c] || 0), 0) : null; };
const names = Object.keys(SRV[0].files[0].vil).sort();
// 판 하나 · 마을 하나 → 3시드 합 칸
function vilSum(R, v) {
  const m = { pop: 0, born: 0, out: 0, fam: 0, hous: 0, beds: 0, cells: 0, tfe: 0, crew: 0, took: 0, adv: 0, stall: 0, gate: 0, wimp: 0, csent: 0 };
  for (const o of R.files) {
    const A = o.vil[v]; if (!A) continue;
    for (const k of ['pop', 'hous', 'beds', 'cells', 'tfe', 'wimp', 'csent']) m[k] += val(o, A, k, D89);
    for (const k of ['born', 'out', 'fam', 'crew', 'took', 'adv', 'stall', 'gate']) m[k] += tot(o, A, k) || 0;
  }
  return m;
}
const band = (xs) => [Math.min(...xs), Math.max(...xs)];
const mid = (b) => (b[0] + b[1]) / 2;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const f0 = (x) => Math.round(x).toLocaleString('en-US');
const f1 = (x) => (Math.round(x * 10) / 10).toString();
const out = { world: {}, villages: [], top: [], dissect: {}, arms: [] };
// ① 세계 합
function worldPop(R) { return R.files.map((o) => Object.values(o.vil).reduce((x, A) => x + val(o, A, 'pop', D89), 0)); }
console.log('\n## ① 세계 합 인구 90(날 89 · 시드 1020 / 7 / 42 · 합)\n');
console.log('| 판 | 1020 | 7 | 42 | 합 |'); console.log('|---|---:|---:|---:|---:|');
const wsum = (R) => worldPop(R).reduce((a, b) => a + b, 0);
for (const R of [...SRV, ...LAB, ...ARMS.flatMap((a) => a.runs.map((r) => Object.assign({}, r, { name: `${a.name}:${r.name}` })))]) { const p = worldPop(R); console.log(`| ${R.name} | ${p.map(f0).join(' | ')} | ${f0(p.reduce((a, b) => a + b, 0))} |`); out.world[R.name] = p; }
const sB = band(SRV.map(wsum)), lB = band(LAB.map(wsum));
console.log(`\n서버 띠 ${f0(sB[0])} ~ ${f0(sB[1])} · 랩 띠 ${f0(lB[0])} ~ ${f0(lB[1])} · 서버 ÷ 랩(가운데) ${(mid(sB) / mid(lB)).toFixed(3)} · 틈 ${f0(Math.max(0, lB[0] - sB[1], sB[0] - lB[1]))}`);
out.worldBand = { srv: sB, lab: lB };
// ② 마을마다
const rows = names.map((v) => {
  const S = SRV.map((R) => vilSum(R, v)), L = LAB.map((R) => vilSum(R, v));
  const sb = band(S.map((m) => m.pop)), lb = band(L.map((m) => m.pop));
  const overlap = !(sb[1] < lb[0] || lb[1] < sb[0]);
  const gap = overlap ? 0 : (sb[1] < lb[0] ? lb[0] - sb[1] : sb[0] - lb[1]);
  const wide = Math.max(sb[1] - sb[0], lb[1] - lb[0]);
  const avg = (X, k) => mean(X.map((m) => m[k]));
  const jobs = (R) => { const o = {}; for (const f of R.files) { const J2 = f.jobs && f.jobs[89] && f.jobs[89][v]; if (J2) for (const [j, n] of Object.entries(J2)) o[j] = (o[j] || 0) + n; } return o; };
  return { v, sb, lb, d: mid(sb) - mid(lb), overlap, gap, gw: wide ? gap / wide : (gap ? Infinity : 0),
    s: Object.fromEntries(Object.keys(S[0]).map((k) => [k, avg(S, k)])), l: Object.fromEntries(Object.keys(L[0]).map((k) => [k, avg(L, k)])),
    js: jobs(SRV[0]), jl: jobs(LAB[0]) };
});
rows.sort((a, b) => (a.overlap - b.overlap) || (Math.abs(b.d) - Math.abs(a.d)));
out.villages = rows;
console.log(`\n## ② 마을마다(3시드 합 · 서버 판 ${SRV.length} ↔ 랩 판 ${LAB.length} · 칸 = 판 평균 · 서버 / 랩)\n`);
console.log('| 마을 | 인구 90 서버 띠 | 랩 띠 | 차(가운데) | 틈 ÷ 폭 | 출생 | 나간 몸(굶어) | 주거 89 | 침상 89 | 지은 칸 89 | 식량 환산 89 | 크루-날 | 꺼낸 목재 | 단계 | 기다린 날 | 게이트 날 | 목재 수입 89 |');
console.log('|---|---|---|---:|---:|---|---|---|---|---|---|---|---|---|---|---|---|');
const sl = (r, k, f) => `${f(r.s[k])} / ${f(r.l[k])}`;
for (const r of rows) console.log(`| ${r.v} | ${r.sb[0]} ~ ${r.sb[1]} | ${r.lb[0]} ~ ${r.lb[1]} | ${r.d > 0 ? '+' : ''}${f1(r.d)} | ${r.overlap ? '겹침' : (isFinite(r.gw) ? r.gw.toFixed(2) : '∞')} | ${sl(r, 'born', f0)} | ${f0(r.s.out)}(${f0(r.s.fam)}) / ${f0(r.l.out)}(${f0(r.l.fam)}) | ${sl(r, 'hous', f0)} | ${sl(r, 'beds', f0)} | ${sl(r, 'cells', f1)} | ${sl(r, 'tfe', f0)} | ${sl(r, 'crew', f0)} | ${sl(r, 'took', f0)} | ${sl(r, 'adv', f0)} | ${sl(r, 'stall', f0)} | ${sl(r, 'gate', f0)} | ${sl(r, 'wimp', f0)} |`);
const nOver = rows.filter((r) => !r.overlap).length;
const sumD = (f) => rows.filter(f).reduce((a, r) => a + r.d, 0);
console.log(`\n안 겹친 마을 ${nOver} / ${rows.length} · 차 합(가운데) ${f1(sumD(() => true))} = 서버 쪽 큰 마을 ${f1(sumD((r) => r.d > 0))} + 랩 쪽 큰 마을 ${f1(sumD((r) => r.d < 0))}`);
// ③ 1위 다섯 해부
const top = rows.slice(0, TOP);
console.log(`\n### 1위 ${TOP} 직업(날 89 · 3시드 합 · 판 ${SRV[0].name} / ${LAB[0].name})\n`);
for (const r of top) { const ks = [...new Set([...Object.keys(r.js), ...Object.keys(r.jl)])].sort((a, b) => ((r.jl[b] || 0) + (r.js[b] || 0)) - ((r.jl[a] || 0) + (r.js[a] || 0)));
  console.log(`* ${r.v}: ${ks.map((k) => `${k} ${r.js[k] || 0}/${r.jl[k] || 0}`).join(' · ')}`); }
out.top = top.map((r) => r.v);
function stateOf(o, x) {
  const g = (k) => x[col(o, k)];
  const N = g('pop'), hous = g('hous'), beds = g('beds');
  if (g('gate')) return (beds != null && beds <= hous) ? 'gateBeds' : 'gateHous';
  if (g('dP') > 0) return 'open';
  const neg = [['food', g('hung')], ['K', g('logi')], ['happy', (g('happy') || 0) + (g('hlth') || 0)]].sort((a, b) => a[1] - b[1]);
  return neg[0][1] < 0 ? neg[0][0] : 'open0';
}
function dissect(R, v) {
  const c = { open: 0, gateBeds: 0, gateHous: 0, food: 0, K: 0, happy: 0, open0: 0, workDays: 0, built: 0, stall: 0, noSite: 0, walkS: 0, dayS: 0, fuelShort: 0, wood0: 0, wimp: 0, trips: 0 };
  for (const o of R.files) {
    const A = o.vil[v]; if (!A) continue;
    let c0 = null;
    for (const x of A) {
      const g = (k) => x[col(o, k)];
      c[stateOf(o, x)]++;
      if (g('adv') > 0) c.workDays++;   // 단계가 오른 날(완공 날 포함 — 완공 날엔 집터가 이미 비어 있다)
      if (g('stall')) c.stall++;
      if (g('gate') && !(g('site') > 0)) c.noSite++;
      c.walkS += g('walkS') || 0; c.dayS += (col(o, 'dayS') > 0 ? g('dayS') : 0) || 0; c.trips += g('trips') || 0;
      if (g('fcov') != null && g('fcov') < 1) c.fuelShort++;
      if (!(g('wood') > 0)) c.wood0++;
      const cells = g('cells'); if (c0 == null) c0 = cells; else if (cells > c0) { c.built += cells - c0; c0 = cells; }
    }
    c.wimp += val(o, A, 'wimp', D89);
  }
  return c;
}
function completions(o, v) {   // n 번째 새 집 완공 날
  const A = o.vil[v]; const out2 = []; let c0 = null;
  for (const x of A) { const cells = x[col(o, 'cells')]; if (c0 == null) c0 = cells; else while (cells > c0) { out2.push(x[0]); c0++; } }
  return out2;
}
function firstSplit(a, b, v) {   // 인구가 처음 갈린 날
  const A = a.vil[v], B = b.vil[v]; for (let i = 0; i < Math.min(A.length, B.length); i++) if (A[i][col(a, 'pop')] !== B[i][col(b, 'pop')]) return A[i][0]; return null;
}
console.log(`\n## ③ 차 1위 ${TOP} 해부(마을-날 · 3시드 · 판 평균 · 서버 / 랩)\n`);
console.log('| 마을 | 열림 | 게이트-침상 | 게이트-주거 | 닫힘-식량 | 닫힘-K | 닫힘-행복 | 단계 오른 날 | 지은 채 | 한 채 시공 날 | 기다린 날(목재 0) | 게이트인데 집터 없음 | 걷기 ÷ 낮 | 땔감 덮음 < 1 날 | 목재 0 날 | 목재 수입 89 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of top) {
  const S = SRV.map((R) => dissect(R, r.v)), L = LAB.map((R) => dissect(R, r.v));
  const a = (X, k) => mean(X.map((c) => c[k]));
  const per = (X) => { const w = a(X, 'workDays'), b = a(X, 'built'); return b ? (w / b).toFixed(2) : '—'; };
  const walk = (X) => { const d = a(X, 'dayS'); return d ? (a(X, 'walkS') / d * 100).toFixed(2) + '%' : '—'; };
  const p = (k) => `${f1(a(S, k))} / ${f1(a(L, k))}`;
  console.log(`| ${r.v} | ${p('open')} | ${p('gateBeds')} | ${p('gateHous')} | ${p('food')} | ${p('K')} | ${p('happy')} | ${p('workDays')} | ${p('built')} | ${per(S)} / ${per(L)} | ${p('stall')} | ${p('noSite')} | ${walk(S)} / ${walk(L)} | ${p('fuelShort')} | ${p('wood0')} | ${p('wimp')} |`);
  const comp = SEEDS.map((s, k) => ({ seed: s, srv: completions(SRV[0].files[k], r.v), lab: completions(LAB[0].files[k], r.v), split: firstSplit(SRV[0].files[k], LAB[0].files[k], r.v) }));
  out.dissect[r.v] = { srv: S, lab: L, comp };
}
console.log(`\n### 새 집 완공 날(판 ${SRV[0].name} ↔ ${LAB[0].name} · 시드마다) · 인구가 처음 갈린 날\n`);
for (const r of top) for (const c of out.dissect[r.v].comp) console.log(`* ${r.v} ${c.seed}: 갈린 날 ${c.split ?? '—'} · 서버 ${c.srv.join(' · ') || '—'} ↔ 랩 ${c.lab.join(' · ') || '—'}`);
// ③-2 날 띠 — 마을-날 한 글자(o 열림 · B 게이트-침상 · H 게이트-주거 · F 닫힘-식량 · K 닫힘-K · P 닫힘-행복 · . 그 밖) · 판 하나 ↔ 판 하나 · 시드마다
const CH = { open: 'o', gateBeds: 'B', gateHous: 'H', food: 'F', K: 'K', happy: 'P', open0: '.' };
const strip = (o, v) => o.vil[v].map((x) => CH[stateOf(o, x)]).join('');
console.log(`\n### 날 띠(날 1 ~ 89 · 한 글자 = 하루 · o 열림 · B 게이트-침상 · H 게이트-주거 · F 식량 · K · P 행복 · 위 = 서버 ${SRV[0].name} · 아래 = 랩 ${LAB[0].name})\n`);
console.log('```');
for (const r of top) for (let k = 0; k < SEEDS.length; k++) {
  const a = strip(SRV[0].files[k], r.v), b = strip(LAB[0].files[k], r.v);
  console.log(`${(r.v + ' ' + SEEDS[k]).padEnd(12)} 서버 ${a}`); console.log(`${''.padEnd(12)} 랩   ${b}`);
  out.dissect[r.v].comp[k].strip = [a, b];
}
console.log('```');
// ④ 갈래 판
if (ARMS.length) {
  console.log(`\n## ④ 갈래 판 — 인구 90(3시드 합) · 메운 몫 = (갈래 − 서버 띠 가운데) ÷ (랩 띠 가운데 − 서버 띠 가운데) · 1위 ${TOP} 마을(3시드 합)\n`);
  console.log(`| 갈래 | 판 | 세계 합 | 메운 몫 |${top.map((r) => ` ${r.v} |`).join('')}`);
  console.log(`|---|---|---:|---:|${top.map(() => '---:|').join('')}`);
  console.log(`| (서버 띠) | ${SRV.length} | ${f0(sB[0])} ~ ${f0(sB[1])} | 0% |${top.map((r) => ` ${r.sb[0]} ~ ${r.sb[1]} |`).join('')}`);
  console.log(`| (랩 띠) | ${LAB.length} | ${f0(lB[0])} ~ ${f0(lB[1])} | 100% |${top.map((r) => ` ${r.lb[0]} ~ ${r.lb[1]} |`).join('')}`);
  for (const A of ARMS) {
    const w = A.runs.map(wsum), wb = band(w);
    const fill = (mid(wb) - mid(sB)) / (mid(lB) - mid(sB));
    const vb = top.map((r) => band(A.runs.map((R) => vilSum(R, r.v).pop)));
    console.log(`| ${A.name} | ${A.runs.length} | ${wb[0] === wb[1] ? f0(wb[0]) : f0(wb[0]) + ' ~ ' + f0(wb[1])} | ${(fill * 100).toFixed(0)}% |${vb.map((b) => ` ${b[0] === b[1] ? b[0] : b[0] + ' ~ ' + b[1]} |`).join('')}`);
    out.arms.push({ name: A.name, world: wb, fill, top: vb });
  }
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out));
