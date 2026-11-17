#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1357 판 자 표 · 읽기만 · ★결과만 — 묶음 구현을 안 본다)
// === scripts/t1357-ruler.js — 묶음 켬 기본 기준 공격(T1357)의 긴 판 칸: 켬 판 : 끔 판 한 쌍씩 물음마다 ○/✗ ===
//   쓰는 법: node scripts/t1357-ruler.js <이름>=<켬 판 JSON>,<켬 관찰 JSON>:<끔 판 JSON>,<끔 관찰 JSON> …   [--md]
//     판 JSON = `server-baseline-check --make` 출력(byseed 한 시드) · 관찰 JSON = `scripts/t1357-observe.js` 출력(gz 도)
//   물음(끔 판 대비 · 해 = 365날 토막 · 판 길이만큼):
//     L1 해마다 평균 인구비 ≥ 1.0(해 평균 — 한 날 점 아님) · 날 400 · 800 · 1200 점 비는 곁에
//     L2 해마다 꼭대기 뒤 내림 ≤ 10%(그 해 안 · 켬 판)
//     L3 해마다 굶어 죽음 ≤ 끔                L4 해마다 죽음 전체 ≤ 끔 × 1.1
//     L5 마을별 최악 — 10날마다 끔에서 10 이상 마을이 켬에서 절반 밑인 마을 수 0
//     L6 빈 마을 — 끝 날 빈 마을 ≤ 끔 · 60날 넘게 빈 채 남은 마을 ≤ 끔(되살아나지 않음)
//     L7 몰림 — 가장 큰 마을 세계 몫(판 내내 최대) ≤ 끔 × 1.5
//     L8 직업 — 해 끝마다 끔 세계에 있는 직업이 켬 세계에서 0 인 것 없음
//     L9 계절 몰림 — 30날 창 가장 많은 죽음 ≤ 끔 × 1.5
//     L10 곳간 바닥 마을-날(곳간 < 사람 × 10) ≤ 끔 × 1.5
//     L11 떠남 해마다 ≤ 끔 × 3 + 50(오가기만 하는 세계)
//     L12 마을별 굶어 죽음 최댓값 ≤ max(끔 최댓값 × 1.5, 10)
//     L13 해 끝마다 가장 작은 산 마을 ≥ 끔 × 0.5
//     L14 해체 · 빈 마을(판 JSON) ≤ 끔
//     L15 끝 날 무기Q · 도구Q 사람당 ≥ 끔 × 0.5
const fs = require('fs');
const zlib = require('zlib');
const args = process.argv.slice(2).filter((a) => a !== '--md');
const MD = process.argv.includes('--md');
const rd = (f) => { let b = fs.readFileSync(f); if (/\.gz$/.test(f)) b = zlib.gunzipSync(b); return JSON.parse(b.toString('utf8')); };
function side(runF, obsF) {
  const R = rd(runF); const s = Object.keys(R.byseed)[0]; const B = R.byseed[s];
  const O = rd(obsF); const rows = new Map(); for (const r of O.rows) { const o = {}; O.cols.forEach((c, i) => { o[c] = r[i]; }); rows.set(o.day, o); }
  const V = new Map(); for (const [d, vs] of O.vrows) V.set(d, new Map(vs.map((x) => [x[0], { pop: x[1], foodPer: x[2], fdTot: x[3], deadTot: x[4], newTot: x[5], emigTot: x[6], jobs: x[7] }])));
  const last = Math.max(...rows.keys());
  return { seed: s, B, rows, V, last, err: O.err };
}
const yearsOf = (n) => { const ys = []; for (let a = 1; a <= n; a += 365) ys.push([a, Math.min(n, a + 364)]); return ys.filter(([a, b]) => b - a >= 60); };
const sumR = (S, k, a, b) => { let t = 0; for (let d = a; d <= b; d++) { const o = S.rows.get(d); if (o) t += o[k] || 0; } return t; };
const avgR = (S, k, a, b) => { let t = 0, n = 0; for (let d = a; d <= b; d++) { const o = S.rows.get(d); if (o) { t += o[k] || 0; n++; } } return n ? t / n : 0; };
const near10 = (S, d) => { let x = Math.floor(d / 10) * 10; while (x > 0 && !S.V.has(x)) x -= 10; return x; };
const wJobs = (m) => { const s = {}; for (const o of m.values()) for (const [j, n] of Object.entries(o.jobs || {})) s[j] = (s[j] || 0) + n; return s; };
function judge(on, off) {
  const n = Math.min(on.last, off.last), Y = yearsOf(n), out = [];
  const put = (id, okv, txt) => out.push({ id, ok: !!okv, txt });
  // L1
  { const per = Y.map(([a, b]) => avgR(on, 'pop', a, b) / Math.max(1, avgR(off, 'pop', a, b)));
    const pts = [400, 800, 1200].filter((d) => d <= n).map((d) => `${d}:${(((on.rows.get(d) || {}).pop || 0) / Math.max(1, (off.rows.get(d) || {}).pop || 1)).toFixed(3)}`);
    put('L1', per.every((x) => x >= 1.0), `해 평균 ${per.map((x) => x.toFixed(3)).join(' · ')} · 점 ${pts.join(' ')}`); }
  // L2
  { const dd = Y.map(([a, b]) => { let pk = 0, worst = 0; for (let d = a; d <= b; d++) { const p = (on.rows.get(d) || {}).pop || 0; if (p > pk) pk = p; else if (pk) worst = Math.max(worst, (pk - p) / pk); } return worst; });
    put('L2', dd.every((x) => x <= 0.10), `해마다 꼭대기 뒤 내림 ${dd.map((x) => (x * 100).toFixed(1) + '%').join(' · ')}`); }
  // L3 L4
  { const a = Y.map(([x, y]) => [sumR(on, 'fd', x, y), sumR(off, 'fd', x, y)]); put('L3', a.every(([u, v]) => u <= v), `해마다 굶어 죽음 ${a.map(([u, v]) => u + ':' + v).join(' · ')}`); }
  { const a = Y.map(([x, y]) => [sumR(on, 'dead', x, y), sumR(off, 'dead', x, y)]); put('L4', a.every(([u, v]) => u <= 1.1 * v), `해마다 죽음 ${a.map(([u, v]) => u + ':' + v).join(' · ')}`); }
  // L5
  { const bad = new Map(); let worst = Infinity, wn = ''; for (const [d, mOff] of off.V) { if (d > n) continue; const mOn = on.V.get(d); if (!mOn) continue; for (const [nm, f] of mOff) { const o = mOn.get(nm); if (!o || f.pop < 10) continue; const r = o.pop / f.pop; if (r < worst) { worst = r; wn = `${nm} 날 ${d} ${o.pop}/${f.pop}`; } if (r < 0.5) bad.set(nm, (bad.get(nm) || 0) + 1); } }
    put('L5', bad.size === 0, `절반 밑 마을 ${bad.size}(${[...bad.keys()].slice(0, 5).join(',')}) · 최악 ${worst === Infinity ? '-' : worst.toFixed(2)} ${wn}`); }
  // L6
  { const endE = (S) => (S.rows.get(n) || {}).empty || 0;
    const stuck = (S) => { const run = new Map(), mx = new Map(); for (const [d, m] of [...S.V].sort((x, y) => x[0] - y[0])) { if (d > n) continue; for (const [nm, o] of m) { const k = o.pop === 0 ? (run.get(nm) || 0) + 10 : 0; run.set(nm, k); mx.set(nm, Math.max(mx.get(nm) || 0, k)); } } let c = 0; for (const [nm, k] of run) if (k > 60) c++; return c; };
    const a = endE(on), b = endE(off), sa = stuck(on), sb = stuck(off); put('L6', a <= b && sa <= sb, `끝 날 빈 마을 ${a}:${b} · 60날 넘게 빈 채 ${sa}:${sb}`); }
  // L7
  { const ms = (S) => { let m = 0; for (const [d, mm] of S.V) { if (d > n) continue; let t = 0, x = 0; for (const o of mm.values()) { t += o.pop; if (o.pop > x) x = o.pop; } if (t) m = Math.max(m, x / t); } return m; };
    const a = ms(on), b = ms(off); put('L7', a <= 1.5 * b, `가장 큰 마을 몫 최대 ${(a * 100).toFixed(1)}% : ${(b * 100).toFixed(1)}%`); }
  // L8
  { const gone = []; for (const [, b] of Y) { const d = near10(on, b), e = near10(off, b); const ja = wJobs(on.V.get(d) || new Map()), jb = wJobs(off.V.get(e) || new Map()); for (const j of Object.keys(jb)) if (jb[j] > 0 && !(ja[j] > 0)) gone.push(`${j}@${d}`); }
    put('L8', gone.length === 0, `사라진 직업 ${gone.join(',') || '없음'}`); }
  // L9
  { const w = (S) => { let m = 0, md = 0; for (let d = 1; d + 29 <= n; d++) { const t = sumR(S, 'dead', d, d + 29); if (t > m) { m = t; md = d; } } return [m, md]; };
    const [a, ad] = w(on), [b, bd] = w(off); put('L9', a <= 1.5 * b + 20, `30날 창 최대 죽음 ${a}(날 ${ad}) : ${b}(날 ${bd})`); }
  // L10
  { const a = sumR(on, 'low10', 1, n), b = sumR(off, 'low10', 1, n); put('L10', a <= 1.5 * b + 50, `곳간 바닥 마을-날 ${a} : ${b}`); }
  // L11
  { const a = Y.map(([x, y]) => [sumR(on, 'emig', x, y), sumR(off, 'emig', x, y)]); put('L11', a.every(([u, v]) => u <= 3 * v + 50), `해마다 떠남 ${a.map(([u, v]) => u + ':' + v).join(' · ')}`); }
  // L12
  { const mx = (S) => { let m = 0, nm = ''; const d = near10(S, n); for (const [k, o] of (S.V.get(d) || new Map())) if (o.fdTot > m) { m = o.fdTot; nm = k; } return [m, nm]; };
    const [a, an] = mx(on), [b, bn] = mx(off); put('L12', a <= Math.max(1.5 * b, 10), `마을 굶어 죽음 최대 ${a}(${an}) : ${b}(${bn})`); }
  // L13
  { const a = Y.map(([, y]) => [(on.rows.get(y) || {}).minPop || 0, (off.rows.get(y) || {}).minPop || 0]); put('L13', a.every(([u, v]) => u >= 0.5 * v), `해 끝 가장 작은 마을 ${a.map(([u, v]) => u + ':' + v).join(' · ')}`); }
  // L14 L15
  { const a = on.B, b = off.B; put('L14', (a.dissolved || 0) <= (b.dissolved || 0) && (a.empty || 0) <= (b.empty || 0) && (a.eight.dead || 0) <= (b.eight.dead || 0), `해체 ${a.dissolved}:${b.dissolved} · 빈 ${a.empty}:${b.empty} · 소멸 ${a.eight.dead}:${b.eight.dead}`); }
  { const pc = (B, k) => (B.eight[k] || 0) / Math.max(1, B.eight.pop || 1); const w = pc(on.B, 'weapQ') / Math.max(1e-9, pc(off.B, 'weapQ')), t = pc(on.B, 'toolQ') / Math.max(1e-9, pc(off.B, 'toolQ'));
    put('L15', w >= 0.5 && t >= 0.5, `사람당 무기Q 비 ${w.toFixed(2)} · 도구Q 비 ${t.toFixed(2)}`); }
  return { n, out };
}
const all = [];
for (const a of args) {
  const i = a.indexOf('='); if (i < 0) continue;
  const name = a.slice(0, i); const [onS, offS] = a.slice(i + 1).split(':');
  const [onR, onO] = onS.split(','), [offR, offO] = offS.split(',');
  const on = side(onR, onO), off = side(offR, offO);
  const J = judge(on, off); all.push({ name, ...J });
  if (MD) { console.log(`\n### ${name}(시드 ${on.seed} · ${J.n}날)\n\n| 물음 | 결과 | 켬 : 끔 |\n|---|---|---|`); for (const o of J.out) console.log(`| ${o.id} | ${o.ok ? '○' : '✗'} | ${o.txt} |`); }
  else { console.log(`\n## ${name} — 시드 ${on.seed} · ${J.n}날 · ○ ${J.out.filter((o) => o.ok).length}/${J.out.length}`); for (const o of J.out) console.log(`  ${o.ok ? '○' : '✗'} ${o.id}  ${o.txt}`); }
}
if (all.length > 1) { const ids = all[0].out.map((o) => o.id); console.log(`\n## 모음 — ${all.map((x) => x.name).join(' · ')}`); for (const id of ids) console.log(`  ${id}  ${all.map((x) => { const o = x.out.find((y) => y.id === id); return o ? (o.ok ? '○' : '✗') : '-'; }).join(' ')}`); }
