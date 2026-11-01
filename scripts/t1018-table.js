#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1018 표 기계 · 읽기만 · 판정 0)
// === scripts/t1018-table.js — 땔감 죽음 날 앞 30날 직업 배분이 읽는 칸 — 서버 띠 · 갈래 판 ↔ 랩 띠 ===
//   node scripts/t1018-table.js --srv <띠 뿌리> --lab <랩 뿌리> [--json <파일>]
//     서버 판 = <띠 뿌리>/run-<갈래>/base-<시드>.{t931,t1018}.json(갈래 = s · s~raidN 띠 · 그 밖은 갈래 판) · 랩 판 = <랩 뿌리>/t17-<갈래>-<시드>.{t931,t1018}.json
//   대상 ⓐ = T994 ⓐ 와 같은 잣대 — 366일~ 그날 죽음 > 0 · 곳간 식량 환산 ≥ 틱 머리 인구 × 10 · 그날 굶주림 항 0 · K 를 묶은 칸 = 땔감(죽음 가중).
//   창 = 그 마을 그날 앞 30날(d − 30 ~ d − 1). 바탕 = 366일~ 마을-날 전부.
//   칸(ΣN 가중 · 1인 · 1,000 사람-날 당):
//     나무꾼 ÷ N · 식량직 ÷ N · 징발 ÷ N · 징발 중 나무꾼 ÷ 나무꾼
//     기근 문 몫(곳간 식량 환산 < N × 30 — `pickDeficitJob_rational` 이 식량직만 고르는 블록 · 나무꾼 0)
//     주거 목재 안전망 조건 참 몫(N ≥ 읽는 주거 × 0.95 · 곳간 목재 < N × 2 · 읽는 주거 = 집 행위 마을이고 계획 주거가 있으면 계획 주거 — T966)
//     나무꾼으로 · 에서 바뀜 · 새로 난 나무꾼(1,000 사람-날 당) · 목재 그림자 가격 중앙 · 실현 목재 EMA ÷ 나무꾼(나무꾼 > 0 날)
//     전환 날(econ `_dbgSwitch` — 관찰기 `need` · `did` 칸이 있는 판만): 고른 직업 = 나무꾼 · 식량직 몫 · 고른 나무꾼 중 마찰 보류(`hold`) 몫
'use strict';
const fs = require('fs');
const path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SRV = arg('--srv', null), LAB = arg('--lab', null), OUTJ = arg('--json', null);
const SEEDS = [1020, 7, 42];
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const med = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const FOODJ = new Set(['farmer', 'fisher', 'hunter', 'forager']);
const blank = () => ({ w: 0, N: 0, lj: 0, fJ: 0, dr: 0, drLj: 0, fam: 0, net: 0, ljIn: 0, ljOut: 0, ljBorn: 0, pW: [], eWl: [], days: 0, sw: 0, nLj: 0, nFood: 0, nLjHold: 0, pF: [] });
function addRow(A, x, F, wt) {
  const N = x[F.N]; if (!(N > 0)) return;
  A.days += wt; A.N += N * wt; A.lj += x[F.lj] * wt; A.fJ += x[F.fJ] * wt; A.dr += x[F.dr] * wt; A.drLj += x[F.drLj] * wt;
  if (x[F.fe] != null && x[F.fe] < 30) A.fam += wt;
  const hp = (x[F.live] && x[F.plan] != null) ? x[F.plan] : x[F.housing];
  if (hp != null && N >= hp * 0.95 && x[F.wood] < N * 2) A.net += wt;
  A.ljIn += x[F.ljIn] * wt; A.ljOut += x[F.ljOut] * wt; A.ljBorn += x[F.ljBorn] * wt;
  if (x[F.pW] != null && A.pW.length < 200000) A.pW.push(x[F.pW]);
  if (x[F.pF] != null && A.pF.length < 200000) A.pF.push(x[F.pF]);
  if (x[F.lj] > 0 && x[F.eW] != null && A.eWl.length < 200000) A.eWl.push(x[F.eW] / x[F.lj]);
  if (F.need != null && x[F.need] != null) { A.sw += wt; const nd = x[F.need];
    if (nd === 'lumberjack') { A.nLj += wt; if (typeof x[F.did] === 'string' && x[F.did].startsWith('hold')) A.nLjHold += wt; }
    else if (FOODJ.has(nd)) A.nFood += wt; }
}
function perRun(o, f) {
  if (!o || !f) return null;
  const C = {}; o.cols.forEach((k, i) => { C[k] = i; }); const F = {}; f.cols.forEach((k, i) => { F[k] = i; });
  const S = { win: blank(), base: blank(), deaths: 0, births: 0, bornLj: 0, bornFam: 0 };
  for (const [name, rows] of Object.entries(o.v)) {
    const fr = f.v[name]; if (!fr) continue; const byDay = new Map(fr.map((x) => [x[F.day], x]));
    for (const x of fr) if (x[F.day] >= 366) addRow(S.base, x, F, 1);
    for (const r of rows) {
      const d = r[C.day], dd = r[C.deaths] || 0, n0 = r[C.pop0];
      //   출생(틱 안 — 틱 뒤 − 틱 머리 + 그날 죽음 · t931-table `bAll` 과 같은 잣대) · 그중 나무꾼(t1018 `ljBorn`) · 그날 기근 문
      if (d >= 366) { const b = r[C.pop] - n0 + dd; const x = byDay.get(d); if (b > 0 && x) { S.births += b; S.bornLj += x[F.ljBorn]; if (x[F.fe] != null && x[F.fe] < 30) S.bornFam += b; } }
      if (d < 366 || !(dd > 0) || !(r[C.tfe] >= n0 * 10 && r[C.hunger] === 0)) continue;
      const sl = r[C.slot], pr = r[C.prod], fu = r[C.fuel]; if (sl == null || pr == null || fu == null) continue;
      const m = Math.min(sl, pr, fu); if (!(m === fu && m !== sl && m !== pr)) continue;
      S.deaths += dd;
      for (let k = d - 30; k < d; k++) { const x = byDay.get(k); if (x) addRow(S.win, x, F, dd / 30); }
    }
  }
  return S;
}
function load(root, kind) {
  const R = {}; if (!root || !fs.existsSync(root)) return R;
  if (kind === 'srv') {
    for (const dn of fs.readdirSync(root).filter((x) => x.startsWith('run-')).sort()) {
      //   판 이름 = t577 판 이름(`base` · 층 끄기 판은 `war_minday99999` 따위) — 시드마다 `<판>-<시드>.t1018.json`
      const re = /^(.+)-(\d+)\.t1018\.json$/;
      for (const fn of fs.readdirSync(path.join(root, dn)).filter((x) => re.test(x)).sort()) {
        const s = perRun(J(path.join(root, dn, fn.replace('.t1018.', '.t931.'))), J(path.join(root, dn, fn))); if (s) (R[dn.slice(4)] || (R[dn.slice(4)] = [])).push(s); } }
  } else {
    const re = /^t17-(.+)-(\d+)\.t1018\.json$/;
    for (const fn of fs.readdirSync(root).filter((x) => re.test(x)).sort()) { const [, tag] = fn.match(re);
      const s = perRun(J(path.join(root, fn.replace('.t1018.', '.t931.'))), J(path.join(root, fn))); if (s) (R[tag] || (R[tag] = [])).push(s); }
  }
  return R;
}
const merge = (list, k) => { const A = blank(); let D = 0; for (const s of list) { const B = s[k]; D += s.deaths;
  for (const f of ['w', 'N', 'lj', 'fJ', 'dr', 'drLj', 'fam', 'net', 'ljIn', 'ljOut', 'ljBorn', 'days', 'sw', 'nLj', 'nFood', 'nLjHold']) A[f] += B[f]; A.pW.push(...B.pW.slice(0, 50000)); A.pF.push(...B.pF.slice(0, 50000)); A.eWl.push(...B.eWl.slice(0, 50000)); } A.deaths = D; return A; };
