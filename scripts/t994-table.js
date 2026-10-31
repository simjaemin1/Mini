#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T994 표 기계 · 읽기만 · 판정 0)
// === scripts/t994-table.js — 연료 칸별(볏짚 밑변 · 잔가지 · 껍질 · 목재) 들어온 몫 · 땐 몫 — 서버 띠 ↔ 랩 띠 ===
//   node scripts/t994-table.js --srv <띠 뿌리> --lab <랩 뿌리> [--json <파일>] [--top 10]
//     서버 판 = <띠 뿌리>/run-<갈래>[~raidN]/base-<시드>.{t931,t994}.json · 랩 판 = <랩 뿌리>/t17-<갈래>[~huntN]-<시드>.{t931,t994}.json
//   묶음(366일~ · 마을-날):
//     ⓐ 대상 · 땔감 — T980 대상(곳간 식량 환산 ≥ 틱 머리 인구 × 10 · 그날 굶주림 항 0 · 그날 죽음 > 0) 중 K 를 묶은 칸이 땔감인 날(죽음 가중)
//     ⓑ 땔감이 K 를 묶은 날 전부(날 가중)
//     ⓒ 12 · 1 · 2월 날 전부(날 가중)
//   칸(1인 · Σ칸 ÷ ΣN — 마을-날 가중 합): 볏짚 밑변(그날 곡물 실생산 · 식량등가) · 칸마다 틱 밖 들어옴 · 틱 안 들어옴 · 땐 몫 · 연료 블록 때 재고 · 연료 밖 씀
//   충당(`_fuelCov`)은 가중 평균 · 중앙.
'use strict';
const fs = require('fs');
const path = require('path');
const CAL = require(path.join(__dirname, '..', 'server', 'calendar.js'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SRV = arg('--srv', null), LAB = arg('--lab', null), OUTJ = arg('--json', null), TOP = +arg('--top', 10);
const SEEDS = [1020, 7, 42];
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const MO = new Map();
const monthOf = (d) => { let m = MO.get(d); if (m == null) { m = CAL.dateOf(d).month; MO.set(d, m); } return m; };
const KS = ['twig', 'bark', 'wood'], KN = { twig: '잔가지', bark: '껍질', wood: '목재' };
const PARTS = ['Out', 'In', 'Burn', 'At', 'After'], PN = { Out: '틱 밖 들어옴(− = 나감)', In: '틱 안 들어옴', Burn: '땐 몫', At: '연료 블록 때 재고', After: '연료 밖 씀' };
const SETS = ['a', 'a0', 'a1', 'b', 'c'], SN = { a: 'ⓐ 대상 · 땔감(죽음 가중)', a0: 'ⓐ-0 그중 징발 없는 날', a1: 'ⓐ-1 그중 징발 날(서버만)', b: 'ⓑ 땔감이 K 를 묶은 날', c: 'ⓒ 12 · 1 · 2월 날' };
const med = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const blank = () => ({ w: 0, N: 0, grain: 0, cov: 0, covs: [], k: Object.fromEntries(KS.map((k) => [k, Object.fromEntries(PARTS.map((p) => [p, 0]))])), zero: Object.fromEntries(KS.map((k) => [k, 0])), vil: {} });
function add(A, x, w, F, name) {
  const N = x[F.N]; A.w += w; A.N += N * w; A.grain += (x[F.grain] || 0) * w; const cv = x[F.cov]; if (cv != null) { A.cov += cv * w; for (let i = 0; i < Math.min(w, 50); i++) A.covs.push(cv); }
  for (const k of KS) { for (const p of PARTS) A.k[k][p] += (x[F[k + p]] || 0) * w; if (!((x[F[k + 'At']] || 0) > 1e-9)) A.zero[k] += w; }
  const V = A.vil[name] || (A.vil[name] = { w: 0, cov: 0 }); V.w += w; V.cov += (cv || 0) * w;
}
function perRun(o, f, sd) {
  if (!o || !f) return null;
  const C = {}; o.cols.forEach((k, i) => { C[k] = i; }); const F = {}; f.cols.forEach((k, i) => { F[k] = i; });
  const S = { a: blank(), a0: blank(), a1: blank(), b: blank(), c: blank() };
  for (const [name, rows] of Object.entries(o.v)) {
    const fr = f.v[name] ? new Map(f.v[name].map((x) => [x[F.day], x])) : null; if (!fr) continue;
    for (const r of rows) {
      const d = r[C.day]; if (d < 366) continue; const x = fr.get(d); if (!x || !(x[F.N] > 0)) continue;
      const sl = r[C.slot], pr = r[C.prod], fu = r[C.fuel];
      let bk = null; if (sl != null && pr != null && fu != null) { const m = Math.min(sl, pr, fu); bk = m === sl ? 'slot' : m === pr ? 'prod' : 'fuel'; }
      const dd = r[C.deaths] || 0, n0 = r[C.pop0];
      const nm = `${sd} ${name}`;
      if (dd > 0 && bk === 'fuel' && r[C.tfe] >= n0 * 10 && r[C.hunger] === 0) { add(S.a, x, dd, F, nm); add(r[C.drafted] > 0 ? S.a1 : S.a0, x, dd, F, nm); }
      if (bk === 'fuel') add(S.b, x, 1, F, nm);
      const mo = monthOf(d); if (mo === 12 || mo === 1 || mo === 2) add(S.c, x, 1, F, nm);
    }
  }
  return S;
}
function load(root, kind) {
  const R = {}; if (!root || !fs.existsSync(root)) return R;
  if (kind === 'srv') {
    for (const dn of fs.readdirSync(root).filter((x) => x.startsWith('run-')).sort()) for (const sd of SEEDS) {
      const s = perRun(J(path.join(root, dn, `base-${sd}.t931.json`)), J(path.join(root, dn, `base-${sd}.t994.json`)), sd); if (s) (R[dn.slice(4)] || (R[dn.slice(4)] = [])).push(s); }
  } else {
    const re = /^t17-(.+)-(\d+)\.t994\.json$/;
    for (const fn of fs.readdirSync(root).filter((x) => re.test(x)).sort()) { const [, tag, sd] = fn.match(re);
      const s = perRun(J(path.join(root, fn.replace('.t994.', '.t931.'))), J(path.join(root, fn)), sd); if (s) (R[tag] || (R[tag] = [])).push(s); }
  }
  return R;
}
const merge = (list, set) => { const A = blank(); for (const s of list) { const B = s[set]; A.w += B.w; A.N += B.N; A.grain += B.grain; A.cov += B.cov; A.covs.push(...B.covs);
  for (const k of KS) { for (const p of PARTS) A.k[k][p] += B.k[k][p]; A.zero[k] += B.zero[k]; } for (const [n, V] of Object.entries(B.vil)) { const a = A.vil[n] || (A.vil[n] = { w: 0, cov: 0 }); a.w += V.w; a.cov += V.cov; } } return A; };
const S = load(SRV, 'srv'), L = load(LAB, 'lab');
const allS = Object.values(S).flat(), allL = Object.values(L).flat();
const f3 = (x) => x == null || !Number.isFinite(x) ? '—' : x.toFixed(3);
const nf = (x) => Number(x).toLocaleString('en-US');
const P = (s) => console.log(s);
const out = { sets: {} };
P(`판: 서버 ${Object.keys(S).join(' · ')} · 랩 ${Object.keys(L).join(' · ')} (판 넷 합 · 3시드)`);
P('');
for (const set of SETS) {
  const a = merge(allS, set), b = merge(allL, set);
  P(`## ${SN[set]} — 1인 몫(Σ칸 ÷ ΣN)`);
  P('');
  P('| 칸 | 서버 | 랩 | 서버 ÷ 랩 |');
  P('|---|---:|---:|---:|');
  const row = (nm, x, y) => P(`| ${nm} | ${f3(x)} | ${f3(y)} | ${x != null && y ? f3(x / y) : '—'} |`);
  P(`| 마을-날(가중) | ${nf(a.w)} | ${nf(b.w)} | — |`);
  row('충당 `_fuelCov`(가중 평균)', a.w ? a.cov / a.w : null, b.w ? b.cov / b.w : null);
  row('충당 중앙', med(a.covs), med(b.covs));
  row('볏짚 밑변(그날 곡물 실생산 · 식량등가)', a.N ? a.grain / a.N : null, b.N ? b.grain / b.N : null);
  const o = { srv: { w: a.w, cov: a.w ? a.cov / a.w : null, covMed: med(a.covs), grain: a.N ? a.grain / a.N : null, k: {}, zero: {} }, lab: { w: b.w, cov: b.w ? b.cov / b.w : null, covMed: med(b.covs), grain: b.N ? b.grain / b.N : null, k: {}, zero: {} } };
  for (const k of KS) {
    for (const p of PARTS) { row(`${KN[k]} · ${PN[p]}`, a.N ? a.k[k][p] / a.N : null, b.N ? b.k[k][p] / b.N : null); o.srv.k[k + p] = a.N ? a.k[k][p] / a.N : null; o.lab.k[k + p] = b.N ? b.k[k][p] / b.N : null; }
    P(`| ${KN[k]} · 연료 블록 때 재고 0 인 마을-날 몫 | ${a.w ? (100 * a.zero[k] / a.w).toFixed(1) + '%' : '—'} | ${b.w ? (100 * b.zero[k] / b.w).toFixed(1) + '%' : '—'} | — |`);
    o.srv.zero[k] = a.w ? a.zero[k] / a.w : null; o.lab.zero[k] = b.w ? b.zero[k] / b.w : null;
  }
  P('');
  out.sets[set] = o;
}
// 판마다 ⓐ 충당 · ⓒ 충당(띠)
P('## 판마다 충당(가중 평균) — ⓐ · ⓐ-0 · ⓐ-1 · ⓑ · ⓒ');
P('');
P('| 판 | ⓐ | ⓐ-0 | ⓐ-1 | ⓑ | ⓒ | ⓐ 중앙 |');
P('|---|---:|---:|---:|---:|---:|---:|');
out.runs = {};
for (const [lbl, R] of [['서버', S], ['랩', L]]) for (const [tag, list] of Object.entries(R)) {
  const v = SETS.map((set) => { const m = merge(list, set); return m.w ? m.cov / m.w : null; });
  const am = med(merge(list, 'a').covs);
  P(`| ${lbl} ${tag} | ${v.map(f3).join(' | ')} | ${f3(am)} |`); out.runs[`${lbl} ${tag}`] = { mean: v, aMed: am };
}
P('');
// ⓒ 마을별 충당 — 서버 낮은 차례(판 넷 합)
P(`## ⓒ 겨울 날 마을별 충당(판 넷 합) — 서버 − 랩 아래 · 위 ${TOP} · 차 나눔`);
P('');
const cs = merge(allS, 'c').vil, cl = merge(allL, 'c').vil;
const diff = Object.keys(cs).filter((n) => cl[n]).map((n) => [n, cs[n].cov / cs[n].w, cl[n].cov / cl[n].w]).sort((x, y) => (x[1] - x[2]) - (y[1] - y[2]));
{ const ds = diff.map((x) => x[1] - x[2]); const lo = ds.filter((d) => d < -0.1).length, hi = ds.filter((d) => d > 0.1).length;
  P(`마을 ${diff.length} · 서버가 0.1 넘게 낮다 ${lo} · 0.1 넘게 높다 ${hi} · 그 사이 ${diff.length - lo - hi} · 차 중앙 ${f3(med(ds))}`); P(''); }
P('| 시드 · 마을 | 서버 충당 | 랩 충당 | 차 |');
P('|---|---:|---:|---:|');
for (const [n, x, y] of [...diff.slice(0, TOP), ...diff.slice(-TOP)]) P(`| ${n} | ${f3(x)} | ${f3(y)} | ${f3(x - y)} |`);
out.vilWinter = diff;
P('');
P(`## ⓐ 대상 · 땔감 마을(판 넷 합 · 죽음 위 ${TOP} · 서버 · 랩 각각) — 그 마을 ⓐ 충당 · ⓒ 겨울 충당`);
P('');
P('| 쪽 | 시드 · 마을 | ⓐ 죽음 | ⓐ 충당 | 같은 마을 다른 쪽 ⓐ 죽음 · 충당 | ⓒ 충당(서버 / 랩) |');
P('|---|---|---:|---:|---|---|');
{ const as = merge(allS, 'a').vil, al = merge(allL, 'a').vil;
  for (const [lbl, A, B] of [['서버', as, al], ['랩', al, as]]) for (const [n, V] of Object.entries(A).sort((x, y) => y[1].w - x[1].w).slice(0, TOP)) {
    const o = B[n]; P(`| ${lbl} | ${n} | ${nf(V.w)} | ${f3(V.cov / V.w)} | ${o ? nf(o.w) + ' · ' + f3(o.cov / o.w) : '0'} | ${cs[n] ? f3(cs[n].cov / cs[n].w) : '—'} / ${cl[n] ? f3(cl[n].cov / cl[n].w) : '—'} |`); } }
if (OUTJ) fs.writeFileSync(OUTJ, JSON.stringify(out, null, 1));
