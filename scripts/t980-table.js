#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T980 표 기계 · 읽기만 · 판정 0)
// === scripts/t980-table.js — "곳간 찬 날 · 그날 굶주림 0 인 죽음"(T931 회부 2 의 대상)을 K 를 묶은 칸 · 곳간 일수 · 달 · 마을로 — 서버 띠 ↔ 랩 띠 ===
//   node scripts/t980-table.js --srv <띠 뿌리> --lab <랩 뿌리> [--json <파일>] [--top 12]
//     서버 판 = <띠 뿌리>/run-<갈래>[~raidN]/base-<시드>.{t931,t980}.json(T837 띠 꼴 · 갈래 판 + 대조 셋)
//     랩 판   = <랩 뿌리>/t17-<갈래>[~huntN]-<시드>.{t931,t980}.json(T944 띠 꼴)
//   대상(t931-table `fh0` 와 같은 잣대 · 같은 칸): 366일~ 그날 죽음(`_deadTot` 틱 앞뒤 차) 중 곳간 식량 환산 ≥ 틱 머리 인구 × 10 이고 그날 굶주림 항 0.
//   K 를 묶은 칸 = K 에 든 식량 자리 · 식량 흐름 · 땔감 중 가장 작은 칸(t931-table 과 같은 차례 — 같으면 자리 > 흐름 > 땔감).
//   땔감 칸 입력(t980-observe — 그 틱 뒤 마을 칸): 곳간 목재 · 목재 수입 EMA · `land.wood` · `land.woodSustain` · 한랭 · 벌목꾼 수 · 연료 충당.
//   띠 = 판 넷의 최소 ~ 최대(T837 · T944 와 같은 잣대 — 겹침 · 갈래 판끼리 차 · 차 > 큰 띠 폭).
'use strict';
const fs = require('fs');
const path = require('path');
const CAL = require(path.join(__dirname, '..', 'server', 'calendar.js'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SRV = arg('--srv', null), LAB = arg('--lab', null), OUTJ = arg('--json', null), TOP = +arg('--top', 12);
const SEEDS = [1020, 7, 42];
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const MO = new Map();
const monthOf = (d) => { let m = MO.get(d); if (m == null) { m = CAL.dateOf(d).month; MO.set(d, m); } return m; };
const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
const BINDS = ['slot', 'prod', 'fuel'], BN = { slot: '식량 자리', prod: '식량 흐름', fuel: '땔감' };
const BINS = ['10~30', '30~100', '100~'];
const med = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

// 판 하나(시드 하나) → 대상 셈 · 마을별 · 땔감 입력
function perRun(o, f) {
  if (!o || !o.v || !o.cols) return null;
  const C = {}; o.cols.forEach((k, i) => { C[k] = i; });
  const F = {}; if (f && f.cols) f.cols.forEach((k, i) => { F[k] = i; });
  const s = { d366: 0, fh0: 0, b: { slot: 0, prod: 0, fuel: 0 }, bin: { '10~30': 0, '30~100': 0, '100~': 0 }, mo: {}, bmo: { slot: {}, prod: {}, fuel: {} }, vil: {}, fin: [], drafted: 0, draftUnder: 0, gated: 0, nk: [], lg: [] };
  for (const [name, rows] of Object.entries(o.v)) {
    const fr = f && f.v && f.v[name] ? new Map(f.v[name].map((x) => [x[F.day], x])) : null;
    for (const r of rows) {
      const d = r[C.day], n0 = r[C.pop0], dd = r[C.deaths] || 0;
      if (!(dd > 0) || d < 366) continue;
      s.d366 += dd;
      if (!(r[C.tfe] >= n0 * 10 && r[C.hunger] === 0)) continue;
      s.fh0 += dd;
      const mo = monthOf(d); s.mo[mo] = (s.mo[mo] || 0) + dd;
      const sl = r[C.slot], pr = r[C.prod], fu = r[C.fuel];
      let bk = null; if (sl != null && pr != null && fu != null) { const m = Math.min(sl, pr, fu); bk = m === sl ? 'slot' : m === pr ? 'prod' : 'fuel'; }
      if (bk) { s.b[bk] += dd; s.bmo[bk][mo] = (s.bmo[bk][mo] || 0) + dd; }
      const dy = r[C.tfe] / Math.max(1, n0); s.bin[dy < 30 ? '10~30' : dy < 100 ? '30~100' : '100~'] += dd;
      if (r[C.drafted] > 0) { s.drafted += dd; if (n0 - r[C.drafted] <= r[C.K]) s.draftUnder += dd; }
      for (let i = 0; i < dd; i++) { s.nk.push(n0 / Math.max(1, r[C.K])); s.lg.push(r[C.logi]); }
      if (r[C.gated]) s.gated += dd;
      const V = s.vil[name] || (s.vil[name] = { n: 0, b: { slot: 0, prod: 0, fuel: 0 }, ratio: [], logi: [] });
      V.n += dd; if (bk) V.b[bk] += dd; V.ratio.push(n0 / Math.max(1, r[C.K])); V.logi.push(r[C.logi]);
      if (bk === 'fuel' && fr && fr.has(d)) {
        const x = fr.get(d);
        s.fin.push({ name, d, dd, N: n0, K: r[C.K], fuelK: x[F.fuelK], w90: (x[F.wood] || 0) / 90, wImp: x[F.wImp] || 0, lWood: x[F.lWood], wSus: x[F.wSus], cold: x[F.cold], lj: x[F.lj], cov: x[F.fuelCov], prod: pr, slot: sl });
      }
    }
  }
  return s;
}
// 마을 칸 첫날(땅 입력) — 서버 ↔ 랩 같은 마을 같은 칸인지
function firstDay(f) {
  if (!f || !f.v) return null; const F = {}; f.cols.forEach((k, i) => { F[k] = i; });
  const m = {}; for (const [name, rows] of Object.entries(f.v)) { const x = rows[0]; if (x) m[name] = { lWood: x[F.lWood], wSus: x[F.wSus], size: x[F.size] }; }
  return m;
}
function load(root, kind) {
  if (!root || !fs.existsSync(root)) return {};
  const R = {};
  if (kind === 'srv') {
    for (const dn of fs.readdirSync(root).filter((x) => x.startsWith('run-')).sort()) {
      const runs = {}; for (const sd of SEEDS) { const o = J(path.join(root, dn, `base-${sd}.t931.json`)); const f = J(path.join(root, dn, `base-${sd}.t980.json`)); if (o) runs[sd] = { s: perRun(o, f), first: firstDay(f) }; }
      if (Object.keys(runs).length) R[dn.slice(4)] = runs;
    }
  } else {
    const re = /^t17-(.+)-(\d+)\.t931\.json$/;
    for (const fn of fs.readdirSync(root).filter((x) => re.test(x)).sort()) {
      const [, tag, sd] = fn.match(re); const o = J(path.join(root, fn)); const f = J(path.join(root, fn.replace('.t931.', '.t980.')));
      (R[tag] || (R[tag] = {}))[sd] = { s: perRun(o, f), first: firstDay(f) };
    }
  }
  return R;
}
const sumRun = (runs) => {
  const t = { d366: 0, fh0: 0, b: { slot: 0, prod: 0, fuel: 0 }, bin: { '10~30': 0, '30~100': 0, '100~': 0 }, mo: {}, bmo: { slot: {}, prod: {}, fuel: {} }, drafted: 0, draftUnder: 0, gated: 0, seeds: 0, nk: [], lg: [] };
  for (const sd of Object.keys(runs)) { const s = runs[sd].s; if (!s) continue; t.seeds++;
    t.d366 += s.d366; t.fh0 += s.fh0; t.drafted += s.drafted; t.draftUnder += s.draftUnder; t.gated += s.gated; t.nk.push(...s.nk); t.lg.push(...s.lg);
    for (const k of BINDS) { t.b[k] += s.b[k]; for (const m in s.bmo[k]) t.bmo[k][m] = (t.bmo[k][m] || 0) + s.bmo[k][m]; }
    for (const k of BINS) t.bin[k] += s.bin[k]; for (const m in s.mo) t.mo[m] = (t.mo[m] || 0) + s.mo[m]; }
  return t;
};
const nf = (x) => x == null ? '—' : Number(x).toLocaleString('en-US');
const pc = (a, b) => b > 0 ? (100 * a / b).toFixed(1) : '—';
const P = (s) => console.log(s);
const S = load(SRV, 'srv'), L = load(LAB, 'lab');
const SS = {}, LS = {}; for (const k in S) SS[k] = sumRun(S[k]); for (const k in L) LS[k] = sumRun(L[k]);
const band = (M, f) => { const v = Object.values(M).map(f).filter((x) => x != null && Number.isFinite(x)); return v.length ? [Math.min(...v), Math.max(...v)] : null; };
const fx = (x, p) => x == null ? '—' : p === 'r' ? (+x).toFixed(3) : p ? (+x).toFixed(1) + '%' : nf(x);
const bs = (b, pct) => b ? (pct === 'r' ? `${b[0].toFixed(3)} ~ ${b[1].toFixed(3)}` : pct ? `${b[0].toFixed(1)} ~ ${b[1].toFixed(1)}%` : `${nf(b[0])} ~ ${nf(b[1])}`) : '—';
const ov = (a, b) => a && b ? (a[0] <= b[1] && b[0] <= a[1] ? '겹침' : '**안 겹침**') : '—';

const rowsDef = [
  ['366일~ 죽음', (t) => t.d366, false],
  ['대상(곳간 찬 날 · 그날 굶주림 0)', (t) => t.fh0, false],
  ['대상 몫(366일~ 죽음 중)', (t) => t.d366 ? 100 * t.fh0 / t.d366 : null, true],
  ...BINDS.map((k) => [`K = ${BN[k]}(대상 중 몫)`, (t) => t.fh0 ? 100 * t.b[k] / t.fh0 : null, true]),
  ...BINS.map((k) => [`곳간 ${k}일치(대상 중 몫)`, (t) => t.fh0 ? 100 * t.bin[k] / t.fh0 : null, true]),
  ['12 · 1 · 2월(대상 중 몫)', (t) => t.fh0 ? 100 * ((t.mo[12] || 0) + (t.mo[1] || 0) + (t.mo[2] || 0)) / t.fh0 : null, true],
  ['징발 마을-날(대상 중 몫)', (t) => t.fh0 ? 100 * t.drafted / t.fh0 : null, true],
  ['징발 날 · 징발을 빼면 N ≤ K(대상 중 몫)', (t) => t.fh0 ? 100 * t.draftUnder / t.fh0 : null, true],
  ['대상 그날 N ÷ K(죽음 가중 중앙)', (t) => med(t.nk), 'r'],
  ['대상 그날 로지스틱 항(죽음 가중 중앙)', (t) => med(t.lg), 'r'],
];
P('## ① 대상 — 서버 띠(T837 · 판 넷) ↔ 랩 띠(T944 · 판 넷) · 3시드 합');
P('');
P(`| 셈 | 서버 갈래 판 | 서버 띠 | 랩 갈래 판 | 랩 띠 | 띠 겹침 |`);
P('|---|---:|---|---:|---|---|');
const sMain = Object.keys(SS).find((k) => !k.includes('~')), lMain = Object.keys(LS).find((k) => !k.includes('~'));
const out = { srv: { runs: SS }, lab: { runs: LS }, rows: [] };
for (const [nm, f, p] of rowsDef) {
  const a = band(SS, f), b = band(LS, f); const sv = sMain ? f(SS[sMain]) : null, lv = lMain ? f(LS[lMain]) : null;
  P(`| ${nm} | ${fx(sv, p)} | ${bs(a, p)} | ${fx(lv, p)} | ${bs(b, p)} | ${ov(a, b)} |`);
  out.rows.push({ nm, srv: sv, srvBand: a, lab: lv, labBand: b });
}
P('');
P('## ② 대상 달별 × K 를 묶은 칸 — 갈래 판(3시드 합)');
P('');
for (const [lbl, T] of [['서버', sMain && SS[sMain]], ['랩', lMain && LS[lMain]]]) {
  if (!T) continue;
  P(`| ${lbl} | ${MONTHS.map((m) => m + '월').join(' | ')} | 합 |`);
  P(`|---|${MONTHS.map(() => '---:').join('|')}|---:|`);
  for (const k of BINDS) P(`| K = ${BN[k]} | ${MONTHS.map((m) => nf(T.bmo[k][m] || 0)).join(' | ')} | ${nf(T.b[k])} |`);
  P(`| 대상 합 | ${MONTHS.map((m) => nf(T.mo[m] || 0)).join(' | ')} | ${nf(T.fh0)} |`);
  P('');
}
// 마을별 — 갈래 판 넷을 합친 대상 상위 마을(서버 · 랩)
const vilAgg = (R) => { const A = {}; for (const run of Object.values(R)) for (const [sd, x] of Object.entries(run)) { if (!x.s) continue; for (const [nm, V] of Object.entries(x.s.vil)) { const k = `${sd} ${nm}`; const a = A[k] || (A[k] = { n: 0, runs: 0, b: { slot: 0, prod: 0, fuel: 0 }, ratio: [] }); a.n += V.n; a.runs++; for (const b of BINDS) a.b[b] += V.b[b]; a.ratio.push(...V.ratio); } } return A; };
const SV = vilAgg(S), LV = vilAgg(L);
P(`## ③ 대상 상위 마을(판 넷 합 · 서버 ${TOP} · 그 마을의 랩 값 곁)`);
P('');
P('| 시드 · 마을 | 서버 대상(판 넷) | 서버 K 칸(자리 · 흐름 · 땔감) | 서버 N/K 중앙 | 랩 대상(판 넷) | 랩 K 칸(자리 · 흐름 · 땔감) | 랩 N/K 중앙 |');
P('|---|---:|---|---:|---:|---|---:|');
const topS = Object.entries(SV).sort((a, b) => b[1].n - a[1].n).slice(0, TOP);
for (const [k, a] of topS) { const l = LV[k];
  P(`| ${k} | ${nf(a.n)} | ${BINDS.map((b) => nf(a.b[b])).join(' · ')} | ${(med(a.ratio) || 0).toFixed(2)} | ${l ? nf(l.n) : 0} | ${l ? BINDS.map((b) => nf(l.b[b])).join(' · ') : '—'} | ${l && l.ratio.length ? med(l.ratio).toFixed(2) : '—'} |`); }
P('');
P(`랩 상위 ${TOP}(판 넷 합):`);
P('');
P('| 시드 · 마을 | 랩 대상 | 랩 K 칸(자리 · 흐름 · 땔감) | 서버 대상 |');
P('|---|---:|---|---:|');
for (const [k, a] of Object.entries(LV).sort((a, b) => b[1].n - a[1].n).slice(0, TOP)) P(`| ${k} | ${nf(a.n)} | ${BINDS.map((b) => nf(a.b[b])).join(' · ')} | ${SV[k] ? nf(SV[k].n) : 0} |`);
P('');
// 땔감이 묶은 대상 죽음 — 땔감 K 입력(죽은 날 그 마을 칸 · 죽음 가중 중앙)
const finAgg = (R) => { const all = []; for (const run of Object.values(R)) for (const x of Object.values(run)) if (x.s) all.push(...x.s.fin); return all; };
const wmed = (arr, f) => { const a = []; for (const x of arr) { const v = f(x); if (v != null && Number.isFinite(v)) for (let i = 0; i < x.dd; i++) a.push(v); } return med(a); };
const SF = finAgg(S), LF = finAgg(L);
P('## ④ K = 땔감 대상 죽음 — 그날 땔감 K 입력(죽음 가중 중앙 · 판 넷 합)');
P('');
P('| 칸 | 서버 | 랩 |');
P('|---|---:|---:|');
const fRows = [['죽음', null], ['N ÷ 땔감 K', (x) => x.N / Math.max(1e-9, x.fuelK)], ['땔감 K ÷ 식량 흐름 K', (x) => x.fuelK / Math.max(1e-9, x.prod)], ['곳간 목재 ÷ 90 ÷ N(재고 완충 · 1인)', (x) => x.w90 / Math.max(1, x.N)], ['목재 수입 EMA ÷ N', (x) => x.wImp / Math.max(1, x.N)],
  ['`land.wood`', (x) => x.lWood], ['`land.woodSustain` 있음(몫)', null], ['`land.woodSustain`', (x) => x.wSus], ['벌목꾼 수 ÷ N', (x) => x.lj / Math.max(1, x.N)], ['한랭(`_coldStress`)', (x) => x.cold], ['연료 충당(`_fuelCov`)', (x) => x.cov]];
const fo = {};
for (const [nm, f] of fRows) {
  let a, b;
  if (nm === '죽음') { a = nf(SF.reduce((s, x) => s + x.dd, 0)); b = nf(LF.reduce((s, x) => s + x.dd, 0)); }
  else if (!f) { const sh = (F) => { const t = F.reduce((s, x) => s + x.dd, 0); return t ? pc(F.filter((x) => x.wSus != null).reduce((s, x) => s + x.dd, 0), t) + '%' : '—'; }; a = sh(SF); b = sh(LF); }
  else { const q = wmed(SF, f), r = wmed(LF, f); a = q == null ? '—' : (+q).toFixed(3); b = r == null ? '—' : (+r).toFixed(3); }
  P(`| ${nm} | ${a} | ${b} |`); fo[nm] = [a, b];
}
out.fuel = fo;
P('');
// 땅 입력 첫날 — 서버 ↔ 랩 같은 시드 같은 마을
P('## ⑤ 땔감 K 땅 입력 첫날 — 서버 갈래 판 ↔ 랩 갈래 판(같은 시드 · 같은 마을)');
P('');
P('| 시드 | 마을 | `land.wood` 같음 | `woodSustain` 같음(둘 다 없음 포함) | `size` 같음 | 다른 마을(서버 / 랩 woodSustain) |');
P('|---|---:|---:|---:|---:|---|');
const land = {};
for (const sd of SEEDS) {
  const a = sMain && S[sMain][sd] && S[sMain][sd].first, b = lMain && L[lMain][sd] && L[lMain][sd].first; if (!a || !b) continue;
  let n = 0, w = 0, u = 0, z = 0; const diff = [];
  for (const nm of Object.keys(a)) { if (!b[nm]) continue; n++; const x = a[nm], y = b[nm];
    if (x.lWood === y.lWood) w++; if (x.wSus === y.wSus) u++; else diff.push(`${nm} ${x.wSus} / ${y.wSus}`); if (x.size === y.size) z++; }
  P(`| ${sd} | ${n} | ${w} | ${u} | ${z} | ${diff.slice(0, 6).join(' · ')}${diff.length > 6 ? ` … (+${diff.length - 6})` : ''} |`);
  land[sd] = { n, wood: w, sus: u, size: z, diff };
}
out.land = land;
if (OUTJ) { for (const side of [SS, LS]) for (const t of Object.values(side)) { t.nkMed = med(t.nk); t.lgMed = med(t.lg); delete t.nk; delete t.lg; }   // 죽음 가중 배열은 중앙만 싣는다
  fs.writeFileSync(OUTJ, JSON.stringify(out, null, 1)); }