const COLS = [
  ['ⓐ 죽음', (A) => A.deaths, 0],
  ['나무꾼 ÷ N', (A) => A.N ? A.lj / A.N : null, 3],
  ['식량직 ÷ N', (A) => A.N ? A.fJ / A.N : null, 3],
  ['징발 중 ÷ N', (A) => A.N ? A.dr / A.N : null, 3],
  ['징발 중 나무꾼 ÷ 나무꾼', (A) => A.lj ? A.drLj / A.lj : null, 3],
  ['기근 문 몫(곳간 < N × 30)', (A) => A.days ? A.fam / A.days : null, 3],
  ['주거 목재 안전망 조건 참 몫', (A) => A.days ? A.net / A.days : null, 3],
  ['나무꾼으로 바뀜(1,000 사람-날)', (A) => A.N ? 1000 * A.ljIn / A.N : null, 3],
  ['나무꾼에서 바뀜(1,000 사람-날)', (A) => A.N ? 1000 * A.ljOut / A.N : null, 3],
  ['새로 난 나무꾼(1,000 사람-날)', (A) => A.N ? 1000 * A.ljBorn / A.N : null, 3],
  ['목재 그림자 가격 중앙', (A) => med(A.pW), 3],
  ['식량 그림자 가격 중앙', (A) => med(A.pF), 3],
  ['실현 목재 EMA ÷ 나무꾼 중앙', (A) => med(A.eWl), 3],
  ['전환 날 고른 직업 = 나무꾼 몫', (A) => A.sw ? A.nLj / A.sw : null, 3],
  ['전환 날 고른 직업 = 식량직 몫', (A) => A.sw ? A.nFood / A.sw : null, 3],
  ['고른 나무꾼 중 마찰 보류 몫', (A) => A.nLj ? A.nLjHold / A.nLj : null, 3],
];
const S = load(SRV, 'srv'), L = load(LAB, 'lab');
const P = (s) => console.log(s);
const fx = (x, d) => x == null || !Number.isFinite(x) ? '—' : d === 0 ? Number(x).toLocaleString('en-US', { maximumFractionDigits: 0 }) : x.toFixed(d);
const out = { win: {}, base: {} };
for (const k of ['win', 'base']) {
  P(k === 'win' ? '## ⓐ 땔감 죽음 날 앞 30날(죽음 가중)' : '## 바탕 — 366일~ 마을-날 전부');
  P('');
  const runs = [...Object.entries(S).map(([t, l]) => [`서버 ${t}`, l]), ...Object.entries(L).map(([t, l]) => [`랩 ${t}`, l])];
  P(`| 판 | ${COLS.map((c) => c[0]).join(' | ')} |`);
  P(`|---|${COLS.map(() => '---:').join('|')}|`);
  for (const [lbl, list] of runs) { const A = merge(list, k); const v = COLS.map(([, f]) => f(A)); out[k][lbl] = v; P(`| ${lbl} | ${v.map((x, i) => fx(x, COLS[i][2])).join(' | ')} |`); }
  // 띠
  const band = (pref) => COLS.map((c, i) => { const xs = Object.entries(out[k]).filter(([n]) => n.startsWith(pref)).map(([, v]) => v[i]).filter((x) => x != null && Number.isFinite(x)); return xs.length ? [Math.min(...xs), Math.max(...xs)] : null; });
  const KN = process.env.T1018_KNOB_ARM || 'n';   // ★[T1046] 손잡이 갈래 띠 이름(기본 n — T1018 · T1046 은 k)
  const sb = band('서버 s'), nb = band('서버 ' + KN), lb = band('랩 ');
  const bandRow = (B) => B.map((b, i) => b ? `${fx(b[0], COLS[i][2])} ~ ${fx(b[1], COLS[i][2])}` : '—').join(' | ');
  const ovRow = (A, B) => A.map((b, i) => b && B[i] ? (b[0] <= B[i][1] && B[i][0] <= b[1] ? '겹침' : '**안 겹침**') : '—').join(' | ');
  P(`| **서버 띠(s · s~raid)** | ${bandRow(sb)} |`);
  if (nb.some((b) => b)) P(`| **서버 띠(${KN} · ${KN}~raid — 손잡이 켬)** | ${bandRow(nb)} |`);
  P(`| **랩 띠** | ${bandRow(lb)} |`);
  P(`| 겹침 s ↔ 랩 | ${ovRow(sb, lb)} |`);
  if (nb.some((b) => b)) { P(`| 겹침 ${KN} ↔ 랩 | ${ovRow(nb, lb)} |`); P(`| 겹침 ${KN} ↔ s | ${ovRow(nb, sb)} |`); }
  out[k].band = { srv: sb, knob: nb, lab: lb };
  P('');
}
P('## 출생 — 366일~(출생 = 틱 뒤 − 틱 머리 + 그날 죽음)');
P('');
P('| 판 | 출생 | 출생 중 나무꾼 | 출생 날 기근 문 몫 |');
P('|---|---:|---:|---:|');
out.births = {};
for (const [lbl, list] of [...Object.entries(S).map(([t, l]) => [`서버 ${t}`, l]), ...Object.entries(L).map(([t, l]) => [`랩 ${t}`, l])]) {
  let b = 0, bl = 0, bf = 0; for (const x of list) { b += x.births; bl += x.bornLj; bf += x.bornFam; }
  out.births[lbl] = { births: b, ljShare: b ? bl / b : null, famShare: b ? bf / b : null };
  P(`| ${lbl} | ${fx(b, 0)} | ${fx(b ? bl / b : null, 3)} | ${fx(b ? bf / b : null, 3)} |`);
}
P('');
P('서버 띠 = 갈래 판 s + s~raid1 · 2 · 3(T837). 그 밖 서버 판(h · w · hw …)은 갈래 판(층 끄기 · T875 꼴) — 서버 띠와 견준다.');
if (OUTJ) fs.writeFileSync(OUTJ, JSON.stringify({ cols: COLS.map((c) => c[0]), ...out }, null, 1));
